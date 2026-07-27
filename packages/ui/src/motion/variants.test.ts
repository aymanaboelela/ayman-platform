import { describe, expect, it } from 'vitest';
import { motion as motionTokens } from '../tokens/tokens';
import {
  EASE_IN_OUT,
  EASE_OUT,
  EASE_POP,
  SECONDS,
  fadeUp,
  heroLcpSafe,
  modal,
  popover,
  staggerChild,
  staggerParent,
} from './variants';

/** Everything Motion may legally animate here: transforms, opacity, the one
 *  sanctioned clip-path exception, and the transition/stagger metadata keys. */
const ALLOWED_KEYS = new Set([
  'opacity',
  'x',
  'y',
  'scale',
  'scaleX',
  'scaleY',
  'rotate',
  'clipPath',
  'transition',
  'transitionEnd',
]);

const ALL: Record<string, unknown> = { popover, modal, fadeUp, heroLcpSafe, staggerParent, staggerChild };

function states(set: unknown): Array<[string, Record<string, unknown>]> {
  const out: Array<[string, Record<string, unknown>]> = [];
  for (const [name, value] of Object.entries(set as Record<string, unknown>)) {
    if (value && typeof value === 'object') out.push([name, value as Record<string, unknown>]);
  }
  return out;
}

function durationOf(state: Record<string, unknown>): number | undefined {
  const t = state.transition as { duration?: number; staggerChildren?: number } | undefined;
  return t?.duration;
}

describe('motion variants', () => {
  it('uses exactly the durations the CSS tokens declare, in seconds', () => {
    expect(SECONDS.hover).toBeCloseTo(motionTokens.duration.hover / 1000, 6);
    expect(SECONDS.popover).toBeCloseTo(motionTokens.duration.popover / 1000, 6);
    expect(SECONDS.modal).toBeCloseTo(motionTokens.duration.modal / 1000, 6);
    expect(SECONDS.exit).toBeCloseTo(motionTokens.duration.exit / 1000, 6);
  });

  it('mirrors the CSS easing curves exactly', () => {
    expect(`cubic-bezier(${EASE_OUT.join(', ')})`).toBe(motionTokens.easing.out);
    expect(`cubic-bezier(${EASE_POP.join(', ')})`).toBe(motionTokens.easing.pop);
    expect(`cubic-bezier(${EASE_IN_OUT.join(', ')})`).toBe(motionTokens.easing.inOut);
  });

  it('caps every duration at 400ms', () => {
    for (const [setName, set] of Object.entries(ALL)) {
      for (const [stateName, state] of states(set)) {
        const d = durationOf(state);
        if (d === undefined) continue;
        expect(d, `${setName}.${stateName}`).toBeLessThanOrEqual(0.4);
      }
    }
  });

  it('makes every exit faster than its own entrance', () => {
    for (const [setName, set] of Object.entries(ALL)) {
      const record = set as Record<string, Record<string, unknown> | undefined>;
      const enter = record.animate ? durationOf(record.animate) : undefined;
      const leave = record.exit ? durationOf(record.exit) : undefined;
      if (enter === undefined || leave === undefined) continue;
      expect(leave, `${setName}.exit`).toBeLessThan(enter);
    }
  });

  it('never uses an ease-in curve on an exit', () => {
    // An ease-out shape accelerates immediately: y1 > x1. An ease-in curve
    // (y1 <= x1) on an exit is the classic mistake that makes UI feel sluggish.
    for (const [setName, set] of Object.entries(ALL)) {
      const record = set as Record<string, Record<string, unknown> | undefined>;
      if (!record.exit) continue;
      const t = record.exit.transition as { ease?: number[] } | undefined;
      expect(t?.ease, `${setName}.exit.transition.ease`).toBeDefined();
      const [x1, y1] = t!.ease!;
      expect(y1, `${setName}.exit`).toBeGreaterThan(x1);
    }
  });

  it('animates nothing that forces layout or paint', () => {
    for (const [setName, set] of Object.entries(ALL)) {
      for (const [stateName, state] of states(set)) {
        for (const key of Object.keys(state)) {
          expect(ALLOWED_KEYS.has(key), `${setName}.${stateName}.${key}`).toBe(true);
        }
      }
    }
  });

  it('never puts opacity in the hero entrance — Motion SSRs opacity:0 and tanks LCP', () => {
    expect(Object.keys(heroLcpSafe.initial)).not.toContain('opacity');
    expect(Object.keys(heroLcpSafe.animate)).not.toContain('opacity');
    expect(heroLcpSafe.exit).toBeUndefined();
  });

  it('starts popovers at scale(0.96) + opacity 0 and pops them over 200ms', () => {
    expect(popover.initial).toMatchObject({ opacity: 0, scale: 0.96 });
    expect(popover.animate).toMatchObject({ opacity: 1, scale: 1 });
    expect((popover.animate.transition as { ease: number[] }).ease).toEqual(EASE_POP);
    expect(durationOf(popover.animate)).toBeCloseTo(0.2, 6);
    expect(durationOf(popover.exit!)).toBeCloseTo(0.12, 6);
  });

  it('gives the stagger parent a child delay that keeps the whole run under 400ms', () => {
    const t = staggerParent.animate.transition as { staggerChildren: number };
    const childDuration = durationOf(staggerChild.animate) ?? 0;
    // 5 children is the most any orchestrated moment in this product uses.
    expect(t.staggerChildren * 4 + childDuration).toBeLessThanOrEqual(0.4);
  });
});
