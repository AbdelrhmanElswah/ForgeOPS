import { describe, expect, it } from 'vitest';

import { isValidWebhookSignature, signWebhookBody } from './webhook-signature.js';

const secret = 'webhook-secret-for-tests';
const body = Buffer.from('{"action":"created","installation":{"id":42}}');

describe('isValidWebhookSignature', () => {
  it('accepts a signature made with the shared secret', () => {
    expect(isValidWebhookSignature(secret, body, signWebhookBody(secret, body))).toBe(true);
  });

  it.each([
    ['missing header', undefined],
    ['wrong algorithm prefix', signWebhookBody(secret, body).replace('sha256=', 'sha1=')],
    ['wrong secret', signWebhookBody('another-secret-entirely', body)],
    ['truncated signature', signWebhookBody(secret, body).slice(0, 20)],
    ['not hex', 'sha256=zzzz'],
  ])('rejects %s', (_case, header) => {
    expect(isValidWebhookSignature(secret, body, header)).toBe(false);
  });

  it('rejects a body modified after signing', () => {
    const signature = signWebhookBody(secret, body);
    const tampered = Buffer.from(body.toString().replace('42', '43'));

    expect(isValidWebhookSignature(secret, tampered, signature)).toBe(false);
  });

  it('is sensitive to formatting, which is why the raw body must be used', () => {
    const signature = signWebhookBody(secret, body);
    const reserialised = Buffer.from(JSON.stringify(JSON.parse(body.toString()), null, 2));

    expect(isValidWebhookSignature(secret, reserialised, signature)).toBe(false);
  });
});
