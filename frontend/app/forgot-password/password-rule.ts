/*
 * Password policy of DEC-136, the same as the backend (backend/src/auth/password.ts): 8 to 128 characters,
 * at least one digit and one special character (anything that is neither a letter, a digit nor a space).
 * Keep in sync with the signup form; the backend stays authoritative.
 */

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_RULE_HINT = '8 caractères minimum, avec au moins un chiffre et un caractère spécial.';

/** Returns the first rule the password breaks, in French, or null when it is allowed. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Le mot de passe ne doit pas dépasser ${PASSWORD_MAX_LENGTH} caractères.`;
  }
  if (!/\p{N}/u.test(password)) {
    return 'Le mot de passe doit contenir au moins un chiffre.';
  }
  if (!/[^\p{L}\p{N}\s]/u.test(password)) {
    return 'Le mot de passe doit contenir au moins un caractère spécial.';
  }
  return null;
}
