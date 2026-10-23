import type { BrowserContext, Page } from '@playwright/test';

// Shared helpers of the home feed end-to-end tests (mocked API, as the auth tests of auth-kit.ts).
// The browser calls of the feed and of the composer are answered here and recorded. The session of the protected
// page is checked on the server: e2e/session-stub.mjs answers it for the cookie SESSION=e2e-feed.

const API_ORIGIN = 'http://localhost:8080';
const REACTION_PATH = /^\/questions\/([^/]+)\/reactions\/(like|dislike|y)$/;
const FOLLOW_PATH = /^\/users\/([^/]+)\/follow$/;

const SIGNED_IN = { name: 'SESSION', value: 'e2e-feed' } as const;
const CSRF = { name: 'y_csrf', value: 'csrf-e2e' } as const;

export type Reply = { status: number; body?: unknown };

export type FeedQuestionJson = {
  id: string;
  text: string;
  hashtags: string[];
  createdAt: string;
  author: { handle: string; displayName: string; viewerFollows: boolean };
  counters: { like: number; dislike: number; y: number; reply: number };
  yThreshold: number;
  conversationOpen: boolean;
  viewerReactions: string[];
};

export type ReactionCall = {
  method: 'PUT' | 'DELETE';
  questionId: string;
  kind: string;
  csrf: string | null;
};

type FeedCall = { cursor: string | null; tab: string | null };
// The unfollow of "Ne plus suivre" (L3): the handle of the account, in the path of DELETE /users/{handle}/follow.
export type UnfollowCall = { handle: string; csrf: string | null };
type PostCall = { body: { text: string }; csrf: string | null; idempotencyKey: string | null };

type Handlers = {
  feed?: (call: FeedCall) => Reply | Promise<Reply>;
  post?: (call: PostCall) => Reply | Promise<Reply>;
  reaction?: (call: ReactionCall) => Reply | Promise<Reply>;
  unfollow?: (call: UnfollowCall) => Reply | Promise<Reply>;
};

// Answers the feed and posting calls. Unknown calls get a 404, so that a missing reply fails the test visibly.
export async function mockFeedApi(page: Page, handlers: Handlers = {}) {
  const feedCalls: FeedCall[] = [];
  const postCalls: PostCall[] = [];
  const reactionCalls: ReactionCall[] = [];
  const unfollowCalls: UnfollowCall[] = [];

  await page.route(`${API_ORIGIN}/api/v1/**`, async (route) => {
    const request = route.request();
    const cors: Record<string, string> = {
      'access-control-allow-origin': request.headers()['origin'] ?? '*',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type, x-csrf-token, idempotency-key',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }

    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    let reply: Reply = {
      status: 404,
      body: { title: `Aucune réponse simulée pour ${request.method()} ${path}` },
    };

    if (request.method() === 'GET' && path === '/feed') {
      const call = { cursor: url.searchParams.get('cursor'), tab: url.searchParams.get('tab') };
      feedCalls.push(call);
      reply = handlers.feed ? await handlers.feed(call) : reply;
    } else if (request.method() === 'POST' && path === '/questions') {
      const headers = request.headers();
      const call: PostCall = {
        body: JSON.parse(request.postData() ?? '{}') as { text: string },
        csrf: headers['x-csrf-token'] ?? null,
        idempotencyKey: headers['idempotency-key'] ?? null,
      };
      postCalls.push(call);
      reply = handlers.post ? await handlers.post(call) : reply;
    } else if (REACTION_PATH.test(path) && ['PUT', 'DELETE'].includes(request.method())) {
      const [, questionId = '', kind = ''] = REACTION_PATH.exec(path) ?? [];
      const call: ReactionCall = {
        method: request.method() as 'PUT' | 'DELETE',
        questionId,
        kind,
        csrf: request.headers()['x-csrf-token'] ?? null,
      };
      reactionCalls.push(call);
      reply = handlers.reaction ? await handlers.reaction(call) : reply;
    } else if (request.method() === 'DELETE' && FOLLOW_PATH.test(path)) {
      const [, handle = ''] = FOLLOW_PATH.exec(path) ?? [];
      const call: UnfollowCall = { handle, csrf: request.headers()['x-csrf-token'] ?? null };
      unfollowCalls.push(call);
      reply = handlers.unfollow ? await handlers.unfollow(call) : reply;
    } else if (request.method() === 'GET' && path === '/status') {
      reply = { status: 200, body: { status: 'ok' } };
    }

    await route.fulfill({
      status: reply.status,
      headers: cors,
      contentType: 'application/json',
      body: reply.body === undefined ? '' : JSON.stringify(reply.body),
    });
  });

  return { feedCalls, postCalls, reactionCalls, unfollowCalls };
}

// The e2e session: the protected page is served, and the composer finds the CSRF token in its cookie.
export async function signIn(context: BrowserContext): Promise<void> {
  await context.addCookies([
    { ...SIGNED_IN, domain: 'localhost', path: '/' },
    { ...CSRF, domain: 'localhost', path: '/' },
  ]);
}

export function feedPage(
  questions: FeedQuestionJson[],
  nextCursor: string | null = null,
  trending: FeedQuestionJson[] = [],
): Reply {
  return { status: 200, body: { trending, questions, nextCursor } };
}

export function question(id: string, text: string, hashtags: string[] = []): FeedQuestionJson {
  return {
    id,
    text,
    hashtags,
    createdAt: '2026-10-14T08:41:00Z',
    author: { handle: `marthe_${id}`, displayName: `Marthe ${id.toUpperCase()}`, viewerFollows: false },
    counters: { like: 10, dislike: 2, y: 49, reply: 0 },
    yThreshold: 50,
    conversationOpen: false,
    viewerReactions: [],
  };
}

export const problemReply = (status: number, detail: string): Reply => ({
  status,
  body: { type: 'about:blank', title: 'Erreur', status, detail },
});
