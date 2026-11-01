import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockFeedApi, signIn } from './feed-kit';
import { mockProfileApi, profile } from './profile-kit';

// The edit window of the own profile at 325 px wide (L1, sections 7 and 12.7). Mocked API. WCAG 2.2 AA through axe.

const VIEWPORT = { width: 325, height: 700 };
const MIN_TOUCH_TARGET = 44;
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('at 325 px the window fills the screen, with its four fields, no horizontal scroll and 44 px buttons', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORT);
  await mockFeedApi(page);
  await mockProfileApi(page, {
    profile: () => ({
      status: 200,
      body: profile({ handle: 'corentin', displayName: 'Corentin', isOwnAccount: true }),
    }),
  });

  await page.goto('/u/corentin');
  await page.getByRole('button', { name: 'Modifier le profil' }).click();
  const dialog = page.getByRole('dialog', { name: 'Modifier le profil' });

  await expect(dialog).toBeVisible();
  await expect(page.getByLabel('Nom affiché')).toBeVisible();
  await expect(page.getByLabel('Pseudo')).toBeVisible();
  await expect(page.getByLabel('Bio')).toBeVisible();
  await expect(page.getByLabel('Photo de profil')).toBeAttached();
  await expectNoHorizontalScroll(page);

  const box = await dialog.boundingBox();
  expect(box?.width).toBeCloseTo(VIEWPORT.width, 0);

  for (const name of ['Annuler', 'Enregistrer']) {
    const button = await page.getByRole('button', { name }).boundingBox();
    expect(button?.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  }
});

test('at 325 px the window has no accessibility violation (axe, WCAG 2.2 AA)', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await mockFeedApi(page);
  await mockProfileApi(page, {
    profile: () => ({
      status: 200,
      body: profile({ handle: 'corentin', displayName: 'Corentin', isOwnAccount: true }),
    }),
  });

  await page.goto('/u/corentin');
  await page.getByRole('button', { name: 'Modifier le profil' }).click();
  await expect(page.getByRole('dialog', { name: 'Modifier le profil' })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();

  expect(results.violations).toEqual([]);
});
