import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The assistant launcher's accessible name is an INTERFACE, and this is the
 * cheapest place that says so.
 *
 * ## What happened
 *
 * The draggable-launcher feature appended its hint to the button's label:
 *
 *   aria-label={`${unread > 0 ? c.openWithReply : c.open} — ${…c.drag}`}
 *
 * `e2e/assistant.e2e.ts` resolves that button by its exact accessible name in
 * sixteen places — `getByRole(…, { exact: true })`, and inside `page.evaluate`,
 * `getAttribute('aria-label') === name`. Every one stopped matching. All four
 * Playwright shards went red on `main`, twice in a row, and two merges sat
 * undeployed behind them until it was found by hand.
 *
 * ## ⚠️ Why a UNIT test for something the e2e suite already covers
 *
 * BECAUSE THE E2E SUITE DOES NOT RUN ON PULL REQUESTS. `ci.yml` keeps
 * playwright on `schedule || workflow_dispatch || push to main`, for the
 * queueing reasons written at length on that job. The consequence is the whole
 * point of this file: the PR gate is structurally blind to this class of
 * break, so the first thing that notices is `main` itself — after the merge,
 * with the deploy stuck behind it.
 *
 * This runs in the unit suite, on every PR, in milliseconds. It reads the file
 * and matches strings — no render, no jsdom, no browser — so it cannot flake
 * and is safe on the merge path. Same trade as
 * `lib/error-boundary-coverage.test.ts`.
 *
 * ## What it does NOT claim
 *
 * That the launcher works, or that it is positioned correctly. Only that its
 * NAME is still the name the suite — and a voice-control user saying «اسأل
 * المساعد» — asks for, and that the drag hint still reaches somebody.
 */
const WIDGET = join(import.meta.dirname, 'assistant-widget.tsx');

/** Comments out, code in — this file explains the very pattern it forbids. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

const code = stripComments(readFileSync(WIDGET, 'utf8'));
const ariaLabels = [...code.matchAll(/aria-label=\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g)].map((match) =>
  match[1]!.trim(),
);

/** The two launchers — docked in the signed-in topbar, floating everywhere else. */
const launcherLabels = ariaLabels.filter((expression) => expression.includes('c.open'));

describe('assistant launcher accessible name', () => {
  it('finds the aria-labels at all', () => {
    // A guard that silently matches nothing is worse than no guard: it goes
    // green forever on the day the attribute is written some other way.
    expect(
      ariaLabels.length,
      'no aria-label found in assistant-widget.tsx — has it been restructured?',
    ).toBeGreaterThanOrEqual(2);
  });

  it('names both launchers, and names them identically', () => {
    expect(
      launcherLabels.length,
      'expected the docked and the floating launcher to both be named from copy.assistant.open',
    ).toBe(2);

    // The exact expression, not merely "contains c.open". `exact: true` in the
    // suite means any extra character is a miss, so anything looser here would
    // pass the build that breaks the shards.
    const expected = 'unread > 0 ? c.openWithReply : c.open';
    const wrong = launcherLabels.filter((expression) => expression !== expected);
    expect(
      wrong,
      `a launcher's accessible name must be exactly \`${expected}\` — anything else changes what getByRole({ name, exact: true }) resolves: ${wrong.join(' | ')}`,
    ).toEqual([]);
  });

  it('never assembles a name from a template literal', () => {
    // The regression in one line. Stated separately from the equality check
    // above so the failure message names the cause rather than the symptom.
    const templated = ariaLabels.filter((expression) => expression.includes('`'));
    expect(
      templated,
      `these aria-labels are built by concatenation, which changes the accessible name — put the extra text in title or aria-describedby: ${templated.join(' | ')}`,
    ).toEqual([]);
  });

  it('still offers the drag hint somewhere', () => {
    // Stops the fix being "delete the hint". Deliberately implementation-blind:
    // `title` (the current choice — it is a description in the a11y tree AND
    // the hover tooltip) and `aria-describedby` are both correct answers, and
    // this should not force a rewrite if that judgement is revisited.
    const exposed = /title=\{[^}]*c\.drag/.test(code) || /aria-describedby=/.test(code);
    expect(
      exposed,
      'the drag hint no longer reaches anyone — it belongs in title or aria-describedby, not in the name',
    ).toBe(true);

    expect(code, 'picking the launcher up must still be announced').toMatch(/c\.dragging/);
  });
});
