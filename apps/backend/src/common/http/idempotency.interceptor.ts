import { createHash } from 'node:crypto';

import { IDEMPOTENCY_KEY_HEADER, IdempotencyKeySchema } from '@forgeops/contracts';
import {
  applyDecorators,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import type { Request } from 'express';
import { catchError, concatMap, from, type Observable, of, throwError } from 'rxjs';

import { KeyValueStore } from '../../infrastructure/redis/key-value.store.js';
import {
  ConflictError,
  IdempotencyKeyReusedError,
  ValidationError,
} from '../errors/domain-error.js';

/** Long enough to cover any client retry policy; short enough to keep Redis small. */
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

type StoredRequest =
  { state: 'pending'; requestHash: string } | { state: 'done'; requestHash: string; body: unknown };

/**
 * Makes an unsafe endpoint safe to retry. A client that times out and resends the same
 * request (same Idempotency-Key, same body) gets the original response instead of a second
 * task. The key is scoped to the user and the route.
 *
 *  first request  → claim the key (pending) → run the handler → store the response (done)
 *  retry, done    → replay the stored response; the handler does not run again
 *  retry, pending → 409: the first request is still running
 *  same key, different body → 422: almost certainly a client bug, never silently merged
 *  handler fails  → release the key, so the client can retry
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly store: KeyValueStore) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request & { user?: { id: string } }>();
    const key = IdempotencyKeySchema.safeParse(request.headers[IDEMPOTENCY_KEY_HEADER]);
    if (!key.success) {
      throw new ValidationError([
        {
          path: `headers.${IDEMPOTENCY_KEY_HEADER}`,
          message: 'An Idempotency-Key header (8-128 letters, digits, "_" or "-") is required.',
        },
      ]);
    }

    const storeKey = [
      'idempotency',
      request.user?.id ?? 'anonymous',
      request.method,
      request.path,
      key.data,
    ].join(':');
    const requestHash = hash(request.body);

    const claimed = await this.store.setIfAbsent(
      storeKey,
      JSON.stringify({ state: 'pending', requestHash } satisfies StoredRequest),
      IDEMPOTENCY_TTL_SECONDS,
    );
    if (!claimed) {
      return of(await this.replay(storeKey, requestHash));
    }

    return next.handle().pipe(
      // Success: remember the response for replays.
      concatMap((body: unknown) =>
        from(
          this.store
            .set(
              storeKey,
              JSON.stringify({ state: 'done', requestHash, body } satisfies StoredRequest),
              IDEMPOTENCY_TTL_SECONDS,
            )
            .then(() => body),
        ),
      ),
      // Failure: release the key, then rethrow the original error unchanged.
      catchError((error: unknown) =>
        from(this.store.delete(storeKey)).pipe(concatMap(() => throwError(() => error))),
      ),
    );
  }

  private async replay(storeKey: string, requestHash: string): Promise<unknown> {
    const raw = await this.store.get(storeKey);
    const stored = raw ? (JSON.parse(raw) as StoredRequest) : null;
    if (!stored) {
      throw new ConflictError('A request with this Idempotency-Key is still being processed.');
    }
    if (stored.requestHash !== requestHash) {
      throw new IdempotencyKeyReusedError();
    }
    if (stored.state === 'pending') {
      throw new ConflictError('A request with this Idempotency-Key is still being processed.');
    }
    return stored.body;
  }
}

/** `@Idempotent()` on a POST handler: requires the header and applies the interceptor. */
export const Idempotent = (): MethodDecorator =>
  applyDecorators(
    UseInterceptors(IdempotencyInterceptor),
    ApiHeader({
      name: 'Idempotency-Key',
      required: true,
      description: 'Unique per logical request; reuse it when retrying the same request.',
    }),
  );

/** Hash of the body with object keys sorted, so `{a,b}` and `{b,a}` count as the same request. */
function hash(value: unknown): string {
  return createHash('sha256')
    .update(stableStringify(value ?? null))
    .digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}
