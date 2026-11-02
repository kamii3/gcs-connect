/**
 * GCS CONNECT — Expired & Disappearing Messages Cleanup Service
 * Automatically purges expired messages where expiresAt <= NOW()
 * Strict Zero-Plaintext Policy: Expired messages are permanently wiped from the database.
 */

import prisma from '@/lib/db';

export async function purgeExpiredMessages(): Promise<number> {
  try {
    const now = new Date();
    const result = await prisma.message.deleteMany({
      where: {
        expiresAt: {
          not: null,
          lte: now,
        },
      },
    });

    if (result.count > 0) {
      console.log(`[MessageCleanup] Purged ${result.count} expired disappearing messages.`);
    }

    return result.count;
  } catch (error) {
    console.error('[MessageCleanupError] Failed to purge expired messages:', error);
    return 0;
  }
}
