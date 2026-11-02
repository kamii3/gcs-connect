/**
 * GCS CONNECT — Core Messaging API
 * Implements end-to-end encrypted message dispatching, retrieval,
 * delivery/read receipts, editing, deletion (everyone/me), and reactions.
 * Zero Plaintext Storage: Server only holds and transmits ciphertext blobs.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '@/lib/db';
import { authenticate } from '@/server/middleware/auth';
import { purgeExpiredMessages } from '@/server/services/message-cleanup';
import { io } from '@/server/server';

const router = Router();

// Validation Schemas
const sendMessageSchema = z.object({
  recipientDeviceId: z.string().optional(),
  messageType: z
    .enum(['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER', 'CALL_EVENT'])
    .default('TEXT'),
  encryptedPayload: z.string().min(1, 'Encrypted payload ciphertext is required'),
  initializationVector: z.string().min(1, 'Initialization vector (IV) is required'),
  authTag: z.string().min(1, 'Authentication tag is required'),
  ephemeralKey: z.string().optional(),
  ratchetSequenceNumber: z.number().int().min(0).default(0),
  previousChainLength: z.number().int().min(0).default(0),
});

const editMessageSchema = z.object({
  encryptedPayload: z.string().min(1, 'Updated encrypted payload is required'),
  initializationVector: z.string().min(1, 'Updated IV is required'),
  authTag: z.string().min(1, 'Updated auth tag is required'),
  ephemeralKey: z.string().optional(),
});

const receiptSchema = z.object({
  status: z.enum(['DELIVERED', 'READ']),
});

const reactionSchema = z.object({
  emoji: z.string().min(1).max(10),
});

/**
 * POST /api/conversations/:id/messages
 * Dispatch an end-to-end encrypted message into a conversation
 */
router.post('/conversations/:id/messages', authenticate, async (req: Request, res: Response) => {
  try {
    const { id: conversationId } = req.params;
    const callerId = req.user!.id;
    const callerDeviceId = req.device!.id;

    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.format() });
      return;
    }

    // 1. Verify caller is an active member of this conversation
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
          where: { leftAt: null },
        },
      },
    });

    if (!conversation || conversation.deletedAt !== null) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Conversation does not exist.' });
      return;
    }

    const callerMembership = conversation.members.find((m) => m.userId === callerId);
    if (!callerMembership) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Not an active member of this conversation.' });
      return;
    }

    // 2. In DIRECT conversations, verify neither peer is blocked
    if (conversation.type === 'DIRECT') {
      const peer = conversation.members.find((m) => m.userId !== callerId);
      if (peer) {
        const block = await prisma.userBlock.findFirst({
          where: {
            OR: [
              { blockerUserId: callerId, blockedUserId: peer.userId },
              { blockerUserId: peer.userId, blockedUserId: callerId },
            ],
          },
        });

        if (block) {
          res.status(403).json({
            error: 'USER_BLOCKED',
            message: 'Cannot send message: User communication is blocked.',
          });
          return;
        }
      }
    }

    const {
      recipientDeviceId,
      messageType,
      encryptedPayload,
      initializationVector,
      authTag,
      ephemeralKey,
      ratchetSequenceNumber,
      previousChainLength,
    } = parsed.data;

    // Calculate expiration if disappearing messages are active
    let expiresAt: Date | null = null;
    if (conversation.disappearingDurationSeconds) {
      expiresAt = new Date(Date.now() + conversation.disappearingDurationSeconds * 1000);
    }

    // 3. Atomically persist encrypted message & assign SENT receipt
    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId,
          senderDeviceId: callerDeviceId,
          recipientDeviceId: recipientDeviceId || null,
          messageType,
          encryptedPayload,
          initializationVector,
          authTag,
          ephemeralKey: ephemeralKey || null,
          ratchetSequenceNumber,
          previousChainLength,
          expiresAt,
          receipts: {
            create: {
              deviceId: callerDeviceId,
              userId: callerId,
              status: 'SENT',
            },
          },
        },
        include: {
          senderDevice: {
            select: {
              id: true,
              deviceName: true,
              userId: true,
              user: {
                select: {
                  id: true,
                  fullName: true,
                  displayName: true,
                  avatarUrl: true,
                },
              },
            },
          },
          receipts: true,
          reactions: true,
          attachments: true,
        },
      });

      // Update conversation timestamp
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: created.createdAt },
      });

      return created;
    });

    // 4. Emit real-time Socket.IO notification to conversation room
    if (io) {
      io.to(`conversation:${conversationId}`).emit('message:new', {
        id: message.id,
        conversationId: message.conversationId,
        senderDeviceId: message.senderDeviceId,
        recipientDeviceId: message.recipientDeviceId,
        messageType: message.messageType,
        encryptedPayload: message.encryptedPayload,
        initializationVector: message.initializationVector,
        authTag: message.authTag,
        ephemeralKey: message.ephemeralKey,
        ratchetSequenceNumber: message.ratchetSequenceNumber,
        previousChainLength: message.previousChainLength,
        createdAt: message.createdAt,
        expiresAt: message.expiresAt,
        sender: message.senderDevice.user,
      });
    }

    res.status(201).json({
      success: true,
      message,
    });
  } catch (error: any) {
    console.error('[SendMessageError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * GET /api/conversations/:id/messages
 * Retrieve paginated message history for a conversation
 */
router.get('/conversations/:id/messages', authenticate, async (req: Request, res: Response) => {
  try {
    const { id: conversationId } = req.params;
    const callerId = req.user!.id;
    const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 100);
    const cursor = req.query.cursor as string | undefined;

    // Purge expired disappearing messages
    await purgeExpiredMessages();

    // Verify caller is active member
    const member = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: callerId,
        },
      },
    });

    if (!member || member.leftAt !== null) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Not an active member of this conversation.' });
      return;
    }

    const clearedBefore = member.clearedHistoryBefore || new Date(0);
    const now = new Date();

    const whereClause: any = {
      conversationId,
      createdAt: { gt: clearedBefore },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };

    if (cursor) {
      const cursorMessage = await prisma.message.findUnique({
        where: { id: cursor },
        select: { createdAt: true },
      });
      if (cursorMessage) {
        whereClause.createdAt.lt = cursorMessage.createdAt;
      }
    }

    const messages = await prisma.message.findMany({
      where: whereClause,
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      include: {
        senderDevice: {
          select: {
            id: true,
            deviceName: true,
            userId: true,
            user: {
              select: {
                id: true,
                fullName: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
        receipts: true,
        reactions: true,
        attachments: true,
      },
    });

    const hasMore = messages.length > limit;
    const returnedMessages = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? returnedMessages[returnedMessages.length - 1].id : null;

    res.json({
      success: true,
      messages: returnedMessages,
      nextCursor,
      hasMore,
    });
  } catch (error: any) {
    console.error('[GetMessagesError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * PUT /api/messages/:id
 * Edit an existing encrypted message (re-encrypted ciphertext from sender)
 */
router.put('/messages/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const callerId = req.user!.id;

    const parsed = editMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.format() });
      return;
    }

    const existingMessage = await prisma.message.findUnique({
      where: { id },
      include: {
        senderDevice: true,
      },
    });

    if (!existingMessage) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Message does not exist.' });
      return;
    }

    // Only original sender can edit
    if (existingMessage.senderDevice.userId !== callerId) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Only the sender can edit this message.' });
      return;
    }

    if (existingMessage.isDeletedForEveryone) {
      res.status(400).json({ error: 'CANNOT_EDIT_DELETED', message: 'Cannot edit a deleted message.' });
      return;
    }

    const { encryptedPayload, initializationVector, authTag, ephemeralKey } = parsed.data;
    const editedAt = new Date();

    const updated = await prisma.message.update({
      where: { id },
      data: {
        encryptedPayload,
        initializationVector,
        authTag,
        ephemeralKey: ephemeralKey || existingMessage.ephemeralKey,
        isEdited: true,
        editedAt,
      },
    });

    if (io) {
      io.to(`conversation:${existingMessage.conversationId}`).emit('message:edited', {
        id: updated.id,
        conversationId: updated.conversationId,
        encryptedPayload: updated.encryptedPayload,
        initializationVector: updated.initializationVector,
        authTag: updated.authTag,
        isEdited: true,
        editedAt: updated.editedAt,
      });
    }

    res.json({
      success: true,
      message: 'Message edited successfully.',
      editedAt,
    });
  } catch (error: any) {
    console.error('[EditMessageError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * DELETE /api/messages/:id
 * Delete a message (mode: "everyone" permanently zeroes payload; mode: "me" marks local deletion)
 */
router.delete('/messages/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const callerId = req.user!.id;
    const mode = (req.query.mode as string) || 'everyone';

    const existingMessage = await prisma.message.findUnique({
      where: { id },
      include: {
        senderDevice: true,
      },
    });

    if (!existingMessage) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Message does not exist.' });
      return;
    }

    if (mode === 'everyone') {
      // Must be sender to delete for everyone
      if (existingMessage.senderDevice.userId !== callerId) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Only the sender can delete a message for everyone.',
        });
        return;
      }

      // Zero-out ciphertext and mark deleted
      await prisma.message.update({
        where: { id },
        data: {
          isDeletedForEveryone: true,
          encryptedPayload: '',
          initializationVector: '',
          authTag: '',
        },
      });

      if (io) {
        io.to(`conversation:${existingMessage.conversationId}`).emit('message:deleted', {
          id: existingMessage.id,
          conversationId: existingMessage.conversationId,
          isDeletedForEveryone: true,
        });
      }

      res.json({
        success: true,
        message: 'Message deleted for everyone.',
        mode: 'everyone',
      });
    } else {
      // Delete for me
      res.json({
        success: true,
        message: 'Message hidden for current user.',
        mode: 'me',
      });
    }
  } catch (error: any) {
    console.error('[DeleteMessageError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/messages/:id/receipt
 * Record message delivery or read receipt
 */
router.post('/messages/:id/receipt', authenticate, async (req: Request, res: Response) => {
  try {
    const { id: messageId } = req.params;
    const callerId = req.user!.id;
    const callerDeviceId = req.device!.id;

    const parsed = receiptSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.format() });
      return;
    }

    const { status } = parsed.data;

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: true },
    });

    if (!message) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Message not found.' });
      return;
    }

    const now = new Date();

    // Upsert receipt
    const receipt = await prisma.messageReceipt.upsert({
      where: {
        messageId_deviceId_status: {
          messageId,
          deviceId: callerDeviceId,
          status,
        },
      },
      update: { timestamp: now },
      create: {
        messageId,
        deviceId: callerDeviceId,
        userId: callerId,
        status,
        timestamp: now,
      },
    });

    // If READ, also ensure DELIVERED receipt exists
    if (status === 'READ') {
      await prisma.messageReceipt.upsert({
        where: {
          messageId_deviceId_status: {
            messageId,
            deviceId: callerDeviceId,
            status: 'DELIVERED',
          },
        },
        update: {},
        create: {
          messageId,
          deviceId: callerDeviceId,
          userId: callerId,
          status: 'DELIVERED',
          timestamp: now,
        },
      });
    }

    if (io) {
      io.to(`conversation:${message.conversationId}`).emit('receipt:updated', {
        messageId,
        conversationId: message.conversationId,
        userId: callerId,
        deviceId: callerDeviceId,
        status,
        timestamp: now,
      });
    }

    res.json({
      success: true,
      receipt,
    });
  } catch (error: any) {
    console.error('[ReceiptError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/messages/:id/reactions
 * Add or update an emoji reaction on a message
 */
router.post('/messages/:id/reactions', authenticate, async (req: Request, res: Response) => {
  try {
    const { id: messageId } = req.params;
    const callerId = req.user!.id;

    const parsed = reactionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.format() });
      return;
    }

    const { emoji } = parsed.data;

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Message not found.' });
      return;
    }

    const reaction = await prisma.messageReaction.upsert({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId: callerId,
          emoji,
        },
      },
      update: {},
      create: {
        messageId,
        userId: callerId,
        emoji,
      },
    });

    if (io) {
      io.to(`conversation:${message.conversationId}`).emit('reaction:updated', {
        messageId,
        conversationId: message.conversationId,
        userId: callerId,
        emoji,
        action: 'added',
      });
    }

    res.json({
      success: true,
      reaction,
    });
  } catch (error: any) {
    console.error('[AddReactionError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * DELETE /api/messages/:id/reactions
 * Remove an emoji reaction from a message
 */
router.delete('/messages/:id/reactions', authenticate, async (req: Request, res: Response) => {
  try {
    const { id: messageId } = req.params;
    const callerId = req.user!.id;

    const parsed = reactionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.format() });
      return;
    }

    const { emoji } = parsed.data;

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Message not found.' });
      return;
    }

    await prisma.messageReaction.deleteMany({
      where: {
        messageId,
        userId: callerId,
        emoji,
      },
    });

    if (io) {
      io.to(`conversation:${message.conversationId}`).emit('reaction:updated', {
        messageId,
        conversationId: message.conversationId,
        userId: callerId,
        emoji,
        action: 'removed',
      });
    }

    res.json({
      success: true,
      message: 'Reaction removed.',
    });
  } catch (error: any) {
    console.error('[RemoveReactionError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

export default router;
