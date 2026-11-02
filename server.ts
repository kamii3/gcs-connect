/**
 * GCS CONNECT — Production Unified Server
 * Seamlessly integrates Express API routes, Socket.IO WebSockets, and Next.js 14 frontend
 * into a single unified process for Hostinger Node.js production hosting.
 */

import http from 'http';
import next from 'next';
import { execSync } from 'child_process';

process.env.UNIFIED_SERVER = 'true';

import { app, server } from './src/server/server';

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const host = process.env.HOST || '0.0.0.0';

const nextApp = next({ dev, hostname: host, port });
const handle = nextApp.getRequestHandler();

async function start() {
  // 1. Auto-synchronize database schema & seed admin if DATABASE_URL is present
  if (process.env.DATABASE_URL) {
    try {
      console.log('[Database] Ensuring Prisma database schema is synchronized...');
      execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });
      console.log('[Database] Running administrator initialization seed...');
      execSync('npx tsx prisma/seed.ts', { stdio: 'inherit' });
      console.log('[Database] Synchronization complete.');
    } catch (dbErr: any) {
      console.error('[DatabaseSync] Database setup notification:', dbErr.message);
    }
  }

  // 2. Prepare Next.js application
  console.log(`[Boot] Preparing Next.js engine in ${dev ? 'development' : 'production'} mode...`);
  await nextApp.prepare();
  console.log('[Boot] Next.js engine ready.');

  // 3. Mount Next.js request handler for all non-Express routes
  app.all('*', (req, res) => {
    return handle(req, res);
  });

  // 4. Start listening on designated port
  server.listen(port, host, () => {
    console.log(`=======================================================`);
    console.log(` GCS CONNECT — Live Production Server Online`);
    console.log(` Host: http://${host}:${port}`);
    console.log(` Public Domain: https://chat.globalcrestsolutions.com`);
    console.log(` Mode: ${process.env.NODE_ENV || 'production'}`);
    console.log(` Healthcheck: http://${host}:${port}/api/health`);
    console.log(`=======================================================`);
  });
}

start().catch((err) => {
  console.error('[BootError] Fatal error starting unified server:', err);
  process.exit(1);
});
