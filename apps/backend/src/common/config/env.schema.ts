import { z } from 'zod';

/**
 * Every environment variable the backend reads, in one place.
 * Both processes validate this at boot, so a typo in `.env` fails fast with a clear
 * message instead of surfacing as `undefined` deep inside a request hours later.
 */
export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    /** The Next.js origin allowed to call the API with credentials (CORS). */
    WEB_ORIGIN: z.url().default('http://localhost:3000'),

    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),

    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),

    /** HMAC key for access tokens. Generate with: node -e "console.log(crypto.randomBytes(48).toString('base64url'))" */
    JWT_ACCESS_SECRET: z.string().min(32, 'Must be at least 32 characters of random data'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),

    // Agents. Every role defaults to LLM_MODEL; a per-role model is a deliberate cost/quality
    // choice (measure it with the evals). The Anthropic SDK reads its own credentials
    // (ANTHROPIC_API_KEY or an `ant auth login` profile).
    LLM_MODEL: z.string().min(1).default('claude-opus-5-5'),
    LLM_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('high'),
    LLM_MODEL_PLANNER: z.string().min(1).optional(),
    LLM_MODEL_INVESTIGATOR: z.string().min(1).optional(),
    LLM_MODEL_IMPLEMENTER: z.string().min(1).optional(),
    LLM_MODEL_REVIEWER: z.string().min(1).optional(),
    /** Hard per-task ceilings; a run that would cross one stops with budget_exceeded. */
    TASK_MAX_COST_USD: z.coerce.number().positive().max(100).default(5),
    TASK_MAX_LLM_CALLS: z.coerce.number().int().min(1).max(500).default(40),
    TASK_MAX_TOOL_CALLS: z.coerce.number().int().min(1).max(2000).default(150),

    // GitHub App (written by `pnpm github:create-app`). Optional as a group: without it the API
    // runs and GitHub features answer 503, but a half-configured app is rejected below.
    GITHUB_APP_ID: z.coerce.number().int().positive().optional(),
    GITHUB_APP_SLUG: z.string().min(1).optional(),
    GITHUB_APP_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_APP_CLIENT_SECRET: z.string().min(1).optional(),
    GITHUB_WEBHOOK_SECRET: z.string().min(16).optional(),
    /** Path to the PEM file (development), relative to apps/backend. */
    GITHUB_APP_PRIVATE_KEY_PATH: z.string().min(1).optional(),
    /** The PEM itself (production, from a secret manager); `\n` escapes are allowed. */
    GITHUB_APP_PRIVATE_KEY: z.string().min(1).optional(),
    GITHUB_WEBHOOK_PROXY_URL: z.url().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.GITHUB_APP_ID === undefined) return;
    if (!env.GITHUB_APP_PRIVATE_KEY && !env.GITHUB_APP_PRIVATE_KEY_PATH) {
      ctx.addIssue({
        code: 'custom',
        path: ['GITHUB_APP_PRIVATE_KEY'],
        message: 'Required when GITHUB_APP_ID is set (or set GITHUB_APP_PRIVATE_KEY_PATH)',
      });
    }
    // The installation flow verifies ownership through GitHub OAuth, so it needs these too.
    for (const key of [
      'GITHUB_WEBHOOK_SECRET',
      'GITHUB_APP_SLUG',
      'GITHUB_APP_CLIENT_ID',
      'GITHUB_APP_CLIENT_SECRET',
    ] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'Required when GITHUB_APP_ID is set',
        });
      }
    }
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
