/**
 * GCS CONNECT — Socket.IO Real-Time Event Handlers & Room Authorization
 * Manages authorized room joins, typing events, presence queries, and heartbeat pings.
 * Strictly enforces that users cannot eavesdrop on conversations they do not belong to.
 */

import { Server, Socket } from 'socket.io';
import prisma from '@/lib/db';
import { presenceManager } from './presence';

export function registerSocketHandlers(io: Server, socket: Socket): void {
  const user = socket.data.user;
  if (!user) return;

  /**
   * conversation:join
   * Join real-time room for a specific conversation with membership verification
   */
  socket.on(
    'conversation:join',
    async (
      payload: { conversationId: string },
      callback?: (res: { success: boolean; error?: string }) => void
    ) => {
      try {
        const { conversationId } = payload;
        if (!conversationId) {
          callback?.({ success: false, error: 'Missing conversationId.' });
          return;
        }

        // Database Authorization Guard: Verify user is an active member
        const member = await prisma.conversationMember.findUnique({
          where: {
            conversationId_userId: {
              conversationId,
              userId: user.id,
            },
          },
        });

        if (!member || member.leftAt !== null) {
          const errMsg = 'FORBIDDEN: You are not an active member of this conversation.';
          socket.emit('socket:error', { code: 'FORBIDDEN', message: errMsg });
          callback?.({ success: false, error: errMsg });
          return;
        }

        const roomName = `conversation:${conversationId}`;
        await socket.join(roomName);

        callback?.({ success: true });
        console.log(`[Socket] User ${user.id} joined room ${roomName}`);
      } catch (err: any) {
        console.error('[SocketJoinError]', err);
        callback?.({ success: false, error: err.message });
      }
    }
  );

  /**
   * conversation:leave
   * Depart real-time room for a conversation
   */
  socket.on('conversation:leave', async (payload: { conversationId: string }) => {
    if (!payload?.conversationId) return;
    const roomName = `conversation:${payload.conversationId}`;
    await socket.leave(roomName);
    console.log(`[Socket] User ${user.id} left room ${roomName}`);
  });

  /**
   * typing:start
   * Broadcast typing notification to peers in the conversation room
   */
  socket.on('typing:start', (payload: { conversationId: string }) => {
    if (!payload?.conversationId) return;
    const roomName = `conversation:${payload.conversationId}`;

    // Verify socket has joined this room before allowing broadcast
    if (socket.rooms.has(roomName)) {
      socket.to(roomName).emit('typing:start', {
        conversationId: payload.conversationId,
        userId: user.id,
        displayName: user.displayName || user.fullName,
      });
    }
  });

  /**
   * typing:stop
   * Broadcast stopped typing notification
   */
  socket.on('typing:stop', (payload: { conversationId: string }) => {
    if (!payload?.conversationId) return;
    const roomName = `conversation:${payload.conversationId}`;

    if (socket.rooms.has(roomName)) {
      socket.to(roomName).emit('typing:stop', {
        conversationId: payload.conversationId,
        userId: user.id,
      });
    }
  });

  /**
   * presence:query
   * Query online status for a set of peer user IDs
   */
  socket.on(
    'presence:query',
    (
      payload: { userIds: string[] },
      callback?: (res: { onlineUserIds: string[] }) => void
    ) => {
      const userIds = payload?.userIds || [];
      const onlineUserIds = userIds.filter((id) => presenceManager.isUserOnline(id));
      callback?.({ onlineUserIds });
    }
  );

  /**
   * heartbeat
   * Client-side keepalive ping to maintain active presence and device timestamp
   */
  socket.on('heartbeat', async () => {
    const device = socket.data.device;
    if (device) {
      try {
        await prisma.device.update({
          where: { id: device.id },
          data: { lastSeenAt: new Date() },
        });
      } catch {
        // Ignore
      }
    }
  });

  /**
   * WebRTC Signaling: call:offer
   * Forward SDP offer to target peer room (user:<toUserId>)
   */
  socket.on(
    'call:offer',
    async (
      payload: { callId: string; toUserId: string; offer: any },
      callback?: (res: { success: boolean; error?: string }) => void
    ) => {
      try {
        const { callId, toUserId, offer } = payload;
        if (!callId || !toUserId || !offer) {
          callback?.({ success: false, error: 'Missing callId, toUserId, or offer.' });
          return;
        }

        // Verify call membership
        const call = await prisma.call.findUnique({
          where: { id: callId },
          include: { participants: true },
        });

        if (
          !call ||
          (call.initiatorUserId !== user.id && !call.participants.some((p) => p.userId === user.id))
        ) {
          callback?.({ success: false, error: 'Unauthorized: Not a participant in this call.' });
          return;
        }

        io.to(`user:${toUserId}`).emit('call:offer', {
          callId,
          fromUserId: user.id,
          offer,
        });

        callback?.({ success: true });
      } catch (err: any) {
        console.error('[CallOfferError]', err);
        callback?.({ success: false, error: err.message });
      }
    }
  );

  /**
   * WebRTC Signaling: call:answer
   * Forward SDP answer to target peer room (user:<toUserId>)
   */
  socket.on(
    'call:answer',
    async (
      payload: { callId: string; toUserId: string; answer: any },
      callback?: (res: { success: boolean; error?: string }) => void
    ) => {
      try {
        const { callId, toUserId, answer } = payload;
        if (!callId || !toUserId || !answer) {
          callback?.({ success: false, error: 'Missing callId, toUserId, or answer.' });
          return;
        }

        const call = await prisma.call.findUnique({
          where: { id: callId },
          include: { participants: true },
        });

        if (
          !call ||
          (call.initiatorUserId !== user.id && !call.participants.some((p) => p.userId === user.id))
        ) {
          callback?.({ success: false, error: 'Unauthorized: Not a participant in this call.' });
          return;
        }

        io.to(`user:${toUserId}`).emit('call:answer', {
          callId,
          fromUserId: user.id,
          answer,
        });

        callback?.({ success: true });
      } catch (err: any) {
        console.error('[CallAnswerError]', err);
        callback?.({ success: false, error: err.message });
      }
    }
  );

  /**
   * WebRTC Signaling: call:ice-candidate
   * Relay ICE candidate trickling to target peer
   */
  socket.on(
    'call:ice-candidate',
    async (
      payload: { callId: string; toUserId: string; candidate: any },
      callback?: (res: { success: boolean; error?: string }) => void
    ) => {
      try {
        const { callId, toUserId, candidate } = payload;
        if (!callId || !toUserId || !candidate) {
          callback?.({ success: false, error: 'Missing required candidate payload.' });
          return;
        }

        io.to(`user:${toUserId}`).emit('call:ice-candidate', {
          callId,
          fromUserId: user.id,
          candidate,
        });

        callback?.({ success: true });
      } catch (err: any) {
        console.error('[CallIceCandidateError]', err);
        callback?.({ success: false, error: err.message });
      }
    }
  );

  /**
   * WebRTC Signaling: call:hangup
   * Terminate active call and notify peers
   */
  socket.on(
    'call:hangup',
    async (
      payload: { callId: string; toUserId?: string },
      callback?: (res: { success: boolean; error?: string }) => void
    ) => {
      try {
        const { callId, toUserId } = payload;
        if (!callId) {
          callback?.({ success: false, error: 'Missing callId.' });
          return;
        }

        const call = await prisma.call.findUnique({
          where: { id: callId },
          include: { participants: true },
        });

        if (call && call.endedAt === null) {
          const now = new Date();
          const durationSeconds = call.connectedAt
            ? Math.max(0, Math.round((now.getTime() - call.connectedAt.getTime()) / 1000))
            : 0;

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
              where: { callId, leftAt: null },
              data: { leftAt: now },
            }),
          ]);

          if (toUserId) {
            io.to(`user:${toUserId}`).emit('call:hangup', {
              callId,
              fromUserId: user.id,
              durationSeconds,
            });
          } else {
            // Broadcast to all participants
            for (const p of call.participants) {
              if (p.userId !== user.id) {
                io.to(`user:${p.userId}`).emit('call:hangup', {
                  callId,
                  fromUserId: user.id,
                  durationSeconds,
                });
              }
            }
          }
        }

        callback?.({ success: true });
      } catch (err: any) {
        console.error('[CallHangupError]', err);
        callback?.({ success: false, error: err.message });
      }
    }
  );
}
