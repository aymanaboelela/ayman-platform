import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts';
import { registerAndOnboard, uniqueStudent } from './fixtures';

const e = copy.essentials;

/**
 * `/foundations` — the twelve programming terms, inside the student shell.
 *
 * The definitions are shared with the public `/essentials` (see
 * `lib/essentials-terms.ts`), so nothing here re-asserts their wording. What
 * this pins is the reason the route exists: a signed-in student reaching it is
 * not thrown onto a marketing page with a «نختار صفّك» call to action they
 * answered weeks ago. (It is no longer in the rail — see `student-nav-items.ts`.)
 */
test.describe('foundations', () => {
  test('is closed to anonymous visitors', async ({ page }) => {
    await page.goto('/foundations');
    await expect(page).toHaveURL(/\/login/);
  });

  test('renders the glossary inside the shell', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'no rail below the md breakpoint');
    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    await page.goto('/foundations');

    await expect(page.getByRole('navigation', { name: copy.nav.mainNav })).toBeVisible();
    await expect(page.getByRole('heading', { name: e.appTitle, level: 1 })).toBeVisible();
    // All twelve, not a teaser. Scoped to `main`: the shell's topbar carries
    // an <h2> of its own with the current page's name.
    await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveCount(12);
  });

  test('is no longer in the rail', async ({ page }) => {
    // Taken out of the rail on request; the page still answers its own URL.
    test.skip(test.info().project.name !== 'desktop', 'no rail below the md breakpoint');
    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    await page.goto('/foundations');
    await expect(
      page.getByRole('navigation', { name: copy.nav.mainNav }).getByRole('link', { name: copy.nav.essentials }),
    ).toHaveCount(0);
  });

  test('has no serious or critical axe violations', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await page.goto('/foundations');
    await expect(page.getByRole('heading', { name: e.appTitle, level: 1 })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
  });
});
