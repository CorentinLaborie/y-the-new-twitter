import { expect, test } from '@playwright/test';
import { ADMIN_COOKIE, mockAdminApi } from './admin-kit';

// The deletion of an account from its view (admin 1d), on the desktop size only: the back-office has no tablet or
// mobile layout. The API is simulated; the server-side guard reads the cookie SESSION=e2e-admin through the session stub.

const ALICE_ID = '11111111-1111-4111-8111-111111111111';

const ACCOUNT_VIEW = {
  id: ALICE_ID,
  handle: 'AliceY',
  displayName: 'Alice',
  status: 'active',
  role: 'user',
  maskedEmail: 'a***@d***.fr',
  createdAt: '2026-09-03T10:00:00.000Z',
  statusChangedAt: null,
  suspensionReason: null,
  lastLoginAt: '2026-10-16T08:12:00.000Z',
  activeSessionCount: 2,
  reports: { total: 0, open: 0 },
  moderatedContentCount: 0,
  history: [],
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

test.describe('account deletion', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The back-office is desktop only.');
  });

  test('deleting an account asks for a reason and the re-authentication, then shows the pending deletion', async ({
    context,
    page,
  }) => {
    await context.addCookies([ADMIN_COOKIE]);
    let pending = false;
    const calls = await mockAdminApi(page, {
      [`GET /admin/users/${ALICE_ID}`]: () => ({
        status: 200,
        body: pending
          ? { ...ACCOUNT_VIEW, status: 'pending_deletion', statusChangedAt: '2026-10-21T12:00:00.000Z' }
          : ACCOUNT_VIEW,
      }),
      [`PUT /admin/users/${ALICE_ID}/deletion`]: () => {
        if (!calls.some((call) => call.method === 'POST' && call.path === '/admin/reauth')) {
          return REAUTH_REQUIRED;
        }
        pending = true;
        return {
          status: 200,
          body: {
            id: ALICE_ID,
            status: 'pending_deletion',
            statusChangedAt: '2026-10-21T12:00:00.000Z',
            suspensionReason: null,
          },
        };
      },
      'POST /admin/reauth': { status: 200, body: { reauthExpiresAt: '2026-10-21T12:10:00.000Z' } },
    });
    await page.goto(`/admin/users/${ALICE_ID}`);

    await page.getByRole('button', { name: 'Supprimer le compte' }).click();
    await page.getByLabel('Motif (obligatoire)').selectOption('spam');
    await page
      .getByRole('dialog', { name: 'Supprimer le compte de @AliceY ?' })
      .getByRole('button', { name: 'Supprimer le compte' })
      .click();

    const reauth = page.getByRole('dialog', { name: 'Confirmer votre identité' });
    await expect(reauth).toBeVisible();
    await page.getByLabel('Mot de passe', { exact: true }).fill('Secret1234!');
    await reauth.getByRole('button', { name: 'Confirmer' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('En attente de suppression', { exact: true })).toBeVisible();
    const deletion = calls.filter((call) => call.method === 'PUT');
    expect(deletion).toHaveLength(2);
    expect(deletion[1]?.body).toEqual({ reasonCode: 'spam' });
  });

  test('choosing "Autre" asks for the reason in writing, and sends that text', async ({ context, page }) => {
    await context.addCookies([ADMIN_COOKIE]);
    const calls = await mockAdminApi(page, {
      [`GET /admin/users/${ALICE_ID}`]: { status: 200, body: ACCOUNT_VIEW },
      [`PUT /admin/users/${ALICE_ID}/deletion`]: {
        status: 200,
        body: {
          id: ALICE_ID,
          status: 'pending_deletion',
          statusChangedAt: '2026-10-21T12:00:00.000Z',
          suspensionReason: null,
        },
      },
    });
    await page.goto(`/admin/users/${ALICE_ID}`);

    await page.getByRole('button', { name: 'Supprimer le compte' }).click();
    await page.getByLabel('Motif (obligatoire)').selectOption('other');
    const submit = page
      .getByRole('dialog', { name: 'Supprimer le compte de @AliceY ?' })
      .getByRole('button', { name: 'Supprimer le compte' });
    await expect(submit).toBeDisabled();

    await page.getByLabel('Précisez le motif').fill('Compte piraté');
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    const deletion = calls.filter((call) => call.method === 'PUT');
    expect(deletion).toHaveLength(1);
    expect(deletion[0]?.body).toEqual({ reasonCode: 'other', otherReason: 'Compte piraté' });
  });
});
