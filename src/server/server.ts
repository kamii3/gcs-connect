import http from 'http';
import express, { Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = http.createServer(app);

const PORT = parseInt(process.env.API_PORT || process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://chat.globalcrestsolutions.com'
    : 'http://localhost:3000');

app.set('trust proxy', true);

// 1. Security Middlewares
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:', '*'],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      // allow requests with no origin (like mobile apps, curl, or same-origin proxy rewrites)
      if (!origin) return callback(null, true);
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));

// Catch body-parser malformed JSON or payload-too-large errors cleanly
app.use((err: any, req: Request, res: Response, next: any) => {
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400 && 'body' in err) {
    res.status(400).json({
      error: 'MALFORMED_JSON',
      message: 'Invalid JSON payload received in request body.',
    });
    return;
  }
  if (err.type === 'entity.too.large') {
    res.status(413).json({
      error: 'PAYLOAD_TOO_LARGE',
      message: 'Request payload exceeds maximum allowed size (10MB).',
    });
    return;
  }
  next(err);
});

app.use(cookieParser());

// Rate Limiting Middlewares
import { generalApiLimiter, strictAuthLimiter } from './middleware/rate-limiter';
app.use('/api', generalApiLimiter);
app.use('/api/auth/login', strictAuthLimiter);
app.use('/api/auth/register', strictAuthLimiter);

// 2. Mount API Routes
import authRouter from './routes/auth';
import adminRouter from './routes/admin';
import keysRouter from './routes/keys';
import conversationsRouter from './routes/conversations';
import messagesRouter from './routes/messages';
import usersRouter from './routes/users';
import mediaRouter from './routes/media';
import callsRouter from './routes/calls';

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/keys', keysRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api', messagesRouter);
app.use('/api/users', usersRouter);
app.use('/api/media', mediaRouter);
app.use('/api/calls', callsRouter);

// 3. Health & Diagnostic Routes
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ONLINE',
    service: 'GCS CONNECT Real-Time API & Signaling Hub',
    tagline: 'Connect Freely. Communicate Securely.',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsageMB: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    security: {
      zeroKnowledge: true,
      e2eeProtocols: ['X3DH', 'Double Ratchet', 'AES-256-GCM'],
      webrtcSecurity: 'DTLS-SRTP',
    },
  });
});

// 4. Fallback 404 Handler for undefined API endpoints
app.use('/api', (req: Request, res: Response) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Resource not found: ${req.method} ${req.originalUrl}`,
  });
});

// 5. Global Error Handling Middleware (Sanitizes stack traces and database schemas)
app.use((err: any, req: Request, res: Response, next: any) => {
  const statusCode = err.status || err.statusCode || 500;
  console.error('[UnhandledServerError]', {
    method: req.method,
    url: req.originalUrl,
    error: err.message,
    statusCode,
  });

  res.status(statusCode).json({
    error: err.name || 'INTERNAL_SERVER_ERROR',
    message: statusCode >= 500 ? 'An unexpected internal server error occurred.' : err.message,
  });
});

// 6. Socket.IO Real-Time Engine Setup
const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        origin.includes('globalcrestsolutions.com') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST'],
  },
  pingTimeout: 20000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
});

import { socketAuthMiddleware } from './socket/auth';
import { presenceManager } from './socket/presence';
import { registerSocketHandlers } from './socket/handlers';

// Enforce JWT handshake authentication
io.use(socketAuthMiddleware);

io.on('connection', async (socket) => {
  console.log(
    `[Socket.IO] Authenticated client connected: ${socket.id} (User: ${socket.data.user?.email}, Device: ${socket.data.device?.deviceName})`
  );

  // Register connection in presence manager & join personal rooms
  await presenceManager.registerConnection(socket, io);

  // Attach event listeners (room join/leave, typing, heartbeat)
  registerSocketHandlers(io, socket);

  socket.on('disconnect', async (reason) => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id} (Reason: ${reason})`);
    await presenceManager.registerDisconnection(socket, io);
  });
});

import { prisma } from '../lib/db';
import { hashPassword } from '../lib/auth-crypto';

async function bootstrapDatabase() {
  if (!process.env.DATABASE_URL) return;
  try {
    console.log('[Database] Verifying database connectivity...');
    await prisma.$connect();
    console.log('[Database] Connected to MySQL database successfully.');

    const adminEmail = process.env.ADMIN_INITIAL_EMAIL || 'admin@globalcrestsolutions.com';
    const adminPass = process.env.ADMIN_INITIAL_PASSWORD || 'Kamii@336';
    const existing = await prisma.user.findUnique({ where: { email: adminEmail } });

    if (!existing) {
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

export function startStandaloneApiServer() {
  if (server.listening) return;
  const API_PORT = parseInt(process.env.API_PORT || '3001', 10);
  server.listen(API_PORT, '127.0.0.1', () => {
    console.log(`=======================================================`);
    console.log(` GCS CONNECT — Real-Time API & Signaling Server`);
    console.log(` "Connect Freely. Communicate Securely."`);
    console.log(` Running on: http://127.0.0.1:${API_PORT}`);
    console.log(` Healthcheck: http://127.0.0.1:${API_PORT}/api/health`);
    console.log(` Allowed Origins: ${APP_URL}`);
    console.log(`=======================================================`);

    bootstrapDatabase().catch((dbErr) => {
      console.error('[DatabaseBootstrap] Notice:', dbErr.message);
    });
  });
}

// 4. Server Startup (only auto-start if executed directly as standalone API server)
const isStandaloneApi = Boolean(
  process.env.STANDALONE_API === 'true' ||
    (typeof process !== 'undefined' &&
      process.argv[1] &&
      (process.argv[1].endsWith('/src/server/server.ts') ||
        process.argv[1].endsWith('/src/server/server.js') ||
        process.argv[1].endsWith('\\src\\server\\server.ts') ||
        process.argv[1].endsWith('\\src\\server\\server.js')))
);

if (process.env.NODE_ENV !== 'test' && isStandaloneApi) {
  startStandaloneApiServer();
}

// 5. Graceful Shutdown
const handleShutdown = (signal: string) => {
  console.log(`\nReceived ${signal}. Shutting down GCS CONNECT server gracefully...`);
  server.close(() => {
    console.log('HTTP and WebSocket server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Process-wide Error Hardening
process.on('unhandledRejection', (reason: any) => {
  console.error('[ProcessUnhandledRejection]', reason?.message || reason);
});

process.on('uncaughtException', (err: Error) => {
  console.error('[ProcessUncaughtException]', err.message);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

export { app, server, io };
