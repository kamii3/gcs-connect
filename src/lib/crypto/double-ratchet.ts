/**
 * GCS CONNECT — Double Ratchet Engine
 * Specification: Double Ratchet Algorithm with KDF Chains
 * Native Web Crypto API (ECDH P-256 + HKDF-SHA256 + AES-256-GCM)
 * Zero Plaintext Storage, Forward Secrecy & Post-Compromise Security
 */

import {
  base64ToBuffer,
  bufferToBase64,
  computeECDHSharedSecret,
  decryptAESGCM,
  deriveHKDF,
  encryptAESGCM,
  exportKeyPair,
  generateECDHKeyPair,
  importPrivateKey,
  importPublicKey,
} from './web-crypto';
import {
  ExportedKeyPair,
  RatchetMessagePayload,
  StoredRatchetSession,
  X3DHInitiationPayload,
} from './types';

export const MAX_SKIP = 1000;
const ROOT_KDF_INFO = 'GCS-CONNECT-ROOT-KDF-V1';
const CHAIN_KDF_INFO = 'GCS-CONNECT-CHAIN-KDF-V1';
const ZERO_SALT = new Uint8Array(32);

/**
 * Root KDF step: derives new root key and chain key from DH output
 */
async function kdfRK(
  rootKey: Uint8Array,
  dhSharedSecret: Uint8Array
): Promise<{ nextRootKey: Uint8Array; chainKey: Uint8Array }> {
  const derived = await deriveHKDF(
    dhSharedSecret,
    rootKey,
    ROOT_KDF_INFO,
    64
  );
  const buf = new Uint8Array(derived);
  return {
    nextRootKey: buf.slice(0, 32),
    chainKey: buf.slice(32, 64),
  };
}

/**
 * Symmetric Chain KDF step: advances chain key and derives message encryption key
 */
async function kdfCK(
  chainKey: Uint8Array
): Promise<{ nextChainKey: Uint8Array; messageKey: Uint8Array }> {
  const derived = await deriveHKDF(
    chainKey,
    ZERO_SALT,
    CHAIN_KDF_INFO,
    64
  );
  const buf = new Uint8Array(derived);
  return {
    nextChainKey: buf.slice(0, 32),
    messageKey: buf.slice(32, 64),
  };
}

/**
 * Initialize Sender (Alice) Double Ratchet session following X3DH
 */
export async function initSenderSession(
  remoteDeviceId: string,
  remoteIdentityKey: string,
  sharedSecret: ArrayBuffer,
  aliceEphemeralKeyPair: ExportedKeyPair,
  bobSignedPrekeyPublicKey: string
): Promise<StoredRatchetSession> {
  const aliceEKPriv = await importPrivateKey(aliceEphemeralKeyPair.privateKey);
  const bobSPKPub = await importPublicKey(bobSignedPrekeyPublicKey);

  // Initial DH ratchet step
  const dhShared = await computeECDHSharedSecret(aliceEKPriv, bobSPKPub);
  const { nextRootKey, chainKey } = await kdfRK(
    new Uint8Array(sharedSecret),
    new Uint8Array(dhShared)
  );

  const now = Date.now();
  return {
    remoteDeviceId,
    remoteIdentityKey,
    rootKey: bufferToBase64(nextRootKey),
    sendingChainKey: bufferToBase64(chainKey),
    receivingChainKey: null,
    localDHKeyPair: aliceEphemeralKeyPair,
    remoteDHPublicKey: bobSignedPrekeyPublicKey,
    sequenceNumberOut: 0,
    sequenceNumberIn: 0,
    previousChainLength: 0,
    skippedMessageKeys: {},
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Initialize Receiver (Bob) Double Ratchet session following X3DH
 */
export async function initReceiverSession(
  remoteDeviceId: string,
  remoteIdentityKey: string,
  sharedSecret: ArrayBuffer,
  bobSignedPrekeyPair: ExportedKeyPair,
  aliceEphemeralPublicKey: string
): Promise<StoredRatchetSession> {
  const bobSPKPriv = await importPrivateKey(bobSignedPrekeyPair.privateKey);
  const aliceEKPub = await importPublicKey(aliceEphemeralPublicKey);

  // Initial DH ratchet step
  const dhShared = await computeECDHSharedSecret(bobSPKPriv, aliceEKPub);
  const { nextRootKey, chainKey } = await kdfRK(
    new Uint8Array(sharedSecret),
    new Uint8Array(dhShared)
  );

  const now = Date.now();
  return {
    remoteDeviceId,
    remoteIdentityKey,
    rootKey: bufferToBase64(nextRootKey),
    sendingChainKey: null,
    receivingChainKey: bufferToBase64(chainKey),
    localDHKeyPair: bobSignedPrekeyPair,
    remoteDHPublicKey: aliceEphemeralPublicKey,
    sequenceNumberOut: 0,
    sequenceNumberIn: 0,
    previousChainLength: 0,
    skippedMessageKeys: {},
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Encrypt a plaintext message using the Double Ratchet state
 */
export async function encryptRatchetMessage(
  session: StoredRatchetSession,
  plaintext: string,
  x3dhPayload?: X3DHInitiationPayload
): Promise<{
  session: StoredRatchetSession;
  message: RatchetMessagePayload;
}> {
  const currentSession: StoredRatchetSession = {
    ...session,
    skippedMessageKeys: { ...session.skippedMessageKeys },
  };

  // If sending chain is not yet established (Bob sending first reply), perform send ratchet
  if (!currentSession.sendingChainKey) {
    if (!currentSession.remoteDHPublicKey) {
      throw new Error('Cannot send message: Missing remote ratchet public key');
    }
    const newDHKeyPair = await generateECDHKeyPair();
    const exportedDH = await exportKeyPair(newDHKeyPair);
    const remotePub = await importPublicKey(currentSession.remoteDHPublicKey);
    const dhShared = await computeECDHSharedSecret(newDHKeyPair.privateKey, remotePub);

    const { nextRootKey, chainKey } = await kdfRK(
      base64ToBuffer(currentSession.rootKey),
      new Uint8Array(dhShared)
    );

    currentSession.rootKey = bufferToBase64(nextRootKey);
    currentSession.sendingChainKey = bufferToBase64(chainKey);
    currentSession.localDHKeyPair = exportedDH;
    currentSession.previousChainLength = currentSession.sequenceNumberOut;
    currentSession.sequenceNumberOut = 0;
  }

  // Advance sending chain
  const currentCK = base64ToBuffer(currentSession.sendingChainKey);
  const { nextChainKey, messageKey } = await kdfCK(currentCK);
  currentSession.sendingChainKey = bufferToBase64(nextChainKey);

  // Encrypt payload with derived message key
  const { ciphertext, iv, authTag } = await encryptAESGCM(messageKey, plaintext);

  const message: RatchetMessagePayload = {
    senderDeviceId: currentSession.localDHKeyPair.publicKey,
    recipientDeviceId: currentSession.remoteDeviceId,
    x3dh: x3dhPayload,
    ephemeralKey: currentSession.localDHKeyPair.publicKey,
    sequenceNumber: currentSession.sequenceNumberOut,
    previousChainLength: currentSession.previousChainLength,
    ciphertext,
    iv,
    authTag,
  };

  currentSession.sequenceNumberOut += 1;
  currentSession.updatedAt = Date.now();

  return { session: currentSession, message };
}

/**
 * Decrypt a received message using Double Ratchet state, advancing chains and ratcheting as needed
 */
export async function decryptRatchetMessage(
  session: StoredRatchetSession,
  message: RatchetMessagePayload
): Promise<{
  session: StoredRatchetSession;
  plaintext: string;
}> {
  const currentSession: StoredRatchetSession = {
    ...session,
    skippedMessageKeys: { ...session.skippedMessageKeys },
  };

  const cacheKey = `${message.ephemeralKey}:${message.sequenceNumber}`;

  // 1. Check if message key was previously skipped and cached
  if (currentSession.skippedMessageKeys[cacheKey]) {
    const messageKey = base64ToBuffer(currentSession.skippedMessageKeys[cacheKey]);
    delete currentSession.skippedMessageKeys[cacheKey]; // Forward secrecy: discard after use
    currentSession.updatedAt = Date.now();

    const plaintext = await decryptAESGCM(
      messageKey,
      message.ciphertext,
      message.iv,
      message.authTag
    );
    return { session: currentSession, plaintext };
  }

  // 2. Check if a new DH ratchet key was provided (counterparty performed a send ratchet)
  if (message.ephemeralKey !== currentSession.remoteDHPublicKey) {
    // Skip any remaining messages from previous receiving chain up to previousChainLength
    if (currentSession.receivingChainKey && currentSession.remoteDHPublicKey) {
      if (message.previousChainLength - currentSession.sequenceNumberIn > MAX_SKIP) {
        throw new Error('Too many skipped messages in previous receiving chain; exceeds threshold.');
      }

      while (currentSession.sequenceNumberIn < message.previousChainLength) {
        const { nextChainKey, messageKey } = await kdfCK(
          base64ToBuffer(currentSession.receivingChainKey)
        );
        const skippedKey = `${currentSession.remoteDHPublicKey}:${currentSession.sequenceNumberIn}`;
        currentSession.skippedMessageKeys[skippedKey] = bufferToBase64(messageKey);
        currentSession.receivingChainKey = bufferToBase64(nextChainKey);
        currentSession.sequenceNumberIn += 1;
      }
    }

    // DH Ratchet Step 1: Derive new receiving chain key
    const localPriv = await importPrivateKey(currentSession.localDHKeyPair.privateKey);
    const remotePub = await importPublicKey(message.ephemeralKey);
    const dhShared1 = await computeECDHSharedSecret(localPriv, remotePub);

    const { nextRootKey: rk1, chainKey: recvCK } = await kdfRK(
      base64ToBuffer(currentSession.rootKey),
      new Uint8Array(dhShared1)
    );

    currentSession.rootKey = bufferToBase64(rk1);
    currentSession.receivingChainKey = bufferToBase64(recvCK);
    currentSession.remoteDHPublicKey = message.ephemeralKey;
    currentSession.sequenceNumberIn = 0;

    // DH Ratchet Step 2: Generate fresh local DH pair and derive new sending chain key
    const newDHKeyPair = await generateECDHKeyPair();
    const exportedDH = await exportKeyPair(newDHKeyPair);
    const dhShared2 = await computeECDHSharedSecret(newDHKeyPair.privateKey, remotePub);

    const { nextRootKey: rk2, chainKey: sendCK } = await kdfRK(
      base64ToBuffer(currentSession.rootKey),
      new Uint8Array(dhShared2)
    );

    currentSession.rootKey = bufferToBase64(rk2);
    currentSession.sendingChainKey = bufferToBase64(sendCK);
    currentSession.localDHKeyPair = exportedDH;
    currentSession.previousChainLength = currentSession.sequenceNumberOut;
    currentSession.sequenceNumberOut = 0;
  }

  // 3. Process receiving chain
  if (!currentSession.receivingChainKey) {
    throw new Error('Ratchet receiving chain is uninitialized');
  }

  // Check for skipped messages in the current receiving chain
  if (message.sequenceNumber < currentSession.sequenceNumberIn) {
    throw new Error('Message sequence number already consumed or duplicated');
  }

  if (message.sequenceNumber - currentSession.sequenceNumberIn > MAX_SKIP) {
    throw new Error('Too many skipped messages in current receiving chain; exceeds threshold.');
  }

  while (currentSession.sequenceNumberIn < message.sequenceNumber) {
    const { nextChainKey, messageKey } = await kdfCK(
      base64ToBuffer(currentSession.receivingChainKey)
    );
    const skippedKey = `${currentSession.remoteDHPublicKey}:${currentSession.sequenceNumberIn}`;
    currentSession.skippedMessageKeys[skippedKey] = bufferToBase64(messageKey);
    currentSession.receivingChainKey = bufferToBase64(nextChainKey);
    currentSession.sequenceNumberIn += 1;
  }

  // Derive message key for current message
  const { nextChainKey, messageKey } = await kdfCK(
    base64ToBuffer(currentSession.receivingChainKey)
  );
  currentSession.receivingChainKey = bufferToBase64(nextChainKey);
  currentSession.sequenceNumberIn += 1;
  currentSession.updatedAt = Date.now();

  // Decrypt and authenticate
  const plaintext = await decryptAESGCM(
    messageKey,
    message.ciphertext,
    message.iv,
    message.authTag
  );

  return { session: currentSession, plaintext };
}
