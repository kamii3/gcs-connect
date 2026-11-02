/**
 * GCS CONNECT — Next.js Server Lifecycle Instrumentation
 * Automatically boots the Express REST API & Socket.IO server on port 3001
 * when Next.js standalone server starts in production.
 */

export async function register() {
  if (process.env.UNIFIED_SERVER === 'true') {
    return;
  }
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      console.log('[Instrumentation] Initializing GCS CONNECT Express & Socket.IO hub on port 3001...');
      const { startStandaloneApiServer } = await import('./server/server');
      startStandaloneApiServer();
    } catch (err: any) {
      console.error('[Instrumentation] Error starting API server:', err.message);
    }
  }
}
