'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import type { VideoLadderUpgrade } from '@ayman/contracts/admin/video-upload';
import { cn } from '@ayman/ui/lib/cn';
import {
  requestVideoLadderUpgradeAction,
  videoLadderUpgradeAction,
} from '@/app/(admin)/admin/courses/actions';

const c = copy.admin.lesson;
const POLL_MS = 5_000;

const label = (heights: readonly number[]) => heights.map((h) => `${h}p`).join(' · ');

/**
 * «حسّن الجودات» — build the missing rungs of a lecture published as it is:
 * all of them, or only the ones the owner ticks («720 بس»).
 *
 * Draws NOTHING unless the API says `available`, which it does only on
 * Ayman's stack and only for a ready, uploaded lecture — so the other two
 * stacks never see a control for a feature that is not theirs.
 */
export function VideoLadderUpgradeButton({ lessonId }: { lessonId: string }) {
  const [info, setInfo] = useState<VideoLadderUpgrade | null>(null);
  const [busy, setBusy] = useState(false);
  // What the owner has UNticked. Everything buildable starts ticked — «الكل»
  // is the usual answer, and a rung appearing later is offered ticked too.
  const [unticked, setUnticked] = useState<readonly number[]>([]);

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

  const chosen = info.buildable.filter((height) => !unticked.includes(height));
  const all = chosen.length === info.buildable.length;
  // What the running job is making: what was asked, or — for «الكل» — everything still missing.
  const making = info.requested.length > 0 ? info.requested : info.buildable;

  function toggle(height: number) {
    setUnticked((now) => (now.includes(height) ? now.filter((h) => h !== height) : [...now, height]));
  }

  function press() {
    if (chosen.length === 0) return;
    setBusy(true);
    // «الكل» goes as an empty list: the worker builds whatever is missing when it runs.
    void requestVideoLadderUpgradeAction(lessonId, all ? [] : chosen)
      .then((next) => {
        if (next !== null) {
          setInfo(next);
          setUnticked([]);
        }
      })
      .finally(() => setBusy(false));
  }

  return (
    <div className="mt-3 rounded-md border border-line bg-surface-2 p-3">
      <p className="text-[length:var(--fs-text-xs)] font-semibold text-fg">{c.ladderTitle}</p>
      {info.heights.length > 0 ? (
        <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted" dir="ltr">
          {formatCopy(c.ladderNow, { heights: label(info.heights) })}
        </p>
      ) : null}

      {info.state === 'queued' ? (
        <p className="mt-2 text-[length:var(--fs-text-sm)] text-fg">
          {formatCopy(c.ladderQueued, { heights: label(making) })}
        </p>
      ) : null}
      {info.state === 'running' ? (
        <p className="mt-2 text-[length:var(--fs-text-sm)] text-fg" aria-live="polite">
          {formatCopy(c.ladderRunning, { heights: label(making), percent: info.progress ?? 0 })}
        </p>
      ) : null}
      {info.state === 'waiting' ? (
        <p className="mt-2 text-[length:var(--fs-text-sm)] text-fg" aria-live="polite">
          {formatCopy(c.ladderWaiting, { percent: info.progress ?? 0 })}
        </p>
      ) : null}
      {info.state === 'failed' ? (
        <p className="mt-2 text-[length:var(--fs-text-sm)] text-err">
          {formatCopy(c.ladderFailed, { error: info.error ?? '' })}
        </p>
      ) : null}
      {info.state === 'done' && info.buildable.length === 0 ? (
        <p className="mt-2 text-[length:var(--fs-text-sm)] text-fg">{c.ladderDone}</p>
      ) : null}

      {!watching && info.buildable.length > 0 ? (
        <>
          <p className="mt-3 text-[length:var(--fs-text-xs)] text-fg-muted">{c.ladderPick}</p>
          <div className="mt-1.5 flex flex-wrap gap-2" dir="ltr">
            {info.buildable.map((height) => {
              const on = !unticked.includes(height);
              return (
                <button
                  key={height}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(height)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[length:var(--fs-text-sm)]',
                    'transition-colors duration-[160ms]',
                    on
                      ? 'border-accent bg-accent/12 font-semibold text-accent-text'
                      : 'border-line text-fg-muted hover:bg-surface-3',
                  )}
                >
                  {on ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : null}
                  <span className="mono">{height}p</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={busy || chosen.length === 0}
            onClick={press}
            className="mt-3 rounded-md bg-accent px-3 py-1.5 text-[length:var(--fs-text-sm)] font-semibold text-[#1A1206] disabled:opacity-60"
          >
            {info.state === 'failed'
              ? c.ladderRetry
              : all
                ? c.ladderButtonAll
                : formatCopy(c.ladderButtonSome, { heights: label(chosen) })}
          </button>
          <p className="mt-2 text-[length:var(--fs-text-xs)] text-fg-muted">{c.ladderHint}</p>
        </>
      ) : null}
      {!watching && info.buildable.length === 0 && info.heights.length > 0 && info.state !== 'done' ? (
        <p className="mt-2 text-[length:var(--fs-text-sm)] text-fg-muted">{c.ladderAllThere}</p>
      ) : null}
    </div>
  );
}
