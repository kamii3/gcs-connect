/**
 * GCS CONNECT — WebRTC Voice & Video Calling Test Suite
 * Validates ICE configuration, call initiation, peer busy guards, privacy blocking,
 * call response lifecycle (ACCEPT / DECLINE / BUSY), duration computation,
 * call history retrieval, and real-time Socket.IO WebRTC signaling relay.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AddressInfo } from 'net';
import request from 'supertest';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { app, server } from '../server';
import prisma from '@/lib/db';
import { signSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';

describe('Phase 8: WebRTC 1-to-1 Voice & Video Calling Engine', () => {
  let serverUrl: string;

  let aliceUserId: string;
  let aliceDeviceId: string;
  let aliceToken: string;
  let aliceCookie: string;
  let aliceSocket: ClientSocket;

  let bobUserId: string;
  let bobDeviceId: string;
  let bobToken: string;
  let bobCookie: string;
  let bobSocket: ClientSocket;

  let charlieUserId: string;
  let charlieDeviceId: string;
  let charlieToken: string;
  let charlieCookie: string;
  let charlieSocket: ClientSocket;

  let directConversationId: string;
  let activeCallId: string;

  beforeAll(async () => {
    await prisma.$connect();

    // 1. Start HTTP/WebSocket server on ephemeral port
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

    // 2. Create User Alice & Device
    const aliceUser = await prisma.user.create({
      data: {
        email: `alice.calls.${Date.now()}@globalcrestsolutions.com`,
        passwordHash: 'argon2id_test_hash',
        fullName: 'Alice Calling Lead',
        displayName: 'Alice C.',
        status: 'ACTIVE',
      },
    });
    aliceUserId = aliceUser.id;

    const aliceDevice = await prisma.device.create({
      data: {
        userId: aliceUserId,
        deviceFingerprint: `alice-call-fp-${Date.now()}`,
        deviceName: 'Alice Calling Phone',
        isActive: true,
      },
    });
    aliceDeviceId = aliceDevice.id;

    const aliceSession = await prisma.userSession.create({
      data: {
        userId: aliceUserId,
        deviceId: aliceDeviceId,
        sessionTokenHash: `hash-alice-call-${Date.now()}`,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    aliceToken = await signSessionToken({
      userId: aliceUserId,
      sessionId: aliceSession.id,
      deviceId: aliceDeviceId,
      email: aliceUser.email,
      roles: ['USER'],
    });
    aliceCookie = `${SESSION_COOKIE_NAME}=${aliceToken}`;

    // 3. Create User Bob & Device
    const bobUser = await prisma.user.create({
      data: {
        email: `bob.calls.${Date.now()}@globalcrestsolutions.com`,
        passwordHash: 'argon2id_test_hash',
        fullName: 'Bob Calling Lead',
        displayName: 'Bob C.',
        status: 'ACTIVE',
      },
    });
    bobUserId = bobUser.id;

    const bobDevice = await prisma.device.create({
      data: {
        userId: bobUserId,
        deviceFingerprint: `bob-call-fp-${Date.now()}`,
        deviceName: 'Bob Calling Phone',
        isActive: true,
      },
    });
    bobDeviceId = bobDevice.id;

    const bobSession = await prisma.userSession.create({
      data: {
        userId: bobUserId,
        deviceId: bobDeviceId,
        sessionTokenHash: `hash-bob-call-${Date.now()}`,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    bobToken = await signSessionToken({
      userId: bobUserId,
      sessionId: bobSession.id,
      deviceId: bobDeviceId,
      email: bobUser.email,
      roles: ['USER'],
    });
    bobCookie = `${SESSION_COOKIE_NAME}=${bobToken}`;

    // 4. Create User Charlie (Third party for testing authorization & blocking)
    const charlieUser = await prisma.user.create({
      data: {
        email: `charlie.calls.${Date.now()}@globalcrestsolutions.com`,
        passwordHash: 'argon2id_test_hash',
        fullName: 'Charlie Calling Outsider',
        displayName: 'Charlie O.',
        status: 'ACTIVE',
      },
    });
    charlieUserId = charlieUser.id;

    const charlieDevice = await prisma.device.create({
      data: {
        userId: charlieUserId,
        deviceFingerprint: `charlie-call-fp-${Date.now()}`,
        deviceName: 'Charlie Device',
        isActive: true,
      },
    });
    charlieDeviceId = charlieDevice.id;

    const charlieSession = await prisma.userSession.create({
      data: {
        userId: charlieUserId,
        deviceId: charlieDeviceId,
        sessionTokenHash: `hash-charlie-call-${Date.now()}`,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    charlieToken = await signSessionToken({
      userId: charlieUserId,
      sessionId: charlieSession.id,
      deviceId: charlieDeviceId,
      email: charlieUser.email,
      roles: ['USER'],
    });
    charlieCookie = `${SESSION_COOKIE_NAME}=${charlieToken}`;

    // 5. Create Direct Conversation between Alice and Bob
    const conversation = await prisma.conversation.create({
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
    directConversationId = conversation.id;

    // 6. Connect Alice and Bob to Socket.IO
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

    charlieSocket = ioClient(serverUrl, {
      auth: { token: charlieToken },
      transports: ['websocket'],
      reconnection: false,
    });

    await Promise.all([
      new Promise<void>((r) => aliceSocket.on('connect', () => r())),
      new Promise<void>((r) => bobSocket.on('connect', () => r())),
      new Promise<void>((r) => charlieSocket.on('connect', () => r())),
    ]);
  });

  afterAll(async () => {
    if (aliceSocket?.connected) aliceSocket.disconnect();
    if (bobSocket?.connected) bobSocket.disconnect();
    if (charlieSocket?.connected) charlieSocket.disconnect();

    await new Promise((r) => setTimeout(r, 100));

    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    if (aliceUserId) await prisma.user.deleteMany({ where: { id: aliceUserId } });
    if (bobUserId) await prisma.user.deleteMany({ where: { id: bobUserId } });
    if (charlieUserId) await prisma.user.deleteMany({ where: { id: charlieUserId } });

    await prisma.$disconnect();
  });

  // --------------------------------------------------------------------------
  // 1. WebRTC ICE Server Configuration
  // --------------------------------------------------------------------------
  it('GET /api/calls/config returns 200 OK with STUN/TURN ICE servers', async () => {
    const res = await request(app)
      .get('/api/calls/config')
      .set('Cookie', aliceCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.config).toBeDefined();
    expect(Array.isArray(res.body.config.iceServers)).toBe(true);
    expect(res.body.config.iceServers.length).toBeGreaterThan(0);
    expect(res.body.config.iceServers[0].urls).toContain('stun:');
  });

  it('rejects unauthenticated request to /api/calls/config', async () => {
    const res = await request(app).get('/api/calls/config');
    expect(res.status).toBe(401);
  });

  // --------------------------------------------------------------------------
  // 2. Call Initiation
  // --------------------------------------------------------------------------
  it('rejects initiating call in non-existent conversation with 404', async () => {
    const res = await request(app)
      .post('/api/calls/initiate')
      .set('Cookie', aliceCookie)
      .send({
        conversationId: '00000000-0000-0000-0000-000000000000',
        callType: 'VOICE',
      });

    expect(res.status).toBe(404);
  });

  it('rejects initiating call by non-member with 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/calls/initiate')
      .set('Cookie', charlieCookie)
      .send({
        conversationId: directConversationId,
        callType: 'VOICE',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('initiates voice call successfully and notifies recipient via socket', async () => {
    const incomingPromise = new Promise<any>((resolve) => {
      bobSocket.once('call:incoming', (payload) => {
        resolve(payload);
      });
    });

    const res = await request(app)
      .post('/api/calls/initiate')
      .set('Cookie', aliceCookie)
      .send({
        conversationId: directConversationId,
        callType: 'VOICE',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.call).toBeDefined();
    expect(res.body.call.callType).toBe('VOICE');
    expect(res.body.call.status).toBe('INITIATED');
    expect(res.body.call.initiatorUserId).toBe(aliceUserId);

    activeCallId = res.body.call.id;

    // Verify Bob received the incoming call socket event
    const incomingCall = await incomingPromise;
    expect(incomingCall.callId).toBe(activeCallId);
    expect(incomingCall.initiator.id).toBe(aliceUserId);
  });

  it('rejects initiating second call when peer is already in an active call (409 USER_BUSY)', async () => {
    // Charlie tries to initiate a call with Bob in a new conversation
    const charlieBobConv = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        isEncrypted: true,
        members: {
          create: [
            { userId: charlieUserId, role: 'OWNER' },
            { userId: bobUserId, role: 'MEMBER' },
          ],
        },
      },
    });

    const res = await request(app)
      .post('/api/calls/initiate')
      .set('Cookie', charlieCookie)
      .send({
        conversationId: charlieBobConv.id,
        callType: 'VIDEO',
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('USER_BUSY');
  });

  // --------------------------------------------------------------------------
  // 3. Call Response (ACCEPT / DECLINE / BUSY)
  // --------------------------------------------------------------------------
  it('accepts incoming call and transitions status to CONNECTED', async () => {
    const responsePromise = new Promise<any>((resolve) => {
      aliceSocket.once('call:response', (payload) => {
        resolve(payload);
      });
    });

    const res = await request(app)
      .post(`/api/calls/${activeCallId}/respond`)
      .set('Cookie', bobCookie)
      .send({ action: 'ACCEPT' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('CONNECTED');
    expect(res.body.connectedAt).toBeDefined();

    // Alice should receive socket response event
    const responsePayload = await responsePromise;
    expect(responsePayload.callId).toBe(activeCallId);
    expect(responsePayload.action).toBe('ACCEPT');
    expect(responsePayload.responderUserId).toBe(bobUserId);

    // Verify database record
    const callDb = await prisma.call.findUnique({
      where: { id: activeCallId },
      include: { participants: true },
    });
    expect(callDb?.status).toBe('CONNECTED');
    expect(callDb?.connectedAt).not.toBeNull();
  });

  // --------------------------------------------------------------------------
  // 4. Real-Time WebRTC Socket Signaling (Offer, Answer, ICE, Hangup)
  // --------------------------------------------------------------------------
  it('relays WebRTC SDP offer from Alice to Bob via Socket.IO', async () => {
    const offerPromise = new Promise<any>((resolve) => {
      bobSocket.once('call:offer', (payload) => {
        resolve(payload);
      });
    });

    aliceSocket.emit('call:offer', {
      callId: activeCallId,
      toUserId: bobUserId,
      offer: {
        type: 'offer',
        sdp: 'v=0\r\no=alice 12345 2 IN IP4 127.0.0.1\r\ns=GCS CONNECT DTLS-SRTP...',
      },
    });

    const receivedOffer = await offerPromise;
    expect(receivedOffer.callId).toBe(activeCallId);
    expect(receivedOffer.fromUserId).toBe(aliceUserId);
    expect(receivedOffer.offer.type).toBe('offer');
    expect(receivedOffer.offer.sdp).toContain('GCS CONNECT');
  });

  it('relays WebRTC SDP answer from Bob to Alice via Socket.IO', async () => {
    const answerPromise = new Promise<any>((resolve) => {
      aliceSocket.once('call:answer', (payload) => {
        resolve(payload);
      });
    });

    bobSocket.emit('call:answer', {
      callId: activeCallId,
      toUserId: aliceUserId,
      answer: {
        type: 'answer',
        sdp: 'v=0\r\no=bob 67890 2 IN IP4 127.0.0.1\r\ns=GCS CONNECT DTLS-SRTP ANSWER...',
      },
    });

    const receivedAnswer = await answerPromise;
    expect(receivedAnswer.callId).toBe(activeCallId);
    expect(receivedAnswer.fromUserId).toBe(bobUserId);
    expect(receivedAnswer.answer.type).toBe('answer');
    expect(receivedAnswer.answer.sdp).toContain('DTLS-SRTP ANSWER');
  });

  it('relays WebRTC ICE candidate trickling from Alice to Bob', async () => {
    const candidatePromise = new Promise<any>((resolve) => {
      bobSocket.once('call:ice-candidate', (payload) => {
        resolve(payload);
      });
    });

    aliceSocket.emit('call:ice-candidate', {
      callId: activeCallId,
      toUserId: bobUserId,
      candidate: {
        candidate: 'candidate:1 1 UDP 2122252543 192.168.1.100 50000 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
      },
    });

    const receivedCandidate = await candidatePromise;
    expect(receivedCandidate.callId).toBe(activeCallId);
    expect(receivedCandidate.fromUserId).toBe(aliceUserId);
    expect(receivedCandidate.candidate.candidate).toContain('192.168.1.100');
  });

  it('blocks unauthorized user from injecting signaling into a call they do not belong to', async () => {
    const ackPromise = new Promise<any>((resolve) => {
      charlieSocket.emit(
        'call:offer',
        {
          callId: activeCallId,
          toUserId: bobUserId,
          offer: { type: 'offer', sdp: 'fake' },
        },
        (res: any) => resolve(res)
      );
    });

    const ack = await ackPromise;
    expect(ack.success).toBe(false);
    expect(ack.error).toContain('Unauthorized');
  });

  // --------------------------------------------------------------------------
  // 5. Call Termination & Duration Calculation
  // --------------------------------------------------------------------------
  it('terminates active call, computes duration, and emits call:ended', async () => {
    // Wait 1.1s so duration > 0
    await new Promise((r) => setTimeout(r, 1100));

    const res = await request(app)
      .post(`/api/calls/${activeCallId}/end`)
      .set('Cookie', aliceCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.durationSeconds).toBeGreaterThanOrEqual(1);
    expect(res.body.endedAt).toBeDefined();

    // Verify DB update
    const callDb = await prisma.call.findUnique({
      where: { id: activeCallId },
    });
    expect(callDb?.status).toBe('COMPLETED');
    expect(callDb?.durationSeconds).toBeGreaterThanOrEqual(1);
  });

  it('returns idempotent response if call is already concluded', async () => {
    const res = await request(app)
      .post(`/api/calls/${activeCallId}/end`)
      .set('Cookie', bobCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('already concluded');
  });

  // --------------------------------------------------------------------------
  // 6. Call History Retrieval
  // --------------------------------------------------------------------------
  it('GET /api/calls/history returns completed call in chronological history', async () => {
    const res = await request(app)
      .get('/api/calls/history')
      .set('Cookie', aliceCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.calls)).toBe(true);

    const callRecord = res.body.calls.find((c: any) => c.id === activeCallId);
    expect(callRecord).toBeDefined();
    expect(callRecord.status).toBe('COMPLETED');
    expect(callRecord.callType).toBe('VOICE');
    expect(callRecord.isOutgoing).toBe(true);
    expect(callRecord.durationSeconds).toBeGreaterThanOrEqual(1);
    expect(callRecord.initiator.fullName).toBe('Alice Calling Lead');
  });

  // --------------------------------------------------------------------------
  // 7. Privacy: Blocking Blocks Call Initiation
  // --------------------------------------------------------------------------
  it('blocks call initiation if caller is blocked by peer (403 USER_BLOCKED)', async () => {
    // Bob blocks Alice
    await prisma.userBlock.create({
      data: {
        blockerUserId: bobUserId,
        blockedUserId: aliceUserId,
        reason: 'Testing call blocking',
      },
    });

    const res = await request(app)
      .post('/api/calls/initiate')
      .set('Cookie', aliceCookie)
      .send({
        conversationId: directConversationId,
        callType: 'VIDEO',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('USER_BLOCKED');

    // Clean up block
    await prisma.userBlock.deleteMany({
      where: { blockerUserId: bobUserId, blockedUserId: aliceUserId },
    });
  });

  // --------------------------------------------------------------------------
  // 8. Call Rejection (DECLINE)
  // --------------------------------------------------------------------------
  it('declines incoming call and transitions status to REJECTED', async () => {
    // Alice initiates a new call
    const initiateRes = await request(app)
      .post('/api/calls/initiate')
      .set('Cookie', aliceCookie)
      .send({
        conversationId: directConversationId,
        callType: 'VIDEO',
      });

    const callToDeclineId = initiateRes.body.call.id;

    // Bob declines
    const declineRes = await request(app)
      .post(`/api/calls/${callToDeclineId}/respond`)
      .set('Cookie', bobCookie)
      .send({ action: 'DECLINE' });

    expect(declineRes.status).toBe(200);
    expect(declineRes.body.status).toBe('REJECTED');

    const callDb = await prisma.call.findUnique({
      where: { id: callToDeclineId },
    });
    expect(callDb?.status).toBe('REJECTED');
    expect(callDb?.endedAt).not.toBeNull();
  });
});
