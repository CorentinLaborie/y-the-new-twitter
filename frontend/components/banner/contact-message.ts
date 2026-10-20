import { apiRequest, type ApiProblem } from '@/lib/api-client';

/*
 * Contact message of a suspended account (product doc section 3.4, DEC-078): the rules of the text, and the call that
 * sends it. The backend stays authoritative: POST /support/messages checks the same 1-to-1000 rule and answers 422.
 */

/** Longest contact message, in characters (DEC-078). */
export const CONTACT_MESSAGE_MAX_LENGTH = 1000;

/** Number of characters of the message as the counter shows it: trimmed, and an emoji counts as one. */
export function contactMessageLength(text: string): number {
  return Array.from(text.trim()).length;
}

/** A message is sent when, once trimmed, it has 1 to 1000 characters. */
export function isContactMessageValid(text: string): boolean {
  const length = contactMessageLength(text);
  return length >= 1 && length <= CONTACT_MESSAGE_MAX_LENGTH;
}

type ContactReceipt = { reference: string };

export type ContactResult = { ok: true; reference: string } | { ok: false; problem: ApiProblem };

/** Sends the message to the administrator. The reference of the thread comes back, as `CNT-AAAAMMJJ-NNNN`. */
export async function sendContactMessage(text: string): Promise<ContactResult> {
  const result = await apiRequest<ContactReceipt>('POST', '/support/messages', {
    body: { text: text.trim() },
  });

  return result.ok ? { ok: true, reference: result.body.reference } : { ok: false, problem: result.problem };
}
