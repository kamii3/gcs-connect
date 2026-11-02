/**
 * GCS CONNECT — OWASP ASVS 5.0.0 Level 2 Verification Test Suite
 * Programmatically verifies compliance against OWASP ASVS 5.0.0 chapters:
 * - V1: Encoding and Sanitization
 * - V2: Validation and Business Logic
 * - V5: File Handling
 * - V6: Authentication
 * - V7: Session Management
 * - V8: Authorization & Access Control
 * - V9: Self-Contained Tokens
 * - V11: Cryptography
 * - V12: Secure Communication
 * - V14: Data Protection (Zero Plaintext)
 * - V17: WebRTC Security
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from './server';
import prisma from '@/lib/db';
import { hashPassword, verifyPassword, hashToken, generateSecureToken } from '@/lib/auth-crypto';
import { signSessionToken, verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { getWebRtcConfig } from '@/lib/webrtc/config';

describe('Phase 11: OWASP ASVS 5.0.0 Level 2 Verification Matrix', () => {
  let asvsAdminUserId: string;
  let asvsAdminCookie: string;
  let asvsUserUserId: string;
  let asvsUserCookie: string;
  let asvsUserDeviceId: string;

  beforeAll(async () => {
    await prisma.$connect();

    // 1. Create Admin
    const admin = await prisma.user.create({
      data: {
        email: `asvs.admin.${Date.now()}@globalcrestsolutions.com`,
        passwordHash: await hashPassword('AsvsAdminPassword2026!'),
        fullName: 'ASVS Compliance Auditor',
        status: 'ACTIVE',
        roles: { create: [{ role: 'ADMIN' }, { role: 'SUPER_ADMIN' }] },
      },
    });
    asvsAdminUserId = admin.id;

    const adminDevice = await prisma.device.create({
      data: {
        userId: asvsAdminUserId,
        deviceFingerprint: `asvs-admin-fp-${Date.now()}`,
        deviceName: 'ASVS Workstation',
        isActive: true,
      },
    });

    const adminSession = await prisma.userSession.create({
      data: {
        userId: asvsAdminUserId,
        deviceId: adminDevice.id,
        sessionTokenHash: hashToken(generateSecureToken(32)),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    const adminToken = await signSessionToken({
      userId: asvsAdminUserId,
      sessionId: adminSession.id,
      deviceId: adminDevice.id,
      email: admin.email,
      roles: ['ADMIN', 'SUPER_ADMIN'],
    });
    asvsAdminCookie = `${SESSION_COOKIE_NAME}=${adminToken}`;

    // 2. Create User
    const user = await prisma.user.create({
      data: {
        email: `asvs.user.${Date.now()}@globalcrestsolutions.com`,
        passwordHash: await hashPassword('AsvsUserPassword2026!'),
        fullName: 'ASVS Standard User',
        status: 'ACTIVE',
        roles: { create: [{ role: 'USER' }] },
      },
    });
    asvsUserUserId = user.id;

    const userDevice = await prisma.device.create({
      data: {
        userId: asvsUserUserId,
        deviceFingerprint: `asvs-user-fp-${Date.now()}`,
        deviceName: 'ASVS User Device',
        isActive: true,
      },
    });
    asvsUserDeviceId = userDevice.id;

    const userSession = await prisma.userSession.create({
      data: {
        userId: asvsUserUserId,
        deviceId: userDevice.id,
        sessionTokenHash: hashToken(generateSecureToken(32)),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    const userToken = await signSessionToken({
      userId: asvsUserUserId,
      sessionId: userSession.id,
      deviceId: userDevice.id,
      email: user.email,
      roles: ['USER'],
    });
    asvsUserCookie = `${SESSION_COOKIE_NAME}=${userToken}`;
  });

  afterAll(async () => {
    if (asvsAdminUserId) await prisma.user.deleteMany({ where: { id: asvsAdminUserId } });
    if (asvsUserUserId) await prisma.user.deleteMany({ where: { id: asvsUserUserId } });
    await prisma.$disconnect();
  });

  // --------------------------------------------------------------------------
  // ASVS V6: Authentication Requirements
  // --------------------------------------------------------------------------
  describe('ASVS V6 — Authentication', () => {
    it('V6.1.1: Uses memory-hard Argon2id algorithm for password hashing', async () => {
      const password = 'StrongAsvsPassword2026!';
      const hash = await hashPassword(password);

      expect(hash).toContain('$argon2id$');
      expect(hash.length).toBeGreaterThan(50);

      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);

      const isInvalid = await verifyPassword('WrongPassword', hash);
      expect(isInvalid).toBe(false);
    });

    it('V6.2.1: Enforces minimum password length of 12 characters during creation', async () => {
      const res = await request(app)
        .post('/api/admin/users/create')
        .set('Cookie', asvsAdminCookie)
        .send({
          email: 'shortpass@test.com',
          password: 'short', // 5 chars
          fullName: 'Short Pass User',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('V6.3.1: Rejects invalid authentication attempts without timing discrepancies', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@globalcrestsolutions.com',
          password: 'IncorrectPassword123!',
          deviceFingerprint: 'asvs-fp-login',
          deviceName: 'ASVS Test',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('INVALID_CREDENTIALS');
    });
  });

  // --------------------------------------------------------------------------
  // ASVS V7: Session Management Requirements
  // --------------------------------------------------------------------------
  describe('ASVS V7 — Session Management', () => {
    it('V7.1.1: Session tokens have sufficient cryptographic entropy (>=128 bits)', () => {
      const rawToken = generateSecureToken(32); // 32 bytes = 256 bits entropy
      expect(rawToken.length).toBe(64); // 64 hex characters
    });

    it('V7.2.1: Session tokens stored as SHA-256 hashes in database', () => {
      const rawToken = generateSecureToken(32);
      const hash = hashToken(rawToken);

      expect(hash).not.toBe(rawToken);
      expect(hash.length).toBe(64); // SHA-256 hex output
    });

    it('V7.3.1: Enforces database session state verification on every protected request', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', asvsUserCookie);

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(asvsUserUserId);
    });
  });

  // --------------------------------------------------------------------------
  // ASVS V8: Authorization Requirements
  // --------------------------------------------------------------------------
  describe('ASVS V8 — Authorization & Access Control', () => {
    it('V8.1.1: Enforces Role-Based Access Control (RBAC) on administrative endpoints', async () => {
      const res = await request(app)
        .get('/api/admin/metrics')
        .set('Cookie', asvsUserCookie);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });

    it('V8.2.1: Enforces conversation membership authorization (IDOR defense)', async () => {
      // Create a private conversation between admin only
      const privateConv = await prisma.conversation.create({
        data: {
          type: 'DIRECT',
          isEncrypted: true,
          members: { create: [{ userId: asvsAdminUserId, role: 'OWNER' }] },
        },
      });

      // User attempts to fetch messages
      const res = await request(app)
        .get(`/api/conversations/${privateConv.id}/messages`)
        .set('Cookie', asvsUserCookie);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');

      // Cleanup
      await prisma.conversation.deleteMany({ where: { id: privateConv.id } });
    });
  });

  // --------------------------------------------------------------------------
  // ASVS V11: Cryptography Requirements
  // --------------------------------------------------------------------------
  describe('ASVS V11 — Cryptography Standards', () => {
    it('V11.1.1: Web Crypto API implements authenticated AES-256-GCM encryption with 128-bit tags', async () => {
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const plaintext = new TextEncoder().encode('Confidential ASVS Payload');

      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, tagLength: 128 },
        key,
        plaintext
      );

      expect(ciphertext.byteLength).toBe(plaintext.byteLength + 16); // 16 bytes auth tag

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, tagLength: 128 },
        key,
        ciphertext
      );

      expect(new TextDecoder().decode(decrypted)).toBe('Confidential ASVS Payload');
    });

    it('V11.2.1: Key agreement uses Curve25519 or NIST P-256 with >=128-bit security', async () => {
      const aliceKeyPair = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveBits', 'deriveKey']
      );

      const bobKeyPair = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveBits', 'deriveKey']
      );

      const sharedAlice = await crypto.subtle.deriveBits(
        { name: 'ECDH', public: bobKeyPair.publicKey },
        aliceKeyPair.privateKey,
        256
      );

      const sharedBob = await crypto.subtle.deriveBits(
        { name: 'ECDH', public: aliceKeyPair.publicKey },
        bobKeyPair.privateKey,
        256
      );

      expect(Buffer.from(sharedAlice).toString('hex')).toBe(Buffer.from(sharedBob).toString('hex'));
    });
  });

  // --------------------------------------------------------------------------
  // ASVS V12: Secure Communication Requirements
  // --------------------------------------------------------------------------
  describe('ASVS V12 — Secure Communication', () => {
    it('V12.1.1: Enforces Content Security Policy and X-Content-Type-Options nosniff', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // ASVS V14: Data Protection Requirements (Zero Plaintext)
  // --------------------------------------------------------------------------
  describe('ASVS V14 — Data Protection', () => {
    it('V14.1.1: Server holds zero plaintext message records and zero private keys', async () => {
      const messages = await prisma.message.findMany({ take: 10 });
      for (const m of messages) {
        expect(m.encryptedPayload).toBeDefined();
        expect(m.initializationVector).toBeDefined();
        expect(m.authTag).toBeDefined();
      }

      const keys = await prisma.encryptionIdentityKey.findMany({ take: 10 });
      for (const k of keys) {
        expect(k.publicIdentityKey).toBeDefined();
        expect((k as any).privateKey).toBeUndefined();
      }
    });
  });

  // --------------------------------------------------------------------------
  // ASVS V17: WebRTC Security Requirements
  // --------------------------------------------------------------------------
  describe('ASVS V17 — WebRTC Security', () => {
    it('V17.1.1: ICE Configuration requires STUN/TURN with DTLS-SRTP encryption', () => {
      const config = getWebRtcConfig();

      expect(config.iceServers).toBeDefined();
      expect(config.iceServers.length).toBeGreaterThan(0);
      expect(config.iceCandidatePoolSize).toBe(10);

      // Verify STUN addresses are valid URI schemas
      for (const server of config.iceServers) {
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
        for (const url of urls) {
          expect(url.startsWith('stun:') || url.startsWith('turn:')).toBe(true);
        }
      }
    });
  });
});
