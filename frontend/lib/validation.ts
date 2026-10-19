/*
 * Client-side rules of the account forms. They mirror the backend rules
 * (backend/src/auth/dto/signup.dto.ts, account-rules.ts and password.ts). The backend stays authoritative.
 */

const HANDLE_MAX_LENGTH = 30;
const DISPLAY_NAME_MAX_LENGTH = 50;
const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const MINIMUM_AGE = 18;
const CODE_LENGTH = 6;

/** Mirror of RESERVED_HANDLES in backend/src/auth/account-rules.ts. Compared case-insensitively. */
const RESERVED_HANDLES: readonly string[] = [
  'me',
  'admin',
  'api',
  'login',
  'signup',
  'settings',
  'explore',
  'home',
  'messages',
  'notifications',
  'bookmarks',
  'hashtags',
  'suggestions',
  'support',
  'y',
];

const HANDLE_PATTERN = /^[A-Za-z0-9_]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BIRTH_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
/** Same French format as normalisePhone in account-rules.ts, once spaces, dots and dashes are removed. */
const PHONE_PATTERN = /^(?:\+33|0)[1-9]\d{8}$/;
const CODE_PATTERN = /^\d{6}$/;

export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;

export type SignupValues = {
  displayName: string;
  handle: string;
  birthDate: string;
  email: string;
  phone: string;
  password: string;
  passwordConfirmation: string;
  termsAccepted: boolean;
};

export type SignupField = keyof SignupValues;

type LoginValues = { email: string; password: string };

export type LoginField = keyof LoginValues;

/** The e-mail as the backend stores it: trimmed and in lower case. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateHandle(value: string): string | undefined {
  if (value.length === 0) {
    return 'Le pseudo est obligatoire.';
  }
  if (value.length > HANDLE_MAX_LENGTH) {
    return `Le pseudo ne peut pas dépasser ${HANDLE_MAX_LENGTH} caractères.`;
  }
  if (!HANDLE_PATTERN.test(value)) {
    return 'Le pseudo ne contient que des lettres, chiffres et tirets bas.';
  }
  if (RESERVED_HANDLES.includes(value.toLowerCase())) {
    return 'Ce pseudo est réservé.';
  }
  return undefined;
}

export function validateDisplayName(value: string): string | undefined {
  if (value.length === 0) {
    return 'Le nom affiché est obligatoire.';
  }
  if (value.length > DISPLAY_NAME_MAX_LENGTH) {
    return `${DISPLAY_NAME_MAX_LENGTH} caractères maximum.`;
  }
  return undefined;
}

export function validateEmail(value: string): string | undefined {
  const email = normalizeEmail(value);
  if (email.length === 0) {
    return 'L’adresse e-mail est obligatoire.';
  }
  if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    return 'Adresse e-mail invalide.';
  }
  return undefined;
}

/** Policy of DEC-136: 8 to 128 characters, at least one digit and one special character. */
export function validatePassword(value: string): string | undefined {
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `${PASSWORD_MIN_LENGTH} caractères minimum.`;
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `${PASSWORD_MAX_LENGTH} caractères maximum.`;
  }
  if (!/\p{N}/u.test(value) || !/[^\p{L}\p{N}\s]/u.test(value)) {
    return 'Le mot de passe doit contenir au moins un chiffre et un caractère spécial.';
  }
  return undefined;
}

export function validatePasswordConfirmation(password: string, confirmation: string): string | undefined {
  if (confirmation.length === 0) {
    return 'Confirmez votre mot de passe.';
  }
  if (confirmation !== password) {
    return 'Les mots de passe ne correspondent pas.';
  }
  return undefined;
}

/** Converts JJ/MM/AAAA to YYYY-MM-DD. Returns null when the text is not a real calendar date. */
export function toIsoBirthDate(value: string): string | null {
  const match = BIRTH_DATE_PATTERN.exec(value.trim());
  if (!match) {
    return null;
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Same comparison as isOldEnough in backend/src/auth/account-rules.ts (UTC dates). */
function isOldEnough(isoDate: string, today: Date): boolean {
  const [year, month, day] = isoDate.split('-').map(Number);
  const birth = Date.UTC(year, month - 1, day);
  const limit = Date.UTC(today.getUTCFullYear() - MINIMUM_AGE, today.getUTCMonth(), today.getUTCDate());
  return birth <= limit;
}

export function validateBirthDate(value: string, today: Date = new Date()): string | undefined {
  if (value.trim().length === 0) {
    return 'La date de naissance est obligatoire.';
  }
  const isoDate = toIsoBirthDate(value);
  if (isoDate === null) {
    return 'Date invalide. Utilisez le format JJ/MM/AAAA.';
  }
  if (!isOldEnough(isoDate, today)) {
    return `Vous devez avoir au moins ${MINIMUM_AGE} ans.`;
  }
  return undefined;
}

/** Optional. When filled in, it must be a French number, with or without spaces, dots or dashes. */
export function validatePhone(value: string): string | undefined {
  if (value.trim().length === 0) {
    return undefined;
  }
  const compact = value.replace(/[\s.-]/g, '');
  return PHONE_PATTERN.test(compact) ? undefined : 'Numéro de téléphone français invalide.';
}

export function validateTerms(accepted: boolean): string | undefined {
  return accepted ? undefined : 'Vous devez accepter les conditions d’utilisation.';
}

/** The six-digit code received by e-mail. */
export function validateCode(value: string): string | undefined {
  const code = value.trim();
  if (code.length === 0) {
    return 'Saisissez le code reçu par e-mail.';
  }
  return CODE_PATTERN.test(code) ? undefined : `Le code contient ${CODE_LENGTH} chiffres.`;
}

function withoutUndefined<Field extends string>(
  errors: Record<Field, string | undefined>,
): FieldErrors<Field> {
  return Object.fromEntries(
    Object.entries(errors).filter(([, message]) => message !== undefined),
  ) as FieldErrors<Field>;
}

export function validateSignup(values: SignupValues, today: Date = new Date()): FieldErrors<SignupField> {
  return withoutUndefined<SignupField>({
    displayName: validateDisplayName(values.displayName),
    handle: validateHandle(values.handle),
    birthDate: validateBirthDate(values.birthDate, today),
    email: validateEmail(values.email),
    phone: validatePhone(values.phone),
    password: validatePassword(values.password),
    passwordConfirmation: validatePasswordConfirmation(values.password, values.passwordConfirmation),
    termsAccepted: validateTerms(values.termsAccepted),
  });
}

/** The login form only checks that both fields are filled in and that the e-mail has a valid shape. */
export function validateLogin(values: LoginValues): FieldErrors<LoginField> {
  return withoutUndefined<LoginField>({
    email: validateEmail(values.email),
    password: values.password.length === 0 ? 'Le mot de passe est obligatoire.' : undefined,
  });
}

export function hasErrors(errors: object): boolean {
  return Object.keys(errors).length > 0;
}

/** First field, in display order, that has an error. Used to move the focus. */
export function firstErrorField<Field extends string>(
  errors: FieldErrors<Field>,
  order: readonly Field[],
): Field | undefined {
  return order.find((field) => errors[field] !== undefined);
}
