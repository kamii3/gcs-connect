/**
 * GCS CONNECT — Client-Side Encrypted Media & File Pipeline
 * Native Web Crypto API (AES-256-GCM + SHA-256)
 * Zero Plaintext Storage: Media files and thumbnails are encrypted on the client before upload.
 * Keys are transmitted strictly inside the Double Ratchet message envelope.
 */

import { base64ToBuffer, bufferToBase64 } from './web-crypto';

const subtle = globalThis.crypto?.subtle;

if (!subtle) {
  throw new Error('Web Crypto API (crypto.subtle) is not available in this environment.');
}

export interface EncryptedMediaDescriptor {
  mediaKey: string; // Base64 32-byte key
  iv: string; // Base64 12-byte IV
  authTag: string; // Base64 16-byte tag
  mimeType: string;
  fileName: string;
  fileSizeBytes: number;
  ciphertextSha256: string;
  thumbnail?: {
    mediaKey: string;
    iv: string;
    authTag: string;
    ciphertextSha256: string;
  };
}

export interface EncryptedMediaPackage {
  ciphertextBuffer: Uint8Array;
  ciphertextSha256: string;
  mediaDescriptor: EncryptedMediaDescriptor;
  thumbnailCiphertext?: Uint8Array;
}

/**
 * Convert ArrayBuffer or Uint8Array to Hex string
 */
export function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute SHA-256 integrity hash of a buffer
 */
export async function computeSha256(buffer: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const hashBuffer = await subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return bufferToHex(hashBuffer);
}

/**
 * Client-Side File Encryption: Encrypt arbitrary file buffer using random AES-256-GCM key
 */
export async function encryptMediaBuffer(
  fileBuffer: ArrayBuffer | Uint8Array,
  mimeType: string,
  fileName: string,
  thumbnailBuffer?: ArrayBuffer | Uint8Array
): Promise<EncryptedMediaPackage> {
  const dataBytes = fileBuffer instanceof Uint8Array ? fileBuffer : new Uint8Array(fileBuffer);

  // 1. Generate 256-bit media encryption key and 96-bit IV
  const rawKey = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));

  const cryptoKey = await subtle.importKey(
    'raw',
    rawKey as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  // 2. Encrypt main media payload with AES-256-GCM
  const encryptedWithTag = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
      tagLength: 128,
    },
    cryptoKey,
    dataBytes as unknown as BufferSource
  );

  const fullBytes = new Uint8Array(encryptedWithTag);
  const authTag = fullBytes.slice(fullBytes.byteLength - 16);
  const cipherBytes = fullBytes.slice(0, fullBytes.byteLength - 16);

  // 3. Compute SHA-256 of the ciphertext
  const ciphertextSha256 = await computeSha256(cipherBytes);

  const descriptor: EncryptedMediaDescriptor = {
    mediaKey: bufferToBase64(rawKey),
    iv: bufferToBase64(iv),
    authTag: bufferToBase64(authTag),
    mimeType,
    fileName,
    fileSizeBytes: dataBytes.byteLength,
    ciphertextSha256,
  };

  let thumbCipherBytes: Uint8Array | undefined;

  // 4. Encrypt thumbnail if provided
  if (thumbnailBuffer) {
    const thumbBytes =
      thumbnailBuffer instanceof Uint8Array ? thumbnailBuffer : new Uint8Array(thumbnailBuffer);
    const thumbKey = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const thumbIv = globalThis.crypto.getRandomValues(new Uint8Array(12));

    const thumbCryptoKey = await subtle.importKey(
      'raw',
      thumbKey as unknown as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const thumbEncrypted = await subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: thumbIv as unknown as BufferSource,
        tagLength: 128,
      },
      thumbCryptoKey,
      thumbBytes as unknown as BufferSource
    );

    const fullThumb = new Uint8Array(thumbEncrypted);
    const thumbTag = fullThumb.slice(fullThumb.byteLength - 16);
    thumbCipherBytes = fullThumb.slice(0, fullThumb.byteLength - 16);

    const thumbSha = await computeSha256(thumbCipherBytes);

    descriptor.thumbnail = {
      mediaKey: bufferToBase64(thumbKey),
      iv: bufferToBase64(thumbIv),
      authTag: bufferToBase64(thumbTag),
      ciphertextSha256: thumbSha,
    };
  }

  return {
    ciphertextBuffer: cipherBytes,
    ciphertextSha256,
    mediaDescriptor: descriptor,
    thumbnailCiphertext: thumbCipherBytes,
  };
}

/**
 * Client-Side File Decryption: Decrypt ciphertext buffer using media descriptor
 */
export async function decryptMediaBuffer(
  ciphertextBuffer: ArrayBuffer | Uint8Array,
  descriptor: {
    mediaKey: string;
    iv: string;
    authTag: string;
    ciphertextSha256?: string;
  }
): Promise<ArrayBuffer> {
  const cipherBytes =
    ciphertextBuffer instanceof Uint8Array ? ciphertextBuffer : new Uint8Array(ciphertextBuffer);

  // 1. Verify ciphertext SHA-256 integrity if provided
  if (descriptor.ciphertextSha256) {
    const computedSha = await computeSha256(cipherBytes);
    if (computedSha.toLowerCase() !== descriptor.ciphertextSha256.toLowerCase()) {
      throw new Error(
        `Ciphertext integrity check failed. Expected: ${descriptor.ciphertextSha256}, Got: ${computedSha}`
      );
    }
  }

  const rawKey = base64ToBuffer(descriptor.mediaKey);
  const iv = base64ToBuffer(descriptor.iv);
  const authTag = base64ToBuffer(descriptor.authTag);

  const cryptoKey = await subtle.importKey(
    'raw',
    rawKey as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  // 2. Recombine ciphertext and 16-byte authentication tag
  const fullPayload = new Uint8Array(cipherBytes.length + authTag.length);
  fullPayload.set(cipherBytes, 0);
  fullPayload.set(authTag, cipherBytes.length);

  try {
    return await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource,
        tagLength: 128,
      },
      cryptoKey,
      fullPayload as unknown as BufferSource
    );
  } catch (error) {
    throw new Error('Media decryption failed: Ciphertext or authentication tag was corrupted.');
  }
}
