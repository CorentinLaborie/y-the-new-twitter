import type { Page } from '@playwright/test';
import type { FeedQuestionJson, Reply } from './feed-kit';

// Mocked calls of the profile and of the follow lists (L1, L3 section 7.4). They sit in front of the feed mock: a
// route registered later is tried first, and every other call falls through to the feed mock with route.fallback().

const API_ORIGIN = 'http://localhost:8080';

export type ProfileJson = {
  handle: string;
  displayName: string;
  bio: string | null;
  joinedAt: string;
  followerCount: number;
  followingCount: number;
  viewerFollows: boolean;
  isOwnAccount: boolean;
};

export type AccountJson = { handle: string; displayName: string; viewerFollows: boolean };

export type ProfileHandlers = {
  profile: (handle: string) => Reply;
  questions?: (handle: string) => Reply;
  followers?: (handle: string) => Reply;
  following?: (handle: string) => Reply;
};

export function profile(overrides: Partial<ProfileJson> = {}): ProfileJson {
  return {
    handle: 'marthe',
    displayName: 'Marthe Dupont',
    bio: 'Curieuse de tout, je pose les questions que personne n’ose poser.',
    joinedAt: '2026-03-01T10:00:00.000Z',
    followerCount: 2340,
    followingCount: 182,
    viewerFollows: false,
    isOwnAccount: false,
    ...overrides,
  };
}

export function account(handle: string, viewerFollows = false): AccountJson {
  return { handle, displayName: `Compte ${handle}`, viewerFollows };
}

export async function mockProfileApi(page: Page, handlers: ProfileHandlers) {
  const unfollowCalls: string[] = [];

  await page.route(`${API_ORIGIN}/api/v1/users/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fallback();
      return;
    }
    const url = new URL(request.url());
    const match = /^\/api\/v1\/users\/([^/]+)(?:\/(questions|followers|following|follow))?$/.exec(
      url.pathname,
    );
    if (!match) {
      await route.fallback();
      return;
    }
    const [, handle = '', part] = match;

    if (request.method() === 'DELETE' && part === 'follow') {
      unfollowCalls.push(handle);
      await route.fulfill({ status: 204, headers: corsHeaders(request.headers()['origin']) });
      return;
    }
    if (request.method() !== 'GET') {
      await route.fallback();
      return;
    }

    let reply: Reply;
    if (part === undefined) {
      reply = handlers.profile(handle);
    } else if (part === 'questions') {
      reply = handlers.questions
        ? handlers.questions(handle)
        : { status: 200, body: { questions: [], nextCursor: null } };
    } else if (part === 'followers') {
      reply = handlers.followers
        ? handlers.followers(handle)
        : { status: 200, body: { items: [], nextCursor: null } };
    } else if (part === 'following') {
      reply = handlers.following
        ? handlers.following(handle)
        : { status: 200, body: { items: [], nextCursor: null } };
    } else {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: reply.status,
      headers: corsHeaders(request.headers()['origin']),
      contentType: 'application/json',
      body: reply.body === undefined ? '' : JSON.stringify(reply.body),
    });
  });

  return { unfollowCalls };
}

function corsHeaders(origin: string | undefined): Record<string, string> {
  return {
    'access-control-allow-origin': origin ?? '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, x-csrf-token, idempotency-key',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
}

export function questionOf(id: string, text: string, author: AccountJson): FeedQuestionJson {
  return {
    id,
    text,
    hashtags: [],
    createdAt: '2026-10-14T08:41:00Z',
    author: { ...author, displayName: author.displayName },
    counters: { like: 1, dislike: 0, y: 3, reply: 0 },
    yThreshold: 50,
    conversationOpen: false,
    viewerReactions: [],
  };
}
