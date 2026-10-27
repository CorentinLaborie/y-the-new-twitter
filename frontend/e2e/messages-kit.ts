import type { Page } from '@playwright/test';
import type { Reply } from './feed-kit';
import { corsHeaders } from './profile-kit';

// Mocked calls of the private messages (section 9). The screens read and write /messages/conversations, and the menu
// blocks an account through PUT /users/{handle}/block. Every other call falls through to the other mocks.

const API_ORIGIN = 'http://localhost:8080';

export type MessagesHandlers = {
  /** The answer of GET /messages/conversations: the query is the one the screen sent (requests, archived, cursor). */
  list: (query: URLSearchParams) => Reply;
  /** The answer of GET /messages/conversations/{id}. */
  conversation: (conversationId: string) => Reply;
  /** The answer of GET /messages/conversations/{id}/messages, newest first, for a cursor (null on the first page). */
  messages: (conversationId: string, cursor: string | null) => Reply;
};

export type MessagesCalls = {
  /** The texts written in a conversation, in order. */
  sent: { conversationId: string; text: string }[];
  /** The conversations opened with a handle. */
  started: { handle: string; text: string }[];
  /** The answers to a request: accept or decline, with the conversation. */
  answered: { conversationId: string; verb: 'accept' | 'decline' }[];
  /** The mute, archive and read calls, with the conversation and the verb. */
  flags: { conversationId: string; verb: string }[];
  /** The handles blocked from the menu. */
  blocked: string[];
};


export async function mockMessagesApi(page: Page, handlers: MessagesHandlers): Promise<MessagesCalls> {
  const calls: MessagesCalls = { sent: [], started: [], answered: [], flags: [], blocked: [] };

  await page.route(`${API_ORIGIN}/api/v1/**`, async (route) => {
    const request = route.request();
    const origin = request.headers()['origin'];
    if (request.method() === 'OPTIONS') {
      await route.fallback();
      return;
    }
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const reply = (answer: Reply) =>
      route.fulfill({
        status: answer.status,
        contentType: 'application/json',
        headers: corsHeaders(origin),
        body: JSON.stringify(answer.body ?? null),
      });
    const empty = (status: number) => route.fulfill({ status, headers: corsHeaders(origin) });

    if (path === '/api/v1/messages/conversations' && method === 'GET') {
      await reply(handlers.list(url.searchParams));
      return;
    }
    if (path === '/api/v1/messages/conversations' && method === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as { handle: string; text: string };
      calls.started.push({ handle: body.handle, text: body.text });
      await reply({ status: 201, body: { conversationId: '7d2e1f0a-3b4c-4d5e-8f6a-9b0c1d2e3f40' } });
      return;
    }

    const conversation = /^\/api\/v1\/messages\/conversations\/([^/]+)(\/[a-z]+)?$/.exec(path);
    if (conversation) {
      const [, conversationId = '', suffix = ''] = conversation;
      if (suffix === '' && method === 'GET') {
        await reply(handlers.conversation(conversationId));
        return;
      }
      if (suffix === '/accept' || suffix === '/decline') {
        calls.answered.push({ conversationId, verb: suffix === '/accept' ? 'accept' : 'decline' });
        await empty(204);
        return;
      }
      if (suffix === '/read' || suffix === '/mute' || suffix === '/archive') {
        calls.flags.push({ conversationId, verb: `${method} ${suffix.slice(1)}` });
        await empty(204);
        return;
      }
    }

    const messagesOf = /^\/api\/v1\/messages\/conversations\/([^/]+)\/messages$/.exec(path);
    if (messagesOf) {
      const [, conversationId = ''] = messagesOf;
      if (method === 'GET') {
        await reply(handlers.messages(conversationId, url.searchParams.get('cursor')));
        return;
      }
      if (method === 'POST') {
        const body = JSON.parse(request.postData() ?? '{}') as { text: string };
        calls.sent.push({ conversationId, text: body.text });
        await reply({
          status: 201,
          body: { id: `m-${calls.sent.length}`, text: body.text, createdAt: '2026-10-27T09:40:00Z', mine: true },
        });
        return;
      }
    }

    const block = /^\/api\/v1\/users\/([^/]+)\/block$/.exec(path);
    if (block && method === 'PUT') {
      calls.blocked.push(decodeURIComponent(block[1] ?? ''));
      await empty(204);
      return;
    }

    await route.fallback();
  });

  return calls;
}

/** One conversation as the API shows it to the viewer. */
export function conversationOf(
  id: string,
  overrides: Partial<{
    status: 'pending' | 'accepted' | 'declined';
    initiatedByViewer: boolean;
    handle: string;
    displayName: string;
    unread: boolean;
    muted: boolean;
    archived: boolean;
    lastMessage: { text: string; mine: boolean } | null;
  }> = {},
) {
  return {
    id,
    status: overrides.status ?? 'accepted',
    initiatedByViewer: overrides.initiatedByViewer ?? true,
    other: { handle: overrides.handle ?? 'alice', displayName: overrides.displayName ?? 'Alice' },
    lastMessageAt: '2026-10-27T09:33:00Z',
    lastMessage: overrides.lastMessage === undefined ? null : overrides.lastMessage,
    unread: overrides.unread ?? false,
    muted: overrides.muted ?? false,
    archived: overrides.archived ?? false,
  };
}

/** One message as the API shows it. */
export function messageOf(id: string, text: string, mine: boolean, createdAt = '2026-10-27T09:30:00Z') {
  return { id, text, createdAt, mine };
}
