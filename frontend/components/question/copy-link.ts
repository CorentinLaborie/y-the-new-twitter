/** Public link of a question: the share view /questions/[id] (F11). */
export function questionLink(origin: string, questionId: string): string {
  return `${origin}/questions/${questionId}`;
}

/**
 * Copies the link to the clipboard. Returns false when the browser refuses (no clipboard API, permission denied), so the
 * caller can show a message instead of a success.
 */
export async function copyQuestionLink(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
