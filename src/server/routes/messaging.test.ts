/**
 * GCS CONNECT — Core Messaging Engine & History Integration Test Suite
 * Validates 1-to-1 conversations, group chats, Double Ratchet ciphertext transmission,
 * delivery/read receipts, editing, deletion for everyone, reactions,
 * disappearing messages, and privacy blocking.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import prisma from '@/lib/db';
import { ClientCryptoVault } from '@/lib/crypto/storage-vault';
import { MessagingClient } from '@/lib/services/messaging-client';
import { purgeExpiredMessages } from '../services/message-cleanup';
import { signSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';

describe('Phase 5: Core Messaging Engine & History Synchronization', () => {
  let aliceCookie: string;
  let aliceUserId: string;
  let aliceDeviceId: string;
  let aliceVault: ClientCryptoVault;
  let aliceClient: MessagingClient;

  let bobCookie: string;
  let bobUserId: string;
  let bobDeviceId: string;
  let bobVault: ClientCryptoVault;
  let bobClient: MessagingClient;

  let directConversationId: string;
  let groupConversationId: string;
  let sentMessageId: string;

  beforeAll(async () => {
    await prisma.$connect();

    // 1. Create User Alice & Device
    const aliceUser = await prisma.user.create({
      data: {
        email: `alice.messaging.${Date.now()}@globalcrestsolutions.com`,
        passwordHash: 'argon2id_hash_test',
        fullName: 'Alice Messaging Lead',
        status: 'ACTIVE',
      },
    });
    aliceUserId = aliceUser.id;

    const aliceDevice = await prisma.device.create({
      data: {
        userId: aliceUserId,
        deviceFingerprint: `alice-msg-fp-${Date.now()}`,
        deviceName: 'Alice Chrome Laptop',
      },
    });
    aliceDeviceId = aliceDevice.id;

    const aliceSession = await prisma.userSession.create({
      data: {
        userId: aliceUserId,
        deviceId: aliceDeviceId,
        sessionTokenHash: `hash-alice-msg-${Date.now()}`,
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

    aliceVault = new ClientCryptoVault();
    await aliceVault.initialize(aliceDeviceId, 15);
    aliceClient = new MessagingClient(aliceVault);

    // Register Alice Prekeys
    const aliceOpks = Array.from(aliceVault.oneTimePrekeys.entries()).map(([keyId, pair]) => ({
      keyId,
      publicKey: pair.publicKey,
    }));
    await request(app)
      .post('/api/keys/register')
      .set('Cookie', aliceCookie)
      .send({
        publicIdentityKey: aliceVault.identityKeyPair!.publicKey,
        signedPrekey: {
          keyId: aliceVault.signedPrekey!.keyId,
          publicKey: aliceVault.signedPrekey!.keyPair.publicKey,
          signature: aliceVault.signedPrekey!.signature,
        },
        oneTimePrekeys: aliceOpks,
      });

    // 2. Create User Bob & Device
    const bobUser = await prisma.user.create({
      data: {
        email: `bob.messaging.${Date.now()}@globalcrestsolutions.com`,
        passwordHash: 'argon2id_hash_test',
        fullName: 'Bob Security Recipient',
        status: 'ACTIVE',
      },
    });
    bobUserId = bobUser.id;

    const bobDevice = await prisma.device.create({
      data: {
        userId: bobUserId,
        deviceFingerprint: `bob-msg-fp-${Date.now()}`,
        deviceName: 'Bob Pixel 8',
      },
    });
    bobDeviceId = bobDevice.id;

    const bobSession = await prisma.userSession.create({
      data: {
        userId: bobUserId,
        deviceId: bobDeviceId,
        sessionTokenHash: `hash-bob-msg-${Date.now()}`,
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

    bobVault = new ClientCryptoVault();
    await bobVault.initialize(bobDeviceId, 15);
    bobClient = new MessagingClient(bobVault);

    // Register Bob Prekeys
    const bobOpks = Array.from(bobVault.oneTimePrekeys.entries()).map(([keyId, pair]) => ({
      keyId,
      publicKey: pair.publicKey,
    }));
    await request(app)
      .post('/api/keys/register')
      .set('Cookie', bobCookie)
      .send({
        publicIdentityKey: bobVault.identityKeyPair!.publicKey,
        signedPrekey: {
          keyId: bobVault.signedPrekey!.keyId,
          publicKey: bobVault.signedPrekey!.keyPair.publicKey,
          signature: bobVault.signedPrekey!.signature,
        },
        oneTimePrekeys: bobOpks,
      });
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

  // --------------------------------------------------------------------------
  // 1. Conversation Lifecycle Tests
  // --------------------------------------------------------------------------
  it('creates a direct conversation between Alice and Bob', async () => {
    const res = await request(app)
      .post('/api/conversations/direct')
      .set('Cookie', aliceCookie)
      .send({ targetUserId: bobUserId });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.conversation.type).toBe('DIRECT');
    expect(res.body.conversation.members.length).toBe(2);
    expect(res.body.isExisting).toBe(false);

    directConversationId = res.body.conversation.id;
  });

  it('returns the existing conversation when Bob initiates with Alice (idempotent)', async () => {
    const res = await request(app)
      .post('/api/conversations/direct')
      .set('Cookie', bobCookie)
      .send({ targetUserId: aliceUserId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.conversation.id).toBe(directConversationId);
    expect(res.body.isExisting).toBe(true);
  });

  it('creates a multi-user group conversation', async () => {
    const res = await request(app)
      .post('/api/conversations/group')
      .set('Cookie', aliceCookie)
      .send({
        title: 'GCS Engineering Core',
        memberUserIds: [bobUserId],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.conversation.type).toBe('GROUP');
    expect(res.body.conversation.title).toBe('GCS Engineering Core');
    expect(res.body.conversation.members.length).toBe(2);

    groupConversationId = res.body.conversation.id;
  });

  it('lists active conversations with unread counts and pinned status', async () => {
    // Pin direct conversation for Alice
    await request(app)
      .put(`/api/conversations/${directConversationId}/settings`)
      .set('Cookie', aliceCookie)
      .send({ isPinned: true });

    const res = await request(app)
      .get('/api/conversations')
      .set('Cookie', aliceCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.conversations.length).toBe(2);

    // Direct conversation should be first because it is pinned
    expect(res.body.conversations[0].id).toBe(directConversationId);
    expect(res.body.conversations[0].isPinned).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 2. End-to-End Encrypted Messaging Lifecycle
  // --------------------------------------------------------------------------
  it('Alice prepares and dispatches an encrypted Double Ratchet message to Bob', async () => {
    // Alice prepares encrypted message using client service
    const prepared = await aliceClient.prepareDirectMessage(
      bobUserId,
      'Hello Bob, welcome to GCS CONNECT!',
      async (targetId) => {
        const bundleRes = await request(app)
          .get(`/api/keys/prekey-bundle/${targetId}`)
          .set('Cookie', aliceCookie);
        return bundleRes.body.bundle;
      }
    );

    expect(prepared.payload.encryptedPayload).toBeDefined();
    expect(prepared.x3dhPayload).toBeDefined();

    // Post ciphertext to server
    const res = await request(app)
      .post(`/api/conversations/${directConversationId}/messages`)
      .set('Cookie', aliceCookie)
      .send(prepared.payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message.conversationId).toBe(directConversationId);
    expect(res.body.message.senderDeviceId).toBe(aliceDeviceId);
    expect(res.body.message.encryptedPayload).toBe(prepared.payload.encryptedPayload);

    // Strict Zero-Plaintext Verification: No plaintext stored in DB
    const dbRecord = await prisma.message.findUnique({
      where: { id: res.body.message.id },
    });
    expect(dbRecord).not.toBeNull();
    expect(dbRecord?.encryptedPayload).toBe(prepared.payload.encryptedPayload);
    expect((dbRecord as any).plaintext).toBeUndefined();

    sentMessageId = res.body.message.id;
  });

  it('Bob retrieves the ciphertext from server and successfully decrypts it in memory', async () => {
    const listRes = await request(app)
      .get(`/api/conversations/${directConversationId}/messages`)
      .set('Cookie', bobCookie);

    expect(listRes.status).toBe(200);
    expect(listRes.body.messages.length).toBeGreaterThanOrEqual(1);

    const receivedMsg = listRes.body.messages[0];
    expect(receivedMsg.id).toBe(sentMessageId);

    // Get Alice's X3DH payload from session state or bundle
    const aliceSession = aliceVault.getSession(bobDeviceId);
    const x3dhPayload = {
      senderIdentityKey: aliceVault.identityKeyPair!.publicKey,
      ephemeralKey: aliceSession!.localDHKeyPair.publicKey,
      signedPrekeyId: bobVault.signedPrekey!.keyId,
      oneTimePrekeyId: 1, // Consumed OPK
    };

    // Bob decrypts locally in memory
    const decrypted = await bobClient.decryptMessage(aliceUserId, receivedMsg, x3dhPayload);
    expect(decrypted.plaintext).toBe('Hello Bob, welcome to GCS CONNECT!');
    expect(decrypted.isEdited).toBe(false);
    expect(decrypted.isDeletedForEveryone).toBe(false);
  });

  it('Bob records DELIVERED and READ receipts for the received message', async () => {
    // 1. Delivered receipt
    const delRes = await request(app)
      .post(`/api/messages/${sentMessageId}/receipt`)
      .set('Cookie', bobCookie)
      .send({ status: 'DELIVERED' });

    expect(delRes.status).toBe(200);
    expect(delRes.body.receipt.status).toBe('DELIVERED');

    // 2. Read receipt
    const readRes = await request(app)
      .post(`/api/messages/${sentMessageId}/receipt`)
      .set('Cookie', bobCookie)
      .send({ status: 'READ' });

    expect(readRes.status).toBe(200);
    expect(readRes.body.receipt.status).toBe('READ');

    // Verify receipts in database
    const receipts = await prisma.messageReceipt.findMany({
      where: { messageId: sentMessageId },
    });
    expect(receipts.some((r) => r.status === 'SENT')).toBe(true);
    expect(receipts.some((r) => r.status === 'DELIVERED')).toBe(true);
    expect(receipts.some((r) => r.status === 'READ')).toBe(true);
  });

  it('Bob encrypts and dispatches a reply, which Alice successfully decrypts (DH ratchet)', async () => {
    // Bob sends reply to Alice
    const preparedReply = await bobClient.prepareDirectMessage(
      aliceUserId,
      'Hey Alice, end-to-end encryption works flawlessly!',
      async (targetId) => {
        const bundleRes = await request(app)
          .get(`/api/keys/prekey-bundle/${targetId}`)
          .set('Cookie', bobCookie);
        return bundleRes.body.bundle;
      }
    );

    const postRes = await request(app)
      .post(`/api/conversations/${directConversationId}/messages`)
      .set('Cookie', bobCookie)
      .send(preparedReply.payload);

    expect(postRes.status).toBe(201);
    const replyMessageId = postRes.body.message.id;

    // Alice fetches messages
    const aliceFetch = await request(app)
      .get(`/api/conversations/${directConversationId}/messages`)
      .set('Cookie', aliceCookie);

    const replyMsg = aliceFetch.body.messages.find((m: any) => m.id === replyMessageId);
    expect(replyMsg).toBeDefined();

    // Alice decrypts reply
    const decryptedReply = await aliceClient.decryptMessage(bobUserId, replyMsg);
    expect(decryptedReply.plaintext).toBe('Hey Alice, end-to-end encryption works flawlessly!');
  });

  // --------------------------------------------------------------------------
  // 3. Message Editing & Deletion
  // --------------------------------------------------------------------------
  it('allows Alice to edit her sent message with new ciphertext', async () => {
    // Alice re-encrypts updated text
    const session = aliceVault.getSession(bobDeviceId);
    const { encryptRatchetMessage } = await import('@/lib/crypto/double-ratchet');
    const enc = await encryptRatchetMessage(session!, 'Hello Bob, welcome to GCS CONNECT! (edited)');
    aliceVault.saveSession(enc.session);

    const editRes = await request(app)
      .put(`/api/messages/${sentMessageId}`)
      .set('Cookie', aliceCookie)
      .send({
        encryptedPayload: enc.message.ciphertext,
        initializationVector: enc.message.iv,
        authTag: enc.message.authTag,
      });

    expect(editRes.status).toBe(200);
    expect(editRes.body.success).toBe(true);
    expect(editRes.body.editedAt).toBeDefined();

    // Verify DB update
    const updated = await prisma.message.findUnique({ where: { id: sentMessageId } });
    expect(updated?.isEdited).toBe(true);
    expect(updated?.encryptedPayload).toBe(enc.message.ciphertext);
  });

  it('allows Alice to delete her message for everyone (zeroes payload in DB)', async () => {
    const delRes = await request(app)
      .delete(`/api/messages/${sentMessageId}?mode=everyone`)
      .set('Cookie', aliceCookie);

    expect(delRes.status).toBe(200);
    expect(delRes.body.mode).toBe('everyone');

    // Verify DB state
    const deletedInDb = await prisma.message.findUnique({ where: { id: sentMessageId } });
    expect(deletedInDb?.isDeletedForEveryone).toBe(true);
    expect(deletedInDb?.encryptedPayload).toBe('');

    // Bob decrypts deleted message
    const bobDecrypted = await bobClient.decryptMessage(aliceUserId, deletedInDb as any);
    expect(bobDecrypted.isDeletedForEveryone).toBe(true);
    expect(bobDecrypted.plaintext).toBe('This message was deleted.');
  });

  // --------------------------------------------------------------------------
  // 4. Reactions & Disappearing Messages
  // --------------------------------------------------------------------------
  it('supports adding and removing emoji reactions', async () => {
    // Add reaction
    const addRes = await request(app)
      .post(`/api/messages/${sentMessageId}/reactions`)
      .set('Cookie', bobCookie)
      .send({ emoji: '🔐' });

    expect(addRes.status).toBe(200);
    expect(addRes.body.reaction.emoji).toBe('🔐');

    // Remove reaction
    const remRes = await request(app)
      .delete(`/api/messages/${sentMessageId}/reactions`)
      .set('Cookie', bobCookie)
      .send({ emoji: '🔐' });

    expect(remRes.status).toBe(200);
    expect(remRes.body.message).toBe('Reaction removed.');
  });

  it('automatically purges disappearing messages when TTL expires', async () => {
    // Create direct conversation with 1-second disappearing duration
    const testConv = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        disappearingDurationSeconds: 1, // 1 second TTL
        members: {
          create: [
            { userId: aliceUserId, role: 'OWNER' },
            { userId: bobUserId, role: 'MEMBER' },
          ],
        },
      },
    });

    // Send a message into this disappearing conversation
    const sendRes = await request(app)
      .post(`/api/conversations/${testConv.id}/messages`)
      .set('Cookie', aliceCookie)
      .send({
        encryptedPayload: 'DISAPPEARING-CIPHERTEXT',
        initializationVector: 'IV-TEST-1234',
        authTag: 'AUTH-TAG-TEST',
      });

    expect(sendRes.status).toBe(201);
    const disappearingMsgId = sendRes.body.message.id;
    expect(sendRes.body.message.expiresAt).not.toBeNull();

    // Sleep 1.2 seconds to allow TTL expiration
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // Run purge worker
    const purgedCount = await purgeExpiredMessages();
    expect(purgedCount).toBeGreaterThanOrEqual(1);

    // Verify message was deleted from database
    const checkDeleted = await prisma.message.findUnique({
      where: { id: disappearingMsgId },
    });
    expect(checkDeleted).toBeNull();
  });

  // --------------------------------------------------------------------------
  // 5. History Clearing & Privacy Blocking
  // --------------------------------------------------------------------------
  it('allows Bob to clear history and filters out prior messages', async () => {
    const clearRes = await request(app)
      .post(`/api/conversations/${directConversationId}/clear`)
      .set('Cookie', bobCookie);

    expect(clearRes.status).toBe(200);
    expect(clearRes.body.clearedHistoryBefore).toBeDefined();

    // Fetch messages as Bob — messages prior to clear are excluded
    const bobMessages = await request(app)
      .get(`/api/conversations/${directConversationId}/messages`)
      .set('Cookie', bobCookie);

    expect(bobMessages.status).toBe(200);
    expect(bobMessages.body.messages.length).toBe(0);
  });

  it('blocks communication when Alice blocks Bob and rejects message dispatch', async () => {
    // Alice blocks Bob
    const blockRes = await request(app)
      .post('/api/users/block')
      .set('Cookie', aliceCookie)
      .send({ targetUserId: bobUserId, reason: 'Harassment prevention' });

    expect(blockRes.status).toBe(200);
    expect(blockRes.body.success).toBe(true);

    // Bob attempts to send a message to Alice
    const sendAttempt = await request(app)
      .post(`/api/conversations/${directConversationId}/messages`)
      .set('Cookie', bobCookie)
      .send({
        encryptedPayload: 'ATTEMPTED-CIPHERTEXT',
        initializationVector: 'IV',
        authTag: 'TAG',
      });

    expect(sendAttempt.status).toBe(403);
    expect(sendAttempt.body.error).toBe('USER_BLOCKED');

    // Alice unblocks Bob
    const unblockRes = await request(app)
      .delete(`/api/users/block/${bobUserId}`)
      .set('Cookie', aliceCookie);

    expect(unblockRes.status).toBe(200);
  });
});
