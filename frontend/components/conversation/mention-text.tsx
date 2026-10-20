import type { ReactNode } from 'react';

/*
 * Mentions in the text of a reply (F7): '@' and a handle, shown as plain text until the profile route exists, so
 * nothing here is a link. The rule is the one of the backend (backend/src/mentions/mention-text.ts): letters, digits
 * and underscore, 1 to 30 characters, and no letter, digit, underscore or '@' right before the '@'.
 */

const MENTION_PATTERN = /(?<![A-Za-z0-9_@])@([A-Za-z0-9_]{1,30})(?![A-Za-z0-9_])/g;

export type Mention = {
  /** The handle as written in the text, without the '@'. */
  handle: string;
  /** Position of the '@' in the text. */
  index: number;
  /** Length of '@' and the handle. */
  length: number;
};

/** The mentions of a text, in order of appearance. */
export function findMentions(text: string): Mention[] {
  return [...text.matchAll(MENTION_PATTERN)].map((match) => ({
    handle: match[1],
    index: match.index,
    length: match[0].length,
  }));
}

/** The text as it was written: each mention is wrapped in a span with its handle, and nothing becomes a link. */
export function MentionText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const mention of findMentions(text)) {
    if (mention.index > cursor) {
      parts.push(text.slice(cursor, mention.index));
    }
    parts.push(
      <span key={mention.index} data-mention={mention.handle}>
        {text.slice(mention.index, mention.index + mention.length)}
      </span>,
    );
    cursor = mention.index + mention.length;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return <>{parts}</>;
}
