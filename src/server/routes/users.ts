/**
 * GCS CONNECT — Users, Privacy & Directory API
 * Handles user blocking/unblocking, privacy boundaries, and user discovery.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '@/lib/db';
import { authenticate } from '@/server/middleware/auth';

const router = Router();

const blockUserSchema = z.object({
  targetUserId: z.string().uuid('Valid user ID is required'),
  reason: z.string().max(255).optional(),
});

/**
 * POST /api/users/block
 * Block a user to prevent incoming messages, calls, and discovery
 */
router.post('/block', authenticate, async (req: Request, res: Response) => {
  try {
    const callerId = req.user!.id;
    const parsed = blockUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.format() });
      return;
    }

    const { targetUserId, reason } = parsed.data;

    if (callerId === targetUserId) {
      res.status(400).json({ error: 'CANNOT_BLOCK_SELF', message: 'You cannot block your own account.' });
      return;
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Target user does not exist.' });
      return;
    }

    await prisma.userBlock.upsert({
      where: {
        blockerUserId_blockedUserId: {
          blockerUserId: callerId,
          blockedUserId: targetUserId,
        },
      },
      update: { reason: reason || null },
      create: {
        blockerUserId: callerId,
        blockedUserId: targetUserId,
        reason: reason || null,
      },
    });

    res.json({
      success: true,
      message: `User ${targetUser.fullName} has been blocked.`,
    });
  } catch (error: any) {
    console.error('[BlockUserError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * DELETE /api/users/block/:targetUserId
 * Unblock a previously blocked user
 */
router.delete('/block/:targetUserId', authenticate, async (req: Request, res: Response) => {
  try {
    const callerId = req.user!.id;
    const { targetUserId } = req.params;

    await prisma.userBlock.deleteMany({
      where: {
        blockerUserId: callerId,
        blockedUserId: targetUserId,
      },
    });

    res.json({
      success: true,
      message: 'User unblocked successfully.',
    });
  } catch (error: any) {
    console.error('[UnblockUserError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * GET /api/users/blocked
 * List all users currently blocked by the authenticated user
 */
router.get('/blocked', authenticate, async (req: Request, res: Response) => {
  try {
    const callerId = req.user!.id;

    const blockedList = await prisma.userBlock.findMany({
      where: { blockerUserId: callerId },
      include: {
        blocked: {
          select: {
            id: true,
            fullName: true,
            displayName: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      blockedUsers: blockedList.map((b) => ({
        id: b.blocked.id,
        fullName: b.blocked.fullName,
        displayName: b.blocked.displayName,
        email: b.blocked.email,
        avatarUrl: b.blocked.avatarUrl,
        blockedAt: b.createdAt,
        reason: b.reason,
      })),
    });
  } catch (error: any) {
    console.error('[GetBlockedUsersError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * GET /api/users/directory
 * Search directory for active users (excluding blocked users and self)
 */
router.get('/directory', authenticate, async (req: Request, res: Response) => {
  try {
    const callerId = req.user!.id;
    const query = (req.query.q as string) || '';

    // Find any blocks involving caller
    const activeBlocks = await prisma.userBlock.findMany({
      where: {
        OR: [{ blockerUserId: callerId }, { blockedUserId: callerId }],
      },
      select: {
        blockerUserId: true,
        blockedUserId: true,
      },
    });

    const excludedUserIds = new Set<string>([callerId]);
    for (const b of activeBlocks) {
      excludedUserIds.add(b.blockerUserId);
      excludedUserIds.add(b.blockedUserId);
    }

    const whereClause: any = {
      id: { notIn: Array.from(excludedUserIds) },
      status: 'ACTIVE',
    };

    if (query.trim().length > 0) {
      whereClause.OR = [
        { fullName: { contains: query.trim() } },
        { displayName: { contains: query.trim() } },
        { email: { contains: query.trim() } },
      ];
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        fullName: true,
        displayName: true,
        email: true,
        avatarUrl: true,
      },
      take: 20,
    });

    res.json({
      success: true,
      users,
    });
  } catch (error: any) {
    console.error('[UserDirectoryError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

export default router;
