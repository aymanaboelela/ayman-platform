import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts';
import {
  completeMinimalOnboarding,
  register,
  registerAndOnboard,
  uniqueStudent,
} from './fixtures';

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
    await completeMinimalOnboarding(page, student);

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

  /*
   * REMOVED: 'says so plainly when no year has been chosen'.
   *
   * The state it asserted — a fully-onboarded student with `year: null` — can
   * no longer be produced through the product. The year became REQUIRED on
   * both `OnboardingSchema` and `StudentSectionSchema`, so the wizard will not
   * submit without one and the section editor will not save without one. There
   * is no longer any request a test can make that leaves a profile in it.
   *
   * The library's «مقلتلناش صفّك» branch is deliberately KEPT, because the
   * state itself is still real: every student onboarded before the change may
   * hold a null year, and that screen — with its CTA to `/settings/section` —
   * is the only route they have to fill it in. Deleting the branch would strand
   * them on an unfiltered library with nothing to click.
   *
   * So this is a knowing coverage gap, not a cleanup: the branch survives
   * without an e2e because its precondition is now un-constructible from the
   * outside. The honest place to re-cover it is a render-level test of the
   * library page, which this suite has no harness for. If a future change makes
   * a null year reachable again, restore this test with it.
   */

  test('the student can change their section, and is told progress survives it', async ({
    page,
  }) => {
    const student = uniqueStudent();
    await register(page, student);
    await completeMinimalOnboarding(page, student);

    await page.goto('/library');
    await page
      .getByRole('link', { name: copy.library.identityEdit })
      .filter({ visible: true })
      .click();

    await expect(page).toHaveURL(/\/settings\/section/);
    // The reassurance is the point of the screen as much as the selects are:
    // a student about to change their year has every reason to think they are
    // about to lose their work.
    await expect(page.getByText(copy.section.keepsProgress)).toBeVisible();

    const main = page.getByRole('main');
    // The second offered year, i.e. NOT the one `registerAndOnboard` picked —
    // otherwise a save that wrote nothing at all would still pass. Year 2 used
    // to be unusable here because it demanded an elective the student had to
    // pick through a track first; it is now filled from the taxonomy.
    await main.getByLabel(copy.onboarding.year).selectOption({ index: 2 });
    await main.getByRole('button', { name: copy.section.save }).click();

    // Back on the library, showing the NEW year — proof the write landed and
    // that the page is not serving a cached render of the old section.
    await expect(page).toHaveURL(/\/library/);
    await expect(page.getByText(copy.library.identityLabel, { exact: true }).first()).toBeVisible();
  });

  /**
   * Replaces «explains itself instead of silently refusing, when the elective
   * is missing». That dead end was structural: بكالوريا year 2 required an
   * elective whose select only appeared once a track was picked, so the save
   * button could do nothing at all. The form no longer asks for either — both
   * are resolved from the taxonomy — so the case to prove is that the year
   * that used to be unreachable now saves like any other.
   */
  test('saves the year that used to need an elective to get past', async ({ page }) => {
    const student = uniqueStudent();
    await register(page, student);
    await completeMinimalOnboarding(page, student);

    await page.goto('/settings/section');
    const main = page.getByRole('main');
    await main.getByLabel(copy.onboarding.year).selectOption({ index: 2 });
    await main.getByRole('button', { name: copy.section.save }).click();

    await expect(page).toHaveURL(/\/library/);
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
