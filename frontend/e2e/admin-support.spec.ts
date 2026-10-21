import { expect, test } from '@playwright/test';
import { ADMIN_COOKIE, mockAdminApi, type AdminCall } from './admin-kit';

// The contact threads of the back-office (admin 2): the list, the answer of an administrator sent by e-mail, and the
// closing of a thread, on the desktop size only. The API is simulated; the server-side guard reads the cookie
// SESSION=e2e-admin through the session stub.

const THREAD_ID = '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d';
const ACCOUNT_ID = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';

const LIST_ITEM = {
  id: THREAD_ID,
  reference: 'CNT-20261018-0001',
  status: 'new',
  receivedAt: '2026-10-18T14:22:00.000Z',
  latestMessage: 'Je pense que la suspension de mon compte est une erreur.',
  account: {
    id: ACCOUNT_ID,
    handle: 'MarkL',
    displayName: 'Mark',
    status: 'suspended',
    maskedEmail: 'm***@e***.test',
    createdAt: '2026-08-21T00:00:00.000Z',
  },
};

const OPEN_THREAD = {
  id: THREAD_ID,
  reference: 'CNT-20261018-0001',
  status: 'new',
  createdAt: '2026-10-18T14:22:00.000Z',
  closedAt: null,
  closedByLift: false,
  account: {
    ...LIST_ITEM.account,
    statusChangedAt: '2026-10-13T09:40:00.000Z',
    suspensionReason: 'Non-respect des règles de la communauté',
  },
  messages: [
    {
      id: 'm1',
      authorType: 'user',
      body: 'Pouvez-vous réexaminer ma situation ?',
      sentAt: '2026-10-18T14:22:00.000Z',
    },
  ],
};

const REPLIED_THREAD = {
  ...OPEN_THREAD,
  status: 'replied',
  messages: [
    ...OPEN_THREAD.messages,
    {
      id: 'm2',
      authorType: 'admin',
      body: 'Votre suspension reste en place.',
      sentAt: '2026-10-19T10:30:00.000Z',
    },
  ],
};

const CLOSED_THREAD = {
  ...REPLIED_THREAD,
  status: 'closed',
  closedAt: '2026-10-21T12:00:00.000Z',
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

test.describe('back-office: contact threads', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The back-office is desktop only.');
  });

  test('the list opens a thread, and an answer is sent to the account and shown in the thread', async ({
    context,
    page,
  }) => {
    await context.addCookies([ADMIN_COOKIE]);
    let answered = false;
    const calls = await mockAdminApi(page, {
      'GET /admin/support-threads': { status: 200, body: { items: [LIST_ITEM], nextCursor: null } },
      [`GET /admin/support-threads/${THREAD_ID}`]: () => ({
        status: 200,
        body: answered ? REPLIED_THREAD : OPEN_THREAD,
      }),
      [`POST /admin/support-threads/${THREAD_ID}/messages`]: () => {
        answered = true;
        return { status: 200, body: REPLIED_THREAD };
      },
    });
    await page.goto('/admin/support');

    await page.getByRole('link', { name: '@MarkL' }).click();
    await expect(page).toHaveURL(`/admin/support/${THREAD_ID}`);
    await expect(page.getByText('Pouvez-vous réexaminer ma situation ?')).toBeVisible();
    await expect(page.getByText('m***@e***.test')).toBeVisible();

    const send = page.getByRole('button', { name: 'Envoyer la réponse' });
    await expect(send).toBeDisabled();
    await page.getByLabel('Votre réponse').fill('Votre suspension reste en place.');
    await send.click();

    await expect(page.getByText('Votre suspension reste en place.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Votre réponse')).toHaveValue('');
    const sent = calls.filter((call: AdminCall) => call.method === 'POST');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toEqual({ text: 'Votre suspension reste en place.' });
  });

  test('closing a thread asks for a re-authentication, then makes it read only', async ({
    context,
    page,
  }) => {
    await context.addCookies([ADMIN_COOKIE]);
    let closed = false;
    const calls = await mockAdminApi(page, {
      [`GET /admin/support-threads/${THREAD_ID}`]: () => ({
        status: 200,
        body: closed ? CLOSED_THREAD : REPLIED_THREAD,
      }),
      [`PUT /admin/support-threads/${THREAD_ID}/close`]: () => {
        if (!calls.some((call: AdminCall) => call.method === 'POST' && call.path === '/admin/reauth')) {
          return REAUTH_REQUIRED;
        }
        closed = true;
        return { status: 200, body: CLOSED_THREAD };
      },
      'POST /admin/reauth': { status: 200, body: { reauthExpiresAt: '2026-10-21T12:10:00.000Z' } },
    });
    await page.goto(`/admin/support/${THREAD_ID}`);

    await page.getByRole('button', { name: 'Marquer comme traité' }).click();
    const confirm = page.getByRole('dialog', { name: 'Marquer ce message comme traité ?' });
    await expect(confirm.getByText(/aucun e-mail n’est envoyé/)).toBeVisible();
    await confirm.getByRole('button', { name: 'Marquer comme traité' }).click();

    const reauth = page.getByRole('dialog', { name: 'Confirmer votre identité' });
    await expect(reauth).toBeVisible();
    await reauth.getByLabel('Mot de passe', { exact: true }).fill('Secret1234!');
    await reauth.getByLabel('Code à 6 chiffres').fill('123456');
    await reauth.getByRole('button', { name: 'Confirmer' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(/aucune réponse n’est possible/)).toBeVisible();
    await expect(page.getByLabel('Votre réponse')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Marquer comme traité' })).toBeDisabled();
    expect(calls.filter((call: AdminCall) => call.method === 'PUT')).toHaveLength(2);
  });
});
