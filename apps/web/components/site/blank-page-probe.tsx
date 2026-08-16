'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Catches the white page, and only the white page.
 *
 * ## Why this exists instead of a fix
 *
 * Readers report that going into a page from the landing page and coming back
 * leaves a blank white screen, and that RESIZING THE WINDOW repairs it. That
 * last detail is the whole shape of the bug: the document is laid out — full
 * height, full scrollbar, every word present in `innerText` — and simply not
 * painted, until something forces the browser to re-do its work.
 *
 * Four candidate causes were tested against production and eliminated by
 * measurement, not opinion: a tab holding a pre-deploy build (Next recovers),
 * reveal animations leaving content at `opacity: 0` (nothing was hidden), stale
 * `ScrollTrigger` measurements (`pin-spacer` height and offset identical before
 * and after a manual refresh), and a compositing failure that only real GPU
 * rasterisation shows (reproduced headed, with ANGLE, and the page was fine).
 * It does not reproduce from an automated browser at all — which is itself the
 * finding, and the reason the next move is instrumentation rather than a guess.
 *
 * So this does not pretend to know the cause. It records the state at the
 * moment of failure, on the device where it actually happens, and files it as
 * one grouped row on `/admin/errors`.
 *
 * ## Why it also nudges the page
 *
 * Because the alternative is a student looking at nothing. When the check
 * fires — and its conditions are deliberately near-impossible to meet by
 * accident — it dispatches a `resize`, which is exactly the gesture readers
 * found by hand. Every layout observer on the page (`ScrollTrigger`, Lenis,
 * anything watching the viewport) recomputes, and the frame repaints.
 *
 * That is a stopgap and is written down as one. It is safe because it is the
 * same event the browser fires whenever a window edge moves, and it runs at
 * most ONCE, only after a client-side navigation, and only when the page is
 * simultaneously full of text and painting none of it. If the report shows the
 * cause, this whole file should be deleted and the cause fixed.
 *
 * ## Why the conditions are so narrow
 *
 * A false positive costs more than the bug: it would file noise on the page an
 * instructor reads to find real failures, and it would fire a reflow on a
 * healthy page. So all of these must hold at once:
 *
 *   · the tab is visible (a backgrounded tab paints nothing, correctly);
 *   · the document is taller than the viewport and holds real text;
 *   · and FIVE points spread down the middle of the viewport all resolve to
 *     nothing but the root, the body, or a full-screen decorative layer.
 *
 * The last one is the load-bearing test. On any page that is painting, at
 * least one of five points down the centre lands on a real element.
 */

/** Once per document, not once per navigation — see the note on noise. */
let alreadyHandled = false;

/** Long enough for the route transition, scroll restoration and the first
 *  animation frames to be over; short enough that a reader who is about to
 *  reload anyway is beaten to it. */
const SETTLE_MS = 900;

const SAMPLE_POINTS = [0.15, 0.32, 0.5, 0.68, 0.85];

interface BlankVerdict {
  blank: boolean;
  detail: Record<string, unknown>;
}

export interface BlankSample {
  /** A backgrounded tab paints nothing, and is right not to. */
  visible: boolean;
  textLength: number;
  scrollHeight: number;
  viewportHeight: number;
  /** `tag.class` for each sample point, or the string `null` for a miss. */
  hits: readonly string[];
}

/**
 * `html`, `body` and `main` are containers — landing on one of them means
 * nothing was painted at that point. A `canvas` counts the same way on purpose:
 * the two full-viewport WebGL layers on this surface are decorative, and one of
 * them covering a page that renders nothing is a shape this bug could
 * plausibly take.
 */
function isBackdrop(hit: string): boolean {
  return hit === 'null' || /^(html|body|main)(\.|$)/.test(hit) || /^canvas(\.|$)/.test(hit);
}

/**
 * The decision, separated from the DOM so it can be tested.
 *
 * Every clause is a guard against a FALSE positive, which is the expensive
 * direction: a wrong verdict files noise on the page an instructor reads to
 * find real failures, and fires a reflow on a healthy page. A short page, a
 * hidden tab, a page still filling in, or a single sample point landing on a
 * real element is enough to say nothing.
 */
export function looksBlank(sample: BlankSample): boolean {
  if (!sample.visible) return false;
  if (sample.textLength <= 200) return false;
  if (sample.scrollHeight <= sample.viewportHeight + 200) return false;
  if (sample.hits.length === 0) return false;
  return sample.hits.every(isBackdrop);
}

function inspect(): BlankVerdict {
  const doc = document.documentElement;
  const text = (document.body.innerText || '').trim();

  const hits = SAMPLE_POINTS.map((fraction) => {
    const element = document.elementFromPoint(
      Math.round(window.innerWidth / 2),
      Math.round(window.innerHeight * fraction),
    );
    if (!element) return 'null';
    const tag = element.tagName.toLowerCase();
    const cls = (element.className || '').toString().trim().slice(0, 40);
    return cls ? `${tag}.${cls}` : tag;
  });

  const main = document.querySelector('main');
  const mainStyle = main ? getComputedStyle(main) : null;
  const mainBox = main?.getBoundingClientRect();

  const blank = looksBlank({
    visible: document.visibilityState === 'visible',
    textLength: text.length,
    scrollHeight: doc.scrollHeight,
    viewportHeight: window.innerHeight,
    hits,
  });

  return {
    blank,
    detail: {
      hits,
      textLength: text.length,
      scrollY: Math.round(window.scrollY),
      scrollHeight: doc.scrollHeight,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      dpr: window.devicePixelRatio,
      visibility: document.visibilityState,
      main: main
        ? {
            top: Math.round(mainBox?.top ?? 0),
            height: Math.round(mainBox?.height ?? 0),
            opacity: mainStyle?.opacity,
            visibility: mainStyle?.visibility,
            transform: mainStyle?.transform?.slice(0, 60),
            contentVisibility: mainStyle?.contentVisibility,
          }
        : 'no <main>',
      // A lost WebGL context on a full-viewport canvas is one of the few things
      // that can blank a page without touching layout, so it is worth the four
      // lines it takes to rule in or out.
      canvases: [...document.querySelectorAll('canvas')].map((canvas) => {
        let lost: boolean | string = 'unknown';
        try {
          const gl =
            (canvas.getContext('webgl2') as WebGLRenderingContext | null) ??
            (canvas.getContext('webgl') as WebGLRenderingContext | null);
          lost = gl ? gl.isContextLost() : 'no-context';
        } catch {
          lost = 'threw';
        }
        const box = canvas.getBoundingClientRect();
        return { w: Math.round(box.width), h: Math.round(box.height), lost };
      }),
      pinSpacers: [...document.querySelectorAll('.pin-spacer')].map((spacer) => ({
        height: (spacer as HTMLElement).style.height || null,
        childTop: Math.round(spacer.firstElementChild?.getBoundingClientRect().top ?? 0),
      })),
    },
  };
}

export function BlankPageProbe() {
  const pathname = usePathname();
  const firstRender = useRef(true);

  useEffect(() => {
    // A fresh document load cannot exhibit this — the reported failure needs a
    // navigation to have happened over a DOM that was already there.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (alreadyHandled) return;

    const timer = window.setTimeout(() => {
      let verdict: BlankVerdict;
      try {
        verdict = inspect();
      } catch {
        // A probe that breaks the page it is watching is worse than the bug.
        return;
      }
      if (!verdict.blank) return;

      alreadyHandled = true;

      // Fire-and-forget, `keepalive` so it survives the reader giving up and
      // closing the tab — the most valuable report there is. Same shape and the
      // same public route as `report-error.ts`; see that file for why this
      // endpoint takes no CSRF header.
      void fetch('/api/errors', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          kind: 'client',
          route: window.location.pathname,
          message: 'blank page after client-side navigation',
          stack: JSON.stringify(verdict.detail).slice(0, 4000),
        }),
      }).catch(() => {
        // Reporting failed. The reader is already looking at a blank screen;
        // there is nothing useful to add to it.
      });

      // The gesture readers found by hand. Everything that measures the
      // viewport re-measures, and the frame repaints.
      window.dispatchEvent(new Event('resize'));
    }, SETTLE_MS);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  return null;
}
