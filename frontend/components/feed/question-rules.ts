/*
 * Composer rules of a question (rule R1: text only, 1 to 280 characters). Pure functions, so they are easy to test.
 * The backend stays authoritative (B2). Length is counted in Unicode code points, as the backend does.
 */

export const QUESTION_MAX_LENGTH = 280;

/**
 * The text as it is counted, checked and sent (DEC-170): the spaces and line breaks at the start and at the end
 * are removed. The API trims the text too.
 */
export function normalizeQuestion(text: string): string {
  return text.trim();
}

/** Number of characters of a question as the counter shows it, after normalizeQuestion. An emoji counts as one. */
export function questionLength(text: string): number {
  return Array.from(normalizeQuestion(text)).length;
}

type QuestionCheck =
  | { ok: true; length: number }
  | { ok: false; reason: 'empty'; length: number }
  | { ok: false; reason: 'too-long'; length: number };

/** A question is sent when, once trimmed, it is not empty, and when it is not over the limit. */
export function checkQuestion(text: string): QuestionCheck {
  const length = questionLength(text);
  if (length > QUESTION_MAX_LENGTH) {
    return { ok: false, reason: 'too-long', length };
  }
  if (normalizeQuestion(text).length === 0) {
    return { ok: false, reason: 'empty', length };
  }
  return { ok: true, length };
}

/** Refusal shown under the textarea when the question is over the limit. */
export const TOO_LONG_MESSAGE = `Votre question dépasse ${QUESTION_MAX_LENGTH} caractères.`;
