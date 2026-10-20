import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SessionUser } from '../auth/session/session-user.repository';
import { PrismaService } from '../database/prisma.service';
import type { ReactionKind } from '../database/generated/client/client';
import { ReactionResponseDto } from './dto/reaction-response.dto';
import { CounterChange, ReactionsDb, ReactionsRepository } from './reactions.repository';

const QUESTION_NOT_FOUND = 'Question introuvable.';

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
    private readonly config: ConfigService,
  ) {}

  /** Sets the viewer's reaction to `kind`, replacing another one. Repeating the same kind changes nothing. */
  async set(viewer: SessionUser, questionId: string, kind: ReactionKind): Promise<ReactionResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockVisibleQuestion(tx, viewer.id, questionId);
      const current = await this.reactions.findReaction(tx, viewer.id, questionId);
      if (current?.kind !== kind) {
        await this.reactions.setReaction(tx, viewer.id, questionId, kind);
        await this.reactions.changeCounters(tx, questionId, counterChange(current?.kind ?? null, kind));
      }

      return this.response(tx, viewer.id, questionId);
    });
  }

  /** Removes the viewer's reaction when it has this kind. Nothing else is removed. */
  async remove(viewer: SessionUser, questionId: string, kind: ReactionKind): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockVisibleQuestion(tx, viewer.id, questionId);
      const current = await this.reactions.findReaction(tx, viewer.id, questionId);
      if (current?.kind === kind) {
        await this.reactions.removeReaction(tx, viewer.id, questionId);
        await this.reactions.changeCounters(tx, questionId, counterChange(kind, null));
      }
    });
  }

  /** Locks the question first, so every reaction on it is applied in turn (B4). Hidden or blocked questions are not found. */
  private async lockVisibleQuestion(db: ReactionsDb, viewerId: string, questionId: string): Promise<void> {
    await this.reactions.lockQuestion(db, questionId);
    if (!(await this.reactions.findVisibleQuestion(db, viewerId, questionId))) {
      throw new NotFoundException(QUESTION_NOT_FOUND);
    }
  }

  private async response(db: ReactionsDb, viewerId: string, questionId: string): Promise<ReactionResponseDto> {
    const threshold = this.config.getOrThrow<number>('Y_CONVERSATION_THRESHOLD');
    const counters = await this.reactions.findCounters(db, questionId);
    if (counters.conversationOpenedAt === null && counters.yCount >= threshold) {
      const opened = await this.reactions.openConversation(db, questionId, new Date());
      if (opened.count === 1) {
        await this.reactions.writeConversationOpened(db, questionId, counters.authorId);
      }
    }
    const viewer = await this.reactions.findReaction(db, viewerId, questionId);

    return {
      questionId,
      counts: { like: counters.likeCount, dislike: counters.dislikeCount, y: counters.yCount },
      viewerReactions: viewer ? [viewer.kind] : [],
      yThreshold: threshold,
      conversationOpen: counters.conversationOpenedAt !== null || counters.yCount >= threshold,
    };
  }
}
