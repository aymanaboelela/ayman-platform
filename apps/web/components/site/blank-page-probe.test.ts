import { describe, expect, it } from 'vitest';
import { looksBlank, type BlankSample } from './blank-page-probe';

/**
 * These are all false-positive tests, and that is deliberate.
 *
 * A wrong "blank" verdict costs more than the bug it hunts: it files noise on
 * `/admin/errors` — the page an instructor reads to find real failures — and
 * fires a reflow on a page that was fine. So the interesting cases are the ones
 * that must stay SILENT, and there is exactly one that must not.
 */
const healthy: BlankSample = {
  visible: true,
  textLength: 3800,
  scrollHeight: 8800,
  viewportHeight: 900,
  hits: ['div.track__bar', 'p.track__tag', 'section.site-section', 'h2.title', 'a.site-btn'],
};

/** Laid out, full of words, painting none of them — the reported failure. */
const blank: BlankSample = {
  ...healthy,
  hits: ['html', 'body', 'main', 'null', 'canvas'],
};

describe('looksBlank', () => {
  it('fires on a full-height page of text that paints nothing', () => {
    expect(looksBlank(blank)).toBe(true);
  });

  it('stays silent on a healthy page', () => {
    expect(looksBlank(healthy)).toBe(false);
  });

  it('stays silent when a SINGLE sample point lands on real content', () => {
    // The load-bearing guard. On any page that is painting at all, at least one
    // of five points down the centre hits something — so one hit is enough to
    // withhold the verdict entirely.
    expect(looksBlank({ ...blank, hits: ['html', 'body', 'p.lead', 'null', 'canvas'] })).toBe(false);
  });

  it('stays silent in a backgrounded tab', () => {
    // A hidden tab paints nothing and is right not to; reporting it would file
    // a row for every reader who opens a link in a new tab.
    expect(looksBlank({ ...blank, visible: false })).toBe(false);
  });

  it('stays silent on a page with almost no text', () => {
    // A genuinely near-empty route — an error screen, a redirect stub — is not
    // this bug, and its emptiness is the truth rather than a paint failure.
    expect(looksBlank({ ...blank, textLength: 120 })).toBe(false);
  });

  it('stays silent on a page shorter than the viewport', () => {
    // The reported symptom always carries a full scrollbar. A short page that
    // legitimately ends above the fold has nothing to repaint.
    expect(looksBlank({ ...blank, scrollHeight: 950 })).toBe(false);
  });

  it('stays silent when the page is only just taller than the viewport', () => {
    // 200px of slack, so a page that merely overflows by a hair is not treated
    // as a full-height document.
    expect(looksBlank({ ...blank, scrollHeight: 1050, viewportHeight: 900 })).toBe(false);
  });

  it('stays silent when nothing was sampled at all', () => {
    // An empty hit list would otherwise satisfy `every()` vacuously and report
    // a blank page on the strength of no evidence whatsoever.
    expect(looksBlank({ ...blank, hits: [] })).toBe(false);
  });

  it('treats a full-viewport canvas as a backdrop, not as content', () => {
    // One of the shapes this bug could take is a decorative WebGL layer left
    // covering the page. Counting it as "something is painted" would hide
    // exactly the case worth catching.
    expect(looksBlank({ ...blank, hits: ['canvas', 'canvas', 'canvas', 'canvas', 'canvas'] })).toBe(
      true,
    );
  });

  it('is not fooled by a class name that merely starts with a container tag', () => {
    // `mainstage` is not `main`. The anchored pattern requires a dot or the end
    // of the string after the tag name.
    expect(looksBlank({ ...blank, hits: ['mainstage.hero', 'body', 'main', 'null', 'canvas'] })).toBe(
      false,
    );
  });
});
