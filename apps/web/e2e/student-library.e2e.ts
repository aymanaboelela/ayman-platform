import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { copy } from '@ayman/contracts';
import { register, registerAndOnboard, uniqueStudent } from './fixtures';

const c = copy.library;

/**
 * `/library` — the signed-in student's catalog, inside the shell.
 *
 * The route exists because clicking «الكورسات» in the rail used to land on the
 * PUBLIC `/courses`, in the marketing chrome, with the rail gone. These tests
 * pin both halves of the fix: the page is gated like every other product
 * route, and it renders inside the shell rather than beside it.
 *
 * ## Why the seeded catalog's exact contents are never asserted
 *
 * Grouping is unit-tested exhaustively in `lib/library.test.ts` against fixed
 * inputs. Repeating it here against whatever the seed happens to contain would
 * be a slower test of the same fact that breaks whenever a course is added.
 * What only a browser can prove is asserted instead: the gate, the shell, the
 * nav state, and a11y.
 */

/**
 * Completes onboarding and DOES pick a system + year on step 3, which
 * `completeMinimalOnboarding` deliberately skips (every field on that step is
 * `.optional()`). A year is what gives the student an identity to filter by,
 * so this is the only way to exercise the «كورساتك» cell through the UI.
 */
async function onboardWithYear(
  page: Page,
  student: ReturnType<typeof uniqueStudent>,
): Promise<void> {
  const main = page.getByRole('main');
  const next = main.getByRole('button', { name: copy.onboarding.next });

  await main.getByLabel(copy.onboarding.fullName).fill(student.name);
  await main.getByLabel(copy.onboarding.gender).selectOption({ index: 1 });
  await main.getByLabel(copy.onboarding.phone).fill(student.phone);
  await next.click();

  const governorate = main.getByLabel(copy.onboarding.governorate);
  await expect(governorate).toBeVisible();
  await governorate.selectOption({ index: 1 });
  await next.click();

  // Step 3. `index: 1` on each — the first real option after the placeholder —
  // so the test never depends on the seeded taxonomy's exact labels. The year
  // select only populates once a system is chosen, hence the `toBeVisible`
  // between them rather than two calls in a row.
  const system = main.getByLabel(copy.onboarding.system);
  await expect(system).toBeVisible();
  await system.selectOption({ index: 1 });

  const year = main.getByLabel(copy.onboarding.year);
  await expect(year).toBeVisible();
  await year.selectOption({ index: 1 });
  await next.click();

  const submit = main.getByRole('button', { name: copy.onboarding.submit });
  await expect(submit).toBeVisible();
  await submit.click();
  await page.waitForURL((url) => !url.pathname.startsWith('/onboarding'), { timeout: 30_000 });
}

test.describe('student library', () => {
  test('is closed to anonymous visitors, like every other product route', async ({ page }) => {
    await page.goto('/library');
    // `proxy.ts`'s redirect matrix, not the page. Reaching the page and having
    // its authed fetch 401 would show an error screen instead of a sign-in
    // form — which is exactly what happened before `/library` joined
    // PROTECTED_PREFIXES.
    await expect(page).toHaveURL(/\/login/);
  });

  test('renders INSIDE the student shell, not the marketing chrome', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'no rail below the md breakpoint');
    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    await page.goto('/library');

    // The rail is the shell. Its presence is the whole point of the route.
    await expect(page.getByRole('navigation', { name: copy.nav.mainNav })).toBeVisible();
    await expect(page.getByRole('heading', { name: c.title, level: 1 })).toBeVisible();

    // And no sign-in chrome anywhere on it — the original complaint was
    // landing on a page that offered to log in someone already logged in.
    await expect(page.getByRole('link', { name: copy.nav.login })).toHaveCount(0);
  });

  test('«الكورسات» is the current nav item on this route', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'no rail below the md breakpoint');
    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    await page.goto('/library');
    const rail = page.getByRole('navigation', { name: copy.nav.mainNav });
    await expect(rail.getByRole('link', { name: copy.nav.courses })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('names the student’s own year once they have picked one', async ({ page }) => {
    const student = uniqueStudent();
    await register(page, student);
    await onboardWithYear(page, student);

    await page.goto('/library');

    // The strip explains the cut. Without it a filtered list is indistinguishable
    // from a short one.
    //
    // `exact: true` because «صفّك ومسارك» is also a substring of the section
    // lead right below it («الكورسات اللي على صفّك ومسارك»); `filter` for the
    // stale outgoing segment, as above.
    await expect(
      page.getByText(c.identityLabel, { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: c.yoursTitle }).filter({ visible: true }),
    ).toBeVisible();
  });

  test('says so plainly when no year has been chosen', async ({ page }) => {
    const student = uniqueStudent();
    // `completeMinimalOnboarding` skips step 3 entirely, so this student is
    // fully onboarded with `year: null` — a real state, not a broken one
    // (§5.2: a first-year student legitimately has not chosen yet).
    await registerAndOnboard(page, student);

    await page.goto('/library');

    // `.filter({ visible: true })` for the reason `fixtures.ts` documents: the
    // App Router leaves the OUTGOING segment in the document under
    // `display: none`, so a bare text match resolves to two nodes and trips
    // strict mode.
    await expect(page.getByText(c.identityMissing).filter({ visible: true })).toBeVisible();
    // …and NOT offered a button that bounces: `proxy.ts` sends a completed
    // student straight from /onboarding back to /dashboard.
    await expect(page.getByRole('link', { name: c.identityMissingCta })).toHaveCount(0);
  });

  test('has no serious or critical axe violations', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await page.goto('/library');
    await expect(page.getByRole('heading', { name: c.title, level: 1 })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
  });
});
