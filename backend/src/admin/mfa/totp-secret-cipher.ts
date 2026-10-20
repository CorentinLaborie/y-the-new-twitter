import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Encrypts TOTP secrets before they are stored (AES-256-GCM).
 * Stored value: base64 of iv (12 bytes) || auth tag (16 bytes) || ciphertext.
 */
export class TotpSecretCipher {
  private readonly key: Buffer;

  /** The key is base64 and must decode to exactly 32 bytes. */
  constructor(keyBase64: string) {
    const key = Buffer.from(keyBase64, 'base64');
    if (key.length !== KEY_BYTES) {
      throw new Error('TOTP_ENCRYPTION_KEY must decode to 32 bytes.');
    }
    this.key = key;
  }

  /** Encrypts with a fresh random IV, so the same plain text never gives the same stored value. */
  encrypt(plain: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, { authTagLength: TAG_BYTES });
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, tag, ciphertext]).toString('base64');
  }

  /** Throws on a malformed value or when the authentication tag does not verify. */
  decrypt(stored: string): string {
    if (!BASE64_PATTERN.test(stored)) {
      throw new Error('Stored TOTP secret is not valid base64.');
    }

    const data = Buffer.from(stored, 'base64');
    if (data.length < IV_BYTES + TAG_BYTES) {
      throw new Error('Stored TOTP secret is too short.');
    }

    const iv = data.subarray(0, IV_BYTES);
    const tag = data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = data.subarray(IV_BYTES + TAG_BYTES);

    const decipher = createDecipheriv(ALGORITHM, this.key, iv, { authTagLength: TAG_BYTES });
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}
