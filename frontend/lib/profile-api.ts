import type { FeedQuestion } from '@/lib/feed-api';
import type { ApiResult } from '@/lib/api-client';
import { protectedApiRequest } from '@/lib/session-expired';

/** A public profile as GET /users/{handle} sends it (L1). Times are ISO 8601 in UTC. */
export type ProfileView = {
  handle: string;
  displayName: string;
  bio: string | null;
  joinedAt: string;
  followerCount: number;
  followingCount: number;
  viewerFollows: boolean;
  isOwnAccount: boolean;
};

/** The fields of one's own profile after a save (PATCH /users/me answers them). `bio` is null when empty. */
export type OwnProfile = { handle: string; displayName: string; bio: string | null };

/** The fields to change: only the ones sent are changed. A `bio` of null clears it. */
export type OwnProfileChanges = { handle?: string; displayName?: string; bio?: string | null };

/** One page of the questions of an account, newest first. `nextCursor` is null on the last page. */
export type ProfileQuestionsPage = { questions: FeedQuestion[]; nextCursor: string | null };

/** An account in a follower or following list, with the viewer's follow state for its row. */
export type FollowAccount = { handle: string; displayName: string; viewerFollows: boolean };

export type FollowListPage = { items: FollowAccount[]; nextCursor: string | null };

const PAGE_SIZE = 20;

/** The public profile of the account. A profile that is not visible answers 404 (the same as a missing one). */
export function fetchProfile(handle: string): Promise<ApiResult<ProfileView>> {
  return protectedApiRequest<ProfileView>('GET', `/users/${handle}`);
}

/** Saves the changed fields of one's own profile (PATCH /users/me). A taken handle answers 409. */
export function updateOwnProfile(changes: OwnProfileChanges): Promise<ApiResult<OwnProfile>> {
  return protectedApiRequest<OwnProfile>('PATCH', '/users/me', { body: changes });
}

/** Uploads the profile photo as the raw image (PUT /users/me/avatar). Its address is the answer's `avatarUrl`. */
export function uploadAvatar(photo: Blob): Promise<ApiResult<{ avatarUrl: string }>> {
  return protectedApiRequest<{ avatarUrl: string }>('PUT', '/users/me/avatar', { rawBody: photo });
}

/** One page of the questions of the account. `cursor` is the nextCursor of the previous page. */
export function fetchProfileQuestions(
  handle: string,
  cursor?: string,
): Promise<ApiResult<ProfileQuestionsPage>> {
  return protectedApiRequest<ProfileQuestionsPage>('GET', `/users/${handle}/questions?${pageQuery(cursor)}`);
}

/** One page of the followers (`followers`) or following (`following`) list of the account. */
export function fetchFollowList(
  handle: string,
  list: 'followers' | 'following',
  cursor?: string,
): Promise<ApiResult<FollowListPage>> {
  return protectedApiRequest<FollowListPage>('GET', `/users/${handle}/${list}?${pageQuery(cursor)}`);
}

function pageQuery(cursor?: string): string {
  const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor) {
    query.set('cursor', cursor);
  }
  return query.toString();
}
