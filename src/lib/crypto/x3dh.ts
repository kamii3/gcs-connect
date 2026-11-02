/**
 * GCS CONNECT — Extended Triple Diffie-Hellman (X3DH) Key Agreement
 * Establishes a shared secret between two parties using identity keys,
 * signed prekeys, and one-time prekeys.
 */

import {
  generateECDHKeyPair,
  exportKeyPair,
  importPublicKey,
  importPrivateKey,
  computeECDHSharedSecret,
  deriveHKDF,
} from './web-crypto';
import { PrekeyBundle, X3DHInitiationPayload, ExportedKeyPair } from './types';

const X3DH_INFO = 'GCS-CONNECT-X3DH-PROTOCOL-V1';
const ZERO_SALT = new Uint8Array(32);

/**
 * Alice (Sender) initiates an X3DH session with Bob's Prekey Bundle
 */
export async function initiateX3DH(
  aliceIdentityKeyPair: ExportedKeyPair,
  bobPrekeyBundle: PrekeyBundle
): Promise<{
  sharedSecret: ArrayBuffer;
  initiationPayload: X3DHInitiationPayload;
  aliceEphemeralKeyPair: ExportedKeyPair;
}> {
  // 1. Generate Alice's Ephemeral Key Pair (EK_A)
  const ekCryptoPair = await generateECDHKeyPair();
  const aliceEphemeralKeyPair = await exportKeyPair(ekCryptoPair);

  // 2. Import keys
  const aliceIKPriv = await importPrivateKey(aliceIdentityKeyPair.privateKey);
  const aliceEKPriv = ekCryptoPair.privateKey;

  const bobIKPub = await importPublicKey(bobPrekeyBundle.identityKey);
  const bobSPKPub = await importPublicKey(bobPrekeyBundle.signedPrekey.publicKey);

  // 3. Compute Diffie-Hellman shared secrets
  // DH1 = ECDH(IK_A, SPK_B)
  const dh1 = await computeECDHSharedSecret(aliceIKPriv, bobSPKPub);

  // DH2 = ECDH(EK_A, IK_B)
  const dh2 = await computeECDHSharedSecret(aliceEKPriv, bobIKPub);

  // DH3 = ECDH(EK_A, SPK_B)
  const dh3 = await computeECDHSharedSecret(aliceEKPriv, bobSPKPub);

  let combinedDH = new Uint8Array(dh1.byteLength + dh2.byteLength + dh3.byteLength);
  combinedDH.set(new Uint8Array(dh1), 0);
  combinedDH.set(new Uint8Array(dh2), dh1.byteLength);
  combinedDH.set(new Uint8Array(dh3), dh1.byteLength + dh2.byteLength);

  // DH4 = ECDH(EK_A, OPK_B) if Bob provided a One-Time Prekey
  let oneTimePrekeyId: number | undefined;
  if (bobPrekeyBundle.oneTimePrekey) {
    oneTimePrekeyId = bobPrekeyBundle.oneTimePrekey.keyId;
    const bobOPKPub = await importPublicKey(bobPrekeyBundle.oneTimePrekey.publicKey);
    const dh4 = await computeECDHSharedSecret(aliceEKPriv, bobOPKPub);

    const withDH4 = new Uint8Array(combinedDH.byteLength + dh4.byteLength);
    withDH4.set(combinedDH, 0);
    withDH4.set(new Uint8Array(dh4), combinedDH.byteLength);
    combinedDH = withDH4;
  }

  // 4. Derive Master Shared Secret (SK) using HKDF-SHA256
  const sharedSecret = await deriveHKDF(combinedDH, ZERO_SALT, X3DH_INFO, 32);

  const initiationPayload: X3DHInitiationPayload = {
    senderIdentityKey: aliceIdentityKeyPair.publicKey,
    ephemeralKey: aliceEphemeralKeyPair.publicKey,
    signedPrekeyId: bobPrekeyBundle.signedPrekey.keyId,
    oneTimePrekeyId,
  };

  return {
    sharedSecret,
    initiationPayload,
    aliceEphemeralKeyPair,
  };
}

/**
 * Bob (Recipient) computes the matching shared secret using Alice's initiation payload
 */
export async function respondX3DH(
  bobIdentityKeyPair: ExportedKeyPair,
  bobSignedPrekeyPair: ExportedKeyPair,
  bobOneTimePrekeyPair: ExportedKeyPair | null,
  initiationPayload: X3DHInitiationPayload
): Promise<ArrayBuffer> {
  // 1. Import Bob's private keys
  const bobIKPriv = await importPrivateKey(bobIdentityKeyPair.privateKey);
  const bobSPKPriv = await importPrivateKey(bobSignedPrekeyPair.privateKey);

  // 2. Import Alice's public keys
  const aliceIKPub = await importPublicKey(initiationPayload.senderIdentityKey);
  const aliceEKPub = await importPublicKey(initiationPayload.ephemeralKey);

  // 3. Compute matching Diffie-Hellman secrets
  // DH1 = ECDH(SPK_B, IK_A)
  const dh1 = await computeECDHSharedSecret(bobSPKPriv, aliceIKPub);

  // DH2 = ECDH(IK_B, EK_A)
  const dh2 = await computeECDHSharedSecret(bobIKPriv, aliceEKPub);

  // DH3 = ECDH(SPK_B, EK_A)
  const dh3 = await computeECDHSharedSecret(bobSPKPriv, aliceEKPub);

  let combinedDH = new Uint8Array(dh1.byteLength + dh2.byteLength + dh3.byteLength);
  combinedDH.set(new Uint8Array(dh1), 0);
  combinedDH.set(new Uint8Array(dh2), dh1.byteLength);
  combinedDH.set(new Uint8Array(dh3), dh1.byteLength + dh2.byteLength);

  // DH4 = ECDH(OPK_B, EK_A) if one-time prekey was used
  if (initiationPayload.oneTimePrekeyId !== undefined) {
    if (!bobOneTimePrekeyPair) {
      throw new Error(`One-time prekey ${initiationPayload.oneTimePrekeyId} requested but not provided.`);
    }
    const bobOPKPriv = await importPrivateKey(bobOneTimePrekeyPair.privateKey);
    const dh4 = await computeECDHSharedSecret(bobOPKPriv, aliceEKPub);

    const withDH4 = new Uint8Array(combinedDH.byteLength + dh4.byteLength);
    withDH4.set(combinedDH, 0);
    withDH4.set(new Uint8Array(dh4), combinedDH.byteLength);
    combinedDH = withDH4;
  }

  // 4. Derive identical Master Shared Secret (SK)
  return deriveHKDF(combinedDH, ZERO_SALT, X3DH_INFO, 32);
}
