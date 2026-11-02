/**
 * GCS CONNECT — Real-Time Socket.IO Authentication Middleware
 * Enforces JWT session validation and database-backed session state verification
 * during the WebSocket connection handshake.
 */

import { Socket } from 'socket.io';
import prisma from '@/lib/db';
import { verifySessionToken, SESSION_COOKIE_NAME, SessionTokenPayload } from '@/lib/session';

export interface SocketUser {
  id: string;
  email: string;
  fullName: string;
  displayName: string | null;
  status: string;
  roles: string[];
}

export interface SocketDevice {
  id: string;
  deviceName: string;
  deviceFingerprint: string;
}

declare module 'socket.io' {
  interface SocketData {
    user?: SocketUser;
    device?: SocketDevice;
    sessionId?: string;
  }
}

/**
 * Robust cookie string parser for handshake headers
 */
function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach((cookieStr) => {
    const parts = cookieStr.trim().split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const value = parts.slice(1).join('=').trim();
      cookies[key] = decodeURIComponent(value);
    }
  });
  return cookies;
}

/**
 * Socket.IO Handshake Authentication Middleware
 */
export async function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void
): Promise<void> {
  try {
    // 1. Extract token from cookie, handshake auth payload, or query parameter
    let token: string | undefined;

    const cookies = parseCookies(socket.handshake.headers.cookie);
    if (cookies[SESSION_COOKIE_NAME]) {
      token = cookies[SESSION_COOKIE_NAME];
    } else if (socket.handshake.auth?.token) {
      token = socket.handshake.auth.token;
    } else if (typeof socket.handshake.query?.token === 'string') {
      token = socket.handshake.query.token;
    }

    if (!token) {
      return next(new Error('AUTHENTICATION_FAILED: Missing session credentials.'));
    }

    // 2. Cryptographic JWT verification
    const payload: SessionTokenPayload | null = await verifySessionToken(token);
    if (!payload) {
      return next(new Error('AUTHENTICATION_FAILED: Invalid or expired session token.'));
    }

    // 3. Database session state check
    const dbSession = await prisma.userSession.findUnique({
      where: { id: payload.sessionId },
      include: {
        device: true,
        user: {
          include: {
            roles: true,
          },
        },
      },
    });

    if (
      !dbSession ||
      !dbSession.isValid ||
      dbSession.revokedAt !== null ||
      dbSession.expiresAt < new Date()
    ) {
      return next(new Error('AUTHENTICATION_FAILED: Session has been revoked or expired.'));
    }

    if (dbSession.user.status !== 'ACTIVE') {
      return next(new Error(`AUTHENTICATION_FAILED: Account is ${dbSession.user.status}.`));
    }

    // Update last seen timestamp on device
    try {
      await prisma.device.update({
        where: { id: dbSession.deviceId },
        data: { lastSeenAt: new Date() },
      });
    } catch {
      // Ignore if device record is locked
    }

    // 4. Attach authenticated context to socket
    socket.data = {
      user: {
        id: dbSession.user.id,
        email: dbSession.user.email,
        fullName: dbSession.user.fullName,
        displayName: dbSession.user.displayName,
        status: dbSession.user.status,
        roles: dbSession.user.roles.map((r) => r.role),
      },
      device: {
        id: dbSession.device.id,
        deviceName: dbSession.device.deviceName,
        deviceFingerprint: dbSession.device.deviceFingerprint,
      },
      sessionId: dbSession.id,
    };

    next();
  } catch (error: any) {
    console.error('[SocketAuthError]', error);
    next(new Error('AUTHENTICATION_FAILED: Internal verification error.'));
  }
}
