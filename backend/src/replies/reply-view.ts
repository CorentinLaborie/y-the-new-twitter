import type { Prisma, ReplyReactionKind } from '../database/generated/client/client';
import { extractMentionHandles } from '../mentions/mention-text';
import { visibleTo } from '../questions/question-view';
import type { ReplyResponseDto } from './dto/reply-response.dto';

/** What a reply view needs: the author's public names, read with the reply. */
export const REPLY_VIEW_INCLUDE = {
  author: { select: { handle: true, displayName: true, avatarUrl: true } },
} satisfies Prisma.ReplyInclude;

type ReplyRow = Prisma.ReplyGetPayload<{ include: typeof REPLY_VIEW_INCLUDE }>;

/**
 * What one viewer may see of a reply: not deleted, visible, written by an active account, no block in either
 * direction between the viewer and the author (R13, R14), and the question itself visible to the viewer.
 */
export function visibleReplyTo(viewerId: string) {
  return {
    deletedAt: null,
    moderationStatus: 'visible',
    author: {
      status: 'active',
      blocks: { none: { blockedId: viewerId } },
      blockedBy: { none: { blockerId: viewerId } },
    },
    question: visibleTo(viewerId),
  } satisfies Prisma.ReplyWhereInput;
}

/**
 * A reply as the API returns it. `viewerReactions` is read by the caller: both kinds can be set (R2). `linkable` holds
 * the lowercase handles whose profile the viewer may open (MentionsService.linkableHandles): only those are linked.
 */
export function toReplyView(
  row: ReplyRow,
  counters: { readonly likeCount: number; readonly dislikeCount: number },
  viewerReactions: readonly ReplyReactionKind[],
  linkable: ReadonlySet<string>,
): ReplyResponseDto {
  return {
    id: row.id,
    questionId: row.questionId,
    text: row.body,
    createdAt: row.createdAt.toISOString(),
    author: {
      handle: row.author.handle,
      displayName: row.author.displayName,
      avatarUrl: row.author.avatarUrl,
    },
    counters: { like: counters.likeCount, dislike: counters.dislikeCount },
    viewerReactions: [...viewerReactions],
    mentionLinks: extractMentionHandles(row.body).filter((handle) => linkable.has(handle)),
  };
}
