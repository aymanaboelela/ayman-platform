'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { copy } from '@ayman/contracts/copy';
import type { PlayerVideoMirror } from '@ayman/contracts/video';
import { cn } from '@ayman/ui/lib/cn';
import { PlayIcon } from './icons';
import { MirrorVideo } from './mirror-video';

const c = copy.player;

/**
 * «رفع فيديو» in a lesson's materials — «حل الواجب» on camera — played by the
 * SAME player as the lecture: our HLS ladder, hls.js (or Safari's own),
 * quality and speed menus, the AES-128 key from `/api/videos/:id/key` behind
 * the student's session, no download entry, and the name over the picture.
 *
 * What it deliberately leaves out of `VideoLesson` is everything that belongs
 * to the LECTURE: the heartbeat, the resume point and completion. Watching a
 * homework solution must not move the lecture's progress, and resuming a
 * five-minute clip is not a thing anyone asked for.
 *
 * Click to load, like the lecture: a materials list with three videos would
 * otherwise fetch three playlists for a student who only scrolled past.
 */
export function ResourceVideo({
  mirror,
  posterUrl,
  title,
  watermark,
}: {
  mirror: PlayerVideoMirror;
  posterUrl: string | null;
  title: string;
  watermark: string | null;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [activated, setActivated] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  /** Pinned over the page where the Fullscreen API is missing or refused — an iPhone, an in-app browser. */
  const [pinned, setPinned] = useState(false);
  const [posterBroken, setPosterBroken] = useState(false);

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === shellRef.current);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') setPinned(false);
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // The SHELL goes fullscreen, never the <video>: the element alone would drop
  // the bar and the name over the picture — see `VideoLesson.toggleFullscreen`.
  const toggleFullscreen = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (typeof shell.requestFullscreen !== 'function') {
      setPinned((on) => !on);
      return;
    }
    shell.requestFullscreen().catch(() => setPinned(true));
  }, []);

  const noPlayer = useCallback(() => undefined, []);

  return (
    <div
      ref={shellRef}
      className={cn(
        'relative w-full overflow-hidden bg-black',
        fullscreen ? 'h-full' : 'aspect-video rounded-md border border-line',
        pinned && 'fixed inset-0 z-[60] h-dvh w-screen rounded-none border-0',
      )}
    >
      {activated && !failed ? (
        <MirrorVideo
          mirror={mirror}
          title={title}
          posterUrl={posterUrl}
          startAt={0}
          onPlayer={noPlayer}
          onFatal={() => setFailed(true)}
          fullscreen={fullscreen || pinned}
          onToggleFullscreen={toggleFullscreen}
          watermark={watermark}
        />
      ) : null}

      {failed ? (
        <p
          role="alert"
          className="absolute inset-0 grid place-items-center bg-surface-2 p-4 text-center text-[length:var(--fs-text-sm)] text-fg-muted"
        >
          {c.resourceVideoFailed}
        </p>
      ) : null}

      {!activated ? (
        <button
          type="button"
          onClick={() => setActivated(true)}
          aria-label={`${c.play} — ${title}`}
          className="group absolute inset-0 grid h-full w-full place-items-center bg-surface-2"
        >
          {posterUrl && !posterBroken ? (
            <>
              <img
                src={posterUrl}
                alt=""
                onError={() => setPosterBroken(true)}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <span aria-hidden="true" className="absolute inset-0 bg-black/45" />
            </>
          ) : null}
          <span
            aria-hidden="true"
            className={cn(
              'relative grid size-14 place-items-center rounded-full bg-accent text-[#1A1206] shadow-lg',
              'transition-transform duration-[160ms] ease-out group-hover:scale-105',
            )}
          >
            <PlayIcon className="size-6" />
          </span>
        </button>
      ) : null}
    </div>
  );
}
