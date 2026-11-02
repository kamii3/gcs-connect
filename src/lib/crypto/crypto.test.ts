/**
 * GCS CONNECT — Comprehensive Cryptographic Engine Test Suite
 * Covers Web Crypto, X3DH, Double Ratchet, Forward Secrecy,
 * Post-Compromise Security, Out-of-Order Messages, and Key Vault.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateECDHKeyPair,
  exportKeyPair,
  importPublicKey,
  importPrivateKey,
  computeECDHSharedSecret,
  deriveHKDF,
  encryptAESGCM,
  decryptAESGCM,
  generateSafetyNumber,
  bufferToBase64,
  base64ToBuffer,
} from './web-crypto';
import { initiateX3DH, respondX3DH } from './x3dh';
import {
  initSenderSession,
  initReceiverSession,
  encryptRatchetMessage,
  decryptRatchetMessage,
} from './double-ratchet';
import { ClientCryptoVault } from './storage-vault';
import { ExportedKeyPair, PrekeyBundle } from './types';

describe('1. Web Crypto API Primitives', () => {
  it('should generate, export, and import ECDH key pairs', async () => {
    const keyPair = await generateECDHKeyPair();
    const exported = await exportKeyPair(keyPair);

    expect(exported.publicKey).toBeDefined();
    expect(exported.privateKey).toBeDefined();
    expect(typeof exported.publicKey).toBe('string');
    expect(typeof exported.privateKey).toBe('string');

    const importedPub = await importPublicKey(exported.publicKey);
    const importedPriv = await importPrivateKey(exported.privateKey);

    expect(importedPub.type).toBe('public');
    expect(importedPriv.type).toBe('private');
  });

  it('should compute symmetric Diffie-Hellman shared secrets', async () => {
    const aliceKeyPair = await generateECDHKeyPair();
    const bobKeyPair = await generateECDHKeyPair();

    const secretAlice = await computeECDHSharedSecret(aliceKeyPair.privateKey, bobKeyPair.publicKey);
    const secretBob = await computeECDHSharedSecret(bobKeyPair.privateKey, aliceKeyPair.publicKey);

    const b64Alice = bufferToBase64(secretAlice);
    const b64Bob = bufferToBase64(secretBob);

    expect(b64Alice).toBe(b64Bob);
    expect(secretAlice.byteLength).toBe(32);
  });

  it('should perform AES-256-GCM authenticated encryption and decryption', async () => {
    const rawKey = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const plaintext = 'GCS CONNECT: Zero-Knowledge End-to-End Encryption';

    const encrypted = await encryptAESGCM(rawKey, plaintext);
    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.authTag).toBeDefined();

    const decrypted = await decryptAESGCM(
      rawKey,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.authTag
    );
    expect(decrypted).toBe(plaintext);
  });

  it('should detect tampering in ciphertext or auth tag (AES-GCM integrity)', async () => {
    const rawKey = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const plaintext = 'Secret Message';
    const encrypted = await encryptAESGCM(rawKey, plaintext);

    // Tamper with ciphertext
    const tamperedCipher = bufferToBase64(
      new Uint8Array([1, 2, 3, ...base64ToBuffer(encrypted.ciphertext).slice(3)])
    );

    await expect(
      decryptAESGCM(rawKey, tamperedCipher, encrypted.iv, encrypted.authTag)
    ).rejects.toThrow('Decryption failed');
  });

  it('should generate identical 60-digit safety numbers regardless of party order', async () => {
    const keyPairA = await exportKeyPair(await generateECDHKeyPair());
    const keyPairB = await exportKeyPair(await generateECDHKeyPair());

    const safetyNumber1 = await generateSafetyNumber(keyPairA.publicKey, keyPairB.publicKey);
    const safetyNumber2 = await generateSafetyNumber(keyPairB.publicKey, keyPairA.publicKey);

    expect(safetyNumber1).toBe(safetyNumber2);
    // 12 groups of 5 digits separated by spaces = 12 * 5 + 11 = 71 chars
    expect(safetyNumber1.replace(/\s/g, '').length).toBe(60);
    expect(/^\d{5}(\s\d{5}){11}$/.test(safetyNumber1)).toBe(true);
  });
});

describe('2. Extended Triple Diffie-Hellman (X3DH) Key Agreement', () => {
  let aliceIK: ExportedKeyPair;
  let bobIK: ExportedKeyPair;
  let bobSPK: ExportedKeyPair;
  let bobOPK: ExportedKeyPair;

  beforeEach(async () => {
    aliceIK = await exportKeyPair(await generateECDHKeyPair());
    bobIK = await exportKeyPair(await generateECDHKeyPair());
    bobSPK = await exportKeyPair(await generateECDHKeyPair());
    bobOPK = await exportKeyPair(await generateECDHKeyPair());
  });

  it('should establish identical master shared secrets with One-Time Prekey (4-DH)', async () => {
    const bobBundle: PrekeyBundle = {
      userId: 'user-bob-id',
      deviceId: 'device-bob-id',
      identityKey: bobIK.publicKey,
      signedPrekey: {
        keyId: 1,
        publicKey: bobSPK.publicKey,
        signature: 'valid-spk-sig',
      },
      oneTimePrekey: {
        keyId: 101,
        publicKey: bobOPK.publicKey,
      },
    };

    // Alice initiates
    const aliceResult = await initiateX3DH(aliceIK, bobBundle);
    expect(aliceResult.sharedSecret.byteLength).toBe(32);
    expect(aliceResult.initiationPayload.oneTimePrekeyId).toBe(101);

    // Bob responds
    const bobSecret = await respondX3DH(
      bobIK,
      bobSPK,
      bobOPK,
      aliceResult.initiationPayload
    );

    expect(bufferToBase64(aliceResult.sharedSecret)).toBe(bufferToBase64(bobSecret));
  });

  it('should establish identical master shared secrets without One-Time Prekey (Triple-DH fallback)', async () => {
    const bobBundle: PrekeyBundle = {
      userId: 'user-bob-id',
      deviceId: 'device-bob-id',
      identityKey: bobIK.publicKey,
      signedPrekey: {
        keyId: 1,
        publicKey: bobSPK.publicKey,
        signature: 'valid-spk-sig',
      },
      // No OPK available
    };

    const aliceResult = await initiateX3DH(aliceIK, bobBundle);
    const bobSecret = await respondX3DH(bobIK, bobSPK, null, aliceResult.initiationPayload);

    expect(bufferToBase64(aliceResult.sharedSecret)).toBe(bufferToBase64(bobSecret));
  });
});

describe('3. Double Ratchet Protocol Engine', () => {
  it('should execute complete bidirectional messaging session with ratcheting', async () => {
    // 1. Setup X3DH
    const aliceIK = await exportKeyPair(await generateECDHKeyPair());
    const bobIK = await exportKeyPair(await generateECDHKeyPair());
    const bobSPK = await exportKeyPair(await generateECDHKeyPair());
    const bobOPK = await exportKeyPair(await generateECDHKeyPair());

    const bobBundle: PrekeyBundle = {
      userId: 'bob',
      deviceId: 'bob-dev-1',
      identityKey: bobIK.publicKey,
      signedPrekey: { keyId: 1, publicKey: bobSPK.publicKey, signature: 'sig' },
      oneTimePrekey: { keyId: 101, publicKey: bobOPK.publicKey },
    };

    const x3dhAlice = await initiateX3DH(aliceIK, bobBundle);
    const x3dhBobSecret = await respondX3DH(bobIK, bobSPK, bobOPK, x3dhAlice.initiationPayload);

    // 2. Initialize Ratchet Sessions
    let aliceSession = await initSenderSession(
      'bob-dev-1',
      bobIK.publicKey,
      x3dhAlice.sharedSecret,
      x3dhAlice.aliceEphemeralKeyPair,
      bobSPK.publicKey
    );

    let bobSession = await initReceiverSession(
      'alice-dev-1',
      aliceIK.publicKey,
      x3dhBobSecret,
      bobSPK,
      x3dhAlice.aliceEphemeralKeyPair.publicKey
    );

    // --- Round 1: Alice sends initial message to Bob ---
    const msg1Plaintext = 'Hello Bob, this is secure message 1';
    const enc1 = await encryptRatchetMessage(aliceSession, msg1Plaintext, x3dhAlice.initiationPayload);
    aliceSession = enc1.session;

    const dec1 = await decryptRatchetMessage(bobSession, enc1.message);
    bobSession = dec1.session;
    expect(dec1.plaintext).toBe(msg1Plaintext);

    // --- Round 2: Alice sends second consecutive message to Bob (chain advancing) ---
    const msg2Plaintext = 'Hello again Bob, consecutive message 2';
    const enc2 = await encryptRatchetMessage(aliceSession, msg2Plaintext);
    aliceSession = enc2.session;

    const dec2 = await decryptRatchetMessage(bobSession, enc2.message);
    bobSession = dec2.session;
    expect(dec2.plaintext).toBe(msg2Plaintext);

    // --- Round 3: Bob replies to Alice (triggers DH Ratchet) ---
    const msg3Plaintext = 'Hey Alice! I received both of your messages securely.';
    const enc3 = await encryptRatchetMessage(bobSession, msg3Plaintext);
    bobSession = enc3.session;

    const dec3 = await decryptRatchetMessage(aliceSession, enc3.message);
    aliceSession = dec3.session;
    expect(dec3.plaintext).toBe(msg3Plaintext);

    // --- Round 4: Alice replies back to Bob (triggers second DH Ratchet) ---
    const msg4Plaintext = 'Awesome, post-compromise self-healing confirmed!';
    const enc4 = await encryptRatchetMessage(aliceSession, msg4Plaintext);
    aliceSession = enc4.session;

    const dec4 = await decryptRatchetMessage(bobSession, enc4.message);
    bobSession = dec4.session;
    expect(dec4.plaintext).toBe(msg4Plaintext);
  });

  it('should handle out-of-order message arrival using skipped message key caching', async () => {
    const aliceIK = await exportKeyPair(await generateECDHKeyPair());
    const bobIK = await exportKeyPair(await generateECDHKeyPair());
    const bobSPK = await exportKeyPair(await generateECDHKeyPair());

    const bobBundle: PrekeyBundle = {
      userId: 'bob',
      deviceId: 'bob-dev-1',
      identityKey: bobIK.publicKey,
      signedPrekey: { keyId: 1, publicKey: bobSPK.publicKey, signature: 'sig' },
    };

    const x3dhAlice = await initiateX3DH(aliceIK, bobBundle);
    const x3dhBobSecret = await respondX3DH(bobIK, bobSPK, null, x3dhAlice.initiationPayload);

    let aliceSession = await initSenderSession(
      'bob-dev-1',
      bobIK.publicKey,
      x3dhAlice.sharedSecret,
      x3dhAlice.aliceEphemeralKeyPair,
      bobSPK.publicKey
    );

    let bobSession = await initReceiverSession(
      'alice-dev-1',
      aliceIK.publicKey,
      x3dhBobSecret,
      bobSPK,
      x3dhAlice.aliceEphemeralKeyPair.publicKey
    );

    // Alice produces messages 0, 1, 2
    const enc0 = await encryptRatchetMessage(aliceSession, 'Message 0 (First)', x3dhAlice.initiationPayload);
    aliceSession = enc0.session;

    const enc1 = await encryptRatchetMessage(aliceSession, 'Message 1 (Second)');
    aliceSession = enc1.session;

    const enc2 = await encryptRatchetMessage(aliceSession, 'Message 2 (Third)');
    aliceSession = enc2.session;

    // Bob receives message 2 FIRST (messages 0 and 1 are delayed)
    const dec2 = await decryptRatchetMessage(bobSession, enc2.message);
    bobSession = dec2.session;
    expect(dec2.plaintext).toBe('Message 2 (Third)');

    // Verify Bob cached skipped keys for messages 0 and 1
    expect(Object.keys(bobSession.skippedMessageKeys).length).toBe(2);

    // Bob now receives message 0
    const dec0 = await decryptRatchetMessage(bobSession, enc0.message);
    bobSession = dec0.session;
    expect(dec0.plaintext).toBe('Message 0 (First)');

    // Skipped key for message 0 should be consumed and deleted (Forward Secrecy)
    expect(Object.keys(bobSession.skippedMessageKeys).length).toBe(1);

    // Bob now receives message 1
    const dec1 = await decryptRatchetMessage(bobSession, enc1.message);
    bobSession = dec1.session;
    expect(dec1.plaintext).toBe('Message 1 (Second)');
    expect(Object.keys(bobSession.skippedMessageKeys).length).toBe(0);
  });

  it('should enforce Forward Secrecy: replaying an already-decrypted message fails', async () => {
    const aliceIK = await exportKeyPair(await generateECDHKeyPair());
    const bobIK = await exportKeyPair(await generateECDHKeyPair());
    const bobSPK = await exportKeyPair(await generateECDHKeyPair());

    const bobBundle: PrekeyBundle = {
      userId: 'bob',
      deviceId: 'bob-dev-1',
      identityKey: bobIK.publicKey,
      signedPrekey: { keyId: 1, publicKey: bobSPK.publicKey, signature: 'sig' },
    };

    const x3dhAlice = await initiateX3DH(aliceIK, bobBundle);
    const x3dhBobSecret = await respondX3DH(bobIK, bobSPK, null, x3dhAlice.initiationPayload);

    let aliceSession = await initSenderSession(
      'bob-dev-1',
      bobIK.publicKey,
      x3dhAlice.sharedSecret,
      x3dhAlice.aliceEphemeralKeyPair,
      bobSPK.publicKey
    );

    let bobSession = await initReceiverSession(
      'alice-dev-1',
      aliceIK.publicKey,
      x3dhBobSecret,
      bobSPK,
      x3dhAlice.aliceEphemeralKeyPair.publicKey
    );

    const enc = await encryptRatchetMessage(aliceSession, 'One-time secure message');
    aliceSession = enc.session;

    // First decryption succeeds
    const dec = await decryptRatchetMessage(bobSession, enc.message);
    bobSession = dec.session;
    expect(dec.plaintext).toBe('One-time secure message');

    // Attempting replay of the same message fails because sequence number was consumed
    await expect(decryptRatchetMessage(bobSession, enc.message)).rejects.toThrow(
      'Message sequence number already consumed or duplicated'
    );
  });
});

describe('4. Client Cryptographic Storage Vault', () => {
  it('should initialize vault, export public bundle, and manage prekeys', async () => {
    const vault = new ClientCryptoVault();
    await vault.initialize('device-test-123', 10);

    expect(vault.deviceId).toBe('device-test-123');
    expect(vault.identityKeyPair).not.toBeNull();
    expect(vault.signedPrekey).not.toBeNull();
    expect(vault.oneTimePrekeys.size).toBe(10);

    const bundle = vault.exportPublicBundle('user-test-123');
    expect(bundle.userId).toBe('user-test-123');
    expect(bundle.deviceId).toBe('device-test-123');
    expect(bundle.identityKey).toBe(vault.identityKeyPair?.publicKey);
    expect(bundle.signedPrekey.publicKey).toBe(vault.signedPrekey?.keyPair.publicKey);
    expect(bundle.oneTimePrekey).toBeDefined();

    // Consume OPK
    const consumed = vault.consumeOneTimePrekey(bundle.oneTimePrekey!.keyId);
    expect(consumed).not.toBeNull();
    expect(vault.oneTimePrekeys.size).toBe(9);

    // Replenish OPKs
    const replenished = await vault.replenishOneTimePrekeys(5);
    expect(replenished.length).toBe(5);
    expect(vault.oneTimePrekeys.size).toBe(14);
  });

  it('should export and import encrypted vault backup with passphrase', async () => {
    const vault = new ClientCryptoVault();
    await vault.initialize('device-sync-test', 5);

    const passphrase = 'Ultra-Secure-Master-Password!2026';
    const encryptedBackup = await vault.exportEncryptedVault(passphrase);

    expect(typeof encryptedBackup).toBe('string');
    const parsed = JSON.parse(encryptedBackup);
    expect(parsed.salt).toBeDefined();
    expect(parsed.ciphertext).toBeDefined();
    expect(parsed.authTag).toBeDefined();

    // Restore into a fresh vault instance
    const restoredVault = new ClientCryptoVault();
    await restoredVault.importEncryptedVault(passphrase, encryptedBackup);

    expect(restoredVault.deviceId).toBe('device-sync-test');
    expect(restoredVault.identityKeyPair?.publicKey).toBe(vault.identityKeyPair?.publicKey);
    expect(restoredVault.signedPrekey?.keyPair.publicKey).toBe(vault.signedPrekey?.keyPair.publicKey);
    expect(restoredVault.oneTimePrekeys.size).toBe(5);

    // Attempting restore with wrong passphrase throws error
    const wrongVault = new ClientCryptoVault();
    await expect(
      wrongVault.importEncryptedVault('WrongPassword123!', encryptedBackup)
    ).rejects.toThrow();
  });
});
