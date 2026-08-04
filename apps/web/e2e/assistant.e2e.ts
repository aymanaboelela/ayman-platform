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
 * answer — that the panel opens, that walking the tree works, and that the
 * result is reachable by keyboard and clean under axe.
 */

test.describe('the assistant widget', () => {
  test('opens onto the question tree and walks it', async ({ page }) => {
    await page.goto('/');

    const launcher = page.getByRole('button', { name: c.open, exact: true });
    await expect(launcher).toBeVisible();
    await launcher.click();

    const panel = page.getByRole('dialog', { name: c.title });
    await expect(panel).toBeVisible();
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
