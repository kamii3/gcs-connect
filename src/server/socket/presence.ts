/**
 * GCS CONNECT — Real-Time Presence & Connection Tracker
 * Tracks online/offline user states and manages user/device scoped rooms.
 */

import { Server, Socket } from 'socket.io';
import prisma from '@/lib/db';

class PresenceManager {
  // Map of userId -> Set of active socket IDs
  private userSockets: Map<string, Set<string>> = new Map();
  // Map of socketId -> { userId, deviceId }
  private socketMeta: Map<string, { userId: string; deviceId: string }> = new Map();

  /**
   * Register a freshly connected socket
   */
  public async registerConnection(socket: Socket, io: Server): Promise<void> {
    const user = socket.data.user;
    const device = socket.data.device;

    if (!user || !device) return;

    const userId = user.id;
    const deviceId = device.id;

    // Auto-join personal user room & physical device room
    await socket.join(`user:${userId}`);
    await socket.join(`device:${deviceId}`);

    // Track socket mapping
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }

    const wasOffline = this.userSockets.get(userId)!.size === 0;
    this.userSockets.get(userId)!.add(socket.id);
    this.socketMeta.set(socket.id, { userId, deviceId });

    // If transitioned from offline to online, broadcast presence event
    if (wasOffline) {
      io.emit('presence:status', {
        userId,
        status: 'ONLINE',
        timestamp: new Date(),
      });
    }

    console.log(`[Presence] User ${user.fullName} (${userId}) connected on device ${device.deviceName} (${deviceId})`);
  }

  /**
   * Register socket disconnection and update presence
   */
  public async registerDisconnection(socket: Socket, io: Server): Promise<void> {
    const meta = this.socketMeta.get(socket.id);
    if (!meta) return;

    const { userId, deviceId } = meta;
    this.socketMeta.delete(socket.id);

    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(socket.id);

      if (sockets.size === 0) {
        this.userSockets.delete(userId);

        const now = new Date();

        // Update last seen timestamp on device
        try {
          await prisma.device.update({
            where: { id: deviceId },
            data: { lastSeenAt: now },
          });
        } catch {
          // Ignore if device was concurrently deleted
        }

        // Broadcast offline presence event
        io.emit('presence:status', {
          userId,
          status: 'OFFLINE',
          timestamp: now,
        });

        console.log(`[Presence] User ${userId} is now OFFLINE.`);
      }
    }
  }

  /**
   * Query online state for a specific user ID
   */
  public isUserOnline(userId: string): boolean {
    const sockets = this.userSockets.get(userId);
    return Boolean(sockets && sockets.size > 0);
  }

  /**
   * Retrieve list of all currently connected user IDs
   */
  public getOnlineUserIds(): string[] {
    return Array.from(this.userSockets.keys());
  }
}

export const presenceManager = new PresenceManager();
