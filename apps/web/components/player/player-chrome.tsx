'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
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
/** ← / → — YouTube's own step for the arrows; J / L and the double tap stay at ten. */
export const ARROW_STEP = 5;
const VOLUME_STEP = 0.05;
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

/**
 * Something on the page that owns the keyboard for itself: a field being
 * typed into, or a control that answers Space and the arrows natively. Only
 * consulted for focus OUTSIDE the player — inside it, every key is ours.
 */
function ownsKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.closest('input, textarea, select, button, a[href], [role="slider"], [role="menu"], [role="dialog"]') !== null;
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
  const lastPointer = useRef<string>('');
  /**
   * Read by the hide timer when it FIRES, not when it is armed — a lecture
   * paused in the meantime keeps its bar. A ref, written in an effect, because
   * the timer outlives the render that armed it.
   */
  const pausedRef = useRef(paused);
  const [menuOpen, setMenuOpen] = useState(false);
  const [controlsShown, setControlsShown] = useState(true);
  const [flash, setFlash] = useState<'back' | 'forward' | null>(null);
  /** Where a finger is holding the timeline's thumb — see «the timeline» below. */
  const [scrub, setScrub] = useState<number | null>(null);
  const scrubRef = useRef<number | null>(null);
  const dragging = useRef(false);

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

  // A paused lecture, an open menu, or a thumb under a finger keeps the bar on screen.
  const barVisible = controlsShown || paused || menuOpen || scrub !== null;

  /* ── actions ──────────────────────────────────────────────────────────── */

  const seekBy = useCallback(
    (delta: number) => {
      onSeekBy(delta);
      setFlash(delta < 0 ? 'back' : 'forward');
      setTimeout(() => setFlash(null), 450);
    },
    [onSeekBy],
  );

  /* ── keyboard: the YouTube keys, wherever the student is on the page ───── */

  /*
   * «لما حد يضغط على المسطرة مش بيوقف» — Space did nothing, and neither did
   * the arrows.
   *
   * The keys used to be heard on the player's own element only, so they
   * worked exactly while focus happened to sit inside it. The tap that starts
   * a lecture is on the poster, and the poster is gone the moment it plays —
   * focus falls back to the page, and from then on Space SCROLLED the page
   * and the arrows did nothing. Inside the player it was worse in a quieter
   * way: a focused bar button swallowed the arrows (they were skipped so a
   * slider could have them), and a focused timeline took ← → as 0.1-second
   * nudges — a press that moved nothing anyone could see.
   *
   * So they are heard on the DOCUMENT now, the way YouTube's watch page does
   * it, and on the player every key is ours. Elsewhere on the page they stand
   * aside for anything that owns the keyboard — a homework answer being
   * typed, a button that Space should press, an open dialog.
   *
   * `code`, not `key`: on an Arabic layout K emits «ن».
   */
  const rootRef = useRef<HTMLDivElement>(null);
  // The listener is installed once; it reads the current props through this.
  const keys = useRef({ onTogglePlay, seekBy, onSeekTo, onToggleMute, onVolume, reveal, volume, muted, timeline });
  useEffect(() => {
    keys.current = { onTogglePlay, seekBy, onSeekTo, onToggleMute, onVolume, reveal, volume, muted, timeline };
  });

  useEffect(() => {
    const isOurs = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return null;
      const inside = event.target instanceof Node && rootRef.current?.contains(event.target) === true;
      // The settings menu keeps its own keys: Space and Enter pick a speed.
      if (inside && event.target instanceof HTMLElement && event.target.closest('[role="menu"]')) return null;
      if (!inside && ownsKeys(event.target)) return null;
      return { inside };
    };

    /*
     * A bar button that has focus would ALSO press itself on Space — on the
     * key's release, which is a separate event the keydown cannot cancel in
     * every engine. So the release is cancelled too, and Space over the player
     * means play/pause and nothing else.
     */
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space' && isOurs(event)?.inside) event.preventDefault();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const ours = isOurs(event);
      if (!ours) return;
      const { inside } = ours;

      const k = keys.current;
      const { min, max } = k.timeline;
      switch (event.code) {
        case 'Space':
        case 'KeyK':
          // Holding Space must not toggle twenty times a second.
          if (event.repeat) {
            event.preventDefault();
            return;
          }
          k.onTogglePlay();
          break;
        case 'ArrowLeft':
          k.seekBy(-ARROW_STEP);
          break;
        case 'ArrowRight':
          k.seekBy(ARROW_STEP);
          break;
        case 'KeyJ':
          k.seekBy(-SEEK_STEP);
          break;
        case 'KeyL':
          k.seekBy(SEEK_STEP);
          break;
        case 'ArrowUp':
        case 'ArrowDown': {
          // Only over the player: outside it, these scroll the page.
          if (!inside) return;
          const from = k.muted ? 0 : k.volume;
          const delta = event.code === 'ArrowUp' ? VOLUME_STEP : -VOLUME_STEP;
          k.onVolume(Math.round(Math.min(1, Math.max(0, from + delta)) * 100) / 100);
          break;
        }
        case 'KeyM':
          k.onToggleMute();
          break;
        case 'Home':
          if (!inside) return;
          k.onSeekTo(min);
          break;
        case 'End':
          if (!inside) return;
          k.onSeekTo(max);
          break;
        default: {
          // 0–9: jump to that tenth of the lecture, as on YouTube.
          const digit = /^(?:Digit|Numpad)([0-9])$/.exec(event.code);
          if (!digit || max <= min) return;
          k.onSeekTo(min + ((max - min) * Number(digit[1])) / 10);
        }
      }
      event.preventDefault();
      k.reveal();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  /* ── the timeline: follow the finger, seek once on release ────────────── */

  /*
   * «لما بيرجع من تحت الصوت شغال والصورة واقفة».
   *
   * Every `input` event of a drag was a seek — thirty or forty a second while
   * a finger moved along the bar. Each one throws away what was buffered and
   * asks for the bytes at a new second: YouTube fetches a new range per call,
   * hls.js aborts the segment in flight and starts another. The audio track
   * catches up first (it is a fraction of the bytes), the picture waits for a
   * keyframe that the next seek cancels again — so the sound ran on over a
   * frozen frame, and the drag "did not stop" where the finger let go.
   *
   * Now the thumb and the clock follow the finger, and the ONE seek happens on
   * release. A click is a drag of length zero, and the keyboard (which never
   * presses a pointer) still seeks on every step.
   */

  const commitScrub = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    const value = scrubRef.current;
    scrubRef.current = null;
    setScrub(null);
    if (value !== null) onSeekTo(value);
  }, [onSeekTo]);

  useEffect(() => {
    // Released anywhere — a finger that slid off the bar still lets go.
    window.addEventListener('pointerup', commitScrub);
    window.addEventListener('pointercancel', commitScrub);
    return () => {
      window.removeEventListener('pointerup', commitScrub);
      window.removeEventListener('pointercancel', commitScrub);
    };
  }, [commitScrub]);

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
      // A drag along the timeline that was let go over the picture: that
      // release is the end of the seek, not a tap.
      if (dragging.current) return;
      lastPointer.current = event.pointerType;
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
  // While a finger is on the thumb, the painted track and the clock follow it.
  const span = timeline.max - timeline.min;
  const scrubPlayed = scrub !== null && span > 0 ? Math.min(100, Math.max(0, ((scrub - timeline.min) / span) * 100)) : null;
  // The clock prints the lecture's own seconds; for an untrimmed one they are the file's.
  const scrubShown = scrub !== null ? shownTime + (scrub - timeline.value) : null;

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
      ref={rootRef}
      tabIndex={0}
      role="region"
      aria-label={title}
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
        // A double CLICK fills the screen, as on YouTube's desktop player. A
        // phone's double tap is the ten-second jump above, and some engines
        // report it as a `dblclick` too — hence the pointer check.
        onDoubleClick={() => {
          if (lastPointer.current === 'mouse') onToggleFullscreen();
        }}
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
          /*
           * The scrim is not a target — only the controls on it are. On a
           * phone the bar is nearly half the picture's height, and the empty
           * gradient used to swallow every tap that landed on it: a double
           * tap on that half seeked nowhere, and a tap to hide the bar did
           * not hide it. Now those taps reach the picture under it.
           */
          'pointer-events-none',
          barVisible
            ? 'opacity-100 [&_button]:pointer-events-auto [&_input]:pointer-events-auto [&_[role=menu]]:pointer-events-auto'
            : 'opacity-0',
        )}
      >
        <input
          type="range"
          className="mv-timeline"
          min={timeline.min}
          max={timeline.max || 0}
          step="any"
          value={Math.min(Math.max(scrub ?? timeline.value, timeline.min), timeline.max || 0)}
          aria-label={c.seek}
          aria-valuetext={`${clock(scrubShown ?? shownTime)} / ${clock(shownDuration)}`}
          style={
            {
              '--mv-played': `${scrubPlayed ?? timeline.played}%`,
              '--mv-buffered': `${Math.max(scrubPlayed ?? timeline.played, timeline.loaded)}%`,
            } as CSSProperties
          }
          onPointerDown={() => {
            dragging.current = true;
          }}
          onChange={(event) => {
            const value = Number(event.currentTarget.value);
            if (dragging.current) {
              scrubRef.current = value;
              setScrub(value);
            } else {
              onSeekTo(value);
            }
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
            {clock(scrubShown ?? shownTime)} / {clock(shownDuration)}
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
