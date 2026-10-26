import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SessionUser } from '../auth/session/session-user.repository';
import { decodeKeysetCursor, encodeKeysetCursor } from '../common/pagination/keyset-cursor';
import { FollowListQueryDto } from '../follows/dto/follow-list-query.dto';
import type { ReactionKind } from '../database/generated/client/client';
import { QUESTION_NOT_FOUND_MESSAGE, toQuestionView } from '../questions/question-view';
import { QuestionsRepository } from '../questions/questions.repository';
import { BookmarkPageDto } from './dto/bookmark-page.dto';
import { BookmarkStateDto } from './dto/bookmark-state.dto';
import { BookmarksRepository } from './bookmarks.repository';

/**
 * Saved questions (L4, section 9.2). Saving and unsaving are idempotent. A question the viewer may no longer see is not
 * found when it is saved, and it is left out of the list (R13, R14).
 */
@Injectable()
export class BookmarksService {
  constructor(
    private readonly bookmarks: BookmarksRepository,
    private readonly questions: QuestionsRepository,
    private readonly config: ConfigService,
  ) {}

  /** The viewer saves the question. Saving it again changes nothing. */
  async save(viewer: SessionUser, questionId: string): Promise<BookmarkStateDto> {
    const visible = await this.bookmarks.findVisibleQuestion(viewer.id, questionId);
    if (visible === null) {
      throw new NotFoundException(QUESTION_NOT_FOUND_MESSAGE);
    }
    await this.bookmarks.createBookmark(viewer.id, questionId);

    return { questionId, saved: true };
  }

  /** The viewer removes the question from the saved list. Nothing happens when it was not saved. */
  async remove(viewer: SessionUser, questionId: string): Promise<void> {
    await this.bookmarks.deleteBookmark(viewer.id, questionId);
  }

  /** The saved questions, the most recently saved first, in pages with a cursor (section 9.1). */
  async list(viewer: SessionUser, query: FollowListQueryDto): Promise<BookmarkPageDto> {
    const limit = query.limit;
    const after = query.cursor === undefined ? undefined : decodeKeysetCursor(query.cursor);
    const rows = await this.bookmarks.findPage(viewer.id, after, limit + 1);
    const page = rows.slice(0, limit);
    const questionIds = page.map((row) => row.questionId);
    const reactions = await this.questions.findViewerReactions(viewer.id, questionIds);
    const follows = await this.questions.findFollowedAuthorIds(
      viewer.id,
      page.map((row) => row.question.authorId),
    );
    const kindsByQuestion = new Map<string, ReactionKind[]>();
    for (const reaction of reactions) {
      kindsByQuestion.set(reaction.questionId, [reaction.kind]);
    }
    const followedAuthors = new Set(follows.map((follow) => follow.followeeId));
    const threshold = this.config.getOrThrow<number>('Y_CONVERSATION_THRESHOLD');
    const last = page.at(-1);

    return {
      questions: page.map((row) =>
        toQuestionView(
          row.question,
          threshold,
          kindsByQuestion.get(row.questionId) ?? [],
          followedAuthors.has(row.question.authorId),
          true,
        ),
      ),
      // The cursor is the save position of the last row, not the question: the list is ordered by it.
      nextCursor:
        rows.length > limit && last !== undefined
          ? encodeKeysetCursor({ createdAt: last.createdAt, id: last.questionId })
          : null,
    };
  }
}
