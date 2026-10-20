import { STATUS_CODES } from 'node:http';

import type { ErrorCode, ProblemDetails } from '@forgeops/contracts';
import { HttpException } from '@nestjs/common';

import { DomainError, ValidationError } from '../errors/domain-error.js';

/** The single place where business error codes become HTTP status codes. */
const STATUS_BY_CODE: Record<ErrorCode, number> = {
  validation_failed: 400,
  bad_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  invalid_state_transition: 409,
  idempotency_key_reused: 422,
  rate_limited: 429,
  internal_error: 500,
  service_unavailable: 503,
};

/** For errors raised by the framework (guards, unknown routes, body parser), which carry only a status. */
const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  429: 'rate_limited',
  503: 'service_unavailable',
};

const GENERIC_SERVER_ERROR = 'An unexpected error occurred.';

/**
 * Converts anything thrown inside a request into an RFC 9457 problem.
 * Rule: 4xx details are safe to show (they describe the client's mistake);
 * 5xx details never leave the server, because they can reveal internals.
 */
export function toProblemDetails(exception: unknown): ProblemDetails {
  if (exception instanceof DomainError) {
    const status = STATUS_BY_CODE[exception.code];
    return {
      ...base(status, exception.code),
      detail: exception.message,
      ...(exception instanceof ValidationError && { errors: [...exception.fieldErrors] }),
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return { ...base(status, codeForStatus(status)), ...detailFor(status, exception) };
  }

  // Errors from Express middleware (e.g. body-parser's malformed JSON) follow the
  // `http-errors` convention: `expose: true` marks messages that are safe for clients.
  if (isExposedHttpError(exception)) {
    return {
      ...base(exception.status, codeForStatus(exception.status)),
      detail: exception.message,
    };
  }

  return { ...base(500, 'internal_error'), detail: GENERIC_SERVER_ERROR };
}

function base(status: number, code: ErrorCode): ProblemDetails {
  return { type: 'about:blank', title: STATUS_CODES[status] ?? 'Error', status, code };
}

function codeForStatus(status: number): ErrorCode {
  return CODE_BY_STATUS[status] ?? (status >= 500 ? 'internal_error' : 'bad_request');
}

function detailFor(status: number, exception: HttpException): { detail?: string } {
  if (status >= 500) {
    return { detail: GENERIC_SERVER_ERROR };
  }
  const response = exception.getResponse();
  if (typeof response === 'string') {
    return { detail: response };
  }
  const message = (response as { message?: unknown }).message;
  if (typeof message === 'string') {
    return { detail: message };
  }
  if (Array.isArray(message)) {
    return { detail: message.join('; ') };
  }
  return {};
}

function isExposedHttpError(
  value: unknown,
): value is { status: number; message: string; expose: true } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as { status?: unknown; expose?: unknown; message?: unknown };
  return (
    candidate.expose === true &&
    typeof candidate.status === 'number' &&
    candidate.status >= 400 &&
    candidate.status < 500 &&
    typeof candidate.message === 'string'
  );
}
