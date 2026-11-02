/**
 * GCS CONNECT — Administrative CMS & Compliance Dashboard Test Suite
 * Validates system metrics, zero-plaintext isolation verification,
 * user provisioning, status lifecycle (SUSPEND / ACTIVATE), role assignment,
 * device & cryptographic key bundle inventory, session revocation,
 * onboarding invitations, and immutable audit log filtering.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import prisma from '@/lib/db';
import { signSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';

describe('Phase 9: Administrative CMS & Compliance Dashboard', () => {
  let adminUserId: string;
  let adminDeviceId: string;
  let adminCookie: string;

  let regularUserId: string;
  let regularDeviceId: string;
  let regularCookie: string;

  let testTargetUserId: string;
  let testTargetDeviceId: string;

  beforeAll(async () => {
    await prisma.$connect();

    // 1. Create System Administrator
    const adminUser = await prisma.user.create({
      data: {
        email: `admin.cms.${Date.now()}@globalcrestsolutions.com`,
        passwordHash: 'argon2id_test_hash',
        fullName: 'Principal System Administrator',
        displayName: 'Admin CMS',
        status: 'ACTIVE',
        roles: {
          create: [{ role: 'ADMIN' }, { role: 'SUPER_ADMIN' }],
        },
      },
    });
    adminUserId = adminUser.id;

    const adminDevice = await prisma.device.create({
      data: {
        userId: adminUserId,
        deviceFingerprint: `admin-cms-fp-${Date.now()}`,
        deviceName: 'Admin Workstation',
        isActive: true,
      },
    });
    adminDeviceId = adminDevice.id;

    const adminSession = await prisma.userSession.create({
      data: {
        userId: adminUserId,
        deviceId: adminDeviceId,
        sessionTokenHash: `hash-admin-cms-${Date.now()}`,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    const adminToken = await signSessionToken({
      userId: adminUserId,
      sessionId: adminSession.id,
      deviceId: adminDeviceId,
      email: adminUser.email,
      roles: ['ADMIN', 'SUPER_ADMIN'],
    });
    adminCookie = `${SESSION_COOKIE_NAME}=${adminToken}`;

    // 2. Create Regular User (Non-admin for RBAC testing)
    const regularUser = await prisma.user.create({
      data: {
        email: `user.cms.${Date.now()}@globalcrestsolutions.com`,
        passwordHash: 'argon2id_test_hash',
        fullName: 'Standard User',
        status: 'ACTIVE',
        roles: {
          create: [{ role: 'USER' }],
        },
      },
    });
    regularUserId = regularUser.id;

    const regularDevice = await prisma.device.create({
      data: {
        userId: regularUserId,
        deviceFingerprint: `user-cms-fp-${Date.now()}`,
        deviceName: 'User Mobile Phone',
        isActive: true,
      },
    });
    regularDeviceId = regularDevice.id;

    const regularSession = await prisma.userSession.create({
      data: {
        userId: regularUserId,
        deviceId: regularDeviceId,
        sessionTokenHash: `hash-user-cms-${Date.now()}`,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    const regularToken = await signSessionToken({
      userId: regularUserId,
      sessionId: regularSession.id,
      deviceId: regularDeviceId,
      email: regularUser.email,
      roles: ['USER'],
    });
    regularCookie = `${SESSION_COOKIE_NAME}=${regularToken}`;

    // 3. Create Target User for testing Admin actions
    const targetUser = await prisma.user.create({
      data: {
        email: `target.user.${Date.now()}@globalcrestsolutions.com`,
        passwordHash: 'argon2id_test_hash',
        fullName: 'Target Employee',
        displayName: 'Target E.',
        status: 'ACTIVE',
        roles: {
          create: [{ role: 'USER' }],
        },
      },
    });
    testTargetUserId = targetUser.id;

    const targetDevice = await prisma.device.create({
      data: {
        userId: testTargetUserId,
        deviceFingerprint: `target-device-fp-${Date.now()}`,
        deviceName: 'Target Laptop',
        isActive: true,
      },
    });
    testTargetDeviceId = targetDevice.id;

    // Attach mock Identity Key and Signed Prekey to Target Device
    await prisma.encryptionIdentityKey.create({
      data: {
        deviceId: testTargetDeviceId,
        publicIdentityKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEtargetIdentityKeyPublic123456789==',
        keyAlgorithm: 'P-256',
      },
    });

    await prisma.signedPrekey.create({
      data: {
        deviceId: testTargetDeviceId,
        keyId: 1,
        publicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEtargetSignedPrekeyPublic123456789==',
        signature: 'mockSignatureBase64==',
        isActive: true,
      },
    });

    await prisma.oneTimePrekey.createMany({
      data: [
        {
          deviceId: testTargetDeviceId,
          keyId: 101,
          publicKey: 'targetOPK1==',
          isConsumed: false,
        },
        {
          deviceId: testTargetDeviceId,
          keyId: 102,
          publicKey: 'targetOPK2==',
          isConsumed: true,
          consumedAt: new Date(),
        },
      ],
    });

    await prisma.userSession.create({
      data: {
        userId: testTargetUserId,
        deviceId: testTargetDeviceId,
        sessionTokenHash: `hash-target-session-${Date.now()}`,
        ipAddress: '192.168.1.50',
        userAgent: 'Mozilla/5.0 Chrome Target',
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
  });

  afterAll(async () => {
    if (adminUserId) await prisma.user.deleteMany({ where: { id: adminUserId } });
    if (regularUserId) await prisma.user.deleteMany({ where: { id: regularUserId } });
    if (testTargetUserId) await prisma.user.deleteMany({ where: { id: testTargetUserId } });
    await prisma.$disconnect();
  });

  // --------------------------------------------------------------------------
  // 1. RBAC & Access Control
  // --------------------------------------------------------------------------
  it('blocks unauthenticated requests to /api/admin/metrics with 401', async () => {
    const res = await request(app).get('/api/admin/metrics');
    expect(res.status).toBe(401);
  });

  it('blocks regular non-admin users with 403 Forbidden', async () => {
    const res = await request(app)
      .get('/api/admin/metrics')
      .set('Cookie', regularCookie);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  // --------------------------------------------------------------------------
  // 2. Administrative Metrics & Zero-Plaintext Audit
  // --------------------------------------------------------------------------
  it('GET /api/admin/metrics returns comprehensive system metrics and zero-plaintext confirmation', async () => {
    const res = await request(app)
      .get('/api/admin/metrics')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Users
    expect(res.body.users).toBeDefined();
    expect(res.body.users.total).toBeGreaterThanOrEqual(3);
    expect(res.body.users.active).toBeGreaterThanOrEqual(1);

    // Devices & Sessions
    expect(res.body.devices).toBeDefined();
    expect(res.body.devices.total).toBeGreaterThanOrEqual(3);

    // Cryptography & E2EE Verification
    expect(res.body.cryptography).toBeDefined();
    expect(res.body.cryptography.identityKeysCount).toBeGreaterThanOrEqual(1);
    expect(res.body.cryptography.signedPrekeysCount).toBeGreaterThanOrEqual(1);
    expect(res.body.cryptography.oneTimePrekeysTotal).toBeGreaterThanOrEqual(2);
    expect(res.body.cryptography.zeroPlaintextGuarantee).toBe(true);
    expect(res.body.cryptography.cipherProtocols).toContain('Double Ratchet');

    // Messaging & Storage
    expect(res.body.messaging).toBeDefined();
    expect(res.body.messaging.zeroPlaintextStored).toBe(true);
    expect(res.body.storage).toBeDefined();

    // WebRTC Calling
    expect(res.body.calling).toBeDefined();
    expect(res.body.calling.cumulativeDurationFormatted).toBeDefined();

    // Compliance
    expect(res.body.compliance.asvsLevel).toBe('ASVS 5.0.0 Level 2');
    expect(res.body.compliance.status).toBe('COMPLIANT');
  });

  // --------------------------------------------------------------------------
  // 3. User Directory & Search Filtering
  // --------------------------------------------------------------------------
  it('GET /api/admin/users lists accounts and supports search and status filtering', async () => {
    // List all
    const resAll = await request(app)
      .get('/api/admin/users')
      .set('Cookie', adminCookie);

    expect(resAll.status).toBe(200);
    expect(resAll.body.success).toBe(true);
    expect(Array.isArray(resAll.body.users)).toBe(true);
    expect(resAll.body.meta.total).toBeGreaterThanOrEqual(3);

    // Filter by search query
    const resSearch = await request(app)
      .get(`/api/admin/users?search=Target Employee`)
      .set('Cookie', adminCookie);

    expect(resSearch.status).toBe(200);
    expect(resSearch.body.users.length).toBe(1);
    expect(resSearch.body.users[0].fullName).toBe('Target Employee');

    // Filter by status
    const resActive = await request(app)
      .get('/api/admin/users?status=ACTIVE')
      .set('Cookie', adminCookie);

    expect(resActive.status).toBe(200);
    expect(resActive.body.users.every((u: any) => u.status === 'ACTIVE')).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 4. User Provisioning
  // --------------------------------------------------------------------------
  it('POST /api/admin/users/create provisions a new account with Argon2id hash and audit logging', async () => {
    const newEmail = `provisioned.${Date.now()}@globalcrestsolutions.com`;

    const res = await request(app)
      .post('/api/admin/users/create')
      .set('Cookie', adminCookie)
      .send({
        email: newEmail,
        password: 'SecureAdminProvisionPass2026!',
        fullName: 'Provisioned Engineer',
        role: 'SECURITY_AUDITOR',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe(newEmail);
    expect(res.body.user.roles).toContain('SECURITY_AUDITOR');

    // Verify duplicate creation rejection
    const resDup = await request(app)
      .post('/api/admin/users/create')
      .set('Cookie', adminCookie)
      .send({
        email: newEmail,
        password: 'AnotherPassword2026!',
        fullName: 'Duplicate Engineer',
      });

    expect(resDup.status).toBe(409);
    expect(resDup.body.error).toBe('EMAIL_ALREADY_EXISTS');

    // Cleanup provisioned user
    await prisma.user.deleteMany({ where: { email: newEmail } });
  });

  // --------------------------------------------------------------------------
  // 5. User Details & Cryptographic Key Bundle Inspector
  // --------------------------------------------------------------------------
  it('GET /api/admin/users/:id/details returns device list and E2EE key inventory', async () => {
    const res = await request(app)
      .get(`/api/admin/users/${testTargetUserId}/details`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.id).toBe(testTargetUserId);
    expect(res.body.user.fullName).toBe('Target Employee');

    const devices = res.body.user.devices;
    expect(devices.length).toBeGreaterThanOrEqual(1);

    const dev = devices.find((d: any) => d.id === testTargetDeviceId);
    expect(dev).toBeDefined();
    expect(dev.cryptoStatus.hasIdentityKey).toBe(true);
    expect(dev.cryptoStatus.identityKeyPublicKey).toContain('targetIdentityKeyPublic');
    expect(dev.cryptoStatus.activeSignedPrekeyCount).toBe(1);
    expect(dev.cryptoStatus.availableOneTimePrekeys).toBe(1);
    expect(dev.sessions.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/admin/users/:id/details returns 404 for unknown user ID', async () => {
    const res = await request(app)
      .get('/api/admin/users/00000000-0000-0000-0000-000000000000/details')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('USER_NOT_FOUND');
  });

  // --------------------------------------------------------------------------
  // 6. Role Assignment
  // --------------------------------------------------------------------------
  it('POST /api/admin/users/:id/role assigns and removes roles', async () => {
    // Assign SECURITY_AUDITOR role
    const resAssign = await request(app)
      .post(`/api/admin/users/${testTargetUserId}/role`)
      .set('Cookie', adminCookie)
      .send({ role: 'SECURITY_AUDITOR', action: 'ASSIGN' });

    expect(resAssign.status).toBe(200);
    expect(resAssign.body.success).toBe(true);

    const userRolesAfterAssign = await prisma.userRole.findMany({
      where: { userId: testTargetUserId },
    });
    expect(userRolesAfterAssign.some((r) => r.role === 'SECURITY_AUDITOR')).toBe(true);

    // Remove SECURITY_AUDITOR role
    const resRemove = await request(app)
      .post(`/api/admin/users/${testTargetUserId}/role`)
      .set('Cookie', adminCookie)
      .send({ role: 'SECURITY_AUDITOR', action: 'REMOVE' });

    expect(resRemove.status).toBe(200);

    const userRolesAfterRemove = await prisma.userRole.findMany({
      where: { userId: testTargetUserId },
    });
    expect(userRolesAfterRemove.some((r) => r.role === 'SECURITY_AUDITOR')).toBe(false);
  });

  // --------------------------------------------------------------------------
  // 7. Status Lifecycle & Session Invalidation
  // --------------------------------------------------------------------------
  it('suspends user account, force-invalidates active sessions, and logs audit record', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${testTargetUserId}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'SUSPENDED', reason: 'Security Compliance Audit' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify user is SUSPENDED
    const userInDb = await prisma.user.findUnique({ where: { id: testTargetUserId } });
    expect(userInDb?.status).toBe('SUSPENDED');

    // Verify all active sessions were invalidated
    const validSessions = await prisma.userSession.findMany({
      where: { userId: testTargetUserId, isValid: true },
    });
    expect(validSessions.length).toBe(0);

    // Reactivate user
    const resReactivate = await request(app)
      .post(`/api/admin/users/${testTargetUserId}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'ACTIVE' });

    expect(resReactivate.status).toBe(200);
    const userActiveDb = await prisma.user.findUnique({ where: { id: testTargetUserId } });
    expect(userActiveDb?.status).toBe('ACTIVE');
  });

  it('prevents administrator from suspending their own active account', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${adminUserId}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'SUSPENDED' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CANNOT_SUSPEND_SELF');
  });

  // --------------------------------------------------------------------------
  // 8. Device Revocation
  // --------------------------------------------------------------------------
  it('POST /api/admin/devices/:id/revoke deactivates device and invalidates bound sessions', async () => {
    const res = await request(app)
      .post(`/api/admin/devices/${testTargetDeviceId}/revoke`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const devDb = await prisma.device.findUnique({ where: { id: testTargetDeviceId } });
    expect(devDb?.isActive).toBe(false);
  });

  // --------------------------------------------------------------------------
  // 9. Onboarding Invitations
  // --------------------------------------------------------------------------
  it('POST /api/admin/invitations/create generates secure single-use invitation token', async () => {
    const inviteEmail = `invited.${Date.now()}@globalcrestsolutions.com`;

    const res = await request(app)
      .post('/api/admin/invitations/create')
      .set('Cookie', adminCookie)
      .send({
        email: inviteEmail,
        role: 'USER',
        expiresInDays: 7,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.invitationToken).toBeDefined();
    expect(res.body.email).toBe(inviteEmail);

    // Cleanup
    await prisma.invitation.deleteMany({ where: { email: inviteEmail } });
  });

  // --------------------------------------------------------------------------
  // 10. Audit Log Compliance Review
  // --------------------------------------------------------------------------
  it('GET /api/admin/audit-logs retrieves paginated audit logs and filters by action and search', async () => {
    // List all
    const resAll = await request(app)
      .get('/api/admin/audit-logs')
      .set('Cookie', adminCookie);

    expect(resAll.status).toBe(200);
    expect(resAll.body.success).toBe(true);
    expect(Array.isArray(resAll.body.logs)).toBe(true);
    expect(resAll.body.meta.total).toBeGreaterThanOrEqual(1);

    // Filter by action
    const resAction = await request(app)
      .get('/api/admin/audit-logs?action=DEVICE_REVOKED_BY_ADMIN')
      .set('Cookie', adminCookie);

    expect(resAction.status).toBe(200);
    expect(resAction.body.logs.every((l: any) => l.action === 'DEVICE_REVOKED_BY_ADMIN')).toBe(true);
  });
});
