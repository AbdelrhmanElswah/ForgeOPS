import { z } from 'zod';

/**
 * Every environment variable the backend reads, in one place.
 * Both processes validate this at boot, so a typo in `.env` fails fast with a clear
 * message instead of surfacing as `undefined` deep inside a request hours later.
 */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  /** The Next.js origin allowed to call the API with credentials (CORS). */
  WEB_ORIGIN: z.url().default('http://localhost:3000'),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),

  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Used as `ConfigModule.forRoot({ validate })`. Returns the parsed, coerced values
 * (numbers are numbers, defaults applied). Error messages name the variables but
 * never echo their values, because some of them are secrets.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
