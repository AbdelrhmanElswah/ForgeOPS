import { z } from 'zod';

import { IdSchema, TimestampSchema } from '../common/primitives.js';

/** Cookie names are part of the contract: the Next.js middleware checks for the session cookie. */
export const AUTH_COOKIES = {
  accessToken: 'forgeops_at',
  refreshToken: 'forgeops_rt',
} as const;

/**
 * Every state-changing request must carry this header. Browsers can't add custom headers to
 * cross-site form posts, and CORS only lets our own web origin send it, so its presence
 * proves the request came from our frontend (CSRF defence on top of SameSite cookies).
 */
export const CSRF_HEADER = 'x-forgeops-csrf';
export const CSRF_HEADER_VALUE = '1';

export const PASSWORD_MIN_LENGTH = 12;
/** An upper bound stops "hash a 10 MB password" denial-of-service against argon2. */
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Emails are compared case-insensitively, so they are normalised at the edge.
 * Normalise first, then validate: `z.email().trim()` would check the format before trimming.
 */
export const EmailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH);

export const RegisterRequestSchema = z.strictObject({
  email: EmailSchema,
  password: PasswordSchema,
  displayName: z.string().trim().min(1).max(100).optional(),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.strictObject({
  email: EmailSchema,
  // No length rules on login: a policy change must not lock out existing users.
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const UserSchema = z.object({
  id: IdSchema,
  email: z.email(),
  displayName: z.string().nullable(),
  createdAt: TimestampSchema,
});
export type User = z.infer<typeof UserSchema>;

/** Tokens travel only in httpOnly cookies, so the body carries just the user. */
export const AuthResponseSchema = z.object({ user: UserSchema });
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
