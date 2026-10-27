import { expect, test } from '@playwright/test';

// End-to-end checks against the real backend and its local database (no simulated API).
// They need the backend running on localhost:8080, on a database with the fictional seed and
// the password Secret1234! set on demo_alice (see the M1 integration notes). Each test leaves the account usable.

const EMAIL = 'demo_alice@example.test';
const PASSWORD = 'Secret1234!';

test.describe.configure({ mode: 'serial' });

test('a visitor without session is sent from the protected home to the login page, which keeps the page asked for', async ({
  page,
}) => {
  await page.goto('/home');
  await page.waitForURL((url) => url.pathname === '/login');
  // The proxy passes the requested path to the session check, so the login page remembers it.
  expect(new URL(page.url()).searchParams.get('next')).toBe('/home');
});

test('a wrong password shows the generic error and keeps the user on the login page', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(EMAIL);
  await page.getByLabel('Mot de passe', { exact: true }).fill('Mauvais-mot-2!');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();

  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(
    'Identifiants incorrects',
  );
  await expect(page).toHaveURL(/\/login/);
});

test('a valid login opens the protected home, and the session survives a reload', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(EMAIL);
  await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();

  await page.waitForURL((url) => url.pathname === '/home');
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible();
});

// Private messages between two real accounts (section 9): a request from Alice to Bob, accepted by Bob, then a reply.
// The two accounts msg_local_alice and msg_local_bob are created in the test database before the run, and their
// conversations are cleared, so that the request starts from nothing (see the note in the M1 integration notes).
const ALICE = { handle: 'msg_local_alice', email: 'msg_local_alice@example.test', name: 'Alice Locale' };
const BOB = { handle: 'msg_local_bob', email: 'msg_local_bob@example.test', name: 'Bob Local' };

async function signInAs(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/home');
}

test('Alice writes to Bob, Bob accepts the request and replies, and Alice reads the reply', async ({ browser }) => {
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const bob = await bobContext.newPage();
  const first = `Bonjour ${BOB.name}`;
  const reply = 'Bonjour Alice, je te réponds';

  await signInAs(alice, ALICE.email);
  await alice.goto('/messages/new');
  await alice.getByLabel('Destinataire', { exact: true }).fill(BOB.handle);
  await alice.getByLabel('Message', { exact: true }).fill(first);
  await alice.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await alice.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
  await expect(alice.getByRole('list', { name: 'Messages' }).getByText(first)).toBeVisible();

  await signInAs(bob, BOB.email);
  await bob.goto('/messages');
  await bob.getByRole('tab', { name: 'Demandes' }).click();
  await bob.getByRole('link', { name: `Conversation avec ${ALICE.name}` }).click();
  await expect(bob.getByText(`${ALICE.name} vous a écrit`)).toBeVisible();
  await bob.getByRole('button', { name: 'Accepter', exact: true }).click();
  await bob.getByLabel(`Écrire un message à ${ALICE.name}`).fill(reply);
  await bob.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(bob.getByRole('list', { name: 'Messages' }).getByText(reply)).toBeVisible();

  await alice.goto('/messages');
  await alice.getByRole('link', { name: `Conversation avec ${BOB.name}` }).click();
  await expect(alice.getByRole('list', { name: 'Messages' }).getByText(reply)).toBeVisible();

  await aliceContext.close();
  await bobContext.close();
});
