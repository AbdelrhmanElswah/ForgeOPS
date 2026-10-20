import type { z } from 'zod';

import { ApiError } from './api/api-error';

/** Field path ("email", "limits.maxDiffLines") → message, the shape every form keeps in state. */
export type FieldErrors = Partial<Record<string, string>>;

/**
 * Client-side validation result → field errors. Paths are joined with "." to match the API's
 * problem-details paths, so client and server errors land on the same form field.
 */
export function zodFieldErrors(error: z.ZodError, depth = 2): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.slice(0, depth).map(String).join('.') || 'form';
    errors[path] ??= issue.message; // first problem per field is enough
  }
  return errors;
}

/**
 * A failed submit → what the form shows: field errors next to fields when the server sent them,
 * otherwise one message at the top of the form.
 */
export function describeSubmitError(
  error: unknown,
  fallback: string,
): { fieldErrors: FieldErrors; formError: string | null } {
  if (error instanceof ApiError) {
    const fieldErrors = error.fieldErrors();
    return Object.keys(fieldErrors).length > 0
      ? { fieldErrors, formError: null }
      : { fieldErrors: {}, formError: error.message };
  }
  return { fieldErrors: {}, formError: fallback };
}
