/**
 * GCS CONNECT — Client-Side Real-Time Socket.IO Manager
 * Handles authenticated connection lifecycle, dynamic room subscriptions,
 * typing debouncing, and presence events.
 */

import { io, Socket } from 'socket.io-client';

export type PresenceStatus = 'ONLINE' | 'OFFLINE';

export interface TypingEvent {
  conversationId: string;
  userId: string;
  displayName?: string;
  isTyping: boolean;
}

export class RealtimeSocketClient {
  private socket: Socket | null = null;
  private typingTimeouts: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Initialize and connect socket with JWT credentials
   */
  public connect(serverUrl: string = '', token?: string): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io(serverUrl, {
      auth: token ? { token } : undefined,
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    this.socket.on('connect', () => {
      console.log(`[RealtimeSocket] Connected with ID: ${this.socket?.id}`);
    });

    this.socket.on('connect_error', (err) => {
      console.error('[RealtimeSocket] Connection error:', err.message);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[RealtimeSocket] Disconnected:', reason);
    });

    return this.socket;
  }

  /**
   * Join an authorized conversation room
   */
  public joinConversation(conversationId: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve(false);
        return;
      }

      this.socket.emit(
        'conversation:join',
        { conversationId },
        (response?: { success: boolean; error?: string }) => {
          if (response?.success) {
            resolve(true);
          } else {
            console.warn(`[RealtimeSocket] Join conversation failed:`, response?.error);
            resolve(false);
          }
        }
      );
    });
  }

  /**
   * Leave a conversation room
   */
  public leaveConversation(conversationId: string): void {
    this.socket?.emit('conversation:leave', { conversationId });
  }

  /**
   * Broadcast typing indicator with automatic 3-second auto-stop debounce
   */
  public emitTyping(conversationId: string): void {
    if (!this.socket) return;

    this.socket.emit('typing:start', { conversationId });

    // Clear any existing stop timer
    const existingTimer = this.typingTimeouts.get(conversationId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Auto-stop typing after 3 seconds of inactivity
    const newTimer = setTimeout(() => {
      this.socket?.emit('typing:stop', { conversationId });
      this.typingTimeouts.delete(conversationId);
    }, 3000);

    this.typingTimeouts.set(conversationId, newTimer);
  }

  /**
   * Immediately cancel typing indicator
   */
  public stopTyping(conversationId: string): void {
    const existingTimer = this.typingTimeouts.get(conversationId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.typingTimeouts.delete(conversationId);
    }
    this.socket?.emit('typing:stop', { conversationId });
  }

  /**
   * Listen for new incoming encrypted messages
   */
  public onMessage(callback: (message: any) => void): () => void {
    this.socket?.on('message:new', callback);
    return () => this.socket?.off('message:new', callback);
  }

  /**
   * Listen for message delivery / read receipts
   */
  public onReceipt(callback: (receipt: any) => void): () => void {
    this.socket?.on('receipt:updated', callback);
    return () => this.socket?.off('receipt:updated', callback);
  }

  /**
   * Listen for emoji reaction updates
   */
  public onReaction(callback: (reaction: any) => void): () => void {
    this.socket?.on('reaction:updated', callback);
    return () => this.socket?.off('reaction:updated', callback);
  }

  /**
   * Listen for presence updates (ONLINE / OFFLINE)
   */
  public onPresence(
    callback: (event: { userId: string; status: PresenceStatus; timestamp: string }) => void
  ): () => void {
    this.socket?.on('presence:status', callback);
    return () => this.socket?.off('presence:status', callback);
  }

  /**
   * Listen for typing notifications
   */
  public onTyping(callback: (event: TypingEvent) => void): () => void {
    const startHandler = (data: any) => {
      callback({ ...data, isTyping: true });
    };

    const stopHandler = (data: any) => {
      callback({ ...data, isTyping: false });
    };

    this.socket?.on('typing:start', startHandler);
    this.socket?.on('typing:stop', stopHandler);

    return () => {
      this.socket?.off('typing:start', startHandler);
      this.socket?.off('typing:stop', stopHandler);
    };
  }

  /**
   * Query online state of a batch of peer user IDs
   */
  public queryPresence(userIds: string[]): Promise<string[]> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve([]);
        return;
      }

      this.socket.emit(
        'presence:query',
        { userIds },
        (res?: { onlineUserIds: string[] }) => {
          resolve(res?.onlineUserIds || []);
        }
      );
    });
  }

  /**
   * Disconnect socket cleanly
   */
  public disconnect(): void {
    this.typingTimeouts.forEach((timer) => clearTimeout(timer));
    this.typingTimeouts.clear();
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const realtimeSocket = new RealtimeSocketClient();
