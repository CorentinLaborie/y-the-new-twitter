/** Client check of the e-mail address (rule B5: 254 characters at most). The backend stays authoritative. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

export const EMAIL_INVALID_MESSAGE = 'Saisissez une adresse e-mail valide.';

export function isValidEmail(value: string): boolean {
  return value.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(value);
}
