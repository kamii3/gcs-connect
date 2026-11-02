/**
 * GCS CONNECT — Production Unified Server
 * Seamlessly integrates Express API routes, Socket.IO WebSockets, and Next.js 14 frontend
 * into a single unified process for Hostinger Node.js production hosting.
 */

process.env.UNIFIED_SERVER = 'true';

import 'dotenv/config';
import next from 'next';
import { app, server } from './src/server/server';
import { prisma } from './src/lib/db';
import { hashPassword } from './src/lib/auth-crypto';

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const host = process.env.HOST || '0.0.0.0';

const nextApp = next({ dev, hostname: host, port });
const handle = nextApp.getRequestHandler();

async function bootstrapDatabase() {
  if (!process.env.DATABASE_URL) return;
  try {
    console.log('[Database] Verifying database connectivity...');
    await prisma.$connect();
    console.log('[Database] Connected to MySQL database successfully.');

    const adminEmail = process.env.ADMIN_INITIAL_EMAIL || 'admin@globalcrestsolutions.com';
    const existing = await prisma.user.findUnique({ where: { email: adminEmail } });

    if (!existing) {
      const adminPass = process.env.ADMIN_INITIAL_PASSWORD;
      if (!adminPass) {
        console.warn(
          '[Database] No initial administrator exists. Set ADMIN_INITIAL_PASSWORD to bootstrap one.'
        );
        return;
      }
      console.log(`[Database] Bootstrapping initial administrator (${adminEmail})...`);
      const passwordHash = await hashPassword(adminPass);
      await prisma.user.create({
        data: {
          email: adminEmail,
          passwordHash,
          fullName: process.env.ADMIN_INITIAL_NAME || 'Global Crest Administrator',
          displayName: 'System Admin',
          status: 'ACTIVE',
          roles: {
            create: {
              role: 'SUPER_ADMIN',
              assignedBy: 'SYSTEM_BOOTSTRAP',
            },
          },
        },
      });
      console.log(`[Database] ✓ Administrator bootstrap complete: ${adminEmail}`);
    } else {
      console.log(`[Database] ✓ Administrator account verified: ${adminEmail}`);
    }
  } catch (err: any) {
    console.warn('[Database] Background bootstrap notice:', err.message);
  }
}

async function start() {
  console.log(`[Boot] Preparing Next.js engine in ${dev ? 'development' : 'production'} mode...`);
  await nextApp.prepare();
  console.log('[Boot] Next.js engine ready.');

  // Mount Next.js request handler for all non-Express routes
  app.all('*', (req: any, res: any) => {
    return handle(req, res);
  });

  // Start listening on designated port
  server.listen(port, () => {
    console.log(`=======================================================`);
    console.log(` GCS CONNECT — Live Production Server Online`);
    console.log(` Port: ${port}`);
    console.log(` Mode: ${process.env.NODE_ENV || 'production'}`);
    console.log(` Healthcheck: http://127.0.0.1:${port}/api/health`);
    console.log(`=======================================================`);

    // Asynchronously bootstrap database in background
    bootstrapDatabase().catch((dbErr) => {
      console.error('[DatabaseBootstrap] Notice:', dbErr.message);
    });
  });
}

start().catch((err) => {
  console.error('[BootError] Fatal error starting unified server:', err);
  process.exit(1);
});
