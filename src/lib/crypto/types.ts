/**
 * GCS CONNECT — Cryptographic Protocol Types
 * Based on X3DH and Double Ratchet Standards
 */

export interface ExportedKeyPair {
  publicKey: string;  // Base64
  privateKey: string; // Base64
}

export interface PrekeyBundle {
  userId: string;
  deviceId: string;
  identityKey: string;      // Base64 (Curve25519 / ECDH)
  signedPrekey: {
    keyId: number;
    publicKey: string;      // Base64
    signature: string;      // Base64
  };
  oneTimePrekey?: {
    keyId: number;
    publicKey: string;      // Base64
  };
}

export interface X3DHInitiationPayload {
  senderIdentityKey: string;     // Base64 (Alice IK)
  ephemeralKey: string;           // Base64 (Alice EK)
  signedPrekeyId: number;         // Bob SPK keyId
  oneTimePrekeyId?: number;       // Bob OPK keyId (if consumed)
}

export interface RatchetMessagePayload {
  senderDeviceId: string;
  recipientDeviceId: string;
  x3dh?: X3DHInitiationPayload;   // Included on initial message
  ephemeralKey: string;           // Base64 current DH ratchet public key
  sequenceNumber: number;         // Message index in current sending chain
  previousChainLength: number;    // Length of previous sending chain
  ciphertext: string;             // Base64 AES-256-GCM ciphertext
  iv: string;                     // Base64 12-byte initialization vector
  authTag: string;                // Base64 16-byte authentication tag
}

export interface StoredRatchetSession {
  remoteDeviceId: string;
  remoteIdentityKey: string;
  rootKey: string;               // Base64
  sendingChainKey: string | null;// Base64
  receivingChainKey: string | null; // Base64
  localDHKeyPair: ExportedKeyPair;
  remoteDHPublicKey: string | null;
  sequenceNumberOut: number;
  sequenceNumberIn: number;
  previousChainLength: number;
  skippedMessageKeys: Record<string, string>; // "dhKey:seq" -> Base64 message key
  createdAt: number;
  updatedAt: number;
}
