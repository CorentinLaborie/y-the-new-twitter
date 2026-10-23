import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReport, isReportDetailsValid, REPORT_DETAILS_MAX_LENGTH, reportDetailsLength } from './reports-api';

const QUESTION_ID = '5b0c1f2e-7a11-4c3d-9e21-000000000001';
const REPLY_ID = '5b0c1f2e-7a11-4c3d-9e21-000000000002';
const RECEIPT = { id: '5b0c1f2e-7a11-4c3d-9e21-000000000003', status: 'open', createdAt: '2026-10-23T10:00:00.000Z' };

/** The path and the init of the first fetch call. */
function firstCall(): { path: string; init: RequestInit | undefined } {
  const call = vi.mocked(fetch).mock.calls[0];
  const url = new URL(String(call?.[0]));
  return { path: url.pathname, init: call?.[1] };
}

describe('report rules', () => {
  it('counts the details in code points, after trimming', () => {
    expect(reportDetailsLength('  été  ')).toBe(3);
    expect(reportDetailsLength('😀😀')).toBe(2);
  });

  it('requires details for other, and nothing for the other reasons', () => {
    expect(isReportDetailsValid('other', '')).toBe(false);
    expect(isReportDetailsValid('other', '   ')).toBe(false);
    expect(isReportDetailsValid('other', 'Motif')).toBe(true);
    expect(isReportDetailsValid('spam', '')).toBe(true);
  });

  it('accepts details of exactly 280 characters and refuses 281', () => {
    expect(isReportDetailsValid('other', 'a'.repeat(REPORT_DETAILS_MAX_LENGTH))).toBe(true);
    expect(isReportDetailsValid('other', 'a'.repeat(REPORT_DETAILS_MAX_LENGTH + 1))).toBe(false);
  });
});

describe('createReport', () => {
  beforeEach(() => {
    document.cookie = 'y_csrf=csrf-unit';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts a question report with the Idempotency-Key and the CSRF token, and returns the receipt of the 201', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(RECEIPT, { status: 201 })),
    );

    const result = await createReport({ questionId: QUESTION_ID }, 'spam', undefined, 'key-1');

    expect(result).toEqual({ ok: true, status: 201, body: RECEIPT });
    const { path, init } = firstCall();
    expect(path).toBe('/api/v1/reports');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ questionId: QUESTION_ID, reason: 'spam' });
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('key-1');
    expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('csrf-unit');
  });

  it('posts a reply report with its trimmed details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(RECEIPT, { status: 201 })),
    );

    await createReport({ replyId: REPLY_ID }, 'other', '  Propos trompeurs  ', 'key-2');

    expect(JSON.parse(String(firstCall().init?.body))).toEqual({
      replyId: REPLY_ID,
      reason: 'other',
      details: 'Propos trompeurs',
    });
  });

  it('returns the problem of a 422 without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { type: 'about:blank', title: 'Précisez le motif.', status: 422, detail: 'Précisez le motif.' },
          { status: 422, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );

    const result = await createReport({ questionId: QUESTION_ID }, 'other', undefined, 'key-3');

    expect(result).toMatchObject({ ok: false, problem: { status: 422, detail: 'Précisez le motif.' } });
  });
});
