import { Request, Response, NextFunction } from 'express';
import prisma from '@/lib/db';
import {
  verifySessionToken,
  SESSION_COOKIE_NAME,
  SessionTokenPayload,
} from '@/lib/session';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  displayName: string | null;
  status: string;
  roles: string[];
}

export interface AuthenticatedDevice {
  id: string;
  deviceName: string;
  deviceFingerprint: string;
  clientPlatform: string | null;
}

export interface AuthenticatedSession {
  id: string;
  expiresAt: Date;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      device?: AuthenticatedDevice;
      session?: AuthenticatedSession;
    }
  }
}

/**
 * Authentication Middleware: Extracts and validates session from HttpOnly cookie or Bearer header
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let token: string | undefined = req.cookies?.[SESSION_COOKIE_NAME];

  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.substring(7);
  }

  if (!token) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Authentication session token is missing.',
    });
    return;
  }

  const payload: SessionTokenPayload | null = await verifySessionToken(token);
  if (!payload) {
    res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Authentication session token is invalid or expired.',
    });
    return;
  }

  // Database verification: Verify session is still valid and not revoked
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
    res.status(401).json({
      error: 'SESSION_REVOKED',
      message: 'This session has been revoked or has expired.',
    });
    return;
  }

  if (dbSession.user.status !== 'ACTIVE') {
    res.status(403).json({
      error: 'ACCOUNT_SUSPENDED',
      message: `Account is currently ${dbSession.user.status}. Please contact an administrator.`,
    });
    return;
  }

  // Update last seen timestamp on device
  try {
    await prisma.device.update({
      where: { id: dbSession.deviceId },
      data: { lastSeenAt: new Date() },
    });
  } catch {
    // Ignore error if device was concurrently deleted
  }

  req.user = {
    id: dbSession.user.id,
    email: dbSession.user.email,
    fullName: dbSession.user.fullName,
    displayName: dbSession.user.displayName,
    status: dbSession.user.status,
    roles: dbSession.user.roles.map((r) => r.role),
  };

  req.device = {
    id: dbSession.device.id,
    deviceName: dbSession.device.deviceName,
    deviceFingerprint: dbSession.device.deviceFingerprint,
    clientPlatform: dbSession.device.clientPlatform,
  };

  req.session = {
    id: dbSession.id,
    expiresAt: dbSession.expiresAt,
  };

  next();
}

/**
 * Role-Based Authorization Guard: Enforces specific roles
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }

    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));
    if (!hasRole) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Insufficient administrative permissions to perform this action.',
      });
      return;
    }

    next();
  };
}
