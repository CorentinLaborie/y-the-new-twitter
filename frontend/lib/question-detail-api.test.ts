import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiProblem } from './api-client';
import { getQuestion } from './question-detail-api';

const QUESTION_ID = '4b1f3c2e-8a7d-4e6b-9c5a-1d2e3f4a5b6c';

const detail = {
  id: QUESTION_ID,
  text: 'Une question partagée',
  hashtags: ['attente'],
  createdAt: '2026-10-14T08:41:00Z',
  author: { handle: 'alice', displayName: 'Alice' },
  counters: { like: 3, dislike: 1, y: 12, reply: 4 },
  yThreshold: 50,
  conversationOpen: false,
  viewerReactions: [],
};

describe('getQuestion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gets the question by its id and returns it, with the reply counter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(detail)),
    );

    const question = await getQuestion(QUESTION_ID);

    expect(question).toEqual(detail);
    expect(question.counters.reply).toBe(4);
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(String(url)).toMatch(new RegExp(`/api/v1/questions/${QUESTION_ID}$`));
    expect(init?.method).toBe('GET');
  });

  it('throws the Problem Details of a 404 (hidden or deleted question), so the page can show it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { title: 'Introuvable', detail: 'Question introuvable.' },
          { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    );

    const error = await getQuestion(QUESTION_ID).catch((problem: unknown) => problem);

    expect(error).toEqual({
      status: 404,
      title: 'Introuvable',
      detail: 'Question introuvable.',
    } satisfies ApiProblem);
  });

  it('throws a network problem (status 0) when the API cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    const error = await getQuestion(QUESTION_ID).catch((problem: unknown) => problem);

    expect(error).toMatchObject({ status: 0, title: 'Réseau' });
  });
});
