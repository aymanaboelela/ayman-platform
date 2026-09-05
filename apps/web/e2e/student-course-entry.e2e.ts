import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts';
import { enrollInDemoCourse, registerAndOnboard, uniqueStudent } from './fixtures';

/** The slug `apps/api/prisma/seed-admin.ts` creates, and the course
 *  `enrollInDemoCourse` enrolls into — `login-gated-content.e2e.ts` and
 *  `study-surface-a11y.e2e.ts` hard-code the same literal for the same reason. */
const DEMO_COURSE_SLUG = 'e2e-demo-course';

/**
 * Two reported failures, both of them "I clicked the thing and nothing
 * happened", both of them invisible to every test that existed — because in
 * each case the click DID something, just not the thing the student wanted.
 *
 *   1. «كورساتي» sent an enrolled student to the PUBLIC course page: out of the
 *      shell, onto a sales page with a lock badge over a course they had
 *      already enrolled in.
 *   2. The «نبدأ من هنا» badge on `/path` was rendered as a sibling of the
 *      link rather than inside it, so the one element on that screen that says
 *      "press this" was the one element that could not be pressed.
 *
 * Both are assertions about DESTINATION, which is why they live here and not
 * in a unit test: `course-href.test.ts` can prove the string is right, and
 * cannot prove the string is what the anchor carries.
 */
test.describe('a student getting into their own course', () => {
  test('«كورساتي» keeps them inside the shell instead of the public sales page', async ({
    page,
  }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);

    await page.goto('/dashboard');

    // Deliberately structural rather than by label. The two links that carried
    // this bug — the rail's «كورساتي» row and the dashboard's course card —
    // are both being restyled, and a test that names their CTA text would go
    // green the moment the wording moved rather than when the bug came back.
    //
    // What cannot change is the shape of the URL. So: every visible link on
    // the signed-in dashboard that points at a course, checked as a set.
    const courseLinks = page
      .locator('a[href^="/courses/"], a[href^="/library/"]')
      .filter({ visible: true });
    await expect(courseLinks.first()).toBeVisible({ timeout: 30_000 });

    const hrefs = await courseLinks.evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute('href') ?? ''),
    );
    expect(hrefs.length).toBeGreaterThan(0);

    // The regression, stated exactly. `/courses/<slug>` with nothing after it
    // is the PUBLIC marketing page; `/library/<slug>` and a `/lessons/` deep
    // link are both inside the shell. Not one link on this page may be the
    // first form.
    const publicPageLinks = hrefs.filter((href) => /^\/courses\/[^/]+$/.test(href));
    expect(publicPageLinks).toEqual([]);

    const card = courseLinks.first();
    await card.click();
    await page.waitForURL((url) => !url.pathname.startsWith('/dashboard'), { timeout: 30_000 });

    // And the destination does not tell them their course is locked.
    await expect(
      page.getByText(copy.course.lockedNote).filter({ visible: true }),
    ).toHaveCount(0);

    /*
     * They landed INSIDE the shell — asserted on the URL, not on the rail.
     *
     * This first asked for the rail's «مساري» link to be visible, which is true
     * on desktop and false on a phone: `StudentShell` collapses the rail behind
     * a menu button below the breakpoint, so the link is in the DOM and hidden.
     * The test passed locally on `--project=desktop` and failed on `mobile` in
     * CI, which is the correct outcome for an assertion that was really about
     * viewport width rather than about where the student ended up.
     *
     * The URL is the thing this test is actually about and the only thing that
     * means the same on both viewports: `/courses/<slug>` with nothing after it
     * is the public marketing page — the bug — while `/library/<slug>` and a
     * `/lessons/` deep link are both the signed-in area.
     */
    const landed = new URL(page.url()).pathname;
    expect(landed, 'must not land on the public marketing page').not.toMatch(
      /^\/courses\/[^/]+$/,
    );
    expect(landed).toMatch(/^\/(library\/|courses\/[^/]+\/lessons\/)/);
  });

  test('opening the public course URL while already enrolled goes straight to the course', async ({
    page,
  }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);

    /*
     * The complaint this covers: «أول ما يدخل الصفحة وقتها بيتشك ووقتها
     * بيحوله على صفحة الكورس». The public page cannot know who is reading it,
     * so it used to resolve that on CLICK — a student who joined weeks ago
     * landed on a pitch for a course they already own, pressed «ابدأ الكورس»,
     * waited for `POST /enroll`, and only then got where they were going.
     *
     * The link on the dashboard is not the only way in: a bookmark, a shared
     * URL, or the address bar all arrive here. So the check now happens in
     * `proxy.ts` before any HTML is chosen, and this navigates to the public
     * URL DIRECTLY rather than clicking something — that is the case the test
     * above cannot reach.
     */
    await page.goto(`/courses/${DEMO_COURSE_SLUG}`);

    await page.waitForURL(/\/library\//, { timeout: 30_000 });
    expect(new URL(page.url()).pathname).toBe(`/library/${DEMO_COURSE_SLUG}`);

    // And nothing on the way asked them to start a course they are already in.
    await expect(
      page.getByRole('button', { name: copy.course.start }).filter({ visible: true }),
    ).toHaveCount(0);
  });

  test('the «نبدأ من هنا» badge on the path is itself clickable', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);

    await page.goto('/path');

    const badge = page.getByText(copy.path.startHere).filter({ visible: true }).first();
    await expect(badge).toBeVisible({ timeout: 30_000 });

    // The assertion that would have caught the bug: the badge has to be INSIDE
    // an anchor. `closest('a')` is null when it is a sibling of one, which is
    // precisely what it used to be.
    const wrappedInLink = await badge.evaluate((el) => Boolean(el.closest('a')));
    expect(wrappedInLink).toBe(true);

    // Then press the badge itself — not the disc above it — and confirm it
    // navigates. Clicking through to a real lesson is the behaviour a student
    // reported missing.
    await badge.click();
    await page.waitForURL(/\/courses\/[^/]+\/lessons\/[^/]+/, { timeout: 30_000 });
  });
});
