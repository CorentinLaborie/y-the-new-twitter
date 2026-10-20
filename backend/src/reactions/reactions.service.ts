import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SessionUser } from '../auth/session/session-user.repository';
import { PrismaService } from '../database/prisma.service';
import type { ReactionKind } from '../database/generated/client/client';
import { ACCOUNT_NOT_ACTIVE_MESSAGE, UsersRepository } from '../users/users.repository';
import { QUESTION_NOT_FOUND_MESSAGE } from '../questions/question-view';
import { ReactionResponseDto } from './dto/reaction-response.dto';
import { CounterChange, ReactionsDb, ReactionsRepository } from './reactions.repository';

/** How the three counters change when a reaction goes from `previous` to `next` (null: none). */
export function counterChange(previous: ReactionKind | null, next: ReactionKind | null): CounterChange {
  const change = { like: 0, dislike: 0, y: 0 };
  if (previous !== null) {
    change[previous] -= 1;
  }
  if (next !== null) {
    change[next] += 1;
  }

  return change;
}

/** Reactions of a logged-in, active account (R13). A user reacts to any visible question, even their own (R13). */
@Injectable()
export class ReactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reactions: ReactionsRepository,
    private readonly users: UsersRepository,
    private readonly config: ConfigService,
  ) {}

  /** Sets the viewer's reaction to `kind`, replacing another one. Repeating the same kind changes nothing. */
  async set(viewer: SessionUser, questionId: string, kind: ReactionKind): Promise<ReactionResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockVisibleQuestion(tx, viewer.id, questionId);
      const existing = await this.reactions.findQuestionReaction(tx, viewer.id, questionId);
      if (existing?.kind !== kind) {
        await this.reactions.setQuestionReaction(tx, viewer.id, questionId, kind);
        await this.reactions.changeQuestionCounters(tx, questionId, counterChange(existing?.kind ?? null, kind));
      }

      return this.response(tx, viewer.id, questionId);
    });
  }

  /** Removes the viewer's reaction when it has this kind. Nothing else is removed. */
  async remove(viewer: SessionUser, questionId: string, kind: ReactionKind): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockVisibleQuestion(tx, viewer.id, questionId);
      const existing = await this.reactions.findQuestionReaction(tx, viewer.id, questionId);
      if (existing?.kind === kind) {
        await this.reactions.removeQuestionReaction(tx, viewer.id, questionId);
        await this.reactions.changeQuestionCounters(tx, questionId, counterChange(kind, null));
      }
    });
  }

  /**
   * Locks the viewer's account first, then the question, so every reaction on it is applied in turn (B4) and never
   * counts an account that became inactive meanwhile (R13). Hidden or blocked questions are not found.
   */
  private async lockVisibleQuestion(db: ReactionsDb, viewerId: string, questionId: string): Promise<void> {
    if (!(await this.users.lockActiveAccount(db, viewerId))) {
      throw new ForbiddenException(ACCOUNT_NOT_ACTIVE_MESSAGE);
    }
    await this.reactions.lockQuestion(db, questionId);
    if (!(await this.reactions.findVisibleQuestion(db, viewerId, questionId))) {
      throw new NotFoundException(QUESTION_NOT_FOUND_MESSAGE);
    }
  }

  /** The counters after the reaction. Opens the conversation first when the Y count has reached the threshold (R3). */
  private async response(db: ReactionsDb, viewerId: string, questionId: string): Promise<ReactionResponseDto> {
    const threshold = this.config.getOrThrow<number>('Y_CONVERSATION_THRESHOLD');
    const question = await this.reactions.findQuestionCounters(db, questionId);
    if (question.conversationOpenedAt === null && question.yCount >= threshold) {
      await this.openAndNotifyAuthor(db, viewerId, questionId, question.authorId);
    }
    const viewerReaction = await this.reactions.findQuestionReaction(db, viewerId, questionId);

    return {
      questionId,
      counters: { like: question.likeCount, dislike: question.dislikeCount, y: question.yCount },
      viewerReactions: viewerReaction ? [viewerReaction.kind] : [],
      yThreshold: threshold,
      conversationOpen: question.conversationOpenedAt !== null || question.yCount >= threshold,
    };
  }

  /**
   * Opens the conversation, once (R3). The author gets the notice only when another account's reaction opened it:
   * no notification is written for the account's own action.
   */
  private async openAndNotifyAuthor(
    db: ReactionsDb,
    viewerId: string,
    questionId: string,
    authorId: string,
  ): Promise<void> {
    const opened = await this.reactions.openConversation(db, questionId, new Date());
    if (opened.count === 1 && authorId !== viewerId) {
      await this.reactions.writeConversationOpened(db, questionId, authorId);
    }
  }
}
