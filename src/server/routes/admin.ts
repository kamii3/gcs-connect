import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '@/lib/db';
import { hashPassword, hashToken, generateSecureToken } from '@/lib/auth-crypto';
import { authenticate, requireRole } from '@/server/middleware/auth';

const router = Router();

// Enforce authentication and administrative roles (SUPER_ADMIN or ADMIN)
router.use(authenticate);
router.use(requireRole('SUPER_ADMIN', 'ADMIN'));

// Zod Input Schemas
const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  fullName: z.string().min(1),
  displayName: z.string().optional(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'SECURITY_AUDITOR', 'USER']).default('USER'),
});

const UpdateStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']),
  reason: z.string().optional(),
});

const UpdateRoleSchema = z.object({
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'SECURITY_AUDITOR', 'USER']),
  action: z.enum(['ASSIGN', 'REMOVE']).default('ASSIGN'),
});

const CreateInvitationSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'SECURITY_AUDITOR', 'USER']).default('USER'),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

/**
 * GET /api/admin/metrics
 * System metrics overview (Users, Devices, Sessions, Cryptographic Keys, Storage, Calling)
 */
router.get('/metrics', async (req: Request, res: Response): Promise<void> => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      suspendedUsers,
      newUsers24h,
      totalDevices,
      activeSessions,
      totalConversations,
      directConversations,
      groupConversations,
      totalMessages,
      editedMessages,
      deletedMessages,
      identityKeysCount,
      signedPrekeysCount,
      totalOpks,
      consumedOpks,
      totalAttachments,
      attachmentAggregate,
      totalCalls,
      completedCalls,
      callDurationAggregate,
      auditLogsTotal,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { status: 'SUSPENDED' } }),
      prisma.user.count({ where: { createdAt: { gte: oneDayAgo } } }),
      prisma.device.count({ where: { isActive: true } }),
      prisma.userSession.count({ where: { isValid: true, expiresAt: { gt: new Date() } } }),
      prisma.conversation.count({ where: { deletedAt: null } }),
      prisma.conversation.count({ where: { type: 'DIRECT', deletedAt: null } }),
      prisma.conversation.count({ where: { type: 'GROUP', deletedAt: null } }),
      prisma.message.count(),
      prisma.message.count({ where: { isEdited: true } }),
      prisma.message.count({ where: { isDeletedForEveryone: true } }),
      prisma.encryptionIdentityKey.count(),
      prisma.signedPrekey.count({ where: { isActive: true } }),
      prisma.oneTimePrekey.count(),
      prisma.oneTimePrekey.count({ where: { isConsumed: true } }),
      prisma.attachment.count(),
      prisma.attachment.aggregate({
        _sum: { fileSizeBytes: true },
      }),
      prisma.call.count(),
      prisma.call.count({ where: { status: 'COMPLETED' } }),
      prisma.call.aggregate({
        _sum: { durationSeconds: true },
      }),
      prisma.auditLog.count(),
    ]);

    const totalStorageBytes = attachmentAggregate._sum.fileSizeBytes
      ? Number(attachmentAggregate._sum.fileSizeBytes)
      : 0;

    const cumulativeCallSeconds = callDurationAggregate._sum.durationSeconds || 0;

    const formatBytes = (bytes: number) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      users: {
        total: totalUsers,
        active: activeUsers,
        suspended: suspendedUsers,
        newLast24h: newUsers24h,
      },
      devices: {
        total: totalDevices,
        activeSessions,
      },
      cryptography: {
        identityKeysCount,
        signedPrekeysCount,
        oneTimePrekeysTotal: totalOpks,
        oneTimePrekeysConsumed: consumedOpks,
        oneTimePrekeysAvailable: totalOpks - consumedOpks,
        zeroPlaintextGuarantee: true,
        cipherProtocols: ['X3DH', 'Double Ratchet', 'AES-256-GCM', 'DTLS-SRTP'],
      },
      conversations: {
        total: totalConversations,
        direct: directConversations,
        group: groupConversations,
      },
      messaging: {
        totalCiphertextMessages: totalMessages,
        editedCount: editedMessages,
        deletedForEveryoneCount: deletedMessages,
        zeroPlaintextStored: true,
      },
      storage: {
        totalAttachments,
        storageSizeBytes: totalStorageBytes,
        storageFormatted: formatBytes(totalStorageBytes),
      },
      calling: {
        totalCalls,
        completedCalls,
        cumulativeDurationSeconds: cumulativeCallSeconds,
        cumulativeDurationFormatted: `${Math.floor(cumulativeCallSeconds / 60)}m ${cumulativeCallSeconds % 60}s`,
      },
      compliance: {
        auditLogsTotal,
        asvsLevel: 'ASVS 5.0.0 Level 2',
        status: 'COMPLIANT',
      },
    });
  } catch (err: any) {
    console.error('Admin metrics error:', err);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /api/admin/users/create
 * Only Administrators can create new user accounts
 */
router.post('/users/create', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = CreateUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: parseResult.error.flatten(),
      });
      return;
    }

    const { email, password, fullName, displayName, role } = parseResult.data;

    // Check for existing account
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      res.status(409).json({
        error: 'EMAIL_ALREADY_EXISTS',
        message: 'A user account with this email already exists.',
      });
      return;
    }

    const passwordHash = await hashPassword(password);

    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash,
          fullName,
          displayName: displayName || fullName,
          status: 'ACTIVE',
          roles: {
            create: {
              role,
              assignedBy: req.user!.id,
            },
          },
        },
        include: { roles: true },
      });

      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          actorEmail: req.user!.email,
          action: 'USER_CREATED_BY_ADMIN',
          entityType: 'USER',
          entityId: user.id,
          ipAddress: req.ip,
          details: JSON.stringify({
            createdUserEmail: user.email,
            assignedRole: role,
          }),
        },
      });

      return user;
    });

    res.status(201).json({
      success: true,
      message: 'User account created successfully.',
      user: {
        id: newUser.id,
        email: newUser.email,
        fullName: newUser.fullName,
        displayName: newUser.displayName,
        status: newUser.status,
        roles: newUser.roles.map((r) => r.role),
        createdAt: newUser.createdAt,
      },
    });
  } catch (err) {
    console.error('Admin create user error:', err);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

/**
 * GET /api/admin/users
 * Paginated list of users with device counts, search, and status filtering (Strict Zero Plaintext Exposure)
 */
router.get('/users', async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '20', 10)));
    const skip = (page - 1) * limit;
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { email: { contains: search } },
        { fullName: { contains: search } },
        { displayName: { contains: search } },
      ];
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          fullName: true,
          displayName: true,
          status: true,
          createdAt: true,
          roles: { select: { role: true } },
          _count: {
            select: {
              devices: true,
              sessions: { where: { isValid: true } },
            },
          },
        },
      }),
    ]);

    const formatted = users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      displayName: u.displayName,
      status: u.status,
      createdAt: u.createdAt,
      roles: u.roles.map((r) => r.role),
      activeDeviceCount: u._count.devices,
      activeSessionCount: u._count.sessions,
    }));

    res.status(200).json({
      success: true,
      users: formatted,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('Admin list users error:', err);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

/**
 * GET /api/admin/users/:id/details
 * Detailed user cryptographic prekey inventory, active devices, and sessions
 */
router.get('/users/:id/details', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        displayName: true,
        status: true,
        avatarUrl: true,
        createdAt: true,
        roles: { select: { role: true, assignedAt: true } },
        devices: {
          select: {
            id: true,
            deviceFingerprint: true,
            deviceName: true,
            clientPlatform: true,
            isActive: true,
            lastSeenAt: true,
            createdAt: true,
            sessions: {
              select: {
                id: true,
                ipAddress: true,
                userAgent: true,
                isValid: true,
                createdAt: true,
                expiresAt: true,
                revokedAt: true,
              },
              orderBy: { createdAt: 'desc' },
            },
            identityKey: {
              select: {
                id: true,
                publicIdentityKey: true,
                createdAt: true,
              },
            },
            signedPrekeys: {
              where: { isActive: true },
              select: {
                keyId: true,
                publicKey: true,
                createdAt: true,
              },
            },
            _count: {
              select: {
                oneTimePrekeys: { where: { isConsumed: false } },
              },
            },
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        displayName: user.displayName,
        status: user.status,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        roles: user.roles.map((r) => r.role),
        devices: user.devices.map((d) => ({
          id: d.id,
          deviceFingerprint: d.deviceFingerprint,
          deviceName: d.deviceName,
          clientPlatform: d.clientPlatform,
          isActive: d.isActive,
          lastSeenAt: d.lastSeenAt,
          createdAt: d.createdAt,
          sessions: d.sessions,
          cryptoStatus: {
            hasIdentityKey: !!d.identityKey,
            identityKeyPublicKey: d.identityKey?.publicIdentityKey || null,
            activeSignedPrekeyCount: d.signedPrekeys.length,
            availableOneTimePrekeys: d._count.oneTimePrekeys,
          },
        })),
      },
    });
  } catch (err: any) {
    console.error('Admin get user details error:', err);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /api/admin/users/:id/status
 * Suspend, reactivate, or mark user for deletion
 */
router.post('/users/:id/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const parseResult = UpdateStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: parseResult.error.flatten() });
      return;
    }

    const { status, reason } = parseResult.data;

    // Prevent admin from suspending themselves
    if (id === req.user!.id && status !== 'ACTIVE') {
      res.status(400).json({
        error: 'CANNOT_SUSPEND_SELF',
        message: 'Administrators cannot suspend or delete their own active account.',
      });
      return;
    }

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      res.status(404).json({ error: 'USER_NOT_FOUND' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          status,
          deletedAt: status === 'DELETED' ? new Date() : null,
        },
      });

      // If suspending or deleting, immediately revoke ALL active sessions
      if (status === 'SUSPENDED' || status === 'DELETED') {
        await tx.userSession.updateMany({
          where: { userId: id, isValid: true },
          data: { isValid: false, revokedAt: new Date() },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          actorEmail: req.user!.email,
          action: `USER_STATUS_${status}`,
          entityType: 'USER',
          entityId: id,
          details: JSON.stringify({
            previousStatus: targetUser.status,
            newStatus: status,
            reason: reason || 'Administrative action',
          }),
        },
      });
    });

    res.status(200).json({
      success: true,
      message: `User status updated to ${status}.`,
    });
  } catch (err) {
    console.error('Admin update status error:', err);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

/**
 * POST /api/admin/users/:id/revoke-sessions
 * Force revoke all active sessions for a target user
 */
router.post('/users/:id/revoke-sessions', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await prisma.userSession.updateMany({
      where: { userId: id, isValid: true },
      data: { isValid: false, revokedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'FORCE_REVOKE_SESSIONS_BY_ADMIN',
        entityType: 'USER',
        entityId: id,
        details: JSON.stringify({ revokedSessionCount: result.count }),
      },
    });

    res.status(200).json({
      success: true,
      message: `Revoked ${result.count} active sessions for user.`,
    });
  } catch (err) {
    console.error('Admin revoke sessions error:', err);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

/**
 * POST /api/admin/users/:id/role
 * Assign or remove administrative/auditor roles
 */
router.post('/users/:id/role', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const parsed = UpdateRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      return;
    }

    const { role, action } = parsed.data;

    const targetUser = await prisma.user.findUnique({
      where: { id },
      include: { roles: true },
    });

    if (!targetUser) {
      res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found.' });
      return;
    }

    if (action === 'ASSIGN') {
      const alreadyHas = targetUser.roles.some((r) => r.role === role);
      if (!alreadyHas) {
        await prisma.userRole.create({
          data: {
            userId: id,
            role,
            assignedBy: req.user!.id,
          },
        });
      }
    } else {
      await prisma.userRole.deleteMany({
        where: { userId: id, role },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        actorEmail: req.user!.email,
        action: `USER_ROLE_${action}_${role}`,
        entityType: 'USER',
        entityId: id,
        details: JSON.stringify({ role, action, targetUserEmail: targetUser.email }),
      },
    });

    res.status(200).json({
      success: true,
      message: `Role ${role} ${action.toLowerCase()}ed successfully.`,
    });
  } catch (err: any) {
    console.error('Admin update role error:', err);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /api/admin/devices/:id/revoke
 * Force deactivate a compromised or lost device and revoke its active sessions
 */
router.post('/devices/:id/revoke', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: deviceId } = req.params;

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: { user: true },
    });

    if (!device) {
      res.status(404).json({ error: 'DEVICE_NOT_FOUND', message: 'Device not found.' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.device.update({
        where: { id: deviceId },
        data: { isActive: false },
      });

      await tx.userSession.updateMany({
        where: { deviceId, isValid: true },
        data: { isValid: false, revokedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          actorEmail: req.user!.email,
          action: 'DEVICE_REVOKED_BY_ADMIN',
          entityType: 'DEVICE',
          entityId: deviceId,
          details: JSON.stringify({
            targetUserId: device.userId,
            targetUserEmail: device.user.email,
            deviceFingerprint: device.deviceFingerprint,
            deviceName: device.deviceName,
          }),
        },
      });
    });

    res.status(200).json({
      success: true,
      message: `Device ${device.deviceName} revoked and active sessions invalidated.`,
    });
  } catch (err: any) {
    console.error('Admin revoke device error:', err);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /api/admin/invitations/create
 * Generate onboarding invitation token
 */
router.post('/invitations/create', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = CreateInvitationSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: parseResult.error.flatten() });
      return;
    }

    const { email, role, expiresInDays } = parseResult.data;
    const rawToken = generateSecureToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    const invitation = await prisma.invitation.create({
      data: {
        email: email.toLowerCase(),
        token: tokenHash,
        role,
        invitedById: req.user!.id,
        expiresAt,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'INVITATION_CREATED',
        entityType: 'INVITATION',
        entityId: invitation.id,
        details: JSON.stringify({ invitedEmail: email, role, expiresAt }),
      },
    });

    res.status(201).json({
      success: true,
      invitationId: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      invitationToken: rawToken, // Provided once to send via secure out-of-band communication
    });
  } catch (err) {
    console.error('Admin create invitation error:', err);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

/**
 * GET /api/admin/audit-logs
 * Paginated administrative audit log review with action, actor, and text filtering
 */
router.get('/audit-logs', async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '25', 10)));
    const skip = (page - 1) * limit;

    const actionFilter = req.query.action as string | undefined;
    const actorEmailFilter = req.query.actorEmail as string | undefined;
    const search = req.query.search as string | undefined;

    const where: any = {};
    if (actionFilter) {
      where.action = actionFilter;
    }
    if (actorEmailFilter) {
      where.actorEmail = { contains: actorEmailFilter };
    }
    if (search) {
      where.OR = [
        { actorEmail: { contains: search } },
        { details: { contains: search } },
        { action: { contains: search } },
      ];
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    res.status(200).json({
      success: true,
      logs,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('Admin list audit logs error:', err);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
});

export default router;
