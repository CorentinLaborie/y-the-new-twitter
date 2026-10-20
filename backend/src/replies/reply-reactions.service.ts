import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { SessionUser } from '../auth/session/session-user.repository';
import { PrismaService } from '../database/prisma.service';
import type { ReplyReactionKind } from '../database/generated/client/client';
import { ACCOUNT_NOT_ACTIVE_MESSAGE, UsersRepository } from '../users/users.repository';
import { ReplyReactionResponseDto } from './dto/reply-reaction-response.dto';
import { RepliesDb, RepliesRepository } from './replies.repository';

const REPLY_NOT_FOUND = 'Réponse introuvable.';

/** The change of the two counters of a reply when one reaction is added (+1) or removed (-1). */
function replyCounterChange(kind: ReplyReactionKind, delta: 1 | -1): { like: number; dislike: number } {
  return kind === 'like' ? { like: delta, dislike: 0 } : { like: 0, dislike: delta };
}

/**
 * Reactions on replies (R2): J'aime and Pas d'accord, each on its own. A user may hold both on one reply.
 * Only active accounts reach them (R13).
 */
@Injectable()
export class ReplyReactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly replies: RepliesRepository,
    private readonly users: UsersRepository,
  ) {}

  /** Adds the viewer's reaction of this kind. Repeating a kind changes nothing. */
  async set(
    viewer: SessionUser,
    replyId: string,
    kind: ReplyReactionKind,
  ): Promise<ReplyReactionResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockVisibleReply(tx, viewer.id, replyId);
      const existing = await this.replies.findReplyReaction(tx, viewer.id, replyId, kind);
      if (!existing) {
        await this.replies.addReplyReaction(tx, viewer.id, replyId, kind);
        await this.replies.changeReplyCounters(tx, replyId, replyCounterChange(kind, 1));
      }

      return this.response(tx, viewer.id, replyId);
    });
  }

  /** Removes the viewer's reaction of this kind. The other kind is left as it is. */
  async remove(viewer: SessionUser, replyId: string, kind: ReplyReactionKind): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockVisibleReply(tx, viewer.id, replyId);
      const existing = await this.replies.findReplyReaction(tx, viewer.id, replyId, kind);
      if (existing) {
        await this.replies.removeReplyReaction(tx, viewer.id, replyId, kind);
        await this.replies.changeReplyCounters(tx, replyId, replyCounterChange(kind, -1));
      }
    });
  }

  /**
   * Locks the viewer's account, then the reply, so its reactions run in turn (B7) and never count an account that
   * became inactive meanwhile (R13). A hidden, deleted or blocked reply is not found.
   */
  private async lockVisibleReply(db: RepliesDb, viewerId: string, replyId: string): Promise<void> {
    if (!(await this.users.lockActiveAccount(db, viewerId))) {
      throw new ForbiddenException(ACCOUNT_NOT_ACTIVE_MESSAGE);
    }
    await this.replies.lockReply(db, replyId);
    if (!(await this.replies.findVisibleReply(db, viewerId, replyId))) {
      throw new NotFoundException(REPLY_NOT_FOUND);
    }
  }

  private async response(
    db: RepliesDb,
    viewerId: string,
    replyId: string,
  ): Promise<ReplyReactionResponseDto> {
    const reply = await this.replies.findReplyCounters(db, replyId);
    const viewerKinds = await this.replies.findViewerReplyKinds(db, viewerId, replyId);

    return {
      replyId,
      counts: { like: reply.likeCount, dislike: reply.dislikeCount },
      viewerReactions: viewerKinds.map((row) => row.kind),
    };
  }
}
