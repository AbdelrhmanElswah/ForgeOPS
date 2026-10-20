import { AuthResponseSchema, CSRF_HEADER } from '@forgeops/contracts';
import { describe, expect, it, vi } from 'vitest';

import { ApiError, ContractError } from './api-error';
import { createApiClient } from './client';

const user = {
  id: '0192f0c4-7a3e-7c1d-9b2a-5e6f7a8b9c0d',
  email: 'dev@example.com',
  displayName: null,
  createdAt: '2026-10-20T10:00:00.000Z',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json' },
  });

/** A fake server: answers by path, records every call. */
function fakeServer(routes: Record<string, () => Response>) {
  const calls: { path: string; init: RequestInit }[] = [];
  const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(input instanceof Request ? input.url : input.toString()).pathname.replace(
      '/api/v1',
      '',
    );
    calls.push({ path, init: init ?? {} });
    const route = routes[path];
    return Promise.resolve(
      route ? route() : json(404, { title: 'Not Found', status: 404, code: 'not_found' }),
    );
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

describe('API client', () => {
  it('sends cookies, validates the response against the contract, and returns it', async () => {
    const server = fakeServer({ '/auth/me': () => json(200, { user }) });
    const api = createApiClient({ baseUrl: 'http://api.test', fetch: server.fetch });

    const result = await api.request('/auth/me', { schema: AuthResponseSchema });

    expect(result.user.email).toBe('dev@example.com');
    expect(server.calls[0]?.init.credentials).toBe('include');
  });

  it('adds the CSRF header to state-changing requests only', async () => {
    const server = fakeServer({
      '/auth/me': () => json(200, { user }),
      '/auth/logout': () => new Response(null, { status: 204 }),
    });
    const api = createApiClient({ baseUrl: 'http://api.test', fetch: server.fetch });

    await api.request('/auth/me', { schema: AuthResponseSchema });
    await api.request('/auth/logout', { method: 'POST', schema: null });

    const headers = (i: number) => server.calls[i]?.init.headers as Record<string, string>;
    expect(headers(0)[CSRF_HEADER]).toBeUndefined();
    expect(headers(1)[CSRF_HEADER]).toBe('1');
  });

  it('turns problem details into an ApiError with field errors', async () => {
    const server = fakeServer({
      '/auth/register': () =>
        json(400, {
          title: 'Bad Request',
          status: 400,
          code: 'validation_failed',
          errors: [{ path: 'email', message: 'Invalid email address' }],
          traceId: 'req-1',
        }),
    });
    const api = createApiClient({ baseUrl: 'http://api.test', fetch: server.fetch });

    const error = await api
      .request('/auth/register', { method: 'POST', body: {}, schema: AuthResponseSchema })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('validation_failed');
    expect((error as ApiError).fieldErrors()).toEqual({ email: 'Invalid email address' });
    expect((error as ApiError).traceId).toBe('req-1');
  });

  it('reports a response that breaks the contract as a ContractError (a bug, not user error)', async () => {
    const server = fakeServer({ '/auth/me': () => json(200, { user: { id: 42 } }) });
    const api = createApiClient({ baseUrl: 'http://api.test', fetch: server.fetch });

    await expect(api.request('/auth/me', { schema: AuthResponseSchema })).rejects.toBeInstanceOf(
      ContractError,
    );
  });

  describe('expired access token', () => {
    it('refreshes once and retries transparently', async () => {
      let meCalls = 0;
      const server = fakeServer({
        '/auth/me': () =>
          ++meCalls === 1
            ? json(401, { title: 'Unauthorized', status: 401, code: 'unauthenticated' })
            : json(200, { user }),
        '/auth/refresh': () => json(200, { user }),
      });
      const api = createApiClient({ baseUrl: 'http://api.test', fetch: server.fetch });

      await expect(api.request('/auth/me', { schema: AuthResponseSchema })).resolves.toMatchObject({
        user,
      });
      expect(server.calls.map((c) => c.path)).toEqual(['/auth/me', '/auth/refresh', '/auth/me']);
    });

    it('uses ONE refresh for many requests failing at once (or the server would see token reuse)', async () => {
      let refreshed = false;
      const server = fakeServer({
        '/auth/me': () =>
          refreshed
            ? json(200, { user })
            : json(401, { title: 'Unauthorized', status: 401, code: 'unauthenticated' }),
        '/auth/refresh': () => {
          refreshed = true;
          return json(200, { user });
        },
      });
      const api = createApiClient({ baseUrl: 'http://api.test', fetch: server.fetch });

      await Promise.all(
        Array.from({ length: 5 }, () => api.request('/auth/me', { schema: AuthResponseSchema })),
      );

      expect(server.calls.filter((c) => c.path === '/auth/refresh')).toHaveLength(1);
    });

    it('announces the expired session when the refresh fails too', async () => {
      const unauthorized = () =>
        json(401, { title: 'Unauthorized', status: 401, code: 'unauthenticated' });
      const server = fakeServer({ '/auth/me': unauthorized, '/auth/refresh': unauthorized });
      const api = createApiClient({ baseUrl: 'http://api.test', fetch: server.fetch });
      const expired = vi.fn();
      api.onSessionExpired(expired);

      await expect(api.request('/auth/me', { schema: AuthResponseSchema })).rejects.toBeInstanceOf(
        ApiError,
      );
      expect(expired).toHaveBeenCalledOnce();
    });

    it('never tries to refresh for a failed login (wrong password is not an expired session)', async () => {
      const server = fakeServer({
        '/auth/login': () =>
          json(401, { title: 'Unauthorized', status: 401, code: 'unauthenticated' }),
      });
      const api = createApiClient({ baseUrl: 'http://api.test', fetch: server.fetch });

      await expect(
        api.request('/auth/login', { method: 'POST', body: {}, schema: AuthResponseSchema }),
      ).rejects.toBeInstanceOf(ApiError);
      expect(server.calls.map((c) => c.path)).toEqual(['/auth/login']);
    });
  });
});
