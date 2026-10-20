import {
  generateTotpSecret,
  stepAt,
  totpCode,
  totpUri,
  verifyTotp,
} from './totp';

// RFC 6238 test secret: the ASCII string "12345678901234567890", in base32.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

// A timestamp in the middle of the RFC vectors (step 41152263).
const NOW_MS = 1234567890 * 1000;
const NOW_STEP = stepAt(NOW_MS);

describe('TOTP (RFC 6238, SHA-1, 6 digits)', () => {
  it.each([
    [59, 1, '287082'],
    [1111111109, 37037036, '081804'],
    [1234567890, 41152263, '005924'],
  ])('matches the RFC 6238 vector at %i s (step %i)', (seconds, step, expected) => {
    expect(stepAt(seconds * 1000)).toBe(step);
    expect(totpCode(RFC_SECRET, step)).toBe(expected);
  });

  it('accepts the code of the current step', () => {
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, NOW_STEP), NOW_MS, null)).toBe(NOW_STEP);
  });

  it('accepts the code of the previous and the next step', () => {
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, NOW_STEP - 1), NOW_MS, null)).toBe(
      NOW_STEP - 1,
    );
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, NOW_STEP + 1), NOW_MS, null)).toBe(
      NOW_STEP + 1,
    );
  });

  it('accepts the first step of time without looking at a negative step', () => {
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, 0), 0, null)).toBe(0);
  });

  it('refuses a code two steps away in either direction', () => {
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, NOW_STEP - 2), NOW_MS, null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, NOW_STEP + 2), NOW_MS, null)).toBeNull();
  });

  it('refuses a replay of the step already used', () => {
    const code = totpCode(RFC_SECRET, NOW_STEP);

    expect(verifyTotp(RFC_SECRET, code, NOW_MS, NOW_STEP)).toBeNull();
  });

  it('refuses a step older than the last used one', () => {
    const code = totpCode(RFC_SECRET, NOW_STEP - 1);

    expect(verifyTotp(RFC_SECRET, code, NOW_MS, NOW_STEP)).toBeNull();
  });

  it.each([
    ['12345', 'five digits'],
    ['1234567', 'seven digits'],
    ['abcdef', 'letters'],
    ['28708a', 'a digit mixed with a letter'],
    [' 287082', 'a leading space'],
  ])('refuses a code with %s (%s)', (code) => {
    expect(verifyTotp(RFC_SECRET, code, NOW_MS, null)).toBeNull();
  });

  it('generates a 32-character base32 secret, different each time', () => {
    const first = generateTotpSecret();
    const second = generateTotpSecret();

    expect(first).toMatch(/^[A-Z2-7]{32}$/);
    expect(second).toMatch(/^[A-Z2-7]{32}$/);
    expect(first).not.toBe(second);
  });

  it('builds the otpauth URI with the expected fields', () => {
    expect(
      totpUri({ secretBase32: RFC_SECRET, issuer: 'Y', account: 'admin@example.com' }),
    ).toBe(
      `otpauth://totp/Y:admin%40example.com?secret=${RFC_SECRET}&issuer=Y&algorithm=SHA1&digits=6&period=30`,
    );
  });

  it('encodes an issuer with a space in the URI', () => {
    expect(
      totpUri({ secretBase32: RFC_SECRET, issuer: 'Y Admin', account: 'admin@example.com' }),
    ).toBe(
      `otpauth://totp/Y%20Admin:admin%40example.com?secret=${RFC_SECRET}&issuer=Y%20Admin&algorithm=SHA1&digits=6&period=30`,
    );
  });

  it('rejects a secret with a character outside the base32 alphabet', () => {
    expect(() => totpCode('GEZDG1', 1)).toThrow('TOTP secret is not valid base32.');
  });
});
