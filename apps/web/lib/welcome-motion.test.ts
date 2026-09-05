import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  WELCOME_ENTRANCE_BUDGET_MS,
  WELCOME_ENTRANCE_DURATION_MS,
  WELCOME_ENTRANCE_MS,
  WELCOME_HANDOFF_MS,
  WELCOME_STEP_STRIDE_MS,
  WELCOME_TICK_DELAY_MS,
  WELCOME_TICK_DRAW_DELAY_MS,
  WELCOME_TICK_DRAW_DURATION_MS,
  WELCOME_TICK_DURATION_MS,
  entranceDelay,
  entranceEndsMs,
  handoffDelayMs,
  isPlainPress,
  stepDelayMs,
  stepTickEndsMs,
} from './welcome-motion';

/**
 * /welcome's motion, tested against the stylesheet that actually runs it.
 *
 * ## Why this reads `study.css`
 *
 * The screen's animation is CSS and its handoff is a `setTimeout`, which means
 * one number — how long the departure lasts — is written down twice, in two
 * languages, in two files. That is a bug with a fuse on it: change the CSS and
 * the router fires while the scene is still on screen; change the TypeScript
 * and the scene sits finished, waiting. Neither shows up in a typecheck, in a
 * build, or in any test that only imports the module.
 *
 * So every mirrored value is asserted against the stylesheet, the same way
 * `css-token-coverage.test.ts` asserts every `var(--x)` against something that
 * defines it — a static read, no browser, failing in the commit that causes it.
 *
 * The rest of the file is the three motion invariants written down as
 * assertions rather than as comments: it finishes fast, it never animates
 * layout, and it stops completely under `prefers-reduced-motion: reduce`.
 */

const STUDY_CSS = readFileSync(join(import.meta.dirname, '..', 'app', 'study.css'), 'utf8');

/**
 * Comments go first, on every read.
 *
 * This file documents its own numbers in prose — «⚠️ MIRRORED in
 * `lib/welcome-motion.ts`» sits directly above the declarations — and a
 * sentence about a duration is not a duration. `css-token-coverage.test.ts`
 * learned the same lesson the expensive way: counting prose silently disarmed
 * the guard it was written to be.
 */
const CSS = STUDY_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');

/** The value of a `--welcome-*: <n>ms` declaration, in milliseconds. */
function cssDuration(property: string): number {
  const match = CSS.match(new RegExp(`${property}:\\s*(\\d+)ms`));
  if (!match) throw new Error(`study.css declares no ${property}`);
  return Number(match[1]);
}

/** Every `selector { declarations }` in the file, innermost-first. */
function rules(source: string): { selector: string; body: string }[] {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1]!.trim().replace(/\s+/g, ' '),
    body: match[2]!,
  }));
}

/**
 * Every `@media (prefers-reduced-motion: reduce) { … }` body in the file,
 * concatenated.
 *
 * ALL of them, not the first one: `study.css` has carried such a block since
 * long before this screen existed (`.unit__chevron`'s, about a thousand lines
 * up), and a version of this helper that stopped at the first match asserted
 * the chevron's rules and passed while /welcome had no escape hatch at all.
 * The invariant is about the query, not about one block of it.
 */
function reducedMotionBlocks(): string {
  const blocks: string[] = [];
  const QUERY = '@media (prefers-reduced-motion: reduce)';
  for (let start = CSS.indexOf(QUERY); start !== -1; start = CSS.indexOf(QUERY, start + 1)) {
    const open = CSS.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < CSS.length; i += 1) {
      if (CSS[i] === '{') depth += 1;
      if (CSS[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          blocks.push(CSS.slice(open + 1, i));
          break;
        }
      }
    }
  }
  expect(blocks.length, 'study.css has no reduced-motion block').toBeGreaterThan(0);
  return blocks.join('\n');
}

/**
 * A selector's SUBJECT — the compound the rule actually styles.
 *
 * `.welcome-steps__step--done .welcome-steps__mark` and
 * `.welcome-page[data-welcome='leaving'] … .welcome-steps__mark` both style a
 * mark, so both reduce to `.welcome-steps__mark`, and a single
 * `.welcome-steps__mark { animation: none }` in the reduced-motion block
 * genuinely covers both. A bare element subject (`path`) keeps its parent,
 * because `path` on its own names nothing.
 */
function subject(selector: string): string {
  const parts = selector.trim().split(/\s+/);
  const last = parts[parts.length - 1]!;
  if (!/^[a-z]+$/.test(last)) return last;
  return `${parts[parts.length - 2] ?? ''} ${last}`.trim();
}

describe('the numbers written in two languages', () => {
  it.each([
    ['--welcome-rise', WELCOME_ENTRANCE_DURATION_MS],
    ['--welcome-handoff', WELCOME_HANDOFF_MS],
    ['--welcome-tick-delay', WELCOME_TICK_DELAY_MS],
    ['--welcome-tick-pop', WELCOME_TICK_DURATION_MS],
    ['--welcome-tick-draw-delay', WELCOME_TICK_DRAW_DELAY_MS],
    ['--welcome-tick-draw', WELCOME_TICK_DRAW_DURATION_MS],
  ])('keeps %s in step with its constant', (property, constant) => {
    expect(cssDuration(property)).toBe(constant);
  });

  it('finishes the departing tick before the router is asked to move', () => {
    // The third stop completes on the way out. If it is still drawing when
    // `router.push` fires, the one animation the press exists to produce is
    // the one the student never sees.
    const commit = cssDuration('--welcome-commit');
    const drawDelay = cssDuration('--welcome-commit-draw-delay');
    expect(drawDelay + commit).toBeLessThanOrEqual(WELCOME_HANDOFF_MS);
  });
});

describe('the entrance ladder', () => {
  it('reads the screen in order', () => {
    const ladder = Object.values(WELCOME_ENTRANCE_MS);
    const sorted = [...ladder].sort((a, b) => a - b);
    expect(ladder).toEqual(sorted);
    // Every block distinct: two arriving on the same frame is a stagger with a
    // rung missing, which reads as a glitch rather than as a sequence.
    expect(new Set(ladder).size).toBe(ladder.length);
  });

  it('starts on the first frame', () => {
    expect(WELCOME_ENTRANCE_MS.eyebrow).toBe(0);
  });

  it('walks the rail at its own stride', () => {
    expect(stepDelayMs(0)).toBe(WELCOME_ENTRANCE_MS.steps);
    expect(stepDelayMs(2) - stepDelayMs(1)).toBe(WELCOME_STEP_STRIDE_MS);
  });

  it('is over well inside a second, ticks included', () => {
    // The last thing to move is the SECOND tick, not the CTA — the mark waits
    // for its row and the check waits for the mark.
    expect(stepTickEndsMs(1)).toBeGreaterThan(
      WELCOME_ENTRANCE_MS.cta + WELCOME_ENTRANCE_DURATION_MS,
    );
    expect(entranceEndsMs(2)).toBe(stepTickEndsMs(1));
    expect(entranceEndsMs(2)).toBeLessThan(WELCOME_ENTRANCE_BUDGET_MS);
  });

  it('writes a delay the stylesheet can read', () => {
    expect(entranceDelay(120)).toEqual({ '--welcome-delay': '120ms' });
  });
});

describe('the CTA is pressable on the first frame', () => {
  it('never animates its opacity', () => {
    // THE invariant. An entrance that hides the one control on the screen is a
    // worse screen than the static one it replaced, so the CTA's keyframe is
    // allowed to move it and nothing else.
    const settle = CSS.match(/@keyframes welcome-settle\s*\{[\s\S]*?\n\}/);
    expect(settle, 'study.css defines no @keyframes welcome-settle').not.toBeNull();
    expect(settle![0]).not.toMatch(/opacity/);
    expect(settle![0]).toMatch(/transform/);
  });

  it('is never hidden or disabled by a rule on this screen', () => {
    for (const rule of rules(CSS)) {
      if (!/\.welcome-cta/.test(rule.selector)) continue;
      expect(rule.body, rule.selector).not.toMatch(/pointer-events\s*:\s*none/);
      expect(rule.body, rule.selector).not.toMatch(/visibility\s*:\s*hidden/);
      expect(rule.body, rule.selector).not.toMatch(/opacity\s*:\s*0\b/);
    }
  });
});

describe('nothing on this screen animates layout', () => {
  /** Anything that forces layout or paint every frame. `filter` included. */
  const BANNED =
    /^\s*(width|height|min-(width|height|inline-size|block-size)|max-(width|height|inline-size|block-size)|inline-size|block-size|top|right|bottom|left|inset(-\w+)*|margin(-\w+)*|padding(-\w+)*|font-size|line-height|border(-\w+)*-width|filter|backdrop-filter|box-shadow)\s*:/m;

  const welcomeKeyframes = [...CSS.matchAll(/@keyframes\s+(welcome-[\w-]+)\s*\{([\s\S]*?)\n\}/g)];

  it('defines the keyframes it claims to', () => {
    expect(welcomeKeyframes.length).toBeGreaterThanOrEqual(7);
  });

  it.each(welcomeKeyframes.map((k) => [k[1]!, k[2]!]))(
    '@keyframes %s touches only composited properties',
    (_name, body) => {
      expect(body).not.toMatch(BANNED);
      for (const declaration of body.matchAll(/([a-z-]+)\s*:/g)) {
        expect(['transform', 'opacity', 'stroke-dashoffset']).toContain(declaration[1]);
      }
    },
  );
});

describe('reduced motion', () => {
  const reduce = reducedMotionBlocks();

  it('turns every welcome animation off rather than shortening it', () => {
    // The global backstop in `motion.css` only collapses durations, which
    // parks a looping animation on its `from` keyframe — for the band's bloom
    // that is a permanent 40% opacity, a frame chosen for nobody.
    expect(reduce).toMatch(/animation:\s*none/);
  });

  it('covers every element this screen animates', () => {
    const animated = rules(CSS)
      .filter((rule) => /animation:\s*welcome-/.test(rule.body))
      .flatMap((rule) => rule.selector.split(',').map((s) => subject(s)));
    expect(animated.length).toBeGreaterThan(0);

    const disabled = new Set(
      rules(reduce)
        .filter((rule) => /animation:\s*none/.test(rule.body))
        .flatMap((rule) => rule.selector.split(',').map((s) => subject(s))),
    );

    const uncovered = [...new Set(animated)].filter((s) => !disabled.has(s));
    expect(uncovered, `animated with no reduced-motion escape: ${uncovered.join(', ')}`).toEqual(
      [],
    );
  });

  it('navigates on the same tick the browser would have', () => {
    expect(handoffDelayMs(true)).toBe(0);
  });
});

describe('the press', () => {
  const plain = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
  };

  it('holds a plain left click for the departure', () => {
    expect(isPlainPress(plain)).toBe(true);
    expect(handoffDelayMs(false)).toBe(WELCOME_HANDOFF_MS);
  });

  it('stays under the 400ms this product calls the point where motion reads as lag', () => {
    expect(WELCOME_HANDOFF_MS).toBeLessThan(400);
  });

  it.each([
    ['a middle click', { button: 1 }],
    ['a right click', { button: 2 }],
    ['⌘-click', { metaKey: true }],
    ['ctrl-click', { ctrlKey: true }],
    ['shift-click', { shiftKey: true }],
    ['alt-click', { altKey: true }],
    ['a press something upstream already claimed', { defaultPrevented: true }],
  ])('stands down for %s, so the link behaves like a link', (_name, override) => {
    expect(isPlainPress({ ...plain, ...override })).toBe(false);
  });
});
