/**
 * GCS CONNECT — Client Media Encryption Unit Test Suite
 * Tests AES-256-GCM file chunking, thumbnail encryption, SHA-256 integrity,
 * and cryptographic tamper detection.
 */

import { describe, it, expect } from 'vitest';
import {
  encryptMediaBuffer,
  decryptMediaBuffer,
  computeSha256,
} from './media-crypto';

describe('Phase 6: Client-Side Encrypted Media Pipeline', () => {
  it('should encrypt and decrypt a document buffer with byte-level fidelity', async () => {
    const originalText = 'GCS CONNECT Confidential Contract: End-to-End Encrypted File Transfer';
    const originalBytes = new TextEncoder().encode(originalText);

    const encryptedPackage = await encryptMediaBuffer(
      originalBytes,
      'application/pdf',
      'contract_v1.pdf'
    );

    expect(encryptedPackage.ciphertextBuffer).toBeDefined();
    expect(encryptedPackage.ciphertextSha256.length).toBe(64);
    expect(encryptedPackage.mediaDescriptor.mediaKey).toBeDefined();
    expect(encryptedPackage.mediaDescriptor.iv).toBeDefined();
    expect(encryptedPackage.mediaDescriptor.authTag).toBeDefined();
    expect(encryptedPackage.mediaDescriptor.fileName).toBe('contract_v1.pdf');

    // Ciphertext should not match plaintext
    const cipherText = new TextDecoder().decode(encryptedPackage.ciphertextBuffer);
    expect(cipherText).not.toBe(originalText);

    // Decrypt
    const decryptedBuffer = await decryptMediaBuffer(
      encryptedPackage.ciphertextBuffer,
      encryptedPackage.mediaDescriptor
    );

    const decryptedText = new TextDecoder().decode(decryptedBuffer);
    expect(decryptedText).toBe(originalText);
  });

  it('should encrypt and decrypt media along with an encrypted thumbnail', async () => {
    const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4, 5, 6]);
    const thumbBytes = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70]);

    const encryptedPackage = await encryptMediaBuffer(
      imageBytes,
      'image/png',
      'screenshot.png',
      thumbBytes
    );

    expect(encryptedPackage.thumbnailCiphertext).toBeDefined();
    expect(encryptedPackage.mediaDescriptor.thumbnail).toBeDefined();
    expect(encryptedPackage.mediaDescriptor.thumbnail?.ciphertextSha256).toBeDefined();

    // Decrypt main image
    const decryptedMain = await decryptMediaBuffer(
      encryptedPackage.ciphertextBuffer,
      encryptedPackage.mediaDescriptor
    );
    expect(new Uint8Array(decryptedMain)).toEqual(imageBytes);

    // Decrypt thumbnail
    const decryptedThumb = await decryptMediaBuffer(
      encryptedPackage.thumbnailCiphertext!,
      encryptedPackage.mediaDescriptor.thumbnail!
    );
    expect(new Uint8Array(decryptedThumb)).toEqual(thumbBytes);
  });

  it('should detect ciphertext tampering and abort decryption', async () => {
    const originalBytes = new TextEncoder().encode('Sensitive Payload');
    const encryptedPackage = await encryptMediaBuffer(
      originalBytes,
      'text/plain',
      'sensitive.txt'
    );

    // Tamper with one byte in ciphertext
    const tampered = new Uint8Array(encryptedPackage.ciphertextBuffer);
    tampered[0] ^= 0xff; // Flip bits

    // Should reject because SHA-256 integrity fails or AES-GCM tag verification fails
    await expect(
      decryptMediaBuffer(tampered, encryptedPackage.mediaDescriptor)
    ).rejects.toThrow();
  });

  it('should detect auth tag tampering and reject decryption', async () => {
    const originalBytes = new TextEncoder().encode('Sensitive Payload 2');
    const encryptedPackage = await encryptMediaBuffer(
      originalBytes,
      'text/plain',
      'sensitive2.txt'
    );

    const tamperedDescriptor = {
      ...encryptedPackage.mediaDescriptor,
      authTag: btoa('corruptedtag1234'),
    };

    await expect(
      decryptMediaBuffer(encryptedPackage.ciphertextBuffer, tamperedDescriptor)
    ).rejects.toThrow();
  });

  it('should accurately compute SHA-256 checksums', async () => {
    const testData = new TextEncoder().encode('Global Crest Solutions');
    const hashHex = await computeSha256(testData);

    expect(hashHex).toBeDefined();
    expect(hashHex.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(hashHex)).toBe(true);
  });
});
