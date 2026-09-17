'use client';

import { useEffect, useRef, useState } from 'react';
import type { PlayerVideoMirror } from '@ayman/contracts/video';
import type { YouTubePlayer } from '@/lib/youtube';

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
 * ── Why an ordinary `<video>` and not a player library ────────────────────
 * Everything a lecture needs is already in the element: the scrubber, the
 * volume, fullscreen, playback rate, AirPlay, the Android picture-in-picture
 * button, and — the one that matters most here — the browser's own handling
 * of a flaky connection. A JS player would re-implement those less well and
 * add a bundle to a page students open on a school tablet.
 *
 * ── Why HLS at all, rather than one mp4 ───────────────────────────────────
 * Adaptive bitrate is the difference between "works" and "works like
 * YouTube". A single 1080p file on a classroom connection buffers every
 * thirty seconds; the ladder lets the browser drop to 480p for a minute and
 * come back up, which is exactly what a student experiences as the video
 * simply playing. Safari does that natively for an `.m3u8`; every other
 * engine needs hls.js, imported dynamically so the ~120KB only ever reaches a
 * student who is actually about to use it.
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
   *
   * The mirror keeps the progress bar working, which the plain-iframe
   * fallback never could — that path has no `getCurrentTime`, so a student
   * pushed onto it watched a whole lecture that the platform recorded as
   * unwatched. Here the position is on the element itself.
   */
  onPlayer: (player: YouTubePlayer | null) => void;
  /**
   * Called when our copy cannot play at all.
   *
   * The caller's answer is to fall back to YouTube — which for most students
   * works fine, and for the ones this component was written for is no worse
   * than the nothing they had. A mirror that fails must never be a dead end.
   */
  onFatal: () => void;
}

/** `HTMLMediaElement.readyState` values the heartbeat treats as playing. */
const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_ENDED = 0;

/**
 * Make a `<video>` answer the three questions the heartbeat asks a YouTube
 * player.
 *
 * An adapter rather than a second heartbeat: the completion rules, the
 * throttling, the in-flight guard and the "watched vs skipped" arithmetic are
 * subtle, already written, and already tested. Duplicating them for a second
 * element is how the two would drift, and the one that drifts is the one
 * nobody is watching.
 */
function adapt(element: HTMLVideoElement): YouTubePlayer {
  return {
    getCurrentTime: () => element.currentTime,
    getDuration: () => (Number.isFinite(element.duration) ? element.duration : 0),
    getPlayerState: () => {
      if (element.ended) return YT_ENDED;
      return element.paused ? YT_PAUSED : YT_PLAYING;
    },
    playVideo: () => void element.play().catch(() => undefined),
    destroy: () => undefined,
  };
}

export function MirrorVideo({
  mirror,
  title,
  posterUrl,
  startAt,
  onPlayer,
  onFatal,
}: MirrorVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [seeked, setSeeked] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let disposed = false;
    // Typed as unknown rather than as Hls: the class is only ever in hand
    // inside the dynamic import below, and importing the type eagerly at the
    // top of the file would pull the module into the main bundle for every
    // student, which is the one thing the dynamic import exists to prevent.
    let hls: { destroy: () => void } | null = null;

    /*
     * Safari — and every iOS browser, which are all Safari — plays HLS
     * natively and MUST NOT be given hls.js: iOS has no Media Source
     * Extensions on the phone, so the library would attach, fail, and report
     * a fatal error for a stream the element could have played by itself.
     */
    if (element.canPlayType('application/vnd.apple.mpegurl') !== '') {
      element.src = mirror.hlsUrl;
      onPlayer(adapt(element));
    } else {
      void import('hls.js')
        .then(({ default: Hls }) => {
          if (disposed) return;
          if (!Hls.isSupported()) {
            // No MSE and no native HLS. Rare, and always an old browser —
            // the same population that cannot run the rest of this app.
            onFatal();
            return;
          }

          const instance = new Hls({
            // The ministry tablet's connection is the design target: start
            // conservatively and let the ladder climb, rather than opening
            // with 1080p and stalling on the first segment.
            startLevel: -1,
            capLevelToPlayerSize: true,
          });
          hls = instance;

          instance.on(Hls.Events.ERROR, (_event, data) => {
            if (!data.fatal) return;
            /*
             * Fatal media and network errors are recoverable often enough
             * that hls.js ships the recovery calls — a segment that 404s
             * during a deploy window, a decode hiccup on a cheap decoder.
             * Only give up when recovery itself is not on offer.
             */
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
          onPlayer(adapt(element));
        })
        .catch(() => {
          // The chunk itself did not arrive. Same network story as the
          // IFrame API script, same answer: try the other thing.
          if (!disposed) onFatal();
        });
    }

    return () => {
      disposed = true;
      hls?.destroy();
      onPlayer(null);
    };
    // `onPlayer`/`onFatal` are stable callbacks from the parent; re-running
    // this effect on an identity change would tear down a playing video.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mirror.hlsUrl]);

  return (
    <video
      ref={ref}
      className="absolute inset-0 h-full w-full bg-black"
      // `controls` is the whole UI. See the file note.
      controls
      // Without this iOS opens every video full-screen, which throws the
      // student out of the lesson page and its outline.
      playsInline
      autoPlay
      poster={posterUrl ?? undefined}
      // The element is labelled rather than captioned — the lecture title is
      // already the page's heading, and a screen reader landing on the video
      // needs to know which video it is.
      aria-label={title}
      preload="metadata"
      onLoadedMetadata={(event) => {
        // One seek, on the first metadata event only. `loadedmetadata` fires
        // again on every quality change in the native Safari path, and
        // seeking on each of those would drag a student backwards every time
        // their connection improved.
        if (seeked || startAt <= 0) return;
        setSeeked(true);
        event.currentTarget.currentTime = startAt;
      }}
    />
  );
}
