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
  /**
   * How far through the entrance the clip is: `0` on the last frame of the
   * holding loop, `1` on its last frame — where the fire takes over. `-1` while
   * it is still circling or has not started, which is to say while there is
   * nothing to undo.
   */
  entrance(): number;
  /**
   * Finish a reversal on the clip's own clock, from wherever it has got to,
   * back into the holding pattern. What runs when the reader stops scrolling
   * part-way — see the note in `year-tracks.tsx`.
   */
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
 * How fast the entrance runs BACKWARDS, as a multiple of the clip's own rate.
 *
 * The rewind has to fit inside the scroll the reader spends leaving: it starts
 * where the scene was cued (`stage top bottom+=30%`) and the clip stops being
 * watchable once the section is gone (`scope top bottom+=55%`), which is about
 * 850px apart at 1512×945. Fifty-nine frames at 2× is two seconds — right for
 * an unhurried scroll up, and `idle()` finishes the job for anyone quicker.
 *
 * Deliberately faster than the entrance's 1.5×. A rewind that runs at the pace
 * of the thing it is undoing reads as a second performance; one that runs
 * quicker reads as being taken back, which is what it is. The decode has the
 * room — measured, the file rewinds at 113fps and this asks for 30.
 */
const REWIND_RATE = 2;

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
    if (!active || !DRAGON_RIDE) return;
    const ride = rideRef.current;
    const blaze = blazeRef.current;
    if (!ride || !blaze) return;

    /** Set once flight has begun, so the entrance is never restarted. */
    let started = false;
    /** While true, the clip is held on its opening loop. */
    let circling = false;
    let watching = 0;

    /* ---- the frame grid -------------------------------------------------
     *
     * Running backwards means addressing FRAMES, not seconds, and the two are
     * not interchangeable here.
     *
     * ⚠️ DO NOT REWIND BY SUBTRACTING A FRAME FROM `currentTime`. A seek reports
     * back the START time of the frame it landed in, which is up to a whole
     * frame BELOW what was asked for — so `currentTime -= 1/fps` compounds that
     * error and silently steps two frames at a time. Measured: a 84-frame
     * rewind written that way played 42 of them. Every frame is addressed by
     * index and seeked to at its MIDDLE, where it cannot be mistaken for its
     * neighbour.
     */
    const fps = DRAGON_RIDE.fps;
    /** Which frame a PLAYBACK POSITION falls inside. */
    const frameAt = (seconds: number) => Math.floor(seconds * fps);
    const seekTo = (frame: number) => (frame + 0.5) / fps;
    const LAST_FRAME = Math.round(DRAGON_RIDE.seconds * fps) - 1;
    /**
     * Where a rewind stops. Above this the clip is the ENTRANCE — the turn and
     * the fire, which is what there is to undo. Below it the clip is just the
     * holding loop, and a dragon flying backwards is, as the encode script puts
     * it, extremely obvious. So the reversal ends at the loop's far end and
     * hands straight back to forward flight.
     *
     * ⚠️ `round`, NOT `floor`, and the difference is one frame that shows.
     *
     * This is a BOUNDARY rather than a playback position: `DRAGON_FLIGHT_LOOP.to`
     * is the instant frame 32 begins, and 2.133 × 15 lands at 31.995, so
     * flooring it stops the rewind one frame early. That matters because the
     * hand-back reuses the flight loop's own wrap — the pair of frames whose
     * join was measured to be smaller than an ordinary frame step (0.82x), and
     * which is the reason those two numbers were measured to a frame at all.
     * Stopping a frame short hands over on a pair nobody measured.
     */
    const LOOP_END_FRAME = Math.round(DRAGON_FLIGHT_LOOP.to * fps);

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

    /**
     * ⚠️ A BACKSTOP FOR THE FLIGHT LOOP, on the MEDIA clock rather than the
     * frame clock.
     *
     * `circle()` above holds the loop with `requestVideoFrameCallback`, which is
     * the right instrument while anyone is watching and stops being one the
     * moment they are not: Chrome throttles both it and `requestAnimationFrame`
     * to about 1Hz in a backgrounded or occluded tab, while the video's own
     * clock keeps running. Measured in exactly that state — element on screen,
     * `opacity: 1`, both callbacks at 1Hz — the clip sailed 1.4s past its loop
     * point, out of the holding pattern and into the turn.
     *
     * That is a reader who switches tabs during the approach and comes back to a
     * dragon half-way through a manoeuvre it should not have started, or to a
     * stage already alight; and it is the same hole underneath `rewind()`, whose
     * whole promise is that the scene goes back to what it was.
     *
     * `timeupdate` is driven by the media clock, so throttling does not touch
     * it. It is far too coarse to hold the loop on its own — it fires about four
     * times a second, and the note on `circle()` explains why four frames of
     * overshoot are exactly what shows — but as a floor under a callback that
     * has stopped firing it costs nothing and cannot be starved.
     */
    const backstop = () => {
      if (!circling) return;
      if (ride.currentTime >= DRAGON_FLIGHT_LOOP.to) {
        ride.currentTime = DRAGON_FLIGHT_LOOP.from;
      }
    };
    ride.addEventListener('timeupdate', backstop);

    /** Is the fire the thing currently on screen? */
    const lit = () => blaze.style.opacity === '1';

    /**
     * Cross to the looping fire. Called on `ended`, and defensively on resume.
     *
     * ⚠️ The blaze is SEEKED TO ITS HEAD FIRST, and the swap waits for that seek.
     *
     * The two clips are congruent on exactly one pair of frames: the ride's
     * last and the blaze's first, which was cut to be the frame after it. But
     * the blaze has been looping underneath since the entrance began, so at the
     * moment of the hand-over it is at an arbitrary point in its own cycle.
     * Measured, swapping to wherever it happens to be changes the picture by
     * 1.65x what two consecutive frames do, against 1.18x for the frame it was
     * built to hand over to — the difference between a join and a flicker.
     *
     * Waiting on `seeked` costs a few milliseconds during which the ride's last
     * frame is still up, which is the correct thing to be showing. Swapping
     * first and seeking after would put one wrong frame on screen, which is the
     * whole thing being avoided.
     */
    const cross = () => {
      if (lit()) return;
      const show = () => {
        blaze.style.opacity = '1';
        ride.style.opacity = '0';
        void blaze.play().catch(() => {});
      };
      if (blaze.currentTime < 0.5 / fps) return show();
      blaze.addEventListener('seeked', show, { once: true });
      blaze.currentTime = 0;
    };

    ride.addEventListener('ended', cross);

    /* ---- running it backwards --------------------------------------------
     *
     * Paced off the WALL CLOCK and not off `seeked`, which is the obvious build
     * and the wrong one: seeks complete as fast as the decoder manages — 113fps
     * on a warm file — so chaining them plays the rewind at whatever speed the
     * machine happens to be, and faster on a fast one. Reading the clock and
     * seeking only when the target frame changes pins the rate, and degrades by
     * dropping frames rather than by speeding up when it cannot keep pace.
     */

    /** rAF handle while the entrance is running backwards; 0 when it is not. */
    let unwinding = 0;
    /** The frame the rewind started from, and the moment it started. */
    let unwoundFrom = 0;
    let unwoundAt = 0;
    /** The frame last seeked to, so each one is asked for exactly once. */
    let shown = -1;

    const stopUnwinding = () => {
      if (!unwinding) return;
      cancelAnimationFrame(unwinding);
      unwinding = 0;
      shown = -1;
    };

    /** Back into the holding pattern, flying forwards, as it arrived. */
    const flyOn = () => {
      ride.currentTime = DRAGON_FLIGHT_LOOP.from;
      circling = true;
      void ride.play().catch(() => {});
      circle();
    };

    const unwind = () => {
      const elapsed = (performance.now() - unwoundAt) / 1000;
      const target = Math.max(
        LOOP_END_FRAME,
        unwoundFrom - Math.floor(elapsed * fps * REWIND_RATE),
      );
      if (target !== shown) {
        shown = target;
        ride.currentTime = seekTo(target);
      }
      if (target <= LOOP_END_FRAME) {
        stopUnwinding();
        flyOn();
        return;
      }
      unwinding = requestAnimationFrame(unwind);
    };

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
          // A rewind owns the clip while it runs — do not start playing
          // forwards underneath it. `release()` is what turns it around.
          if (unwinding) return;
          void ride.play().catch(() => {});
          if (circling) circle();
          if (lit()) void blaze.play().catch(() => {});
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
        // Turning round mid-rewind — the reader changed their mind and came
        // back down. Stop reversing and carry on FORWARDS from exactly the
        // frame the reversal had reached: nothing is reset, so the clip simply
        // changes direction under them.
        if (unwinding) {
          stopUnwinding();
          void ride.play().catch(() => {});
        }
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
        // Going backwards ON PURPOSE. This is the one cue that shoves the clip
        // forwards, and firing it into a rewind would fight it frame for frame.
        if (unwinding) return;
        if (ride.currentTime >= DRAGON_IGNITES_AT) return;
        ride.currentTime = DRAGON_IGNITES_AT;
      },

      resume: () => {
        if (!started) return;
        if (unwinding) return;
        // Already lit — this is a place the reader has been, not something that
        // happens again. If they left mid-entrance, finish it.
        if (ride.ended) cross();
        else {
          void ride.play().catch(() => {});
          // Same reason as in `fly` — the frame callback stops with the video,
          // so the flight loop has to be re-armed by hand after any pause.
          if (circling) circle();
        }
        if (lit()) void blaze.play().catch(() => {});
      },

      /**
       * Scrolled back up ABOVE the section — the entrance is PLAYED BACKWARDS.
       *
       * This used to cut: the fire was switched off, the clip jumped to the head
       * of its flight loop, and a reader who had just watched a dragon light up
       * saw it blink back to flying. The scene now unwinds instead — the flame
       * is drawn back into the jaws, the dragon un-turns, and it settles into
       * the same holding pattern it was in when the reader first met it.
       *
       * The fire still does not go out while the reader is anywhere IN the
       * section; leaving upwards is a different thing from looking away.
       */
      entrance: () => {
        if (!started || circling) return -1;
        if (lit()) return 1;
        return (frameAt(ride.currentTime) - LOOP_END_FRAME) / (LAST_FRAME - LOOP_END_FRAME);
      },

      rewind: () => {
        if (!started) return;      // never flew — there is nothing to undo
        if (circling) return;      // still holding: it is already "back"
        if (unwinding) return;     // already on its way

        // The clip is driven by hand from here; nothing must also be playing it.
        ride.pause();

        if (lit()) {
          // The fire is what is on screen, and the ride is parked on its last
          // frame underneath — the one the blaze was cut to follow. Swapping
          // back is the forward hand-over taken the other way, so it is a paint
          // rather than a cut, and the reversal starts from that frame.
          blaze.pause();
          blaze.style.opacity = '0';
          ride.style.opacity = '1';
          unwoundFrom = LAST_FRAME;
        } else {
          // Caught mid-entrance: unwind from wherever the turn had got to.
          unwoundFrom = Math.min(LAST_FRAME, frameAt(ride.currentTime));
        }

        shown = -1;
        unwoundAt = performance.now();
        unwind();
      },

      idle: () => {
        // ⚠️ A REWIND STILL RUNNING WHEN THE SCENE GOES OFF SCREEN IS FINISHED
        // ON THE SPOT, not abandoned. The reversal takes two seconds and a brisk
        // scroll clears the section in less, so simply pausing here would park
        // the clip half-way through the turn — and the reader coming back down
        // would meet a dragon frozen mid-manoeuvre, which is the "photograph of
        // a dragon" bug in `fly()` by another route. Nobody can see the jump at
        // this point, which is exactly why it is safe to take it.
        if (unwinding) {
          stopUnwinding();
          ride.currentTime = DRAGON_FLIGHT_LOOP.from;
          circling = true;
        }
        ride.pause();
        blaze.pause();
      },
    };

    return () => {
      circling = false;
      stopUnwinding();
      cancelAnimationFrame(watching);
      ride.removeEventListener('ended', cross);
      ride.removeEventListener('timeupdate', backstop);
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
