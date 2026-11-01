import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SessionUser } from '../auth/session/session-user.repository';
import { decodeKeysetCursor, encodeKeysetCursor } from '../common/pagination/keyset-cursor';
import type { ReactionKind } from '../database/generated/client/client';
import { FollowListQueryDto } from '../follows/dto/follow-list-query.dto';
import { toQuestionView } from '../questions/question-view';
import { ProfileQuestionsPageDto } from './dto/profile-questions-page.dto';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { ProfilesRepository } from './profiles.repository';

/** The 404 message of a profile that does not exist or is not visible to the viewer (same as the follow routes). */
export const PROFILE_NOT_FOUND_MESSAGE = 'Compte introuvable.';

/**
 * Public profiles (L1). A profile is visible when its account is active and not blocked in either direction with the
 * viewer (R13, R14); anything else answers 404 with the same message.
 */
@Injectable()
export class ProfilesService {
  constructor(
    private readonly profiles: ProfilesRepository,
    private readonly config: ConfigService,
  ) {}

  async profile(viewer: SessionUser, handle: string): Promise<ProfileResponseDto> {
    const account = await this.visibleAccount(viewer, handle);
    const isOwnAccount = account.id === viewer.id;

    return {
      handle: account.handle,
      displayName: account.displayName,
      bio: account.bio,
      avatarUrl: account.avatarUrl,
      joinedAt: account.createdAt.toISOString(),
      followerCount: account.followerCount,
      followingCount: account.followingCount,
      viewerFollows: !isOwnAccount && (await this.profiles.viewerFollows(viewer.id, account.id)),
      isOwnAccount,
    };
  }

  /** The questions of the account, newest first, one page. Same view and reactions as the feed (section 9.2). */
  async questions(
    viewer: SessionUser,
    handle: string,
    query: FollowListQueryDto,
  ): Promise<ProfileQuestionsPageDto> {
    const account = await this.visibleAccount(viewer, handle);
    const limit = query.limit;
    const after = query.cursor === undefined ? null : decodeKeysetCursor(query.cursor);
    const rows = await this.profiles.findQuestionPage(viewer.id, account.id, after, limit + 1);
    const page = rows.slice(0, limit);
    const reactions = await this.profiles.findViewerReactions(
      viewer.id,
      page.map((row) => row.id),
    );
    const kindsByQuestion = new Map<string, ReactionKind[]>();
    for (const reaction of reactions) {
      kindsByQuestion.set(reaction.questionId, [reaction.kind]);
    }
    const saved = await this.profiles.findViewerSaved(
      viewer.id,
      page.map((row) => row.id),
    );
    const savedIds = new Set(saved.map((row) => row.questionId));
    const viewerFollows =
      account.id !== viewer.id && (await this.profiles.viewerFollows(viewer.id, account.id));
    const threshold = this.config.getOrThrow<number>('Y_CONVERSATION_THRESHOLD');
    const last = page.at(-1);

    return {
      questions: page.map((row) =>
        toQuestionView(
          row,
          threshold,
          kindsByQuestion.get(row.id) ?? [],
          viewerFollows,
          savedIds.has(row.id),
        ),
      ),
      nextCursor: rows.length > limit && last !== undefined ? encodeKeysetCursor(last) : null,
    };
  }

  private async visibleAccount(viewer: SessionUser, handle: string) {
    const account = await this.profiles.findVisibleAccount(viewer.id, handle);
    if (account === null) {
      throw new NotFoundException(PROFILE_NOT_FOUND_MESSAGE);
    }

    return account;
  }
}
