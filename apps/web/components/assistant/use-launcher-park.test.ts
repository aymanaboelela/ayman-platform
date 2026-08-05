import { describe, expect, it } from 'vitest';
import { parkLift } from './use-launcher-park';

/**
 * The arithmetic that decides where the launcher comes to rest.
 *
 * The DOM plumbing around it — the observer, the frame throttle, the custom
 * property — is exercised end to end by `e2e/assistant-launcher.e2e.ts` in a
 * real browser at a real scroll position, which is the only place it can be
 * tested honestly. This covers the part that has an answer independent of any
 * browser, including the two edges that produce a button nobody can press.
 */
describe('parkLift', () => {
  const VIEWPORT = 800;

  it('does not lift while the marked element is still below the fold', () => {
    expect(parkLift(VIEWPORT, VIEWPORT)).toBe(0);
    expect(parkLift(VIEWPORT, VIEWPORT + 500)).toBe(0);
  });

  it('lifts by exactly how much of the viewport the element has taken', () => {
    // 130px of the sign-off is on screen, so the launcher is 130px higher
    // than it would otherwise be — which keeps its gap above it identical to
    // the gap it had above the viewport floor.
    expect(parkLift(VIEWPORT, VIEWPORT - 130)).toBe(130);
  });

  it('tracks the scroll one-to-one, which is what makes it read as glued', () => {
    const a = parkLift(VIEWPORT, VIEWPORT - 40);
    const b = parkLift(VIEWPORT, VIEWPORT - 90);
    expect(b - a).toBe(50);
  });

  it('refuses to walk the launcher off the top of the screen', () => {
    // A marked element with something very tall under it: the raw answer is
    // 780 of an 800px viewport, which would leave the launcher above the
    // header with the page's own content scrolling behind it.
    expect(parkLift(VIEWPORT, 20)).toBe(VIEWPORT * 0.4);
    expect(parkLift(VIEWPORT, -4000)).toBe(VIEWPORT * 0.4);
  });

  it('stays at rest when a measurement is not a number', () => {
    // `getBoundingClientRect()` on a detached node during a navigation, and
    // `innerHeight` read before layout in a prerender harness. Neither should
    // move the button.
    expect(parkLift(VIEWPORT, Number.NaN)).toBe(0);
    expect(parkLift(Number.NaN, 100)).toBe(0);
    expect(parkLift(VIEWPORT, Number.POSITIVE_INFINITY)).toBe(0);
  });
});
