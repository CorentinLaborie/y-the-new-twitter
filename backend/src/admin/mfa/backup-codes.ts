import { createHmac, randomInt } from 'node:crypto';

export const BACKUP_CODE_COUNT = 10;

/** No 0, O, 1, I or L, to avoid confusion when a code is read or typed. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 10;
/** The two halves of a code are written as XXXXX-XXXXX. */
const CODE_GROUP_LENGTH = 5;

/** Random backup codes written as XXXXX-XXXXX, unique within one list. */
export function generateBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    codes.add(formatCode(randomChars()));
  }
  return [...codes];
}

/** HMAC-SHA-256 (hex) of the normalised code, keyed with the UTF-8 bytes of key. */
export function hashBackupCode(code: string, key: string): string {
  return createHmac('sha256', Buffer.from(key, 'utf8'))
    .update(normalise(code), 'utf8')
    .digest('hex');
}

/** True when the input has the shape of a backup code, so it can be told apart from a TOTP code. */
export function isBackupCodeInput(input: string): boolean {
  const value = normalise(input);
  return value.length === CODE_LENGTH && [...value].every((char) => ALPHABET.includes(char));
}

/** Upper case, without spaces and dashes, so a typed code matches the stored one. */
function normalise(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, '');
}

function randomChars(): string {
  let chars = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    chars += ALPHABET[randomInt(ALPHABET.length)];
  }
  return chars;
}

function formatCode(chars: string): string {
  return `${chars.slice(0, CODE_GROUP_LENGTH)}-${chars.slice(CODE_GROUP_LENGTH)}`;
}
