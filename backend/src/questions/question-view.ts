import type { Prisma, ReactionKind } from '../database/generated/client/client';
import { visibleAccountTo } from '../users/account-visibility';
import type { QuestionResponseDto } from './dto/question-response.dto';

/** What a question view needs: the author's public names and the hashtags, read with the question. */
export const QUESTION_VIEW_INCLUDE = {
  author: { select: { handle: true, displayName: true } },
  hashtags: { include: { hashtag: { select: { name: true } } } },
} satisfies Prisma.QuestionInclude;

export type QuestionRow = Prisma.QuestionGetPayload<{ include: typeof QUESTION_VIEW_INCLUDE }>;

/** The 404 message of every question route when the question is missing, hidden, deleted or blocked. */
export const QUESTION_NOT_FOUND_MESSAGE = 'Question introuvable.';

/**
 * What the public may see of a question: not deleted, visible, and written by an active account (R13,
 * DEC-086, DEC-087). Every read of a question for another user goes through this filter.
 */
export const VISIBLE_QUESTION = {
  deletedAt: null,
  moderationStatus: 'visible',
  author: { status: 'active' },
} satisfies Prisma.QuestionWhereInput;

/**
 * What one viewer may see: VISIBLE_QUESTION, and no block in either direction (R14). The feed and the reactions
 * both read questions through this filter, so a blocked viewer gets the same answer everywhere.
 */
export function visibleTo(viewerId: string) {
  return {
    AND: [VISIBLE_QUESTION, { author: visibleAccountTo(viewerId) }],
  };
}

/** The fields a view reads: a question read with QUESTION_VIEW_INCLUDE, or one built after its creation. */
type QuestionViewSource = Pick<
  QuestionRow,
  | 'id'
  | 'body'
  | 'createdAt'
  | 'likeCount'
  | 'dislikeCount'
  | 'yCount'
  | 'replyCount'
  | 'conversationOpenedAt'
  | 'author'
> & { readonly hashtags: readonly { readonly hashtag: { readonly name: string } }[] };

/**
 * A question as the API returns it. Hashtags are sorted by name, so every endpoint gives the same order.
 * `viewerReactions` is the reaction the signed-in viewer gave, read by the caller (at most one, R11).
 * `viewerFollowsAuthor` tells whether the viewer follows the author, read by the caller (L3).
 */
export function toQuestionView(
  row: QuestionViewSource,
  threshold: number,
  viewerReactions: readonly ReactionKind[],
  viewerFollowsAuthor: boolean,
): QuestionResponseDto {
  return {
    id: row.id,
    text: row.body,
    createdAt: row.createdAt.toISOString(),
    author: {
      handle: row.author.handle,
      displayName: row.author.displayName,
      viewerFollows: viewerFollowsAuthor,
    },
    hashtags: row.hashtags.map((link) => link.hashtag.name).sort(),
    counters: {
      like: row.likeCount,
      dislike: row.dislikeCount,
      y: row.yCount,
      reply: row.replyCount,
    },
    yThreshold: threshold,
    conversationOpen: row.conversationOpenedAt !== null,
    viewerReactions: [...viewerReactions],
  };
}
