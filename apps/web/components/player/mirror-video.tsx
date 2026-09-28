'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Pause, Play, RotateCcw, RotateCw, Settings, Volume2, VolumeX } from 'lucide-react';
import { effectiveSeconds, type PlayerVideoMirror, type VideoTrim } from '@ayman/contracts/video';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import type { YouTubePlayer } from '@/lib/youtube';
import { skipCuts, trimWindow, watchedAt } from '@/lib/video-trim';
import { FullscreenIcon } from './icons';
import './mirror-video.css';

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
 * browser's own playback, buffering and recovery. Only the chrome is ours.
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

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const SEEK_STEP = 10;
const HIDE_AFTER_MS = 2500;
/** Often enough that no stretch of a recording stays clean for long. */
const WATERMARK_MOVE_MS = 5_000;
const SPEED_KEY = 'ayman:player:speed';

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

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function readSavedSpeed(): number {
  try {
    const saved = Number(window.localStorage.getItem(SPEED_KEY));
    return (SPEEDS as readonly number[]).includes(saved) ? saved : 1;
  } catch {
    return 1;
  }
}

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
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef<{ at: number; side: 'start' | 'end' } | null>(null);
  const [seeked, setSeeked] = useState(false);

  const [paused, setPaused] = useState(true);
  const [waiting, setWaiting] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [levels, setLevels] = useState<Level[]>([]);
  const [level, setLevel] = useState(-1);
  const [autoHeight, setAutoHeight] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [controlsShown, setControlsShown] = useState(true);
  const [flash, setFlash] = useState<'back' | 'forward' | null>(null);
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

        const instance = new Hls({
          // The ministry tablet's connection is the design target: start
          // conservatively and let the ladder climb.
          startLevel: -1,
          capLevelToPlayerSize: true,
        });
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

  /* ── controls that hide themselves while the lecture plays ───────────── */

  const reveal = useCallback(() => {
    setControlsShown(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      const element = ref.current;
      if (element && !element.paused) setControlsShown(false);
    }, HIDE_AFTER_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  // A paused lecture, or an open menu, keeps the bar on screen.
  const barVisible = controlsShown || paused || menuOpen;

  /* ── actions ──────────────────────────────────────────────────────────── */

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
    setFlash(delta < 0 ? 'back' : 'forward');
    setTimeout(() => setFlash(null), 450);
  }, [trim]);

  const chooseSpeed = useCallback((value: number) => {
    const element = ref.current;
    if (element) element.playbackRate = value;
    try {
      window.localStorage.setItem(SPEED_KEY, String(value));
    } catch {
      /* private window — the choice still holds for this lecture */
    }
  }, []);

  const chooseLevel = useCallback((index: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    // `currentLevel` switches now and flushes the buffer, which is what a
    // student who just picked 1080p expects to see. -1 hands it back to ABR.
    hls.currentLevel = index;
    setLevel(index);
  }, []);

  /* ── keyboard: the YouTube keys, on the player only ───────────────────── */

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // A focused button already answers Space, and a focused slider already
      // answers the arrows — handling them here too would fire twice.
      if (event.target !== event.currentTarget && (event.code === 'Space' || event.code.startsWith('Arrow'))) return;
      // `code`, not `key`: on an Arabic layout K emits «ن».
      switch (event.code) {
        case 'Space':
        case 'KeyK':
          event.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
        case 'KeyJ':
          event.preventDefault();
          seekBy(-SEEK_STEP);
          break;
        case 'ArrowRight':
        case 'KeyL':
          event.preventDefault();
          seekBy(SEEK_STEP);
          break;
        case 'KeyM': {
          event.preventDefault();
          const element = ref.current;
          if (element) element.muted = !element.muted;
          break;
        }
        default:
          return;
      }
      reveal();
    },
    [togglePlay, seekBy, reveal],
  );

  /*
   * A tap on the picture.
   *
   * Mouse: play/pause, the way YouTube's desktop player does it. Touch: the
   * first tap only brings the bar back (a phone user reaching for a button
   * must not pause the lecture on the way), and a second tap within 300ms on
   * one half of the picture jumps ten seconds that way.
   */
  const onSurfacePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (menuOpen) {
        setMenuOpen(false);
        return;
      }
      if (event.pointerType === 'mouse') {
        togglePlay();
        reveal();
        return;
      }
      const box = event.currentTarget.getBoundingClientRect();
      const side = event.clientX - box.left < box.width / 2 ? 'start' : 'end';
      const now = Date.now();
      const previous = lastTap.current;
      if (previous && now - previous.at < 300 && previous.side === side) {
        lastTap.current = null;
        seekBy(side === 'start' ? -SEEK_STEP : SEEK_STEP);
        reveal();
        return;
      }
      lastTap.current = { at: now, side };
      if (barVisible && !paused) setControlsShown(false);
      else reveal();
    },
    [menuOpen, togglePlay, reveal, seekBy, barVisible, paused],
  );

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
    <div
      // LTR for the whole surface: the timeline, the ±10 buttons, the arrow
      // keys and the double-tap halves all have to agree on which way is back.
      dir="ltr"
      // A size container, so the settings menu can be capped at the PLAYER's
      // height — a phone in portrait gives it barely 200px.
      className={cn('absolute inset-0 select-none bg-black [container-type:size]', !barVisible && 'cursor-none')}
      tabIndex={0}
      role="region"
      aria-label={title}
      onKeyDown={onKeyDown}
      onPointerMove={(event) => {
        if (event.pointerType === 'mouse') reveal();
      }}
      // No «حفظ الفيديو باسم» — the menu that offers it is the browser's.
      onContextMenu={(event) => event.preventDefault()}
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
        onPlay={() => {
          setPaused(false);
          reveal();
        }}
        onPause={() => setPaused(true)}
        onEnded={() => setPaused(true)}
        onWaiting={() => setWaiting(true)}
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
          setTime(element.currentTime);
        }}
        onDurationChange={(event) => {
          const value = event.currentTarget.duration;
          setDuration(Number.isFinite(value) ? value : 0);
        }}
        onProgress={(event) => {
          const ranges = event.currentTarget.buffered;
          setBuffered(ranges.length > 0 ? ranges.end(ranges.length - 1) : 0);
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

      {watermark ? <Watermark text={watermark} /> : null}

      {/* The picture itself: the tap / double-tap surface. */}
      <div className="absolute inset-0 z-[6]" onPointerUp={onSurfacePointerUp} aria-hidden="true" />

      {waiting && !paused ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[7] m-auto size-12 animate-spin rounded-full border-2 border-white/30 border-t-white"
        />
      ) : null}

      {flash ? (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-1/2 z-[7] grid size-16 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white',
            flash === 'back' ? 'start-[12%]' : 'end-[12%]',
          )}
        >
          {flash === 'back' ? <RotateCcw className="size-7" /> : <RotateCw className="size-7" />}
        </span>
      ) : null}

      {paused && !waiting ? (
        <button
          type="button"
          onClick={togglePlay}
          aria-label={c.play}
          className="absolute inset-0 z-[8] m-auto grid size-16 place-items-center rounded-full bg-accent text-[#1A1206] shadow-lg"
        >
          <Play className="size-7 translate-x-0.5 fill-current" aria-hidden="true" />
        </button>
      ) : null}

      {/*
        The bar. Left to right, like the whole surface: a timeline runs that
        way in every player a student has ever used, Arabic interfaces included.
      */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 z-[9] bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2 pt-10',
          'transition-opacity duration-[200ms] ease-out',
          barVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <input
          type="range"
          className="mv-timeline"
          min={window_.start}
          max={window_.end || 0}
          step={0.1}
          value={Math.min(Math.max(time, window_.start), window_.end || 0)}
          aria-label={c.seek}
          aria-valuetext={`${clock(shownTime)} / ${clock(shownDuration)}`}
          style={{ '--mv-played': `${played}%`, '--mv-buffered': `${Math.max(played, loaded)}%` } as CSSProperties}
          onChange={(event) => {
            const element = ref.current;
            if (element) element.currentTime = skipCuts(Number(event.currentTarget.value), trim);
            reveal();
          }}
        />

        <div className="mt-1 flex items-center gap-1 text-white">
          <BarButton label={paused ? c.play : c.pause} onClick={togglePlay}>
            {paused ? <Play className="size-5 fill-current" /> : <Pause className="size-5 fill-current" />}
          </BarButton>
          {/* On a phone the double tap does this, the way YouTube's does — the
              bar there is too narrow to spend two buttons on it. */}
          <BarButton label={c.back} onClick={() => seekBy(-SEEK_STEP)} className="hidden sm:grid">
            <RotateCcw className="size-5" />
          </BarButton>
          <BarButton label={c.forward} onClick={() => seekBy(SEEK_STEP)} className="hidden sm:grid">
            <RotateCw className="size-5" />
          </BarButton>
          <BarButton
            label={muted || volume === 0 ? c.unmute : c.mute}
            onClick={() => {
              const element = ref.current;
              if (element) element.muted = !element.muted;
            }}
          >
            {muted || volume === 0 ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </BarButton>
          <input
            type="range"
            className="mv-volume hidden md:block"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            aria-label={c.volume}
            onChange={(event) => {
              const element = ref.current;
              if (!element) return;
              element.volume = Number(event.currentTarget.value);
              element.muted = element.volume === 0;
            }}
          />
          <span className="mono tabular ms-1 whitespace-nowrap text-[length:var(--fs-text-xs)] text-white/90">
            {clock(shownTime)} / {clock(shownDuration)}
          </span>

          <span className="ms-auto" />

          <div className="relative">
            <BarButton label={c.settings} onClick={() => setMenuOpen((open) => !open)} active={menuOpen}>
              <Settings className={cn('size-5 transition-transform duration-[200ms]', menuOpen && 'rotate-45')} />
              {speed !== 1 ? (
                <span className="mono absolute -top-0.5 end-0 rounded bg-accent px-1 text-[10px] font-bold leading-4 text-[#1A1206]">
                  {speed}x
                </span>
              ) : null}
            </BarButton>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute bottom-12 end-0 max-h-[calc(100cqh-4rem)] w-64 max-w-[80cqw] overflow-y-auto overscroll-contain rounded-lg border border-white/10 bg-black/85 p-3 text-white shadow-xl backdrop-blur-md"
              >
                {/* Anchored in the bar's LTR, read in Arabic. */}
                <div dir="rtl">
                <p className="text-[length:var(--fs-text-xs)] font-semibold text-white/70">{c.speed}</p>
                <div className="mt-2 grid grid-cols-3 gap-1.5" dir="ltr">
                  {SPEEDS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={speed === value}
                      onClick={() => chooseSpeed(value)}
                      className={cn(
                        'mono rounded-md px-2 py-1.5 text-[length:var(--fs-text-sm)] transition-colors duration-[160ms]',
                        speed === value ? 'bg-accent font-semibold text-[#1A1206]' : 'bg-white/10 hover:bg-white/20',
                      )}
                    >
                      {value === 1 ? c.speedNormal : `${value}x`}
                    </button>
                  ))}
                </div>

                {levels.length > 1 ? (
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
                ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <BarButton
            label={fullscreen ? copy.player.exitFullscreen : copy.player.enterFullscreen}
            onClick={onToggleFullscreen}
          >
            <FullscreenIcon exiting={fullscreen} />
          </BarButton>
        </div>
      </div>
    </div>
  );
}

function BarButton({
  label,
  onClick,
  active = false,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'relative grid size-10 place-items-center rounded-full transition-colors duration-[160ms] ease-out',
        'hover:bg-white/15 focus-visible:bg-white/15',
        active && 'bg-white/15',
        className,
      )}
    >
      {children}
    </button>
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

/**
 * The viewer's name over the picture, moved every few seconds.
 *
 * Not protection — nothing drawn by the page is — but attribution: a
 * screen-recorded lecture carries the account it came from, and that is what
 * stops a recording being passed around. Moving it is what keeps it from
 * being cropped out of one corner.
 */
function Watermark({ text }: { text: string }) {
  const [spot, setSpot] = useState({ top: 12, start: 8 });

  useEffect(() => {
    const move = () => setSpot({ top: 8 + Math.random() * 72, start: 4 + Math.random() * 56 });
    const id = setInterval(move, WATERMARK_MOVE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <span
      aria-hidden="true"
      className="mv-watermark"
      style={{ insetBlockStart: `${spot.top}%`, insetInlineStart: `${spot.start}%` }}
      dir="auto"
    >
      {text}
    </span>
  );
}
