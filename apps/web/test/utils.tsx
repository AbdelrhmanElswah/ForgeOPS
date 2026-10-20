import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';

/** Render inside a fresh QueryClient (no retries, so failures show up immediately). */
export function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

type Handler = (request: { url: URL; init: RequestInit; body: unknown }) => {
  status?: number;
  body?: unknown;
};

/**
 * Stubs the global fetch with a tiny fake API: `"GET /repositories": handler`. Unknown routes
 * answer 404 like the real API. Every call is recorded for assertions.
 */
export function fakeApi(routes: Record<string, Handler>) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      const method = init.method ?? 'GET';
      const path = url.pathname.replace('/api/v1', '');
      const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ method, path: path + url.search, body });
      const handler = routes[`${method} ${path}`];
      const result = handler
        ? handler({ url, init, body })
        : { status: 404, body: { title: 'Not Found', status: 404, code: 'not_found' } };
      const status = result.status ?? 200;
      return Promise.resolve(
        status === 204
          ? new Response(null, { status })
          : new Response(JSON.stringify(result.body), { status }),
      );
    }),
  );
  return { calls };
}
