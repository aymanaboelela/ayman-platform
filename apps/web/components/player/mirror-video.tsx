'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
// Type-only: erased at build, so it cannot pull the library into the bundle
// the way a value import would (see `HlsHandle` below).
import type { HlsConfig } from 'hls.js';
import { effectiveSeconds, type PlayerVideoMirror, type VideoTrim } from '@ayman/contracts/video';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import type { YouTubePlayer } from '@/lib/youtube';
import { skipCuts, trimWindow, watchedAt } from '@/lib/video-trim';
import { PlayerChrome, SPEEDS, readSavedSpeed, saveSpeed } from './player-chrome';

const c = copy.player.controls;

/**
 * ══════════════════════════════════════════════════════════════════════════
 * «النسخة اللي عندنا» — the lesson playing from our own origin.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This component exists for the students the YouTube player could never
 * reach. On the ministry tablet YouTube is blocked at the network, and the
 * three fallbacks the embed player walks through — the nocookie host, the
 * ordinary host, then a link — are three doors into the same shut building.
 * The bytes have to come from an origin the tablet already allows, and the
 * platform they are logged into is one.
 *
 * ── Why our own controls, when the element has perfectly good ones ───────
 * It did, and it was the right call while this was a YouTube fallback. Two
 * asks changed it once lectures started being UPLOADED here, and both are
 * things the built-in bar cannot do:
 *
 *   * «يتحكم في السرعة والجودة زي يوتيوب». Speed hid behind the browser's
 *     own ⋮ menu — on some browsers, not at all on others — and the quality
 *     was automatic with no way to choose.
 *   * «مينفعش حد ينزّل الفيديو». Chrome's bar carries «تنزيل», and its
 *     fullscreen button fullscreens the <video> ELEMENT — which drops every
 *     overlay, so the student's name over the picture vanished exactly when
 *     someone was recording the screen. Here fullscreen is the shell around
 *     the player (see `VideoLesson.toggleFullscreen`), and the name stays.
 *
 * What the bar keeps from the element is the part that matters most: the
 * browser's own playback, buffering and recovery. Only the chrome is ours —
 * and it lives in `player-chrome.tsx` now, because YouTube's frame wears the
 * same one. This file is the half that knows it is a `<video>`.
 *
 * ── Why HLS at all, rather than one mp4 ───────────────────────────────────
 * Adaptive bitrate is the difference between "works" and "works like
 * YouTube". A single 1080p file on a classroom connection buffers every
 * thirty seconds; the ladder lets the browser drop to 480p for a minute and
 * come back up. Safari does that natively for an `.m3u8`; every other engine
 * needs hls.js, imported dynamically so the ~120KB only ever reaches a student
 * who is actually about to use it. Choosing a quality BY HAND is only possible
 * on the hls.js path — a native player does not expose its rungs — so on the
 * few phones that play natively the quality menu simply is not offered.
 */

export interface MirrorVideoProps {
  mirror: PlayerVideoMirror;
  title: string;
  posterUrl: string | null;
  /** Where to start, in seconds. Applied once, on first metadata. */
  startAt: number;
  /**
   * Hand the heartbeat a player-shaped object once playback can report a
   * position, and `null` when it can no longer.
   */
  onPlayer: (player: YouTubePlayer | null) => void;
  /**
   * Called when our copy cannot play at all. The caller's answer is to fall
   * back to YouTube, or to say plainly that an uploaded lecture failed.
   */
  onFatal: () => void;
  /** The shell's fullscreen — owned by `VideoLesson`, which wraps this. */
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  /**
   * Who is watching — drawn faintly over the picture and moved every few
   * seconds. `null` draws nothing (an admin preview, a signed-out render).
   */
  watermark: string | null;
}

/** `HTMLMediaElement.readyState` values the heartbeat treats as playing. */
const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_ENDED = 0;

/**
 * Make a `<video>` answer the three questions the heartbeat asks a YouTube
 * player. An adapter rather than a second heartbeat: the completion rules
 * are subtle, already written and already tested.
 */
function adapt(element: HTMLVideoElement, trim: VideoTrim | null): YouTubePlayer {
  const full = () => (Number.isFinite(element.duration) ? element.duration : 0);
  return {
    getCurrentTime: () => element.currentTime,
    // «قص الفيديو»: the lecture ENDS where the instructor cut it, so completion
    // is reached there — not at the end of a file the student never sees.
    getDuration: () => trimWindow(trim, full()).end,
    getPlayerState: () => {
      if (element.ended) return YT_ENDED;
      if (trim?.end != null && element.currentTime >= trim.end - 0.25) return YT_ENDED;
      return element.paused ? YT_PAUSED : YT_PLAYING;
    },
    playVideo: () => void element.play().catch(() => undefined),
    destroy: () => undefined,
  };
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * «الفيديو بيلاج — مش عاوز أي لاج خالص»
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Measured on production: a 6-second 1080p segment is 1.5–1.7 MB, and until
 * the edge caches them each one is a 0.3–0.8 s round trip to the bucket. The
 * cache rule is the fix for the round trip; these are the fix for what the
 * player does with it. hls.js ships defaults tuned for a desktop on a fast
 * line, and a student on Egyptian mobile data is neither.
 */
export const HLS_CONFIG: Partial<HlsConfig> = {
  /*
   * The rung is chosen by measured bandwidth, never "the first one in the
   * playlist" — which is the top rung in ours, and the one most likely to
   * stall on a phone.
   */
  startLevel: -1,
  /*
   * What hls.js assumes the line can do before it has timed a single
   * segment. The default is 500 kbps — a guess from a decade ago that pins
   * the first seconds of every lecture to the bottom rung, so the lecture
   * OPENS blurry on a line that could carry 720p. 1.5 Mbps is a middling
   * 4G connection here: high enough to start at a readable rung, low enough
   * that a slow line is corrected within a segment or two.
   */
  abrEwmaDefaultEstimate: 1_500_000,
  /*
   * Never fetch more pixels than the player shows. A 1080p segment is
   * three times a 480p one, and on a phone in portrait the player is 360
   * pixels wide — every byte above that is data spent on nothing and a
   * segment that arrives later than it had to.
   */
  capLevelToPlayerSize: true,
  /*
   * Keep a minute ahead. The default 30 s runs out after five segments,
   * and one slow request from an uncached edge is enough to catch up with
   * the playhead and freeze the picture. A minute rides out a bad patch;
   * much more than that is data spent on a lecture the student may close.
   */
  maxBufferLength: 60,
  /*
   * The ceiling hls.js may grow the buffer to when the line is fast and
   * segments are small. Two minutes, not the default ten: a student on a
   * data bundle who stops at minute twelve should not have paid for
   * minute twenty-two.
   */
  maxMaxBufferLength: 120,
  /*
   * Let go of what has been watched, beyond the last half-minute. The
   * default keeps EVERY played second in the SourceBuffer for the whole
   * hour, and on a 2 GB Android tablet that ends in a QuotaExceeded error
   * and a stall half-way through the lecture. Thirty seconds still covers
   * «رجوع ١٠ ثواني» three times over without a refetch.
   */
  backBufferLength: 30,
  /*
   * Ask for the first segment while the playlist is still being wired to
   * the element, instead of after. Shaves one round trip — the 0.3–0.8 s
   * above — off the gap between the tap and the first frame.
   */
  startFragPrefetch: true,
};

/** The slice of hls.js this component touches, so the type never has to be
 *  imported eagerly (which would pull the library into every student's bundle). */
interface HlsHandle {
  destroy: () => void;
  currentLevel: number;
  levels: { height: number }[];
}

interface Level {
  index: number;
  height: number;
}

export function MirrorVideo({
  mirror,
  title,
  posterUrl,
  startAt,
  onPlayer,
  onFatal,
  fullscreen,
  onToggleFullscreen,
  watermark,
}: MirrorVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsHandle | null>(null);
  const [seeked, setSeeked] = useState(false);

  const [paused, setPaused] = useState(true);
  const [waiting, setWaiting] = useState(false);
  /*
   * `time` and `buffered` are held in WHOLE SECONDS, not as the element
   * reports them.
   *
   * `timeupdate` fires about four times a second and `progress` about three,
   * and each `setState` with a new float re-rendered this and the whole bar
   * over the picture — work on the same main thread that is appending
   * segments. The clock prints seconds, and a second of an hour-long lecture
   * is a tenth of a pixel on a phone's timeline, so a finer value was never
   * visible; floored, React skips every update that lands on the same second.
   */
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [levels, setLevels] = useState<Level[]>([]);
  const [level, setLevel] = useState(-1);
  const [autoHeight, setAutoHeight] = useState<number | null>(null);
  /** «قص الفيديو» — what of the file the student sees. `null` = all of it. */
  const trim = mirror.trim ?? null;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let disposed = false;
    const preferred = readSavedSpeed();

    /*
     * hls.js FIRST wherever it can run, the element's own HLS only where it
     * cannot.
     *
     * The order used to be the other way — native whenever `canPlayType`
     * said yes — and that was right while native meant Safari. It no longer
     * does: Chrome plays HLS natively too now, and a native player exposes no
     * rungs, so the quality menu silently vanished on the browser most
     * students use. hls.js runs on everything with Media Source Extensions
     * (and `ManagedMediaSource` on an iPhone since iOS 17.1); the native path
     * is kept for the phones that have neither.
     */
    const playNatively = () => {
      if (element.canPlayType('application/vnd.apple.mpegurl') === '') {
        onFatal();
        return;
      }
      element.src = mirror.hlsUrl;
      element.playbackRate = preferred;
      onPlayer(adapt(element, trim));
    };

    void import('hls.js')
      .then(({ default: Hls }) => {
        if (disposed) return;
        if (!Hls.isSupported()) {
          playNatively();
          return;
        }

        const instance = new Hls(HLS_CONFIG);
        hlsRef.current = instance;

        instance.on(Hls.Events.MANIFEST_PARSED, () => {
          setLevels(
            instance.levels
              .map((rung, index) => ({ index, height: rung.height }))
              .sort((a, b) => b.height - a.height),
          );
        });
        instance.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
          setAutoHeight(instance.levels[data.level]?.height ?? null);
        });
        instance.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          /*
           * The KEY, not the bytes. An encrypted lecture's key comes from
           * our API with the student's session, and a refusal there — the
           * session expired, the subscription lapsed — is an answer, not a
           * dropped packet. `startLoad()` below would ask for it again
           * forever behind a spinner; this says it could not play instead.
           */
          if (
            data.details === Hls.ErrorDetails.KEY_LOAD_ERROR ||
            data.details === Hls.ErrorDetails.KEY_LOAD_TIMEOUT
          ) {
            onFatal();
            return;
          }
          // Fatal network and media errors are recoverable often enough that
          // hls.js ships the recovery calls. Only give up when it does not.
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            instance.startLoad();
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            instance.recoverMediaError();
            return;
          }
          onFatal();
        });

        instance.loadSource(mirror.hlsUrl);
        instance.attachMedia(element);
        element.playbackRate = preferred;
        onPlayer(adapt(element, trim));
      })
      .catch(() => {
        // The chunk itself did not arrive — the element may still manage.
        if (!disposed) playNatively();
      });

    return () => {
      disposed = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      onPlayer(null);
    };
    // `onPlayer`/`onFatal` are stable callbacks from the parent; re-running
    // this effect on an identity change would tear down a playing video.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mirror.hlsUrl]);

  /* ── actions — what the chrome's buttons do to a `<video>` ─────────────── */

  const togglePlay = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    if (element.paused || element.ended) void element.play().catch(() => undefined);
    else element.pause();
  }, []);

  const seekBy = useCallback((delta: number) => {
    const element = ref.current;
    if (!element) return;
    const full = Number.isFinite(element.duration) ? element.duration : element.currentTime + delta;
    const { start, end } = trimWindow(trim, full);
    element.currentTime = skipCuts(Math.min(Math.max(start, element.currentTime + delta), end), trim);
  }, [trim]);

  const seekTo = useCallback((value: number) => {
    const element = ref.current;
    if (element) element.currentTime = skipCuts(value, trim);
  }, [trim]);

  const toggleMute = useCallback(() => {
    const element = ref.current;
    if (element) element.muted = !element.muted;
  }, []);

  const chooseVolume = useCallback((value: number) => {
    const element = ref.current;
    if (!element) return;
    element.volume = value;
    element.muted = element.volume === 0;
  }, []);

  const chooseSpeed = useCallback((value: number) => {
    const element = ref.current;
    if (element) element.playbackRate = value;
    saveSpeed(value);
  }, []);

  const chooseLevel = useCallback((index: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    // `currentLevel` switches now and flushes the buffer, which is what a
    // student who just picked 1080p expects to see. -1 hands it back to ABR.
    hls.currentLevel = index;
    setLevel(index);
  }, []);

  // The bar spans only what the student sees: `[start, end]` of the file.
  const window_ = trimWindow(trim, duration);
  const span = window_.end - window_.start;
  const played = span > 0 ? Math.min(100, Math.max(0, ((time - window_.start) / span) * 100)) : 0;
  const loaded = span > 0 ? Math.min(100, Math.max(0, ((buffered - window_.start) / span) * 100)) : 0;
  const shownTime = watchedAt(Math.min(time, window_.end), trim);
  const shownDuration = trim === null ? duration : effectiveSeconds(trim, duration);
  const qualityLabel =
    level === -1
      ? autoHeight !== null
        ? formatCopy(c.qualityAutoNow, { height: autoHeight })
        : c.qualityAuto
      : `${levels.find((rung) => rung.index === level)?.height ?? ''}p`;

  return (
    <PlayerChrome
      title={title}
      className="bg-black"
      paused={paused}
      waiting={waiting}
      timeline={{
        min: window_.start,
        max: window_.end,
        value: time,
        played,
        loaded,
      }}
      shownTime={shownTime}
      shownDuration={shownDuration}
      onTogglePlay={togglePlay}
      onSeekBy={seekBy}
      onSeekTo={seekTo}
      muted={muted}
      volume={volume}
      onToggleMute={toggleMute}
      onVolume={chooseVolume}
      speed={speed}
      speeds={SPEEDS}
      onSpeed={chooseSpeed}
      settingsExtra={
        levels.length > 1 ? (
          <>
            <p className="mt-3 text-[length:var(--fs-text-xs)] font-semibold text-white/70">
              {c.quality} · <span dir="ltr">{qualityLabel}</span>
            </p>
            <div className="mt-2 grid grid-cols-3 gap-1.5" dir="ltr">
              <QualityItem wide selected={level === -1} onClick={() => chooseLevel(-1)}>
                <span dir="rtl">
                  {autoHeight !== null ? formatCopy(c.qualityAutoNow, { height: autoHeight }) : c.qualityAuto}
                </span>
              </QualityItem>
              {levels.map((rung) => (
                <QualityItem key={rung.index} selected={level === rung.index} onClick={() => chooseLevel(rung.index)}>
                  <span className="mono">{rung.height}p</span>
                </QualityItem>
              ))}
            </div>
          </>
        ) : null
      }
      fullscreen={fullscreen}
      onToggleFullscreen={onToggleFullscreen}
      watermark={watermark}
    >
      <video
        ref={ref}
        className="absolute inset-0 h-full w-full"
        playsInline
        autoPlay
        poster={posterUrl ?? undefined}
        preload="metadata"
        // Belt and braces for the built-in surfaces that remain: no download
        // entry, no picture-in-picture window (which would carry the picture
        // without the name over it), no casting to another screen.
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        disableRemotePlayback
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onEnded={() => setPaused(true)}
        onWaiting={() => setWaiting(true)}
        // The poster's tap asks for playback before there is anything to play
        // (see `VideoLesson.activate`), so between the tap and the first frame
        // the element is playing-but-empty — and `waiting` never fires for a
        // load that has not started. Without this the middle of the picture
        // is blank for that second; with it, the spinner. Only when playback
        // was asked for: a refused play keeps the play disc instead.
        onLoadStart={(event) => {
          if (!event.currentTarget.paused) setWaiting(true);
        }}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onTimeUpdate={(event) => {
          const element = event.currentTarget;
          const t = element.currentTime;
          if (trim !== null) {
            // Over a cut, and to a stop where the lecture was cut short.
            const skipped = skipCuts(t, trim);
            if (skipped !== t) element.currentTime = skipped;
            if (trim.end !== null && t >= trim.end && !element.paused) {
              element.pause();
              element.currentTime = trim.end;
            }
          }
          setTime(Math.floor(element.currentTime));
        }}
        onDurationChange={(event) => {
          const value = event.currentTarget.duration;
          setDuration(Number.isFinite(value) ? value : 0);
        }}
        onProgress={(event) => {
          const ranges = event.currentTarget.buffered;
          setBuffered(ranges.length > 0 ? Math.floor(ranges.end(ranges.length - 1)) : 0);
        }}
        onVolumeChange={(event) => {
          setMuted(event.currentTarget.muted);
          setVolume(event.currentTarget.volume);
        }}
        onRateChange={(event) => setSpeed(event.currentTarget.playbackRate)}
        onLoadedMetadata={(event) => {
          // One seek, on the first metadata event only: `loadedmetadata` fires
          // again on every quality change in the native Safari path.
          // The instructor's start wins over a resume point before it.
          const target = skipCuts(Math.max(startAt, trim?.start ?? 0), trim);
          if (seeked || target <= 0) return;
          setSeeked(true);
          event.currentTarget.currentTime = target;
        }}
      />
    </PlayerChrome>
  );
}

function QualityItem({
  selected,
  onClick,
  wide = false,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  /** «تلقائي» takes the whole first row — it is the default, and it is longer. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'rounded-md px-2 py-1.5 text-center text-[length:var(--fs-text-sm)] transition-colors duration-[160ms]',
        wide && 'col-span-3',
        selected ? 'bg-accent font-semibold text-[#1A1206]' : 'bg-white/10 hover:bg-white/20',
      )}
    >
      {children}
    </button>
  );
}
