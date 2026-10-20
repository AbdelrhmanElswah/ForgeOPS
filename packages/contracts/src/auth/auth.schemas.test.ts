import { describe, expect, it } from 'vitest';

import { EmailSchema, RegisterRequestSchema } from './auth.schemas.js';

describe('EmailSchema', () => {
  it('normalises before validating', () => {
    expect(EmailSchema.parse('  Dev@Example.COM ')).toBe('dev@example.com');
  });

  it('rejects non-emails', () => {
    expect(EmailSchema.safeParse('not-an-email').success).toBe(false);
  });
});

describe('RegisterRequestSchema', () => {
  const valid = { email: 'dev@example.com', password: 'correct horse battery' };

  it('enforces the password length bounds', () => {
    expect(RegisterRequestSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false);
    expect(RegisterRequestSchema.safeParse({ ...valid, password: 'x'.repeat(129) }).success).toBe(
      false,
    );
    expect(RegisterRequestSchema.safeParse(valid).success).toBe(true);
  });
});
