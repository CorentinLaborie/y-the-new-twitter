/**
 * A mention is '@' and a handle: letters, digits and underscore, 1 to 30 characters (the signup rule).
 * A '@' inside a word, as in an e-mail address, is not a mention, and a handle longer than 30 is not one either.
 */
const MENTION_PATTERN = /(?<![A-Za-z0-9_@])@([A-Za-z0-9_]{1,30})(?![A-Za-z0-9_])/g;

/** The handles mentioned in a text, without the '@', lowercase, in order of first use, each once. */
export function extractMentionHandles(text: string): string[] {
  const handles = new Set<string>();
  for (const [, raw] of text.matchAll(MENTION_PATTERN)) {
    handles.add(raw.toLowerCase());
  }

  return [...handles];
}
