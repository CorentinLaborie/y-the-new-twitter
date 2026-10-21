import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockAdminApi, adminProblem } from './admin-kit';

// The second-factor set-up opened from the e-mail link (admin, desktop only). The API is simulated.

const SECRET = 'JBSWY3DPEHPK3PXP';
const SETUP = { secret: SECRET, otpauthUri: `otpauth://totp/Y:admin?secret=${SECRET}` };

// The notice of a form. Next.js adds its own role="alert" announcer to every page, so it is excluded.
function formAlert(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

test.describe('back-office second-factor set-up', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The back-office is desktop only.');
  });

  test('the link starts the set-up, the first code shows the backup codes once', async ({ page }) => {
    const calls = await mockAdminApi(page, {
      'POST /admin/mfa/setup': { status: 200, body: SETUP },
      'POST /admin/mfa/confirm': { status: 201, body: { backupCodes: ['ABCDE-FGHJK', 'LMNOP-QRSTU'] } },
    });

    await page.goto('/admin/mfa-setup?token=link-token');
    await expect(page.getByText(SECRET)).toBeVisible();
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/admin/mfa/setup', body: { token: 'link-token' } });

    await page.getByLabel('Code de vérification à 6 chiffres').fill('123456');
    await page.getByRole('button', { name: 'Confirmer' }).click();

    await expect(page.getByText('ABCDE-FGHJK')).toBeVisible();
    await expect(page.getByText('LMNOP-QRSTU')).toBeVisible();
    expect(calls[1]).toMatchObject({ path: '/admin/mfa/confirm', body: { code: '123456' } });
    await expect(page.getByRole('link', { name: 'Accéder au back-office' })).toHaveAttribute('href', '/admin');
  });

  test('a refused link shows the reason and no code form', async ({ page }) => {
    await mockAdminApi(page, {
      'POST /admin/mfa/setup': adminProblem(401, 'Ce lien de configuration est invalide ou a expiré.'),
    });

    await page.goto('/admin/mfa-setup?token=old-token');

    await expect(formAlert(page)).toHaveText('Ce lien de configuration est invalide ou a expiré.');
    await expect(page.getByLabel('Code de vérification à 6 chiffres')).toHaveCount(0);
  });

  test('a page without a token asks for the link, and calls nothing', async ({ page }) => {
    const calls = await mockAdminApi(page);

    await page.goto('/admin/mfa-setup');

    await expect(formAlert(page)).toHaveText('Ce lien est incomplet. Ouvrez le lien reçu par e-mail.');
    expect(calls).toEqual([]);
  });

  test('the set-up screen has no accessibility violation', async ({ page }) => {
    await mockAdminApi(page, { 'POST /admin/mfa/setup': { status: 200, body: SETUP } });
    await page.goto('/admin/mfa-setup?token=link-token');
    await expect(page.getByText(SECRET)).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
