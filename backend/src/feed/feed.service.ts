import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SessionUser } from '../auth/session/session-user.repository';
import type { ReactionKind } from '../database/generated/client/client';
import { toQuestionView, type QuestionRow } from '../questions/question-view';
import { QuestionsRepository } from '../questions/questions.repository';
import { decodeCursor, encodeCursor } from './feed-cursor';
import { FeedQueryDto } from './dto/feed-query.dto';
import { FeedPageDto } from './dto/feed-page.dto';
import { FeedRepository } from './feed.repository';

const DEFAULT_LIMIT = 20;

/** Trending: the questions with the most reactions in the last 24 hours (DEC-046, DEC-091). */
const TRENDING_WINDOW_MS = 24 * 60 * 60 * 1000;

/** How many trending questions the first page shows (DEC-159). */
const TRENDING_COUNT = 10;

/** The cursor of the next page: the last row of this page, when a row is left after it. */
function nextCursorOf(rows: readonly QuestionRow[], limit: number): string | null {
  const last = rows.slice(0, limit).at(-1);
  return rows.length > limit && last !== undefined ? encodeCursor(last) : null;
}

/**
 * The feed (M2, B6, L3). "Pour vous" (forYou): the first page opens with the trending block (the most reacted
 * questions of the last 24 hours). Below it, the list by date, newest first, holds every visible question (R12); on
 * the first page, the trending questions are not repeated in the list. Cursor pages have no trending block.
 * "Abonnements" (following): the same list by date, limited to the accounts the viewer follows, with no trending block.
 */
@Injectable()
export class FeedService {
  constructor(
    private readonly feed: FeedRepository,
    private readonly questions: QuestionsRepository,
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
    const viewerReactionsByQuestion = await this.viewerReactionsByQuestion(viewer.id, [
      ...trendingRows,
      ...page,
    ]);
    const followedAuthors = await this.followedAuthorIds(viewer.id, [...trendingRows, ...page]);
    const savedIds = await this.viewerSavedIds(viewer.id, [...trendingRows, ...page]);
    const toView = (row: QuestionRow) =>
      toQuestionView(
        row,
        threshold,
        viewerReactionsByQuestion.get(row.id) ?? [],
        followedAuthors.has(row.authorId),
        savedIds.has(row.id),
      );

    return {
      trending: trendingRows.map(toView),
      questions: page.map(toView),
      nextCursor: nextCursorOf(rows, limit),
    };
  }

  async following(viewer: SessionUser, query: FeedQueryDto): Promise<FeedPageDto> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const after = query.cursor === undefined ? null : decodeCursor(query.cursor);
    const threshold = this.config.getOrThrow<number>('Y_CONVERSATION_THRESHOLD');
    const rows = await this.feed.findFollowingPage({ viewerId: viewer.id, after, take: limit + 1 });
    const page = rows.slice(0, limit);
    const viewerReactionsByQuestion = await this.viewerReactionsByQuestion(viewer.id, page);
    const followedAuthors = await this.followedAuthorIds(viewer.id, page);
    const savedIds = await this.viewerSavedIds(viewer.id, page);

    return {
      trending: [],
      questions: page.map((row) =>
        toQuestionView(
          row,
          threshold,
          viewerReactionsByQuestion.get(row.id) ?? [],
          followedAuthors.has(row.authorId),
          savedIds.has(row.id),
        ),
      ),
      nextCursor: nextCursorOf(rows, limit),
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

  /** The authors of these questions that the viewer follows, one query per page (author.viewerFollows). */
  private async followedAuthorIds(viewerId: string, rows: readonly QuestionRow[]): Promise<Set<string>> {
    const follows = await this.questions.findFollowedAuthorIds(
      viewerId,
      rows.map((row) => row.authorId),
    );

    return new Set(follows.map((follow) => follow.followeeId));
  }

  /** The ids of these questions that the viewer saved (viewerSaved, L4). */
  private async viewerSavedIds(viewerId: string, rows: readonly QuestionRow[]): Promise<Set<string>> {
    const saved = await this.questions.findViewerSaved(
      viewerId,
      rows.map((row) => row.id),
    );

    return new Set(saved.map((row) => row.questionId));
  }

  /** The viewer's own reaction on each of these questions, by question id (at most one, R11). */
  private async viewerReactionsByQuestion(
    viewerId: string,
    rows: readonly QuestionRow[],
  ): Promise<Map<string, ReactionKind[]>> {
    const reactions = await this.questions.findViewerReactions(
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
