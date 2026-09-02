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
  /**
   * Off screen: stop decoding, and settle on a pose that can be rested on.
   *
   * ⚠️ THE DIRECTION IS REQUIRED, because "settle" means opposite things going
   * each way. Leaving DOWNWARD, the reader has watched the fire catch and must
   * find it still burning when they come back; leaving UPWARD, they have
   * rejected the scene and must find the dragon flying, exactly as they first
   * met it. Off screen either way, so neither jump can be seen.
   */
  idle(direction: 'down' | 'up'): void;
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
    /** The loop watcher's pending callback; 0 when none is armed. */
    let watching = 0;
    /** Which clock issued it — see `stopCircling`, where getting this wrong bites. */
    const framePaced = 'requestVideoFrameCallback' in ride;
    type FrameClock = HTMLVideoElement & {
      requestVideoFrameCallback(cb: () => void): number;
      cancelVideoFrameCallback(handle: number): void;
    };

    /* ---- ⚠️ THE CLIPS ARE PUT BACK BEFORE ANYTHING ELSE RUNS --------------
     *
     * This effect can run a SECOND time over the SAME two `<video>` elements,
     * and every `let` above has just been reset while the elements have not.
     * That is «التنين بقى اتنين فوق بعض»: two dragons stacked, both frozen.
     *
     * The router does not unmount this page when the reader opens another one.
     * Measured on production with a tagged WeakMap across a soft navigation to
     * `/essentials` and back: `.tracks` and both `<video>` nodes came back with
     * the SAME identity, no element was ever recreated, and the section was
     * still in the DOM while the other page was on screen. What the navigation
     * does is tear the EFFECTS down and build them again — React's own
     * behaviour for a hidden tree — so the JavaScript state resets to "nothing
     * has happened yet" on top of a DOM that is still mid-scene.
     *
     * The trap is `lit()`, which reads the blaze's inline `opacity` and is
     * therefore the one piece of state that SURVIVES. Leaving the section
     * downward parks the scene lit (`idle()`); coming back, `fly()` took its
     * never-started branch and raised the ride over a blaze that was still at
     * `opacity: 1`, and the next `idle()` saw `lit()` true and simply paused
     * both. Two visible clips, neither playing.
     *
     * So the DOM is re-synchronised with the variables above rather than
     * trusted to still match them. This is the same state the JSX declares, and
     * on a first mount it is a no-op.
     */
    ride.pause();
    blaze.pause();
    ride.style.opacity = '0';
    blaze.style.opacity = '0';
    ride.currentTime = 0;
    blaze.currentTime = 0;

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
     *
     * ⚠️ IT DOES, HOWEVER, THROW DECODED FRAMES AWAY, AND THAT IS EXPECTED —
     * written down here because it looks exactly like a bug to whoever profiles
     * this section next.
     *
     * `getVideoPlaybackQuality().droppedVideoFrames` on the ride reads about
     * half of everything decoded: measured over one pass, 240 decoded and 112
     * dropped locally, 229 and 121 on production. A clip that needs ~137 frames
     * to play through is decoding 229, so roughly ninety of them are decoded and
     * then seeked away from — the wrap doing its job, once every 1.6 seconds,
     * for however long the reader takes to arrive.
     *
     * That is the price of the join being invisible, and it is not payable any
     * other way in a one-file design: the loop point was chosen so the WRAP
     * cannot be seen, and not seeing it means decoding into frames you then
     * leave. Quote the COMPARISON if you ever cite these numbers — the two
     * encodes measured against each other on the same harness — never the
     * percentage on its own. Half of all frames dropped would describe a broken
     * page, and this one plainly is not.
     */
    const circle = () => {
      // The handle that just fired is spent. Cleared before the early return so
      // nothing downstream tries to cancel a callback that has already run.
      watching = 0;
      if (!circling) return;
      if (ride.currentTime >= DRAGON_FLIGHT_LOOP.to) {
        ride.currentTime = DRAGON_FLIGHT_LOOP.from;
      }
      watching = framePaced
        ? (ride as FrameClock).requestVideoFrameCallback(circle)
        : requestAnimationFrame(circle);
    };

    /**
     * ⚠️ CANCEL WITH THE CLOCK THAT ISSUED THE HANDLE, and the wrong one does
     * not merely fail — it reaches into somebody else's animation.
     *
     * `requestVideoFrameCallback` hands back a handle from the VIDEO ELEMENT's
     * own counter, cancellable only with `cancelVideoFrameCallback`. Teardown
     * used to call `cancelAnimationFrame` on it, which is wrong twice over: the
     * video callback stays armed, and — both counters start at 1 and step by 1,
     * so the ids collide constantly — it cancels whatever `requestAnimationFrame`
     * happens to be holding that number. On this page that is very often GSAP's
     * ticker, which re-requests its frame only from INSIDE its own tick: cancel
     * the pending one and the global ticker stops for good, taking every
     * scrubbed animation on the landing page with it. It ran on every teardown,
     * which is to say on every soft navigation off the landing page.
     */
    const stopCircling = () => {
      if (!watching) return;
      if (framePaced) (ride as FrameClock).cancelVideoFrameCallback(watching);
      else cancelAnimationFrame(watching);
      watching = 0;
    };

    /**
     * ⚠️ ONE WATCHER, and calling `circle()` twice is how you end up with several.
     *
     * `circle()` re-arms itself, so calling it starts a CHAIN rather than
     * scheduling a callback — and three places have to call it (`fly`, `resume`
     * and `flyOn`), because the frame callback dies with the video the moment
     * the element pauses. Unguarded, that is a fresh chain per scroll cycle
     * running on top of every chain before it: pausing does not cancel the
     * pending `requestVideoFrameCallback`, it holds it until the element plays
     * again, and then the old chain wakes up alongside the new one. They do not
     * fight — the wrap is idempotent — they accumulate, one more callback per
     * decoded frame for every time the reader has crossed the section, for as
     * long as the page stays open.
     */
    const startCircling = () => {
      stopCircling();
      circle();
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
      /*
       * ⚠️ A REVERSAL OWNS THE CLIP, and an `ended` that arrives during one is
       * an artefact of the seek rather than the entrance finishing.
       *
       * This is «لما أطلع لفوق تاني ما بيرجعش», and it is worth writing the
       * sequence down because nothing about it is visible from here. When the
       * reader scrolls up off a scene that has fully played, `rewind()` finds
       * `lit()` true, swaps the fire off and the ride back on, and seeks to
       * `LAST_FRAME` to start unwinding — and that seek lands INSIDE the final
       * frame of a clip whose `ended` has already fired once. Chrome fires it
       * AGAIN. Measured, with a MutationObserver on both elements:
       *
       *   722ms  blaze → 0   (rewind starts)
       *   750ms  ride  → 1
       *   755ms  ended fires at currentTime 6.13
       *   755ms  blaze → 1, ride → 0   ← cross(), undoing the rewind's swap
       *
       * From there the reversal runs to completion underneath a fire that is
       * on top of it: the reader scrolls up watching a frozen flame with the
       * dragon flying invisibly behind it, and arrives at the top of the page
       * with the scene still alight. `lit()` cannot catch this on its own —
       * the rewind has just made it false, which is precisely why this fires.
       *
       * `unwinding` is declared below and is only read when this is CALLED (an
       * event listener and `resume()`), never during setup, so there is no
       * temporal-dead-zone hazard in referring to it here.
       */
      if (unwinding) return;
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

    /**
     * The scene as the reader first met it: dragon on screen, circling, no fire.
     *
     * ⚠️ The OPACITIES are part of "as it arrived", and leaving them out is a
     * bug you can look at. `rewind()` swaps the fire back off when it starts
     * from a lit scene, so the two callers below were correct only for the path
     * that went through it — and `idle()` has a path that does not. The symptom
     * was a reader scrolling up out of the section and being left with the
     * BLAZE layer still on top at `opacity: 1` and the ride hidden underneath
     * it: fire burning over an empty sky, with the dragon flying invisibly
     * behind it. Reported as «لما أطلع لفوق تاني ما بيرجعش».
     */
    const settleToFlight = () => {
      ride.currentTime = DRAGON_FLIGHT_LOOP.from;
      ride.style.opacity = '1';
      blaze.style.opacity = '0';
      circling = true;
    };

    /** Back into the holding pattern, flying forwards, as it arrived. */
    const flyOn = () => {
      settleToFlight();
      void ride.play().catch(() => {});
      startCircling();
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
          if (circling) startCircling();
          if (lit()) void blaze.play().catch(() => {});
          return;
        }
        started = true;
        circling = true;
        // The blaze runs from here on, hidden and looping, so the hand-over at
        // the end is a paint and not a start-up. See the note above. It stays at
        // 1× — sped-up fire reads as a fast-forward, where a sped-up wingbeat
        // just reads as a faster dragon.
        //
        // ⚠️ HIDDEN is stated, not assumed. The entrance beginning means the
        // fire is not lit, and saying so here is what makes this branch safe to
        // enter from any state — see the re-synchronisation note at the top of
        // this effect for the navigation that used to arrive here with the
        // blaze still on screen.
        blaze.style.opacity = '0';
        blaze.currentTime = 0;
        void blaze.play().catch(() => {});
        ride.playbackRate = ENTRANCE_RATE;
        ride.currentTime = 0;
        ride.style.opacity = '1';
        void ride.play().catch(() => {});
        startCircling();
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
        // ⚠️ THE FIRE FIRST, and it returns.
        //
        // Already lit means the entrance is over — this is a place the reader
        // has been, not something that happens again — so the blaze is the only
        // clip that has anything left to do. Restarting the ride underneath it
        // decodes six seconds of video at `opacity: 0` for nobody, and since
        // `idle()` can now hand over to the fire without the ride having
        // REACHED its `ended` (see below), that is no longer the unreachable
        // branch it used to be.
        if (lit()) {
          void blaze.play().catch(() => {});
          return;
        }
        if (ride.ended) cross();
        else {
          void ride.play().catch(() => {});
          // Same reason as in `fly` — the frame callback stops with the video,
          // so the flight loop has to be re-armed by hand after any pause.
          if (circling) startCircling();
        }
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

      idle: (direction) => {
        // ⚠️ NOTHING IS EVER LEFT PARKED HALF-WAY THROUGH SOMETHING. Whatever
        // was running when the scene left the screen is FINISHED here, on the
        // spot — because the only two poses that can be rested on are "flying"
        // and "burning", and nobody can see the jump at this point, which is
        // exactly why it is safe.
        //
        // WHICH of the two is decided by the direction the reader left in, not
        // by what happened to be playing. Down means they watched the fire
        // catch and must find it burning; up means they turned away from the
        // scene and must find it as they first met it.
        if (unwinding) {
          // The reversal takes two seconds and a brisk scroll clears the
          // section in less, so simply pausing would park the clip half-way
          // through the turn — and the reader coming back down would meet a
          // dragon frozen mid-manoeuvre, which is the "photograph of a dragon"
          // bug in `fly()` by another route.
          stopUnwinding();
          settleToFlight();
        } else if (started && !circling && direction === 'up') {
          // Leaving upward mid-entrance with no reversal running — the reader
          // outran the rewind's own cue. Put the scene back by hand.
          settleToFlight();
        } else if (started && !circling && !lit()) {
          /*
           * ⚠️ AND THE SAME THING FORWARDS — the half that was missing, and the
           * whole of «أوقات بيلاج، أوقات بيشتغل».
           *
           * The entrance is 6.13s and the flame leaves the jaws at 4.87s of it,
           * so the LAST second of the clip is the fire catching — and the
           * looping blaze only takes over on the ride's `ended`. Scrolling down
           * out of the section lands here before that: measured on production
           * at an ordinary wheel pace, `flightTrigger`'s `bottom top` fired with
           * the ride at 5.88s, a quarter of a second short, so `ended` never
           * came, `cross()` never ran, and the reader was left looking at ONE
           * FROZEN FRAME of fire. Not a dragon breathing — a photograph of a
           * dragon breathing.
           *
           * That is why it was intermittent. Scroll slowly enough and the clip
           * reaches 6.13 on its own, hands over, and the fire loops forever;
           * scroll at any normal pace and it freezes a fifth of a second from
           * the end. Two passes over the same section, same build, opposite
           * results — which is exactly what "sometimes it lags, sometimes it
           * works" describes.
           *
           * So the hand-over is completed by hand. The ride is parked on the
           * frame the blaze was cut to follow (so a later `rewind()` starts from
           * the frame it expects) and the blaze is put on screen at its head.
           * The `pause()` pair below then leaves the scene lit and idle, and
           * `resume()` picks the fire back up when the reader returns.
           *
           * Deliberately NOT `cross()`: that waits on a `seeked` event to make
           * the join frame-perfect, and the `blaze.pause()` two lines down would
           * run before the callback — leaving the blaze to start playing
           * off-screen, which is the one thing `idle()` exists to prevent. There
           * is no join to protect here anyway; the screen is somewhere else.
           */
          ride.currentTime = seekTo(LAST_FRAME);
          blaze.currentTime = 0;
          blaze.style.opacity = '1';
          ride.style.opacity = '0';
        }
        ride.pause();
        blaze.pause();
      },
    };

    return () => {
      circling = false;
      stopUnwinding();
      stopCircling();
      ride.removeEventListener('ended', cross);
      ride.removeEventListener('timeupdate', backstop);
      // ⚠️ AND THE CLIPS ARE STOPPED, because this teardown does not mean the
      // elements are going away — see the note at the top of this effect. A
      // reader who leaves the landing page while the fire is burning leaves a
      // `<video>` looping in a page they can no longer see: alpha VP9 at 960px,
      // fifteen times a second, decoding for nobody, for as long as they stay
      // on whatever they opened. Nothing here is rewound, so coming back finds
      // the scene where it was left.
      ride.pause();
      blaze.pause();
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
