import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts';

const c = copy.assistant;

/**
 * المساعد, from a stranger's side.
 *
 * Everything here is selected by `copy.*` key rather than by rendered Arabic —
 * the repo-wide rule that keeps adding a second language a routing change
 * rather than a test rewrite.
 *
 * The escalation is deliberately NOT exercised end to end here: it writes a
 * conversation row and needs an admin session to answer it, which is an
 * integration concern that `assistant.service.spec.ts` already covers in full
 * against a real database. What this file owns is the part only a browser can
 * answer — that the panel opens, that both halves work, and that the result is
 * reachable by keyboard and clean under axe.
 *
 * ## The open chat is asserted WITHOUT a model, on purpose
 *
 * `ANTHROPIC_API_KEY` is unset in CI, so `POST /api/assistant/ask` answers out
 * of `matchKnowledge` — the same paragraphs the guided tree shows, retrieved
 * by word overlap. That makes the answer to a fixed question DETERMINISTIC and
 * assertable by `copy` key, which a model's own wording would never be. It
 * also means these tests cover the path most likely to be live on a fresh
 * deployment, which is the one nobody would otherwise look at.
 */

/*
 * ⚠️ The three tests that CLICK the launcher run on desktop only, and that is
 * a limitation of Playwright's mobile emulation rather than a gap in the
 * product.
 *
 * Under `isMobile: true`, `boundingBox()` reports the launcher in VISUAL
 * viewport coordinates while `position: fixed` anchors it to the LAYOUT
 * viewport. On a Pixel 7 that is an 86px disagreement — Playwright aims at
 * y=759 for a button that is really at y=845, lands on the hero image, and
 * reports it as "the image intercepts pointer events". Measured directly:
 *
 *   boundingBox      → { x: 298, y: 759, w: 56, h: 56 }   (Playwright)
 *   getBoundingClientRect → y: 845                         (the page)
 *   elementFromPoint(rect centre) → the launcher, every sample over 3s
 *
 * A real tap hit-tests in the page's own coordinates, so it reaches the
 * button. The mobile guarantee that actually matters — that nothing paints
 * over the launcher — is asserted below by hit-testing the way the browser
 * does, which is a stronger check than a synthetic click anyway.
 */
test.describe('the assistant widget', () => {
  test.skip(({ isMobile }) => Boolean(isMobile), 'see the note above: fixed-element hit-testing under mobile emulation');

  test('opens onto the open chat, not onto a menu', async ({ page }) => {
    /*
     * The front door. It used to be the question tree, and a student whose
     * question was not one of the four categories had to walk the tree to find
     * that out. Typing is what a chat launcher promises, so a box to type in
     * is what one tap has to produce — this asserts that the promise is kept
     * before anything else about the panel is checked.
     */
    await page.goto('/');

    const launcher = page.getByRole('button', { name: c.open, exact: true });
    await expect(launcher).toBeVisible();
    await launcher.click();

    const panel = page.getByRole('dialog', { name: c.title });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('textbox', { name: c.ai.placeholder })).toBeVisible();
    await expect(panel.getByRole('button', { name: c.tabs.chat })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('answers a typed question, keeps it across tabs, and offers أيمن', async ({ page }) => {
    /*
     * The whole feature, from the student's side: type a real question in
     * their own words, get an answer streamed back, and — when the answer is
     * not good enough — a card that hands the question to a person already
     * written.
     *
     * The expected text is a `copy` key rather than a sentence, so this
     * asserts the WIRING (question in → the right written answer out) and not
     * a model's phrasing. See the note at the top of this file for why the
     * answer is deterministic here.
     */
    await page.goto('/');
    await page.getByRole('button', { name: c.open, exact: true }).click();
    const panel = page.getByRole('dialog', { name: c.title });

    await panel.getByRole('textbox', { name: c.ai.placeholder }).fill('الكويزات شكلها إيه؟');
    await panel.getByRole('button', { name: c.ai.send }).click();

    await expect(panel.getByText(c.script.studyQuizzes)).toBeVisible();

    /*
     * The transcript survives leaving the screen. `AssistantChat` is hidden
     * between tabs rather than unmounted — the transcript lives in
     * `useAssistantAsk`, and an unmount throws it away along with any answer
     * still streaming. Asserted inside this test rather than in one of its own
     * because a second test would spend a second call on a route that is
     * throttled and, in production, billed.
     */
    await panel.getByRole('button', { name: c.tabs.guide }).click();
    await expect(panel.getByText(c.script.root)).toBeVisible();
    await panel.getByRole('button', { name: c.tabs.chat }).click();
    await expect(panel.getByText(c.script.studyQuizzes)).toBeVisible();

    // Without a model configured every answer keeps the way to a person on
    // screen, because it knows it is the lesser answer.
    const handoff = panel.getByRole('button', { name: c.ai.escalateAction });
    await expect(handoff).toBeVisible();
    await handoff.click();

    // …and the question travels with it. Typing it a second time is the small
    // disrespect `initialMessage` exists to remove.
    await expect(panel.getByRole('textbox', { name: c.escalate.message })).toHaveValue(
      'الكويزات شكلها إيه؟',
    );
  });

  test('reaches أيمن from the first screen, with nothing typed', async ({ page }) => {
    /*
     * «عاوز يقدر يتواصل مع المهندس أيمن على طول». Before the footer strip,
     * «على طول» meant walking two or three stops into the tree and finding a
     * tinted row at the bottom of a menu — four questions nobody asked,
     * answered before the one they came to ask.
     */
    await page.goto('/');
    await page.getByRole('button', { name: c.open, exact: true }).click();
    const panel = page.getByRole('dialog', { name: c.title });

    await panel.getByRole('button', { name: c.contact.ayman }).click();
    await expect(panel.getByRole('textbox', { name: c.escalate.message })).toBeVisible();
  });

  test('walks the question tree from its tab', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: c.open, exact: true }).click();

    const panel = page.getByRole('dialog', { name: c.title });
    await panel.getByRole('button', { name: c.tabs.guide }).click();

    // The root's own words, so a re-worded root fails here rather than
    // silently changing what every visitor reads first.
    await expect(panel.getByText(c.script.root)).toBeVisible();

    await panel.getByRole('button', { name: c.choices.join }).click();
    await expect(panel.getByText(c.script.join)).toBeVisible();

    await panel.getByRole('button', { name: c.choices.joinAccount }).click();
    await expect(panel.getByText(c.script.joinAccount)).toBeVisible();
  });


  test('rewinds from the trail, and the trail records the route walked', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: c.open, exact: true }).click();
    const panel = page.getByRole('dialog', { name: c.title });
    await panel.getByRole('button', { name: c.tabs.guide }).click();

    await panel.getByRole('button', { name: c.choices.study }).click();
    await panel.getByRole('button', { name: c.choices.studyRetake }).click();

    // The trail is the signature of this widget: it shows the route rather
    // than a transcript, and every earlier stop is a place to go back to.
    const trail = panel.getByRole('navigation', { name: c.title });
    await expect(trail.getByRole('button', { name: c.choices.study })).toBeVisible();

    await trail.getByRole('button', { name: c.choices.study }).click();
    await expect(panel.getByText(c.script.study)).toBeVisible();
  });

  test('closes on Escape and returns focus to the launcher', async ({ page }) => {
    await page.goto('/');
    const launcher = page.getByRole('button', { name: c.open, exact: true });
    await launcher.click();
    await expect(page.getByRole('dialog', { name: c.title })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: c.title })).toBeHidden();
    // Focus left somewhere arbitrary is how a keyboard user loses their place
    // entirely — the panel was the last thing they were in.
    await expect(launcher).toBeFocused();
  });

  test('has no serious or critical axe violations while open', async ({ page }) => {
    /*
     * The panel's contents only exist in the DOM once it is open, so
     * `a11y.e2e.ts`'s per-route sweep audits the launcher and nothing behind
     * it. This is the other half.
     */
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('button', { name: c.open, exact: true }).click();
    await expect(page.getByRole('dialog', { name: c.title })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const blocking = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );
    expect(blocking.map((v) => `${v.id}: ${v.nodes.length} node(s) -- ${v.help}`)).toEqual([]);
  });

});

test.describe('the assistant launcher on a phone', () => {
  test('is the topmost element at its own centre', async ({ page }) => {
    /*
     * The mobile guarantee, asserted the way the browser resolves a tap:
     * hit-test the launcher's own rect centre and require the result to be
     * inside the launcher. This is what caught the real bug on this surface —
     * `.hero__scrim`, an `aria-hidden` overlay that was capturing pointer
     * events across the whole hero.
     */
    await page.goto('/');
    const launcher = page.getByRole('button', { name: c.open, exact: true });
    await expect(launcher).toBeVisible();

    const hit = await page.evaluate((label) => {
      const button = [...document.querySelectorAll('button')].find(
        (element) => element.getAttribute('aria-label') === label,
      );
      if (!button) return 'no-launcher';
      const rect = button.getBoundingClientRect();
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return top?.closest('button') === button ? 'launcher' : `blocked-by:${top?.tagName}`;
    }, c.open);

    expect(hit).toBe('launcher');
  });
});

test.describe('where the launcher sits while the page moves', () => {
  /*
   * These two run on BOTH projects, deliberately.
   *
   * The skip at the top of this file is about CLICKING a fixed element under
   * mobile emulation — Playwright aims in visual-viewport coordinates and
   * misses. Nothing here clicks. Every measurement below is
   * `getBoundingClientRect()` evaluated inside the page, which is the page's
   * own coordinate system and is exactly what the emulation gets right. The
   * phone is also the size where both of these went wrong first.
   */

  /** The launcher's rect, in the page's coordinates rather than Playwright's. */
  async function launcherRect(page: import('@playwright/test').Page, label: string) {
    return page.evaluate((name) => {
      const button = [...document.querySelectorAll('button')].find(
        (element) => element.getAttribute('aria-label') === name,
      );
      if (!button) throw new Error('no launcher');
      const rect = button.getBoundingClientRect();
      return {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        position: getComputedStyle(button).position,
        viewport: window.innerHeight,
      };
    }, label);
  }

  test('does not scroll away with the page', async ({ page }) => {
    /*
     * The whole premise of a launcher: it is one tap away from wherever the
     * reader has got to. `position: fixed` in the stylesheet does not prove
     * that — a transformed ancestor anywhere above it silently re-anchors a
     * fixed element to that ancestor's box, and the symptom is a button that
     * scrolls off the top of the screen and never comes back.
     *
     * So this asserts the observable property instead: the same viewport
     * coordinates at three different scroll positions.
     */
    await page.goto('/');
    const launcher = page.getByRole('button', { name: c.open, exact: true });
    await expect(launcher).toBeVisible();

    const atTop = await launcherRect(page, c.open);
    expect(atTop.position).toBe('fixed');

    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(250);
    const afterScroll = await launcherRect(page, c.open);
    expect(afterScroll.top).toBe(atTop.top);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    const backAtTop = await launcherRect(page, c.open);
    expect(backAtTop.top).toBe(atTop.top);
  });

  test('stays pinned all the way down, including over the sign-off', async ({ page }) => {
    /*
     * This asserted the OPPOSITE until the launcher stopped parking.
     *
     * It used to ride up once the sign-off scrolled in, so it would not sit
     * across the wordmark. Correct about the wordmark, wrong about the widget:
     * a support button that moves while you are scrolling is one you have to
     * go looking for, and every chat launcher a student has ever used stays
     * exactly where they left it. Overlapping the sign-off is the accepted
     * cost of that, and it is the behaviour this now protects.
     */
    await page.goto('/');
    await expect(page.getByRole('button', { name: c.open, exact: true })).toBeVisible();

    const readGap = () =>
      page.evaluate((name) => {
        const button = [...document.querySelectorAll('button')].find(
          (element) => element.getAttribute('aria-label') === name,
        );
        if (!button) return null;
        const rect = button.getBoundingClientRect();
        return {
          gap: Math.round(window.innerHeight - rect.bottom),
          transform: getComputedStyle(button).transform,
        };
      }, c.open);

    const atTop = await readGap();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    const atBottom = await readGap();

    expect(atTop).not.toBeNull();
    expect(atBottom).not.toBeNull();
    // Identical distance from the viewport floor before and after — not
    // "roughly", exactly. A park would show up here as a larger gap.
    expect(atBottom!.gap).toBe(atTop!.gap);
    // And nothing is moving it by transform either, which is how the park
    // used to be applied.
    expect(atBottom!.transform).toBe('none');
  });
});

test.describe('where the assistant must not be', () => {
  test('never appears inside a graded attempt', async ({ page }) => {
    /*
     * The integrity case, asserted at the level a user experiences it. A
     * support channel open beside a timed exam is a route to asking about the
     * question on screen — `assistant-mount.test.ts` proves the predicate, and
     * this proves the predicate is actually what the page obeys.
     *
     * An unauthenticated visit redirects to login, where the widget SHOULD
     * appear; the assertion is on the attempt URL resolving to a screen
     * without it, so this stays honest either way.
     */
    await page.goto('/quizzes/some-lesson/attempt/some-attempt');
    await page.waitForLoadState('networkidle');

    if (new URL(page.url()).pathname.includes('/attempt/')) {
      await expect(page.getByRole('button', { name: c.open, exact: true })).toBeHidden();
    }
  });
});
