import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createReply,
  deleteReply,
  isReplyTextValid,
  listReplies,
  REPLY_MAX_LENGTH,
  removeReplyReaction,
  replyCharacterCount,
  setReplyReaction,
} from './replies-api';

const QUESTION_ID = '5b0c1f2e-7a11-4c3d-9e21-000000000001';
const REPLY_ID = '5b0c1f2e-7a11-4c3d-9e21-000000000002';

const reply = {
  id: REPLY_ID,
  questionId: QUESTION_ID,
  text: 'Une réponse',
  createdAt: '2026-10-20T10:00:00.000Z',
  author: { handle: 'alice', displayName: 'Alice' },
  counters: { like: 3, dislike: 0 },
  viewerReactions: [],
};

/** The path and the init of the first fetch call. */
function firstCall(): { path: string; init: RequestInit | undefined } {
  const call = vi.mocked(fetch).mock.calls[0];
  const url = new URL(String(call?.[0]));
  return { path: `${url.pathname}${url.search}`, init: call?.[1] };
}

describe('reply calls', () => {
  beforeEach(() => {
    document.cookie = 'y_csrf=csrf-unit';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the text with the Idempotency-Key and the CSRF token, and returns the reply of the 201', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(reply, { status: 201, headers: { Location: `/replies/${REPLY_ID}` } })),
    );

    const result = await createReply(QUESTION_ID, 'Une réponse', 'key-1');

    expect(result).toEqual(reply);
    const { path, init } = firstCall();
    expect(path).toBe(`/api/v1/questions/${QUESTION_ID}/replies`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ text: 'Une réponse' });
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('key-1');
    expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('csrf-unit');
  });

  it('lists the first page without query string when no option is given', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ items: [reply], nextCursor: null })),
    );

    const result = await listReplies(QUESTION_ID);

    expect(result).toEqual({ items: [reply], nextCursor: null });
    const { path, init } = firstCall();
    expect(path).toBe(`/api/v1/questions/${QUESTION_ID}/replies`);
    expect(init?.method).toBe('GET');
  });

  it('sends the cursor and the limit in the query string when they are given', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ items: [], nextCursor: null })),
    );

    await listReplies(QUESTION_ID, { cursor: 'abc', limit: 10 });

    expect(firstCall().path).toBe(`/api/v1/questions/${QUESTION_ID}/replies?cursor=abc&limit=10`);
  });

  it('deletes a reply and resolves without a value on 204', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );

    await expect(deleteReply(REPLY_ID)).resolves.toBeUndefined();

    const { path, init } = firstCall();
    expect(path).toBe(`/api/v1/replies/${REPLY_ID}`);
    expect(init?.method).toBe('DELETE');
  });

  it('sets a reaction and returns the counts and the viewer reactions', async () => {
    const answer = { replyId: REPLY_ID, counts: { like: 4, dislike: 0 }, viewerReactions: ['like'] };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(answer)),
    );

    const result = await setReplyReaction(REPLY_ID, 'like');

    expect(result).toEqual(answer);
    const { path, init } = firstCall();
    expect(path).toBe(`/api/v1/replies/${REPLY_ID}/reactions/like`);
    expect(init?.method).toBe('PUT');
    expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('csrf-unit');
  });

  it('removes a reaction and resolves without a value on 204', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );

    await expect(removeReplyReaction(REPLY_ID, 'dislike')).resolves.toBeUndefined();

    const { path, init } = firstCall();
    expect(path).toBe(`/api/v1/replies/${REPLY_ID}/reactions/dislike`);
    expect(init?.method).toBe('DELETE');
  });

  it('throws the ApiProblem of a 4xx answer, with its title, detail and code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { title: 'Réponse refusée', detail: 'Le texte dépasse 280 caractères.', code: 'reply-too-long' },
          { status: 422 },
        ),
      ),
    );

    await expect(createReply(QUESTION_ID, 'x', 'key-2')).rejects.toEqual({
      status: 422,
      title: 'Réponse refusée',
      detail: 'Le texte dépasse 280 caractères.',
      code: 'reply-too-long',
    });
  });

  it('throws the ApiProblem of a 5xx answer that has no body, with the default detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 500 })),
    );

    await expect(setReplyReaction(REPLY_ID, 'like')).rejects.toEqual(
      expect.objectContaining({ status: 500, detail: 'Une erreur est survenue.' }),
    );
  });

  it('throws the ApiProblem of a 404 on the list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ title: 'Introuvable', detail: 'Question introuvable.' }, { status: 404 }),
      ),
    );

    await expect(listReplies(QUESTION_ID)).rejects.toEqual(
      expect.objectContaining({ status: 404, title: 'Introuvable' }),
    );
  });
});

describe('reply text rules', () => {
  it('has a limit of 280 characters', () => {
    expect(REPLY_MAX_LENGTH).toBe(280);
  });

  it('counts the trimmed text in code points: an emoji counts as one', () => {
    expect(replyCharacterCount('  héllo 👍 ')).toBe(7);
    expect(replyCharacterCount('👍'.repeat(280))).toBe(280);
  });

  it('accepts 1 to 280 characters once trimmed, and refuses an empty text or one over the limit', () => {
    expect(isReplyTextValid('')).toBe(false);
    expect(isReplyTextValid('   ')).toBe(false);
    expect(isReplyTextValid('a')).toBe(true);
    expect(isReplyTextValid('a'.repeat(280))).toBe(true);
    expect(isReplyTextValid('a'.repeat(281))).toBe(false);
    expect(isReplyTextValid(`  ${'👍'.repeat(280)}  `)).toBe(true);
  });
});
