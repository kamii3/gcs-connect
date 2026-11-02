/**
 * GCS CONNECT — Encrypted Media & File Storage API
 * Strictly enforces Zero-Plaintext storage: only AES-256-GCM ciphertexts are stored.
 * Decryption keys are NEVER transmitted to the server.
 * Storage files are strictly non-public and require conversation membership authorization.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import prisma from '@/lib/db';
import { authenticate } from '@/server/middleware/auth';

const router = Router();
const STORAGE_DIR = path.join(process.cwd(), 'storage', 'encrypted_media');

// Validation Schemas
const uploadMediaSchema = z.object({
  messageId: z.string().uuid('Valid message ID is required'),
  ciphertextBase64: z.string().min(1, 'Encrypted media ciphertext is required'),
  thumbnailCiphertextBase64: z.string().optional(),
  encryptedMimeType: z.string().min(1, 'Encrypted MIME type descriptor is required'),
  ciphertextSha256: z.string().length(64, 'SHA-256 hex checksum must be 64 characters'),
});

/**
 * POST /api/media/upload
 * Upload an encrypted media ciphertext payload for a message
 */
router.post('/upload', authenticate, async (req: Request, res: Response) => {
  try {
    const callerId = req.user!.id;
    const parsed = uploadMediaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.format() });
      return;
    }

    const {
      messageId,
      ciphertextBase64,
      thumbnailCiphertextBase64,
      encryptedMimeType,
      ciphertextSha256,
    } = parsed.data;

    // 1. Verify parent message exists and caller is authorized
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            members: {
              where: { leftAt: null },
            },
          },
        },
        senderDevice: true,
      },
    });

    if (!message) {
      res.status(404).json({ error: 'MESSAGE_NOT_FOUND', message: 'Parent message does not exist.' });
      return;
    }

    // Verify caller is member of conversation
    const isMember = message.conversation.members.some((m) => m.userId === callerId);
    if (!isMember) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Not authorized for this conversation.' });
      return;
    }

    // 2. Decode ciphertext bytes and verify SHA-256 integrity
    const cipherBuffer = Buffer.from(ciphertextBase64, 'base64');
    const computedSha = crypto.createHash('sha256').update(cipherBuffer).digest('hex');

    if (computedSha.toLowerCase() !== ciphertextSha256.toLowerCase()) {
      res.status(400).json({
        error: 'INTEGRITY_MISMATCH',
        message: 'Calculated SHA-256 checksum does not match provided ciphertext hash.',
      });
      return;
    }

    // 3. Ensure storage directory exists
    await fs.mkdir(STORAGE_DIR, { recursive: true });

    // 4. Save ciphertext to disk with randomized filename
    const attachmentId = crypto.randomUUID();
    const filePath = path.join(STORAGE_DIR, `${attachmentId}.bin`);
    await fs.writeFile(filePath, cipherBuffer);

    let thumbPath: string | null = null;
    if (thumbnailCiphertextBase64) {
      const thumbBuffer = Buffer.from(thumbnailCiphertextBase64, 'base64');
      thumbPath = path.join(STORAGE_DIR, `${attachmentId}_thumb.bin`);
      await fs.writeFile(thumbPath, thumbBuffer);
    }

    // 5. Create Attachment database record
    const attachment = await prisma.attachment.create({
      data: {
        id: attachmentId,
        messageId,
        storagePath: filePath,
        encryptedMimeType,
        fileSizeBytes: BigInt(cipherBuffer.length),
        ciphertextSha256: computedSha,
        thumbnailStoragePath: thumbPath,
      },
    });

    res.status(201).json({
      success: true,
      attachment: {
        id: attachment.id,
        messageId: attachment.messageId,
        fileSizeBytes: Number(attachment.fileSizeBytes),
        ciphertextSha256: attachment.ciphertextSha256,
        hasThumbnail: Boolean(thumbPath),
        createdAt: attachment.createdAt,
      },
    });
  } catch (error: any) {
    console.error('[MediaUploadError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * GET /api/media/:id
 * Retrieve and stream encrypted media ciphertext (Strictly authorized)
 */
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const callerId = req.user!.id;

    const attachment = await prisma.attachment.findUnique({
      where: { id },
      include: {
        message: {
          include: {
            conversation: {
              include: {
                members: {
                  where: { leftAt: null },
                },
              },
            },
          },
        },
      },
    });

    if (!attachment) {
      res.status(404).json({ error: 'MEDIA_NOT_FOUND', message: 'Encrypted media does not exist.' });
      return;
    }

    // Authorization Guard: Verify caller is active member of conversation
    const isMember = attachment.message.conversation.members.some((m) => m.userId === callerId);
    if (!isMember) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Unauthorized: You are not a member of the conversation containing this media.',
      });
      return;
    }

    // Check if file exists on disk
    try {
      await fs.access(attachment.storagePath);
    } catch {
      res.status(404).json({ error: 'FILE_MISSING', message: 'Encrypted storage file is missing on host.' });
      return;
    }

    const fileBuffer = await fs.readFile(attachment.storagePath);

    // Stream ciphertext with security headers (never public, never cached on intermediaries)
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('X-Ciphertext-SHA256', attachment.ciphertextSha256);
    res.setHeader('X-Encrypted-MIME', attachment.encryptedMimeType);
    res.setHeader('Content-Length', fileBuffer.length.toString());
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.send(fileBuffer);
  } catch (error: any) {
    console.error('[MediaDownloadError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

/**
 * GET /api/media/:id/thumbnail
 * Retrieve and stream encrypted thumbnail ciphertext
 */
router.get('/:id/thumbnail', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const callerId = req.user!.id;

    const attachment = await prisma.attachment.findUnique({
      where: { id },
      include: {
        message: {
          include: {
            conversation: {
              include: {
                members: {
                  where: { leftAt: null },
                },
              },
            },
          },
        },
      },
    });

    if (!attachment || !attachment.thumbnailStoragePath) {
      res.status(404).json({ error: 'THUMBNAIL_NOT_FOUND', message: 'Encrypted thumbnail does not exist.' });
      return;
    }

    // Authorization Guard
    const isMember = attachment.message.conversation.members.some((m) => m.userId === callerId);
    if (!isMember) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Unauthorized: You are not a member of the conversation containing this thumbnail.',
      });
      return;
    }

    const thumbBuffer = await fs.readFile(attachment.thumbnailStoragePath);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', thumbBuffer.length.toString());
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.send(thumbBuffer);
  } catch (error: any) {
    console.error('[ThumbnailDownloadError]', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
});

export default router;
