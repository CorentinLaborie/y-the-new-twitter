import { randomBytes } from 'node:crypto';
import { TotpSecretCipher } from './totp-secret-cipher';

const KEY_BASE64 = randomBytes(32).toString('base64');
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('TotpSecretCipher (AES-256-GCM)', () => {
  it('returns the plain text after a round trip', () => {
    const cipher = new TotpSecretCipher(KEY_BASE64);

    expect(cipher.decrypt(cipher.encrypt(SECRET))).toBe(SECRET);
  });

  it('gives different stored values for the same plain text', () => {
    const cipher = new TotpSecretCipher(KEY_BASE64);

    expect(cipher.encrypt(SECRET)).not.toBe(cipher.encrypt(SECRET));
  });

  it('keeps a 32-character secret under 255 characters once stored', () => {
    const cipher = new TotpSecretCipher(KEY_BASE64);

    expect(cipher.encrypt(SECRET).length).toBeLessThanOrEqual(255);
  });

  it('throws when one stored byte is flipped', () => {
    const cipher = new TotpSecretCipher(KEY_BASE64);
    const bytes = Buffer.from(cipher.encrypt(SECRET), 'base64');
    bytes[bytes.length - 1] ^= 0x01;

    expect(() => cipher.decrypt(bytes.toString('base64'))).toThrow();
  });

  it('throws when decrypting with another key', () => {
    const stored = new TotpSecretCipher(KEY_BASE64).encrypt(SECRET);
    const otherCipher = new TotpSecretCipher(randomBytes(32).toString('base64'));

    expect(() => otherCipher.decrypt(stored)).toThrow();
  });

  it('throws on a value too short to hold an IV and a tag', () => {
    const cipher = new TotpSecretCipher(KEY_BASE64);

    expect(() => cipher.decrypt(Buffer.alloc(10).toString('base64'))).toThrow();
  });

  it('throws on a value that is not base64', () => {
    const cipher = new TotpSecretCipher(KEY_BASE64);

    expect(() => cipher.decrypt('not base64!')).toThrow();
  });

  it('refuses a key that is 31 bytes long', () => {
    const shortKey = Buffer.alloc(31).toString('base64');

    expect(() => new TotpSecretCipher(shortKey)).toThrow('TOTP_ENCRYPTION_KEY must decode to 32 bytes.');
  });
});
