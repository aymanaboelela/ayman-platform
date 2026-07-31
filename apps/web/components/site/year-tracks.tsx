'use client';

import { useRef } from 'react';
import { copy } from '@ayman/contracts';
import { gsap, ScrollTrigger } from '@/lib/gsap';
import { useGsap } from '@/components/motion/use-gsap';
import { useMediaQuery } from '@/lib/use-media-query';
import { MediaSlot } from '@/components/site/media-slot';
import { ElectricCard } from '@/components/site/electric-card';
import { TrackCardView, type TrackCard } from '@/components/site/track-card';
import { TracksDragon, type DragonStage } from '@/components/site/tracks-dragon';
import { DRAGON_IGNITES_AT, DRAGON_RIDE } from '@/lib/brand-assets';

const c = copy.landing;

/**
 * The heart of the flame column, as a fraction of the dragon's frame — the
 * point the three cards are thrown out of.
 *
 * Measured, not chosen: the luma-weighted centroid of the hot pixels in a blaze
 * frame (opaque, red-dominant, r > b + 40) sits at x 0.478, y 0.867. That is
 * the whole fire including the wide bed it spreads into along the bottom, so
 * the burst is lifted to the body of the COLUMN instead — a card thrown from
 * the bed looks dropped from under the stage rather than blown out of the fire.
 */
const FLAME_HEART = { x: 0.49, y: 0.74 } as const;

/**
 * The electric border draws its geometry from a number rather than reading the
 * DOM, so this has to track `--r-lg` — the radius `.track` uses — in pixels.
 * If that token changes, change this.
 */
const TRACK_RADIUS = 12;

/** Ramp steps 400 and 600 as literals: the effect's `oklch(from …)` relative
 *  colour syntax needs a concrete colour, not a `var()` reference. */
const ACTIVE_BORDER = '#F08A2E';
const FLANK_BORDER = '#D25C10';

const ESSENTIALS: TrackCard = {
  href: '/essentials',
  file: 'essentials/core.js',
  branch: 'warm-up',
  caret: 'Ln 6, Col 18',
  tag: c.trackEssentialsTag,
  title: c.trackEssentialsTitle,
  body: c.trackEssentialsBody,
  cta: c.trackEssentialsCta,
  code: [
    [['k', 'const'], ['p', ' '], ['v', 'basics'], ['p', ' = [']],
    [['p', '  '], ['s', '"variable"'], ['p', ',']],
    [['p', '  '], ['s', '"function"'], ['p', ',']],
    [['p', '  '], ['s', '"condition"']],
    [['p', '];']],
    [['f', 'startWith'], ['p', '('], ['v', 'basics'], ['p', ');']],
  ],
};

const YEAR_1: TrackCard = {
  href: '/years/1',
  file: 'grade-01/basics.js',
  branch: 'ready',
  caret: 'Ln 4, Col 12',
  tag: c.trackYear1Tag,
  title: c.trackYear1Title,
  body: c.trackYear1Body,
  cta: c.trackYear1Cta,
  code: [
    [['c', '// أول سطر كود ليك']],
    [['k', 'let'], ['p', ' '], ['v', 'student'], ['p', ' = '], ['s', '"أولى ثانوي"'], ['p', ';']],
    [['k', 'if'], ['p', ' ('], ['v', 'ready'], ['p', ') {']],
    [['p', '  '], ['f', 'startLearning'], ['p', '('], ['s', '"grade-1"'], ['p', ');']],
    [['p', '}']],
  ],
};

const YEAR_2: TrackCard = {
  href: '/years/2',
  file: 'grade-02/functions.js',
  branch: 'build passing',
  caret: 'Ln 5, Col 2',
  tag: c.trackYear2Tag,
  title: c.trackYear2Title,
  body: c.trackYear2Body,
  cta: c.trackYear2Cta,
  active: true,
  progress: 5,
  code: [
    [['c', '// المستوى التالي']],
    [['k', 'function'], ['p', ' '], ['f', 'levelUp'], ['p', '('], ['a', 'student'], ['p', ') {']],
    [['p', '  '], ['a', 'student'], ['p', '.'], ['a', 'skills'], ['p', '.'], ['f', 'push'], ['p', '('], ['s', '"logic"'], ['p', ');']],
    [['p', '  '], ['k', 'return'], ['p', ' '], ['a', 'student'], ['p', '.'], ['a', 'grade'], ['p', ' + '], ['n', '1'], ['p', ';']],
    [['p', '}']],
  ],
};

/**
 * Scattered background glyphs. Positions are a fixed table, not
 * `Math.random()` — random values produce different markup on the server and
 * the client, which React reports as a hydration mismatch and then discards
 * the server HTML for.
 *
 * `[left%, top%, rem, opacity, driftSeconds, glyph]`
 */
const GLYPHS: readonly [number, number, number, number, number, string][] = [
  [8, 14, 1.5, 0.08, 11, '{'],
  [16, 42, 1.25, 0.06, 14, 'λ'],
  [6, 62, 1.875, 0.07, 9, '['],
  [22, 78, 1.125, 0.05, 13, '#'],
  [12, 28, 1, 0.06, 16, ';'],
  [30, 8, 1.375, 0.05, 12, '0'],
  [38, 88, 1.125, 0.06, 15, ')'],
  [46, 20, 1, 0.05, 10, '='],
  [54, 70, 1.5, 0.06, 13, '}'],
  [62, 34, 1.125, 0.05, 17, '/'],
  [70, 82, 1.25, 0.06, 11, '<'],
  [78, 12, 1.75, 0.07, 14, '&'],
  [84, 56, 1.125, 0.05, 12, '1'],
  [90, 30, 1.375, 0.06, 16, '>'],
  [94, 74, 1, 0.05, 10, ']'],
  [26, 54, 1.125, 0.04, 18, '?'],
];

/**
 * "Choose your year" — three editor-window cards staged over a lit floor.
 *
 * Below 64rem the staging is impossible (three absolutely-positioned cards at
 * 27vw overlap), so `sections.css` unsets the positioning and they become a
 * plain column; the cut-out and floor spot are hidden there rather than
 * scaled down, because a 3:4 cut-out behind a stacked column has nothing to
 * stand behind.
 */
export function YearTracks() {
  const ref = useRef<HTMLElement>(null);
  const stageRef = useRef<DragonStage | null>(null);
  // A real dependency for the `useGsap` call below, not decoration: TracksDragon
  // only renders its clips once this flips true, so the effect has to re-run
  // when it does — otherwise a resize crossing the breakpoint would leave the
  // effect holding a stale `stageRef.current` captured from before TracksDragon
  // mounted.
  const wide = useMediaQuery('(min-width: 64rem)', false);

  useGsap(
    ({ scope, reduced }) => {
      // Reduced motion: return BEFORE the glyph loop too, not just before the
      // dragon/fire/cards below — glyph drift is continuous decorative motion,
      // exactly the category `use-gsap.ts` says must respect `reduced`. The
      // cards still render at their resting (final, visible) CSS state because
      // nothing below ever calls gsap.from()/set() on them when this returns
      // early, and the dragon is simply never played.
      if (reduced) return;

      // Each glyph drifts on its own clock. `yoyo` rather than `repeat: -1`
      // with a wrap: the glyphs must never appear to travel, only to breathe.
      for (const glyph of scope.querySelectorAll<HTMLElement>('.tracks__glyph')) {
        const seconds = Number(glyph.dataset.drift ?? 12);
        gsap.to(glyph, {
          y: '+=18',
          x: '+=8',
          duration: seconds,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        });
      }

      // The SAME condition `TracksDragon` gates its clips on, evaluated
      // independently rather than by testing `stageRef.current`. React runs a
      // child's effects before its parent's, but this hook is a LAYOUT effect
      // and the child's is a passive one — so the ref is still empty at this
      // point on the commit that mounts the videos, and reading it here would
      // put a wide viewport permanently on the fallback path.
      if (!wide || !DRAGON_RIDE) {
        // Narrow viewport — TracksDragon renders nothing, so there is no fire
        // to hang the bloom on. Fall back to the plain stagger.
        gsap.from(scope.querySelectorAll('[data-track-card]'), {
          y: 40,
          opacity: 0,
          duration: 0.9,
          stagger: 0.12,
          ease: 'power3.out',
          scrollTrigger: { trigger: scope, start: 'top 70%' },
        });
        return;
      }

      // Cards ordered active-first so the stagger blooms OUTWARD from where
      // the fire actually is, not in DOM order (start, end, active).
      const activeCard = scope.querySelector<HTMLElement>('[data-track-card].tracks__card--active');
      const startCard = scope.querySelector<HTMLElement>('[data-track-card].tracks__card--start');
      const endCard = scope.querySelector<HTMLElement>('[data-track-card].tracks__card--end');
      const cardsInBloomOrder = [activeCard, startCard, endCard].filter(
        (el): el is HTMLElement => el !== null,
      );

      const dragon = scope.querySelector<HTMLElement>('.tracks__dragon');
      const spot = scope.querySelector<HTMLElement>('.tracks__spot');
      // ⚠️ Every trigger below is anchored to the STAGE, not to the section.
      // `.tracks` now opens with a tall band of empty sky for the dragon to fly
      // down (see its `padding-top`), so the section's own top edge is most of a
      // screen above anything the reader is meant to be looking at — anchoring
      // there would start the turn while the cards were still below the fold.
      const stage = scope.querySelector<HTMLElement>('.tracks__stage') ?? scope;
      /** The light the flame throws — flared at ignition. */
      const glow = scope.querySelector<HTMLElement>('.tracks__dragon-glow');

      /** Per card, the offset from where it rests back to the heart of the flame. */
      const burst = new Map<HTMLElement, { x: number; y: number }>();

      const measureBurst = () => {
        if (!dragon) return;

        // ⚠️ From LAYOUT geometry, not from `getBoundingClientRect()`. This runs
        // on every ScrollTrigger refresh, including refreshes that land with the
        // entrance part-way through — at which point the cards already carry the
        // very transform being measured for, and reading their rects would feed
        // the animation its own output. `offset*` is the untransformed box; the
        // CSS centring is added back explicitly, since GSAP has normalised each
        // `translateX(-50%)` into `xPercent`.
        const centre = (el: HTMLElement) => ({
          x:
            el.offsetLeft +
            el.offsetWidth / 2 +
            ((gsap.getProperty(el, 'xPercent') as number) / 100) * el.offsetWidth,
          y:
            el.offsetTop +
            el.offsetHeight / 2 +
            ((gsap.getProperty(el, 'yPercent') as number) / 100) * el.offsetHeight,
        });

        const box = centre(dragon);
        const fireX = box.x + dragon.offsetWidth * (FLAME_HEART.x - 0.5);
        const fireY = box.y + dragon.offsetHeight * (FLAME_HEART.y - 0.5);

        for (const card of cardsInBloomOrder) {
          const c = centre(card);
          burst.set(card, { x: fireX - c.x, y: fireY - c.y });
        }
      };

      /* ---- the approach ----------------------------------------------------
       *
       * Before any of the scene happens, the dragon has to be SEEN flying. The
       * clip is already doing that on its own — `<TracksDragon>` holds it on its
       * opening loop — so all this does is carry the box down the page and grow
       * it, scrubbed to the wheel, until it comes to rest exactly on the stage.
       *
       * ⚠️ The landing target is the IDENTITY transform, not a measured point.
       * The element's CSS already places and sizes it correctly for the fire (see
       * `.tracks__dragon`), so the approach is written as a `from()` — an offset
       * the scrub removes. Nothing has to compute where the dragon should end
       * up, which is the entire class of bug the old two-dragon merge was made of.
       *
       * The band it flies down is real space: `.tracks` carries a tall
       * `padding-top` so there is sky above the heading for this to happen in.
       */
      const approach = gsap.timeline({
        scrollTrigger: {
          // ⚠️ Two different elements, and it has to be two.
          //
          // The flight begins when the SECTION's top edge appears — that is the
          // moment the band of sky comes into view and the first thing in it
          // should be a dragon. It ends when the STAGE is in place, which is
          // most of a screen further down. Anchoring both ends to the stage (the
          // obvious build) ran the entire approach before the band had even been
          // scrolled to, so the dragon completed its descent below the fold and
          // the reader only ever met it already landed.
          trigger: scope,
          start: 'top bottom',
          endTrigger: stage,
          // Lands exactly where the scene begins, below.
          end: 'top 55%',
          scrub: 1.1,
          invalidateOnRefresh: true,
          refreshPriority: -10,
        },
      });

      if (dragon) {
        approach
          .from(
            dragon,
            {
              // Up in the band, off to the side it is facing AWAY from, and
              // small. Functions, not constants: `invalidateOnRefresh` re-reads
              // them on resize instead of flinging the dragon at last week's
              // layout.
              //
              // ⚠️ The lift is well over a whole frame height, and it has to be.
              //
              // The box is anchored to the STAGE, which sits some 620px below
              // the section's own top edge — so at rest the dragon is a long way
              // down inside a section that `overflow: hidden` clips it to. The
              // lift has to cancel that AND the approach's own scroll distance,
              // because a linearly-decaying offset against a page moving 1:1 is
              // what holds the creature at a roughly constant place on screen
              // while it flies.
              //
              // Measured, at 907px tall: 0.78 of a frame tracked the artwork
              // from y 1191 to 852 — below the fold the whole way, so the flight
              // happened and nobody saw it. 1.15 got it to 896→808, a sliver at
              // the bottom edge. 1.6 puts it around mid-screen for the whole
              // descent.
              y: () => -dragon.offsetHeight * 1.6,
              x: () => -dragon.offsetWidth * 0.2,
              scale: 0.34,
              duration: 1,
              ease: 'none',
            },
            0,
          )
          // Fades up over the first stretch of the approach rather than the
          // whole of it, so the dragon is solid for most of the flight instead
          // of ghosting the entire way down. `from()`, so its resting state is
          // opaque — see the note on `.tracks__dragon` in sections.css.
          .from(dragon, { opacity: 0, duration: 0.14, ease: 'none' }, 0);
      }

      /* ---- the scene runs on the CLIP's clock -------------------------------
       *
       * Nothing here drives the dragon. The clip IS the dragon: it flies, banks
       * to face the reader and opens fire, all inside one video that
       * `<TracksDragon>` plays. What is left is only what the PAGE does in
       * reaction — the cards coming out of the flame, the glow, the floor spot.
       *
       * ⚠️ Cued off the video's `currentTime`, NOT off a timeline offset. The
       * clip loops its opening for however long the reader takes to arrive, so
       * "how long the entrance has been on screen" and "how far into the
       * entrance the dragon is" are different numbers. Hanging the cards off the
       * first would throw them out of a flame that has not been lit yet.
       */

      const reaction = gsap.timeline({ paused: true });

      reaction
        // The three cards are thrown OUT of the flame and fly apart to their
        // places. Each starts on the flame's heart at a fraction of its size;
        // `back.out` gives the arrival the overshoot that makes it read as
        // thrown rather than slid. The start values are FUNCTIONS so a resize
        // re-reads them instead of flinging the cards at wherever the flame was
        // when the page first loaded.
        //
        // `from()`, so the cards' resting DOM state is the visible one — which
        // is what leaves them correct on the reduced-motion path, where none of
        // this runs at all.
        .from(
          cardsInBloomOrder,
          {
            x: (i: number, target: HTMLElement) => burst.get(target)?.x ?? 0,
            y: (i: number, target: HTMLElement) => burst.get(target)?.y ?? 0,
            scale: 0.24,
            opacity: 0,
            duration: 1.05,
            // Active card first, so the row opens outward from the middle
            // rather than sweeping across — see `cardsInBloomOrder`.
            stagger: 0.13,
            ease: 'back.out(1.2)',
          },
          0.45,
        );

      // The glow catches with the flame and settles to the level it holds for
      // as long as the fire burns — it does not fade back out, because the fire
      // does not.
      if (glow) {
        reaction
          .fromTo(
            glow,
            { opacity: 0, scale: 0.5 },
            { opacity: 1, scale: 1.2, duration: 0.45, ease: 'power2.out' },
            0,
          )
          .to(glow, { opacity: 0.72, scale: 1, duration: 0.7, ease: 'power2.inOut' }, 0.45);
      }

      // The floor spot swells under the ignition and settles back.
      if (spot) {
        reaction
          .to(spot, { scale: 1.3, opacity: 1, duration: 0.5, ease: 'power2.out' }, 0)
          .to(spot, { scale: 1, duration: 0.9, ease: 'power2.inOut' }, 0.6);
      }

      /**
       * Watches the clip for the moment fire leaves the jaws, then gets out of
       * the way. One comparison per frame, only while the entrance is running —
       * it removes itself the instant it fires.
       */
      const watchForFire = () => {
        const at = stageRef.current?.time() ?? -1;
        if (at < DRAGON_IGNITES_AT) return;
        gsap.ticker.remove(watchForFire);
        reaction.play();
      };

      /** Pending "wait for the clip" timers, cleared on teardown. */
      const waits: number[] = [];

      /** Let the dragon out of its holding pattern and start watching for fire. */
      const land = () => {
        // ⚠️ THE LANDING IS FINAL, and the approach has to be told so.
        //
        // The approach is scrubbed, so it runs backwards when the reader scrolls
        // back up — but the clip does NOT: once released it plays on to the fire
        // and the fire stays lit, deliberately. Left wired together, scrolling
        // back up carried a dragon that was mid-roar back up into the sky and
        // shrank it, which is the one thing that could not be happening.
        //
        // `disable(false)` keeps the values it has already written rather than
        // reverting them, so this pins the dragon exactly where it landed.
        approach.scrollTrigger?.disable(false);
        approach.progress(1);
        stageRef.current?.release();
        gsap.ticker.add(watchForFire);

        // ⚠️ A DEAD MAN'S HANDLE for the cards, and it is not paranoia.
        //
        // The cards start hidden because they are thrown out of the flame, which
        // means the ONLY thing that ever reveals them is the clip reaching
        // ignition. Anything that stops it getting there — a decode that never
        // recovers, a tab backgrounded mid-entrance, a reader who scrolls past
        // fast enough that the clip is paused before it ignites — leaves the
        // section's actual content invisible for good.
        //
        // Comfortably longer than the entrance, so it never pre-empts the real
        // cue; `play()` on a timeline that has already run is a no-op.
        gsap.delayedCall(12, () => reaction.play());
      };

      // Flight starts as soon as the section is anywhere near, so the dragon is
      // already in the air by the time the reader can see it. It waits for the
      // clip to buffer — starting on an unbuffered video does not fail visibly,
      // it stalls on a held frame and then jumps, which reads as the page
      // lagging rather than as loading. In practice the wait is already over:
      // both files begin downloading when the page hydrates, sections above this.
      const flightTrigger = ScrollTrigger.create({
        // The SECTION, matching the approach above — the clip has to be in the
        // air by the time the band of sky is on screen, not when the stage is.
        trigger: scope,
        start: 'top bottom',
        end: 'bottom top',
        refreshPriority: -10,
        onEnter: () => {
          if (stageRef.current?.ready()) {
            stageRef.current.fly();
            return;
          }
          const waiting = window.setInterval(() => {
            if (!stageRef.current?.ready()) return;
            window.clearInterval(waiting);
            stageRef.current.fly();
          }, 100);
          waits.push(waiting);
        },
        // Off screen in either direction: stop decoding video nobody can see.
        // The fire is NOT put out — nothing is rewound, no state is cleared, and
        // coming back finds the flame exactly as it was left.
        onLeave: () => stageRef.current?.idle(),
        onLeaveBack: () => stageRef.current?.idle(),
        onEnterBack: () => stageRef.current?.resume(),
      });

      const sceneTrigger = ScrollTrigger.create({
        trigger: stage,
        // Where the approach ends. By here the stage fills the screen, so the
        // turn and the fire happen in front of the reader rather than in a strip
        // at the bottom of it.
        start: 'top 55%',
        end: 'bottom top',
        // Re-measured on every refresh so a resize does not fling the cards at
        // where the flame used to be.
        onRefresh: measureBurst,
        refreshPriority: -10,
        onEnter: land,
        // Coming back UP into the section: it is already lit, so the fire simply
        // resumes. `reaction` is complete and stays complete; the cards are not
        // thrown twice.
        onEnterBack: () => stageRef.current?.resume(),
      });

      measureBurst();

      /**
       * ⚠️ RE-MEASURE ONCE THE PAGE HAS SETTLED. Not belt-and-braces — without
       * it the approach is wrong by a fixed offset on every load.
       *
       * This section sits below a hero photograph, a pinned rail and a grid of
       * course cards, all of which can still change the document's height after
       * this effect runs. A ScrollTrigger caches its start and end as absolute
       * scroll positions at build time, so anything that grows above it shifts
       * the section without shifting the numbers.
       *
       * Measured, twice, from two independent scroll harnesses: the approach's
       * start and end both landed about 200px early, so the flight finished
       * while the band of sky was still below the fold and the reader met the
       * dragon already landed. `refreshPriority` cannot fix this — it orders a
       * refresh PASS, and the problem is that the layout changed after the last
       * one.
       */
      const refresh = () => ScrollTrigger.refresh();
      if (document.readyState !== 'complete') window.addEventListener('load', refresh);
      const settle = window.setTimeout(refresh, 1200);

      return () => {
        window.removeEventListener('load', refresh);
        window.clearTimeout(settle);
        for (const id of waits) window.clearInterval(id);
        gsap.ticker.remove(watchForFire);
        flightTrigger.kill();
        sceneTrigger.kill();
        approach.kill();
        reaction.kill();
      };
    },
    ref,
    [wide],
  );

  return (
    <section className="tracks" id="years" ref={ref}>
      <div className="tracks__wash" aria-hidden="true" />
      <div className="tracks__floor" aria-hidden="true" />

      <div className="tracks__glyphs" aria-hidden="true">
        {GLYPHS.map(([left, top, size, opacity, drift, glyph], i) => (
          <span
            className="tracks__glyph"
            key={i}
            data-drift={drift}
            style={
              {
                left: `${left}%`,
                top: `${top}%`,
                fontSize: `${size}rem`,
                // Read by `.tracks__glyph`, which multiplies it by a
                // per-theme boost — see the note in sections.css.
                '--glyph-a': opacity,
              } as React.CSSProperties
            }
          >
            {glyph}
          </span>
        ))}
      </div>

      <div className="tracks__inner">
        <header className="tracks__head">
          <span className="site-badge">{c.tracksSelectBadge}</span>
          <h2 className="site-h2" style={{ marginTop: '1rem' }}>
            {c.tracksSelectTitle}
          </h2>
          <p className="site-lead">{c.tracksSelectLead}</p>
        </header>

        <div className="tracks__stage">
          <TracksDragon stageRef={stageRef} />
          <div className="tracks__spot" aria-hidden="true" />
          <div className="tracks__cutout">
            <MediaSlot kind="cutout" alt="" sizes="66vw" />
          </div>

          {/* `radius` matches `.track`'s `--r-lg` in pixels — see ElectricCard.
              The two flanking cards run slower and calmer than the active one,
              so the centre card still reads as the primary choice rather than
              three cards competing at the same intensity. */}
          <div className="tracks__card tracks__card--start" data-track-card>
            <ElectricCard color={FLANK_BORDER} radius={TRACK_RADIUS} speed={0.5} chaos={0.1}>
              <TrackCardView card={ESSENTIALS} />
            </ElectricCard>
          </div>
          <div className="tracks__card tracks__card--end" data-track-card>
            <ElectricCard color={FLANK_BORDER} radius={TRACK_RADIUS} speed={0.5} chaos={0.1}>
              <TrackCardView card={YEAR_1} />
            </ElectricCard>
          </div>
          <div className="tracks__card tracks__card--active" data-track-card>
            <ElectricCard color={ACTIVE_BORDER} radius={TRACK_RADIUS} speed={0.7} chaos={0.16}>
              <TrackCardView card={YEAR_2} />
            </ElectricCard>
          </div>
        </div>
      </div>
    </section>
  );
}
