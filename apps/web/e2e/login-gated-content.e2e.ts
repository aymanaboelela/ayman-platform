import { expect, test, type Browser } from '@playwright/test';
import { copy } from '@ayman/contracts';
import { QUIZ_DEMO_LESSON_ID, registerAndOnboard, uniqueStudent } from './fixtures';

const COURSE_PATH = '/courses/e2e-demo-course';

/**
 * A context for SETUP only — creating an account whose credentials the real
 * test then uses from a genuinely signed-out browser.
 *
 * `browser.newContext()` does NOT inherit the project's `use` options, so
 * `baseURL`, `locale` and `timezoneId` have to be passed explicitly. Without
 * `baseURL` every relative `page.goto('/register')` inside the fixtures fails,
 * and it fails as a hang rather than a clear error — which is exactly how this
 * was first written and what it cost to find.
 */
async function signedOutSetupContext(browser: Browser) {
  const { baseURL, locale, timezoneId } = test.info().project.use;
  return browser.newContext({ baseURL, locale, timezoneId });
}

/**
 * The requirement, in the founder's own words: nobody opens a video or anything
 * else — even a free one — without signing in first; once signed in, the
 * platform remembers, and courses just work.
 *
 * `2026-08-03-login-gated-content-design.md` is the design. This file tests
 * that the whole path holds end to end; the unit tests around it
 * (`proxy.test.ts`, `lib/safe-next.test.ts`, `catalog.service.spec.ts`) defend
 * its individual parts.
 */
test.describe('login-gated content', () => {
  test('an anonymous visitor gets no player and no video URL', async ({ page }) => {
    await page.goto(COURSE_PATH);

    // The catalog itself is deliberately still public — this is what keeps
    // course pages in search results, and gating it was explicitly rejected.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // No player of any kind. The free-preview lesson used to render a real
    // youtube-nocookie iframe right here, to anyone.
    await expect(page.locator('iframe')).toHaveCount(0);

    const html = await page.content();

    // Not merely "no iframe" but "no video URL that could become one". An embed
    // removed while `videoObjectJsonLd` still announced the same id in the
    // page's structured data would pass the check above and fail these.
    //
    // ⚠️ Deliberately NOT a bare `not.toContain('youtube.com')`: the site FOOTER
    // links to the instructor's own channel (`site-footer.tsx`), which is
    // marketing and must stay. What must never appear is a link to a specific
    // VIDEO, so the watch/embed/nocookie forms are named individually.
    expect(html).not.toContain('youtube-nocookie.com');
    expect(html).not.toContain('youtube.com/watch');
    expect(html).not.toContain('youtube.com/embed');
    expect(html).not.toContain('youtu.be/');
    expect(html).not.toContain('i.ytimg.com');
    expect(html).not.toContain('videoExternalId');

    // The complementary assertion — that the API omits the id even when the
    // lesson really has one — lives in `catalog.service.spec.ts`, which plants
    // two real ids in the database and proves neither reaches the payload. It
    // belongs there because the seeded E2E course has no video lesson to plant
    // one on, so this test alone could not prove it.
  });

  test('clicking into a course while signed out asks for a sign-in, and remembers where you were', async ({
    page,
  }) => {
    await page.goto(COURSE_PATH);
    await page.getByRole('button', { name: copy.course.start }).click();

    // Sent to the login page WITH the way back — this is the parameter that was
    // being written and ignored before.
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(COURSE_PATH)}`));

    // And told why they are looking at a login form, rather than being dumped
    // on one with no explanation.
    await expect(page.getByText(copy.auth.login.continueNotice)).toBeVisible();
  });

  test('signing in returns the visitor to the course, and one click opens the lesson', async ({
    page,
    browser,
  }) => {
    // The account is created in a THROWAWAY context so the assertions below run
    // in the default one, genuinely signed out — the state the requirement is
    // actually about.
    const student = uniqueStudent();
    const setup = await signedOutSetupContext(browser);
    try {
      await registerAndOnboard(await setup.newPage(), student);
    } finally {
      await setup.close();
    }

    await page.goto(COURSE_PATH);
    await page.getByRole('button', { name: copy.course.start }).click();
    await page.waitForURL(/\/login/);

    await page.getByLabel(copy.auth.fields.email).fill(student.email);
    await page.getByLabel(copy.auth.fields.password, { exact: true }).fill(student.password);
    await page.getByRole('button', { name: copy.auth.actions.login }).click();

    // Back exactly where they were interrupted — NOT on the dashboard, which is
    // where every login landed before `next` was honoured.
    await expect(page).toHaveURL(new RegExp(`${COURSE_PATH}$`), { timeout: 30_000 });

    // And now the same button, in the same place, opens the lesson. No separate
    // enroll step: before this work there was no enroll affordance in the
    // product at all, so a signed-in student could not reach a lesson through
    // the UI by any route.
    await page.getByRole('button', { name: copy.course.start }).click();
    await expect(page).toHaveURL(new RegExp(`${COURSE_PATH}/lessons/${QUIZ_DEMO_LESSON_ID}`), {
      timeout: 30_000,
    });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('an already signed-in student is never shown a login form', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    // The other half of "don't make them log in every time": a stale bookmark or
    // a habitual tap on "تسجيل الدخول" lands on the dashboard, not on an empty
    // form asking a signed-in student to sign in again.
    await page.goto('/login');
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto('/register');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('the next parameter cannot be turned into an open redirect', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    // A signed-in visitor hitting /login is redirected to `next` — which is
    // exactly the shape an attacker would try to point off-site. `safeNext`
    // rejects it and the dashboard fallback applies.
    await page.goto('/login?next=https://example.com/phish');
    await expect(page).toHaveURL(/\/dashboard/);

    // The protocol-relative form, which is the bypass a naive check misses.
    await page.goto('/login?next=//example.com/phish');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
