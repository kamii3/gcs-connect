/**
 * GCS CONNECT — WebRTC Voice & Video Calling Controller
 * Manages call lifecycle (INITIATE, RINGING, CONNECT, HANGUP),
 * call duration tracking, and call history logging in MySQL.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '@/lib/db';
import { authenticate } from '@/server/middleware/auth';
import { getWebRtcConfig } from '@/lib/webrtc/config';
import { io } from '@/server/server';

const router = Router();

// Validation Schemas
const initiateCallSchema = z.object({
  conversationId: z.string().uuid('Valid conversation ID is required'),
  callType: z.enum(['VOICE', 'VIDEO']).default('VOICE'),
});

const respondCallSchema = z.object({
  action: z.enum(['ACCEPT', 'DECLINE', 'BUSY']),
});

/**
 * GET /api/calls/config
 * Retrieve active WebRTC ICE server configuration (STUN/TURN)
 */
router.get('/config', authenticate, (req: Request, res: Response) => {
  const config = getWebRtcConfig();
  res.json({
    success: true,
    config,
  });
});

/**
 * POST /api/calls/initiate
 * Initiate a new voice or video call
 */
router.post('/initiate', authenticate, async (req: Request, res: Response) => {
  try {
    const callerId = req.user!.id;
    const callerDeviceId = req.device!.id;

    const parsed = initiateCallSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.format() });
      return;
    }

    const { conversationId, callType } = parsed.data;

    // 1. Verify caller is an active member of conversation
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
          where: { leftAt: null },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                displayName: true,
                avatarUrl: true,
                status: true,
              },
            },
          },
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

    // 2. In direct conversations, check privacy block status
    let peerUser: any = null;
    if (conversation.type === 'DIRECT') {
      const peer = conversation.members.find((m) => m.userId !== callerId);
      if (peer) {
        peerUser = peer.user;
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
            message: 'Cannot initiate call: User communication is blocked.',
          });
          return;
        }

        // Check if recipient is already in an active call
        const activeCall = await prisma.call.findFirst({
          where: {
            status: { in: ['INITIATED', 'RINGING', 'CONNECTED'] },
            participants: {
              some: {
                userId: peer.userId,
                status: { in: ['INVITED', 'ACCEPTED'] },
              },
            },
          },
        });

        if (activeCall) {
          res.status(409).json({
            error: 'USER_BUSY',
            message: `${peer.user.fullName} is currently on another call.`,
          });
          return;
        }
      }
    }

    // 3. Prepare participants list ensuring valid unique device IDs
    const otherMembers = conversation.members.filter((m) => m.userId !== callerId);

    const participantsData = [
      {
        userId: callerId,
        deviceId: callerDeviceId,
        status: 'ACCEPTED',
        joinedAt: new Date(),
      },
    ];

    for (const m of otherMembers) {
      const peerDevice = await prisma.device.findFirst({
        where: { userId: m.userId, isActive: true },
        orderBy: { lastSeenAt: 'desc' },
      });
      if (peerDevice) {
        participantsData.push({
          userId: m.userId,
          deviceId: peerDevice.id,
          status: 'INVITED',
          joinedAt: null as any,
        });
      }
    }

    const call = await prisma.$transaction(async (tx) => {
      const createdCall = await tx.call.create({
        data: {
          conversationId,
          initiatorUserId: callerId,
          callType,
          status: 'INITIATED',
          participants: {
            create: participantsData,
          },
        },
        include: {
          initiator: {
            select: {
              id: true,
              fullName: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          participants: true,
        },
      });

      return createdCall;
    });

    // 4. Emit real-time incoming call event to recipient(s) via Socket.IO
    if (io) {
      const incomingPayload = {
        callId: call.id,
        conversationId: call.conversationId,
        callType: call.callType,
        initiator: {
          id: callerId,
          fullName: req.user!.fullName,
          displayName: req.user!.displayName,
        },
      };

      if (peerUser) {
        io.to(`user:${peerUser.id}`).emit('call:incoming', incomingPayload);
      } else {
        io.to(`conversation:${conversationId}`).emit('call:incoming', incomingPayload);
      }
    }

    res.status(201).json({
      success: true,
      call,
    });
  } catch (error: any) {
    console.error('[InitiateCallError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/calls/:id/respond
 * Respond to an incoming call (ACCEPT, DECLINE, BUSY)
 */
router.post('/:id/respond', authenticate, async (req: Request, res: Response) => {
  try {
    const { id: callId } = req.params;
    const callerId = req.user!.id;
    const callerDeviceId = req.device!.id;

    const parsed = respondCallSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.format() });
      return;
    }

    const { action } = parsed.data;

    const call = await prisma.call.findUnique({
      where: { id: callId },
      include: {
        participants: true,
      },
    });

    if (!call || call.endedAt !== null) {
      res.status(404).json({ error: 'CALL_NOT_FOUND', message: 'Call has already concluded or does not exist.' });
      return;
    }

    const now = new Date();

    if (action === 'ACCEPT') {
      await prisma.$transaction(async (tx) => {
        await tx.call.update({
          where: { id: callId },
          data: {
            status: 'CONNECTED',
            connectedAt: now,
          },
        });

        const existingParticipant = await tx.callParticipant.findFirst({
          where: { callId, userId: callerId },
        });

        if (existingParticipant) {
          await tx.callParticipant.update({
            where: { id: existingParticipant.id },
            data: {
              deviceId: callerDeviceId,
              status: 'ACCEPTED',
              joinedAt: now,
            },
          });
        } else {
          await tx.callParticipant.create({
            data: {
              callId,
              userId: callerId,
              deviceId: callerDeviceId,
              status: 'ACCEPTED',
              joinedAt: now,
            },
          });
        }
      });

      if (io) {
        io.to(`user:${call.initiatorUserId}`).emit('call:response', {
          callId,
          action: 'ACCEPT',
          responderUserId: callerId,
          responderDeviceId: callerDeviceId,
        });
      }

      res.json({ success: true, status: 'CONNECTED', connectedAt: now });
    } else {
      // DECLINE or BUSY
      const finalStatus = action === 'BUSY' ? 'BUSY' : 'REJECTED';

      await prisma.$transaction([
        prisma.call.update({
          where: { id: callId },
          data: {
            status: finalStatus,
            endedAt: now,
          },
        }),
        prisma.callParticipant.updateMany({
          where: {
            callId,
            userId: callerId,
          },
          data: {
            status: 'DECLINED',
            leftAt: now,
          },
        }),
      ]);

      if (io) {
        io.to(`user:${call.initiatorUserId}`).emit('call:response', {
          callId,
          action,
          responderUserId: callerId,
        });
      }

      res.json({ success: true, status: finalStatus, endedAt: now });
    }
  } catch (error: any) {
    console.error('[RespondCallError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/calls/:id/end
 * Hang up / terminate an ongoing or initiated call
 */
router.post('/:id/end', authenticate, async (req: Request, res: Response) => {
  try {
    const { id: callId } = req.params;
    const callerId = req.user!.id;

    const call = await prisma.call.findUnique({
      where: { id: callId },
      include: {
        participants: true,
      },
    });

    if (!call) {
      res.status(404).json({ error: 'CALL_NOT_FOUND', message: 'Call does not exist.' });
      return;
    }

    if (call.endedAt !== null) {
      res.json({
        success: true,
        message: 'Call was already concluded.',
        durationSeconds: call.durationSeconds,
      });
      return;
    }

    const now = new Date();
    let durationSeconds = 0;
    if (call.connectedAt) {
      durationSeconds = Math.max(0, Math.round((now.getTime() - call.connectedAt.getTime()) / 1000));
    }

    await prisma.$transaction([
      prisma.call.update({
        where: { id: callId },
        data: {
          status: 'COMPLETED',
          endedAt: now,
          durationSeconds,
        },
      }),
      prisma.callParticipant.updateMany({
        where: {
          callId,
          leftAt: null,
        },
        data: {
          leftAt: now,
        },
      }),
    ]);

    if (io) {
      io.to(`conversation:${call.conversationId}`).emit('call:ended', {
        callId,
        durationSeconds,
        endedAt: now,
        terminatedByUserId: callerId,
      });
    }

    res.json({
      success: true,
      message: 'Call terminated successfully.',
      durationSeconds,
      endedAt: now,
    });
  } catch (error: any) {
    console.error('[EndCallError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * GET /api/calls/history
 * List historical calls for the authenticated user
 */
router.get('/history', authenticate, async (req: Request, res: Response) => {
  try {
    const callerId = req.user!.id;
    const limit = Math.min(parseInt((req.query.limit as string) || '30', 10), 100);

    const calls = await prisma.call.findMany({
      where: {
        OR: [
          { initiatorUserId: callerId },
          { participants: { some: { userId: callerId } } },
        ],
      },
      take: limit,
      orderBy: { startedAt: 'desc' },
      include: {
        initiator: {
          select: {
            id: true,
            fullName: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        participants: {
          include: {
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
      },
    });

    res.json({
      success: true,
      calls: calls.map((c) => ({
        id: c.id,
        conversationId: c.conversationId,
        callType: c.callType,
        status: c.status,
        durationSeconds: c.durationSeconds,
        startedAt: c.startedAt,
        connectedAt: c.connectedAt,
        endedAt: c.endedAt,
        initiator: c.initiator,
        isOutgoing: c.initiatorUserId === callerId,
        participants: c.participants.map((p) => ({
          userId: p.userId,
          status: p.status,
          user: p.user,
        })),
      })),
    });
  } catch (error: any) {
    console.error('[CallHistoryError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

export default router;
