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
import { MirrorVideo } from './mirror-video';
import { PlayIcon } from './icons';
import { useVideoHeartbeat } from './use-video-heartbeat';

/**
 * Why the embed did not play — the fact `onError` used to throw away.
 *
 * The handler took no argument at all, so YouTube's numeric code was read and
 * discarded on every failure: the owner switching «السماح بالتضمين» off (101,
 * 150), a deleted or private video (100), an unusable id (2, 5) and an ad
 * blocker eating the IFrame API all collapsed into one sentence, «الفيديو مش
 * متاح دلوقتي», with no console line and no telemetry. That is how «الفيديو
 * ضايفه وشغال وبابلك» and «بيقول مش متاح» could both be true at once with
 * nothing to say which end was wrong.
 *
 * Only `script` is worth retrying — the other two are properties of the video
 * on YouTube's side and will fail identically a second later.
 */
type VideoFailure = 'embedBlocked' | 'removed' | 'unknown' | 'ourCopyFailed';

const FAILURE_COPY: Record<VideoFailure, string> = {
  embedBlocked: copy.player.videoEmbedBlocked,
  removed: copy.player.videoRemoved,
  unknown: copy.player.videoUnavailable,
  /*
   * The one failure with NO fallback behind it.
   *
   * An uploaded lecture exists on our origin and nowhere else — there is no
   * YouTube page to open and no embed to try, so when our copy will not play
   * this is the end of the road rather than a step on the way to one. Saying
   * «حاول تاني» is the honest advice: the causes left are transient (a
   * connection that dropped mid-segment, an origin hiccup) and a reload
   * genuinely clears them.
   */
  ourCopyFailed: copy.player.videoOurCopyFailed,
};

/**
 * How long a constructed player may stay silent before it counts as blocked.
 *
 * Deliberately longer than the script timeout in `lib/youtube.ts`: this clock
 * starts only once the API is in hand, and the frame it builds has its own
 * handshake to complete on the same connection that was already slow enough
 * to need most of the first budget.
 */
const FRAME_READY_TIMEOUT_MS = 15_000;

/** https://developers.google.com/youtube/iframe_api_reference#onError */
function failureOfCode(code: number): VideoFailure {
  if (code === 101 || code === 150) return 'embedBlocked';
  if (code === 100) return 'removed';
  // 2 (malformed id) and 5 (HTML5 player error) are ours or the browser's, and
  // there is nothing useful to say about either beyond the generic sentence.
  return 'unknown';
}

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
  /**
   * Kills the "player built, never ready" state.
   *
   * `loadYouTubeIframeApi` has its own timeout for a script that never
   * arrives, but the frame is a SECOND thing the network can swallow: the API
   * loads from `youtube.com`, the player it then builds loads from
   * `youtube-nocookie.com`, and a data bundle or filter can allow the first
   * and drop the second. YouTube reports nothing when that happens — `onError`
   * is for videos it managed to look up, not for a frame that never spoke —
   * so without this the poster is gone, no message is drawn, and the student
   * sits in front of an empty grey box.
   */
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [player, setPlayer] = useState<YouTubePlayer | null>(null);
  const [activated, setActivated] = useState(false);
  const [failure, setFailure] = useState<VideoFailure | null>(null);
  /**
   * The poster is the ONE image on this page with nothing behind it.
   *
   * `alt=""` is right — it is decoration, the title is already on the page —
   * but it also means a browser that fails to fetch it draws its broken-image
   * glyph in the middle of the player and nothing else. Dropping the element
   * instead leaves the scrim, the play disc and the duration exactly where
   * they were, which is what the `posterUrl == null` branch has always looked
   * like anyway.
   */
  const [posterFailed, setPosterFailed] = useState(false);
  /**
   * The last thing tried before giving up: a plain `<iframe>` embed, with no
   * IFrame API behind it.
   *
   * The API is a SEPARATE request from the video — `youtube.com/iframe_api` is
   * a script, and it is on more blocklists than YouTube itself (every ad
   * blocker and filtering DNS resolver ships a rule for it, because it is also
   * how a page tracks what you watched). A student whose network drops that
   * one file can still watch YouTube perfectly, and until now got nothing at
   * all from us.
   *
   * So instead of stopping at «مش قادرين نحمّل المشغّل», the player falls back
   * to the embed URL directly. What it costs is the API: no `getCurrentTime`,
   * so no heartbeat and no automatic completion — the fallback strip says so
   * and points at «خلاص · التالي». Playing without the progress bar beats not
   * playing.
   */
  const [plainFrame, setPlainFrame] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  /**
   * Our own copy could not play, so YouTube gets its turn after all.
   *
   * The mirror is tried FIRST — see `useMirror` — because it is the only
   * source that works on a ministry tablet. But it is newer than the YouTube
   * path and served from an origin with its own ways of failing, so a fatal
   * error here must not be a dead end for the students YouTube would have
   * served perfectly. One flag, and the component becomes what it always was.
   */
  const [mirrorFailed, setMirrorFailed] = useState(false);
  /**
   * The second the student chose to start from — their resume, or 0 from «من
   * الأول».
   *
   * State and not a ref, even though it is written exactly once. `MirrorVideo`
   * READS it while rendering, and a ref read during render is both a lint
   * error and a real hazard: it holds whatever was last written rather than
   * what this render was built from. Set in the same handler as `activated`,
   * so React batches the two and the element mounts already knowing where to
   * seek.
   */
  const [startedAt, setStartedAt] = useState(0);

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

  /**
   * The fallback embed URL, built the same way the API player's options are:
   * from the stored 11-char id and nothing else (spec §7 P3 — no URL ever
   * comes out of the database).
   */
  const plainEmbedSrc =
    video.youtubeId === null
      ? null
      : `https://www.youtube.com/embed/${video.youtubeId}?${new URLSearchParams({
          autoplay: '1',
          rel: '0',
          modestbranding: '1',
          playsinline: '1',
          hl: 'ar',
          cc_lang_pref: 'ar',
          start: String(resumeSeconds),
        }).toString()}`;

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
  /**
   * Which source this render is showing.
   *
   * The mirror wins when there is one, and that ORDER is the entire point of
   * the feature: YouTube first with our copy as a fallback would still leave
   * every ministry-tablet student watching the same dead frame, because the
   * fallback only ever runs after something reports a failure and a blocked
   * network reports nothing at all.
   */
  const useMirror = video.mirror !== null && !mirrorFailed;

  /**
   * An UPLOADED lecture. It exists on our origin and nowhere else.
   *
   * Everything YouTube-shaped below is gated on this being false: the API
   * player, the plain-embed fallback, the «افتحه على يوتيوب» link. Not to be
   * tidy — offering any of them here would send the student to a video that
   * does not exist, which is worse than the error it is trying to soften.
   */
  const isUpload = video.provider === 'upload';
  const youtubeId = video.youtubeId;

  /**
   * The lecture is uploaded and still being packaged.
   *
   * The row exists, the bytes are ours, and there is simply nothing to play
   * for the few minutes the encoder needs. A play button here would spin on a
   * playlist that 404s; the poster says so instead.
   */
  const stillProcessing = isUpload && video.mirror === null;

  /**
   * Bring up the YouTube player. Split out of `activate` so the mirror's
   * fatal-error path can reach it: by then `activated` is already true, and
   * the guard at the top of `activate` would refuse the very call that is
   * supposed to rescue the lesson.
   */
  const startYouTube = useCallback(async (startAt: number) => {
    if (!mountRef.current) return;
    // No id means an uploaded lecture, and there is no YouTube player to
    // build. Reaching here at all would be a bug in the caller, so it fails
    // closed rather than constructing a player for `undefined`.
    if (video.youtubeId === null) return;

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
            if (readyTimerRef.current) {
              clearTimeout(readyTimerRef.current);
              readyTimerRef.current = null;
            }
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
          // The `event.data` code was always there — `lib/youtube.ts` even
          // types it — and was always dropped on the floor.
          onError: (event) => setFailure(failureOfCode(event.data)),
        },
      });
      playerRef.current = instance;

      // Armed AFTER construction so it only ever measures the frame, never the
      // script fetch that `loadYouTubeIframeApi` already bounds. `onReady`
      // above disarms it; nothing else can, which is the point.
      readyTimerRef.current = setTimeout(() => {
        readyTimerRef.current = null;
        if (playerRef.current !== instance) return;
        // The frame was built on `youtube-nocookie.com` and never spoke. Take
        // it down and let the plain embed try the ordinary host instead —
        // filters routinely carry one of the two domains and not the other.
        instance.destroy();
        playerRef.current = null;
        setPlainFrame(true);
      }, FRAME_READY_TIMEOUT_MS);
    } catch {
      // `loadYouTubeIframeApi()` threw, or the constructor did: the script
      // never arrived — an ad blocker, filtered DNS, or a captive network.
      // None of those necessarily touch the video itself, so this is a
      // fallback and not yet a failure.
      setPlainFrame(true);
    }
  }, [video.youtubeId]);

  const activate = useCallback(async (startAt: number) => {
    if (activated || !mountRef.current) return;
    // Nothing to play yet. The poster is already saying so; this is the guard
    // that keeps a keyboard activation from getting past it.
    if (stillProcessing) return;
    setActivated(true);
    setStartedAt(startAt);

    // Our copy needs no API, no script and no handshake — the element is in
    // the tree on the next render and starts itself. Nothing below this line
    // applies to it.
    if (useMirror) return;

    await startYouTube(startAt);
  }, [activated, stillProcessing, useMirror, startYouTube]);

  useEffect(() => {
    return () => {
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
      readyTimerRef.current = null;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  return (
    <>
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

      {/*
        «النسخة اللي عندنا». Rendered INSTEAD of the YouTube frame, not beside
        it — the mount div above stays empty in this branch and costs nothing.

        `activated` gates it for the same reason it gates everything else: the
        poster is the page's first paint and a video element that starts
        fetching a playlist before anyone pressed play would spend a student's
        data on a lesson they were only scrolling past.
      */}
      {activated && useMirror && video.mirror ? (
        <MirrorVideo
          mirror={video.mirror}
          title={title}
          posterUrl={posterFailed ? null : video.posterUrl}
          startAt={startedAt}
          onPlayer={setPlayer}
          onFatal={() => {
            setMirrorFailed(true);
            if (isUpload) {
              // Nowhere to go. This lecture is ours and only ours, so the
              // panel names that instead of quietly trying a YouTube video
              // that was never uploaded.
              setFailure('ourCopyFailed');
              return;
            }
            // Straight on to YouTube, from the same second. The student sees
            // one reload of the frame rather than an error, and for everyone
            // whose network allows YouTube that is the end of it.
            void startYouTube(startedAt);
          }}
        />
      ) : null}

      {/*
        The fallback embed. `youtube.com`, deliberately NOT the nocookie host
        the API player uses: when the API player is the thing that failed, the
        host it was built on is one of the two suspects, and repeating it would
        make this a retry of the same request rather than a different attempt.

        `autoplay=1` is safe here in a way it is not for the API player: this
        frame is only ever mounted because the student pressed play, so the
        gesture that permits autoplay has already happened.
      */}
      {plainFrame && plainEmbedSrc !== null ? (
        <iframe
          title={title}
          src={plainEmbedSrc}
          allow={FRAME_ALLOW}
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : null}

      {/*
        The lecture is ours, and the encoder has not finished with it yet.

        Rendered INSTEAD of the poster — before this, an upload still being
        packaged showed a normal play button over a playlist URL that 404s, so
        a student who arrived in the first few minutes after the instructor
        uploaded got the same spinning grey box this whole feature exists to
        end. It self-heals on the next page load, which is exactly why it had
        to say so rather than look broken.
      */}
      {stillProcessing ? (
        <div
          role="status"
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-2 px-6',
            'text-center text-fg-muted',
          )}
        >
          <span
            aria-hidden="true"
            className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent"
          />
          <p className="text-[length:var(--fs-text-sm)]">{copy.player.videoProcessing}</p>
        </div>
      ) : null}

      {!activated && !stillProcessing ? (
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
              {posterFailed ? null : (
                <img
                  src={video.posterUrl}
                  alt=""
                  onError={() => setPosterFailed(true)}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
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

      {/*
        The failure NAMES itself now, and offers the action that matches it.

        One sentence for four unrelated causes left the student with nothing to
        do and the instructor with nothing to check. Every branch also offers
        the video on YouTube directly — the escape hatch for the student and, at
        the same time, the diagnostic: a video that plays there and not here is
        embedding-blocked, which is the failure the admin's save-time check and
        its own preview now catch first.
      */}
      {failure ? (
        <div
          role="status"
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-2 px-6',
            'text-center text-[length:var(--fs-text-sm)] text-fg-muted',
          )}
        >
          <p>{FAILURE_COPY[failure]}</p>
          <div className="flex items-center gap-4">
            {/*
              No retry here any more. The one failure a retry could clear —
              the API script not loading — no longer reaches this panel at
              all: it falls back to the plain embed instead, which is a better
              answer than asking the student to press the same button again.
              What is left are the three YouTube REPORTED, and every one of
              them is about the video rather than the connection.

              And nothing at all for an uploaded lecture: there is no YouTube
              page behind it, so this link would be a promise of a video that
              does not exist.
            */}
            {youtubeId !== null ? (
              <a
                href={`https://www.youtube.com/watch?v=${youtubeId}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {copy.player.videoOpenOnYouTube}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>

    {/*
      Sits UNDER the player, not over it: the fallback frame is YouTube's own
      chrome, and a bar across its bottom edge would land on the controls.

      Always carries the YouTube link, because the fallback is the last thing
      this component can try — if the embed is dark too, this sentence is the
      only route left to the lesson.
    */}
    {plainFrame && youtubeId !== null ? (
      <p
        role="status"
        className="mt-2 text-[length:var(--fs-text-sm)] text-fg-muted"
      >
        {copy.player.videoFallbackNote}{' '}
        <a
          href={`https://www.youtube.com/watch?v=${youtubeId}`}
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          {copy.player.videoOpenOnYouTube}
        </a>
      </p>
    ) : null}
    </>
  );
}
