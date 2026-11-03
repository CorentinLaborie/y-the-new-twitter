/*
 * The '@' selector of a reply (section M3): where a mention is being typed before the caret, and what the text becomes
 * once an account is picked. A mention is '@' and a handle of letters, digits and underscore, 1 to 30 characters, with
 * no letter, digit, underscore or '@' right before the '@' (the rule of components/conversation/mention-text.tsx).
 */

const MENTION_HANDLE_MAX_LENGTH = 30;

/** The mention being typed: the index of its '@', the index of the caret after it, and the handle typed so far. */
export type MentionQuery = { start: number; end: number; query: string };

const TYPING_PATTERN = new RegExp(
  `(?:^|[^A-Za-z0-9_@])@([A-Za-z0-9_]{0,${MENTION_HANDLE_MAX_LENGTH}})$`,
);

/** The mention being typed right before the caret, or null when the caret is not in one. */
export function mentionQueryAt(text: string, caret: number): MentionQuery | null {
  const match = TYPING_PATTERN.exec(text.slice(0, caret));
  if (match === null) {
    return null;
  }

  const query = match[1];
  return { start: caret - query.length - 1, end: caret, query };
}

/**
 * The text once `handle` is picked: the typed '@' and handle are replaced by '@handle ', and the caret goes after the
 * space, so the reply goes on from there.
 */
export function insertMention(
  text: string,
  mention: MentionQuery,
  handle: string,
): { text: string; caret: number } {
  const insertion = `@${handle} `;

  return {
    text: text.slice(0, mention.start) + insertion + text.slice(mention.end),
    caret: mention.start + insertion.length,
  };
}
