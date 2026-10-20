import { z } from 'zod';

/**
 * Machine-readable error codes. Clients branch on `code`, never on `title` or `detail`,
 * so wording can change without breaking the frontend.
 */
export const ERROR_CODES = [
  'validation_failed',
  'bad_request',
  'unauthenticated',
  'forbidden',
  'not_found',
  'conflict',
  'invalid_state_transition',
  'idempotency_key_reused',
  'rate_limited',
  'internal_error',
  'service_unavailable',
] as const;

export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const FieldErrorSchema = z.object({
  /** Dotted path to the offending field, e.g. `instruction` or `settings.testCommand`. */
  path: z.string(),
  message: z.string(),
});
export type FieldError = z.infer<typeof FieldErrorSchema>;

/** RFC 9457 (formerly 7807) Problem Details, served as `application/problem+json`. */
export const ProblemDetailsSchema = z.object({
  type: z.string().default('about:blank'),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  code: ErrorCodeSchema,
  errors: z.array(FieldErrorSchema).optional(),
  /** Lets a user quote an id that maps straight to our logs and traces. */
  traceId: z.string().optional(),
});
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';
