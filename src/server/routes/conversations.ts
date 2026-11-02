/**
 * GCS CONNECT — Conversations API
 * Handles 1-to-1 direct conversations and multi-user group conversations,
 * membership management, history clearing, and conversation settings.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '@/lib/db';
import { authenticate } from '@/server/middleware/auth';
import { purgeExpiredMessages } from '@/server/services/message-cleanup';
import { io } from '@/server/server';

const router = Router();

// Validation Schemas
const directConversationSchema = z.object({
  targetUserId: z.string().uuid('Valid target user ID is required'),
});

const groupConversationSchema = z.object({
  title: z.string().min(1, 'Group title is required').max(100),
  memberUserIds: z.array(z.string().uuid()).min(1, 'At least one participant required'),
  disappearingDurationSeconds: z.number().int().positive().nullable().optional(),
});

const updateSettingsSchema = z.object({
  isPinned: z.boolean().optional(),
  isMuted: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  title: z.string().min(1).max(100).optional(),
  disappearingDurationSeconds: z.number().int().positive().nullable().optional(),
});

/**
 * POST /api/conversations/direct
 * Create or retrieve an existing direct (1-to-1) conversation
 */
router.post('/direct', authenticate, async (req: Request, res: Response) => {
  try {
    const parsed = directConversationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.format() });
      return;
    }

    const callerId = req.user!.id;
    const { targetUserId } = parsed.data;

    if (callerId === targetUserId) {
      res.status(400).json({
        error: 'SELF_CONVERSATION_PROHIBITED',
        message: 'Cannot initiate a direct conversation with yourself.',
      });
      return;
    }

    // Check if communication is blocked
    const block = await prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerUserId: callerId, blockedUserId: targetUserId },
          { blockerUserId: targetUserId, blockedUserId: callerId },
        ],
      },
    });

    if (block) {
      res.status(403).json({
        error: 'USER_BLOCKED',
        message: 'Direct communication is unavailable due to privacy settings.',
      });
      return;
    }

    // Verify target user exists and is active
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser || targetUser.status !== 'ACTIVE') {
      res.status(404).json({
        error: 'USER_NOT_FOUND',
        message: 'The requested recipient does not exist or is inactive.',
      });
      return;
    }

    // Check for existing active direct conversation between these two users
    const existingConv = await prisma.conversation.findFirst({
      where: {
        type: 'DIRECT',
        deletedAt: null,
        AND: [
          { members: { some: { userId: callerId, leftAt: null } } },
          { members: { some: { userId: targetUserId, leftAt: null } } },
        ],
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                displayName: true,
                email: true,
                avatarUrl: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (existingConv) {
      res.json({
        success: true,
        conversation: existingConv,
        isExisting: true,
      });
      return;
    }

    // Create fresh direct conversation in an atomic transaction
    const newConv = await prisma.$transaction(async (tx) => {
      return tx.conversation.create({
        data: {
          type: 'DIRECT',
          createdByUserId: callerId,
          isEncrypted: true,
          members: {
            create: [
              { userId: callerId, role: 'OWNER' },
              { userId: targetUserId, role: 'MEMBER' },
            ],
          },
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  displayName: true,
                  email: true,
                  avatarUrl: true,
                  status: true,
                },
              },
            },
          },
        },
      });
    });

    res.status(201).json({
      success: true,
      conversation: newConv,
      isExisting: false,
    });
  } catch (error: any) {
    console.error('[DirectConversationError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/conversations/group
 * Create a new multi-user group conversation
 */
router.post('/group', authenticate, async (req: Request, res: Response) => {
  try {
    const parsed = groupConversationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.format() });
      return;
    }

    const callerId = req.user!.id;
    const { title, memberUserIds, disappearingDurationSeconds } = parsed.data;

    // Deduplicate and ensure caller is not in memberUserIds
    const uniqueMembers = Array.from(new Set(memberUserIds.filter((id) => id !== callerId)));

    // Verify all members exist and are active
    const validUsers = await prisma.user.findMany({
      where: {
        id: { in: uniqueMembers },
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    const validUserIds = validUsers.map((u) => u.id);

    const groupConv = await prisma.$transaction(async (tx) => {
      return tx.conversation.create({
        data: {
          type: 'GROUP',
          title,
          createdByUserId: callerId,
          isEncrypted: true,
          disappearingDurationSeconds: disappearingDurationSeconds || null,
          members: {
            create: [
              { userId: callerId, role: 'OWNER' },
              ...validUserIds.map((userId) => ({
                userId,
                role: 'MEMBER',
              })),
            ],
          },
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  displayName: true,
                  email: true,
                  avatarUrl: true,
                  status: true,
                },
              },
            },
          },
        },
      });
    });

    res.status(201).json({
      success: true,
      conversation: groupConv,
    });
  } catch (error: any) {
    console.error('[GroupConversationError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * GET /api/conversations
 * List all active conversations for the authenticated user with unread counts and latest message
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerDeviceId = req.device!.id;

    // Clean up expired disappearing messages first
    await purgeExpiredMessages();

    const memberships = await prisma.conversationMember.findMany({
      where: {
        userId: callerId,
        leftAt: null,
      },
      include: {
        conversation: {
          include: {
            members: {
              where: { leftAt: null },
              include: {
                user: {
                  select: {
                    id: true,
                    fullName: true,
                    displayName: true,
                    email: true,
                    avatarUrl: true,
                    status: true,
                  },
                },
              },
            },
            messages: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                createdAt: true,
                messageType: true,
                isEdited: true,
                isDeletedForEveryone: true,
                senderDeviceId: true,
                senderDevice: {
                  select: {
                    userId: true,
                    deviceName: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Format conversation list with unread counts and pinned status
    const result = await Promise.all(
      memberships.map(async (m) => {
        const conv = m.conversation;
        const clearedBefore = m.clearedHistoryBefore || new Date(0);

        // Calculate unread count (messages after clearedHistoryBefore without a READ receipt for caller)
        const unreadCount = await prisma.message.count({
          where: {
            conversationId: conv.id,
            createdAt: { gt: clearedBefore },
            senderDeviceId: { not: callerDeviceId },
            receipts: {
              none: {
                userId: callerId,
                status: 'READ',
              },
            },
          },
        });

        // Determine title for direct conversations
        let displayTitle = conv.title;
        let displayAvatar = conv.avatarUrl;
        if (conv.type === 'DIRECT') {
          const peer = conv.members.find((member) => member.userId !== callerId);
          displayTitle = peer?.user.fullName || 'Direct Chat';
          displayAvatar = peer?.user.avatarUrl || null;
        }

        const latestMsg = conv.messages[0] || null;

        return {
          id: conv.id,
          type: conv.type,
          title: displayTitle,
          avatarUrl: displayAvatar,
          isEncrypted: conv.isEncrypted,
          disappearingDurationSeconds: conv.disappearingDurationSeconds,
          isPinned: m.isPinned,
          isMuted: m.isMuted,
          isArchived: m.isArchived,
          role: m.role,
          unreadCount,
          members: conv.members.map((member) => ({
            id: member.id,
            userId: member.userId,
            role: member.role,
            fullName: member.user.fullName,
            displayName: member.user.displayName,
            avatarUrl: member.user.avatarUrl,
          })),
          latestMessage: latestMsg
            ? {
                id: latestMsg.id,
                createdAt: latestMsg.createdAt,
                messageType: latestMsg.messageType,
                isEdited: latestMsg.isEdited,
                isDeletedForEveryone: latestMsg.isDeletedForEveryone,
                isFromMe: latestMsg.senderDevice.userId === callerId,
              }
            : null,
          updatedAt: latestMsg ? latestMsg.createdAt : conv.updatedAt,
        };
      })
    );

    // Sort pinned conversations first, then by latest activity
    result.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    res.json({
      success: true,
      conversations: result,
    });
  } catch (error: any) {
    console.error('[ListConversationsError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * GET /api/conversations/:id
 * Retrieve specific conversation details and member roster
 */
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const callerId = req.user!.id;

    const conv = await prisma.conversation.findUnique({
      where: { id },
      include: {
        members: {
          where: { leftAt: null },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                displayName: true,
                email: true,
                avatarUrl: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!conv || conv.deletedAt) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Conversation does not exist.' });
      return;
    }

    const callerMembership = conv.members.find((m) => m.userId === callerId);
    if (!callerMembership) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'You are not a member of this conversation.' });
      return;
    }

    res.json({
      success: true,
      conversation: {
        id: conv.id,
        type: conv.type,
        title: conv.title,
        avatarUrl: conv.avatarUrl,
        isEncrypted: conv.isEncrypted,
        disappearingDurationSeconds: conv.disappearingDurationSeconds,
        membership: {
          role: callerMembership.role,
          isPinned: callerMembership.isPinned,
          isMuted: callerMembership.isMuted,
          isArchived: callerMembership.isArchived,
        },
        members: conv.members.map((m) => ({
          userId: m.userId,
          role: m.role,
          fullName: m.user.fullName,
          displayName: m.user.displayName,
          email: m.user.email,
          avatarUrl: m.user.avatarUrl,
        })),
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('[GetConversationError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * PUT /api/conversations/:id/settings
 * Update member-specific preferences or conversation-level settings
 */
router.put('/:id/settings', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const callerId = req.user!.id;

    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.format() });
      return;
    }

    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: callerId } },
      include: { conversation: true },
    });

    if (!member || member.leftAt !== null) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Not an active member of this conversation.' });
      return;
    }

    const { isPinned, isMuted, isArchived, title, disappearingDurationSeconds } = parsed.data;

    // 1. Update personal membership settings
    const memberUpdates: any = {};
    if (typeof isPinned === 'boolean') memberUpdates.isPinned = isPinned;
    if (typeof isMuted === 'boolean') memberUpdates.isMuted = isMuted;
    if (typeof isArchived === 'boolean') memberUpdates.isArchived = isArchived;

    if (Object.keys(memberUpdates).length > 0) {
      await prisma.conversationMember.update({
        where: { id: member.id },
        data: memberUpdates,
      });
    }

    // 2. Update conversation settings (title or disappearing messages)
    if (title !== undefined || disappearingDurationSeconds !== undefined) {
      const convUpdates: any = {};
      if (title !== undefined) convUpdates.title = title;
      if (disappearingDurationSeconds !== undefined) {
        convUpdates.disappearingDurationSeconds = disappearingDurationSeconds;
      }

      await prisma.conversation.update({
        where: { id },
        data: convUpdates,
      });
    }

    res.json({
      success: true,
      message: 'Conversation settings updated successfully.',
    });
  } catch (error: any) {
    console.error('[UpdateConversationSettingsError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/conversations/:id/clear
 * Clear message history for the caller (local history wipe)
 */
router.post('/:id/clear', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const callerId = req.user!.id;

    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: callerId } },
    });

    if (!member || member.leftAt !== null) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Not an active member of this conversation.' });
      return;
    }

    const now = new Date();
    await prisma.conversationMember.update({
      where: { id: member.id },
      data: { clearedHistoryBefore: now },
    });

    res.json({
      success: true,
      message: 'Conversation history cleared.',
      clearedHistoryBefore: now,
    });
  } catch (error: any) {
    console.error('[ClearConversationError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * DELETE /api/conversations/:id
 * Permanently delete entire conversation and all its messages
 */
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const callerId = req.user!.id;

    // Check membership
    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: callerId } },
    });

    if (!member) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'You are not a member of this conversation.' });
      return;
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { messages: true },
    });

    if (!conversation) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Conversation does not exist.' });
      return;
    }

    const messageIds = conversation.messages.map((m) => m.id);

    await prisma.$transaction(async (tx) => {
      if (messageIds.length > 0) {
        // Delete message attachments
        await tx.attachment.deleteMany({
          where: { messageId: { in: messageIds } },
        });

        // Delete message receipts
        await tx.messageReceipt.deleteMany({
          where: { messageId: { in: messageIds } },
        });

        // Delete message reactions
        await tx.messageReaction.deleteMany({
          where: { messageId: { in: messageIds } },
        });

        // Delete all messages in the conversation
        await tx.message.deleteMany({
          where: { conversationId: id },
        });
      }

      // Delete call records in this conversation if any
      const calls = await tx.call.findMany({ where: { conversationId: id } });
      const callIds = calls.map((c) => c.id);
      if (callIds.length > 0) {
        await tx.callParticipant.deleteMany({ where: { callId: { in: callIds } } });
        await tx.call.deleteMany({ where: { conversationId: id } });
      }

      // Delete conversation members
      await tx.conversationMember.deleteMany({
        where: { conversationId: id },
      });

      // Delete conversation
      await tx.conversation.delete({
        where: { id },
      });
    });

    if (io) {
      io.to(`conversation:${id}`).emit('conversation:deleted', {
        conversationId: id,
        deletedByUserId: callerId,
      });
    }

    res.json({
      success: true,
      message: 'Conversation and all messages were permanently deleted.',
    });
  } catch (error: any) {
    console.error('[DeleteConversationError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * DELETE /api/conversations/:id/leave
 * Leave a group conversation or dismiss a direct conversation
 */
router.delete('/:id/leave', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const callerId = req.user!.id;

    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: callerId } },
    });

    if (!member || member.leftAt !== null) {
      res.status(400).json({ error: 'ALREADY_LEFT', message: 'You are not active in this conversation.' });
      return;
    }

    await prisma.conversationMember.update({
      where: { id: member.id },
      data: { leftAt: new Date() },
    });

    res.json({
      success: true,
      message: 'Successfully departed conversation.',
    });
  } catch (error: any) {
    console.error('[LeaveConversationError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

export default router;
