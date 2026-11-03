/**
 * GCS CONNECT — Encrypted Media Upload & Download Integration Test Suite
 * Validates Zero-Knowledge media storage, authorized streaming, and
 * end-to-end client decryption.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs/promises';
import { app } from '../server';
import prisma from '@/lib/db';
import { encryptMediaBuffer, decryptMediaBuffer } from '@/lib/crypto/media-crypto';
import { signSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';

describe('Phase 6: Encrypted Media & File Sharing API', () => {
  let aliceCookie: string;
  let aliceUserId: string;
  let aliceDeviceId: string;

  let bobCookie: string;
  let bobUserId: string;
  let bobDeviceId: string;

  let charlieCookie: string;
  let charlieUserId: string;

  let conversationId: string;
  let parentMessageId: string;
  let attachmentId: string;

  const originalImageBytes = new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 1, 0,
  ]);
  const originalThumbBytes = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70]);
  let encryptedPackage: any;

  beforeAll(async () => {
    await prisma.$connect();

    // 1. Create Alice
    const aliceUser = await prisma.user.create({
      data: {
        email: `alice.media.${Date.now()}@globalcrestsolutions.com`,
        passwordHash: 'argon2id_placeholder',
        fullName: 'Alice Media Architect',
        status: 'ACTIVE',
      },
    });
    aliceUserId = aliceUser.id;

    const aliceDevice = await prisma.device.create({
      data: {
        userId: aliceUserId,
        deviceFingerprint: `alice-media-fp-${Date.now()}`,
        deviceName: 'Alice Media Laptop',
      },
    });
    aliceDeviceId = aliceDevice.id;

    const aliceSession = await prisma.userSession.create({
      data: {
        userId: aliceUserId,
        deviceId: aliceDeviceId,
        sessionTokenHash: `hash-alice-media-${Date.now()}`,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    const aliceJwt = await signSessionToken({
      userId: aliceUserId,
      sessionId: aliceSession.id,
      deviceId: aliceDeviceId,
      email: aliceUser.email,
      roles: ['USER'],
    });
    aliceCookie = `${SESSION_COOKIE_NAME}=${aliceJwt}; Path=/; HttpOnly`;

    // 2. Create Bob
    const bobUser = await prisma.user.create({
      data: {
        email: `bob.media.${Date.now()}@globalcrestsolutions.com`,
        passwordHash: 'argon2id_placeholder',
        fullName: 'Bob Media Recipient',
        status: 'ACTIVE',
      },
    });
    bobUserId = bobUser.id;

    const bobDevice = await prisma.device.create({
      data: {
        userId: bobUserId,
        deviceFingerprint: `bob-media-fp-${Date.now()}`,
        deviceName: 'Bob Android Tablet',
      },
    });
    bobDeviceId = bobDevice.id;

    const bobSession = await prisma.userSession.create({
      data: {
        userId: bobUserId,
        deviceId: bobDeviceId,
        sessionTokenHash: `hash-bob-media-${Date.now()}`,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    const bobJwt = await signSessionToken({
      userId: bobUserId,
      sessionId: bobSession.id,
      deviceId: bobDeviceId,
      email: bobUser.email,
      roles: ['USER'],
    });
    bobCookie = `${SESSION_COOKIE_NAME}=${bobJwt}; Path=/; HttpOnly`;

    // 3. Create Charlie (Unauthorized Third-Party)
    const charlieUser = await prisma.user.create({
      data: {
        email: `charlie.media.${Date.now()}@globalcrestsolutions.com`,
        passwordHash: 'argon2id_placeholder',
        fullName: 'Charlie Outsider',
        status: 'ACTIVE',
      },
    });
    charlieUserId = charlieUser.id;

    const charlieDevice = await prisma.device.create({
      data: {
        userId: charlieUserId,
        deviceFingerprint: `charlie-fp-${Date.now()}`,
        deviceName: 'Charlie Device',
      },
    });

    const charlieSession = await prisma.userSession.create({
      data: {
        userId: charlieUserId,
        deviceId: charlieDevice.id,
        sessionTokenHash: `hash-charlie-${Date.now()}`,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    const charlieJwt = await signSessionToken({
      userId: charlieUserId,
      sessionId: charlieSession.id,
      deviceId: charlieDevice.id,
      email: charlieUser.email,
      roles: ['USER'],
    });
    charlieCookie = `${SESSION_COOKIE_NAME}=${charlieJwt}; Path=/; HttpOnly`;

    // 4. Create Direct Conversation between Alice and Bob
    const conv = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        isEncrypted: true,
        members: {
          create: [
            { userId: aliceUserId, role: 'OWNER' },
            { userId: bobUserId, role: 'MEMBER' },
          ],
        },
      },
    });
    conversationId = conv.id;

    // 5. Create Parent Message for Media Attachment
    const msg = await prisma.message.create({
      data: {
        conversationId,
        senderDeviceId: aliceDeviceId,
        messageType: 'IMAGE',
        encryptedPayload: 'ENCRYPTED_MEDIA_DESCRIPTOR_PAYLOAD',
        initializationVector: 'IV-TEST-12',
        authTag: 'AUTH-TAG-16',
      },
    });
    parentMessageId = msg.id;

    // Encrypt test file on client
    encryptedPackage = await encryptMediaBuffer(
      originalImageBytes,
      'image/png',
      'blueprint.png',
      originalThumbBytes
    );
  });

  afterAll(async () => {
    if (aliceUserId) await prisma.user.deleteMany({ where: { id: aliceUserId } });
    if (bobUserId) await prisma.user.deleteMany({ where: { id: bobUserId } });
    if (charlieUserId) await prisma.user.deleteMany({ where: { id: charlieUserId } });
    await prisma.$disconnect();
  });

  it('rejects unauthenticated upload attempts', async () => {
    const res = await request(app).post('/api/media/upload').send({});
    expect(res.status).toBe(401);
  });

  it('rejects uploads with invalid SHA-256 integrity hash', async () => {
    const cipherB64 = Buffer.from(encryptedPackage.ciphertextBuffer).toString('base64');
    const res = await request(app)
      .post('/api/media/upload')
      .set('Cookie', aliceCookie)
      .send({
        messageId: parentMessageId,
        ciphertextBase64: cipherB64,
        encryptedMimeType: btoa('image/png'),
        ciphertextSha256: '0000000000000000000000000000000000000000000000000000000000000000', // Invalid SHA
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INTEGRITY_MISMATCH');
  });

  it('allows Alice to upload client-side encrypted media and thumbnail', async () => {
    const cipherB64 = Buffer.from(encryptedPackage.ciphertextBuffer).toString('base64');
    const thumbB64 = Buffer.from(encryptedPackage.thumbnailCiphertext).toString('base64');

    const res = await request(app)
      .post('/api/media/upload')
      .set('Cookie', aliceCookie)
      .send({
        messageId: parentMessageId,
        ciphertextBase64: cipherB64,
        thumbnailCiphertextBase64: thumbB64,
        encryptedMimeType: btoa('image/png'),
        ciphertextSha256: encryptedPackage.ciphertextSha256,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.attachment.id).toBeDefined();
    expect(res.body.attachment.hasThumbnail).toBe(true);
    expect(res.body.attachment.ciphertextSha256).toBe(encryptedPackage.ciphertextSha256);

    attachmentId = res.body.attachment.id;

    // Verify database record
    const dbRecord = await prisma.attachment.findUnique({
      where: { id: attachmentId },
    });
    expect(dbRecord).not.toBeNull();
    expect(dbRecord?.storagePath).toBeDefined();

    // Verify storage file on disk contains ciphertext (not plaintext)
    const diskBytes = await fs.readFile(dbRecord!.storagePath!);
    expect(new Uint8Array(diskBytes)).toEqual(encryptedPackage.ciphertextBuffer);
    expect(new Uint8Array(diskBytes)).not.toEqual(originalImageBytes);
  });

  it('allows Bob (conversation member) to download ciphertext and decrypt in memory', async () => {
    const res = await request(app)
      .get(`/api/media/${attachmentId}`)
      .set('Cookie', bobCookie);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/octet-stream');
    expect(res.headers['x-ciphertext-sha256']).toBe(encryptedPackage.ciphertextSha256);

    const downloadedBytes = new Uint8Array(res.body);
    expect(downloadedBytes.length).toBe(encryptedPackage.ciphertextBuffer.length);

    // Bob decrypts locally in memory using descriptor
    const decryptedBuffer = await decryptMediaBuffer(
      downloadedBytes,
      encryptedPackage.mediaDescriptor
    );

    expect(new Uint8Array(decryptedBuffer)).toEqual(originalImageBytes);
  });

  it('allows Bob to download and decrypt the encrypted thumbnail', async () => {
    const res = await request(app)
      .get(`/api/media/${attachmentId}/thumbnail`)
      .set('Cookie', bobCookie);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/octet-stream');

    const thumbDownloaded = new Uint8Array(res.body);
    const decryptedThumb = await decryptMediaBuffer(
      thumbDownloaded,
      encryptedPackage.mediaDescriptor.thumbnail
    );

    expect(new Uint8Array(decryptedThumb)).toEqual(originalThumbBytes);
  });

  it('strictly blocks Charlie (non-member) from accessing media ciphertext (403 Forbidden)', async () => {
    const res = await request(app)
      .get(`/api/media/${attachmentId}`)
      .set('Cookie', charlieCookie);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('strictly blocks Charlie from accessing thumbnail ciphertext (403 Forbidden)', async () => {
    const res = await request(app)
      .get(`/api/media/${attachmentId}/thumbnail`)
      .set('Cookie', charlieCookie);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('returns 404 for non-existent attachment IDs', async () => {
    const res = await request(app)
      .get('/api/media/00000000-0000-0000-0000-000000000000')
      .set('Cookie', bobCookie);

    expect(res.status).toBe(404);
  });
});
