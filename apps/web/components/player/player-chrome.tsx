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
import { Captions, CaptionsOff, Pause, Play, RotateCcw, RotateCw, Settings, Volume2, VolumeX } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { cn } from '@ayman/ui/lib/cn';
import { FullscreenIcon } from './icons';
import './player-chrome.css';

const c = copy.player.controls;

/**
 * ══════════════════════════════════════════════════════════════════════════
 * The player's face — one bar, whichever source is underneath it.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This was the inside of `mirror-video.tsx`, written for our copy of the
 * lecture, where the browser's own bar offered «تنزيل» and dropped the name
 * over the picture in fullscreen. It moved out when YouTube's frame needed
 * the same bar: «شيلها من الفيديوهات اللي بتتعرض يوتيوب» — the copy-link
 * button in the corner of the embed, and every other door in YouTube's UI to
 * the video's address (the title, the logo, «مشاهدة على يوتيوب», the right-
 * click menu). YouTube draws no controls now, and this draws ours over it.
 *
 * It knows nothing about where the picture comes from. Each source hands it
 * numbers (where the playhead is, how much is fetched, the volume) and
 * callbacks, and keeps what only it knows: the `<video>` element and hls.js
 * for ours, the IFrame API for YouTube's. So the two cannot drift apart —
 * a new button or a fixed bug here reaches both.
 *
 * ── The layer IS the shield ─────────────────────────────────────────────
 * The whole surface is one element over the whole picture, and it takes
 * every pointer event: a tap, a click, a long press, a right-click. Over
 * YouTube's frame that is the entire point — nothing inside it is reachable
 * because nothing ever reaches it. That is also why no layer here may carry
 * `pointer-events-none` over the picture except the ones drawn ON TOP of
 * the surface below them.
 */

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export const SEEK_STEP = 10;
const HIDE_AFTER_MS = 2500;
/** Often enough that no stretch of a recording stays clean for long. */
const WATERMARK_MOVE_MS = 5_000;
/**
 * One preference for both sources. A student who watches at 1.5x does so on
 * every lecture, and which host a lesson happens to live on is not something
 * they know, let alone something their speed should depend on.
 */
const SPEED_KEY = 'ayman:player:speed';

export function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function readSavedSpeed(): number {
  try {
    const saved = Number(window.localStorage.getItem(SPEED_KEY));
    return (SPEEDS as readonly number[]).includes(saved) ? saved : 1;
  } catch {
    return 1;
  }
}

export function saveSpeed(value: number): void {
  try {
    window.localStorage.setItem(SPEED_KEY, String(value));
  } catch {
    /* private window — the choice still holds for this lecture */
  }
}

/** The timeline, in whatever seconds the source seeks in. */
export interface ChromeTimeline {
  min: number;
  max: number;
  value: number;
  /** 0–100, for the painted track. */
  played: number;
  loaded: number;
}

export interface PlayerChromeProps {
  title: string;
  /**
   * What plays underneath: the `<video>` for our copy. Nothing for YouTube —
   * the IFrame API REPLACES the node it is given with its frame, so that
   * frame has to live outside anything React re-renders, and the chrome is
   * laid over it as a sibling instead.
   */
  children?: ReactNode;
  /** `bg-black` under our own `<video>`; nothing over YouTube's frame, which has to show through. */
  className?: string;
  paused: boolean;
  waiting: boolean;
  timeline: ChromeTimeline;
  /** What the clock prints — for a trimmed lecture, not the same seconds as the timeline. */
  shownTime: number;
  shownDuration: number;
  onTogglePlay: () => void;
  onSeekBy: (delta: number) => void;
  onSeekTo: (value: number) => void;
  muted: boolean;
  /** 0–1. */
  volume: number;
  onToggleMute: () => void;
  onVolume: (value: number) => void;
  speed: number;
  /** The speeds this source can actually play at — a live YouTube stream offers only 1x. */
  speeds: readonly number[];
  onSpeed: (value: number) => void;
  /** More of the settings menu, after the speeds: the quality ladder, where the source has one. */
  settingsExtra?: ReactNode;
  /**
   * The captions toggle. `null` — no button at all — where there is nothing
   * to toggle: our own copy carries no tracks, and neither does a YouTube
   * video nobody captioned.
   */
  captions?: { on: boolean; onToggle: () => void } | null;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  /**
   * Who is watching — drawn faintly over the picture and moved every few
   * seconds. `null` draws nothing (an admin preview, a signed-out render).
   */
  watermark: string | null;
  /**
   * Leave the middle of the picture to what is under it — see `.pc-keyhole`.
   * Our own play disc and spinner step aside, because the thing the student
   * has to press is now the one showing through the hole.
   */
  keyhole?: boolean;
}

export function PlayerChrome({
  title,
  children,
  className,
  paused,
  waiting,
  timeline,
  shownTime,
  shownDuration,
  onTogglePlay,
  onSeekBy,
  onSeekTo,
  muted,
  volume,
  onToggleMute,
  onVolume,
  speed,
  speeds,
  onSpeed,
  settingsExtra,
  captions = null,
  fullscreen,
  onToggleFullscreen,
  watermark,
  keyhole = false,
}: PlayerChromeProps) {
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef<{ at: number; side: 'start' | 'end' } | null>(null);
  /**
   * Read by the hide timer when it FIRES, not when it is armed — a lecture
   * paused in the meantime keeps its bar. A ref, written in an effect, because
   * the timer outlives the render that armed it.
   */
  const pausedRef = useRef(paused);
  const [menuOpen, setMenuOpen] = useState(false);
  const [controlsShown, setControlsShown] = useState(true);
  const [flash, setFlash] = useState<'back' | 'forward' | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  /* ── controls that hide themselves while the lecture plays ───────────── */

  const armHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!pausedRef.current) setControlsShown(false);
    }, HIDE_AFTER_MS);
  }, []);

  const reveal = useCallback(() => {
    setControlsShown(true);
    armHide();
  }, [armHide]);

  /*
   * The bar comes up whenever playback STARTS, whoever started it — the
   * student, the autoplay after the poster, YouTube resuming after a stall —
   * and counts down from there. Adjusted while rendering rather than in an
   * effect, which is React's own answer for state that follows a prop.
   */
  const [seenPaused, setSeenPaused] = useState(paused);
  if (seenPaused !== paused) {
    setSeenPaused(paused);
    if (!paused) setControlsShown(true);
  }
  useEffect(() => {
    if (!paused) armHide();
  }, [paused, armHide]);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  // A paused lecture, or an open menu, keeps the bar on screen.
  const barVisible = controlsShown || paused || menuOpen;

  /* ── actions ──────────────────────────────────────────────────────────── */

  const seekBy = useCallback(
    (delta: number) => {
      onSeekBy(delta);
      setFlash(delta < 0 ? 'back' : 'forward');
      setTimeout(() => setFlash(null), 450);
    },
    [onSeekBy],
  );

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
          onTogglePlay();
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
        case 'KeyM':
          event.preventDefault();
          onToggleMute();
          break;
        default:
          return;
      }
      reveal();
    },
    [onTogglePlay, seekBy, onToggleMute, reveal],
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
        // A right-click is somebody looking for «نسخ الرابط», not asking to
        // pause — and the menu it wanted never opens (see `onContextMenu`).
        if (event.button !== 0) return;
        onTogglePlay();
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
    [menuOpen, onTogglePlay, reveal, seekBy, barVisible, paused],
  );

  const hasSettings = speeds.length > 1 || settingsExtra != null;

  return (
    <div
      // LTR for the whole surface: the timeline, the ±10 buttons, the arrow
      // keys and the double-tap halves all have to agree on which way is back.
      dir="ltr"
      // A size container, so the settings menu can be capped at the PLAYER's
      // height — a phone in portrait gives it barely 200px.
      className={cn(
        'absolute inset-0 select-none [container-type:size]',
        !barVisible && 'cursor-none',
        keyhole && 'pc-keyhole',
        className,
      )}
      tabIndex={0}
      role="region"
      aria-label={title}
      onKeyDown={onKeyDown}
      onPointerMove={(event) => {
        if (event.pointerType === 'mouse') reveal();
      }}
      // No «حفظ الفيديو باسم» over our copy, and no «نسخ عنوان URL للفيديو»
      // over YouTube's — the menus that offer them are the browser's and the
      // embed's, and neither opens from here.
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}

      {watermark ? <Watermark text={watermark} /> : null}

      {/* The picture itself: the tap / double-tap surface, and the shield. */}
      <div
        className="absolute inset-0 z-[6]"
        onPointerUp={onSurfacePointerUp}
        aria-hidden="true"
        data-player-surface=""
      />

      {waiting && !paused && !keyhole ? (
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

      {paused && !waiting && !keyhole ? (
        <button
          type="button"
          onClick={onTogglePlay}
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
          min={timeline.min}
          max={timeline.max || 0}
          step={0.1}
          value={Math.min(Math.max(timeline.value, timeline.min), timeline.max || 0)}
          aria-label={c.seek}
          aria-valuetext={`${clock(shownTime)} / ${clock(shownDuration)}`}
          style={
            {
              '--mv-played': `${timeline.played}%`,
              '--mv-buffered': `${Math.max(timeline.played, timeline.loaded)}%`,
            } as CSSProperties
          }
          onChange={(event) => {
            onSeekTo(Number(event.currentTarget.value));
            reveal();
          }}
        />

        <div className="mt-1 flex items-center gap-1 text-white">
          <BarButton label={paused ? c.play : c.pause} onClick={onTogglePlay}>
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
          <BarButton label={muted || volume === 0 ? c.unmute : c.mute} onClick={onToggleMute}>
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
            onChange={(event) => onVolume(Number(event.currentTarget.value))}
          />
          <span className="mono tabular ms-1 whitespace-nowrap text-[length:var(--fs-text-xs)] text-white/90">
            {clock(shownTime)} / {clock(shownDuration)}
          </span>

          <span className="ms-auto" />

          {captions ? (
            <BarButton
              label={captions.on ? c.captionsHide : c.captionsShow}
              onClick={captions.onToggle}
              active={captions.on}
            >
              {captions.on ? <Captions className="size-5" /> : <CaptionsOff className="size-5" />}
            </BarButton>
          ) : null}

          {hasSettings ? (
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
                    {speeds.length > 1 ? (
                      <>
                        <p className="text-[length:var(--fs-text-xs)] font-semibold text-white/70">{c.speed}</p>
                        <div className="mt-2 grid grid-cols-3 gap-1.5" dir="ltr">
                          {speeds.map((value) => (
                            <button
                              key={value}
                              type="button"
                              role="menuitemradio"
                              aria-checked={speed === value}
                              onClick={() => onSpeed(value)}
                              className={cn(
                                'mono rounded-md px-2 py-1.5 text-[length:var(--fs-text-sm)] transition-colors duration-[160ms]',
                                speed === value ? 'bg-accent font-semibold text-[#1A1206]' : 'bg-white/10 hover:bg-white/20',
                              )}
                            >
                              {value === 1 ? c.speedNormal : `${value}x`}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : null}
                    {settingsExtra}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

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

/**
 * The viewer's name over the picture, moved every few seconds.
 *
 * Not protection — nothing drawn by the page is — but attribution: a
 * screen-recorded lecture carries the account it came from, and that is what
 * stops a recording being passed around. Moving it is what keeps it from
 * being cropped out of one corner.
 *
 * ── Moved by `transform`, not by `top`/`left` ────────────────────────────
 * It used to glide on `inset-block-start`/`inset-inline-start`, which are
 * layout properties: every frame of the 700ms glide was a layout pass on the
 * main thread — the thread that is also feeding hls.js — every five seconds
 * for the whole lecture. A transform glides on the compositor instead.
 *
 * The catch is that `translate(x%)` is a percentage of the element ITSELF,
 * and the name is a few words wide. So the element that moves is a layer the
 * size of the whole picture, with the name pinned in its corner: 30% of its
 * own width IS 30% of the player's, and the name lands exactly where the old
 * `inset-inline-start: 30%` put it. The surface is always LTR, so positive x
 * is always the inline start moving towards the end.
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
      style={{ transform: `translate(${spot.start}%, ${spot.top}%)` }}
    >
      {/* `dir="auto"` on the TEXT, one level in, and never on the pinned
          span: an inset resolved against an Arabic name's own RTL would pin
          it to the other corner, and the translate would carry it off the
          picture. The pinned span inherits the surface's LTR. */}
      <span className="mv-watermark__name">
        <span dir="auto">{text}</span>
      </span>
    </span>
  );
}
