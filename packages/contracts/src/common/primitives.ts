import { z } from 'zod';

/** Every entity id is a UUID (v7 in practice: time-sortable, so it doubles as a pagination cursor). */
export const IdSchema = z.uuid();
export type Id = z.infer<typeof IdSchema>;

/** Timestamps cross the wire as ISO-8601 strings, never as Date objects. */
export const TimestampSchema = z.iso.datetime({ offset: true });

/** A full 40-character git commit SHA. Short SHAs are ambiguous, so we never accept them. */
export const CommitShaSchema = z
  .string()
  .regex(/^[0-9a-f]{40}$/, 'Must be a full 40-character lowercase commit SHA');

/**
 * A safe subset of git's ref-name rules (`git check-ref-format`).
 * Branch names reach git commands and GitHub API paths, so they are validated at the edge.
 */
export const GitRefNameSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9._/-]+$/, 'May only contain letters, digits, ".", "_", "/" and "-"')
  .refine(
    (ref) =>
      !ref.startsWith('-') &&
      !ref.startsWith('/') &&
      !ref.endsWith('/') &&
      !ref.endsWith('.') &&
      !ref.endsWith('.lock') &&
      !ref.includes('..') &&
      !ref.includes('//') &&
      !ref.includes('/.'),
    'Not a valid git branch name',
  );

/** Value of the `Idempotency-Key` header sent on unsafe requests (POST /tasks, /approve). */
export const IdempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, 'May only contain letters, digits, "_" and "-"');

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
