/*
 * Client of the Explore screens (M4). Contract: backend/openapi.yaml, served by the API under /api/v1.
 *
 * GET /explore/trends       200 { hashtags: [{ name, reactions }] }: reactions in the last 24 h (label « sur 24 h »).
 * GET /explore/popular      200 { questions: FeedQuestion[] }: the most reacted visible questions of the last 24 h.
 * GET /explore/suggestions  200 { accounts: [{ id, handle, displayName }] }: active accounts the viewer does not follow.
 * GET /search?q=…           200 { questions, hashtags: [{ name }], accounts: [{ handle, displayName }] }.
 * GET /hashtags/{tag}/questions[?cursor=…&limit=…]   200 { questions, nextCursor }, newest first.
 *
 * Errors are Problem Details, read as ApiProblem (lib/api-client.ts).
 */

import type { ApiResult } from '@/lib/api-client';
import { protectedApiRequest } from '@/lib/session-expired';
import type { FeedQuestion } from '@/lib/feed-api';

export type TrendingHashtag = { name: string; reactions: number };

export type SuggestedAccount = { id: string; handle: string; displayName: string; avatarUrl: string | null };

export type SearchResult = {
  questions: FeedQuestion[];
  hashtags: { name: string }[];
  accounts: { handle: string; displayName: string; avatarUrl: string | null }[];
};

export type HashtagPage = { questions: FeedQuestion[]; nextCursor: string | null };

export function fetchTrends(): Promise<ApiResult<{ hashtags: TrendingHashtag[] }>> {
  return protectedApiRequest('GET', '/explore/trends');
}

export function fetchPopular(): Promise<ApiResult<{ questions: FeedQuestion[] }>> {
  return protectedApiRequest('GET', '/explore/popular');
}

export function fetchSuggestions(): Promise<ApiResult<{ accounts: SuggestedAccount[] }>> {
  return protectedApiRequest('GET', '/explore/suggestions');
}

export function search(text: string): Promise<ApiResult<SearchResult>> {
  return protectedApiRequest('GET', `/search?q=${encodeURIComponent(text)}`);
}

export function fetchHashtagPage(tag: string, cursor?: string): Promise<ApiResult<HashtagPage>> {
  const query = cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`;
  return protectedApiRequest('GET', `/hashtags/${encodeURIComponent(tag)}/questions${query}`);
}
