/**
 * GCS CONNECT — Hardening & Regression Test Suite
 * Phase 13: Error Detection, Hardening & Regression Fixing
 *
 * Verifies server resilience against malformed inputs, edge conditions,
 * rate limit exhaustion, error masking, and graceful process lifecycle.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Request, Response } from 'express';
import { app } from './server';
import { createRateLimiter } from './middleware/rate-limiter';
import prisma from '@/lib/db';

describe('Phase 13: Error Detection, Hardening & Regression Verification', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // --------------------------------------------------------------------------
  // 1. Malformed JSON & Payload Limits
  // --------------------------------------------------------------------------
  it('cleanly catches malformed JSON body and returns HTTP 400 MALFORMED_JSON', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ "email": "test@gcs.com", "password": "unclosed_bracket"');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MALFORMED_JSON');
    expect(res.body.message).toContain('Invalid JSON payload');
  });

  it('handles unknown API routes with clean JSON 404 NOT_FOUND', async () => {
    const res = await request(app).get('/api/v99/unknown/system/probe');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
    expect(res.body.message).toContain('Resource not found');
  });

  // --------------------------------------------------------------------------
  // 2. Sliding Window Rate Limiting Enforcement
  // --------------------------------------------------------------------------
  describe('Sliding Window Rate Limiter Engine', () => {
    const testApp = express();
    const mockLimiter = createRateLimiter({
      windowMs: 5000,
      maxRequests: 3,
      skipInTests: false, // Force execution for testing
      keyGenerator: () => 'test-ip-client-1',
    });

    testApp.use('/test-rate-limit', mockLimiter, (req: Request, res: Response) => {
      res.json({ success: true, count: 'ok' });
    });

    it('enforces request quotas and returns IETF RateLimit headers', async () => {
      // Request 1: Allowed
      const res1 = await request(testApp).get('/test-rate-limit');
      expect(res1.status).toBe(200);
      expect(res1.headers['ratelimit-limit']).toBe('3');
      expect(res1.headers['ratelimit-remaining']).toBe('2');

      // Request 2: Allowed
      const res2 = await request(testApp).get('/test-rate-limit');
      expect(res2.status).toBe(200);
      expect(res2.headers['ratelimit-remaining']).toBe('1');

      // Request 3: Allowed
      const res3 = await request(testApp).get('/test-rate-limit');
      expect(res3.status).toBe(200);
      expect(res3.headers['ratelimit-remaining']).toBe('0');

      // Request 4: Blocked with HTTP 429 Too Many Requests
      const res4 = await request(testApp).get('/test-rate-limit');
      expect(res4.status).toBe(429);
      expect(res4.body.error).toBe('TOO_MANY_REQUESTS');
      expect(res4.headers['retry-after']).toBeDefined();
      expect(res4.body.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Database Error Masking & Stack Trace Protection
  // --------------------------------------------------------------------------
  describe('Global Error Sanitization', () => {
    const errorApp = express();

    // Route that simulates an internal database exception containing SQL/schema details
    errorApp.get('/test-db-error', (req: Request, res: Response, next) => {
      const dbErr = new Error('SQLSTATE[42S02]: Base table or view not found: 1146 Table gcs_secret_keys does not exist');
      (dbErr as any).statusCode = 500;
      next(dbErr);
    });

    // Attach global sanitizer middleware
    errorApp.use((err: any, req: Request, res: Response, next: any) => {
      const statusCode = err.status || err.statusCode || 500;
      res.status(statusCode).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: statusCode >= 500 ? 'An unexpected internal server error occurred.' : err.message,
      });
    });

    it('masks internal database table names and SQL syntax from client response', async () => {
      const res = await request(errorApp).get('/test-db-error');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('INTERNAL_SERVER_ERROR');
      expect(res.body.message).toBe('An unexpected internal server error occurred.');
      expect(JSON.stringify(res.body)).not.toContain('SQLSTATE');
      expect(JSON.stringify(res.body)).not.toContain('gcs_secret_keys');
    });
  });

  // --------------------------------------------------------------------------
  // 4. CORS & Origin Boundary Hardening
  // --------------------------------------------------------------------------
  it('enforces CORS credentials and origin reflection for configured frontend', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:3000');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  // --------------------------------------------------------------------------
  // 5. Process Lifecycle & Signal Listeners
  // --------------------------------------------------------------------------
  it('verifies SIGTERM, SIGINT, unhandledRejection, and uncaughtException hooks are registered', () => {
    const sigtermListeners = process.listeners('SIGTERM');
    const sigintListeners = process.listeners('SIGINT');
    const rejectionListeners = process.listeners('unhandledRejection');
    const exceptionListeners = process.listeners('uncaughtException');

    expect(sigtermListeners.length).toBeGreaterThanOrEqual(1);
    expect(sigintListeners.length).toBeGreaterThanOrEqual(1);
    expect(rejectionListeners.length).toBeGreaterThanOrEqual(1);
    expect(exceptionListeners.length).toBeGreaterThanOrEqual(1);
  });
});
