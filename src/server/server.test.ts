import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from './server';

describe('Server API & Healthcheck', () => {
  it('GET /api/health returns 200 OK with correct service metadata', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ONLINE');
    expect(res.body).toHaveProperty('service', 'GCS CONNECT Real-Time API & Signaling Hub');
    expect(res.body).toHaveProperty('tagline', 'Connect Freely. Communicate Securely.');
    expect(res.body.security.zeroKnowledge).toBe(true);
    expect(res.body.security.e2eeProtocols).toContain('Double Ratchet');
    expect(res.body.security.webrtcSecurity).toBe('DTLS-SRTP');
  });

  it('includes security headers from Helmet', async () => {
    const res = await request(app).get('/api/health');

    expect(res.headers).toHaveProperty('x-content-type-options', 'nosniff');
    expect(res.headers).toHaveProperty('x-frame-options', 'SAMEORIGIN');
    expect(res.headers).toHaveProperty('content-security-policy');
  });

  it('returns 404 for unknown endpoints', async () => {
    const res = await request(app).get('/api/unknown-route');
    expect(res.status).toBe(404);
  });
});
