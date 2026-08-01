'use client';

import { useEffect, useRef, type RefObject } from 'react';
import {
  DRAGON_BLAZE,
  DRAGON_FLIGHT_LOOP,
  DRAGON_IGNITES_AT,
  DRAGON_RIDE,
  type DragonVideo,
} from '@/lib/brand-assets';
import { useMediaQuery } from '@/lib/use-media-query';

/**
 * The handle `year-tracks.tsx` drives the stage through. Verbs and one reading,
 * no state: the section owns WHEN things happen, this owns HOW three phases of
 * one creature run without a seam.
 */
export type DragonStage = {
  /** Enough is buffered to play through without stalling. */
  ready(): boolean;
  /** Start flying: the clip loops its own opening until `release`. */
  fly(): void;
  /** Stop looping. The clip runs on into the turn and the fire by itself. */
  release(): void;
  /**
   * Seconds into the entrance, for cueing the page's reaction. `-1` until it
   * has been released — while flying, "how long it has been on screen" and "how
   * far into the entrance it is" are different numbers, and only this one is
   * meaningful.
   */
  time(): number;
  /**
   * The reader has arrived and the flame has not caught yet — skip to it.
   * A no-op unless that is genuinely the case.
   */
  catchUp(): void;
  /** Back on screen after having played: pick the fire back up mid-burn. */
  resume(): void;
  /** Scrolled back up above the section: put the fire out and go back to flying. */
  rewind(): void;
  /** Off screen: stop decoding. Does NOT put the fire out. */
  idle(): void;
};

/**
 * How fast the entrance runs.
 *
 * The clip is a fixed six seconds and the flame is 4.87s into it, so at 1× the
 * turn takes long enough that a reader moving at any pace has scrolled well past
 * before it catches. Playing it faster is the only lever that shortens that
 * without recutting the file — and the dragon reads as more urgent for it, which
 * is the right note anyway. Above about 1.6 the wingbeat starts to flutter.
 */
const ENTRANCE_RATE = 1.5;

/**
 * The dragon on the "choose your year" stage: the instructor rides in on it,
 * it turns to face the reader, and it opens fire behind the cards.
 *
 * ## Three phases, one creature, two files
 *
 * FLYING, then TURNING AND IGNITING, then BURNING — and the whole job of this
 * component is making the reader unable to find a join between them.
 *
 * The first two are the same file. `DRAGON_RIDE` loops its own opening while
 * the reader is still on their way down (`DRAGON_FLIGHT_LOOP`), and `release()`
 * simply stops putting it back — it plays on into the turn with nothing cut to
 * and nothing faded. A separate flight clip would have been the obvious build
 * and the wrong one: it would sit at an arbitrary phase on arrival, so handing
 * to a turn that starts at a fixed frame would jump the wingbeat.
 *
 * The third is `DRAGON_BLAZE`, which loops forever. Both elements are in the
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

    /** Set once flight has begun, so the entrance is never restarted. */
    let started = false;
    /** While true, the clip is held on its opening loop. */
    let circling = false;
    let watching = 0;

    /**
     * Hold the clip on its flight loop.
     *
     * Per-frame rather than on `timeupdate`, which fires about four times a
     * second — a quarter of a second of overshoot is four frames past the loop
     * point, and the whole reason the loop point was measured to a frame is that
     * a few frames of error are exactly what shows.
     *
     * `requestVideoFrameCallback` where it exists, because it fires on decoded
     * VIDEO frames rather than on display frames and so cannot drift from what
     * is actually on screen; `requestAnimationFrame` is a fine stand-in.
     *
     * The backward seek is ~1.6s in an already-buffered file with a keyframe at
     * its head, so it decodes a handful of frames and does not stall.
     */
    const circle = () => {
      if (!circling) return;
      if (ride.currentTime >= DRAGON_FLIGHT_LOOP.to) {
        ride.currentTime = DRAGON_FLIGHT_LOOP.from;
      }
      watching = 'requestVideoFrameCallback' in ride
        ? (ride as HTMLVideoElement & { requestVideoFrameCallback(cb: () => void): number })
            .requestVideoFrameCallback(circle)
        : requestAnimationFrame(circle);
    };

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
      // a 724KB file that is already downloading is the right trade.
      ready: () => ride.readyState >= 3,

      fly: () => {
        // ⚠️ ALREADY STARTED MEANS RESUME, NOT "DO NOTHING". This returned early
        // and that was a bug you could sit and look at: scrolling up out of the
        // section pauses the clip (`idle`), and scrolling back down re-fires this
        // — so a guard that just bailed left a PAUSED video on screen, which is
        // to say a photograph of a dragon.
        //
        // Restarting `circle()` is part of it and not optional:
        // `requestVideoFrameCallback` only fires on decoded frames, so the moment
        // the element pauses the loop that holds the flight in its loop dies
        // quietly. Without this, a resumed clip would run straight past its loop
        // and into the turn while the reader was still three sections away.
        if (started) {
          void ride.play().catch(() => {});
          if (circling) circle();
          if (blaze.style.opacity === '1') void blaze.play().catch(() => {});
          return;
        }
        started = true;
        circling = true;
        // The blaze runs from here on, hidden and looping, so the hand-over at
        // the end is a paint and not a start-up. See the note above. It stays at
        // 1× — sped-up fire reads as a fast-forward, where a sped-up wingbeat
        // just reads as a faster dragon.
        blaze.currentTime = 0;
        void blaze.play().catch(() => {});
        ride.playbackRate = ENTRANCE_RATE;
        ride.currentTime = 0;
        ride.style.opacity = '1';
        void ride.play().catch(() => {});
        circle();
      },

      // Nothing is switched, cut to or faded here. The clip has been playing its
      // opening over and over; this stops putting it back, and it carries on
      // into the turn on its own. That is the whole trick.
      release: () => {
        circling = false;
      },

      time: () => (circling || !started ? -1 : ride.currentTime),

      /**
       * ⚠️ THE FAST-SCROLLER'S FIRE, and the one place a seek is the right call.
       *
       * Everything else here is built so the clip is never jumped: the whole
       * single-file design exists to avoid a visible cut in the wingbeat. But
       * the turn takes a fixed ~2s of playback to reach the flame, and a reader
       * who throws the wheel crosses the entire section in less than that. For
       * them the choice is not "seamless or cut", it is "fire or no fire" — and
       * a section whose whole point is a dragon breathing fire cannot show up
       * without any.
       *
       * So this is a floor, not a schedule. Anyone moving at a normal pace has
       * already passed `DRAGON_IGNITES_AT` by the time it runs and nothing
       * happens; only someone who has outrun the clip gets moved forward, and
       * they are, by definition, not looking closely at the wingbeat.
       */
      catchUp: () => {
        if (!started || circling || ride.ended) return;
        if (ride.currentTime >= DRAGON_IGNITES_AT) return;
        ride.currentTime = DRAGON_IGNITES_AT;
      },

      resume: () => {
        if (!started) return;
        // Already lit — this is a place the reader has been, not something that
        // happens again. If they left mid-entrance, finish it.
        if (ride.ended) cross();
        else {
          void ride.play().catch(() => {});
          // Same reason as in `fly` — the frame callback stops with the video,
          // so the flight loop has to be re-armed by hand after any pause.
          if (circling) circle();
        }
        if (blaze.style.opacity === '1') void blaze.play().catch(() => {});
      },

      // Scrolled back up ABOVE the section. The scene is put back to the dragon
      // flying, so coming down again plays it out from the beginning rather than
      // revealing a stage that is already alight.
      //
      // This is a reversal of the earlier rule that the fire, once lit, never
      // goes out. It still does not go out while the reader is anywhere IN the
      // section — leaving upwards is a different thing from looking away, and
      // scrolling back up to find a dragon still roaring at a section you have
      // left behind is the thing being fixed.
      rewind: () => {
        blaze.pause();
        blaze.style.opacity = '0';
        ride.style.opacity = '1';
        ride.currentTime = DRAGON_FLIGHT_LOOP.from;
        circling = true;
        void ride.play().catch(() => {});
        circle();
      },

      idle: () => {
        ride.pause();
        blaze.pause();
      },
    };

    return () => {
      circling = false;
      cancelAnimationFrame(watching);
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
