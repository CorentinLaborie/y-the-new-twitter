import { expect, test, type Page, type Route } from '@playwright/test';
import { mockFeedApi, signIn, type Reply } from './feed-kit';
import { corsHeaders, mockProfileApi, profile } from './profile-kit';

// The edit window of the own profile (L1, steps 4 and 5, section 12.7): a dialog on desktop and tablet, full screen on
// mobile. Mocked API. The profile routes answer as the real API does: PATCH /users/me for the fields and
// PUT /users/me/avatar for the photo (raw image body).

const API_ORIGIN = 'http://localhost:8080';
const OWN_HANDLE = 'corentin';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

type SavingCall = { method: string; path: string; contentType: string | undefined; body: unknown };

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

// The API answers the preflight of a PATCH too: the shared CORS helper does not list PATCH.
function cors(origin: string | undefined): Record<string, string> {
  return { ...corsHeaders(origin), 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' };
}

/**
 * Registers the own profile and the saving routes. Routes registered later are tried first, so these answer before the
 * generic profile mock. Returns the saving calls in the order they were sent.
 */
async function mockOwnProfile(
  page: Page,
  save: (body: unknown) => Reply = () => ({
    status: 200,
    body: { handle: OWN_HANDLE, displayName: 'Corentin', bio: profile().bio },
  }),
) {
  const calls: SavingCall[] = [];
  await mockFeedApi(page);
  await mockProfileApi(page, {
    profile: () => ({
      status: 200,
      body: profile({ handle: OWN_HANDLE, displayName: 'Corentin', isOwnAccount: true }),
    }),
  });
  await page.route(`${API_ORIGIN}/api/v1/users/me**`, async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors(request.headers()['origin']) });
      return;
    }
    const path = new URL(request.url()).pathname;
    const isPhoto = path === '/api/v1/users/me/avatar';
    const body = isPhoto ? null : request.postDataJSON();
    calls.push({ method: request.method(), path, contentType: request.headers()['content-type'], body });
    const reply = isPhoto ? { status: 200, body: { avatarUrl: `/avatars/${OWN_HANDLE}.jpg` } } : save(body);
    await route.fulfill({
      status: reply.status,
      headers: cors(request.headers()['origin']),
      contentType: 'application/json',
      body: reply.body === undefined ? '' : JSON.stringify(reply.body),
    });
  });
  return calls;
}

async function openWindow(page: Page) {
  await page.goto(`/u/${OWN_HANDLE}`);
  await page.getByRole('button', { name: 'Modifier le profil' }).click();
  return page.getByRole('dialog', { name: 'Modifier le profil' });
}

test('the window opens from the own profile with the four fields filled', async ({ page }) => {
  await mockOwnProfile(page);

  const dialog = await openWindow(page);

  await expect(dialog).toBeVisible();
  await expect(page.getByLabel('Nom affiché')).toHaveValue('Corentin');
  await expect(page.getByLabel('Pseudo')).toHaveValue(OWN_HANDLE);
  await expect(page.getByLabel('Bio')).toHaveValue(profile().bio ?? '');
  await expect(page.getByLabel('Photo de profil')).toBeAttached();
});

test('Annuler closes the window and sends nothing', async ({ page }) => {
  const calls = await mockOwnProfile(page);

  const dialog = await openWindow(page);
  await page.getByLabel('Nom affiché').fill('Autre');
  await page.getByRole('button', { name: 'Annuler' }).click();

  await expect(dialog).toBeHidden();
  expect(calls).toHaveLength(0);
});

test('a new display name is saved, and the page shows it at once', async ({ page }) => {
  const calls = await mockOwnProfile(page, () => ({
    status: 200,
    body: { handle: OWN_HANDLE, displayName: 'Nouveau', bio: profile().bio },
  }));

  const dialog = await openWindow(page);
  await page.getByLabel('Nom affiché').fill('Nouveau');
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Nouveau' })).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    method: 'PATCH',
    path: '/api/v1/users/me',
    body: { displayName: 'Nouveau' },
  });
});

test('a handle already taken keeps the window open, with the typed value and the French text', async ({
  page,
}) => {
  await mockOwnProfile(page, () => ({
    status: 409,
    body: { title: 'Conflit', detail: 'Pseudo pris.' },
  }));

  const dialog = await openWindow(page);
  await page.getByLabel('Pseudo').fill('marthe');
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  await expect(page.getByRole('alert')).toHaveText('Ce pseudo est déjà pris.');
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel('Pseudo')).toHaveValue('marthe');
});

test('a photo of another format is refused in the window, and nothing is uploaded', async ({ page }) => {
  const calls = await mockOwnProfile(page);

  await openWindow(page);
  await page.getByLabel('Photo de profil').setInputFiles({
    name: 'photo.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from('GIF89a'),
  });

  await expect(page.getByRole('alert')).toHaveText('La photo doit être au format JPEG, PNG ou WebP.');
  expect(calls).toHaveLength(0);
});

test('a JPEG photo is uploaded as the raw image, and the page shows it at once', async ({ page }) => {
  const calls = await mockOwnProfile(page);

  const dialog = await openWindow(page);
  await page
    .getByLabel('Photo de profil')
    .setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: JPEG });
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  await expect(dialog).toBeHidden();
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    method: 'PUT',
    path: '/api/v1/users/me/avatar',
    contentType: 'image/jpeg',
  });
  await expect(page.locator('img[src$="/avatars/corentin.jpg"]')).toBeVisible();
});

test('on a phone the window covers the whole screen; on a larger screen it is a centred dialog', async ({
  page,
}) => {
  await mockOwnProfile(page);

  const dialog = await openWindow(page);
  const viewport = page.viewportSize();
  const box = await dialog.boundingBox();

  expect(viewport).not.toBeNull();
  expect(box).not.toBeNull();
  if (viewport && viewport.width < 768) {
    expect(box?.width).toBeCloseTo(viewport.width, 0);
    expect(box?.height).toBeCloseTo(viewport.height, 0);
  } else {
    expect(box?.width).toBeLessThan(viewport?.width ?? 0);
  }
});
