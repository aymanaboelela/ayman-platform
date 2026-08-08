'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { copy, type HeartbeatResponse, type PlayerVideo } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { formatDuration } from '@/lib/format';
import {
  FRAME_ALLOW,
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
          // The fullscreen button, explicitly. It defaults on, but `fs: 0` is
          // one typo away and the failure is silent — the control simply is
          // not drawn and the student concludes the video cannot be enlarged.
          fs: 1,
        },
        events: {
          onReady: (event) => {
            playerRef.current = event.target;
            setPlayer(event.target);

            /*
             * Fullscreen has to be granted to the frame, not just enabled in
             * the player.
             *
             * The IFrame API builds this element itself, so there is no JSX
             * where `allowFullScreen` could be written — `<YouTubeEmbed>` and
             * the resource list, which DO render their own iframes, have
             * carried the attribute all along, and this player is the one that
             * never did. Combined with `Permissions-Policy` defaulting
             * `fullscreen` to `self`, a cross-origin player frame had no path
             * to fullscreen at all: on a phone the video stayed a strip at the
             * top of the page and turning the handset sideways did nothing.
             *
             * Both spellings: `allow="fullscreen"` is the Permissions-Policy
             * delegation the modern engines read, `allowfullscreen` is the
             * legacy boolean older WebKit still honours.
             */
            const frame = event.target.getIframe?.();
            if (frame) {
              frame.setAttribute('allow', FRAME_ALLOW);
              frame.setAttribute('allowfullscreen', '');
            }
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
          // The visible label is «شغّل الفيديو» for everyone; the accessible
          // name names the video too, because a screen-reader user landing on
          // this button out of context has no poster to look at.
          aria-label={`${copy.player.play} — ${title}`}
          className={cn(
            // `group` so the disc can grow on hover — the scale lives on the
            // disc, not here, because scaling the whole overlay would scale
            // the poster with it.
            'group absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-3',
            'bg-surface-2 transition-colors duration-[160ms] ease-out hover:bg-surface-3',
          )}
        >
          {video.posterUrl ? (
            <>
              {/*
                Full opacity now, with a scrim over it instead of 60% opacity
                on the image itself. Fading the artwork made BOTH things worse:
                a cover the instructor designed came out washed and grey, and
                the control on top of it still had no guaranteed contrast,
                because the surface behind a translucent image is whatever the
                image happens to be. A solid scrim fixes the contrast at a
                known value and leaves the picture looking like a picture.

                Absolutely positioned inside the reserved box, so its own
                intrinsic size can never move anything.
              */}
              <img
                src={video.posterUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <span aria-hidden="true" className="absolute inset-0 bg-black/45" />
            </>
          ) : null}

          {/*
            The primary action on the page, and now sized like one.

            It was a 56px ring in `bg-surface-1` with an accent glyph — a
            ghost button floating on a faded picture. «كبّرها شوية، إن هي اللي
            تلفت الانتباه، ويبقى واضح إن أشغّل الفيديو.» So: filled with the
            accent, 80px on a phone and 96px on anything wider, and it now
            carries the WORDS «شغّل الفيديو» underneath instead of repeating the
            lesson title that is already printed above the player.

            `#1A1206` on amber is the fixed near-black this product uses on
            every accent fill — a theme-following colour would vanish in light
            mode.
          */}
          <span
            className={cn(
              'relative flex h-20 w-20 items-center justify-center rounded-full sm:h-24 sm:w-24',
              'bg-accent text-[#1A1206] shadow-lg',
              'transition-transform duration-[160ms] ease-out group-hover:scale-105',
            )}
          >
            <PlayIcon className="h-9 w-9 sm:h-10 sm:w-10" />
          </span>
          {/* White only when a poster (and therefore the scrim) is behind it —
              on a coverless lesson the surface is `bg-surface-2`, where white
              fails contrast in light mode. */}
          <span
            className={cn(
              'relative text-[length:var(--fs-title-4)] font-semibold',
              video.posterUrl ? 'text-white' : 'text-fg',
            )}
          >
            {copy.player.play}
          </span>
          {video.durationSeconds > 0 ? (
            <span
              className={cn(
                'mono tabular relative text-[length:var(--fs-mono-label)]',
                video.posterUrl ? 'text-white/80' : 'text-fg-muted',
              )}
            >
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
