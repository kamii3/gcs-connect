/**
 * GCS CONNECT — High-Performance In-Memory Sliding Window Rate Limiter
 * Phase 13: Error Detection, Hardening & Regression Fixing
 *
 * Implements sliding-window token tracking to prevent brute-force attacks,
 * credential stuffing, and DDoS abuse while remaining zero-dependency.
 */

import { Request, Response, NextFunction } from 'express';

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skipInTests?: boolean;
}

interface ClientRecord {
  timestamps: number[];
}

export function createRateLimiter(options: RateLimiterOptions) {
  const {
    windowMs,
    maxRequests,
    message = 'Rate limit exceeded. Please wait before retrying.',
    keyGenerator = (req: Request) =>
      req.ip || req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress || '127.0.0.1',
    skipInTests = true,
  } = options;

  const hits = new Map<string, ClientRecord>();

  // Periodic eviction of stale client records every 2 minutes
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    hits.forEach((record, key) => {
      record.timestamps = record.timestamps.filter((t) => now - t < windowMs);
      if (record.timestamps.length === 0) {
        hits.delete(key);
      }
    });
  }, Math.max(windowMs, 60000));

  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return function rateLimiterMiddleware(req: Request, res: Response, next: NextFunction) {
    // In test environment, skip rate limiting unless specifically testing rate limiter
    if (skipInTests && process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit']) {
      return next();
    }

    const key = keyGenerator(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    let record = hits.get(key);
    if (!record) {
      record = { timestamps: [] };
      hits.set(key, record);
    }

    // Filter to requests within current window
    record.timestamps = record.timestamps.filter((t) => t > windowStart);

    const currentCount = record.timestamps.length;
    const remaining = Math.max(0, maxRequests - currentCount - 1);
    const resetTimeSeconds = Math.ceil(
      (record.timestamps.length > 0 ? record.timestamps[0] + windowMs - now : windowMs) / 1000
    );

    // Standard IETF RateLimit Headers
    res.setHeader('RateLimit-Limit', maxRequests.toString());
    res.setHeader('RateLimit-Remaining', remaining.toString());
    res.setHeader('RateLimit-Reset', resetTimeSeconds.toString());

    if (currentCount >= maxRequests) {
      res.setHeader('Retry-After', resetTimeSeconds.toString());
      res.status(429).json({
        error: 'TOO_MANY_REQUESTS',
        message,
        retryAfterSeconds: resetTimeSeconds,
      });
      return;
    }

    record.timestamps.push(now);
    next();
  };
}

/**
 * Standard General API Rate Limiter: 120 requests / minute per client
 */
export const generalApiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120,
  message: 'Too many API requests from this source. Please slow down.',
});

/**
 * Strict Auth & Login Rate Limiter: 10 requests / minute per client
 */
export const strictAuthLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
  message: 'Too many authentication attempts. Account access temporarily throttled.',
});
