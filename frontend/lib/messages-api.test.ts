import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptRequest,
  archiveConversation,
  declineRequest,
  fetchConversation,
  fetchConversations,
  fetchMessages,
  muteConversation,
  sendMessage,
  startConversation,
  unarchiveConversation,
  unmuteConversation,
} from './messages-api';

/** The path, the method and the JSON body of the first fetch call. */
function firstCall(): { path: string; init: RequestInit | undefined } {
  const call = vi.mocked(fetch).mock.calls[0];
  const url = new URL(String(call?.[0]));
  return { path: `${url.pathname}${url.search}`, init: call?.[1] };
}

describe('messages calls', () => {
  beforeEach(() => {
    document.cookie = 'y_csrf=csrf-unit';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens a conversation with the handle and the first text, with the CSRF token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ conversationId: 'c1' }, { status: 201 })));

    const result = await startConversation('bob', 'Bonjour');

    expect(result).toMatchObject({ ok: true, body: { conversationId: 'c1' } });
    const { path, init } = firstCall();
    expect(path).toBe('/api/v1/messages/conversations');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ handle: 'bob', text: 'Bonjour' });
    expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('csrf-unit');
  });

  it('reads the accepted conversations with no parameter, and the requests or archives with theirs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ conversations: [], nextCursor: null })));

    await fetchConversations();
    expect(firstCall().path).toBe('/api/v1/messages/conversations');

    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ conversations: [], nextCursor: null })));
    await fetchConversations({ requests: true, cursor: 'abc', limit: 10 });
    expect(firstCall().path).toBe('/api/v1/messages/conversations?requests=true&cursor=abc&limit=10');

    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ conversations: [], nextCursor: null })));
    await fetchConversations({ archived: true });
    expect(firstCall().path).toBe('/api/v1/messages/conversations?archived=true');

    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ conversations: [], nextCursor: null })));
    await fetchConversations({ blocked: true });
    expect(firstCall().path).toBe('/api/v1/messages/conversations?blocked=true');
  });

  it('reads one conversation with a GET on its path', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id: 'c1' })));

    await fetchConversation('c1');

    expect(firstCall()).toMatchObject({ path: '/api/v1/messages/conversations/c1', init: { method: 'GET' } });
  });

  it('reads one page of messages of a conversation, after its cursor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ messages: [], nextCursor: null })));

    await fetchMessages('c1', { cursor: 'k' });

    expect(firstCall().path).toBe('/api/v1/messages/conversations/c1/messages?cursor=k');
  });

  it('writes a message with a POST on the messages of the conversation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ id: 'm1', text: 'Salut', createdAt: '2026-10-27T09:00:00Z', mine: true }, { status: 201 })),
    );

    const result = await sendMessage('c1', 'Salut');

    expect(result).toMatchObject({ ok: true, body: { id: 'm1', mine: true } });
    const { path, init } = firstCall();
    expect(path).toBe('/api/v1/messages/conversations/c1/messages');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ text: 'Salut' });
  });

  it('answers a request with accept or decline, and sends the CSRF token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    await acceptRequest('c1');
    expect(firstCall().path).toBe('/api/v1/messages/conversations/c1/accept');
    expect(firstCall().init?.method).toBe('PUT');

    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    await declineRequest('c1');
    expect(firstCall().path).toBe('/api/v1/messages/conversations/c1/decline');
  });

  it('mutes and archives with a PUT, and lifts them with a DELETE on the same path', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    await muteConversation('c1');
    expect(firstCall().init?.method).toBe('PUT');

    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    await unmuteConversation('c1');
    expect(firstCall()).toMatchObject({ path: '/api/v1/messages/conversations/c1/mute', init: { method: 'DELETE' } });

    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    await archiveConversation('c1');
    expect(firstCall().path).toBe('/api/v1/messages/conversations/c1/archive');

    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    await unarchiveConversation('c1');
    expect(firstCall()).toMatchObject({ path: '/api/v1/messages/conversations/c1/archive', init: { method: 'DELETE' } });
  });
});
