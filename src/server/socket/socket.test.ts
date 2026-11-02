/**
 * GCS CONNECT — Real-Time Socket.IO Infrastructure Test Suite
 * Validates JWT handshake authentication, room authorization guards,
 * presence tracking, typing indicators, and message broadcasts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { app, server, io } from '../server';
import prisma from '@/lib/db';
import { signSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { presenceManager } from './presence';

describe('Phase 7: Real-Time Socket.IO Infrastructure', () => {
  let serverUrl: string;
  let aliceToken: string;
  let aliceCookie: string;
  let aliceUserId: string;
  let aliceDeviceId: string;

  let bobToken: string;
  let bobCookie: string;
  let bobUserId: string;
  let bobDeviceId: string;

  let charlieToken: string;
  let charlieUserId: string;

  let conversationId: string;

  let aliceSocket: ClientSocket;
  let bobSocket: ClientSocket;

  beforeAll(async () => {
    await prisma.$connect();

    // 1. Start server on ephemeral port for WebSocket testing
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address() as AddressInfo;
        serverUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    // 2. Create User Alice
    const aliceUser = await prisma.user.create({
      data: {
        email: `alice.socket.${Date.now()}@globalcrestsolutions.com`,
        passwordHash: 'argon2id_placeholder',
        fullName: 'Alice Realtime Lead',
        status: 'ACTIVE',
      },
    });
    aliceUserId = aliceUser.id;

    const aliceDevice = await prisma.device.create({
      data: {
        userId: aliceUserId,
        deviceFingerprint: `alice-socket-fp-${Date.now()}`,
        deviceName: 'Alice Chrome Realtime',
      },
    });
    aliceDeviceId = aliceDevice.id;

    const aliceSession = await prisma.userSession.create({
      data: {
        userId: aliceUserId,
        deviceId: aliceDeviceId,
        sessionTokenHash: `hash-alice-socket-${Date.now()}`,
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
    aliceCookie = `${SESSION_COOKIE_NAME}=${aliceToken}; Path=/; HttpOnly`;

    // 3. Create User Bob
    const bobUser = await prisma.user.create({
      data: {
        email: `bob.socket.${Date.now()}@globalcrestsolutions.com`,
        passwordHash: 'argon2id_placeholder',
        fullName: 'Bob Socket Peer',
        status: 'ACTIVE',
      },
    });
    bobUserId = bobUser.id;

    const bobDevice = await prisma.device.create({
      data: {
        userId: bobUserId,
        deviceFingerprint: `bob-socket-fp-${Date.now()}`,
        deviceName: 'Bob Pixel Realtime',
      },
    });
    bobDeviceId = bobDevice.id;

    const bobSession = await prisma.userSession.create({
      data: {
        userId: bobUserId,
        deviceId: bobDeviceId,
        sessionTokenHash: `hash-bob-socket-${Date.now()}`,
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
    bobCookie = `${SESSION_COOKIE_NAME}=${bobToken}; Path=/; HttpOnly`;

    // 4. Create User Charlie (Unauthorized)
    const charlieUser = await prisma.user.create({
      data: {
        email: `charlie.socket.${Date.now()}@globalcrestsolutions.com`,
        passwordHash: 'argon2id_placeholder',
        fullName: 'Charlie Outsider',
        status: 'ACTIVE',
      },
    });
    charlieUserId = charlieUser.id;

    const charlieDevice = await prisma.device.create({
      data: {
        userId: charlieUserId,
        deviceFingerprint: `charlie-socket-fp-${Date.now()}`,
        deviceName: 'Charlie Device',
      },
    });

    const charlieSession = await prisma.userSession.create({
      data: {
        userId: charlieUserId,
        deviceId: charlieDevice.id,
        sessionTokenHash: `hash-charlie-socket-${Date.now()}`,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    charlieToken = await signSessionToken({
      userId: charlieUserId,
      sessionId: charlieSession.id,
      deviceId: charlieDevice.id,
      email: charlieUser.email,
      roles: ['USER'],
    });

    // 5. Create Direct Conversation between Alice and Bob
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
  });

  afterAll(async () => {
    if (aliceSocket?.connected) aliceSocket.disconnect();
    if (bobSocket?.connected) bobSocket.disconnect();

    // Allow presence disconnection handlers to complete before teardown
    await new Promise((r) => setTimeout(r, 100));

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    if (aliceUserId) await prisma.user.deleteMany({ where: { id: aliceUserId } });
    if (bobUserId) await prisma.user.deleteMany({ where: { id: bobUserId } });
    if (charlieUserId) await prisma.user.deleteMany({ where: { id: charlieUserId } });

    await prisma.$disconnect();
  });

  // --------------------------------------------------------------------------
  // 1. Handshake Authentication Tests
  // --------------------------------------------------------------------------
  it('rejects connection without authentication token', async () => {
    const unauthenticatedSocket = ioClient(serverUrl, {
      transports: ['websocket'],
      reconnection: false,
    });

    const errorPromise = new Promise<string>((resolve) => {
      unauthenticatedSocket.on('connect_error', (err) => {
        resolve(err.message);
      });
    });

    const errMessage = await errorPromise;
    expect(errMessage).toContain('AUTHENTICATION_FAILED');
    expect(unauthenticatedSocket.connected).toBe(false);
    unauthenticatedSocket.disconnect();
  });

  it('rejects connection with invalid token', async () => {
    const invalidSocket = ioClient(serverUrl, {
      auth: { token: 'invalid.bogus.jwt.token' },
      transports: ['websocket'],
      reconnection: false,
    });

    const errorPromise = new Promise<string>((resolve) => {
      invalidSocket.on('connect_error', (err) => {
        resolve(err.message);
      });
    });

    const errMessage = await errorPromise;
    expect(errMessage).toContain('AUTHENTICATION_FAILED');
    expect(invalidSocket.connected).toBe(false);
    invalidSocket.disconnect();
  });

  it('authenticates Alice socket using valid JWT token and marks her ONLINE', async () => {
    aliceSocket = ioClient(serverUrl, {
      auth: { token: aliceToken },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => {
      aliceSocket.on('connect', () => resolve());
    });

    expect(aliceSocket.connected).toBe(true);
    expect(presenceManager.isUserOnline(aliceUserId)).toBe(true);
  });

  it('authenticates Bob socket and confirms presence tracking', async () => {
    bobSocket = ioClient(serverUrl, {
      auth: { token: bobToken },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => {
      bobSocket.on('connect', () => resolve());
    });

    expect(bobSocket.connected).toBe(true);
    expect(presenceManager.isUserOnline(bobUserId)).toBe(true);

    // Query presence
    const queryPromise = new Promise<string[]>((resolve) => {
      bobSocket.emit(
        'presence:query',
        { userIds: [aliceUserId, bobUserId, charlieUserId] },
        (res: { onlineUserIds: string[] }) => {
          resolve(res.onlineUserIds);
        }
      );
    });

    const onlineUsers = await queryPromise;
    expect(onlineUsers).toContain(aliceUserId);
    expect(onlineUsers).toContain(bobUserId);
    expect(onlineUsers).not.toContain(charlieUserId);
  });

  // --------------------------------------------------------------------------
  // 2. Room Authorization Tests
  // --------------------------------------------------------------------------
  it('allows Alice (conversation member) to join conversation room', async () => {
    const joinPromise = new Promise<{ success: boolean; error?: string }>((resolve) => {
      aliceSocket.emit(
        'conversation:join',
        { conversationId },
        (res: { success: boolean; error?: string }) => {
          resolve(res);
        }
      );
    });

    const result = await joinPromise;
    expect(result.success).toBe(true);
  });

  it('allows Bob (conversation member) to join conversation room', async () => {
    const joinPromise = new Promise<{ success: boolean; error?: string }>((resolve) => {
      bobSocket.emit(
        'conversation:join',
        { conversationId },
        (res: { success: boolean; error?: string }) => {
          resolve(res);
        }
      );
    });

    const result = await joinPromise;
    expect(result.success).toBe(true);
  });

  it('strictly blocks Charlie (non-member) from joining conversation room', async () => {
    const charlieSocket = ioClient(serverUrl, {
      auth: { token: charlieToken },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => {
      charlieSocket.on('connect', () => resolve());
    });

    const joinPromise = new Promise<{ success: boolean; error?: string }>((resolve) => {
      charlieSocket.emit(
        'conversation:join',
        { conversationId },
        (res: { success: boolean; error?: string }) => {
          resolve(res);
        }
      );
    });

    const result = await joinPromise;
    expect(result.success).toBe(false);
    expect(result.error).toContain('FORBIDDEN');

    charlieSocket.disconnect();
  });

  // --------------------------------------------------------------------------
  // 3. Typing Indicators
  // --------------------------------------------------------------------------
  it('broadcasts typing:start event to peer in the conversation room', async () => {
    const typingPromise = new Promise<any>((resolve) => {
      bobSocket.once('typing:start', (data) => {
        resolve(data);
      });
    });

    aliceSocket.emit('typing:start', { conversationId });

    const received = await typingPromise;
    expect(received.conversationId).toBe(conversationId);
    expect(received.userId).toBe(aliceUserId);
  });

  it('broadcasts typing:stop event to peer in the conversation room', async () => {
    const stopPromise = new Promise<any>((resolve) => {
      bobSocket.once('typing:stop', (data) => {
        resolve(data);
      });
    });

    aliceSocket.emit('typing:stop', { conversationId });

    const received = await stopPromise;
    expect(received.conversationId).toBe(conversationId);
    expect(received.userId).toBe(aliceUserId);
  });

  // --------------------------------------------------------------------------
  // 4. Real-Time Message Event Distribution
  // --------------------------------------------------------------------------
  it('broadcasts message:new event to room when message is sent via REST API', async () => {
    const messageEventPromise = new Promise<any>((resolve) => {
      bobSocket.once('message:new', (data) => {
        resolve(data);
      });
    });

    // Alice dispatches message via REST API
    const res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Cookie', aliceCookie)
      .send({
        encryptedPayload: 'REALTIME-CIPHERTEXT-BLOB',
        initializationVector: 'IV-REALTIME-12',
        authTag: 'TAG-REALTIME-16',
      });

    expect(res.status).toBe(201);
    const sentMsgId = res.body.message.id;

    const eventData = await messageEventPromise;
    expect(eventData.id).toBe(sentMsgId);
    expect(eventData.conversationId).toBe(conversationId);
    expect(eventData.encryptedPayload).toBe('REALTIME-CIPHERTEXT-BLOB');
    expect(eventData.sender.id).toBe(aliceUserId);
  });

  it('broadcasts receipt:updated event to room when receipt is updated via REST API', async () => {
    // Send message to get message ID
    const sendRes = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Cookie', aliceCookie)
      .send({
        encryptedPayload: 'RECEIPT-TEST-CIPHERTEXT',
        initializationVector: 'IV-12',
        authTag: 'TAG-16',
      });
    const msgId = sendRes.body.message.id;

    const receiptPromise = new Promise<any>((resolve) => {
      aliceSocket.once('receipt:updated', (data) => {
        resolve(data);
      });
    });

    // Bob records READ receipt via REST API
    const receiptRes = await request(app)
      .post(`/api/messages/${msgId}/receipt`)
      .set('Cookie', bobCookie)
      .send({ status: 'READ' });

    expect(receiptRes.status).toBe(200);

    const receiptEvent = await receiptPromise;
    expect(receiptEvent.messageId).toBe(msgId);
    expect(receiptEvent.conversationId).toBe(conversationId);
    expect(receiptEvent.status).toBe('READ');
    expect(receiptEvent.userId).toBe(bobUserId);
  });
});
