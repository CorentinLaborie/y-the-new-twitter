import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { extractMentionHandles } from './mention-text';
import { MentionsDb, MentionsRepository, MentionTarget } from './mentions.repository';

const MENTION_REFUSED = 'Un des comptes mentionnés ne peut pas être mentionné.';

/** Mentions in questions and replies (M3, B8, B9). Runs in the caller's transaction. */
@Injectable()
export class MentionsService {
  constructor(private readonly mentions: MentionsRepository) {}

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
    const userIds = users.map((user) => user.id).filter((id) => id !== authorId);
    if (userIds.length === 0) {
      return [];
    }
    if (await this.mentions.findBlockBetween(db, authorId, userIds)) {
      throw new UnprocessableEntityException(MENTION_REFUSED);
    }

    return userIds;
  }

  /** Stores one mention row and one notification per mentioned account. Nothing is written for no account. */
  async record(db: MentionsDb, actorId: string, target: MentionTarget, userIds: readonly string[]): Promise<void> {
    if (userIds.length === 0) {
      return;
    }

    await this.mentions.createMentions(db, target, userIds);
    await this.mentions.writeMentionNotifications(db, actorId, target, userIds);
  }
}
