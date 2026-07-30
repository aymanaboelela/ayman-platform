'use client';

import { useRef } from 'react';
import { copy } from '@ayman/contracts';
import { gsap, ScrollTrigger } from '@/lib/gsap';
import { useGsap } from '@/components/motion/use-gsap';
import { useMediaQuery } from '@/lib/use-media-query';
import { MediaSlot } from '@/components/site/media-slot';
import { ElectricCard } from '@/components/site/electric-card';
import { TrackCardView, type TrackCard } from '@/components/site/track-card';
import { TracksDragon } from '@/components/site/tracks-dragon';
import { TRACKS_FIRE_PEAK_S } from '@/lib/brand-assets';

const c = copy.landing;

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
  const dragonVideoRef = useRef<HTMLVideoElement>(null);
  // A real dependency for the `useGsap` call below, not decoration: TracksDragon
  // only renders its <video> once this flips true (Task 5), so the effect has
  // to re-run when it does — otherwise a resize crossing the breakpoint would
  // leave the effect holding a stale `dragonVideoRef.current` captured from
  // before TracksDragon mounted. Same reasoning as the identical dependency on
  // `dragon-sprite.tsx`.
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

      const video = dragonVideoRef.current;
      if (!video) {
        // Narrow viewport — TracksDragon rendered nothing (Task 5), so there is
        // no fire to time the bloom off. Fall back to exactly the plain stagger
        // this section used before this task, unchanged.
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
      const activeCard = scope.querySelector('[data-track-card].tracks__card--active');
      const startCard = scope.querySelector('[data-track-card].tracks__card--start');
      const endCard = scope.querySelector('[data-track-card].tracks__card--end');
      const cardsInBloomOrder = [activeCard, startCard, endCard].filter(
        (el): el is Element => el !== null,
      );

      const dragon = scope.querySelector<HTMLElement>('.tracks__dragon');
      const spot = scope.querySelector<HTMLElement>('.tracks__spot');
      // Resolved OUTSIDE this component's gsap.context() scope, exactly like
      // the existing footer-fade in `dragon-sprite.tsx:171-179` — deliberate,
      // not an oversight. A bare `'.dragon'` selector STRING would resolve
      // INSIDE this scope (which contains no such element) and silently do
      // nothing. `null` whenever DragonSprite isn't rendered (narrow viewport),
      // so every use below is guarded.
      const mascot = document.querySelector<HTMLElement>('.dragon');

      // How long after the measured fire-peak the flame has visibly died down
      // in the source clip (peaks ~5.8-6.9s raw, back to baseline by ~7.9s —
      // roughly a 1-second tail past the peak; 1.6s here for a beat of margin
      // so the fade doesn't clip the tail of the flame).
      const FIRE_OUT_S = TRACKS_FIRE_PEAK_S + 1.6;

      // Paused on creation — played from the `timeupdate` listener below, not
      // from this timeline's own ScrollTrigger. `gsap.from()` still means the
      // cards' resting DOM state is their final state, so scrubbing this
      // timeline's progress back to 0 (onLeaveBack, below) leaves them exactly
      // where the reduced-motion path already leaves them.
      const bloom = gsap.timeline({ paused: true });
      if (spot) {
        bloom.to(spot, { opacity: 0.9, scale: 1.15, duration: 0.25, yoyo: true, repeat: 1 }, 0);
      }
      bloom.from(
        cardsInBloomOrder,
        { y: 40, opacity: 0, scale: 0.92, duration: 0.9, stagger: 0.12, ease: 'power3.out' },
        0,
      );

      // Two independent triggers off the SAME real playback position, not a
      // wall-clock delay — a delay measured from when `.play()` was called
      // would drift out of sync with the actual flame if playback ever stalls
      // (a slow decode, a dropped frame). Tying the fade-out to `currentTime`
      // the same way the bloom trigger already is keeps both honest.
      let bloomArmed = true;
      let fadeArmed = true;
      const onTime = () => {
        if (bloomArmed && video.currentTime >= TRACKS_FIRE_PEAK_S) {
          bloomArmed = false;
          bloom.play();
        }
        if (fadeArmed && video.currentTime >= FIRE_OUT_S) {
          fadeArmed = false;
          if (dragon) gsap.to(dragon, { opacity: 0, duration: 0.8 });
          if (mascot) gsap.to(mascot, { opacity: 1, duration: 0.6 });
        }
      };
      video.addEventListener('timeupdate', onTime);

      const trigger = ScrollTrigger.create({
        trigger: scope,
        start: 'top 70%',
        end: 'bottom top',
        onEnter: () => {
          if (mascot) gsap.to(mascot, { opacity: 0, duration: 0.4 });

          // Flies in from further off-stage (35% of its own width) to its
          // CSS resting position — NOT a `.to()` off the current transform,
          // which would only be correct the first time and wrong on replay
          // once GSAP has already moved it. Kept in a variable so the
          // autoplay-rejected fallback below can kill it before it fights
          // with that fallback's own instant `.set()`.
          const entrance = dragon
            ? gsap.fromTo(
                dragon,
                { xPercent: -35, opacity: 0 },
                { xPercent: 0, opacity: 1, duration: 1.1, ease: 'power2.out' },
              )
            : null;

          video.currentTime = 0;
          void video.play().catch(() => {
            // Autoplay refused — the cards must still bloom, same fallback
            // FireReveal used for the same reason.
            entrance?.kill();
            bloomArmed = false;
            bloom.play();
            fadeArmed = false;
            if (dragon) gsap.set(dragon, { opacity: 0 });
            if (mascot) gsap.set(mascot, { opacity: 1 });
          });
        },
        onLeaveBack: () => {
          bloomArmed = true;
          fadeArmed = true;
          bloom.progress(0).pause();
          video.pause();
          video.currentTime = 0;
          if (dragon) gsap.set(dragon, { opacity: 0, xPercent: 0 });
          if (mascot) gsap.to(mascot, { opacity: 1, duration: 0.4 });
        },
      });

      return () => {
        video.removeEventListener('timeupdate', onTime);
        trigger.kill();
        bloom.kill();
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
          <TracksDragon videoRef={dragonVideoRef} />
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
