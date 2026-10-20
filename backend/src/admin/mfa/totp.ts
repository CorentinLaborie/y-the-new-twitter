import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
/** A submitted code: exactly TOTP_DIGITS digits. */
const TOTP_CODE_PATTERN = new RegExp(`^[0-9]{${TOTP_DIGITS}}$`);

/** Secret length in bytes: 160 bits, the RFC 4226 recommendation for SHA-1. */
const SECRET_BYTES = 20;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BASE32_PATTERN = /^[A-Z2-7]+$/;

/** Steps before and after the current one that are accepted (clock drift of one step). */
const ACCEPTED_STEP_OFFSETS = [-1, 0, 1];

/** Random TOTP secret: 20 bytes from the operating system, base32 without padding (32 characters). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES));
}

/** Time step (RFC 6238 counter) for a timestamp in milliseconds. */
export function stepAt(timeMs: number): number {
  return Math.floor(timeMs / 1000 / TOTP_STEP_SECONDS);
}

/** The 6-digit TOTP code for one time step (RFC 6238 over RFC 4226 dynamic truncation, HMAC-SHA1). */
export function totpCode(secretBase32: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));

  const hmac = createHmac('sha1', base32Decode(secretBase32)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];

  return (binary % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, '0');
}

/**
 * Checks a submitted code against the steps around now.
 * Returns the matched step, or null when the code is malformed, wrong, or already used (replay).
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  nowMs: number,
  lastUsedStep: number | null,
): number | null {
  if (!TOTP_CODE_PATTERN.test(code)) {
    return null;
  }

  const submitted = Buffer.from(code, 'ascii');
  const current = stepAt(nowMs);
  let matched: number | null = null;

  for (const offset of ACCEPTED_STEP_OFFSETS) {
    const step = current + offset;
    if (step < 0) {
      continue;
    }
    const expected = Buffer.from(totpCode(secretBase32, step), 'ascii');
    if (timingSafeEqual(expected, submitted) && matched === null) {
      matched = step;
    }
  }

  if (matched === null) {
    return null;
  }
  if (lastUsedStep !== null && matched <= lastUsedStep) {
    return null;
  }
  return matched;
}

/** otpauth:// URI that authenticator apps read from a QR code. */
export function totpUri(options: { secretBase32: string; issuer: string; account: string }): string {
  const issuer = encodeURIComponent(options.issuer);
  const account = encodeURIComponent(options.account);

  return (
    `otpauth://totp/${issuer}:${account}` +
    `?secret=${options.secretBase32}&issuer=${issuer}` +
    `&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`
  );
}

function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }

  return output;
}

/** Throws on any character outside the RFC 4648 base32 alphabet. */
function base32Decode(input: string): Buffer {
  if (!BASE32_PATTERN.test(input)) {
    throw new Error('TOTP secret is not valid base32.');
  }

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of input) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}
