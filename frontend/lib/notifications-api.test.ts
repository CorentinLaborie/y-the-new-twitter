import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchNotificationPage, fetchUnreadCount, markAllNotificationsRead } from './notifications-api';

type FetchMock = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

describe('notification calls', () => {
  beforeEach(() => {
    document.cookie = 'y_csrf=csrf-unit';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for the first page of every type, with no query when there is no cursor', async () => {
    const fetchMock = vi.fn<FetchMock>(async () => Response.json({ items: [], nextCursor: null }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchNotificationPage('all');

    expect(result).toEqual({ ok: true, status: 200, body: { items: [], nextCursor: null } });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/notifications$/);
  });

  it('asks for the Mentions tab and the next page with the cursor', async () => {
    const fetchMock = vi.fn<FetchMock>(async () => Response.json({ items: [], nextCursor: null }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchNotificationPage('mention', 'abc123');

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('type=mention');
    expect(url).toContain('cursor=abc123');
  });

  it('reads the unread count', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ unread: 4 })));

    const result = await fetchUnreadCount();

    expect(result).toEqual({ ok: true, status: 200, body: { unread: 4 } });
  });

  it('marks everything as read with a POST that carries the CSRF token', async () => {
    const fetchMock = vi.fn<FetchMock>(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await markAllNotificationsRead();

    expect(result.ok).toBe(true);
    const init = fetchMock.mock.calls[0][1];
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('x-csrf-token')).toBe('csrf-unit');
  });

  it('sends the ids of the shown lines in the body when they are given', async () => {
    const fetchMock = vi.fn<FetchMock>(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await markAllNotificationsRead(['11111111-1111-4111-8111-111111111111']);

    const init = fetchMock.mock.calls[0][1];
    expect(init?.body).toBe(JSON.stringify({ ids: ['11111111-1111-4111-8111-111111111111'] }));
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
  });
});
