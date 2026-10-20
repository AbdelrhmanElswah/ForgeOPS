import {
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  IDEMPOTENCY_KEY_HEADER,
  ProblemDetailsSchema,
} from '@forgeops/contracts';
import type { z } from 'zod';

import { API_URL } from '../config';
import { ApiError, ContractError } from './api-error';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RequestOptions<S extends z.ZodType> {
  method?: Method;
  body?: unknown;
  /** The contract the response must match. Use `null` for endpoints that answer 204. */
  schema: S | null;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Defaults to the global fetch, looked up per call (so tests can stub it). */
  fetch?: typeof fetch;
}

const REFRESH_PATH = '/auth/refresh';
/** Auth endpoints answer 401 for wrong credentials: refreshing would never help them. */
const NO_REFRESH_PATHS = new Set(['/auth/login', '/auth/register', REFRESH_PATH, '/auth/logout']);

/**
 * The one way the dashboard talks to the API:
 * - cookies always included (the session lives in httpOnly cookies);
 * - the CSRF header on every state-changing request;
 * - every response validated against the shared Zod contract;
 * - errors turned into ApiError with the server's problem details;
 * - an expired access token refreshed transparently, once, then the request retried.
 */
export function createApiClient({ baseUrl, fetch: customFetch }: ApiClientOptions) {
  const fetchFn: typeof fetch = customFetch ?? ((input, init) => globalThis.fetch(input, init));
  // Who to tell when the session is gone for good. The client only announces it; the auth
  // feature decides what to do (redirect), so this shared layer knows nothing about routing.
  const expiredListeners = new Set<() => void>();
  // Single flight: ten requests that fail together trigger ONE refresh, not ten. (Ten would also
  // trip the server's refresh-token reuse detection and log the user out.)
  let refreshing: Promise<boolean> | null = null;

  const refreshSession = (): Promise<boolean> => {
    refreshing ??= send(REFRESH_PATH, { method: 'POST' })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  };

  function send(
    path: string,
    init: { method: Method; body?: unknown; idempotencyKey?: string; signal?: AbortSignal },
  ) {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (init.method !== 'GET') headers[CSRF_HEADER] = CSRF_HEADER_VALUE;
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    if (init.idempotencyKey) headers[IDEMPOTENCY_KEY_HEADER] = init.idempotencyKey;
    return fetchFn(`${baseUrl}/api/v1${path}`, {
      method: init.method,
      credentials: 'include',
      headers,
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
      ...(init.signal && { signal: init.signal }),
    });
  }

  async function request<S extends z.ZodType>(
    path: string,
    options: RequestOptions<S> & { schema: S },
  ): Promise<z.output<S>>;
  async function request(
    path: string,
    options: RequestOptions<z.ZodType> & { schema: null },
  ): Promise<void>;
  async function request<S extends z.ZodType>(
    path: string,
    options: RequestOptions<S>,
  ): Promise<z.output<S> | undefined> {
    const init = {
      method: options.method ?? 'GET',
      body: options.body,
      ...(options.idempotencyKey && { idempotencyKey: options.idempotencyKey }),
      ...(options.signal && { signal: options.signal }),
    };

    let response = await send(path, init);
    if (response.status === 401 && !NO_REFRESH_PATHS.has(path)) {
      if (await refreshSession()) {
        response = await send(path, init);
      } else {
        expiredListeners.forEach((listener) => {
          listener();
        });
      }
    }

    if (!response.ok) {
      throw new ApiError(response.status, await readProblem(response));
    }
    if (options.schema === null || response.status === 204) {
      return undefined;
    }
    const parsed = options.schema.safeParse(await response.json());
    if (!parsed.success) {
      throw new ContractError(path, { cause: parsed.error });
    }
    return parsed.data;
  }

  /** Subscribe to "the session expired and could not be refreshed". Returns an unsubscribe. */
  function onSessionExpired(listener: () => void): () => void {
    expiredListeners.add(listener);
    return () => {
      expiredListeners.delete(listener);
    };
  }

  return { request, onSessionExpired, baseUrl };
}

export type ApiClient = ReturnType<typeof createApiClient>;

async function readProblem(response: Response) {
  try {
    const parsed = ProblemDetailsSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The app-wide client. */
export const api = createApiClient({ baseUrl: API_URL });
