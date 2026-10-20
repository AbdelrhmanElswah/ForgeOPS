import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.schema.js';

const required = {
  DATABASE_URL: 'postgresql://user:s3cret@localhost:5432/forgeops',
  REDIS_URL: 'redis://localhost:6379/0',
};

describe('validateEnv', () => {
  it('applies defaults and coerces numbers', () => {
    const env = validateEnv({ ...required, API_PORT: '4000' });

    expect(env.API_PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.WORKER_CONCURRENCY).toBe(2);
  });

  it('names every missing variable', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL[\s\S]*REDIS_URL/);
  });

  it('rejects a database URL with the wrong protocol', () => {
    expect(() => validateEnv({ ...required, DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('never leaks secret values into the error message', () => {
    try {
      validateEnv({ ...required, API_PORT: 'not-a-port' });
      expect.fail('should have thrown');
    } catch (error) {
      expect(String(error)).toContain('API_PORT');
      expect(String(error)).not.toContain('s3cret');
    }
  });
});
