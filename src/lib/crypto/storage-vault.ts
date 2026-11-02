/**
 * GCS CONNECT — Client Cryptographic Storage Vault
 * Secure client-side persistent storage for Identity Keys, Prekeys, and Ratchet Sessions.
 * Never exposes private keys to backend servers or unauthorized contexts.
 */

import {
  exportKeyPair,
  generateECDHKeyPair,
  bufferToBase64,
  base64ToBuffer,
  encryptAESGCM,
  decryptAESGCM,
  deriveHKDF,
} from './web-crypto';
import { ExportedKeyPair, PrekeyBundle, StoredRatchetSession } from './types';

export interface VaultSignedPrekey {
  keyId: number;
  keyPair: ExportedKeyPair;
  signature: string;
  createdAt: number;
}

export interface SerializedVault {
  version: number;
  deviceId: string;
  identityKeyPair: ExportedKeyPair;
  signedPrekey: VaultSignedPrekey;
  oneTimePrekeys: Array<{ keyId: number; keyPair: ExportedKeyPair }>;
  sessions: StoredRatchetSession[];
}

export class ClientCryptoVault {
  public deviceId: string = '';
  public identityKeyPair: ExportedKeyPair | null = null;
  public signedPrekey: VaultSignedPrekey | null = null;
  public oneTimePrekeys: Map<number, ExportedKeyPair> = new Map();
  public sessions: Map<string, StoredRatchetSession> = new Map();

  /**
   * Initialize a brand new cryptographic identity and key inventory
   */
  public async initialize(deviceId: string, opkCount = 25): Promise<void> {
    this.deviceId = deviceId;

    // 1. Generate master Identity Key Pair (IK)
    const ikPair = await generateECDHKeyPair();
    this.identityKeyPair = await exportKeyPair(ikPair);

    // 2. Generate Signed Prekey (SPK)
    const spkPair = await generateECDHKeyPair();
    const exportedSPK = await exportKeyPair(spkPair);
    this.signedPrekey = {
      keyId: 1,
      keyPair: exportedSPK,
      signature: 'SIG-VERIFIED-V1', // Signature placeholder or Ed25519 signature
      createdAt: Date.now(),
    };

    // 3. Generate initial batch of One-Time Prekeys (OPKs)
    await this.replenishOneTimePrekeys(opkCount, 1);
  }

  /**
   * Generate fresh One-Time Prekeys
   */
  public async replenishOneTimePrekeys(count: number, startId = 1): Promise<Array<{ keyId: number; publicKey: string }>> {
    const publicBundles: Array<{ keyId: number; publicKey: string }> = [];
    const maxCurrentId = Array.from(this.oneTimePrekeys.keys()).reduce((max, id) => Math.max(max, id), startId - 1);

    for (let i = 1; i <= count; i++) {
      const keyId = maxCurrentId + i;
      const opkPair = await generateECDHKeyPair();
      const exported = await exportKeyPair(opkPair);
      this.oneTimePrekeys.set(keyId, exported);
      publicBundles.push({ keyId, publicKey: exported.publicKey });
    }

    return publicBundles;
  }

  /**
   * Produce public Prekey Bundle for registration with server
   */
  public exportPublicBundle(userId: string): PrekeyBundle {
    if (!this.identityKeyPair || !this.signedPrekey) {
      throw new Error('Vault is not initialized');
    }

    // Pick first available one-time prekey if present
    const firstOpkEntry = this.oneTimePrekeys.entries().next().value;
    const opk = firstOpkEntry
      ? { keyId: firstOpkEntry[0], publicKey: firstOpkEntry[1].publicKey }
      : undefined;

    return {
      userId,
      deviceId: this.deviceId,
      identityKey: this.identityKeyPair.publicKey,
      signedPrekey: {
        keyId: this.signedPrekey.keyId,
        publicKey: this.signedPrekey.keyPair.publicKey,
        signature: this.signedPrekey.signature,
      },
      oneTimePrekey: opk,
    };
  }

  /**
   * Store or update an active Double Ratchet session
   */
  public saveSession(session: StoredRatchetSession): void {
    this.sessions.set(session.remoteDeviceId, session);
  }

  /**
   * Retrieve an active session by remote device ID
   */
  public getSession(remoteDeviceId: string): StoredRatchetSession | null {
    return this.sessions.get(remoteDeviceId) || null;
  }

  /**
   * Consume and erase a used One-Time Prekey
   */
  public consumeOneTimePrekey(keyId: number): ExportedKeyPair | null {
    const key = this.oneTimePrekeys.get(keyId) || null;
    if (key) {
      this.oneTimePrekeys.delete(keyId);
    }
    return key;
  }

  /**
   * Serialize vault to encrypted backup string protected by passphrase
   */
  public async exportEncryptedVault(passphrase: string): Promise<string> {
    if (!this.identityKeyPair || !this.signedPrekey) {
      throw new Error('Vault is uninitialized');
    }

    const payload: SerializedVault = {
      version: 1,
      deviceId: this.deviceId,
      identityKeyPair: this.identityKeyPair,
      signedPrekey: this.signedPrekey,
      oneTimePrekeys: Array.from(this.oneTimePrekeys.entries()).map(([keyId, keyPair]) => ({
        keyId,
        keyPair,
      })),
      sessions: Array.from(this.sessions.values()),
    };

    const jsonString = JSON.stringify(payload);
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const encPass = new TextEncoder().encode(passphrase);

    // Derive 32-byte encryption key from passphrase using HKDF
    const derivedKey = await deriveHKDF(encPass, salt, 'GCS-CONNECT-VAULT-BACKUP-V1', 32);
    const { ciphertext, iv, authTag } = await encryptAESGCM(derivedKey, jsonString);

    return JSON.stringify({
      version: 1,
      salt: bufferToBase64(salt),
      iv,
      authTag,
      ciphertext,
    });
  }

  /**
   * Restore vault from encrypted backup string using passphrase
   */
  public async importEncryptedVault(passphrase: string, encryptedJson: string): Promise<void> {
    const envelope = JSON.parse(encryptedJson);
    const salt = base64ToBuffer(envelope.salt);
    const encPass = new TextEncoder().encode(passphrase);

    const derivedKey = await deriveHKDF(encPass, salt, 'GCS-CONNECT-VAULT-BACKUP-V1', 32);
    const decryptedJson = await decryptAESGCM(
      derivedKey,
      envelope.ciphertext,
      envelope.iv,
      envelope.authTag
    );

    const payload: SerializedVault = JSON.parse(decryptedJson);
    this.deviceId = payload.deviceId;
    this.identityKeyPair = payload.identityKeyPair;
    this.signedPrekey = payload.signedPrekey;
    this.oneTimePrekeys.clear();
    for (const opk of payload.oneTimePrekeys) {
      this.oneTimePrekeys.set(opk.keyId, opk.keyPair);
    }
    this.sessions.clear();
    for (const session of payload.sessions) {
      this.sessions.set(session.remoteDeviceId, session);
    }
  }
}
