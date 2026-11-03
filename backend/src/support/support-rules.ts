/*
 * Rules of the contact messages of suspended accounts (section 3.4, DEC-078, DEC-080, DEC-116).
 * Pure functions, so they are easy to test. Length is counted in characters (code points), as PostgreSQL counts VARCHAR.
 */

/** Longest contact message, in characters (DEC-078). */
export const CONTACT_MESSAGE_MAX_LENGTH = 1000;

/** The text as it is counted, checked and stored: the spaces and line breaks at both ends are removed. */
export function normalizeContactText(text: string): string {
  return text.trim();
}

/** Number of characters of a contact message, after normalizeContactText. An emoji counts as one. */
function contactTextLength(text: string): number {
  return Array.from(normalizeContactText(text)).length;
}

/** A contact message is stored when, once trimmed, it has 1 to 1000 characters. */
export function isContactTextValid(text: string): boolean {
  const length = contactTextLength(text);
  return length >= 1 && length <= CONTACT_MESSAGE_MAX_LENGTH;
}

/** The reference prefix of the threads of one day (UTC), for example `CNT-20261019-`. */
export function contactReferencePrefix(day: Date): string {
  const year = day.getUTCFullYear().toString().padStart(4, '0');
  const month = (day.getUTCMonth() + 1).toString().padStart(2, '0');
  const date = day.getUTCDate().toString().padStart(2, '0');

  return `CNT-${year}${month}${date}-`;
}

/**
 * The reference of the next thread of the day: `CNT-AAAAMMJJ-NNNN`, numbered from 0001 after the last reference of the
 * same day. `previous` is the greatest reference already stored for that day, or null when there is none.
 */
export function nextContactReference(day: Date, previous: string | null): string {
  const prefix = contactReferencePrefix(day);
  const lastNumber =
    previous !== null && previous.startsWith(prefix) ? Number(previous.slice(prefix.length)) : 0;

  return `${prefix}${(lastNumber + 1).toString().padStart(4, '0')}`;
}
