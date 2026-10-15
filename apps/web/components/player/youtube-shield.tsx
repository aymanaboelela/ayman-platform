'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { YT_STATE, type YouTubeApiPlayer } from '@/lib/youtube';
import { copy } from '@ayman/contracts/copy';
import { PlayerChrome, SPEEDS, readSavedSpeed, saveSpeed } from './player-chrome';
import { QualityItem } from './quality-item';

const c = copy.player.controls;

/** YouTube's level names, tallest first, with the height a student reads. Anything else it lists («auto», «highres», «tiny») is not offered. */
const QUALITY_HEIGHTS: ReadonlyArray<readonly [string, number]> = [
  ['hd1080', 1080],
  ['hd720', 720],
  ['large', 480],
  ['medium', 360],
  ['small', 240],
];

/** The levels this video offers, in `QUALITY_HEIGHTS` order. */
function offeredQualities(available: readonly string[]): Array<readonly [string, number]> {
  return QUALITY_HEIGHTS.filter(([level]) => available.includes(level));
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * «شيلها من الفيديوهات اللي بتتعرض يوتيوب» — YouTube's frame, behind glass.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The embed carries its own doors to the video's address: the copy-link
 * button in the corner, the title and the channel along the top, the logo,
 * «مشاهدة على يوتيوب», the right-click menu. Any one of them hands a student
 * a link that plays the lecture to someone who never paid for it.
 *
 * So YouTube draws no controls (`controls: 0` in `video-lesson.tsx`), and
 * this lays `PlayerChrome` — the bar our own copy already wears — over the
 * whole frame. The chrome takes every pointer event, so nothing inside the
 * frame is ever pressed; the frame is `inert`, so Tab cannot walk into it
 * either. Everything the student does goes through the IFrame API instead.
 *
 * What it cannot do: stop a determined viewer. The id is in the page source
 * and in the frame's `src` for anyone who opens DevTools. This closes the
 * doors YouTube put in front of every student, not the ones a developer can
 * find — the moving name over the picture is what answers those.
 */

export interface YouTubeShieldProps {
  /** From `onReady` on — before that, its methods do not exist yet. */
  player: YouTubeApiPlayer;
  /** The last `onStateChange` — a `YT_STATE` value. */
  state: number;
  title: string;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  watermark: string | null;
  /** The student turned YouTube's captions on or off — the frame's crop follows it. */
  onCaptionsChange?: (on: boolean) => void;
}

/**
 * The API reports no `timeupdate`; the playhead is only ever a question. Four
 * times a second is what a `<video>` fires `timeupdate` at, so the bar moves
 * the way it does on our own copy.
 */
const POLL_MS = 250;

/**
 * How long our own writes win over what the poll reads back.
 *
 * The API answers from a cache the frame refreshes by `postMessage`, so the
 * first poll after a seek or a mute can still carry the old value — and the
 * thumb would jump back to where it was, then forward again.
 */
const HOLD_MS = 700;

/**
 * A SEEK holds longer, and lets go early once YouTube agrees.
 *
 * 700 ms was measured on a fast line. On mobile data the frame can take two
 * or three seconds to report the new second, and until it does every poll
 * dragged the thumb back to where the student had just left — the seek looked
 * refused, so they seeked again, which restarted the fetch. The hold now
 * lasts until the reported time is within `SEEK_SETTLED_S` of the target, or
 * this long has passed (a seek past the end, a video YouTube clamps).
 */
const SEEK_HOLD_MS = 4_000;
const SEEK_SETTLED_S = 1.5;

/**
 * How long a play we asked for may take to start before the shield steps
 * aside for YouTube's own play button.
 *
 * An iPhone will not start an embed from script until someone has touched
 * the frame itself, and the whole point here is that nobody can. So if
 * `playVideo()` has not turned into PLAYING within this long, the middle of
 * the chrome opens (`.pc-keyhole`) over YouTube's play button — only there,
 * away from the title and the copy-link button along the edges — and closes
 * for good the first time the lecture plays. Anywhere a scripted play works,
 * which is everywhere a student does not use an iPhone, the hole never opens.
 *
 * Long enough for a slow connection to get from BUFFERING to PLAYING, which
 * is the one case where opening it is a false alarm — and a harmless one: all
 * it exposes is YouTube's spinner.
 */
const START_GRACE_MS = 4_000;

export function YouTubeShield({
  player,
  state,
  title,
  fullscreen,
  onToggleFullscreen,
  watermark,
  onCaptionsChange,
}: YouTubeShieldProps) {
  // Whole seconds, like our own copy's — see `mirror-video.tsx` for why a
  // finer value was only ever re-renders nobody could see.
  const [time, setTime] = useState(() => Math.floor(player.getCurrentTime()));
  const [duration, setDuration] = useState(() => player.getDuration());
  const [loaded, setLoaded] = useState(0);
  const [volume, setVolume] = useState(() => player.getVolume() / 100);
  const [muted, setMuted] = useState(() => player.isMuted());
  const [speed, setSpeed] = useState(() => player.getPlaybackRate());
  // The levels exist only once the video is playing, so the poll fills them.
  const [qualities, setQualities] = useState<Array<readonly [string, number]>>([]);
  const [quality, setQuality] = useState<string | null>(null);
  /**
   * Our speeds, less the ones this video will not play at. A live stream
   * offers `[1]` alone, and then there is no speed menu at all rather than
   * six buttons that do nothing.
   */
  const [speeds] = useState(() => {
    const offered = player.getAvailablePlaybackRates();
    return SPEEDS.filter((value) => offered.includes(value));
  });
  /**
   * What the student last ASKED for, which is what the bar shows.
   *
   * Not `state === PLAYING`: between «تشغيل» and the first frame the player
   * is UNSTARTED, then BUFFERING, and a bar that read those as "paused" would
   * flash the big play disc back up under the finger that just pressed it.
   * Starts `true`, because `onReady` in `video-lesson.tsx` has just called
   * `playVideo()` — the poster's tap is what built this player.
   */
  const [wantsPlay, setWantsPlay] = useState(true);
  const [everPlayed, setEverPlayed] = useState(state === YT_STATE.PLAYING);
  /**
   * Captions: whether this video HAS any, and whether they are showing.
   *
   * YouTube's CC button went with its bar — and a video whose uploader turned
   * captions on by default then showed them with no way to turn them off.
   * The API answers only the first question (`getOptions()` lists
   * `'captions'` when there are tracks, on or off), so the second is ours to
   * decide: the first time tracks are seen, they are switched OFF, and from
   * then on the button is the only thing that changes it. Off is where
   * YouTube itself starts anybody who has not asked for them.
   */
  const [captionsAvailable, setCaptionsAvailable] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [stalled, setStalled] = useState(false);
  const startTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hold = useRef({ time: 0, sound: 0, speed: 0, quality: 0 });
  /** Where the last seek we asked for is going — `null` once YouTube is there. */
  const seekTarget = useRef<number | null>(null);
  const captionsSeen = useRef(false);

  /*
   * YouTube's own word on what happened wins over our intent: a lecture that
   * ENDED, or that the phone paused for a call, shows the play disc again.
   * Adjusted while rendering, React's answer for state that follows a prop.
   */
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    if (state === YT_STATE.PLAYING) {
      setWantsPlay(true);
      setEverPlayed(true);
    } else if (state === YT_STATE.PAUSED || state === YT_STATE.ENDED) {
      setWantsPlay(false);
    }
  }

  const keyhole = stalled && !everPlayed;

  const armStartCheck = useCallback(() => {
    if (startTimer.current) clearTimeout(startTimer.current);
    startTimer.current = setTimeout(() => {
      startTimer.current = null;
      // Read against `everPlayed` at render, not here — see `keyhole`.
      setStalled(true);
    }, START_GRACE_MS);
  }, []);

  useEffect(() => {
    // The play `onReady` just asked for is on the clock from the moment this
    // mounts, which is that same moment.
    armStartCheck();

    // The student's speed, the one our own copy remembers too.
    const preferred = readSavedSpeed();
    if (preferred !== 1 && player.getAvailablePlaybackRates().includes(preferred)) {
      player.setPlaybackRate(preferred);
    }

    return () => {
      if (startTimer.current) clearTimeout(startTimer.current);
      startTimer.current = null;
    };
  }, [player, armStartCheck]);

  useEffect(() => {
    const id = setInterval(() => {
      try {
        const now = Date.now();
        const total = player.getDuration();
        setDuration(total);
        setLoaded(Math.floor(player.getVideoLoadedFraction() * total));
        const current = player.getCurrentTime();
        const target = seekTarget.current;
        if (target !== null && (now >= hold.current.time || Math.abs(current - target) < SEEK_SETTLED_S)) {
          seekTarget.current = null;
          hold.current.time = 0;
        }
        if (now >= hold.current.time) setTime(Math.floor(current));
        if (now >= hold.current.sound) {
          setMuted(player.isMuted());
          setVolume(player.getVolume() / 100);
        }
        if (now >= hold.current.speed) setSpeed(player.getPlaybackRate());
        if (player.getAvailableQualityLevels && player.getPlaybackQuality) {
          const offered = offeredQualities(player.getAvailableQualityLevels());
          setQualities((prev) =>
            prev.length === offered.length && prev.every((q, i) => q[0] === offered[i]![0]) ? prev : offered,
          );
          if (now >= hold.current.quality) setQuality(player.getPlaybackQuality());
        }
        // Read once. The list says "this video has tracks" and nothing more —
        // it still lists the module after `unloadModule` has hidden them —
        // so after the first sighting there is nothing left to learn from it.
        if (!captionsSeen.current && player.getOptions?.().includes('captions')) {
          captionsSeen.current = true;
          player.unloadModule?.('captions');
          setCaptionsAvailable(true);
        }
      } catch {
        // The frame went away under us (the page is tearing down). The next
        // render unmounts this; there is nothing to show until then.
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [player]);

  /*
   * The hole has to reach the frame itself: an `inert` frame takes no tap
   * even where nothing covers it. Only while the hole is open — the rest of
   * the time, Tab must not be able to walk into YouTube's buttons either.
   */
  useEffect(() => {
    const frame = player.getIframe?.();
    if (frame) frame.inert = !keyhole;
  }, [player, keyhole]);

  /* ── actions — what the chrome's buttons do through the IFrame API ───── */

  const togglePlay = useCallback(() => {
    if (wantsPlay) {
      player.pauseVideo();
      setWantsPlay(false);
      return;
    }
    player.playVideo();
    setWantsPlay(true);
    // Every play until the first one lands is a chance for the hole to be
    // needed; after it, scripted play works on every engine.
    if (!everPlayed) armStartCheck();
  }, [player, wantsPlay, everPlayed, armStartCheck]);

  const seekTo = useCallback(
    (value: number) => {
      const target = Math.max(0, duration > 0 ? Math.min(value, duration) : value);
      player.seekTo(target, true);
      seekTarget.current = target;
      hold.current.time = Date.now() + SEEK_HOLD_MS;
      setTime(Math.floor(target));
    },
    [player, duration],
  );

  /*
   * From where the LAST seek is going, while it is still on its way. Three
   * quick presses of «+١٠» read the playhead three times before the frame
   * had reported the first jump, so they all landed on the same +10.
   */
  const seekBy = useCallback(
    (delta: number) => seekTo((seekTarget.current ?? player.getCurrentTime()) + delta),
    [player, seekTo],
  );

  const toggleMute = useCallback(() => {
    if (muted) player.unMute();
    else player.mute();
    hold.current.sound = Date.now() + HOLD_MS;
    setMuted(!muted);
  }, [player, muted]);

  const chooseVolume = useCallback(
    (value: number) => {
      player.setVolume(Math.round(value * 100));
      if (value === 0) player.mute();
      else player.unMute();
      hold.current.sound = Date.now() + HOLD_MS;
      setVolume(value);
      setMuted(value === 0);
    },
    [player],
  );

  const chooseSpeed = useCallback(
    (value: number) => {
      player.setPlaybackRate(value);
      saveSpeed(value);
      hold.current.speed = Date.now() + HOLD_MS;
      setSpeed(value);
    },
    [player],
  );

  const chooseQuality = useCallback(
    (level: string) => {
      player.setPlaybackQualityRange?.(level, level);
      hold.current.quality = Date.now() + HOLD_MS;
      setQuality(level);
    },
    [player],
  );

  const toggleCaptions = useCallback(() => {
    if (captionsOn) player.unloadModule?.('captions');
    else player.loadModule?.('captions');
    setCaptionsOn(!captionsOn);
    onCaptionsChange?.(!captionsOn);
  }, [player, captionsOn, onCaptionsChange]);

  const played = duration > 0 ? Math.min(100, Math.max(0, (time / duration) * 100)) : 0;
  const fetched = duration > 0 ? Math.min(100, Math.max(0, (loaded / duration) * 100)) : 0;

  return (
    <PlayerChrome
      title={title}
      paused={!wantsPlay}
      waiting={wantsPlay && state !== YT_STATE.PLAYING}
      timeline={{ min: 0, max: duration, value: time, played, loaded: fetched }}
      shownTime={Math.min(time, duration || time)}
      shownDuration={duration}
      onTogglePlay={togglePlay}
      onSeekBy={seekBy}
      onSeekTo={seekTo}
      muted={muted}
      volume={volume}
      onToggleMute={toggleMute}
      onVolume={chooseVolume}
      speed={speed}
      speeds={speeds}
      onSpeed={chooseSpeed}
      settingsExtra={
        // Only where the player answers both questions: which levels, and pin one.
        qualities.length > 1 && player.setPlaybackQualityRange ? (
          <>
            <p className="mt-3 text-[length:var(--fs-text-xs)] font-semibold text-white/70">{c.quality}</p>
            <div className="mt-2 grid grid-cols-3 gap-1.5" dir="ltr">
              {qualities.map(([level, height]) => (
                <QualityItem key={level} selected={quality === level} onClick={() => chooseQuality(level)}>
                  <span className="mono">{height}p</span>
                </QualityItem>
              ))}
            </div>
          </>
        ) : null
      }
      captions={
        // Both halves of the undocumented pair, or no button: one without
        // the other is a toggle that works in one direction only.
        captionsAvailable && player.loadModule && player.unloadModule
          ? { on: captionsOn, onToggle: toggleCaptions }
          : null
      }
      fullscreen={fullscreen}
      onToggleFullscreen={onToggleFullscreen}
      watermark={watermark}
      keyhole={keyhole}
    />
  );
}
