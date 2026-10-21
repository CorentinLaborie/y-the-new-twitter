import { expect, test } from '@playwright/test';
import { ADMIN_COOKIE, mockAdminApi, type AdminCall } from './admin-kit';

// The reports of the back-office (admin 2): the list, the examination of a report and the hiding of its content, on the
// desktop size only (the back-office has no tablet or mobile layout). The API is simulated; the server-side guard reads
// the cookie SESSION=e2e-admin through the session stub.

const REPORT_ID = '2c1d0e9f-8a7b-4c6d-9e5f-1a2b3c4d5e6f';
const QUESTION_ID = '5f1c7d2e-9a3b-4c8d-8e2f-7a6b5c4d3e2f';

const LIST_ITEM = {
  id: REPORT_ID,
  createdAt: '2026-10-14T10:41:00.000Z',
  reason: 'spam',
  status: 'open',
  reportCount: 1,
  target: {
    type: 'question',
    id: QUESTION_ID,
    body: 'Pourquoi les gens préfèrent-ils les réponses rapides ?',
    authorHandle: 'AliceY',
    authorDisplayName: 'Alice',
    moderationStatus: 'visible',
    createdAt: '2026-10-10T08:00:00.000Z',
  },
};

const OPEN_DETAIL = {
  id: REPORT_ID,
  createdAt: '2026-10-14T10:41:00.000Z',
  reason: 'spam',
  status: 'open',
  decision: null,
  decisionNote: null,
  decidedAt: null,
  target: LIST_ITEM.target,
  reports: [
    { id: REPORT_ID, createdAt: '2026-10-14T10:41:00.000Z', reason: 'spam', details: null, status: 'open' },
  ],
};

const HIDDEN_DETAIL = {
  ...OPEN_DETAIL,
  status: 'resolved',
  decision: 'content_hidden',
  decisionNote: 'Spam répété',
  decidedAt: '2026-10-21T12:00:00.000Z',
  target: { ...LIST_ITEM.target, moderationStatus: 'hidden' },
  reports: [{ ...OPEN_DETAIL.reports[0], status: 'resolved' }],
};

const REAUTH_REQUIRED = {
  status: 403,
  body: {
    type: 'about:blank',
    title: 'Interdit',
    status: 403,
    detail: 'Ré-authentification requise.',
    code: 'reauth_required',
  },
  headers: { 'content-type': 'application/problem+json' },
};

test.describe('back-office: reports', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The back-office is desktop only.');
  });

  test('the list filters by status, and opens a report', async ({ context, page }) => {
    await context.addCookies([ADMIN_COOKIE]);
    const calls = await mockAdminApi(page, {
      'GET /admin/reports': { status: 200, body: { items: [LIST_ITEM], nextCursor: null } },
      [`GET /admin/reports/${REPORT_ID}`]: { status: 200, body: OPEN_DETAIL },
    });
    await page.goto('/admin/reports');

    const table = page.getByRole('table', { name: 'Signalements' });
    await expect(table).toBeVisible();
    await expect(table.getByText('Spam', { exact: true })).toBeVisible();

    await page.getByLabel('Statut').selectOption('decided');
    await expect.poll(() => calls.at(-1)?.search).toMatch(/^\?status=decided(&|$)/);

    await page.getByLabel('Statut').selectOption('');
    await page.getByRole('link', { name: /Examiner le signalement/ }).click();
    await expect(page).toHaveURL(`/admin/reports/${REPORT_ID}`);
    await expect(page.getByRole('heading', { name: 'Contenu signalé' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Masquer le contenu' })).toBeEnabled();
  });

  test('hiding a content asks for a note and a re-authentication, then shows the decision', async ({
    context,
    page,
  }) => {
    await context.addCookies([ADMIN_COOKIE]);
    let decided = false;
    const calls = await mockAdminApi(page, {
      [`GET /admin/reports/${REPORT_ID}`]: () => ({
        status: 200,
        body: decided ? HIDDEN_DETAIL : OPEN_DETAIL,
      }),
      [`PUT /admin/reports/${REPORT_ID}/decision`]: () => {
        if (!calls.some((call: AdminCall) => call.method === 'POST' && call.path === '/admin/reauth')) {
          return REAUTH_REQUIRED;
        }
        decided = true;
        return {
          status: 200,
          body: {
            id: REPORT_ID,
            status: 'resolved',
            decision: 'content_hidden',
            decidedAt: '2026-10-21T12:00:00.000Z',
          },
        };
      },
      'POST /admin/reauth': { status: 200, body: { reauthExpiresAt: '2026-10-21T12:10:00.000Z' } },
    });
    await page.goto(`/admin/reports/${REPORT_ID}`);

    await page.getByRole('button', { name: 'Masquer le contenu' }).click();
    const decision = page.getByRole('dialog', { name: 'Masquer ce contenu ?' });
    await expect(decision.getByRole('button', { name: 'Masquer le contenu' })).toBeDisabled();
    await decision.getByLabel('Motif (obligatoire)').fill('Spam répété');
    await decision.getByRole('button', { name: 'Masquer le contenu' }).click();

    const reauth = page.getByRole('dialog', { name: 'Confirmer votre identité' });
    await expect(reauth).toBeVisible();
    await reauth.getByLabel('Mot de passe', { exact: true }).fill('Secret1234!');
    await reauth.getByLabel('Code à 6 chiffres').fill('123456');
    await reauth.getByRole('button', { name: 'Confirmer' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Motif de la décision : Spam répété')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Masquer le contenu' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Rejeter le signalement' })).toBeDisabled();

    const deciding = calls.filter((call: AdminCall) => call.method === 'PUT');
    expect(deciding).toHaveLength(2);
    expect(deciding[1]?.body).toEqual({ decision: 'hide', note: 'Spam répété' });
  });
});
