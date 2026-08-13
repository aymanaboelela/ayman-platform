'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { copy } from '@ayman/contracts/copy';
import type { HeartbeatResponse, PlayerVideo } from '@ayman/contracts/progress';
import { cn } from '@ayman/ui/lib/cn';
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
  /**
   * The furthest second the student has reached in this video — the
   * `maxPositionSeconds` the heartbeat has been writing on every tick since
   * the player shipped, and which until now nothing ever read back.
   *
   * 0 means "start from the beginning", and the caller is expected to pass 0
   * for a lesson that is already complete.
   */
  resumeAt: number;
  onProgress: (response: HeartbeatResponse) => void;
  onError: () => void;
}

/**
 * Resume a few seconds BEFORE the furthest point, not on it.
 *
 * Whatever ended the last session — the Android OS reclaiming the tab, a
 * dropped connection, an incoming call — the last thing the student heard was
 * cut mid-sentence, and landing exactly on that second starts them mid-word
 * with no idea what the sentence was about. Five seconds is roughly one clause
 * of speech: enough to re-enter the thought, short enough that nobody
 * experiences it as being sent backwards.
 *
 * It doubles as the floor on the whole feature: anyone who watched five
 * seconds or less resumes at 0, so a student who opened the lesson, looked at
 * it and left is not greeted by «أكمل من 0:01».
 */
const RESUME_REWIND_SECONDS = 5;

function resumePoint(furthestSeconds: number, durationSeconds: number): number {
  if (!Number.isFinite(furthestSeconds)) return 0;
  const point = Math.floor(furthestSeconds) - RESUME_REWIND_SECONDS;
  if (point <= 0) return 0;

  /*
   * `durationSeconds` is 0 when the length is unknown (the same condition that
   * turns `autoCompleteAvailable` off), so there is nothing to clamp against
   * and the stored position is all we have.
   *
   * When it IS known, a position at or past the end is stale rather than
   * meaningful: the instructor swapped the lesson's `youtubeId` for a shorter
   * cut and the progress row — which is keyed on the LESSON, not on the video —
   * kept a position from the old one. Asking YouTube to start past the end of
   * the new video is at best a black frame.
   */
  if (durationSeconds > 0 && point >= durationSeconds) return 0;

  return point;
}

export function VideoLesson({
  lessonId,
  video,
  title,
  resumeAt,
  onProgress,
  onError,
}: VideoLessonProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [player, setPlayer] = useState<YouTubePlayer | null>(null);
  const [activated, setActivated] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // Computed once per render rather than inside `activate`, because the poster
  // has to PRINT the same second it is going to seek to. Two call sites, one
  // number: the label can never promise a resume point the player then ignores.
  const resumeSeconds = resumePoint(resumeAt, video.durationSeconds);

  /*
   * The accessible name of the poster's primary action.
   *
   * The visible label is «شغّل الفيديو» for everyone; the accessible name adds
   * the video, because a screen-reader user landing on this button out of
   * context has no poster to look at. When there is a resume it adds that too
   * — the resume line is a SIBLING of the button, not a child, so without this
   * nothing would tell a screen-reader user that pressing it lands them
   * twenty-seven minutes in, and they would meet «من الأول» next with no idea
   * what it undoes.
   *
   * Both branches keep the visible label as a literal substring (WCAG 2.5.3),
   * so «شغّل الفيديو» spoken into a speech-input device still presses it.
   */
  const playLabel =
    resumeSeconds > 0
      ? `${copy.player.play} — ${copy.player.resumeFrom} ${formatDuration(resumeSeconds)} — ${title}`
      : `${copy.player.play} — ${title}`;

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

  /**
   * `startAt` is a parameter and not `resumeSeconds` read from the closure,
   * because the poster offers two different starts from the same handler — the
   * resume and «من الأول» — and the difference between them has to survive
   * into the `new api.Player(...)` call. There is no second chance: `start` is
   * read once, when the player is constructed, and never again.
   */
  const activate = useCallback(async (startAt: number) => {
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
          /*
           * Where to begin. 0 is exactly what the parameter means when it is
           * absent, so this is passed unconditionally rather than spread in.
           *
           * `start` applies at construction and nowhere else, which is the
           * behaviour this feature wants: one seek per visit to the page. A
           * student who then scrubs somewhere else keeps their scrub — nothing
           * here ever drags the playhead back.
           *
           * ⚠️ YouTube seeks to the nearest keyframe AT OR BEFORE this second,
           * so playback can genuinely begin several seconds earlier than the
           * number the poster printed. That is the harmless direction (a little
           * more context, never a skipped sentence) and it is why the poster
           * says «أكمل من» rather than quoting an exact timestamp as a promise.
           */
          start: startAt,
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

            /*
             * ⚠️ AND ACTUALLY PLAY IT. Constructing a player does not start one.
             *
             * `new api.Player(...)` builds the frame and leaves it CUED: the
             * poster this component drew disappears and is replaced by
             * YouTube's own poster, with YouTube's own play button in the
             * middle of it. So the student pressed «شغّل الفيديو», watched the
             * page swap one play button for another, and had to press a second
             * one — inside a cross-origin frame — before anything happened.
             * Reported as «ضغطت على علامة البلاي… بيخلينا نفتح كمان اللي هو
             * بتاع اليوتيوب».
             *
             * There was never an `autoplay: 1` in `playerVars` either, which is
             * the other way to spell this. `playVideo()` is the better one:
             * `autoplay` is read at construction and is silently ignored by the
             * autoplay policy on some engines, whereas this call inherits the
             * user activation from the tap that built the player — the whole
             * player exists because of a click, so the gesture is always there.
             *
             * `start` is unaffected: it is a construction-time parameter and
             * has already been applied to the cued position, so this plays FROM
             * the resume point rather than from zero.
             */
            event.target.playVideo();
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
        /*
          The poster is a DIV that CONTAINS the play button; it used to BE the
          button.

          One full-bleed `<button>` with the disc and the label inside it was
          the right shape right up until «من الأول» arrived, because a button
          inside a button is invalid HTML — the parsers that do not simply drop
          the inner one give it no reliable click of its own, and the two
          starts this poster now offers would have collapsed into one.

          So: the primary action is an invisible full-bleed `<button>` sitting
          UNDER the furniture, the furniture is `pointer-events-none` so taps
          fall straight through to it, and the restart control on top is the
          one element that takes its own tap. The whole poster is still a
          single tap target for «شغّل الفيديو», exactly as it was — which
          matters most on the phone, where precision is worst.

          `group` and the hover wash moved up here with it, so the disc still
          grows on hover of anywhere in the poster.
        */
        <div
          className={cn(
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
            The tap target: the whole poster, transparent, sitting under every
            piece of furniture drawn below it. It deliberately carries no
            children — a child would be a second thing to hit-test, and the
            restart control has to be the only one. Its whole accessible name
            therefore comes from `aria-label`; see `playLabel` above.
          */}
          <button
            type="button"
            onClick={() => void activate(resumeSeconds)}
            aria-label={playLabel}
            className="absolute inset-0 h-full w-full"
          />

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
              // `pointer-events-none` on every piece of furniture from here
              // down: they are painted above the full-bleed button and would
              // otherwise punch dead spots in the middle of the tap target —
              // the disc most of all, since it is exactly where a finger aims.
              'pointer-events-none',
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
              'pointer-events-none relative text-[length:var(--fs-title-4)] font-semibold',
              video.posterUrl ? 'text-white' : 'text-fg',
            )}
          >
            {copy.player.play}
          </span>

          {/*
            The resume line REPLACES the total duration; it does not join it.

            The overlay's whole height is 9/16 of the player's width — 184px
            when the player is 328px wide, which is a 360px phone minus the
            page's `px-4`. An 80px disc, «شغّل الفيديو», a duration AND a 44px
            restart control come to more than that, and the first thing to
            overflow a `justify-center` column is the thing at the bottom. The
            duration is the one of the four that is also printed against this
            lesson in the outline further down the same page, so it is the one
            that gives way — and only in the case where there is something more
            useful to say.
          */}
          {resumeSeconds > 0 ? (
            <div className="pointer-events-none relative flex items-center gap-2">
              <span
                className={cn(
                  'text-[length:var(--fs-mono-label)]',
                  video.posterUrl ? 'text-white/80' : 'text-fg-muted',
                )}
              >
                {copy.player.resumeFrom}
              </span>
              {/* The clock in its own span so it keeps `.mono .tabular`. A
                  `{time}` placeholder inside the Arabic string would have put
                  these digits in the body font — see `copy.player.resumeFrom`. */}
              <span
                className={cn(
                  'mono tabular text-[length:var(--fs-mono-label)]',
                  video.posterUrl ? 'text-white' : 'text-fg',
                )}
              >
                {formatDuration(resumeSeconds)}
              </span>
              {/*
                `pointer-events-auto` against the row's `none`: this is the one
                thing on the poster that must NOT fall through to the resume.

                `min-h-11` is the 44px target the rest of the mobile pass
                settles on. Sized by its own text and not stretched to it: a
                two-word pill that filled the poster's width would read as the
                primary action, and it is the escape hatch.
              */}
              <button
                type="button"
                onClick={() => void activate(0)}
                aria-label={`${copy.player.restart} — ${title}`}
                className={cn(
                  'pointer-events-auto inline-flex min-h-11 items-center rounded-md px-3',
                  'text-[length:var(--fs-text-sm)] transition-colors duration-[160ms] ease-out',
                  video.posterUrl
                    ? 'border border-white/40 text-white hover:bg-white/15'
                    : 'border border-line text-fg-muted hover:bg-surface-3 hover:text-fg',
                )}
              >
                {copy.player.restart}
              </button>
            </div>
          ) : video.durationSeconds > 0 ? (
            <span
              className={cn(
                'mono tabular pointer-events-none relative text-[length:var(--fs-mono-label)]',
                video.posterUrl ? 'text-white/80' : 'text-fg-muted',
              )}
            >
              {formatDuration(video.durationSeconds)}
            </span>
          ) : null}
        </div>
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
