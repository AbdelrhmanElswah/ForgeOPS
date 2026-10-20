import type { ErrorCode, FieldError } from '@forgeops/contracts';

/**
 * Base class for errors that are part of the business vocabulary ("task not found",
 * "illegal status transition"). Use cases throw these; they know nothing about HTTP.
 * The HTTP layer maps `code` to a status code in one place (problem-details.mapper.ts),
 * so the same error can later surface through SSE or a CLI without changes.
 */
export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  readonly code = 'validation_failed';

  constructor(
    readonly fieldErrors: readonly FieldError[],
    message = 'The request is invalid.',
  ) {
    super(message);
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'not_found';

  constructor(resource: string) {
    super(`${resource} was not found.`);
  }
}

export class ForbiddenError extends DomainError {
  readonly code = 'forbidden';
}

export class ConflictError extends DomainError {
  readonly code = 'conflict';
}
