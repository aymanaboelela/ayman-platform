'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { copy } from '@ayman/contracts/copy/admin';
import type { VideoMirrorStatus } from '@ayman/contracts/video';
import { cn } from '@ayman/ui/lib/cn';
import { refreshCourseAction, resourceVideoStatusAction } from '@/app/(admin)/admin/courses/actions';
import { formatDuration } from '@/lib/format';
import { formatBytes, formatEta, formatSpeed } from '@/lib/upload-format';
import {
  cancelResourceUpload,
  dismissUpload,
  isSameFile,
  resumeResourceUpload,
  savedResourceUpload,
  type UploadEntry,
} from '@/lib/video-upload-manager';

const c = copy.admin.resource;

/** How often the encoder is asked whether it is done — the lecture panel's own pace. */
const POLL_MS = 4000;

const noopSubscribe = () => () => undefined;

/**
 * Where one uploaded material is, on its own row: «بيترفع ٤٢٪» with the
 * speed, «بيتجهّز على السيرفر ٦٠٪», «جاهز للطلبة», or why not.
 *
 * Two sources, read together. `entry` is THIS tab's transfer (the store in
 * `video-upload-manager.ts`), which knows bytes and speed; `status` is the
 * row as the server last rendered it, which knows what happened in any other
 * tab. The encoder is polled only while one of them says it is working, and
 * when it finishes the page is re-rendered so the row reads «جاهز» without
 * anyone reloading.
 */
export function ResourceVideoStatus({
  courseId,
  lessonId,
  resourceId,
  status,
  progress,
  error,
  durationSeconds,
  entry,
}: {
  courseId: string;
  lessonId: string;
  resourceId: string;
  status: VideoMirrorStatus | null;
  progress: number | null;
  error: string | null;
  durationSeconds: number | null;
  entry: UploadEntry | null;
}) {
  const router = useRouter();
  // The poll below must not restart on a new router object — it would fire
  // a request per render. A ref keeps the latest without being a dependency.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  });
  const [polled, setPolled] = useState<{ status: VideoMirrorStatus; progress: number | null; error: string | null } | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // `localStorage` only once hydrated — see the same guard in `VideoUpload`.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const current = polled?.status ?? status;
  const uploading = entry?.phase === 'uploading';
  const processing =
    entry?.phase === 'processing' || (!uploading && (current === 'pending' || current === 'mirroring'));

  useEffect(() => {
    if (!processing) return undefined;
    let live = true;
    const tick = async () => {
      const next = await resourceVideoStatusAction(resourceId);
      if (!live || next === null) return;
      setPolled({ status: next.status, progress: next.progress, error: next.error });
      if (next.status === 'ready' || next.status === 'failed') {
        if (entry !== null) dismissUpload(entry.key);
        await refreshCourseAction(courseId);
        routerRef.current.refresh();
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [processing, resourceId, courseId, entry]);

  if (uploading && entry !== null) {
    const percent = entry.total === 0 ? 0 : Math.min(100, Math.round((entry.sent / entry.total) * 100));
    return (
      <span className="mt-1 block space-y-1">
        <Bar percent={percent} tone="upload" />
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
          <span>{c.videoStatusUploading}</span>
          <span dir="ltr" className="mono tabular">
            {percent}% · {formatBytes(entry.sent)} / {formatBytes(entry.total)}
          </span>
          {entry.bytesPerSecond !== null ? (
            <span dir="ltr" className="mono tabular">
              {formatSpeed(entry.bytesPerSecond)}
            </span>
          ) : null}
          {entry.secondsLeft !== null && entry.secondsLeft > 0 ? <span>{formatEta(entry.secondsLeft)}</span> : null}
          <button
            type="button"
            className="chip chip--quiet"
            onClick={() => void cancelResourceUpload(courseId, resourceId).then(() => router.refresh())}
          >
            {c.videoCancelUpload}
          </button>
        </span>
      </span>
    );
  }

  if (processing) {
    const percent = polled?.progress ?? progress ?? 0;
    return (
      <span className="mt-1 block space-y-1">
        <Bar percent={percent} tone="process" />
        <span role="status" className="block text-[length:var(--fs-text-xs)] text-fg-muted">
          {c.videoStatusProcessing} <span className="mono tabular">{percent}%</span>
        </span>
      </span>
    );
  }

  /*
   * Stopped half-way: the row is `uploading` on the server and nothing in
   * this tab is sending. The bytes are on the instructor's disk, so only the
   * same file can carry on — and only from the browser that kept the session.
   */
  const saved = hydrated && (current === 'uploading' || entry?.phase === 'error') ? savedResourceUpload(resourceId) : null;
  if (current === 'uploading' || entry?.phase === 'error') {
    return (
      <span className="mt-1 block space-y-1 text-[length:var(--fs-text-xs)]">
        <span role="alert" className="block text-[color:var(--warn)]">
          {entry?.phase === 'error' && entry.message ? entry.message : c.videoStatusInterrupted}
        </span>
        {saved !== null ? (
          <>
            <button type="button" className="chip chip--quiet" onClick={() => inputRef.current?.click()}>
              {c.videoResumePick}
            </button>
            <span dir="ltr" className="mono ms-2 text-fg-subtle">
              {saved.fileName} · {formatBytes(saved.size)}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (!file) return;
                if (!isSameFile(file, saved)) {
                  setMessage(copy.admin.lesson.videoUploadNotSameFile);
                  return;
                }
                setMessage(null);
                void resumeResourceUpload(lessonId, resourceId, file, saved);
              }}
            />
          </>
        ) : null}
        {message !== null ? (
          <span role="alert" className="block text-[color:var(--err)]">
            {message}
          </span>
        ) : null}
      </span>
    );
  }

  if (current === 'failed') {
    return (
      <span role="alert" className="mt-1 block text-[length:var(--fs-text-xs)] text-[color:var(--err)]">
        {c.videoStatusFailed}
        {(polled?.error ?? error) ? (
          <span dir="ltr" className="mono ms-2 inline-block max-w-full truncate align-bottom">
            {polled?.error ?? error}
          </span>
        ) : null}
      </span>
    );
  }

  if (current === 'ready') {
    return (
      <span className="mt-1 block text-[length:var(--fs-text-xs)] text-ok">
        {c.videoStatusReady}
        {durationSeconds !== null && durationSeconds > 0 ? (
          <span dir="ltr" className="mono tabular ms-2 text-fg-muted">
            {formatDuration(durationSeconds)}
          </span>
        ) : null}
      </span>
    );
  }

  return null;
}

function Bar({ percent, tone }: { percent: number; tone: 'upload' | 'process' }) {
  return (
    <span
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
    >
      <span
        className={cn(
          'block h-full rounded-full transition-[inline-size] duration-300 ease-out',
          tone === 'upload' ? 'bg-accent' : 'bg-ok',
        )}
        style={{ inlineSize: `${percent}%` }}
      />
    </span>
  );
}
