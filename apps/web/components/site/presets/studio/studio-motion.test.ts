import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const PRESETS_CSS = join(process.cwd(), 'app/(site)/styles/presets.css');

/** The STUDIO section only — the same slicing `neon-landing.test.ts` does. */
function studioSection(): string {
  const css = readFileSync(PRESETS_CSS, 'utf8');
  const marker = css.indexOf('═══ STUDIO ═');
  expect(marker, 'the STUDIO banner is missing from presets.css').toBeGreaterThan(-1);

  const start = css.lastIndexOf('/*', marker);
  const after = css.slice(start === -1 ? marker : start);
  const next = after.search(/═══ (?!STUDIO)[A-Z]+ ═/);
  return next === -1 ? after : after.slice(0, next);
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/**
 * The motion contract, checked rather than remembered.
 *
 * The opener animates, and the failure mode of an entrance animation is the
 * same every time: the element is parked at `opacity: 0` in its own rule and
 * only an animation brings it back. That page is blank for a reader with
 * `prefers-reduced-motion` — `tokens/motion.css` clamps the animation to
 * 0.01ms, so the from-state applies and nothing ever moves it — and it is
 * blank in the thumbnail, the first shared frame, and any browser that
 * declined to run the animation.
 *
 * The rule this section follows instead: every from-state lives in
 * `@keyframes` and reaches the element through `animation-fill-mode:
 * backwards`, so the resting state is the styled one.
 */
describe('the studio opener is readable with no animation at all', () => {
  it('parks nothing that carries words at opacity: 0', () => {
    const css = stripComments(studioSection());

    // `@keyframes` bodies are where a `from { opacity: 0 }` BELONGS.
    const withoutKeyframes = css.replace(
      /@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g,
      ' ',
    );

    const parked = [...withoutKeyframes.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, , body]) => /opacity:\s*0\s*[;}]/.test(body!))
      .map(([, selector]) => selector!.trim());

    // The caret is the single exception and it is named here so it cannot
    // quietly become two: it is an `::after` with no text, pure ornament, and
    // a caret frozen mid-page with nothing typing is worse than no caret.
    expect(parked).toEqual(["[data-preset='studio'] .st-code__line:last-child::after"]);
  });

  it('fills backwards on every entrance, so the delay never hides content', () => {
    const css = stripComments(studioSection());

    const animations = [...css.matchAll(/animation:\s*st-([a-z-]+)[^;]*;/g)].map(
      (match) => match[0]!,
    );

    expect(animations.length).toBeGreaterThan(0);

    // What matters is that the from-state applies DURING the delay: without
    // it a delayed entrance shows the element at rest, then snaps back to the
    // start when the animation begins — a visible flicker on every load.
    //
    // `backwards` and `both` both do that. `both` is what the scroll-driven
    // reveals use and it is the correct one there: they also need `forwards`,
    // or an element sits at its from-state again once its range is behind the
    // scrollport. An earlier version of this test named only `backwards` and
    // failed the correct declaration — it was asserting a SPELLING rather
    // than the property, which is the mistake it exists to catch elsewhere.
    for (const declaration of animations) {
      expect(declaration, `${declaration} fills neither backwards nor both`).toMatch(
        /\b(backwards|both)\b/,
      );
    }
  });

  it('leaves the shell to the theme instead of pinning it', () => {
    const css = stripComments(studioSection());

    // «الترمينال» pins `.site`'s tokens dark unconditionally, because that
    // preset's defining claim is that it never turns light. This one is light
    // by DEFAULT and honours the toggle, so its shell block must be scoped to
    // one theme — an unscoped `:root:root .site:has(…)` is (0,4,0) and beats
    // `theme.css`'s dark block at (0,3,0), which would leave a reader who
    // chose dark with a dark page inside a white header.
    const shell = css.match(/:root:root[^{]*\.site:has\(main\[data-preset='studio'\]\)[^{]*\{/);

    expect(shell, 'the studio shell block is missing').not.toBeNull();
    expect(shell![0], 'the studio shell block is not scoped to a theme').toContain(
      "data-theme='light'",
    );
  });

  it('defines a dark value for every fixed studio token', () => {
    const css = stripComments(studioSection());

    // A token written as a literal light value and never redefined is the
    // classic unreadable-in-dark bug: `--st-ink: var(--p-950)` is near-black
    // text, which on a dark ground is text on its own colour.
    // Anchored on the SELECTOR, not on a word in the banner: `stripComments`
    // has already removed the banner by the time this runs, and an index of
    // -1 silently slices to the last character — which is how an earlier
    // version of this test passed against an empty string.
    // The selector is the FIRST arm of a two-arm list, so it is followed by a
    // comma and a newline rather than by a brace.
    const at = css.indexOf("[data-theme='dark'] [data-preset='studio'],");
    expect(at, 'the dark block is missing').toBeGreaterThan(-1);
    const dark = css.slice(at);
    for (const token of ['--st-ink', '--st-ink-2', '--st-accent', '--st-wash', '--st-rule', '--st-deep', '--st-on-deep']) {
      expect(dark, `${token} has no dark value`).toContain(`${token}:`);
    }
  });

  it('never loops an animation forever', () => {
    const css = stripComments(studioSection());

    // A permanently moving object on an otherwise still page is something the
    // eye keeps returning to for no reason, and it is battery a phone spends
    // on a page nobody is looking at any more.
    expect(css).not.toMatch(/animation:[^;]*infinite/);
  });
});
