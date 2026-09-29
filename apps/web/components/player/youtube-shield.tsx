'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { YT_STATE, type YouTubeApiPlayer } from '@/lib/youtube';
import { PlayerChrome, SPEEDS, readSavedSpeed, saveSpeed } from './player-chrome';

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
}: YouTubeShieldProps) {
  const [time, setTime] = useState(() => player.getCurrentTime());
  const [duration, setDuration] = useState(() => player.getDuration());
  const [loaded, setLoaded] = useState(0);
  const [volume, setVolume] = useState(() => player.getVolume() / 100);
  const [muted, setMuted] = useState(() => player.isMuted());
  const [speed, setSpeed] = useState(() => player.getPlaybackRate());
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
  const [stalled, setStalled] = useState(false);
  const startTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hold = useRef({ time: 0, sound: 0, speed: 0 });

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
        setLoaded(player.getVideoLoadedFraction() * total);
        if (now >= hold.current.time) setTime(player.getCurrentTime());
        if (now >= hold.current.sound) {
          setMuted(player.isMuted());
          setVolume(player.getVolume() / 100);
        }
        if (now >= hold.current.speed) setSpeed(player.getPlaybackRate());
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
      hold.current.time = Date.now() + HOLD_MS;
      setTime(target);
    },
    [player, duration],
  );

  const seekBy = useCallback((delta: number) => seekTo(player.getCurrentTime() + delta), [player, seekTo]);

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
      fullscreen={fullscreen}
      onToggleFullscreen={onToggleFullscreen}
      watermark={watermark}
      keyhole={keyhole}
    />
  );
}
