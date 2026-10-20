import type { Server } from 'node:http';

import {
  AUTH_COOKIES,
  AuthResponseSchema,
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  ProblemDetailsSchema,
} from '@forgeops/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp } from './utils/create-test-app.js';

const account = {
  email: '  Dev@Example.com ',
  password: 'correct horse battery staple',
  displayName: 'Dev',
};

/** Parses `Set-Cookie` headers into { name: { value, attributes } } for assertions. */
function cookiesOf(response: request.Response): Record<string, { value: string; attrs: string }> {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  return Object.fromEntries(
    (header ?? []).map((cookie) => {
      const [pair = '', ...attrs] = cookie.split(';');
      const [name = '', value = ''] = pair.split('=');
      return [name.trim(), { value, attrs: attrs.join(';').toLowerCase() }];
    }),
  );
}

describe('Auth (e2e)', () => {
  let app: INestApplication<Server>;
  let agent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    app = await createTestApp();
    // An agent keeps cookies between requests, like a browser.
    agent = request.agent(app.getHttpServer()).set(CSRF_HEADER, CSRF_HEADER_VALUE);
  });

  afterEach(async () => {
    await app.close();
  });

  it('registers, sets hardened cookies and never returns the password hash', async () => {
    const response = await agent.post('/api/v1/auth/register').send(account).expect(201);

    const { user } = AuthResponseSchema.parse(response.body);
    expect(user.email).toBe('dev@example.com'); // trimmed + lower-cased
    expect(JSON.stringify(response.body)).not.toMatch(/password/i);

    const cookies = cookiesOf(response);
    expect(cookies[AUTH_COOKIES.accessToken]?.attrs).toMatch(/httponly/);
    expect(cookies[AUTH_COOKIES.accessToken]?.attrs).toMatch(/samesite=lax/);
    expect(cookies[AUTH_COOKIES.accessToken]?.attrs).toMatch(/path=\//);
    expect(cookies[AUTH_COOKIES.refreshToken]?.attrs).toMatch(/path=\/api\/v1\/auth/);
    expect(cookies[AUTH_COOKIES.refreshToken]?.attrs).toMatch(/httponly/);
  });

  it('serves /auth/me to a signed-in browser and 401 to anyone else', async () => {
    await agent.post('/api/v1/auth/register').send(account).expect(201);

    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(AuthResponseSchema.parse(me.body).user.displayName).toBe('Dev');

    const anonymous = await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    expect(ProblemDetailsSchema.parse(anonymous.body).code).toBe('unauthenticated');
  });

  it('accepts the access token as a Bearer header (scripts, Swagger)', async () => {
    const response = await agent.post('/api/v1/auth/register').send(account).expect(201);
    const accessToken = cookiesOf(response)[AUTH_COOKIES.accessToken]?.value ?? '';

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('rejects state-changing requests without the CSRF header', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(account)
      .expect(403);

    expect(ProblemDetailsSchema.parse(response.body).code).toBe('forbidden');
  });

  it('logs in with the right password only', async () => {
    await agent.post('/api/v1/auth/register').send(account).expect(201);
    const fresh = request(app.getHttpServer());

    await fresh
      .post('/api/v1/auth/login')
      .set(CSRF_HEADER, CSRF_HEADER_VALUE)
      .send({ email: account.email, password: 'wrong password!!' })
      .expect(401);
    await fresh
      .post('/api/v1/auth/login')
      .set(CSRF_HEADER, CSRF_HEADER_VALUE)
      .send({ email: account.email, password: account.password })
      .expect(200);
  });

  it('returns 409 for a duplicate email', async () => {
    await agent.post('/api/v1/auth/register').send(account).expect(201);

    const response = await agent.post('/api/v1/auth/register').send(account).expect(409);
    expect(ProblemDetailsSchema.parse(response.body).code).toBe('conflict');
  });

  it('rotates the refresh token, and clears cookies when an old one is replayed', async () => {
    const registered = await agent.post('/api/v1/auth/register').send(account).expect(201);
    const firstRefresh = cookiesOf(registered)[AUTH_COOKIES.refreshToken]?.value ?? '';

    const refreshed = await agent.post('/api/v1/auth/refresh').expect(200);
    expect(cookiesOf(refreshed)[AUTH_COOKIES.refreshToken]?.value).not.toBe(firstRefresh);

    // Replay the first (already rotated) token from a different client.
    const replay = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set(CSRF_HEADER, CSRF_HEADER_VALUE)
      .set('cookie', `${AUTH_COOKIES.refreshToken}=${firstRefresh}`)
      .expect(401);
    expect(cookiesOf(replay)[AUTH_COOKIES.refreshToken]?.attrs).toMatch(/expires=thu, 01 jan 1970/);
  });

  it('logs out: the refresh token stops working and cookies are cleared', async () => {
    await agent.post('/api/v1/auth/register').send(account).expect(201);

    const logout = await agent.post('/api/v1/auth/logout').expect(204);
    expect(cookiesOf(logout)[AUTH_COOKIES.accessToken]?.value).toBe('');

    await agent.post('/api/v1/auth/refresh').expect(401);
  });
});
