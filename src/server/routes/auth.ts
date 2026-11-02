import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '@/lib/db';
import {
  verifyPassword,
  hashPassword,
  hashToken,
  generateSecureToken,
} from '@/lib/auth-crypto';
import {
  signSessionToken,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
} from '@/lib/session';
import { authenticate } from '@/server/middleware/auth';

const router = Router();

// Zod Input Schemas
const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  deviceFingerprint: z.string().min(8),
  deviceName: z.string().min(1).default('Browser Client'),
  clientPlatform: z.string().optional(),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(12, 'Password must be at least 12 characters'),
});

const RevokeSessionSchema = z.object({
  sessionId: z.string().uuid(),
});

/**
 * POST /api/auth/login
 * User & Administrator Login with Argon2id and Device Fingerprinting
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = LoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: parseResult.error.flatten(),
      });
      return;
    }

    const { email, password, deviceFingerprint, deviceName, clientPlatform } =
      parseResult.data;

    // 1. Fetch user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { roles: true },
    });

    if (!user) {
      res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
      return;
    }

    // 2. Check account status
    if (user.status !== 'ACTIVE') {
      res.status(403).json({
        error: 'ACCOUNT_SUSPENDED',
        message: `Account is currently ${user.status}. Contact administrator.`,
      });
      return;
    }

    // 3. Verify Argon2id password hash
    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
      return;
    }

    // 4. Enroll or retrieve physical device
    const device = await prisma.device.upsert({
      where: {
        userId_deviceFingerprint: {
          userId: user.id,
          deviceFingerprint,
        },
      },
      update: {
        deviceName,
        clientPlatform: clientPlatform || 'WEB_CHROME',
        lastSeenAt: new Date(),
        isActive: true,
      },
      create: {
        userId: user.id,
        deviceName,
        deviceFingerprint,
        clientPlatform: clientPlatform || 'WEB_CHROME',
        isActive: true,
      },
    });

    // 5. Generate secure session token and session record
    const rawToken = generateSecureToken(32);
    const sessionTokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const primaryRole = user.roles[0]?.role || 'USER';

    const session = await prisma.userSession.create({
      data: {
        userId: user.id,
        deviceId: device.id,
        sessionTokenHash,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        expiresAt,
        isValid: true,
      },
    });

    // 6. Sign JWT
    const jwt = await signSessionToken({
      userId: user.id,
      sessionId: session.id,
      deviceId: device.id,
      email: user.email,
      role: primaryRole,
    });

    // 7. Record Audit Log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actorEmail: user.email,
        action: 'USER_LOGIN',
        entityType: 'SESSION',
        entityId: session.id,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        details: JSON.stringify({ deviceId: device.id, deviceName }),
      },
    });

    // 8. Set HttpOnly cookie and return response
    res.cookie(SESSION_COOKIE_NAME, jwt, sessionCookieOptions);

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        displayName: user.displayName,
        status: user.status,
        roles: user.roles.map((r) => r.role),
      },
      device: {
        id: device.id,
        deviceName: device.deviceName,
        deviceFingerprint: device.deviceFingerprint,
      },
      session: {
        id: session.id,
        expiresAt: session.expiresAt,
      },
      token: jwt, // Also return in body for headless/API clients
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

/**
 * POST /api/auth/logout
 * Invalidate session in database and clear cookie
 */
router.post(
  '/logout',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (req.session) {
        await prisma.userSession.update({
          where: { id: req.session.id },
          data: { isValid: false, revokedAt: new Date() },
        });

        await prisma.auditLog.create({
          data: {
            userId: req.user?.id,
            actorEmail: req.user?.email || 'unknown',
            action: 'USER_LOGOUT',
            entityType: 'SESSION',
            entityId: req.session.id,
          },
        });
      }

      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      res.status(200).json({ success: true, message: 'Logged out successfully.' });
    } catch (err) {
      console.error('Logout error:', err);
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
  }
);

/**
 * GET /api/auth/me
 * Retrieve currently authenticated user context
 */
router.get(
  '/me',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      user: req.user,
      device: req.device,
      session: req.session,
    });
  }
);

/**
 * POST /api/auth/password/change
 * Change password and revoke all other sessions for security
 */
router.post(
  '/password/change',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const parseResult = ChangePasswordSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          details: parseResult.error.flatten(),
        });
        return;
      }

      const { currentPassword, newPassword } = parseResult.data;
      const userId = req.user!.id;

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        res.status(404).json({ error: 'USER_NOT_FOUND' });
        return;
      }

      const isCurrentValid = await verifyPassword(currentPassword, user.passwordHash);
      if (!isCurrentValid) {
        res.status(400).json({
          error: 'INVALID_PASSWORD',
          message: 'Current password is incorrect.',
        });
        return;
      }

      const newHash = await hashPassword(newPassword);

      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: { passwordHash: newHash },
        }),
        // Revoke all OTHER sessions for this user
        prisma.userSession.updateMany({
          where: {
            userId,
            id: { not: req.session!.id },
            isValid: true,
          },
          data: {
            isValid: false,
            revokedAt: new Date(),
          },
        }),
        prisma.auditLog.create({
          data: {
            userId,
            actorEmail: user.email,
            action: 'PASSWORD_CHANGED',
            entityType: 'USER',
            entityId: userId,
            details: JSON.stringify({ currentSessionPreserved: req.session!.id }),
          },
        }),
      ]);

      res.status(200).json({
        success: true,
        message: 'Password changed successfully. All other sessions have been revoked.',
      });
    } catch (err) {
      console.error('Password change error:', err);
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
  }
);

/**
 * GET /api/auth/sessions
 * List active sessions for current user
 */
router.get(
  '/sessions',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const sessions = await prisma.userSession.findMany({
        where: {
          userId: req.user!.id,
          isValid: true,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        include: { device: true },
        orderBy: { createdAt: 'desc' },
      });

      const formatted = sessions.map((s) => ({
        id: s.id,
        deviceName: s.device.deviceName,
        clientPlatform: s.device.clientPlatform,
        ipAddress: s.ipAddress,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        isCurrent: s.id === req.session!.id,
      }));

      res.status(200).json({ sessions: formatted });
    } catch (err) {
      console.error('Fetch sessions error:', err);
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
  }
);

/**
 * POST /api/auth/sessions/revoke
 * Revoke a specific active session
 */
router.post(
  '/sessions/revoke',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const parseResult = RevokeSessionSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: 'INVALID_SESSION_ID' });
        return;
      }

      const { sessionId } = parseResult.data;

      const target = await prisma.userSession.findFirst({
        where: { id: sessionId, userId: req.user!.id },
      });

      if (!target) {
        res.status(404).json({ error: 'SESSION_NOT_FOUND' });
        return;
      }

      await prisma.userSession.update({
        where: { id: sessionId },
        data: { isValid: false, revokedAt: new Date() },
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          actorEmail: req.user!.email,
          action: 'SESSION_REVOKED_BY_USER',
          entityType: 'SESSION',
          entityId: sessionId,
        },
      });

      // If user revoked their own current session, clear cookie
      if (sessionId === req.session!.id) {
        res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      }

      res.status(200).json({ success: true, message: 'Session revoked successfully.' });
    } catch (err) {
      console.error('Revoke session error:', err);
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
  }
);

export default router;
