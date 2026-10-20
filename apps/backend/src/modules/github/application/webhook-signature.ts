import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'sha256=';

/**
 * Verifies GitHub's `X-Hub-Signature-256` header: HMAC-SHA256 of the *raw* request body,
 * keyed with the webhook secret. Anyone can POST to our webhook URL; only GitHub knows the
 * secret, so a valid signature proves the delivery is genuine and unmodified.
 *
 * - The raw bytes are required: re-serialising parsed JSON can change whitespace or key
 *   order, and then the signature no longer matches.
 * - The comparison is constant-time, so response timing can't leak how many leading
 *   bytes of a forged signature were correct.
 */
export function isValidWebhookSignature(
  secret: string,
  rawBody: Buffer,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader?.startsWith(PREFIX)) {
    return false;
  }
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signatureHeader.slice(PREFIX.length), 'hex');
  // timingSafeEqual throws on different lengths; a wrong length is simply invalid.
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Produces a header value; used by tests and the local webhook replay tooling. */
export function signWebhookBody(secret: string, rawBody: Buffer | string): string {
  return PREFIX + createHmac('sha256', secret).update(rawBody).digest('hex');
}
