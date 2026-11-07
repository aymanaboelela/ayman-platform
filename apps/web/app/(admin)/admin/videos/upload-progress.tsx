'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CloudUpload, PauseCircle, RotateCcw } from 'lucide-react';
import type { VideoUploadProgress } from '@ayman/contracts/admin/video-upload';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { formatBytes, formatEta, formatSpeed } from '@/lib/upload-format';
import { resumeUpload, useUpload } from '@/lib/video-upload-manager';
import { cn } from '@ayman/ui/lib/cn';
import { uploadProgressAction } from './actions';

const c = copy.admin.videos.progress;

/** How often a row asks the bucket — parts are tens of MB, so faster shows nothing new. */
const POLL_MS = 15_000;
/** No new part for this long, and this tab is not sending: the upload has stopped. */
const STALL_MS = 3 * 60_000;

function ago(iso: string, now: number): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return c.agoNow;
  if (minutes < 60) return formatCopy(c.agoMinutes, { n: minutes });
  return formatCopy(c.agoHours, { h: Math.floor(minutes / 60), m: minutes % 60 });
}

/**
 * «اترفع قد إيه» on the videos screen.
 *
 * Two sources, the better one wins:
 *  - THIS tab is sending it → the upload manager's live numbers (byte-exact,
 *    speed over the last seconds), the same ones the corner card shows.
 *  - anyone else → the bucket, polled: whole parts that arrived, and when the
 *    newest one did. That is what makes «بيترفع» an honest word: a part that
 *    has not landed for minutes, with no tab sending, is a stopped upload, and
 *    the row then offers «كمّل الرفع» with the same file — from any browser,
 *    because the API hands back the `uploadId` the original tab held.
 */
export function UploadProgress({ lessonId, courseId }: { lessonId: string; courseId: string }) {
  const router = useRouter();
  const live = useUpload(lessonId);
  const [remote, setRemote] = useState<VideoUploadProgress | null | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  const [resuming, setResuming] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const liveSending = live !== null && live.phase === 'uploading';

  useEffect(() => {
    if (liveSending) return;
    let alive = true;
    const tick = async () => {
      const next = await uploadProgressAction(lessonId);
      if (!alive) return;
      setRemote(next);
      setNow(Date.now());
      // Sealed while we watched: encoding (or ready) now — let the page say so.
      if (next !== null && !next.uploading) router.refresh();
    };
    void tick();
    const timer = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [lessonId, liveSending, router]);

  // The «من N دقيقة» line ages between polls.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function pick(file: File | undefined) {
    if (!file || !remote?.uploadId || !remote.videoId || remote.totalBytes === null) return;
    if (file.size !== remote.totalBytes) {
      toast.error(formatCopy(c.resumeWrongFile, { total: formatBytes(remote.totalBytes) }));
      return;
    }
    setResuming(true);
    try {
      void resumeUpload(lessonId, file, {
        videoId: remote.videoId,
        uploadId: remote.uploadId,
        courseId,
        fileName: file.name,
        size: file.size,
        lastModified: file.lastModified,
      });
      toast.success(c.resumeStarted);
    } catch {
      toast.error(c.resumeFailed);
    } finally {
      setResuming(false);
    }
  }

  /* ── numbers ─────────────────────────────────────────────────────────── */

  let sent = 0;
  let total: number | null = null;
  let speed: number | null = null;
  let secondsLeft: number | null = null;
  let state: 'live' | 'elsewhere' | 'stopped' | 'noParts' | 'checking' = 'checking';
  let lastAt: string | null = null;

  if (live !== null && liveSending) {
    sent = live.sent;
    total = live.total;
    speed = live.bytesPerSecond;
    secondsLeft = live.secondsLeft;
    state = 'live';
  } else if (remote) {
    sent = remote.sentBytes;
    total = remote.totalBytes;
    lastAt = remote.lastPartAt ?? remote.startedAt;
    const quiet = lastAt === null ? Infinity : now - new Date(lastAt).getTime();
    if (remote.uploadId === null || (remote.partsDone === 0 && quiet > STALL_MS)) {
      state = remote.uploadId === null ? 'noParts' : 'stopped';
    } else {
      state = quiet > STALL_MS ? 'stopped' : 'elsewhere';
    }
    // The bucket gives no instantaneous speed; the average since the first
    // byte is what an ETA can honestly be built on.
    if (state === 'elsewhere' && remote.startedAt && remote.lastPartAt && total !== null) {
      const seconds = (new Date(remote.lastPartAt).getTime() - new Date(remote.startedAt).getTime()) / 1000;
      if (seconds > 30 && sent > 0) {
        speed = sent / seconds;
        secondsLeft = Math.round((total - sent) / speed);
      }
    }
  }

  if (remote === null && !liveSending) return null; // the read failed: keep the plain badge
  const percent = total ? Math.min(100, Math.floor((sent / total) * 100)) : 0;
  const sealed = total !== null && sent >= total;

  const tone =
    state === 'stopped' || state === 'noParts'
      ? 'warn'
      : state === 'checking'
        ? 'muted'
        : 'info';

  return (
    <div
      className={cn(
        'mt-3 rounded-lg border p-3',
        tone === 'warn'
          ? 'border-[color-mix(in_oklab,var(--warn)_45%,var(--border))] bg-[color-mix(in_oklab,var(--warn)_8%,var(--n-2))]'
          : 'border-[color-mix(in_oklab,var(--info)_35%,var(--border))] bg-[color-mix(in_oklab,var(--info)_6%,var(--n-2))]',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {state === 'stopped' || state === 'noParts' ? (
          <PauseCircle className="size-4 text-[color:var(--warn)]" aria-hidden="true" />
        ) : (
          <CloudUpload className="size-4 text-info" aria-hidden="true" />
        )}
        <span className="text-[length:var(--fs-text-sm)] font-semibold text-fg">
          {state === 'checking'
            ? c.checking
            : state === 'stopped'
              ? c.stoppedTitle
              : state === 'noParts'
                ? c.noParts
                : sealed
                  ? c.sealing
                  : state === 'live'
                    ? c.live
                    : c.elsewhere}
        </span>
        {state !== 'checking' && state !== 'noParts' ? (
          <span dir="ltr" className="mono tabular ms-auto text-[length:var(--fs-title-4)] font-semibold text-fg">
            {percent}%
          </span>
        ) : null}
      </div>

      {state !== 'checking' && state !== 'noParts' ? (
        <>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-3"
          >
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-700 ease-out',
                state === 'stopped' ? 'bg-[color:var(--warn)]' : 'bg-accent',
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-muted">
            {total !== null ? (
              <span className="tabular">{formatCopy(c.sentOf, { sent: formatBytes(sent), total: formatBytes(total) })}</span>
            ) : null}
            {speed !== null && state !== 'stopped' ? <span className="tabular">{formatSpeed(speed)}</span> : null}
            {secondsLeft !== null && state !== 'stopped' && !sealed ? (
              <span className="tabular">{formatEta(secondsLeft)}</span>
            ) : null}
            {lastAt !== null && state !== 'live' ? (
              <span className="tabular">{formatCopy(c.lastPart, { ago: ago(lastAt, now) })}</span>
            ) : null}
          </p>
        </>
      ) : null}

      {state === 'stopped' && remote?.uploadId ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            ref={input}
            type="file"
            accept="video/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              void pick(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={resuming}
            onClick={() => input.current?.click()}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-[length:var(--fs-text-sm)] font-semibold text-[#1A1206] transition-colors duration-[160ms] ease-out hover:bg-accent-hover disabled:opacity-60 md:h-9"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            {c.resume}
          </button>
          <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
            {formatCopy(c.stoppedHint, { sent: formatBytes(sent) })}
          </span>
        </div>
      ) : null}
    </div>
  );
}
