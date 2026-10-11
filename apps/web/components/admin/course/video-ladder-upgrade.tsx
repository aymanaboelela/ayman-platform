'use client';

import { useEffect, useState } from 'react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import type { VideoLadderUpgrade } from '@ayman/contracts/admin/video-upload';
import {
  requestVideoLadderUpgradeAction,
  videoLadderUpgradeAction,
} from '@/app/(admin)/admin/courses/actions';

const c = copy.admin.lesson;
const POLL_MS = 5_000;

/**
 * «حسّن الجودات» — build 720 / 480 / 360 for a lecture published as it is.
 *
 * Draws NOTHING unless the API says `available`, which it does only on
 * Ayman's stack and only for a ready, uploaded lecture — so the other two
 * stacks never see a button for a feature that is not theirs.
 */
export function VideoLadderUpgradeButton({ lessonId }: { lessonId: string }) {
  const [info, setInfo] = useState<VideoLadderUpgrade | null>(null);
  const [busy, setBusy] = useState(false);

  // Once on mount…
  useEffect(() => {
    let alive = true;
    void videoLadderUpgradeAction(lessonId).then((next) => {
      if (alive && next !== null) setInfo(next);
    });
    return () => {
      alive = false;
    };
  }, [lessonId]);

  // …and then only while there is something to watch.
  const watching = info?.state === 'queued' || info?.state === 'running' || info?.state === 'waiting';
  useEffect(() => {
    if (!watching) return;
    let alive = true;
    const id = setInterval(() => {
      void videoLadderUpgradeAction(lessonId).then((next) => {
        if (alive && next !== null) setInfo(next);
      });
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [lessonId, watching]);

  if (info === null || !info.available) return null;

  const working = info.state === 'queued' || info.state === 'running' || info.state === 'waiting';
  const missing = info.heights.length < 4 && !working;

  function press() {
    setBusy(true);
    void requestVideoLadderUpgradeAction(lessonId)
      .then((next) => {
        if (next !== null) setInfo(next);
      })
      .finally(() => setBusy(false));
  }

  return (
    <div className="mt-3 rounded-md border border-line bg-surface-2 p-3">
      <p className="text-[length:var(--fs-text-xs)] font-semibold text-fg">{c.ladderTitle}</p>
      {info.heights.length > 0 ? (
        <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted" dir="ltr">
          {formatCopy(c.ladderNow, { heights: info.heights.map((h) => `${h}p`).join(' · ') })}
        </p>
      ) : null}

      {info.state === 'queued' ? <p className="mt-2 text-[length:var(--fs-text-sm)] text-fg">{c.ladderQueued}</p> : null}
      {info.state === 'running' ? (
        <p className="mt-2 text-[length:var(--fs-text-sm)] text-fg" aria-live="polite">
          {formatCopy(c.ladderRunning, { percent: info.progress ?? 0 })}
        </p>
      ) : null}
      {info.state === 'waiting' ? (
        <p className="mt-2 text-[length:var(--fs-text-sm)] text-fg" aria-live="polite">
          {formatCopy(c.ladderWaiting, { percent: info.progress ?? 0 })}
        </p>
      ) : null}
      {info.state === 'failed' ? (
        <p className="mt-2 text-[length:var(--fs-text-sm)] text-err">{formatCopy(c.ladderFailed, { error: info.error ?? '' })}</p>
      ) : null}
      {info.state === 'done' && !missing ? (
        <p className="mt-2 text-[length:var(--fs-text-sm)] text-fg">{c.ladderDone}</p>
      ) : null}

      {!working && (missing || info.state === 'failed') ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={press}
            className="mt-2 rounded-md bg-accent px-3 py-1.5 text-[length:var(--fs-text-sm)] font-semibold text-[#1A1206] disabled:opacity-60"
          >
            {info.state === 'failed' ? c.ladderRetry : c.ladderButton}
          </button>
          <p className="mt-2 text-[length:var(--fs-text-xs)] text-fg-muted">{c.ladderHint}</p>
        </>
      ) : null}
      {!working && !missing && info.state !== 'done' && info.state !== 'failed' ? (
        <p className="mt-2 text-[length:var(--fs-text-sm)] text-fg-muted">{c.ladderAllThere}</p>
      ) : null}
    </div>
  );
}
