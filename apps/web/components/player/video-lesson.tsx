'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { copy, type HeartbeatResponse, type PlayerVideo } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { formatDuration } from '@/lib/format';
import {
  YOUTUBE_NOCOOKIE_HOST,
  loadYouTubeIframeApi,
  type YouTubePlayer,
} from '@/lib/youtube';
import { PlayIcon } from './icons';
import { useVideoHeartbeat } from './use-video-heartbeat';

export interface VideoLessonProps {
  lessonId: string;
  video: PlayerVideo;
  title: string;
  onProgress: (response: HeartbeatResponse) => void;
  onError: () => void;
}

export function VideoLesson({ lessonId, video, title, onProgress, onError }: VideoLessonProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [player, setPlayer] = useState<YouTubePlayer | null>(null);
  const [activated, setActivated] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useVideoHeartbeat({ lessonId, player, onResponse: onProgress, onError });

  /**
   * `F` for fullscreen, the way YouTube does it.
   *
   * The embed already answers `F` — but only while the IFRAME holds focus,
   * which it does not until the student has clicked inside it. A student who
   * has been scrolling the outline, or who just loaded the page, presses `F`
   * and nothing happens. So the page listens too, and the two do not conflict:
   * once focus is inside the embed the keystroke never reaches this handler,
   * and YouTube's own shortcut takes it.
   *
   * ⚠️ `event.code`, NOT `event.key`. This platform is Arabic, so on an Arabic
   * layout the F key emits "ب" and a `key === 'f'` test never fires for the
   * students most likely to be using it. `code` is the physical key and is
   * layout-independent — the same reason YouTube itself uses it.
   */
  const toggleFullscreen = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void shell.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    // The browser owns this state — Escape, the F11 key and the window chrome
    // can all leave fullscreen without going through the handler above, so it
    // is read back from the event rather than assumed on toggle.
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === shellRef.current);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'KeyF' || event.metaKey || event.ctrlKey || event.altKey) return;

      // Never steal the key from someone typing — a quiz answer, a search box,
      // a comment. `isContentEditable` covers rich-text fields that are not
      // inputs at all.
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      event.preventDefault();
      toggleFullscreen();
    };

    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [toggleFullscreen]);

  const activate = useCallback(async () => {
    if (activated || !mountRef.current) return;
    setActivated(true);

    try {
      const api = await loadYouTubeIframeApi();
      if (!mountRef.current) return;

      const instance = new api.Player(mountRef.current, {
        videoId: video.youtubeId,
        // The no-cookie host, reconstructed from the stored 11-char id. No
        // URL is ever read from the database (Global Constraint / spec §7 P3).
        host: YOUTUBE_NOCOOKIE_HOST,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          hl: 'ar',
          cc_lang_pref: 'ar',
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            playerRef.current = event.target;
            setPlayer(event.target);
          },
          onError: () => setFailed(true),
        },
      });
      playerRef.current = instance;
    } catch {
      setFailed(true);
      setActivated(false);
    }
  }, [activated, video.youtubeId]);

  useEffect(() => {
    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  return (
    <div
      ref={shellRef}
      className={cn(
        // aspect-video reserves the exact box in CSS before any JS runs, and
        // the iframe is injected INTO it — CLS stays at 0 whether the API
        // loads in 200ms, in four seconds, or never.
        'relative w-full overflow-hidden bg-surface-2',
        // ⚠️ The reserved aspect box has to come OFF in fullscreen. Left on, the
        // element is still 16:9 inside a screen that is not, so the video sits
        // letterboxed in the middle of a black page instead of filling it. The
        // border and radius go too — a rounded rectangle with a hairline round
        // it is furniture for a card, not for a screen.
        fullscreen ? 'h-full' : 'aspect-video rounded-lg border border-line',
      )}
    >
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />

      {!activated ? (
        <button
          type="button"
          onClick={() => void activate()}
          aria-label={copy.player.play}
          className={cn(
            'absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-3',
            'bg-surface-2 transition-colors duration-[160ms] ease-out hover:bg-surface-3',
          )}
        >
          {video.posterUrl ? (
            // Absolutely positioned inside the reserved box, so its own
            // intrinsic size can never move anything.
            <img
              src={video.posterUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-60"
            />
          ) : null}

          <span
            className={cn(
              'relative flex h-14 w-14 items-center justify-center rounded-full',
              'border border-line-strong bg-surface-1 text-accent',
            )}
          >
            <PlayIcon className="h-6 w-6" />
          </span>
          <span className="relative text-[length:var(--fs-text-sm)] text-fg-muted">{title}</span>
          {video.durationSeconds > 0 ? (
            <span className="mono tabular relative text-[length:var(--fs-mono-label)] text-fg-muted">
              {formatDuration(video.durationSeconds)}
            </span>
          ) : null}
        </button>
      ) : null}

      {failed ? (
        <p
          className={cn(
            'absolute inset-0 flex items-center justify-center bg-surface-2 px-6 text-center',
            'text-[length:var(--fs-text-sm)] text-fg-muted',
          )}
        >
          {copy.player.videoUnavailable}
        </p>
      ) : null}
    </div>
  );
}
