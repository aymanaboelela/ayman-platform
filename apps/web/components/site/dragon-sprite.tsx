'use client';

import { useRef } from 'react';
import { gsap } from '@/lib/gsap';
import { useGsap } from '@/components/motion/use-gsap';
import { useMediaQuery } from '@/lib/use-media-query';
import { DRAGON_SHEET, DRAGON_VIDEO } from '@/lib/brand-assets';

/**
 * The dragon mascot, flying alongside the reader for the whole page.
 *
 * It is `position: fixed`, not parked in a section: the brief is that it comes
 * DOWN WITH YOU as you scroll. So its screen position is driven by the
 * document's scroll progress rather than by any one section's geometry — it
 * glides from the upper part of the viewport to the lower one over the length of
 * the page, drifting sideways on a sine so the path is a lazy S rather than a
 * straight drop.
 *
 * ## Frames
 *
 * The poses live in one sprite sheet (see `DRAGON_SHEET` in
 * `lib/brand-assets.ts`), and the wingbeat is a `background-position` step
 * through its cells — one request instead of four, and no chance of a
 * half-loaded cycle flashing a missing frame.
 *
 * The step is driven by tweening a plain number with a `steps()` ease rather
 * than a CSS `@keyframes` sequence: a 2D grid needs a row AND a column per
 * frame, which one CSS animation cannot express without hand-writing every
 * keyframe and rewriting them all if the grid changes.
 *
 * `yoyo` plays the cycle forward then backward. For a wingbeat that is what
 * reads as flapping; looping 1→2→3→4→1 snaps back to the top of the stroke.
 *
 * ## Why this REQUIRES a cut-out
 *
 * A page-level companion crosses every surface on the page — the dark hero, the
 * tinted bands, the white cards. Artwork painted on its own background can only
 * be keyed one way: `screen` erases dark backgrounds and `multiply` erases light
 * ones, and there is no third option that does both. A fixed element cannot pick
 * per section.
 *
 * So `hasAlpha: false` is not rendered at all here. A keyed sheet is fine parked
 * inside a section of known lightness; it cannot fly the whole page. Supplying a
 * transparent PNG and flipping the flag is the entire fix.
 *
 * ## Staying out of the way
 *
 * It is `pointer-events: none`, sits below the header, and fades out over the
 * footer — a mascot crossing the closing call to action is a mascot in the way.
 * It also hides itself on narrow viewports, where there is no column of empty
 * margin for it to fly down.
 */
export function DragonSprite() {
  const ref = useRef<HTMLDivElement>(null);
  // The mascot is hidden below 64rem (see `sections.css`), so nothing is
  // rendered there at all. Without this the markup still exists on a phone and
  // the browser downloads half a megabyte of video for an element it will never
  // paint. `false` before hydration keeps the server output and the first client
  // render identical.
  const wide = useMediaQuery('(min-width: 64rem)', false);

  // Video wins when it exists — see `DRAGON_VIDEO` for why it is the better
  // shape for this. The sheet is the fallback until a clip is encoded.
  const video = DRAGON_VIDEO;
  // See "Why this REQUIRES a cut-out" above.
  const sheet = DRAGON_SHEET?.hasAlpha ? DRAGON_SHEET : undefined;

  useGsap(
    ({ scope, reduced }) => {
      if (reduced) return;

      const mm = gsap.matchMedia();

      // ---- wingbeat ----
      // Sprite path only. The video path animates itself: the codec carries the
      // frames and the browser decodes them, so there is nothing to step.
      const cell = scope.querySelector<HTMLElement>('.dragon__cell');
      const flap =
        video || !sheet || !cell
          ? null
          : (() => {
              const state = { frame: 0 };
              const lastCol = Math.max(1, sheet.cols - 1);
              const lastRow = Math.max(1, sheet.rows - 1);
              return gsap.to(state, {
                frame: sheet.frames - 1,
                duration: (sheet.frames - 1) / sheet.fps,
                // One step per TRANSITION: n frames have n-1 gaps between them.
                ease: `steps(${sheet.frames - 1})`,
                repeat: -1,
                yoyo: true,
                onUpdate: () => {
                  const i = Math.round(state.frame);
                  const col = i % sheet.cols;
                  const row = Math.floor(i / sheet.cols);
                  cell.style.backgroundPosition =
                    `${(col / lastCol) * 100}% ${(row / lastRow) * 100}%`;
                },
              });
            })();

      // ---- flight path: only where there is margin to fly down ----
      mm.add('(min-width: 64rem)', () => {
        // A long, soft `scrub` is what makes the descent feel like gliding
        // rather than like a value bound to the scrollbar — the dragon keeps
        // moving for a beat after the wheel stops, which is how something with
        // mass behaves.
        const flight = gsap.timeline({
          scrollTrigger: {
            trigger: document.documentElement,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 1.6,
          },
        });

        flight
          .fromTo(scope, { yPercent: -8 }, { yPercent: 62, ease: 'none' }, 0)
          // Two crossings of the sine give one lazy S over the page's length.
          .fromTo(
            scope,
            { xPercent: 0 },
            { xPercent: 34, ease: 'sine.inOut', repeat: 1, yoyo: true },
            0,
          )
          // Banks into the turns, so the direction change looks flown rather
          // than slid.
          .fromTo(
            scope,
            { rotate: -4 },
            { rotate: 5, ease: 'sine.inOut', repeat: 1, yoyo: true },
            0,
          );

        // ---- face the direction of travel ----
        //
        // The artwork faces one way; flipping it horizontally when the drift
        // reverses is what makes the dragon look like it TURNS at the top of
        // each S-curve rather than sliding backwards through half the page.
        //
        // Driven off the observed `xPercent` rather than off the tween's own
        // progress: the flight is scrubbed, so the visitor can scroll backwards
        // and the direction has to follow them.
        //
        // The dead zone matters. At the top of the sine the frame-to-frame
        // delta passes through zero, and a bare `delta > 0` test flickers the
        // flip on and off for several frames. Only a move of real size counts.
        const flipTarget = cell ?? scope;
        let lastX = gsap.getProperty(scope, 'xPercent') as number;
        let facing = 1;
        const DEAD_ZONE = 0.35;

        const watchDirection = () => {
          const x = gsap.getProperty(scope, 'xPercent') as number;
          const delta = x - lastX;
          if (Math.abs(delta) < DEAD_ZONE) return;
          lastX = x;

          const next = delta > 0 ? -1 : 1;
          if (next === facing) return;
          facing = next;

          // Scaled on the INNER element: `scope` already carries the flight's
          // x/y/rotation, and adding a sign flip there would mirror the whole
          // path as well as the sprite.
          gsap.to(flipTarget, { scaleX: facing, duration: 0.45, ease: 'power2.inOut' });
        };

        gsap.ticker.add(watchDirection);

        // Out of the way of the closing CTA and the footer.
        //
        // ⚠️ An ELEMENT, not the selector string `'.site-footer'`. This runs
        // inside a `gsap.context()` scoped to the dragon (see `use-gsap.ts`),
        // and a context resolves selector strings WITHIN its scope — so the
        // string form looked for a footer inside the dragon, found nothing, and
        // left the tween pinned at its end state: an invisible dragon on every
        // page. Anything outside the scope has to be passed by reference.
        const footer = document.querySelector('.site-footer');
        const fade = footer
          ? gsap.to(scope, {
              opacity: 0,
              ease: 'none',
              scrollTrigger: {
                trigger: footer,
                start: 'top 85%',
                end: 'top 40%',
                scrub: true,
                invalidateOnRefresh: true,
              },
            })
          : null;

        return () => {
          gsap.ticker.remove(watchDirection);
          gsap.set(flipTarget, { scaleX: 1 });
          fade?.scrollTrigger?.kill();
          fade?.kill();
          flight.scrollTrigger?.kill();
          flight.kill();
          scope.style.opacity = '';
        };
      });

      return () => {
        flap?.kill();
        mm.revert();
      };
    },
    ref,
    // `wide` is a real dependency, not decoration: the element does not exist
    // until it flips true after hydration, so with an empty list the animation
    // would set up against a null ref and never run.
    [wide],
  );

  // Nothing registered, or too narrow to fly: render nothing rather than an
  // empty box.
  if (!wide || (!video && !sheet)) return null;

  return (
    <div className="dragon" ref={ref} aria-hidden="true">
      {video ? (
        /*
          `muted` is not decoration: without it `autoPlay` is blocked outright
          on every browser. `playsInline` stops iOS hijacking it into the
          fullscreen player. `disablePictureInPicture` and `controls={false}`
          keep it a graphic rather than something a visitor can pause or scrub.

          WebM first — the browser takes the first source it can decode, and
          Safari (which cannot read VP9 alpha) falls through to the HEVC MOV.
        */
        <video
          className="dragon__cell"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          controls={false}
        >
          <source src={video.webm} type="video/webm" />
          <source src={video.mov} type="video/quicktime" />
        </video>
      ) : (
        <div
          className={`dragon__cell ${sheet!.hasAlpha ? '' : 'dragon__cell--keyed'}`}
          style={{
            backgroundImage: `url(${sheet!.src})`,
            // Scaled so ONE cell fills the element: a 2×2 grid draws the image
            // at 200% × 200% of the box.
            backgroundSize: `${sheet!.cols * 100}% ${sheet!.rows * 100}%`,
          }}
        />
      )}
    </div>
  );
}
