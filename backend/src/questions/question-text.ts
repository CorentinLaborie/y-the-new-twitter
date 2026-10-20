/** Question text: 1 to 280 characters (R1). Counted in characters, as PostgreSQL counts varchar(280). */
export const QUESTION_MAX_LENGTH = 280;

/** Hashtag names: varchar(50) in the database (hashtags.name). */
const HASHTAG_MAX_LENGTH = 50;

/** Letters, digits and underscore, in any script. A '#' inside a word is not a hashtag. */
const HASHTAG_PATTERN = /(?<![\p{L}\p{N}_#])#([\p{L}\p{N}_]+)/gu;

export function characterCount(text: string): number {
  return [...text].length;
}

/**
 * The hashtags of a question, without the '#', lowercase, in order of first use, each once.
 * A name longer than HASHTAG_MAX_LENGTH is not a hashtag: it stays in the text only.
 */
export function extractHashtags(text: string): string[] {
  const names = new Set<string>();
  for (const [, raw] of text.matchAll(HASHTAG_PATTERN)) {
    const name = raw.toLowerCase();
    if (characterCount(name) <= HASHTAG_MAX_LENGTH) {
      names.add(name);
    }
  }

  return [...names];
}
