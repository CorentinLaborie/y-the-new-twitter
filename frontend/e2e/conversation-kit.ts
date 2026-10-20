import type { Page } from '@playwright/test';

// Shared helpers of the conversation and share-view end-to-end tests (mocked API, as feed-kit.ts).
// The share view reads one question (GET /questions/{id}) and its replies. This file answers those calls, and the
// reply calls (delete, reactions), with a small state per test, so that the counts follow the reactions and the
// deletions. The signed-in session is set by signIn() of feed-kit.ts.

const API_ORIGIN = 'http://localhost:8080';

/** The question of the conversation tests: a UUID, as the share page checks it before it asks the API. */
export const QUESTION_ID = '4b1f3c2e-8a7d-4e6b-9c5a-1d2e3f4a5b6c';

const QUESTION_PATH = /^\/questions\/([^/]+)$/;
const REPLIES_PATH = /^\/questions\/([^/]+)\/replies$/;
const REPLY_PATH = /^\/replies\/([^/]+)(?:\/reactions\/(like|dislike))?$/;

export type ReplyKind = 'like' | 'dislike';

/** A reply as the API sends it (ReplyResponseDto). */
export type ReplyJson = {
  id: string;
  questionId: string;
  text: string;
  createdAt: string;
  author: { handle: string; displayName: string };
  counters: Record<ReplyKind, number>;
  viewerReactions: ReplyKind[];
};

/** A question as the share view reads it (QuestionResponseDto, with the reply counter). */
export type QuestionJson = {
  id: string;
  text: string;
  hashtags: string[];
  createdAt: string;
  author: { handle: string; displayName: string };
  counters: { like: number; dislike: number; y: number; reply: number };
  yThreshold: number;
  conversationOpen: boolean;
  viewerReactions: string[];
};

export type ConversationFixture = {
  /** The question. Null answers 404 to every read: the question does not exist, is hidden or is deleted. */
  question: QuestionJson | null;
  /** The replies of the question, oldest first. */
  replies: ReplyJson[];
};

type Answer = { status: number; body?: unknown };

/** A reply by `number` (1 to 59): its text is "Réponse 01", and it is created `number` minutes after 08:00 UTC. */
export function makeReply(
  number: number,
  options: {
    handle?: string;
    displayName?: string;
    text?: string;
    like?: number;
    dislike?: number;
    viewerReactions?: ReplyKind[];
  } = {},
): ReplyJson {
  const label = String(number).padStart(2, '0');
  return {
    id: `reply-${label}`,
    questionId: QUESTION_ID,
    text: options.text ?? `Réponse ${label}`,
    createdAt: new Date(Date.UTC(2026, 9, 15, 8, number)).toISOString(),
    author: { handle: options.handle ?? 'bob_y', displayName: options.displayName ?? 'Bob Y' },
    counters: { like: options.like ?? 0, dislike: options.dislike ?? 0 },
    viewerReactions: options.viewerReactions ?? [],
  };
}

/** The question of the share view, with its Y count, its reply count and whether its conversation is open. */
export function questionDetail(options: {
  y: number;
  reply: number;
  conversationOpen: boolean;
  text?: string;
}): QuestionJson {
  return {
    id: QUESTION_ID,
    text: options.text ?? 'Question de la conversation',
    hashtags: [],
    createdAt: '2026-10-14T08:41:00Z',
    author: { handle: 'marthe_a', displayName: 'Marthe A' },
    counters: { like: 10, dislike: 2, y: options.y, reply: options.reply },
    yThreshold: 50,
    conversationOpen: options.conversationOpen,
    viewerReactions: [],
  };
}

function notFound(path: string): Answer {
  return {
    status: 404,
    body: {
      type: 'about:blank',
      title: 'Introuvable',
      status: 404,
      detail: `Aucune réponse simulée pour ${path}`,
    },
  };
}

/** One reaction of the viewer on a reply: on adds it, off removes it. The two kinds are independent (R2). */
function setReaction(reply: ReplyJson, kind: ReplyKind, on: boolean): void {
  const active = reply.viewerReactions.includes(kind);
  if (on && !active) {
    reply.viewerReactions = [...reply.viewerReactions, kind];
    reply.counters[kind] += 1;
  }
  if (!on && active) {
    reply.viewerReactions = reply.viewerReactions.filter((item) => item !== kind);
    reply.counters[kind] -= 1;
  }
}

function answer(
  method: string,
  path: string,
  search: URLSearchParams,
  postData: string | null,
  question: QuestionJson | null,
  replies: ReplyJson[],
): Answer {
  if (method === 'GET' && QUESTION_PATH.test(path)) {
    return question ? { status: 200, body: question } : notFound(path);
  }

  if (method === 'POST' && REPLIES_PATH.test(path)) {
    // The reply is created at the end of the list, as the API does: its text is the one posted.
    const { text } = JSON.parse(postData ?? '{}') as { text: string };
    const created: ReplyJson = {
      id: `reply-posted-${replies.length + 1}`,
      questionId: QUESTION_ID,
      text,
      createdAt: new Date(Date.UTC(2026, 9, 15, 9, replies.length + 1)).toISOString(),
      author: { handle: 'alice', displayName: 'Alice Martin' },
      counters: { like: 0, dislike: 0 },
      viewerReactions: [],
    };
    replies.push(created);
    return { status: 201, body: created };
  }

  if (method === 'GET' && REPLIES_PATH.test(path)) {
    const offset = Number(search.get('cursor') ?? 0);
    const limit = Number(search.get('limit') ?? 20);
    const nextCursor = offset + limit < replies.length ? String(offset + limit) : null;
    return { status: 200, body: { items: replies.slice(offset, offset + limit), nextCursor } };
  }

  const replyMatch = REPLY_PATH.exec(path);
  const reply = replyMatch ? replies.find((item) => item.id === replyMatch[1]) : undefined;
  if (!replyMatch || !reply) {
    return notFound(path);
  }
  const kind = replyMatch[2] as ReplyKind | undefined;

  if (method === 'DELETE' && kind === undefined) {
    replies.splice(replies.indexOf(reply), 1);
    return { status: 204 };
  }
  if (method === 'PUT' && kind !== undefined) {
    setReaction(reply, kind, true);
    return {
      status: 200,
      body: { replyId: reply.id, counts: reply.counters, viewerReactions: reply.viewerReactions },
    };
  }
  if (method === 'DELETE' && kind !== undefined) {
    setReaction(reply, kind, false);
    return { status: 204 };
  }
  return notFound(path);
}

function isConversationPath(path: string): boolean {
  return QUESTION_PATH.test(path) || REPLIES_PATH.test(path) || REPLY_PATH.test(path);
}

/**
 * Answers the share view of the question and its replies, and the reply calls. Every other call gets a 404, so that a
 * missing answer fails the test visibly, unless `fallthrough` is set: the other calls then go to the route registered
 * before this one (the feed mock of feed-kit.ts, on the home page). Returns the mutating calls the page made, as
 * "METHOD /path" (the reads are not recorded).
 */
export async function mockConversationApi(
  page: Page,
  fixture: ConversationFixture,
  options: { fallthrough?: boolean } = {},
): Promise<{ calls: string[] }> {
  const calls: string[] = [];
  // The replies of the test: a copy, so that the reactions and the deletions change this state only.
  const replies: ReplyJson[] = fixture.replies.map((reply) => ({
    ...reply,
    counters: { ...reply.counters },
    viewerReactions: [...reply.viewerReactions],
  }));

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
    if (options.fallthrough && !isConversationPath(path)) {
      await route.fallback();
      return;
    }
    if (request.method() !== 'GET') {
      calls.push(`${request.method()} ${path}`);
    }
    const reply = answer(
      request.method(),
      path,
      url.searchParams,
      request.postData(),
      fixture.question,
      replies,
    );

    await route.fulfill({
      status: reply.status,
      headers: cors,
      contentType: 'application/json',
      body: reply.body === undefined ? '' : JSON.stringify(reply.body),
    });
  });

  return { calls };
}
