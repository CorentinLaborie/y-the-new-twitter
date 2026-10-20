import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SessionUser } from '../auth/session/session-user.repository';
import type { ReactionKind } from '../database/generated/client/client';
import { toQuestionView, type QuestionRow } from '../questions/question-view';
import { decodeCursor, encodeCursor } from './feed-cursor';
import { FeedQueryDto } from './dto/feed-query.dto';
import { FeedPageDto } from './dto/feed-page.dto';
import { FeedRepository } from './feed.repository';

const DEFAULT_LIMIT = 20;

/** Trending: the questions with the most reactions in the last 24 hours (DEC-046, DEC-091). */
const TRENDING_WINDOW_MS = 24 * 60 * 60 * 1000;

/** How many trending questions the first page shows (DEC-159). */
const TRENDING_COUNT = 10;

/**
 * The "Pour vous" feed (M2, B6). The first page opens with the trending block (the most reacted questions of the
 * last 24 hours). Below it, the list by date, newest first, holds every visible question (R12); on the first page,
 * the trending questions are not repeated in the list. Cursor pages have no trending block.
 */
@Injectable()
export class FeedService {
  constructor(
    private readonly feed: FeedRepository,
    private readonly config: ConfigService,
  ) {}

  async forYou(viewer: SessionUser, query: FeedQueryDto): Promise<FeedPageDto> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const after = query.cursor === undefined ? null : decodeCursor(query.cursor);
    const threshold = this.config.getOrThrow<number>('Y_CONVERSATION_THRESHOLD');
    const trendingRows = after === null ? await this.trendingRows(viewer.id) : [];
    const rows = await this.feed.findPage({
      viewerId: viewer.id,
      after,
      take: limit + 1,
      excludeIds: trendingRows.map((row) => row.id),
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const viewerReactionsByQuestion = await this.viewerReactionsByQuestion(viewer.id, [...trendingRows, ...page]);
    const toView = (row: QuestionRow) =>
      toQuestionView(row, threshold, viewerReactionsByQuestion.get(row.id) ?? []);

    return {
      trending: trendingRows.map(toView),
      questions: page.map(toView),
      nextCursor: rows.length > limit && last !== undefined ? encodeCursor(last) : null,
    };
  }

  /** The most reacted visible questions of the last 24 hours, most reacted first (at most TRENDING_COUNT). */
  private async trendingRows(viewerId: string): Promise<QuestionRow[]> {
    const ids = await this.feed.findTrendingIds(
      viewerId,
      new Date(Date.now() - TRENDING_WINDOW_MS),
      TRENDING_COUNT,
    );
    const rows = await this.feed.findVisibleByIds(viewerId, ids);
    const rowsById = new Map(rows.map((row) => [row.id, row]));

    return ids.flatMap((id) => {
      const row = rowsById.get(id);
      return row ? [row] : [];
    });
  }

  /** The viewer's own reaction on each of these questions, by question id (at most one, R11). */
  private async viewerReactionsByQuestion(
    viewerId: string,
    rows: readonly QuestionRow[],
  ): Promise<Map<string, ReactionKind[]>> {
    const reactions = await this.feed.findViewerQuestionReactions(
      viewerId,
      rows.map((row) => row.id),
    );
    const kindsByQuestionId = new Map<string, ReactionKind[]>();
    for (const reaction of reactions) {
      kindsByQuestionId.set(reaction.questionId, [reaction.kind]);
    }

    return kindsByQuestionId;
  }
}
