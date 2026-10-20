import { BACKUP_CODE_COUNT, generateBackupCodes, hashBackupCode, isBackupCodeInput } from './backup-codes';

const KEY = 'test-pepper';

describe('backup codes', () => {
  it('generates codes in the XXXXX-XXXXX format, from the reduced alphabet', () => {
    for (const code of generateBackupCodes()) {
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
    }
  });

  it('generates 10 unique codes by default', () => {
    const codes = generateBackupCodes();

    expect(BACKUP_CODE_COUNT).toBe(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
  });

  it('generates the requested number of unique codes', () => {
    const codes = generateBackupCodes(3);

    expect(codes).toHaveLength(3);
    expect(new Set(codes).size).toBe(3);
  });

  it('hashes to 64 lowercase hex characters', () => {
    expect(hashBackupCode('ABCDE-FGHJK', KEY)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gives the same hash for case and dashes variants of one code', () => {
    const hash = hashBackupCode('ABCDE-FGHJK', KEY);

    expect(hashBackupCode('abcde-fghjk', KEY)).toBe(hash);
    expect(hashBackupCode('ABCDEFGHJK', KEY)).toBe(hash);
    expect(hashBackupCode(' abcdefghjk ', KEY)).toBe(hash);
  });

  it('gives a different hash with a different key', () => {
    expect(hashBackupCode('ABCDE-FGHJK', KEY)).not.toBe(hashBackupCode('ABCDE-FGHJK', 'other-pepper'));
  });

  it('accepts a code of the alphabet, with or without dashes and in any case', () => {
    expect(isBackupCodeInput('ABCDE-FGHJK')).toBe(true);
    expect(isBackupCodeInput('abcdefghjk')).toBe(true);
  });

  it('refuses a TOTP-shaped input', () => {
    expect(isBackupCodeInput('123456')).toBe(false);
  });

  it('refuses a 10-character value with an excluded letter', () => {
    expect(isBackupCodeInput('ABCDEFGHJO')).toBe(false);
  });
});
