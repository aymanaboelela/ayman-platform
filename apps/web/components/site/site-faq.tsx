'use client';

import { useRef } from 'react';
import { copy } from '@ayman/contracts';
import { gsap } from '@/lib/gsap';
import { useGsap } from '@/components/motion/use-gsap';

const c = copy.landing;

const ROWS = [
  [c.faq1Q, c.faq1A],
  [c.faq6Q, c.faq6A],
  [c.faq2Q, c.faq2A],
  [c.faq4Q, c.faq4A],
  [c.faq7Q, c.faq7A],
  [c.faq3Q, c.faq3A],
  [c.faq5Q, c.faq5A],
] as const;

const OPEN_DURATION = 0.42;
const CLOSE_DURATION = 0.3;

/**
 * The FAQ, built on `<details>` and progressively enhanced with GSAP.
 *
 * `<details>` is the right element: correct semantics, keyboard handling and
 * find-in-page for free, and it works with JavaScript disabled — which matters
 * more here than anywhere else on the page, because the FAQ is the content
 * search engines and no-JS readers most need.
 *
 * The catch is that `<details>` toggles instantly and cannot be transitioned:
 * the browser flips `display` on the content, so there is no height to animate
 * between. The enhancement below takes over the toggle entirely:
 *
 * - **Opening** sets `open` first (so the panel has a measurable height), then
 *   tweens from 0 to `auto` and slides the answer up into place.
 * - **Closing** cancels the native toggle with `preventDefault`, tweens the
 *   height down, and only sets `open = false` once the tween lands — otherwise
 *   the content vanishes on frame one and there is nothing left to animate.
 * - **Exclusivity** is handled here rather than by the `name` attribute. The
 *   native behaviour closes siblings instantly and silently, which under an
 *   animated open reads as a glitch; closing them through the same tween keeps
 *   the two halves of the swap in sync.
 *
 * Under reduced motion `useGsap` returns early and every one of these listeners
 * is simply never attached, leaving the plain native accordion. That is the
 * correct fallback, not a degraded one.
 */
export function SiteFaq() {
  const ref = useRef<HTMLDivElement>(null);

  useGsap(
    ({ scope, reduced }) => {
      if (reduced) return;

      const items = Array.from(scope.querySelectorAll<HTMLDetailsElement>('.faq__item'));

      const panelOf = (item: HTMLDetailsElement) =>
        item.querySelector<HTMLElement>('.faq__panel-inner');

      const open = (item: HTMLDetailsElement) => {
        const panel = panelOf(item);
        if (!panel) return;
        item.open = true;
        item.dataset.animating = 'open';

        gsap.killTweensOf(panel);
        gsap.fromTo(
          panel,
          { height: 0, opacity: 0 },
          {
            height: 'auto',
            opacity: 1,
            duration: OPEN_DURATION,
            ease: 'power2.out',
            onComplete: () => {
              // Back to `auto` so the row still reflows correctly if the text
              // rewraps on resize — a pinned pixel height would clip it.
              gsap.set(panel, { height: 'auto' });
              delete item.dataset.animating;
            },
          },
        );

        gsap.fromTo(
          panel.firstElementChild,
          { y: -10, opacity: 0 },
          { y: 0, opacity: 1, duration: OPEN_DURATION, ease: 'power2.out', delay: 0.06 },
        );
      };

      const close = (item: HTMLDetailsElement) => {
        const panel = panelOf(item);
        if (!panel || !item.open) return;
        item.dataset.animating = 'close';

        gsap.killTweensOf(panel);
        gsap.to(panel, {
          height: 0,
          opacity: 0,
          duration: CLOSE_DURATION,
          ease: 'power2.inOut',
          onComplete: () => {
            item.open = false;
            delete item.dataset.animating;
          },
        });
      };

      const cleanups = items.map((item) => {
        const summary = item.querySelector('summary');
        if (!summary) return () => {};

        const onClick = (event: MouseEvent) => {
          // Always cancel the native toggle: the browser would flip `display`
          // on the panel and leave nothing to tween.
          event.preventDefault();

          if (item.open) {
            close(item);
            return;
          }

          for (const sibling of items) if (sibling !== item) close(sibling);
          open(item);
        };

        summary.addEventListener('click', onClick);
        return () => summary.removeEventListener('click', onClick);
      });

      return () => cleanups.forEach((off) => off());
    },
    ref,
    [],
  );

  return (
    <section className="site-section" id="faq">
      <div className="site-shell">
        <h2 className="site-h2" style={{ textAlign: 'center' }}>
          {c.faqTitle}
        </h2>

        <div className="faq__panel" ref={ref}>
          {ROWS.map(([question, answer], i) => (
            /* `name` is still set so the no-JS accordion stays exclusive; the
               enhanced path calls `preventDefault` before the browser ever acts
               on it. */
            <details className="faq__item" key={question} open={i === 0} name="site-faq">
              <summary className="faq__q">
                <span>{question}</span>
                <span className="faq__mark" aria-hidden="true" />
              </summary>
              {/* Two elements, not one: the outer is the height the tween
                  drives, the inner keeps the padding out of that measurement so
                  a collapsed row is genuinely zero-height. */}
              <div className="faq__panel-inner">
                <p className="faq__a">{answer}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
