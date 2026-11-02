/**
 * GCS CONNECT — Web Crypto API Engine
 * Native cryptographic primitives using globalThis.crypto.subtle
 * Standards: ECDH (P-256), AES-256-GCM, HKDF-SHA256
 */

import { ExportedKeyPair } from './types';

// Ensure crypto is accessible across browser and Node.js
const subtle = globalThis.crypto?.subtle;

if (!subtle) {
  throw new Error('Web Crypto API (crypto.subtle) is not supported in this runtime.');
}

/**
 * Convert ArrayBuffer or Uint8Array to Base64 string
 */
export function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to Uint8Array
 */
export function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generate an asymmetric ECDH Key Pair
 */
export async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
  return subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true, // extractable for local encrypted vault persistence
    ['deriveKey', 'deriveBits']
  );
}

/**
 * Export a CryptoKeyPair to Base64 strings (SPKI for public, PKCS8 for private)
 */
export async function exportKeyPair(keyPair: CryptoKeyPair): Promise<ExportedKeyPair> {
  const publicKeySpki = await subtle.exportKey('spki', keyPair.publicKey);
  const privateKeyPkcs8 = await subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: bufferToBase64(publicKeySpki),
    privateKey: bufferToBase64(privateKeyPkcs8),
  };
}

/**
 * Import a Base64-encoded SPKI public key
 */
export async function importPublicKey(b64PublicKey: string): Promise<CryptoKey> {
  const keyData = base64ToBuffer(b64PublicKey);
  return subtle.importKey(
    'spki',
    keyData as unknown as BufferSource,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    []
  );
}

/**
 * Import a Base64-encoded PKCS8 private key
 */
export async function importPrivateKey(b64PrivateKey: string): Promise<CryptoKey> {
  const keyData = base64ToBuffer(b64PrivateKey);
  return subtle.importKey(
    'pkcs8',
    keyData as unknown as BufferSource,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveKey', 'deriveBits']
  );
}

/**
 * Compute raw Diffie-Hellman shared secret between local private key and remote public key
 */
export async function computeECDHSharedSecret(
  localPrivateKey: CryptoKey,
  remotePublicKey: CryptoKey
): Promise<ArrayBuffer> {
  return subtle.deriveBits(
    {
      name: 'ECDH',
      public: remotePublicKey,
    },
    localPrivateKey,
    256 // 256 bits = 32 bytes
  );
}

/**
 * Derive cryptographic keys using HKDF-SHA256 (RFC 5869)
 */
export async function deriveHKDF(
  initialKeyingMaterial: ArrayBuffer | Uint8Array,
  salt: Uint8Array,
  info: string,
  lengthBytes = 32
): Promise<ArrayBuffer> {
  const ikmBuffer =
    initialKeyingMaterial instanceof Uint8Array
      ? initialKeyingMaterial.buffer
      : initialKeyingMaterial;

  const baseKey = await subtle.importKey(
    'raw',
    ikmBuffer as unknown as BufferSource,
    'HKDF',
    false,
    ['deriveBits']
  );

  const enc = new TextEncoder();
  return subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as unknown as BufferSource,
      info: enc.encode(info) as unknown as BufferSource,
    },
    baseKey,
    lengthBytes * 8
  );
}

/**
 * Encrypt arbitrary plaintext string using AES-256-GCM authenticated encryption
 */
export async function encryptAESGCM(
  rawKey32Bytes: ArrayBuffer | Uint8Array,
  plaintext: string,
  iv?: Uint8Array
): Promise<{ ciphertext: string; iv: string; authTag: string }> {
  const keyBuffer =
    rawKey32Bytes instanceof Uint8Array ? rawKey32Bytes.buffer : rawKey32Bytes;

  const cryptoKey = await subtle.importKey(
    'raw',
    keyBuffer as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  // Generate 96-bit (12-byte) cryptographically secure IV if not provided
  const nonce = iv || globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encodedText = new TextEncoder().encode(plaintext);

  // In Web Crypto API, AES-GCM appends the 16-byte authentication tag to the ciphertext
  const encryptedWithTag = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce as unknown as BufferSource,
      tagLength: 128, // 16 bytes authentication tag
    },
    cryptoKey,
    encodedText as unknown as BufferSource
  );

  const fullBytes = new Uint8Array(encryptedWithTag);
  const tagBytes = fullBytes.slice(fullBytes.byteLength - 16);
  const cipherBytes = fullBytes.slice(0, fullBytes.byteLength - 16);

  return {
    ciphertext: bufferToBase64(cipherBytes),
    iv: bufferToBase64(nonce),
    authTag: bufferToBase64(tagBytes),
  };
}

/**
 * Decrypt AES-256-GCM ciphertext and verify 128-bit authentication tag
 * Throws an error automatically if ciphertext or tag was tampered with
 */
export async function decryptAESGCM(
  rawKey32Bytes: ArrayBuffer | Uint8Array,
  ciphertextB64: string,
  ivB64: string,
  authTagB64: string
): Promise<string> {
  const keyBuffer =
    rawKey32Bytes instanceof Uint8Array ? rawKey32Bytes.buffer : rawKey32Bytes;

  const cryptoKey = await subtle.importKey(
    'raw',
    keyBuffer as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const cipherBytes = base64ToBuffer(ciphertextB64);
  const tagBytes = base64ToBuffer(authTagB64);
  const nonce = base64ToBuffer(ivB64);

  // Recombine ciphertext and tag for Web Crypto Subtle API
  const fullPayload = new Uint8Array(cipherBytes.length + tagBytes.length);
  fullPayload.set(cipherBytes, 0);
  fullPayload.set(tagBytes, cipherBytes.length);

  try {
    const decryptedBuffer = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: nonce as unknown as BufferSource,
        tagLength: 128,
      },
      cryptoKey,
      fullPayload as unknown as BufferSource
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (err) {
    throw new Error('Decryption failed: Ciphertext or authentication tag was tampered with.');
  }
}

/**
 * Generate 60-digit human-verifiable Safety Number fingerprint
 * Formatted as 12 groups of 5 digits (e.g., "12345 67890 ...")
 */
export async function generateSafetyNumber(
  identityKeyA: string,
  identityKeyB: string
): Promise<string> {
  // Sort lexicographically to ensure both peers calculate identical numbers
  const sorted = [identityKeyA, identityKeyB].sort();
  const combined = new TextEncoder().encode(sorted[0] + sorted[1]);

  let currentHash = await subtle.digest('SHA-256', combined as unknown as BufferSource);

  // 1000 rounds of iterative hashing (Signal Safety Number specification)
  for (let i = 0; i < 1000; i++) {
    currentHash = await subtle.digest('SHA-256', currentHash as unknown as BufferSource);
  }

  const hashBytes = new Uint8Array(currentHash);
  let digits = '';

  // Generate 60 digits (12 blocks of 5 digits = 12 * 2 = 24 bytes)
  for (let i = 0; i < 24; i += 2) {
    const value = (hashBytes[i] << 8) | hashBytes[i + 1];
    digits += (value % 100000).toString().padStart(5, '0');
  }

  // Format into 12 groups of 5 digits
  return digits.match(/.{1,5}/g)?.join(' ') || digits;
}
