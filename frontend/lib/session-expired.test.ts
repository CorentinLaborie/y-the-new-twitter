import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { protectedApiRequest, SESSION_EXPIRED_REASON } from './session-expired';


describe('protectedApiRequest', () => {
  const replace = vi.fn();

  beforeEach(() => {
    replace.mockReset();
    vi.stubGlobal('location', { replace });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the browser to the login page with the marker when the API answers 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { type: 'about:blank', title: 'Non authentifié', status: 401, detail: 'Session absente.' },
          {
            status: 401,
          },
        ),
      ),
    );

    const result = await protectedApiRequest('GET', '/feed?tab=for-you');

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/login?reason=session-expired');
    expect(result).toMatchObject({ ok: false, problem: { status: 401 } });
  });

  it.each([
    ['a 403 (account not active)', 403],
    ['a 500', 500],
  ])('does not redirect on %s', async (_label, status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ title: 'Erreur', detail: 'Refus.' }, { status })),
    );

    const result = await protectedApiRequest('POST', '/questions', { body: { text: 'Question' } });

    expect(replace).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, problem: { status } });
  });

  it('does not redirect when the API cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    const result = await protectedApiRequest('GET', '/feed');

    expect(replace).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, problem: { status: 0 } });
  });

  it('does not redirect a successful call, and returns its body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ trending: [], questions: [], nextCursor: null })),
    );

    const result = await protectedApiRequest('GET', '/feed?tab=for-you');

    expect(replace).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      status: 200,
      body: { trending: [], questions: [], nextCursor: null },
    });
  });
});
