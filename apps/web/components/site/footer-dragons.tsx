'use client';

import { useEffect, useRef } from 'react';
import { DRAGON_BLAZE } from '@/lib/brand-assets';
import { useMediaQuery } from '@/lib/use-media-query';

/**
 * Two dragons closing the page, one at each end of the oversized wordmark,
 * breathing fire across it.
 *
 * ## They cost nothing to add
 *
 * They play the SAME file the "choose your year" stage already downloaded, so
 * the browser serves both from cache and this section adds no bytes at all.
 * That is the whole reason the pair is built out of the existing clip rather
 * than a footer-specific one.
 *
 * ## Why they stay in step
 *
 * Two flames either side of a wordmark that churn out of phase read as two
 * videos, which is exactly what they must not look like. `<video>` elements
 * have independent clocks and drift, so the right-hand one is slaved to the
 * left: whenever the left loops back to the top, the right is set to match. One
 * assignment per loop, not per frame — that is enough to hold them together and
 * cheap enough to do from an event handler.
 *
 * The clip is a palindrome, so `loop` alone is seamless (see `DRAGON_BLAZE`).
 * The mirroring is CSS on the right-hand element.
 */
export function FooterDragons() {
  const ref = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLVideoElement>(null);
  const endRef = useRef<HTMLVideoElement>(null);

  const wide = useMediaQuery('(min-width: 64rem)', false);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)', true);
  const active = wide && !reducedMotion && Boolean(DRAGON_BLAZE);

  useEffect(() => {
    const root = ref.current;
    const left = startRef.current;
    const right = endRef.current;
    if (!active || !root || !left || !right) return;

    const resync = () => {
      right.currentTime = left.currentTime;
    };
    left.addEventListener('seeked', resync);

    // Paused until the footer is actually on screen. Two videos decoding at the
    // bottom of a page nobody has reached is work for nothing, and on a laptop
    // it is work that costs battery. `rootMargin` starts them just before they
    // arrive so the first frame is never a still.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void left.play().catch(() => {});
          void right.play().catch(() => {});
          resync();
        } else {
          left.pause();
          right.pause();
        }
      },
      { rootMargin: '100% 0px' },
    );
    observer.observe(root);

    return () => {
      observer.disconnect();
      left.removeEventListener('seeked', resync);
    };
  }, [active]);

  if (!active || !DRAGON_BLAZE) return null;

  return (
    <div className="footer-dragons" ref={ref} aria-hidden="true">
      <video
        className="footer-dragons__one"
        ref={startRef}
        width={DRAGON_BLAZE.width}
        height={DRAGON_BLAZE.height}
        muted
        playsInline
        loop
        // `metadata`, not `auto`: the stage above has already put this file in
        // cache by the time anyone reaches the footer, and on the pages that do
        // not carry the stage the footer is not worth a full download at load.
        preload="metadata"
      >
        <source src={DRAGON_BLAZE.webm} type="video/webm" />
        <source src={DRAGON_BLAZE.mov} type="video/quicktime" />
      </video>
      <video
        className="footer-dragons__one footer-dragons__one--flip"
        ref={endRef}
        width={DRAGON_BLAZE.width}
        height={DRAGON_BLAZE.height}
        muted
        playsInline
        loop
        preload="metadata"
      >
        <source src={DRAGON_BLAZE.webm} type="video/webm" />
        <source src={DRAGON_BLAZE.mov} type="video/quicktime" />
      </video>
    </div>
  );
}
