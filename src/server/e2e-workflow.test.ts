/**
 * GCS CONNECT — End-to-End Multi-User Integration Workflow
 * Phase 12: Automated Testing Automation
 *
 * Simulates a complete production lifecycle between multiple users:
 * 1. Administrative User Provisioning (Alice & Bob)
 * 2. Device Registration & Cryptographic Key Bundle Enrollment (X3DH)
 * 3. Atomic One-Time Prekey (OPK) Discovery and Consumption
 * 4. Double Ratchet Bidirectional E2EE Message Transmission & Decryption
 * 5. Mutual 60-digit Safety Number Cryptographic Verification
 * 6. Delivery & Read Receipt Synchronization
 * 7. Client-Side Encrypted Media Upload, Streaming & Decryption
 * 8. WebRTC Voice Call Lifecycle (Initiate -> Ringing -> Connect -> DTLS-SRTP -> Hangup)
 * 9. Password Change Session Invalidation Cascade
 * 10. Administrative Compliance & Audit Log Verification
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { AddressInfo } from 'net';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { app, server } from './server';
import prisma from '@/lib/db';
import { ClientCryptoVault } from '@/lib/crypto/storage-vault';
import { MessagingClient } from '@/lib/services/messaging-client';
import { encryptMediaBuffer, decryptMediaBuffer } from '@/lib/crypto/media-crypto';
import { generateSafetyNumber } from '@/lib/crypto/web-crypto';
import { signSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { hashPassword } from '@/lib/auth-crypto';

describe('Phase 12: End-to-End Multi-User Integration Workflow', () => {
  let serverUrl: string;

  // Admin Context
  let adminUserId: string;
  let adminCookie: string;

  // Alice Context
  let aliceUserId: string;
  let aliceDeviceId: string;
  let aliceCookie: string;
  let aliceSocket: ClientSocket;
  let aliceVault: ClientCryptoVault;
  let aliceClient: MessagingClient;

  // Bob Context
  let bobUserId: string;
  let bobDeviceId: string;
  let bobCookie: string;
  let bobSocket: ClientSocket;
  let bobVault: ClientCryptoVault;
  let bobClient: MessagingClient;

  // Shared Session State
  let directConversationId: string;
  let sentMessageId: string;
  let mediaAttachmentId: string;
  let activeCallId: string;

  beforeAll(async () => {
    await prisma.$connect();

    // 1. Start Server on ephemeral port for WebSocket signaling
    await new Promise<void>((resolve) => {
      if (!server.listening) {
        server.listen(0, () => {
          const address = server.address() as AddressInfo;
          serverUrl = `http://127.0.0.1:${address.port}`;
          resolve();
        });
      } else {
        const address = server.address() as AddressInfo;
        serverUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      }
    });

    // 2. Provision Admin Account
    const admin = await prisma.user.create({
      data: {
        email: `e2e.admin.${Date.now()}@globalcrestsolutions.com`,
        passwordHash: await hashPassword('AdminE2EPass2026!'),
        fullName: 'Global Crest Admin',
        status: 'ACTIVE',
        roles: { create: [{ role: 'ADMIN' }, { role: 'SUPER_ADMIN' }] },
      },
    });
    adminUserId = admin.id;

    const adminDevice = await prisma.device.create({
      data: {
        userId: adminUserId,
        deviceFingerprint: `e2e-admin-fp-${Date.now()}`,
        deviceName: 'Admin Console Workstation',
        isActive: true,
      },
    });

    const adminSession = await prisma.userSession.create({
      data: {
        userId: adminUserId,
        deviceId: adminDevice.id,
        sessionTokenHash: 'hash-admin-e2e',
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    const adminToken = await signSessionToken({
      userId: adminUserId,
      sessionId: adminSession.id,
      deviceId: adminDevice.id,
      email: admin.email,
      roles: ['ADMIN', 'SUPER_ADMIN'],
    });
    adminCookie = `${SESSION_COOKIE_NAME}=${adminToken}`;
  });

  afterAll(async () => {
    if (aliceSocket?.connected) aliceSocket.disconnect();
    if (bobSocket?.connected) bobSocket.disconnect();

    await new Promise((r) => setTimeout(r, 100));

    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    if (adminUserId) await prisma.user.deleteMany({ where: { id: adminUserId } });
    if (aliceUserId) await prisma.user.deleteMany({ where: { id: aliceUserId } });
    if (bobUserId) await prisma.user.deleteMany({ where: { id: bobUserId } });

    await prisma.$disconnect();
  });

  // --------------------------------------------------------------------------
  // Step 1: Admin Provisions User Accounts
  // --------------------------------------------------------------------------
  it('Step 1: Admin provisions Alice and Bob accounts via POST /api/admin/users/create', async () => {
    // Create Alice
    const resAlice = await request(app)
      .post('/api/admin/users/create')
      .set('Cookie', adminCookie)
      .send({
        email: `alice.e2e.${Date.now()}@globalcrestsolutions.com`,
        password: 'AliceSecurePassword2026!',
        fullName: 'Alice Engineering Lead',
        role: 'USER',
      });

    expect(resAlice.status).toBe(201);
    aliceUserId = resAlice.body.user.id;

    // Create Bob
    const resBob = await request(app)
      .post('/api/admin/users/create')
      .set('Cookie', adminCookie)
      .send({
        email: `bob.e2e.${Date.now()}@globalcrestsolutions.com`,
        password: 'BobSecurePassword2026!',
        fullName: 'Bob Security Lead',
        role: 'USER',
      });

    expect(resBob.status).toBe(201);
    bobUserId = resBob.body.user.id;
  });

  // --------------------------------------------------------------------------
  // Step 2: Users Authenticate & Establish Physical Device Sessions
  // --------------------------------------------------------------------------
  it('Step 2: Alice and Bob log in and establish authenticated device sessions', async () => {
    // Alice Login
    const aliceUser = await prisma.user.findUnique({ where: { id: aliceUserId } });
    const resLoginAlice = await request(app)
      .post('/api/auth/login')
      .send({
        email: aliceUser?.email,
        password: 'AliceSecurePassword2026!',
        deviceFingerprint: `alice-device-fp-${Date.now()}`,
        deviceName: "Alice MacBook Pro",
      });

    expect(resLoginAlice.status).toBe(200);
    aliceDeviceId = resLoginAlice.body.device.id;
    aliceCookie = resLoginAlice.headers['set-cookie'][0];
    const aliceToken = resLoginAlice.body.token;

    // Bob Login
    const bobUser = await prisma.user.findUnique({ where: { id: bobUserId } });
    const resLoginBob = await request(app)
      .post('/api/auth/login')
      .send({
        email: bobUser?.email,
        password: 'BobSecurePassword2026!',
        deviceFingerprint: `bob-device-fp-${Date.now()}`,
        deviceName: "Bob Linux Workstation",
      });

    expect(resLoginBob.status).toBe(200);
    bobDeviceId = resLoginBob.body.device.id;
    bobCookie = resLoginBob.headers['set-cookie'][0];
    const bobToken = resLoginBob.body.token;

    // Connect real-time sockets
    aliceSocket = ioClient(serverUrl, {
      auth: { token: aliceToken },
      transports: ['websocket'],
      reconnection: false,
    });

    bobSocket = ioClient(serverUrl, {
      auth: { token: bobToken },
      transports: ['websocket'],
      reconnection: false,
    });

    await Promise.all([
      new Promise<void>((r) => aliceSocket.on('connect', () => r())),
      new Promise<void>((r) => bobSocket.on('connect', () => r())),
    ]);
  });

  // --------------------------------------------------------------------------
  // Step 3: Cryptographic Key Enrollment (X3DH Identity & Prekeys)
  // --------------------------------------------------------------------------
  it('Step 3: Alice and Bob enroll X3DH identity keys and prekey inventory', async () => {
    // Alice Key Setup
    aliceVault = new ClientCryptoVault();
    await aliceVault.initialize(aliceDeviceId, 15);
    const aliceOpks = Array.from(aliceVault.oneTimePrekeys.entries()).map(([keyId, pair]) => ({
      keyId,
      publicKey: pair.publicKey,
    }));

    const resAliceKeys = await request(app)
      .post('/api/keys/register')
      .set('Cookie', aliceCookie)
      .send({
        publicIdentityKey: aliceVault.identityKeyPair!.publicKey,
        keyAlgorithm: 'P-256',
        signedPrekey: {
          keyId: aliceVault.signedPrekey!.keyId,
          publicKey: aliceVault.signedPrekey!.keyPair.publicKey,
          signature: aliceVault.signedPrekey!.signature,
        },
        oneTimePrekeys: aliceOpks,
      });

    expect(resAliceKeys.status).toBe(201);
    expect(resAliceKeys.body.success).toBe(true);

    // Bob Key Setup
    bobVault = new ClientCryptoVault();
    await bobVault.initialize(bobDeviceId, 15);
    const bobOpks = Array.from(bobVault.oneTimePrekeys.entries()).map(([keyId, pair]) => ({
      keyId,
      publicKey: pair.publicKey,
    }));

    const resBobKeys = await request(app)
      .post('/api/keys/register')
      .set('Cookie', bobCookie)
      .send({
        publicIdentityKey: bobVault.identityKeyPair!.publicKey,
        keyAlgorithm: 'P-256',
        signedPrekey: {
          keyId: bobVault.signedPrekey!.keyId,
          publicKey: bobVault.signedPrekey!.keyPair.publicKey,
          signature: bobVault.signedPrekey!.signature,
        },
        oneTimePrekeys: bobOpks,
      });

    expect(resBobKeys.status).toBe(201);
    expect(resBobKeys.body.success).toBe(true);

    // Initialize Messaging Clients
    aliceClient = new MessagingClient(aliceVault);
    bobClient = new MessagingClient(bobVault);
  });

  // --------------------------------------------------------------------------
  // Step 4: Conversation Establishment & Prekey Consumption
  // --------------------------------------------------------------------------
  it('Step 4: Establish direct conversation between Alice and Bob', async () => {
    const resConv = await request(app)
      .post('/api/conversations/direct')
      .set('Cookie', aliceCookie)
      .send({ targetUserId: bobUserId });

    expect(resConv.status).toBe(201);
    expect(resConv.body.success).toBe(true);
    directConversationId = resConv.body.conversation.id;

    // Both join real-time room
    await new Promise<void>((resolve) => {
      aliceSocket.emit('conversation:join', { conversationId: directConversationId }, () => resolve());
    });
    await new Promise<void>((resolve) => {
      bobSocket.emit('conversation:join', { conversationId: directConversationId }, () => resolve());
    });
  });

  // --------------------------------------------------------------------------
  // Step 5: Bidirectional E2EE Messaging (Double Ratchet)
  // --------------------------------------------------------------------------
  it('Step 5: Alice encrypts and dispatches message; Bob receives ciphertext, decrypts, and replies', async () => {
    const plaintext1 = 'Hello Bob! This message is end-to-end encrypted with X3DH and Double Ratchet.';

    // Set up socket listener for Bob
    const bobSocketPromise = new Promise<any>((resolve) => {
      bobSocket.once('message:new', (payload) => resolve(payload));
    });

    // 1. Alice prepares Double Ratchet message with X3DH negotiation
    const prepared1 = await aliceClient.prepareDirectMessage(
      bobUserId,
      plaintext1,
      async (targetId) => {
        const bundleRes = await request(app)
          .get(`/api/keys/prekey-bundle/${targetId}`)
          .set('Cookie', aliceCookie);
        return bundleRes.body.bundle;
      }
    );

    // 2. Dispatch to server
    const sendRes = await request(app)
      .post(`/api/conversations/${directConversationId}/messages`)
      .set('Cookie', aliceCookie)
      .send(prepared1.payload);

    expect(sendRes.status).toBe(201);
    sentMessageId = sendRes.body.message.id;

    // 3. Bob receives real-time ciphertext via Socket.IO
    const receivedSocketMsg = await bobSocketPromise;
    expect(receivedSocketMsg.id).toBe(sentMessageId);
    expect(receivedSocketMsg.encryptedPayload).toBe(prepared1.payload.encryptedPayload);

    // 4. Bob decrypts in memory
    const aliceSession = aliceVault.getSession(bobDeviceId);
    const x3dhPayload = {
      senderIdentityKey: aliceVault.identityKeyPair!.publicKey,
      ephemeralKey: aliceSession!.localDHKeyPair.publicKey,
      signedPrekeyId: bobVault.signedPrekey!.keyId,
      oneTimePrekeyId: 1,
    };

    const decrypted1 = await bobClient.decryptMessage(aliceUserId, sendRes.body.message, x3dhPayload);
    expect(decrypted1.plaintext).toBe(plaintext1);

    // 5. Bob sends read receipt
    const receiptRes = await request(app)
      .post(`/api/messages/${sentMessageId}/receipt`)
      .set('Cookie', bobCookie)
      .send({ status: 'READ' });

    expect(receiptRes.status).toBe(200);

    // 6. Bob replies back (DH ratchet step)
    const plaintext2 = 'Acknowledged Alice! Cryptographic ratchet updated.';
    const replyPrepared = await bobClient.prepareDirectMessage(
      aliceUserId,
      plaintext2,
      async (targetId) => {
        const bundleRes = await request(app)
          .get(`/api/keys/prekey-bundle/${targetId}`)
          .set('Cookie', bobCookie);
        return bundleRes.body.bundle;
      }
    );

    const replySendRes = await request(app)
      .post(`/api/conversations/${directConversationId}/messages`)
      .set('Cookie', bobCookie)
      .send(replyPrepared.payload);

    expect(replySendRes.status).toBe(201);

    // 7. Alice decrypts reply
    const decryptedReply = await aliceClient.decryptMessage(bobUserId, replySendRes.body.message);
    expect(decryptedReply.plaintext).toBe(plaintext2);
  });

  // --------------------------------------------------------------------------
  // Step 6: Mutual Safety Number Verification
  // --------------------------------------------------------------------------
  it('Step 6: Alice and Bob compute matching 60-digit safety numbers', async () => {
    const aliceIK = aliceVault.identityKeyPair!.publicKey;
    const bobIK = bobVault.identityKeyPair!.publicKey;

    const safetyNumberAlice = await generateSafetyNumber(aliceIK, bobIK);
    const safetyNumberBob = await generateSafetyNumber(bobIK, aliceIK);

    expect(safetyNumberAlice).toBe(safetyNumberBob);
    expect(safetyNumberAlice.replace(/\s/g, '').length).toBe(60);
  });

  // --------------------------------------------------------------------------
  // Step 7: Client-Side Encrypted Media Attachment Flow
  // --------------------------------------------------------------------------
  it('Step 7: Alice encrypts media client-side, uploads ciphertext, and Bob decrypts it', async () => {
    const rawImageBytes = Buffer.from('CONFIDENTIAL_IMAGE_PIXELS_E2E_TEST_2026', 'utf-8');

    // 1. Client encrypts media with random key
    const encryptedPkg = await encryptMediaBuffer(
      rawImageBytes,
      'image/png',
      'secure-image.png'
    );

    // 2. Upload ciphertext to backend
    const cipherB64 = Buffer.from(encryptedPkg.ciphertextBuffer).toString('base64');
    const uploadRes = await request(app)
      .post('/api/media/upload')
      .set('Cookie', aliceCookie)
      .send({
        messageId: sentMessageId,
        ciphertextBase64: cipherB64,
        encryptedMimeType: btoa('image/png'),
        ciphertextSha256: encryptedPkg.ciphertextSha256,
      });

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.success).toBe(true);
    mediaAttachmentId = uploadRes.body.attachment.id;

    // 3. Bob streams ciphertext from backend
    const streamRes = await request(app)
      .get(`/api/media/${mediaAttachmentId}`)
      .set('Cookie', bobCookie);

    expect(streamRes.status).toBe(200);

    // 4. Bob decrypts client-side using media descriptor
    const decryptedBuffer = await decryptMediaBuffer(
      streamRes.body,
      encryptedPkg.mediaDescriptor
    );

    expect(Buffer.from(decryptedBuffer).toString('utf-8')).toBe('CONFIDENTIAL_IMAGE_PIXELS_E2E_TEST_2026');
  });

  // --------------------------------------------------------------------------
  // Step 8: WebRTC Voice Call Lifecycle
  // --------------------------------------------------------------------------
  it('Step 8: Complete WebRTC voice call lifecycle with Socket.IO signaling', async () => {
    // 1. Bob listens for call:incoming
    const incomingPromise = new Promise<any>((resolve) => {
      bobSocket.once('call:incoming', (payload) => resolve(payload));
    });

    // 2. Alice initiates call
    const initRes = await request(app)
      .post('/api/calls/initiate')
      .set('Cookie', aliceCookie)
      .send({
        conversationId: directConversationId,
        callType: 'VOICE',
      });

    expect(initRes.status).toBe(201);
    activeCallId = initRes.body.call.id;

    const incomingPayload = await incomingPromise;
    expect(incomingPayload.callId).toBe(activeCallId);

    // 3. Bob accepts call
    const respondRes = await request(app)
      .post(`/api/calls/${activeCallId}/respond`)
      .set('Cookie', bobCookie)
      .send({ action: 'ACCEPT' });

    expect(respondRes.status).toBe(200);
    expect(respondRes.body.status).toBe('CONNECTED');

    // 4. Alice relays SDP offer
    const offerPromise = new Promise<any>((resolve) => {
      bobSocket.once('call:offer', (payload) => resolve(payload));
    });

    aliceSocket.emit('call:offer', {
      callId: activeCallId,
      toUserId: bobUserId,
      offer: { type: 'offer', sdp: 'v=0\r\no=alice 100 2 IN IP4 127.0.0.1\r\ns=DTLS-SRTP' },
    });

    const receivedOffer = await offerPromise;
    expect(receivedOffer.callId).toBe(activeCallId);

    // 5. Bob relays SDP answer
    const answerPromise = new Promise<any>((resolve) => {
      aliceSocket.once('call:answer', (payload) => resolve(payload));
    });

    bobSocket.emit('call:answer', {
      callId: activeCallId,
      toUserId: aliceUserId,
      answer: { type: 'answer', sdp: 'v=0\r\no=bob 200 2 IN IP4 127.0.0.1\r\ns=DTLS-SRTP-ANSWER' },
    });

    const receivedAnswer = await answerPromise;
    expect(receivedAnswer.callId).toBe(activeCallId);

    // 6. Alice ends call
    await new Promise((r) => setTimeout(r, 1100)); // wait >1s for duration counter

    const endRes = await request(app)
      .post(`/api/calls/${activeCallId}/end`)
      .set('Cookie', aliceCookie);

    expect(endRes.status).toBe(200);
    expect(endRes.body.durationSeconds).toBeGreaterThanOrEqual(1);

    // 7. Verify in call history
    const historyRes = await request(app)
      .get('/api/calls/history')
      .set('Cookie', aliceCookie);

    expect(historyRes.status).toBe(200);
    const recordedCall = historyRes.body.calls.find((c: any) => c.id === activeCallId);
    expect(recordedCall).toBeDefined();
    expect(recordedCall.status).toBe('COMPLETED');
  });

  // --------------------------------------------------------------------------
  // Step 9: Password Change & Real-Time Session Invalidation
  // --------------------------------------------------------------------------
  it('Step 9: Alice changes password, invalidating all other sessions', async () => {
    // Create second active session for Alice
    const secondSession = await prisma.userSession.create({
      data: {
        userId: aliceUserId,
        deviceId: aliceDeviceId,
        sessionTokenHash: 'hash-alice-second-session',
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    const secondToken = await signSessionToken({
      userId: aliceUserId,
      sessionId: secondSession.id,
      deviceId: aliceDeviceId,
      email: 'alice@test.com',
      roles: ['USER'],
    });

    // Alice changes password
    const changeRes = await request(app)
      .post('/api/auth/password/change')
      .set('Cookie', aliceCookie)
      .send({
        currentPassword: 'AliceSecurePassword2026!',
        newPassword: 'BrandNewAlicePassword2026!#',
      });

    expect(changeRes.status).toBe(200);

    // Second session is now invalidated
    const probeRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${secondToken}`);

    expect(probeRes.status).toBe(401);
    expect(probeRes.body.error).toBe('SESSION_REVOKED');
  });

  // --------------------------------------------------------------------------
  // Step 10: Admin Metrics & Audit Log Trail
  // --------------------------------------------------------------------------
  it('Step 10: Admin reviews metrics and immutable compliance audit trail', async () => {
    // 1. Verify metrics overview
    const metricsRes = await request(app)
      .get('/api/admin/metrics')
      .set('Cookie', adminCookie);

    expect(metricsRes.status).toBe(200);
    expect(metricsRes.body.cryptography.zeroPlaintextGuarantee).toBe(true);
    expect(metricsRes.body.messaging.totalCiphertextMessages).toBeGreaterThanOrEqual(2);
    expect(metricsRes.body.calling.completedCalls).toBeGreaterThanOrEqual(1);

    // 2. Verify audit logs reflect user provisioning
    const auditRes = await request(app)
      .get('/api/admin/audit-logs?action=USER_CREATED_BY_ADMIN')
      .set('Cookie', adminCookie);

    expect(auditRes.status).toBe(200);
    expect(auditRes.body.logs.length).toBeGreaterThanOrEqual(2);
  });
});
