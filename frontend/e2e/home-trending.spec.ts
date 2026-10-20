import { expect, test, type Page } from '@playwright/test';
import { feedPage, mockFeedApi, question, signIn } from './feed-kit';

// Trending block of the first page: "Tendances sur 24 h", above the list (DEC-091).

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('the trending block comes first, under its title, and the list follows it', async ({ page }) => {
  await mockFeedApi(page, {
    feed: () =>
      feedPage([question('a', 'Question de la liste')], null, [
        question('t1', 'Première tendance'),
        question('t2', 'Deuxième tendance'),
      ]),
  });

  await page.goto('/home');

  const block = page.getByRole('region', { name: 'Tendances sur 24 h' });
  await expect(block.getByRole('listitem')).toHaveCount(2);
  await expect(block).toContainText('Première tendance');
  await expect(block).toContainText('Deuxième tendance');

  const blockBox = await block.boundingBox();
  const listBox = await page.getByText('Question de la liste').boundingBox();
  expect(blockBox).not.toBeNull();
  expect(listBox).not.toBeNull();
  expect((blockBox?.y ?? 0) + (blockBox?.height ?? 0)).toBeLessThanOrEqual(listBox?.y ?? 0);
  await expectNoHorizontalScroll(page);
});

test('no block is shown when no question is trending', async ({ page }) => {
  await mockFeedApi(page, { feed: () => feedPage([question('a', 'Question de la liste')]) });

  await page.goto('/home');

  await expect(page.getByText('Question de la liste')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Tendances sur 24 h' })).toHaveCount(0);
  await expect(page.getByText('Tendances sur 24 h')).toHaveCount(0);
});
