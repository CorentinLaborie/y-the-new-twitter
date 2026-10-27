import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { extractMentionHandles } from './mention-text';
import { MentionsDb, MentionsRepository, MentionTarget } from './mentions.repository';

const MENTION_REFUSED = 'Un des comptes mentionnés ne peut pas être mentionné.';

/** How many accounts the selector of a mention proposes. */
export const SUGGESTION_LIMIT = 5;

/** An account the selector proposes: its handle and its display name. */
export type MentionSuggestion = { handle: string; displayName: string };

/**
 * Keeps at most SUGGESTION_LIMIT accounts: the handles that start with the query first, then the others that contain it,
 * each group in the order it came (handle order). The comparison ignores case.
 */
export function rankMentionSuggestions(
  candidates: readonly MentionSuggestion[],
  query: string,
): MentionSuggestion[] {
  const needle = query.toLowerCase();
  const handleOf = (candidate: MentionSuggestion) => candidate.handle.toLowerCase();
  const startsWith = candidates.filter((candidate) => handleOf(candidate).startsWith(needle));
  const contains = candidates.filter(
    (candidate) => handleOf(candidate).includes(needle) && !handleOf(candidate).startsWith(needle),
  );

  return [...startsWith, ...contains].slice(0, SUGGESTION_LIMIT);
}

/** Mentions in questions and replies (M3, B8, B9). Runs in the caller's transaction. */
@Injectable()
export class MentionsService {
  constructor(private readonly mentions: MentionsRepository) {}

  /** The accounts the viewer's selector proposes for a partial handle (followed or following, visible, not blocked). */
  async suggest(db: MentionsDb, viewerId: string, query: string): Promise<MentionSuggestion[]> {
    const candidates = await this.mentions.findSuggestionCandidates(db, viewerId, query);

    return rankMentionSuggestions(candidates, query);
  }

  /**
   * The lowercase handles, among the mentions of these texts, whose profile the viewer may open: an account that is
   * banned, deleted, or blocked either way is not linked, and its mention stays plain text.
   */
  async linkableHandles(db: MentionsDb, viewerId: string, texts: readonly string[]): Promise<Set<string>> {
    const handles = [...new Set(texts.flatMap((text) => extractMentionHandles(text)))];
    if (handles.length === 0) {
      return new Set();
    }

    const users = await this.mentions.findVisibleHandles(db, viewerId, handles);

    return new Set(users.map((user) => user.handle.toLowerCase()));
  }

  /**
   * The active accounts a text mentions, the author excluded. An account that blocks the author or is blocked by
   * them refuses the whole post (R14). An unknown handle, or one that is not active, is plain text.
   */
  async resolve(db: MentionsDb, authorId: string, text: string): Promise<string[]> {
    const handles = extractMentionHandles(text);
    if (handles.length === 0) {
      return [];
    }

    const users = await this.mentions.findActiveByHandles(db, handles);
    const mentionedUserIds = users.map((user) => user.id).filter((id) => id !== authorId);
    if (mentionedUserIds.length === 0) {
      return [];
    }
    if (await this.mentions.findBlockBetween(db, authorId, mentionedUserIds)) {
      throw new UnprocessableEntityException(MENTION_REFUSED);
    }

    return mentionedUserIds;
  }

  /** Stores one mention row and one notification per mentioned account. Nothing is written for no account. */
  async record(
    db: MentionsDb,
    actorId: string,
    target: MentionTarget,
    mentionedUserIds: readonly string[],
  ): Promise<void> {
    if (mentionedUserIds.length === 0) {
      return;
    }

    await this.mentions.createMentions(db, target, mentionedUserIds);
    await this.mentions.writeMentionNotifications(db, actorId, target, mentionedUserIds);
  }
}
