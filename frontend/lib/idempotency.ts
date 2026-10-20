/**
 * A random key for an Idempotency-Key header. crypto.randomUUID exists only in secure contexts (HTTPS, localhost),
 * so the key is built from random bytes otherwise.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
