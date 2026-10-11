import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../backend/api/src/app.js';
import { getDatabasePool, closeDatabasePool } from '../../backend/shared/src/db.js';

describe('Auth Integration Tests', () => {
  let app;
  let pool;
  const uniquePrefix = `test_${Date.now()}`;

  beforeAll(async () => {
    app = createApp();
    pool = getDatabasePool();
  });

  afterAll(async () => {
    await closeDatabasePool();
  });

  it('registers a new customer successfully with customer role', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `${uniquePrefix}_cust1@example.com`,
        password: 'ValidPassword123!',
        fullName: 'Test Customer'
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.email).toBe(`${uniquePrefix}_cust1@example.com`);
    expect(res.body.data.role).toBe('customer');
    expect(res.body.data.password_hash).toBeUndefined(); // Never leaked
  });

  it('rejects attempted role escalation via registration body with 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `${uniquePrefix}_cust_escalate@example.com`,
        password: 'ValidPassword123!',
        fullName: 'Attacker Admin',
        role: 'admin' // Attempted role escalation
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects duplicate email registration with 409 CONFLICT', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `${uniquePrefix}_cust1@example.com`,
        password: 'ValidPassword123!',
        fullName: 'Duplicate Customer'
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects passwords under 12 characters with 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `${uniquePrefix}_weak@example.com`,
        password: 'short',
        fullName: 'Weak Password'
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns identical 401 INVALID_CREDENTIALS for wrong password and unknown email', async () => {
    // 1. Wrong password
    const resWrongPass = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: `${uniquePrefix}_cust1@example.com`,
        password: 'WrongPassword999!'
      });

    // 2. Unknown email
    const resUnknownEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: `unknown_${Date.now()}@example.com`,
        password: 'WrongPassword999!'
      });

    expect(resWrongPass.status).toBe(401);
    expect(resWrongPass.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(resUnknownEmail.status).toBe(401);
    expect(resUnknownEmail.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(resWrongPass.body.error.message).toBe(resUnknownEmail.body.error.message);
  });

  it('logs in successfully, issues JWT access token and HttpOnly refresh cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: `${uniquePrefix}_cust1@example.com`,
        password: 'ValidPassword123!'
      });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.email).toBe(`${uniquePrefix}_cust1@example.com`);

    // Verify refresh cookie
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const refreshCookie = cookies.find((c) => c.startsWith('sf_refresh='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('SameSite=Strict');
  });

  it('handles refresh token rotation and detects reuse attacks', async () => {
    // 1. Login to get initial refresh cookie
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: `${uniquePrefix}_cust1@example.com`,
        password: 'ValidPassword123!'
      });

    const initialCookie = loginRes.headers['set-cookie'].find((c) => c.startsWith('sf_refresh='));
    const cookieValue = initialCookie.split(';')[0];

    // 2. Perform legitimate refresh (Rotates token)
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieValue)
      .set('X-Requested-With', 'supportflow')
      .set('Origin', 'http://localhost:5173');

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.accessToken).toBeDefined();
    const rotatedCookie = refreshRes.headers['set-cookie'].find((c) => c.startsWith('sf_refresh='));
    const rotatedCookieValue = rotatedCookie.split(';')[0];
    expect(rotatedCookieValue).not.toBe(cookieValue);

    // 3. Simulate reuse outside grace window: Backdate the revoked_at timestamp in DB
    const oldTokenRaw = cookieValue.replace('sf_refresh=', '');
    const crypto = await import('node:crypto');
    const oldHash = crypto.createHash('sha256').update(oldTokenRaw).digest('hex');

    await pool.query(
      `UPDATE refresh_tokens SET revoked_at = now() - interval '30 seconds' WHERE token_hash = $1`,
      [oldHash]
    );

    // 4. Attacker attempts to use old token
    const reuseRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieValue)
      .set('X-Requested-With', 'supportflow')
      .set('Origin', 'http://localhost:5173');

    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.error.code).toBe('REFRESH_REUSE_DETECTED');

    // 5. Verify the entire family was revoked: Even the new rotated token should now fail!
    const familyCheckRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', rotatedCookieValue)
      .set('X-Requested-With', 'supportflow')
      .set('Origin', 'http://localhost:5173');

    expect(familyCheckRes.status).toBe(401);
    expect(familyCheckRes.body.error.code).toBe('REFRESH_REUSE_DETECTED');
  });

  it('logs out and revokes the session family', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: `${uniquePrefix}_cust1@example.com`,
        password: 'ValidPassword123!'
      });

    const cookie = loginRes.headers['set-cookie'].find((c) => c.startsWith('sf_refresh='));

    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie.split(';')[0])
      .set('X-Requested-With', 'supportflow')
      .set('Origin', 'http://localhost:5173');

    expect(logoutRes.status).toBe(204);

    // Verify token cannot be used again
    const postLogoutRefresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie.split(';')[0])
      .set('X-Requested-With', 'supportflow')
      .set('Origin', 'http://localhost:5173');

    expect(postLogoutRefresh.status).toBe(401);
  });
});
