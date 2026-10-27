/**
 * The text of a question search, as a French full-text query with prefix matching: every word must match the start
 * of a word in the question ("tes" finds "tests"). Words are letters and digits only, so the text cannot carry query
 * operators. Null when the text has no word at all.
 */
export function toPrefixQuery(text: string): string | null {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

  return words.length === 0 ? null : words.map((word) => `${word}:*`).join(' & ');
}
