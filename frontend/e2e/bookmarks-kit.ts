import type { Page } from '@playwright/test';
import type { Reply } from './feed-kit';
import { corsHeaders } from './profile-kit';

// Mocked calls of the saved questions (L4, plan L4-BOOKMARKS-PLAN, section 6). The page reads GET /bookmarks, and the
// save button sends PUT and DELETE on /questions/{id}/bookmark. Every other call falls through to the other mocks.

const API_ORIGIN = 'http://localhost:8080';

export type BookmarksHandlers = {
  /** The answer of GET /bookmarks for a cursor (null on the first page). */
  page: (cursor: string | null) => Reply;
};

export type BookmarksCalls = {
  saved: string[];
  unsaved: string[];
  cursors: (string | null)[];
};

export async function mockBookmarksApi(page: Page, handlers: BookmarksHandlers): Promise<BookmarksCalls> {
  const calls: BookmarksCalls = { saved: [], unsaved: [], cursors: [] };

  await page.route(`${API_ORIGIN}/api/v1/**`, async (route) => {
    const request = route.request();
    const origin = request.headers()['origin'];
    if (request.method() === 'OPTIONS') {
      await route.fallback();
      return;
    }
    const url = new URL(request.url());
    const bookmark = /^\/api\/v1\/questions\/([^/]+)\/bookmark$/.exec(url.pathname);

    if (bookmark && request.method() === 'PUT') {
      const [, questionId = ''] = bookmark;
      calls.saved.push(questionId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders(origin),
        body: JSON.stringify({ questionId, saved: true }),
      });
      return;
    }
    if (bookmark && request.method() === 'DELETE') {
      const [, questionId = ''] = bookmark;
      calls.unsaved.push(questionId);
      await route.fulfill({ status: 204, headers: corsHeaders(origin) });
      return;
    }
    if (url.pathname === '/api/v1/bookmarks' && request.method() === 'GET') {
      const cursor = url.searchParams.get('cursor');
      calls.cursors.push(cursor);
      const reply = handlers.page(cursor);
      await route.fulfill({
        status: reply.status,
        contentType: 'application/json',
        headers: corsHeaders(origin),
        body: JSON.stringify(reply.body ?? {}),
      });
      return;
    }
    await route.fallback();
  });

  return calls;
}
