'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { DRAGON_BLAZE, DRAGON_RIDE, type DragonVideo } from '@/lib/brand-assets';
import { useMediaQuery } from '@/lib/use-media-query';

/**
 * The handle `year-tracks.tsx` drives the stage through. Deliberately four verbs
 * and no state: the section owns WHEN things happen, this owns HOW the two clips
 * become one continuous dragon.
 */
export type DragonStage = {
  /** Enough of the entrance is buffered to play it through without stalling. */
  ready(): boolean;
  /** Run the entrance from the top. Idempotent — a second call is ignored. */
  play(): void;
  /** Back on screen after having played: pick the fire back up mid-burn. */
  resume(): void;
  /** Off screen: stop decoding. Does NOT put the fire out. */
  idle(): void;
};

/**
 * The dragon on the "choose your year" stage: the instructor rides in on it,
 * it turns to face the reader, and it opens fire behind the cards.
 *
 * ## Two clips, one creature
 *
 * `DRAGON_RIDE` plays once and `DRAGON_BLAZE` loops forever after it, and the
 * whole job of this component is making that invisible. Both elements are in the
 * DOM the entire time, stacked; only `opacity` changes, and it changes on the
 * frame where the two clips agree, because the blaze was cut to start on the
 * frame after the ride's last (see `brand-assets.ts` for the measurement).
 *
 * The blaze is started EARLY — the moment the entrance is playing — and left
 * running underneath at `opacity: 0`. A `<video>` that has already been playing
 * for five seconds swaps in instantly; one told to `play()` at the moment it
 * becomes visible has to be scheduled, decode a keyframe and hit the compositor
 * first, which is a stall exactly where nothing may stall. It costs one
 * off-screen decode and buys a join that cannot be caught.
 *
 * ## Why a `<video>` and not a canvas
 *
 * This was a frame sequence painted to a `<canvas>`, which was correct while the
 * scene was scrubbed by the scroll wheel. It plays itself now, and once nothing
 * seeks, the same six seconds cost 748KB as VP9 instead of 2.5MB as WebP frames,
 * decode on the GPU, and stop repainting most of the screen's width on the main
 * thread twelve times a second. See `DRAGON_RIDE`.
 *
 * ## What is not rendered
 *
 * Below 64rem and under `prefers-reduced-motion` this returns `null`, so nothing
 * is fetched — not merely hidden. `display: none` would not help: the request
 * comes from the element existing, not from CSS.
 */
export function TracksDragon({ stageRef }: { stageRef: RefObject<DragonStage | null> }) {
  const wide = useMediaQuery('(min-width: 64rem)', false);
  // Deliberately NOT `useAmbientEffectsAllowed`: that also suppresses on
  // `(pointer: coarse)`, and a touch reader who has not asked for reduced
  // motion should still get the scene.
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)', true);

  const rideRef = useRef<HTMLVideoElement>(null);
  const blazeRef = useRef<HTMLVideoElement>(null);
  const active = wide && !reducedMotion && Boolean(DRAGON_RIDE) && Boolean(DRAGON_BLAZE);

  useEffect(() => {
    if (!active) return;
    const ride = rideRef.current;
    const blaze = blazeRef.current;
    if (!ride || !blaze) return;

    /** Set once the entrance has been started, so it is never replayed. */
    let started = false;

    /** Cross to the looping fire. Called on `ended`, and defensively on resume. */
    const cross = () => {
      blaze.style.opacity = '1';
      ride.style.opacity = '0';
      void blaze.play().catch(() => {});
    };

    ride.addEventListener('ended', cross);

    stageRef.current = {
      // `HAVE_FUTURE_DATA`, not `HAVE_ENOUGH_DATA`: the latter waits for the
      // browser's own guess that the whole clip will play through uninterrupted,
      // which on a fast connection is a guess it makes lazily and on a slow one
      // is a wait the reader spends looking at an empty stage. Future-data plus
      // a 748KB file that is already downloading is the right trade.
      ready: () => ride.readyState >= 3,
      play: () => {
        if (started) return;
        started = true;
        // The blaze runs from here on, hidden, so the swap is a paint and not a
        // start-up. See the note above.
        blaze.currentTime = 0;
        void blaze.play().catch(() => {});
        ride.currentTime = 0;
        ride.style.opacity = '1';
        void ride.play().catch(() => {});
      },
      resume: () => {
        if (!started) return;
        // Already burning — this is a place the reader has been, not something
        // that happens again. If they left mid-entrance, finish it.
        if (ride.ended) cross();
        else void ride.play().catch(() => {});
        if (blaze.style.opacity === '1') void blaze.play().catch(() => {});
      },
      idle: () => {
        ride.pause();
        blaze.pause();
      },
    };

    return () => {
      ride.removeEventListener('ended', cross);
      stageRef.current = null;
    };
  }, [active, stageRef]);

  if (!active || !DRAGON_RIDE || !DRAGON_BLAZE) return null;

  return (
    <div className="tracks__dragon" aria-hidden="true">
      {/* Behind the clips: the light the flame throws. A plain gradient rather
          than a filter on the video — see the note on `.tracks__dragon-glow`. */}
      <div className="tracks__dragon-glow" />
      <Clip className="tracks__dragon-clip" video={DRAGON_BLAZE} ref={blazeRef} loop />
      <Clip className="tracks__dragon-clip" video={DRAGON_RIDE} ref={rideRef} />
    </div>
  );
}

/**
 * One transparent clip.
 *
 * `preload="auto"` is the point of this component existing at page load rather
 * than at the section: both files start downloading as soon as the landing page
 * hydrates, at the browser's own low priority, so by the time the reader has
 * scrolled past the hero and the profile the stage is ready to play instantly.
 *
 * `playsInline` is required or iOS Safari takes the video fullscreen on play.
 * `muted` is required or no browser will autoplay it at all — these clips have
 * no audio track, but the attribute is what the autoplay policy actually reads.
 */
function Clip({
  video,
  className,
  loop,
  ref,
}: {
  video: DragonVideo;
  className: string;
  loop?: boolean;
  ref: RefObject<HTMLVideoElement | null>;
}) {
  return (
    <video
      className={className}
      ref={ref}
      width={video.width}
      height={video.height}
      muted
      playsInline
      loop={loop}
      preload="auto"
      // Both start invisible; `TracksDragon` raises the entrance when it plays
      // and the blaze when it takes over. Inline rather than in CSS because the
      // handle above writes this same property, and a stylesheet rule and a
      // style attribute fighting over one property is a bug waiting to happen.
      style={{ opacity: 0 }}
    >
      <source src={video.webm} type="video/webm" />
      <source src={video.mov} type="video/quicktime" />
    </video>
  );
}
