import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './api-client';

describe('apiRequest errors', () => {
  beforeEach(() => {
    document.cookie = 'y_csrf=csrf-unit';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the stable code of a Problem Details answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            type: 'about:blank',
            title: 'Forbidden',
            status: 403,
            detail: 'Votre compte est suspendu.',
            code: 'account_suspended',
          },
          { status: 403 },
        ),
      ),
    );

    const result = await apiRequest('POST', '/questions', { body: { text: 'Question' } });

    expect(result).toEqual({
      ok: false,
      problem: {
        status: 403,
        title: 'Forbidden',
        detail: 'Votre compte est suspendu.',
        retryAfterSeconds: undefined,
        code: 'account_suspended',
      },
    });
  });

  it('sends the token of the __Host- cookie of production', async () => {
    const cookie = vi.spyOn(document, 'cookie', 'get').mockReturnValue('theme=dark; __Host-y_csrf=csrf-host');
    const fetchMock = vi.fn(async () => Response.json({ ok: true }, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('POST', '/questions', { body: { text: 'Question' } });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ 'X-CSRF-Token': 'csrf-host' });
    cookie.mockRestore();
  });

  it('has no code when the API sends none', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ title: 'Erreur', detail: 'Erreur serveur.' }, { status: 500 })),
    );

    const result = await apiRequest('GET', '/feed');

    expect(result).toMatchObject({ ok: false, problem: { status: 500, detail: 'Erreur serveur.' } });
    expect(result.ok ? undefined : result.problem.code).toBeUndefined();
  });
});
