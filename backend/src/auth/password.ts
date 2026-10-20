import { argon2id, hash, type HashOptions, verify } from "argon2";

const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

// OWASP minimum for argon2id (memory 19 MiB, 2 iterations, 1 lane).
export const ARGON2_OPTIONS: HashOptions = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * Policy of DEC-136: 8 to 128 characters, at least one digit and one special character
 * (anything that is neither a letter, a digit nor a space).
 */
export function isPasswordAllowed(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH &&
    /\p{N}/u.test(password) &&
    /[^\p{L}\p{N}\s]/u.test(password)
  );
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/** Never throws on a malformed stored hash: that is a refusal, not a server error. */
export async function verifyPassword(
  storedHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}
