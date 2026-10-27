import Link from 'next/link';
import type { ReactNode } from 'react';

/*
 * Mentions in the text of a reply (F7): '@' and a handle. A mention is a link to the profile only when the server says
 * the viewer may open that profile (`linkable`, the lowercase handles of ReplyView.mentionLinks): a banned, deleted or
 * blocked account stays plain text. The rule is the one of the backend (backend/src/mentions/mention-text.ts): letters,
 * digits and underscore, 1 to 30 characters, and no letter, digit, underscore or '@' right before the '@'.
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

const NOT_LINKABLE: ReadonlySet<string> = new Set();

/**
 * The text as it was written. Each mention is wrapped with its handle; the ones in `linkable` link to the profile, the
 * others stay plain text.
 */
export function MentionText({ text, linkable = NOT_LINKABLE }: { text: string; linkable?: ReadonlySet<string> }) {
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const mention of findMentions(text)) {
    if (mention.index > cursor) {
      parts.push(text.slice(cursor, mention.index));
    }
    const shown = text.slice(mention.index, mention.index + mention.length);
    parts.push(
      linkable.has(mention.handle.toLowerCase()) ? (
        <Link key={mention.index} href={`/u/${mention.handle}`} data-mention={mention.handle}>
          {shown}
        </Link>
      ) : (
        <span key={mention.index} data-mention={mention.handle}>
          {shown}
        </span>
      ),
    );
    cursor = mention.index + mention.length;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return <>{parts}</>;
}
