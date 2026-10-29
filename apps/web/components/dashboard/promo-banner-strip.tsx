'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { promoBannersCopy } from '@ayman/contracts/copy/promo-banners';
import { formatCopy } from '@ayman/contracts/format';
import { mediaUrl } from '@ayman/ui/branding';
import type { ShownPromoBanner } from '@/lib/promo-banners';

const c = promoBannersCopy.student;

/** Long enough to read a line printed on the picture, short enough that a
 *  student who lingers on the dashboard sees the second one. */
const ADVANCE_MS = 6500;

/**
 * «البانرات الترويجية» on the student dashboard — the instructor's pictures,
 * one at a time, swiped or stepped through.
 *
 * ## Native scrolling, not a transform
 *
 * The track is an `overflow-x: auto` row with `scroll-snap`, so a phone swipes
 * it with the platform's own physics and momentum and a trackpad scrolls it
 * sideways — nothing here re-implements a gesture. The buttons and dots only
 * call `scrollBy` on that same row.
 *
 * `scrollBy` with the PHYSICAL distance between the slide and the track,
 * deliberately not `scrollIntoView`: that one also scrolls the PAGE when the
 * strip is half off-screen, and an auto-advance that yanks the dashboard
 * upward every six seconds is the worst thing this component could do. The
 * physical delta is also the one expression that is correct under RTL in
 * every engine without branching on `dir`.
 *
 * ## Auto-advance is polite
 *
 * Off under `prefers-reduced-motion`, paused while the pointer or keyboard
 * focus is inside the strip, and paused while the tab is hidden. One banner
 * gets no controls and no timer at all.
 *
 * ## A picture that fails to load is dropped
 *
 * The key is a library image the instructor can delete after the banner was
 * saved. A broken-image icon at the top of every student's home screen is
 * worse than one banner fewer.
 */
export function PromoBannerStrip({ banners }: { banners: readonly ShownPromoBanner[] }) {
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  const shown = banners.filter((banner) => !broken.has(banner.id));
  const count = shown.length;

  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const goTo = useCallback((index: number, smooth = true) => {
    const track = trackRef.current;
    const slide = track?.children[index] as HTMLElement | undefined;
    if (!track || !slide) return;
    const delta = slide.getBoundingClientRect().left - track.getBoundingClientRect().left;
    track.scrollBy({ left: delta, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  /* Which slide is in view, read off the scroll position rather than kept
     in step by the buttons — a swipe moves it too, and that must light the
     right dot. */
  useEffect(() => {
    const track = trackRef.current;
    if (!track || count < 2) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = track.getBoundingClientRect();
        const centre = box.left + box.width / 2;
        let best = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        Array.from(track.children).forEach((child, index) => {
          const rect = child.getBoundingClientRect();
          const distance = Math.abs(rect.left + rect.width / 2 - centre);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = index;
          }
        });
        setActive(best);
      });
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      track.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [count]);

  useEffect(() => {
    if (count < 2 || paused) return;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      goTo((active + 1) % count);
    }, ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [active, count, paused, goTo]);

  if (count === 0) return null;
  const multiple = count > 1;

  return (
    <section
      className="promo-strip"
      aria-label={c.region}
      aria-roledescription={multiple ? 'carousel' : undefined}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <div className="promo-strip__frame">
        <div ref={trackRef} className="promo-strip__track">
          {shown.map((banner, index) => (
            <div
              key={banner.id}
              className="promo-strip__slide"
              role={multiple ? 'group' : undefined}
              aria-roledescription={multiple ? 'slide' : undefined}
              aria-label={
                multiple ? formatCopy(c.position, { n: String(index + 1), total: String(count) }) : undefined
              }
            >
              <BannerFace
                banner={banner}
                eager={index === 0}
                onBroken={() => setBroken((previous) => new Set(previous).add(banner.id))}
              />
            </div>
          ))}
        </div>

        {multiple ? (
          <>
            {/* RTL: «اللي قبله» sits at the inline START (the right) and points
                right; «اللي بعده» at the inline end, pointing left — the
                direction the row actually moves in. */}
            <button
              type="button"
              className="promo-strip__arrow promo-strip__arrow--prev"
              aria-label={c.previous}
              onClick={() => goTo((active - 1 + count) % count)}
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="promo-strip__arrow promo-strip__arrow--next"
              aria-label={c.next}
              onClick={() => goTo((active + 1) % count)}
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>

      {multiple ? (
        <div className="promo-strip__dots">
          {shown.map((banner, index) => (
            <button
              key={banner.id}
              type="button"
              className="promo-strip__dot"
              data-active={index === active ? '' : undefined}
              aria-label={formatCopy(c.goTo, { n: String(index + 1) })}
              aria-current={index === active ? 'true' : undefined}
              onClick={() => goTo(index)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function BannerFace({
  banner,
  eager,
  onBroken,
}: {
  banner: ShownPromoBanner;
  eager: boolean;
  onBroken: () => void;
}) {
  const face = (
    <>
      {/* A raw <img>: media-origin uploads are not in next.config's
          `remotePatterns` — the same reason `MediaKeyField` and the course
          cards use one. The picture IS the content, so its alt is the title
          when there is one; without a title the link still needs a name,
          which the wrapper below supplies. */}
      <img
        src={mediaUrl(banner.imageKey)}
        alt={banner.title ?? ''}
        className="promo-strip__img"
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        onError={onBroken}
      />
      {banner.title ? (
        <span className="promo-strip__caption" aria-hidden="true">
          {banner.title}
        </span>
      ) : null}
    </>
  );

  if (banner.linkUrl && banner.linkKind === 'internal') {
    return (
      <Link href={banner.linkUrl} className="promo-strip__face promo-strip__face--link">
        {face}
      </Link>
    );
  }
  if (banner.linkUrl && banner.linkKind === 'external') {
    return (
      <a
        href={banner.linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="promo-strip__face promo-strip__face--link"
      >
        {face}
        <span className="sr-only">{c.opensOutside}</span>
      </a>
    );
  }
  return <div className="promo-strip__face">{face}</div>;
}
