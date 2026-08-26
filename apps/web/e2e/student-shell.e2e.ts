import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts';
import { enrollInDemoCourse, registerAndOnboard, uniqueStudent } from './fixtures';

/**
 * The signed-in shell and the rebuilt dashboard.
 *
 * Everything here is asserted through roles and visible Arabic copy rather
 * than through class names, with two deliberate exceptions: the rail's
 * collapsed state and the route-forced override are expressed as attributes
 * (`html[data-rail]`, `.shell[data-rail-forced]`) because that is genuinely
 * what they ARE — CSS-driven layout state with no accessible counterpart — and
 * asserting a computed width instead would be a slower test of the same fact.
 *
 * Desktop only for the rail assertions: below `md` there is no rail at all and
 * the same links live in the topbar's sheet. The mobile project runs the
 * dashboard-content and axe tests, which are viewport-independent.
 */

test.describe('student shell', () => {
  test('a new student lands on a dashboard that tells them what to do first', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    await page.goto('/dashboard');

    // The first-run card, with step 1 outstanding and carrying the only
    // accent CTA on the page.
    const startHere = page.getByRole('region', { name: copy.dashboard.startHereTitle });
    await expect(startHere).toBeVisible();
    await expect(startHere.getByText(copy.dashboard.stepEnrollTitle)).toBeVisible();
    await expect(startHere.getByRole('link', { name: copy.dashboard.stepEnrollCta })).toBeVisible();

    /*
      …and the later steps ANSWER, which is the part that changed.

      This used to assert `toHaveCount(0)` on step 3's control — it locked in
      the old behaviour, where the two rows under the current one rendered
      nothing at all and a press did literally nothing. That is what «مش عايز
      إن هو يضغط على حاجة وما يبقاش ليه استجابة» was about, and a test asserting
      the absence of a control is a test that has to be rewritten when the
      control arrives, not evidence that it should not.

      What holds now: the later step is a BUTTON (not a link — it does not
      navigate on its own), pressing it explains what comes first, and the
      dialog ends in the prerequisite rather than in a dead end. The amber
      hierarchy is unchanged, and the assertion above still pins step 1 as the
      only `link`.
    */
    const blockedStep = startHere.getByRole('button', { name: copy.dashboard.stepQuizCta });
    await expect(blockedStep).toBeVisible();
    await blockedStep.click();

    const why = page.getByRole('dialog');
    await expect(why.getByText(copy.dashboard.stepBlockedTitle)).toBeVisible();
    // The reason is step 3's OWN — «الاختبار بييجي بعد الدرس، والدرس بييجي
    // بعد ما تشترك في كورس» — not step 2's. A blocked step explains itself in
    // its own terms and then points at the earliest thing that is missing,
    // which for a student with no course is the catalogue.
    await expect(why.getByText(copy.dashboard.stepQuizBlockedNoCourse)).toBeVisible();
    // And it ends somewhere: the way forward is a real link, not just a close.
    await expect(why.getByRole('link', { name: copy.dashboard.stepEnrollCta })).toBeVisible();
  });

  test('the first step ticks itself off once the student is enrolled', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);

    await page.goto('/dashboard');

    const startHere = page.getByRole('region', { name: copy.dashboard.startHereTitle });
    // "خطوة ١ من ٣" — one done. The literal is built from the same copy
    // template the card renders, so a wording change moves both together.
    await expect(
      startHere.getByText(
        copy.dashboard.startHereProgress.replace('{done}', '1').replace('{total}', '3'),
      ),
    ).toBeVisible();

    // The CTA has moved on to step 2 rather than still pointing at the
    // catalog — the whole point of deriving the steps from live data.
    await expect(startHere.getByRole('link', { name: copy.dashboard.stepLessonCta })).toBeVisible();
  });

  /**
   * The top bar has to survive 360px, and this is the width nothing else tests.
   *
   * The `mobile` project is a Pixel 7 — 412 CSS px — but the phone this product
   * is actually read on is a 360px Android, and that is the width every
   * measurement in `student-topbar.tsx` and `brand-lockup.tsx` was taken at:
   * «measured on a Galaxy S9+ against production», which is where the wordmark
   * was dropped from the mobile portrait to make the row fit at all.
   *
   * The row got wider again when the hamburger gained the visible «القائمة»
   * label, so the budget it was spending had to be re-checked rather than
   * assumed. It is asserted as GEOMETRY, not as a class: the failure being
   * guarded against is two controls landing on top of each other, and
   * `html { overflow-x: clip }` means the document will never report a
   * horizontal overflow to catch it — the page simply cuts the row off at the
   * edge and looks fine to any assertion that is not measuring boxes.
   */
  test('the top bar still fits a 360px phone with the menu labelled', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', 'this is a phone-width measurement');

    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/dashboard');

    const menu = page.getByRole('button', { name: copy.nav.menuLabel });
    await expect(menu).toBeVisible();

    const menuBox = await menu.boundingBox();
    const actionsBox = await page.locator('.topbar__actions').boundingBox();
    expect(menuBox).not.toBeNull();
    expect(actionsBox).not.toBeNull();
    if (!menuBox || !actionsBox) return;

    // Both inside the viewport…
    expect(menuBox.x).toBeGreaterThanOrEqual(0);
    expect(actionsBox.x + actionsBox.width).toBeLessThanOrEqual(360);
    // …and not on top of each other. In this RTL row the menu sits at the
    // inline start (the right), so the actions cluster ends before it begins.
    expect(actionsBox.x + actionsBox.width).toBeLessThanOrEqual(menuBox.x + 1);

    // The label is the whole point of the change: if it wrapped or was clipped
    // to nothing, the button would be back to a bare glyph.
    expect(menuBox.width).toBeGreaterThan(60);
    expect(menuBox.height).toBeLessThan(60);
  });

  test('the rail carries the student’s own courses', async ({ page }) => {
    test.skip(
      test.info().project.name !== 'desktop',
      'there is no rail below the md breakpoint; the sheet carries these links instead',
    );

    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);

    await page.goto('/dashboard');

    // `.first()`: the same nav landmark name is used by the rail and by the
    // topbar's mobile sheet, and both are in the DOM at a desktop viewport
    // (the sheet is `md:hidden`, i.e. hidden, not unmounted).
    const rail = page.getByRole('navigation', { name: copy.nav.mainNav }).first();
    await expect(rail.getByRole('link', { name: copy.nav.dashboard })).toBeVisible();
    await expect(rail.getByRole('link', { name: copy.nav.path })).toBeVisible();
    await expect(rail.getByRole('link', { name: copy.nav.courses })).toBeVisible();

    // The enrolled course streams into the rail from its own Suspense
    // boundary. Asserting the heading is visible AND that the "no courses
    // yet" line is gone is what proves the boundary actually resolved, rather
    // than the test passing against a skeleton that never settled.
    await expect(page.getByText(copy.nav.railCourses).first()).toBeVisible();
    await expect(page.getByText(copy.nav.railCoursesEmpty)).toHaveCount(0);
  });

  test('the collapse toggle persists across a reload', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'no rail below the md breakpoint');

    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await page.goto('/dashboard');

    await expect(page.locator('html')).not.toHaveAttribute('data-rail', 'collapsed');

    await page.getByRole('button', { name: copy.nav.collapseRail }).click();
    await expect(page.locator('html')).toHaveAttribute('data-rail', 'collapsed');

    // The point of persisting it in localStorage and applying it from the
    // pre-paint inline script: it survives a full document load, and it is
    // already applied on the first frame rather than snapping shut on
    // hydration.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-rail', 'collapsed');
    await expect(page.getByRole('button', { name: copy.nav.expandRail })).toBeVisible();
  });

  test('the lesson player forces the rail collapsed without overwriting the preference', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'desktop', 'no rail below the md breakpoint');

    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);

    // Via /path, not via /courses. `(site)/courses/**` is the MARKETING
    // catalog — a different route group with its own header and no rail — and
    // the seeded course's slug is generated per run (`quiz-fixture-<uuid>`),
    // so there is no stable URL to navigate to directly. `/path` is inside the
    // shell, lists the same lesson, and `learning-path.e2e.ts` already proves
    // the demo course's single lesson renders there as a real link.
    await page.goto('/path');

    // `filter({ visible: true })`: Next's App Router keeps the outgoing route
    // segment in the DOM inside a `display: none` container after a
    // client-side transition, so a bare locator can match a leftover copy.
    // `fixtures.ts` documents this at length.
    // Scoped to the VISIBLE `main`, not to the page. `visible: true` alone was
    // not enough: the rail lists the same enrolled course, so the lesson link
    // can legitimately match twice on one screen, and the count assertion then
    // failed at 2 without anything being wrong. The landmark is what
    // distinguishes "the page's own list" from "the shell's navigation".
    const content = page.getByRole('main').filter({ visible: true });
    const lesson = content.getByRole('link', { name: 'اختبار تجريبي' }).filter({ visible: true });
    await expect(lesson).toHaveCount(1);
    await lesson.click();
    await page.waitForURL(/\/lessons\//);

    // `.shell` is filtered the same way and for the same reason the lesson
    // link is: after a client-side transition the outgoing route keeps its own
    // `.shell` in the DOM inside a `display: none` container, so an unfiltered
    // locator matches two and fails strict mode. The leftover cannot be the
    // one under test — it belongs to the route being left.
    const shell = page.locator('.shell').filter({ visible: true });
    await expect(shell).toHaveAttribute('data-rail-forced', 'true');
    // The override is a route rule, not a write: the student never chose this,
    // so nothing may have been stored.
    await expect(page.locator('html')).not.toHaveAttribute('data-rail', 'collapsed');

    // Leaving restores the expanded rail.
    await page.goto('/dashboard');
    await expect(shell).not.toHaveAttribute('data-rail-forced', 'true');
  });

  test('the account menu opens onto the signed-in identity', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await page.goto('/dashboard');

    await page.getByRole('button', { name: copy.nav.accountMenu }).click();

    await expect(page.getByText(student.email)).toBeVisible();
    await expect(page.getByRole('menuitem', { name: copy.nav.devices })).toBeVisible();
    // `menuitem`, not `button`: `<SignOutButton>` is rendered through
    // `DropdownMenuItem asChild`, so Radix puts `role="menuitem"` on the
    // underlying <button> and that is the role assistive tech reports.
    await expect(page.getByRole('menuitem', { name: copy.nav.logout })).toBeVisible();
  });

  test('has no serious or critical axe violations', async ({ page }, testInfo) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);
    await page.goto('/dashboard');

    // Wait for the streamed rail content, so the audit covers the settled
    // page rather than its skeletons.
    await expect(page.getByRole('region', { name: copy.dashboard.startHereTitle })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const serious = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );

    await testInfo.attach('axe-violations', {
      body: JSON.stringify(serious, null, 2),
      contentType: 'application/json',
    });

    expect(serious).toEqual([]);
  });

  /*
   * The assistant launcher must be fixed to the WINDOW, not to the page.
   *
   * It was fixed to the page, and the difference is invisible until something
   * scrolls. `.route-fade` — the wrapper that animates a 4px rise on every
   * navigation — leaves `transform` computed as the IDENTITY MATRIX once the
   * animation finishes with `fill-mode: both`, and any transform other than
   * the keyword `none` makes an element the containing block for its
   * `position: fixed` descendants. The launcher was rendered inside it, so it
   * anchored to the bottom of the DOCUMENT: measured on `/path` at scrollY
   * 1500, it sat 3231px below the bottom of the viewport. Reported as
   * «مش مظبطة خالص».
   *
   * `assistant-widget.tsx` already warned about a transformed ancestor, but it
   * guarded its own carrier — the transform was two levels up, in the shell.
   *
   * So this asserts the PROPERTY rather than the fix: after scrolling a long
   * page, the launcher is still at the same place on screen. Any future
   * wrapper that anchors it to the document fails here instead of shipping.
   *
   * ## ⚠️ The launcher MOVED, and this test moved with it — on purpose
   *
   * On this surface it is no longer a disc floating over the page; it is a
   * control in the topbar beside the notification bell («في الداشبورد… خليها
   * جنب النوتيفيكيشن فوق»). So `position: fixed` and "a fixed distance from the
   * viewport FLOOR" are no longer the right shape to assert — the topbar is
   * `position: sticky` at the top instead.
   *
   * What has not changed, and is what this test was always really about, is the
   * GUARANTEE: the support button is one tap away from wherever the reader has
   * got to. That is asserted here the same way it always was — by scrolling to
   * the bottom of a page that really scrolls and requiring the launcher's
   * viewport coordinates not to have moved. That catches an ancestor that
   * breaks `sticky` (an `overflow` or a `contain` on the wrong wrapper) exactly
   * as the old form caught one that broke `fixed`.
   *
   * It is also now found by ACCESSIBLE NAME rather than by `textContent`: the
   * docked launcher is the robot mark with no text node, so a text search finds
   * nothing and reports "the launcher must be in the DOM" for a launcher that
   * is right there.
   */
  // The assistant widget is temporarily disabled — see AssistantSlot
  // (components/assistant/assistant-slot.tsx). No launcher renders to pin.
  test.skip('the assistant launcher stays pinned to the viewport down a long page', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);

    /*
     * A SHORT viewport, not a tall page.
     *
     * The first version of this navigated to `/path` and required the document
     * to be over 1500px — and then failed its own guard, because a freshly
     * registered student enrolled in the one seeded demo course has a 900px
     * path. Depending on how much content a fixture happens to produce is
     * exactly the kind of assumption that makes a test pass vacuously later.
     *
     * Shrinking the window makes ANY page scroll, which is all this needs.
     */
    await page.setViewportSize({ width: 900, height: 400 });
    await page.goto('/path');

    // `open` is the plain label; `openWithReply` appends to it, so a prefix
    // match covers a student who happens to have an unread reply.
    const launcher = page.getByRole('button', { name: copy.assistant.open, exact: false });
    await expect(launcher).toBeVisible();

    const scrollable = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(
      scrollable,
      'the page must actually scroll for this test to mean anything',
    ).toBeGreaterThan(200);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 5_000 })
      .toBeGreaterThan(150);

    const report = await page.evaluate(() => {
      // By ACCESSIBLE NAME, not by text: the docked launcher is the robot mark
      // and carries no text node at all.
      const button = [...document.querySelectorAll('button')].find((element) =>
        (element.getAttribute('aria-label') ?? '').includes('المساعد'),
      );
      if (!button) return null;
      const box = button.getBoundingClientRect();

      const transformed: string[] = [];
      for (
        let element: HTMLElement | null = button.parentElement;
        element && element !== document.documentElement;
        element = element.parentElement
      ) {
        const style = getComputedStyle(element);
        // Every one of these makes an element the containing block for a fixed
        // descendant, so every one of them would reproduce the bug.
        if (
          style.transform !== 'none' ||
          style.filter !== 'none' ||
          style.perspective !== 'none' ||
          style.contain.includes('paint') ||
          style.contain.includes('layout')
        ) {
          transformed.push(`${element.tagName}.${String(element.className).slice(0, 40)}`);
        }
      }

      return {
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        inHeader: Boolean(button.closest('header')),
        transformed,
      };
    });

    expect(report, 'the launcher must be in the DOM').not.toBeNull();
    // On screen — not scrolled off the top, not below the fold.
    expect(report!.top).toBeGreaterThanOrEqual(0);
    expect(report!.bottom).toBeLessThanOrEqual(400);
    expect(
      report!.inHeader,
      'the signed-in launcher lives in the sticky topbar, beside the bell',
    ).toBe(true);
    expect(
      report!.transformed,
      'nothing between the launcher and the root may create a containing block',
    ).toEqual([]);

    /*
     * The guarantee itself: the same place on screen at the bottom of the page
     * as at the top. This is what "one tap away from wherever the reader has
     * got to" actually means, and it is the assertion that survives the
     * launcher moving from `fixed` to `sticky` — it catches a broken sticky
     * ancestor exactly as the old `gapFromViewportBottom` caught a broken fixed
     * one.
     */
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5_000 }).toBe(0);
    const topOfPage = await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((element) =>
        (element.getAttribute('aria-label') ?? '').includes('المساعد'),
      );
      return button ? Math.round(button.getBoundingClientRect().top) : null;
    });
    expect(topOfPage).toBe(report!.top);
  });
});
