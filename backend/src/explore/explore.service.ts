import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SessionUser } from '../auth/session/session-user.repository';
import type { ReactionKind } from '../database/generated/client/client';
import { decodeCursor, encodeCursor } from '../feed/feed-cursor';
import { toQuestionView, type QuestionRow } from '../questions/question-view';
import { QuestionsRepository } from '../questions/questions.repository';
import type { QuestionResponseDto } from '../questions/dto/question-response.dto';
import { ExploreRepository, type SuggestedAccountRow, type TrendingHashtagRow } from './explore.repository';

/** The trends, the popular questions and the suggestions are read over the last 24 hours (DEC-046, DEC-091). */
const WINDOW_MS = 24 * 60 * 60 * 1000;

const TRENDS_COUNT = 10;
const POPULAR_COUNT = 10;
const SUGGESTIONS_COUNT = 5;
const SEARCH_QUESTIONS_COUNT = 10;
const SEARCH_HASHTAGS_COUNT = 5;
const SEARCH_ACCOUNTS_COUNT = 5;
const HASHTAG_PAGE_DEFAULT = 20;

export interface SearchResult {
  readonly questions: QuestionResponseDto[];
  readonly hashtags: { readonly name: string }[];
  readonly accounts: {
    readonly handle: string;
    readonly displayName: string;
    readonly avatarUrl: string | null;
  }[];
}

export interface HashtagPage {
  readonly questions: QuestionResponseDto[];
  readonly nextCursor: string | null;
}

/**
 * Explore (M4, section 3.2): trends, popular questions, search, suggested accounts and the questions of a hashtag.
 * Each read is filtered by the viewer (R13, R14). The question views are built the same way as the feed's.
 */
@Injectable()
export class ExploreService {
  constructor(
    private readonly explore: ExploreRepository,
    private readonly questions: QuestionsRepository,
    private readonly config: ConfigService,
  ) {}

  /** The hashtags with the most reactions in the last 24 hours (labelled « sur 24 h »). */
  async trends(viewer: SessionUser): Promise<{ hashtags: TrendingHashtagRow[] }> {
    return {
      hashtags: await this.explore.trendingHashtags(viewer.id, this.since(), TRENDS_COUNT),
    };
  }

  /** The visible questions with the most reactions in the last 24 hours. */
  async popular(viewer: SessionUser): Promise<{ questions: QuestionResponseDto[] }> {
    const ids = await this.explore.popularQuestionIds(viewer.id, this.since(), POPULAR_COUNT);
    const rows = await this.explore.findVisibleQuestions(viewer.id, ids);

    return { questions: await this.views(viewer.id, orderByIds(rows, ids)) };
  }

  /** Active accounts the viewer does not follow, ranked by recent and total reactions, then hashtags and followers. */
  async suggestions(viewer: SessionUser): Promise<{ accounts: SuggestedAccountRow[] }> {
    return {
      accounts: await this.explore.suggestedAccounts(viewer.id, this.since(), SUGGESTIONS_COUNT),
    };
  }

  /** Search over questions, hashtags and accounts. The text is trimmed by the caller; an empty text finds nothing. */
  async search(viewer: SessionUser, text: string): Promise<SearchResult> {
    const [rows, hashtags, accounts] = await Promise.all([
      this.explore.searchQuestions(viewer.id, text, SEARCH_QUESTIONS_COUNT),
      this.explore.searchHashtags(text.toLowerCase(), SEARCH_HASHTAGS_COUNT),
      this.explore.searchAccounts(viewer.id, text, SEARCH_ACCOUNTS_COUNT),
    ]);

    return {
      questions: await this.views(viewer.id, rows),
      hashtags,
      accounts,
    };
  }

  /** The newest visible questions of a hashtag, one page after the cursor (newest first). */
  async hashtagPage(
    viewer: SessionUser,
    hashtag: string,
    cursor: string | undefined,
    limit: number | undefined,
  ): Promise<HashtagPage> {
    const take = limit ?? HASHTAG_PAGE_DEFAULT;
    const after = cursor === undefined ? null : decodeCursor(cursor);
    const rows = await this.explore.findHashtagPage(viewer.id, hashtag.toLowerCase(), after, take + 1);
    const page = rows.slice(0, take);
    const last = page.at(-1);

    return {
      questions: await this.views(viewer.id, page),
      nextCursor: rows.length > take && last !== undefined ? encodeCursor(last) : null,
    };
  }

  private since(): Date {
    return new Date(Date.now() - WINDOW_MS);
  }

  /** The question views of these rows, with the viewer's reactions, follows and saves read in one query each. */
  private async views(viewerId: string, rows: readonly QuestionRow[]): Promise<QuestionResponseDto[]> {
    const threshold = this.config.getOrThrow<number>('Y_CONVERSATION_THRESHOLD');
    const ids = rows.map((row) => row.id);
    const reactions = await this.questions.findViewerReactions(viewerId, ids);
    const follows = await this.questions.findFollowedAuthorIds(
      viewerId,
      rows.map((row) => row.authorId),
    );
    const saved = await this.questions.findViewerSaved(viewerId, ids);

    const reactionsByQuestion = new Map<string, ReactionKind[]>();
    for (const reaction of reactions) {
      reactionsByQuestion.set(reaction.questionId, [
        ...(reactionsByQuestion.get(reaction.questionId) ?? []),
        reaction.kind,
      ]);
    }
    const followed = new Set(follows.map((follow) => follow.followeeId));
    const savedIds = new Set(saved.map((row) => row.questionId));

    return rows.map((row) =>
      toQuestionView(
        row,
        threshold,
        reactionsByQuestion.get(row.id) ?? [],
        followed.has(row.authorId),
        savedIds.has(row.id),
      ),
    );
  }
}

/** The rows in the order of the ids (the database does not keep the order of an IN list). */
function orderByIds(rows: readonly QuestionRow[], ids: readonly string[]): QuestionRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));

  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}
