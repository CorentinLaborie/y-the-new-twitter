import { randomInt } from 'node:crypto';
import { hash, verify } from 'argon2';
import { ARGON2_OPTIONS } from './password';

/** Failed attempts allowed on one code before it is invalidated (DEC-137, product doc section 9.4). */
export const CODE_MAX_ATTEMPTS = 5;

/** A random 6-digit code, from the operating system's secure source. */
export function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashCode(code: string): Promise<string> {
  return hash(code, ARGON2_OPTIONS);
}

export async function verifyCode(storedHash: string, code: string): Promise<boolean> {
  try {
    return await verify(storedHash, code);
  } catch {
    return false;
  }
}
