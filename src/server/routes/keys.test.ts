/**
 * GCS CONNECT — Cryptographic Key API Integration Test Suite
 * Tests Prekey Registration, Atomic One-Time Prekey Acquisition,
 * Replenishment, Safety Number generation, and Encrypted Vault Backups.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import prisma from '@/lib/db';
import { ClientCryptoVault } from '@/lib/crypto/storage-vault';
import { generateSafetyNumber } from '@/lib/crypto/web-crypto';

describe('Phase 4: Cryptographic Key Management & Exchange API', () => {
  let aliceCookie: string;
  let aliceUserId: string;
  let aliceDeviceId: string;
  let aliceVault: ClientCryptoVault;

  let bobCookie: string;
  let bobUserId: string;
  let bobDeviceId: string;
  let bobVault: ClientCryptoVault;

  beforeAll(async () => {
    await prisma.$connect();

    // 1. Create User Alice
    const aliceUser = await prisma.user.create({
      data: {
        email: `alice.${Date.now()}@globalcrestsolutions.com`,
        passwordHash: 'argon2id_placeholder',
        fullName: 'Alice Test Engineer',
        status: 'ACTIVE',
      },
    });
    aliceUserId = aliceUser.id;

    const aliceDevice = await prisma.device.create({
      data: {
        userId: aliceUserId,
        deviceFingerprint: `alice-fingerprint-${Date.now()}`,
        deviceName: 'Alice Chrome Workstation',
        clientPlatform: 'Linux/Chrome',
      },
    });
    aliceDeviceId = aliceDevice.id;

    // Create session for Alice
    const aliceSession = await prisma.userSession.create({
      data: {
        userId: aliceUserId,
        deviceId: aliceDeviceId,
        sessionTokenHash: `hash-alice-${Date.now()}`,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    // Sign JWT token for Alice
    const { signSessionToken, SESSION_COOKIE_NAME } = await import('@/lib/session');
    const aliceJwt = await signSessionToken({
      userId: aliceUserId,
      sessionId: aliceSession.id,
      deviceId: aliceDeviceId,
      email: aliceUser.email,
      roles: ['USER'],
    });
    aliceCookie = `${SESSION_COOKIE_NAME}=${aliceJwt}; Path=/; HttpOnly`;

    // 2. Create User Bob
    const bobUser = await prisma.user.create({
      data: {
        email: `bob.${Date.now()}@globalcrestsolutions.com`,
        passwordHash: 'argon2id_placeholder',
        fullName: 'Bob Security Specialist',
        status: 'ACTIVE',
      },
    });
    bobUserId = bobUser.id;

    const bobDevice = await prisma.device.create({
      data: {
        userId: bobUserId,
        deviceFingerprint: `bob-fingerprint-${Date.now()}`,
        deviceName: 'Bob Android Device',
        clientPlatform: 'Android/Chrome',
      },
    });
    bobDeviceId = bobDevice.id;

    const bobSession = await prisma.userSession.create({
      data: {
        userId: bobUserId,
        deviceId: bobDeviceId,
        sessionTokenHash: `hash-bob-${Date.now()}`,
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

    // Initialize client vaults
    aliceVault = new ClientCryptoVault();
    await aliceVault.initialize(aliceDeviceId, 10);

    bobVault = new ClientCryptoVault();
    await bobVault.initialize(bobDeviceId, 10);
  });

  afterAll(async () => {
    if (aliceUserId) {
      await prisma.user.deleteMany({ where: { id: aliceUserId } });
    }
    if (bobUserId) {
      await prisma.user.deleteMany({ where: { id: bobUserId } });
    }
    await prisma.$disconnect();
  });

  it('rejects unauthenticated requests to key endpoints', async () => {
    const res = await request(app).get('/api/keys/status');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  it('registers Alice cryptographic identity keys and prekey inventory', async () => {
    const opkArray = Array.from(aliceVault.oneTimePrekeys.entries()).map(([keyId, pair]) => ({
      keyId,
      publicKey: pair.publicKey,
    }));

    const res = await request(app)
      .post('/api/keys/register')
      .set('Cookie', aliceCookie)
      .send({
        publicIdentityKey: aliceVault.identityKeyPair!.publicKey,
        keyAlgorithm: 'ECDH-P256',
        signedPrekey: {
          keyId: aliceVault.signedPrekey!.keyId,
          publicKey: aliceVault.signedPrekey!.keyPair.publicKey,
          signature: aliceVault.signedPrekey!.signature,
        },
        oneTimePrekeys: opkArray,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.registeredOpks).toBe(10);
    expect(res.body.deviceId).toBe(aliceDeviceId);
  });

  it('registers Bob cryptographic identity keys and prekey inventory', async () => {
    const opkArray = Array.from(bobVault.oneTimePrekeys.entries()).map(([keyId, pair]) => ({
      keyId,
      publicKey: pair.publicKey,
    }));

    const res = await request(app)
      .post('/api/keys/register')
      .set('Cookie', bobCookie)
      .send({
        publicIdentityKey: bobVault.identityKeyPair!.publicKey,
        keyAlgorithm: 'ECDH-P256',
        signedPrekey: {
          keyId: bobVault.signedPrekey!.keyId,
          publicKey: bobVault.signedPrekey!.keyPair.publicKey,
          signature: bobVault.signedPrekey!.signature,
        },
        oneTimePrekeys: opkArray,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('verifies key status reporting and inventory count', async () => {
    const res = await request(app)
      .get('/api/keys/status')
      .set('Cookie', aliceCookie);

    expect(res.status).toBe(200);
    expect(res.body.isInitialized).toBe(true);
    expect(res.body.identityKeyRegistered).toBe(true);
    expect(res.body.activeOneTimePrekeyCount).toBe(10);
    expect(res.body.signedPrekey).toBeDefined();
    expect(res.body.signedPrekey.keyId).toBe(1);
    expect(res.body.needsReplenishment).toBe(false);
  });

  it('allows Bob to retrieve Alice Prekey Bundle and atomically consumes an OPK', async () => {
    const res = await request(app)
      .get(`/api/keys/prekey-bundle/${aliceUserId}`)
      .set('Cookie', bobCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.bundle).toBeDefined();
    expect(res.body.bundle.userId).toBe(aliceUserId);
    expect(res.body.bundle.deviceId).toBe(aliceDeviceId);
    expect(res.body.bundle.identityKey).toBe(aliceVault.identityKeyPair!.publicKey);
    expect(res.body.bundle.signedPrekey.publicKey).toBe(
      aliceVault.signedPrekey!.keyPair.publicKey
    );
    expect(res.body.bundle.oneTimePrekey).toBeDefined();
    expect(res.body.bundle.oneTimePrekey.keyId).toBe(1);

    // Verify Alice's active OPK count decremented from 10 to 9
    const statusRes = await request(app)
      .get('/api/keys/status')
      .set('Cookie', aliceCookie);

    expect(statusRes.body.activeOneTimePrekeyCount).toBe(9);
  });

  it('atomically consumes the subsequent OPK on next bundle request', async () => {
    const res = await request(app)
      .get(`/api/keys/prekey-bundle/${aliceUserId}`)
      .set('Cookie', bobCookie);

    expect(res.status).toBe(200);
    expect(res.body.bundle.oneTimePrekey.keyId).toBe(2);

    // Verify count decremented to 8
    const statusRes = await request(app)
      .get('/api/keys/status')
      .set('Cookie', aliceCookie);

    expect(statusRes.body.activeOneTimePrekeyCount).toBe(8);
  });

  it('replenishes One-Time Prekeys when inventory decreases', async () => {
    const newOpks = [
      { keyId: 101, publicKey: 'test-replenished-opk-101' },
      { keyId: 102, publicKey: 'test-replenished-opk-102' },
      { keyId: 103, publicKey: 'test-replenished-opk-103' },
    ];

    const res = await request(app)
      .post('/api/keys/prekeys/replenish')
      .set('Cookie', aliceCookie)
      .send({ oneTimePrekeys: newOpks });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.addedCount).toBe(3);
    expect(res.body.totalActiveOpks).toBe(11); // 8 + 3 = 11

    const statusRes = await request(app)
      .get('/api/keys/status')
      .set('Cookie', aliceCookie);

    expect(statusRes.body.activeOneTimePrekeyCount).toBe(11);
  });

  it('returns identity keys for mutual Safety Number verification', async () => {
    const res = await request(app)
      .get(`/api/keys/safety-number/${aliceUserId}`)
      .set('Cookie', bobCookie);

    expect(res.status).toBe(200);
    expect(res.body.targetUserId).toBe(aliceUserId);
    expect(res.body.callerIdentityKey).toBe(bobVault.identityKeyPair!.publicKey);
    expect(res.body.peerIdentityKey).toBe(aliceVault.identityKeyPair!.publicKey);

    // Compute Safety Number and verify format
    const safetyNumber = await generateSafetyNumber(
      res.body.callerIdentityKey,
      res.body.peerIdentityKey
    );
    expect(safetyNumber.replace(/\s/g, '').length).toBe(60);
  });

  it('stores and retrieves encrypted key bundle backup', async () => {
    const backupBlob = 'ENC-BLOB-DATA-V1-AES-GCM-ENCRYPTED';
    const checksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    // Save backup
    const saveRes = await request(app)
      .post('/api/keys/backup')
      .set('Cookie', aliceCookie)
      .send({
        encryptedBackupBlob: backupBlob,
        backupVersion: 1,
        checksumSha256: checksum,
      });

    expect(saveRes.status).toBe(200);
    expect(saveRes.body.success).toBe(true);
    expect(saveRes.body.deviceId).toBe(aliceDeviceId);

    // Retrieve backup
    const getRes = await request(app)
      .get('/api/keys/backup')
      .set('Cookie', aliceCookie);

    expect(getRes.status).toBe(200);
    expect(getRes.body.deviceId).toBe(aliceDeviceId);
    expect(getRes.body.encryptedBackupBlob).toBe(backupBlob);
    expect(getRes.body.checksumSha256).toBe(checksum);
  });
});
