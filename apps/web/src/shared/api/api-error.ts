import type { ErrorCode, ProblemDetails } from '@forgeops/contracts';

/**
 * A failed API call, carrying the server's problem details when it sent them. UI code branches
 * on `code` (stable) rather than on messages (wording may change).
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ProblemDetails | null,
  ) {
    super(problem?.detail ?? problem?.title ?? `Request failed (HTTP ${String(status)})`);
    this.name = 'ApiError';
  }

  get code(): ErrorCode | null {
    return this.problem?.code ?? null;
  }

  get traceId(): string | undefined {
    return this.problem?.traceId;
  }

  /** Server-side validation errors keyed by field path, ready to show next to form fields. */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.problem?.errors ?? []).map((e) => [e.path, e.message]));
  }
}

/**
 * The server answered, but not in the shape the shared contract promises. That's a bug
 * (frontend and backend out of sync), never a user error, so it is kept separate.
 */
export class ContractError extends Error {
  constructor(
    readonly path: string,
    options?: ErrorOptions,
  ) {
    super(`Unexpected response shape from ${path}`, options);
    this.name = 'ContractError';
  }
}

/** The server's trace id of any error, if it is an ApiError that has one (for ErrorState). */
export function traceIdOf(error: unknown): string | undefined {
  return error instanceof ApiError ? error.traceId : undefined;
}
