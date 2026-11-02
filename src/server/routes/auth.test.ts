import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import prisma from '@/lib/db';
import { SESSION_COOKIE_NAME } from '@/lib/session';

describe('Phase 3: Authentication & Administration API', () => {
  let adminCookie: string;
  let testUserCookie: string;
  let testUserId: string;
  let testSessionId: string;
  const testUserEmail = `engineer.${Date.now()}@globalcrestsolutions.com`;
  const testUserPassword = 'InitialSecurePass2026!';

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (testUserId) {
      await prisma.user.deleteMany({ where: { id: testUserId } });
    }
    await prisma.$disconnect();
  });

  it('authenticates system administrator and sets HttpOnly cookie', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'admin@globalcrestsolutions.com',
      password: 'ChangeMeOnFirstLogin2026!',
      deviceFingerprint: 'admin-console-fp-test',
      deviceName: 'Admin MacBook Pro',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe('admin@globalcrestsolutions.com');
    expect(res.body.user.roles).toContain('SUPER_ADMIN');

    // Verify cookie header
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    adminCookie = cookies[0];
    expect(adminCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(adminCookie.toLowerCase()).toContain('httponly');
    expect(adminCookie.toLowerCase()).toContain('samesite=strict');
  });

  it('rejects login with invalid password using constant-time comparison', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'admin@globalcrestsolutions.com',
      password: 'WrongPassword123!',
      deviceFingerprint: 'random-fp',
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
  });

  it('allows administrator to create a new user account', async () => {
    const res = await request(app)
      .post('/api/admin/users/create')
      .set('Cookie', [adminCookie])
      .send({
        email: testUserEmail,
        password: testUserPassword,
        fullName: 'Test Automation Engineer',
        role: 'USER',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe(testUserEmail.toLowerCase());
    testUserId = res.body.user.id;
  });

  it('allows newly created user to log in and establish device session', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: testUserEmail,
      password: testUserPassword,
      deviceFingerprint: 'test-engineer-device-fp-01',
      deviceName: 'Engineer Linux Workstation',
    });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(testUserEmail.toLowerCase());
    expect(res.body.device.deviceName).toBe('Engineer Linux Workstation');

    const cookies = res.headers['set-cookie'];
    testUserCookie = cookies[0];
    testSessionId = res.body.session.id;
  });

  it('allows authenticated user to retrieve identity context via GET /api/auth/me', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [testUserCookie]);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(testUserId);
    expect(res.body.device.deviceName).toBe('Engineer Linux Workstation');
    expect(res.body.session.id).toBe(testSessionId);
  });

  it('blocks regular user from accessing administrative endpoints with 403 Forbidden', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Cookie', [testUserCookie]);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('allows admin to list users and verify active session counts', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Cookie', [adminCookie]);

    expect(res.status).toBe(200);
    expect(res.body.users).toBeInstanceOf(Array);
    const created = res.body.users.find((u: any) => u.id === testUserId);
    expect(created).toBeDefined();
    expect(created.activeSessionCount).toBeGreaterThanOrEqual(1);
  });

  it('suspends user account and immediately invalidates active sessions', async () => {
    // 1. Admin suspends user
    const suspendRes = await request(app)
      .post(`/api/admin/users/${testUserId}/status`)
      .set('Cookie', [adminCookie])
      .send({ status: 'SUSPENDED', reason: 'Security testing suspension' });

    expect(suspendRes.status).toBe(200);

    // 2. Suspended user's existing session token is now rejected
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [testUserCookie]);

    expect(meRes.status).toBe(401);
    expect(meRes.body.error).toBe('SESSION_REVOKED');

    // 3. Suspended user cannot log in
    const loginRes = await request(app).post('/api/auth/login').send({
      email: testUserEmail,
      password: testUserPassword,
      deviceFingerprint: 'new-device-fp',
    });

    expect(loginRes.status).toBe(403);
    expect(loginRes.body.error).toBe('ACCOUNT_SUSPENDED');
  });

  it('reactivates user account and allows successful login', async () => {
    // Admin reactivates user
    const activateRes = await request(app)
      .post(`/api/admin/users/${testUserId}/status`)
      .set('Cookie', [adminCookie])
      .send({ status: 'ACTIVE' });

    expect(activateRes.status).toBe(200);

    // User logs in again
    const loginRes = await request(app).post('/api/auth/login').send({
      email: testUserEmail,
      password: testUserPassword,
      deviceFingerprint: 'test-engineer-device-fp-01',
    });

    expect(loginRes.status).toBe(200);
    testUserCookie = loginRes.headers['set-cookie'][0];
  });

  it('revokes all other active sessions when user changes password', async () => {
    // 1. Log in from a second device to create a second concurrent session
    const secondLoginRes = await request(app).post('/api/auth/login').send({
      email: testUserEmail,
      password: testUserPassword,
      deviceFingerprint: 'second-phone-device-fp',
      deviceName: 'Test iPhone',
    });
    expect(secondLoginRes.status).toBe(200);
    const secondCookie = secondLoginRes.headers['set-cookie'][0];

    // 2. Change password from first device
    const newPassword = 'BrandNewPassword2026!';
    const changeRes = await request(app)
      .post('/api/auth/password/change')
      .set('Cookie', [testUserCookie])
      .send({
        currentPassword: testUserPassword,
        newPassword,
      });

    expect(changeRes.status).toBe(200);
    expect(changeRes.body.success).toBe(true);

    // 3. First session remains active
    const me1 = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [testUserCookie]);
    expect(me1.status).toBe(200);

    // 4. Second session is revoked
    const me2 = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [secondCookie]);
    expect(me2.status).toBe(401);
    expect(me2.body.error).toBe('SESSION_REVOKED');
  });

  it('logs out user and clears HttpOnly session cookie', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', [testUserCookie]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Subsequent request with that cookie fails
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [testUserCookie]);
    expect(meRes.status).toBe(401);
  });
});
