import { describe, expect, it } from 'vitest';
import { hiddenByKeyboard } from './use-keyboard-inset';

/**
 * The keyboard measurement, tested with the numbers real devices report.
 *
 * The reason this is a unit test on a pure function rather than an e2e test is
 * that no automated browser can open a real on-screen keyboard — Playwright
 * included. The behaviour that matters here is a four-number arithmetic
 * decision, so the honest way to lock it is to feed it the four numbers.
 *
 * The device figures below are the layout used to diagnose the bug: a 390×844
 * phone, where the composer sat at y=668–735 and the keyboard covered
 * everything below ~y=508.
 */
describe('hiddenByKeyboard', () => {
  const PHONE = 844;

  it('reports nothing hidden when no keyboard is open', () => {
    expect(
      hiddenByKeyboard({ innerHeight: PHONE, height: PHONE, offsetTop: 0, scale: 1 }),
    ).toBe(0);
  });

  /*
   * iOS Safari: the keyboard OVERLAYS, so the layout viewport never moves and
   * only `visualViewport.height` shrinks. This is the case the whole file
   * exists for — `interactive-widget` does nothing on this browser.
   */
  it('reports the keyboard height on a browser that overlays it', () => {
    expect(
      hiddenByKeyboard({ innerHeight: PHONE, height: 508, offsetTop: 0, scale: 1 }),
    ).toBe(336);
  });

  /*
   * ⚠️ THE DOUBLE-COUNT. On Chrome with `interactive-widget=resizes-content`
   * the layout viewport shrinks too, so `100dvh` has ALREADY moved the panel.
   * Returning a second 336px here would raise it twice and push its header off
   * the top of the screen — the exact symptom the fix is for, reintroduced on
   * the other platform.
   */
  it('reports nothing on a browser that resizes the layout viewport instead', () => {
    expect(
      hiddenByKeyboard({ innerHeight: 508, height: 508, offsetTop: 0, scale: 1 }),
    ).toBe(0);
  });

  /*
   * iOS also SCROLLS the visual viewport to bring the focused field into view,
   * which moves `offsetTop` without firing another `resize`. Ignoring it
   * over-reports by however far the page was pushed up.
   */
  it('subtracts how far the visual viewport has been scrolled up', () => {
    expect(
      hiddenByKeyboard({ innerHeight: PHONE, height: 508, offsetTop: 120, scale: 1 }),
    ).toBe(216);
  });

  /*
   * A collapsing URL bar produces a real but tiny difference, continuously,
   * while the student scrolls. Acting on it makes the panel twitch.
   */
  it('ignores the few pixels a collapsing URL bar reports', () => {
    expect(
      hiddenByKeyboard({ innerHeight: PHONE, height: PHONE - 38, offsetTop: 0, scale: 1 }),
    ).toBe(0);
  });

  it('acts once the hidden strip is unmistakably a keyboard', () => {
    expect(
      hiddenByKeyboard({ innerHeight: PHONE, height: PHONE - 41, offsetTop: 0, scale: 1 }),
    ).toBe(41);
  });

  /*
   * Pinch-zoom shrinks the visual viewport by exactly the same mechanism and
   * means the opposite thing: nothing is covering the panel, and moving it
   * would take it away from the finger.
   */
  it('does not treat pinch-zoom as a keyboard', () => {
    expect(
      hiddenByKeyboard({ innerHeight: PHONE, height: 400, offsetTop: 100, scale: 2.5 }),
    ).toBe(0);
  });

  /*
   * Some browsers report fractional heights on a scaled display. A CSS length
   * of `336.00000000000006px` is valid and works, but it turns every debug
   * readout into noise.
   */
  it('rounds to whole pixels', () => {
    expect(
      hiddenByKeyboard({ innerHeight: PHONE, height: 507.6, offsetTop: 0.2, scale: 1 }),
    ).toBe(336);
  });

  /*
   * A negative result is reachable — a browser can report a visual viewport
   * TALLER than the layout one mid-rotation. It must read as "nothing hidden",
   * never as a negative offset, which in CSS would push the panel DOWN off the
   * bottom of the screen.
   */
  it('never returns a negative inset', () => {
    expect(
      hiddenByKeyboard({ innerHeight: PHONE, height: PHONE + 60, offsetTop: 0, scale: 1 }),
    ).toBe(0);
  });
});
