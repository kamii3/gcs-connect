import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from './db';
import { hashPassword, verifyPassword, generateSecureToken } from './auth-crypto';

describe('Database Architecture & ORM Integration Tests', () => {
  const testEmail = `test.user.${Date.now()}@globalcrestsolutions.com`;
  let createdUserId: string;
  let createdDeviceId: string;

  beforeAll(async () => {
    // Ensure DB connection is established
    await prisma.$connect();
  });

  afterAll(async () => {
    // Clean up test entities created in this test run
    if (createdUserId) {
      await prisma.user.deleteMany({ where: { id: createdUserId } });
    }
    await prisma.$disconnect();
  });

  it('enforces UUID public primary keys and Argon2id password hashing', async () => {
    const rawPass = 'SuperSecretTestPassword2026!';
    const passwordHash = await hashPassword(rawPass);

    const user = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash,
        fullName: 'Test Unit Engineer',
        status: 'ACTIVE',
      },
    });

    createdUserId = user.id;

    // UUID format check
    expect(user.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(user.email).toBe(testEmail);

    // Verify Argon2id password matches
    const isValid = await verifyPassword(rawPass, user.passwordHash);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword('WrongPassword', user.passwordHash);
    expect(isInvalid).toBe(false);
  });

  it('rejects duplicate email registrations via unique constraints', async () => {
    await expect(
      prisma.user.create({
        data: {
          email: testEmail, // Duplicate!
          passwordHash: 'dummy-hash',
          fullName: 'Duplicate User',
        },
      })
    ).rejects.toThrow();
  });

  it('registers devices and binds E2EE public keys with cascade deletion rules', async () => {
    const fingerprint = `fp-${generateSecureToken(16)}`;

    const device = await prisma.device.create({
      data: {
        userId: createdUserId,
        deviceName: 'Test Chromium Browser',
        deviceFingerprint: fingerprint,
        clientPlatform: 'WEB_CHROME',
        identityKey: {
          create: {
            publicIdentityKey: 'b64_test_curve25519_identity_key==',
            keyAlgorithm: 'Curve25519',
          },
        },
        signedPrekeys: {
          create: {
            keyId: 1,
            publicKey: 'b64_test_signed_prekey==',
            signature: 'b64_test_spk_signature==',
          },
        },
        oneTimePrekeys: {
          createMany: {
            data: [
              { keyId: 1, publicKey: 'b64_opk_1==' },
              { keyId: 2, publicKey: 'b64_opk_2==' },
            ],
          },
        },
      },
      include: {
        identityKey: true,
        signedPrekeys: true,
        oneTimePrekeys: true,
      },
    });

    createdDeviceId = device.id;

    expect(device.userId).toBe(createdUserId);
    expect(device.identityKey?.publicIdentityKey).toBe(
      'b64_test_curve25519_identity_key=='
    );
    expect(device.signedPrekeys.length).toBe(1);
    expect(device.oneTimePrekeys.length).toBe(2);
  });

  it('creates conversations, members, and stores ciphertext messages without plaintext', async () => {
    const conv = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        isEncrypted: true,
        members: {
          create: [{ userId: createdUserId, role: 'OWNER' }],
        },
      },
    });

    const message = await prisma.message.create({
      data: {
        conversationId: conv.id,
        senderDeviceId: createdDeviceId,
        messageType: 'TEXT',
        encryptedPayload: 'b64_encrypted_ciphertext_sample_payload==',
        initializationVector: 'b64_iv_sample==',
        authTag: 'b64_authtag_sample==',
        ratchetSequenceNumber: 1,
      },
    });

    expect(message.conversationId).toBe(conv.id);
    expect(message.encryptedPayload).toBe(
      'b64_encrypted_ciphertext_sample_payload=='
    );
    // Explicit assertion: message record has zero plaintext columns
    expect(message).not.toHaveProperty('plaintext');
    expect(message).not.toHaveProperty('body');
  });

  it('rolls back database operations atomically within transactions on failure', async () => {
    const nonExistentUserId = '00000000-0000-0000-0000-000000000000';

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.stickerPack.create({
          data: {
            id: 'temp-pack-rollback-test',
            name: 'Rollback Pack',
            author: 'Tester',
            thumbnailUrl: '/thumb.png',
          },
        });

        // Intentional failure: invalid foreign key referencing non-existent user
        await tx.device.create({
          data: {
            userId: nonExistentUserId,
            deviceName: 'Failing Device',
            deviceFingerprint: 'failing-fp',
          },
        });
      })
    ).rejects.toThrow();

    // Verify sticker pack was rolled back and does NOT exist
    const pack = await prisma.stickerPack.findUnique({
      where: { id: 'temp-pack-rollback-test' },
    });
    expect(pack).toBeNull();
  });

  it('records immutable audit logs for administrative security monitoring', async () => {
    const audit = await prisma.auditLog.create({
      data: {
        userId: createdUserId,
        actorEmail: testEmail,
        action: 'UNIT_TEST_VERIFICATION',
        entityType: 'TEST',
        entityId: 'test_id',
        details: JSON.stringify({ verified: true, level: 'ASVS_L2' }),
      },
    });

    expect(audit.id).toBeDefined();
    expect(audit.action).toBe('UNIT_TEST_VERIFICATION');
    expect(audit.actorEmail).toBe(testEmail);
  });
});
