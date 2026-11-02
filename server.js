/**
 * GCS CONNECT — Node.js Production Entry Point
 * Used by Hostinger Cloud Hosting to boot the application.
 */

const { spawn } = require('child_process');
const path = require('path');

const port = process.env.PORT || '3000';
const host = process.env.HOST || '0.0.0.0';

console.log(`[Hostinger] Booting GCS CONNECT on ${host}:${port}...`);

const tsxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(tsxCmd, ['tsx', path.join(__dirname, 'server.ts')], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: String(port),
    HOST: host,
    NODE_ENV: process.env.NODE_ENV || 'production',
    UNIFIED_SERVER: 'true',
  },
});

child.on('exit', (code, signal) => {
  if (code !== null) {
    process.exit(code);
  } else if (signal) {
    process.kill(process.pid, signal);
  }
});

process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
