import { expect, test } from '@playwright/test';
import { ADMIN_COOKIE, mockAdminApi, type AdminCall } from './admin-kit';

// Lifting the suspension of an account (admin 1d), on the desktop size only: the back-office has no tablet or mobile
// layout. The API is simulated; the server-side guard reads the cookie SESSION=e2e-admin through the session stub.

const ALICE_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '33333333-3333-4333-8333-333333333333';

const SUSPENDED_ACCOUNT_VIEW = {
  id: ALICE_ID,
  handle: 'AliceY',
  displayName: 'Alice',
  status: 'suspended',
  role: 'user',
  maskedEmail: 'a***@d***.fr',
  createdAt: '2026-09-03T10:00:00.000Z',
  statusChangedAt: '2026-10-13T09:40:00.000Z',
  suspensionReason: 'Spam répété',
  lastLoginAt: null,
  activeSessionCount: 0,
  reports: { total: 0, open: 0 },
  moderatedContentCount: 0,
  history: [
    {
      id: 'e1',
      actorId: ADMIN_ID,
      action: 'user.suspend',
      result: 'ok',
      targetType: 'user',
      targetId: ALICE_ID,
      reason: 'Spam répété',
      details: null,
      createdAt: '2026-10-13T09:40:00.000Z',
    },
  ],
};

test.describe('back-office: lifting a suspension', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The back-office is desktop only.');
  });

  test('lifting a suspension asks for the re-authentication, then reactivates once it is confirmed', async ({
    context,
    page,
  }) => {
    await context.addCookies([ADMIN_COOKIE]);
    let reactivated = false;
    const reauthRequired = {
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
    const calls = await mockAdminApi(page, {
      [`GET /admin/users/${ALICE_ID}`]: () => ({
        status: 200,
        body: reactivated
          ? {
              ...SUSPENDED_ACCOUNT_VIEW,
              status: 'active',
              suspensionReason: null,
              statusChangedAt: '2026-10-21T12:00:00.000Z',
            }
          : SUSPENDED_ACCOUNT_VIEW,
      }),
      [`PUT /admin/users/${ALICE_ID}/status`]: () => {
        if (!calls.some((call) => call.method === 'POST' && call.path === '/admin/reauth')) {
          return reauthRequired;
        }
        reactivated = true;
        return {
          status: 200,
          body: {
            id: ALICE_ID,
            status: 'active',
            statusChangedAt: '2026-10-21T12:00:00.000Z',
            suspensionReason: null,
          },
        };
      },
      'POST /admin/reauth': { status: 200, body: { reauthExpiresAt: '2026-10-21T12:10:00.000Z' } },
    });
    await page.goto(`/admin/users/${ALICE_ID}`);

    await page.getByRole('button', { name: 'Lever la suspension' }).click();
    await page.getByLabel('Motif (obligatoire)').fill('Erreur de modération');
    await page
      .getByRole('dialog', { name: 'Lever la suspension de @AliceY ?' })
      .getByRole('button', { name: 'Lever la suspension' })
      .click();

    const reauth = page.getByRole('dialog', { name: 'Confirmer votre identité' });
    await expect(reauth).toBeVisible();
    await page.getByLabel('Mot de passe', { exact: true }).fill('Secret1234!');
    await reauth.getByRole('button', { name: 'Confirmer' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Actif', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lever la suspension' })).toHaveCount(0);
    const lifting = calls.filter((call: AdminCall) => call.method === 'PUT');
    expect(lifting).toHaveLength(2);
    expect(lifting[1]?.body).toEqual({ status: 'active', reason: 'Erreur de modération' });
  });
});
