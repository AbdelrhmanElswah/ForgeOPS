import { Writable } from 'node:stream';

import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { REDACT_PATHS } from './logging.options.js';

function captureLog(payload: object): string {
  let output = '';
  const sink = new Writable({
    write(chunk: Buffer, _encoding, done) {
      output += chunk.toString();
      done();
    },
  });
  pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, sink).info(payload, 'test');
  return output;
}

describe('log redaction', () => {
  it('removes credentials from request headers', () => {
    const line = captureLog({
      req: { headers: { authorization: 'Bearer eyJhbGciOi.secret', cookie: 'sid=abc123' } },
    });

    expect(line).not.toContain('eyJhbGciOi');
    expect(line).not.toContain('abc123');
    expect(line).toContain('[REDACTED]');
  });

  it('removes secret fields nested one level deep', () => {
    const line = captureLog({
      body: { email: 'dev@example.com', password: 'hunter2' },
      github: { token: 'ghs_installation_token' },
    });

    expect(line).not.toContain('hunter2');
    expect(line).not.toContain('ghs_installation_token');
    expect(line).toContain('dev@example.com');
  });
});
