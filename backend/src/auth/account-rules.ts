/** Handles that cannot be chosen (product doc section 9.1). Compared case-insensitively. */
export const RESERVED_HANDLES: readonly string[] = [
  "me",
  "admin",
  "api",
  "login",
  "signup",
  "settings",
  "explore",
  "home",
  "messages",
  "notifications",
  "bookmarks",
  "hashtags",
  "suggestions",
  "support",
  "y",
];

/** Version of the terms of use accepted at signup (DEC-062). */
export const CURRENT_TERMS_VERSION = "1.0";

export const MINIMUM_AGE = 18;

/** French mobile or landline number, +33 or 0 prefix, stored as 0XXXXXXXXX (DEC-094, phone is optional). */
const PHONE_PATTERN = /^(?:\+33|0)([1-9]\d{8})$/;

export function isReservedHandle(handle: string): boolean {
  return RESERVED_HANDLES.includes(handle.toLowerCase());
}

/** Returns the stored form of a phone number, or null when it does not match the French format. */
export function normalisePhone(phone: string): string | null {
  const compact = phone.replace(/[\s.-]/g, "");
  const match = PHONE_PATTERN.exec(compact);
  return match ? `0${match[1]}` : null;
}

/** True when the birth date is at least MINIMUM_AGE years before `today` (R7). */
export function isOldEnough(birthDate: Date, today: Date): boolean {
  const limit = new Date(
    Date.UTC(
      today.getUTCFullYear() - MINIMUM_AGE,
      today.getUTCMonth(),
      today.getUTCDate(),
    ),
  );
  return birthDate.getTime() <= limit.getTime();
}
