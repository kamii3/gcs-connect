/**
 * GCS CONNECT — Cryptographic Key Exchange & Prekey Bundle Routes
 * Implements X3DH prekey repository, atomic one-time prekey consumption,
 * replenishment, key bundle backups, and safety number verification.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '@/lib/db';
import { authenticate } from '@/server/middleware/auth';

const router = Router();

// Validation Schemas
const registerKeysSchema = z.object({
  publicIdentityKey: z.string().min(1, 'Public identity key is required'),
  keyAlgorithm: z.string().default('ECDH-P256'),
  signedPrekey: z.object({
    keyId: z.number().int().positive(),
    publicKey: z.string().min(1),
    signature: z.string().min(1),
  }),
  oneTimePrekeys: z
    .array(
      z.object({
        keyId: z.number().int().positive(),
        publicKey: z.string().min(1),
      })
    )
    .min(1, 'At least one one-time prekey must be registered'),
});

const replenishPrekeysSchema = z.object({
  oneTimePrekeys: z
    .array(
      z.object({
        keyId: z.number().int().positive(),
        publicKey: z.string().min(1),
      })
    )
    .min(1, 'At least one one-time prekey must be provided for replenishment'),
});

const backupSchema = z.object({
  encryptedBackupBlob: z.string().min(1),
  backupVersion: z.number().int().positive().default(1),
  checksumSha256: z.string().min(1),
});

/**
 * POST /api/keys/register
 * Register Identity Key, Signed Prekey, and initial One-Time Prekeys for active device
 */
router.post('/register', authenticate, async (req: Request, res: Response) => {
  try {
    const parsed = registerKeysSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: parsed.error.format(),
      });
      return;
    }

    const deviceId = req.device!.id;
    const { publicIdentityKey, keyAlgorithm, signedPrekey, oneTimePrekeys } = parsed.data;

    await prisma.$transaction(async (tx) => {
      // 1. Register or update Identity Key
      await tx.encryptionIdentityKey.upsert({
        where: { deviceId },
        update: {
          publicIdentityKey,
          keyAlgorithm,
        },
        create: {
          deviceId,
          publicIdentityKey,
          keyAlgorithm,
        },
      });

      // 2. Mark any previously active Signed Prekeys as inactive
      await tx.signedPrekey.updateMany({
        where: { deviceId, isActive: true },
        data: { isActive: false },
      });

      // 3. Register fresh Signed Prekey
      await tx.signedPrekey.create({
        data: {
          deviceId,
          keyId: signedPrekey.keyId,
          publicKey: signedPrekey.publicKey,
          signature: signedPrekey.signature,
          isActive: true,
        },
      });

      // 4. Insert One-Time Prekeys
      await tx.oneTimePrekey.createMany({
        data: oneTimePrekeys.map((opk) => ({
          deviceId,
          keyId: opk.keyId,
          publicKey: opk.publicKey,
          isConsumed: false,
        })),
        skipDuplicates: true,
      });

      // 5. Update Device Key Metadata
      const totalUnconsumed = await tx.oneTimePrekey.count({
        where: { deviceId, isConsumed: false },
      });

      const spkRotationDue = new Date();
      spkRotationDue.setDate(spkRotationDue.getDate() + 30); // 30-day rotation

      await tx.deviceKeyMetadata.upsert({
        where: { deviceId },
        update: {
          activeOneTimePrekeyCount: totalUnconsumed,
          signedPrekeyRotationDueAt: spkRotationDue,
          lastReplenishedAt: new Date(),
        },
        create: {
          deviceId,
          activeOneTimePrekeyCount: totalUnconsumed,
          signedPrekeyRotationDueAt: spkRotationDue,
          lastReplenishedAt: new Date(),
        },
      });
    });

    res.status(201).json({
      success: true,
      message: 'Cryptographic keys and prekey inventory registered successfully.',
      deviceId,
      registeredOpks: oneTimePrekeys.length,
    });
  } catch (error: any) {
    console.error('[KeyRegisterError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * GET /api/keys/prekey-bundle/:targetUserId
 * Retrieve target user's Prekey Bundle and atomically consume one One-Time Prekey
 */
router.get('/prekey-bundle/:targetUserId', authenticate, async (req: Request, res: Response) => {
  try {
    const { targetUserId } = req.params;
    const requestedDeviceId = req.query.deviceId as string | undefined;

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        devices: {
          where: requestedDeviceId
            ? { id: requestedDeviceId, isActive: true }
            : { isActive: true },
          orderBy: { lastSeenAt: 'desc' },
          take: 1,
          include: {
            identityKey: true,
            signedPrekeys: {
              where: { isActive: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!targetUser || targetUser.devices.length === 0) {
      res.status(404).json({
        error: 'DEVICE_NOT_FOUND',
        message: 'Target user does not have an active registered device.',
      });
      return;
    }

    const device = targetUser.devices[0];

    if (!device.identityKey || device.signedPrekeys.length === 0) {
      res.status(400).json({
        error: 'KEYS_NOT_INITIALIZED',
        message: 'Target device has not completed cryptographic key initialization.',
      });
      return;
    }

    const activeSignedPrekey = device.signedPrekeys[0];

    // Atomically retrieve and consume one One-Time Prekey
    let consumedOpk: { keyId: number; publicKey: string } | null = null;

    await prisma.$transaction(async (tx) => {
      const opk = await tx.oneTimePrekey.findFirst({
        where: {
          deviceId: device.id,
          isConsumed: false,
        },
        orderBy: { keyId: 'asc' },
      });

      if (opk) {
        await tx.oneTimePrekey.update({
          where: { id: opk.id },
          data: {
            isConsumed: true,
            consumedAt: new Date(),
          },
        });

        await tx.deviceKeyMetadata.updateMany({
          where: { deviceId: device.id },
          data: {
            activeOneTimePrekeyCount: { decrement: 1 },
          },
        });

        consumedOpk = {
          keyId: opk.keyId,
          publicKey: opk.publicKey,
        };
      }
    });

    res.json({
      success: true,
      bundle: {
        userId: targetUser.id,
        deviceId: device.id,
        identityKey: device.identityKey.publicIdentityKey,
        signedPrekey: {
          keyId: activeSignedPrekey.keyId,
          publicKey: activeSignedPrekey.publicKey,
          signature: activeSignedPrekey.signature,
        },
        oneTimePrekey: consumedOpk,
      },
    });
  } catch (error: any) {
    console.error('[PrekeyBundleError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/keys/prekeys/replenish
 * Replenish One-Time Prekeys when inventory is running low
 */
router.post('/prekeys/replenish', authenticate, async (req: Request, res: Response) => {
  try {
    const parsed = replenishPrekeysSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: parsed.error.format(),
      });
      return;
    }

    const deviceId = req.device!.id;
    const { oneTimePrekeys } = parsed.data;

    let totalActive = 0;

    await prisma.$transaction(async (tx) => {
      await tx.oneTimePrekey.createMany({
        data: oneTimePrekeys.map((opk) => ({
          deviceId,
          keyId: opk.keyId,
          publicKey: opk.publicKey,
          isConsumed: false,
        })),
        skipDuplicates: true,
      });

      totalActive = await tx.oneTimePrekey.count({
        where: { deviceId, isConsumed: false },
      });

      await tx.deviceKeyMetadata.updateMany({
        where: { deviceId },
        data: {
          activeOneTimePrekeyCount: totalActive,
          lastReplenishedAt: new Date(),
        },
      });
    });

    res.json({
      success: true,
      message: 'One-Time Prekeys replenished successfully.',
      addedCount: oneTimePrekeys.length,
      totalActiveOpks: totalActive,
    });
  } catch (error: any) {
    console.error('[ReplenishPrekeysError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * GET /api/keys/status
 * Get key inventory status for the authenticated device
 */
router.get('/status', authenticate, async (req: Request, res: Response) => {
  try {
    const deviceId = req.device!.id;

    const [identityKey, activeSPK, unconsumedOpkCount, metadata] = await Promise.all([
      prisma.encryptionIdentityKey.findUnique({ where: { deviceId } }),
      prisma.signedPrekey.findFirst({
        where: { deviceId, isActive: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.oneTimePrekey.count({ where: { deviceId, isConsumed: false } }),
      prisma.deviceKeyMetadata.findUnique({ where: { deviceId } }),
    ]);

    const isInitialized = Boolean(identityKey && activeSPK);
    const needsReplenishment = unconsumedOpkCount < 10;

    res.json({
      deviceId,
      isInitialized,
      identityKeyRegistered: Boolean(identityKey),
      signedPrekey: activeSPK
        ? {
            keyId: activeSPK.keyId,
            createdAt: activeSPK.createdAt,
            rotationDueAt: metadata?.signedPrekeyRotationDueAt,
          }
        : null,
      activeOneTimePrekeyCount: unconsumedOpkCount,
      needsReplenishment,
      lastReplenishedAt: metadata?.lastReplenishedAt,
    });
  } catch (error: any) {
    console.error('[KeyStatusError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * GET /api/keys/safety-number/:targetUserId
 * Retrieve public identity keys of caller and target user for Safety Number verification
 */
router.get('/safety-number/:targetUserId', authenticate, async (req: Request, res: Response) => {
  try {
    const callerDeviceId = req.device!.id;
    const { targetUserId } = req.params;

    const [callerKey, targetUser] = await Promise.all([
      prisma.encryptionIdentityKey.findUnique({
        where: { deviceId: callerDeviceId },
      }),
      prisma.user.findUnique({
        where: { id: targetUserId },
        include: {
          devices: {
            where: { isActive: true },
            orderBy: { lastSeenAt: 'desc' },
            take: 1,
            include: { identityKey: true },
          },
        },
      }),
    ]);

    if (!callerKey) {
      res.status(400).json({
        error: 'CALLER_KEYS_NOT_INITIALIZED',
        message: 'Your device has not registered an identity key.',
      });
      return;
    }

    if (!targetUser || targetUser.devices.length === 0 || !targetUser.devices[0].identityKey) {
      res.status(404).json({
        error: 'PEER_KEYS_NOT_INITIALIZED',
        message: 'Target user does not have an active device with registered identity keys.',
      });
      return;
    }

    res.json({
      targetUserId: targetUser.id,
      targetUserFullName: targetUser.fullName,
      callerIdentityKey: callerKey.publicIdentityKey,
      peerIdentityKey: targetUser.devices[0].identityKey.publicIdentityKey,
    });
  } catch (error: any) {
    console.error('[SafetyNumberError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/keys/backup
 * Store client-side encrypted key bundle backup
 */
router.post('/backup', authenticate, async (req: Request, res: Response) => {
  try {
    const parsed = backupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: parsed.error.format(),
      });
      return;
    }

    const deviceId = req.device!.id;
    const { encryptedBackupBlob, backupVersion, checksumSha256 } = parsed.data;

    await prisma.encryptedKeyBundle.upsert({
      where: { deviceId },
      update: {
        encryptedBackupBlob,
        backupVersion,
        checksumSha256,
      },
      create: {
        deviceId,
        encryptedBackupBlob,
        backupVersion,
        checksumSha256,
      },
    });

    res.json({
      success: true,
      message: 'Encrypted key bundle backup saved successfully.',
      deviceId,
      backupVersion,
    });
  } catch (error: any) {
    console.error('[KeyBackupSaveError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * GET /api/keys/backup
 * Retrieve client-side encrypted key bundle backup
 */
router.get('/backup', authenticate, async (req: Request, res: Response) => {
  try {
    const deviceId = req.device!.id;
    const backup = await prisma.encryptedKeyBundle.findUnique({
      where: { deviceId },
    });

    if (!backup) {
      res.status(404).json({
        error: 'BACKUP_NOT_FOUND',
        message: 'No encrypted key backup exists for this device.',
      });
      return;
    }

    res.json({
      deviceId: backup.deviceId,
      encryptedBackupBlob: backup.encryptedBackupBlob,
      backupVersion: backup.backupVersion,
      checksumSha256: backup.checksumSha256,
      updatedAt: backup.updatedAt,
    });
  } catch (error: any) {
    console.error('[KeyBackupRetrieveError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

export default router;
