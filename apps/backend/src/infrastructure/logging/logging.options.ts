import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { Params } from 'nestjs-pino';

import type { Env } from '../../common/config/env.schema.js';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Anything matching these paths is replaced with "[REDACTED]" before a log line is written.
 * `*.x` matches the key `x` one level below any top-level field (e.g. `body.password`).
 * Redaction is the safety net; the first rule is still: don't log secrets.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-hub-signature-256"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.privateKey',
  '*.apiKey',
  '*.secret',
  '*.clientSecret',
];

// Incoming ids are reused (to correlate with a proxy/frontend) only if they look harmless.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

export function buildLoggerParams(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },

      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const incoming = req.headers[REQUEST_ID_HEADER];
        const id =
          typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
        res.setHeader(REQUEST_ID_HEADER, id);
        return id;
      },

      customLogLevel: (_req, res, error) => {
        if (error || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },

      // Health probes run every few seconds; logging them would drown real traffic.
      autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },

      // Human-readable single lines in development; raw JSON everywhere else (for log shippers).
      ...(env.NODE_ENV === 'development' && {
        transport: {
          target: 'pino-pretty',
          options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
        },
      }),
    },
  };
}
