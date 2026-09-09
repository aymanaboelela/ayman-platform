'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { copy } from '@ayman/contracts/copy/admin';
import {
  MAX_UPLOAD_VIDEO_BYTES,
  UPLOAD_VIDEO_MIME,
  type VideoMirrorStatus,
} from '@ayman/contracts/video';
import type { VideoUploadSession } from '@ayman/contracts/admin/video-upload';
import { cn } from '@ayman/ui/lib/cn';
import {
  abortVideoUploadAction,
  completeVideoUploadAction,
  startVideoUploadAction,
  videoUploadStatusAction,
} from '@/app/(admin)/admin/courses/actions';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * «ارفع الفيديو» — the browser sends the bytes, this shows what is happening
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ Nothing here goes through a Server Action except three small JSON
 * messages. The file itself is PUT straight to the bucket with pre-signed
 * URLs. That is not a performance nicety: a Server Action body is capped at
 * 1 MB silently, and this platform has already lost a session to every upload
 * dying at exactly that size while a small test file passed.
 *
 * ── Why XHR and not fetch ─────────────────────────────────────────────────
 * `fetch` reports no upload progress. There is a streams-based way to fake it
 * that half the browsers in an Egyptian classroom do not have. An instructor
 * sending 2 GB needs a bar that moves, so: `XMLHttpRequest`, which has had
 * `upload.onprogress` since before any of this.
 */

/**
 * Parts in flight at once.
 *
 * Four, because one part at a time leaves most of an ADSL uplink idle waiting
 * on round trips, and because more than a handful of concurrent PUTs on a
 * domestic line makes every one of them slower while the bar looks busier.
 */
const CONCURRENCY = 4;

/** Attempts per part before the whole upload gives up. */
const PART_ATTEMPTS = 3;

/** How often the encoder is asked whether it is done. */
const POLL_MS = 4000;

type Phase = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

interface Progress {
  /** Bytes confirmed sent, across all parts. */
  sent: number;
  total: number;
}

/**
 * PUT one part, with progress, and give back the ETag S3 needs to seal the
 * upload.
 *
 * ⚠️ The ETag is a RESPONSE HEADER, and reading a response header
 * cross-origin requires the bucket's CORS rule to expose it. Without
 * `ExposeHeaders: ["ETag"]` every part uploads perfectly and the completion
 * fails with an empty ETag — which reads like a broken upload and is a
 * two-line bucket setting. See the runbook.
 */
function putPart(
  url: string,
  body: Blob,
  onProgress: (loaded: number) => void,
  signal: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);

    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`part failed: ${xhr.status}`));
        return;
      }
      const etag = xhr.getResponseHeader('ETag');
      if (etag === null || etag.length === 0) {
        reject(new Error('part uploaded without an ETag — check the bucket CORS rule'));
        return;
      }
      resolve(etag);
    };
    xhr.onerror = () => reject(new Error('part failed: network'));
    xhr.onabort = () => reject(new DOMException('aborted', 'AbortError'));

    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

export function VideoUpload({
  courseId,
  lessonId,
  /** What is already on this lesson, so the panel can say so before a pick. */
  current,
  onDone,
}: {
  courseId: string;
  lessonId: string;
  current: { status: VideoMirrorStatus; sourceName: string | null } | null;
  onDone?: () => void;
}) {
  const c = copy.admin.lesson;
  const [phase, setPhase] = useState<Phase>(
    // A lesson whose encode is still running when the page loads picks the
    // poll straight back up — closing the tab does not orphan the screen.
    current?.status === 'pending' || current?.status === 'mirroring' ? 'processing' : 'idle',
  );
  const [progress, setProgress] = useState<Progress>({ sent: 0, total: 0 });
  const [encodeProgress, setEncodeProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(current?.sourceName ?? null);

  const abortRef = useRef<AbortController | null>(null);
  const sessionRef = useRef<VideoUploadSession | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /*
   * ⚠️ A browser will not let a page ask "are you sure" with custom text any
   * more, but it WILL still show its own dialog if `preventDefault` is called.
   * An hour of upload thrown away by an accidental ⌘W is worth the generic
   * warning — and it is removed the moment the upload is not in flight, so it
   * never fires on an ordinary edit.
   */
  useEffect(() => {
    if (phase !== 'uploading') return undefined;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [phase]);

  /** Poll the encoder until it is finished, one way or the other. */
  useEffect(() => {
    if (phase !== 'processing') return undefined;

    let live = true;
    const tick = async () => {
      const status = await videoUploadStatusAction(lessonId);
      if (!live || status === null) return;

      setEncodeProgress(status.progress);
      if (status.status === 'ready') {
        setPhase('done');
        setMessage(null);
        onDone?.();
      } else if (status.status === 'failed') {
        setPhase('error');
        setMessage(status.error ?? c.videoUploadFailed);
      }
    };

    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [phase, lessonId, onDone, c.videoUploadFailed]);

  const upload = useCallback(
    async (file: File) => {
      if (file.size > MAX_UPLOAD_VIDEO_BYTES) {
        setPhase('error');
        setMessage(c.videoUploadTooBig);
        return;
      }
      // The browser's own guess. `ffprobe` is what actually decides, so this
      // only spares an hour spent uploading the wrong file.
      const contentType = (UPLOAD_VIDEO_MIME as readonly string[]).includes(file.type)
        ? file.type
        : 'video/mp4';
      if (!file.type.startsWith('video/')) {
        setPhase('error');
        setMessage(c.videoUploadWrongType);
        return;
      }

      setFileName(file.name);
      setPhase('uploading');
      setMessage(null);
      setProgress({ sent: 0, total: file.size });

      const started = await startVideoUploadAction(lessonId, {
        fileName: file.name,
        sizeBytes: file.size,
        contentType,
      });
      if (!started.ok) {
        setPhase('error');
        setMessage(started.message);
        return;
      }

      const session = started.session;
      sessionRef.current = session;
      const controller = new AbortController();
      abortRef.current = controller;

      /*
       * Progress is summed from a per-part table rather than accumulated.
       *
       * A part that fails halfway and is retried has already reported its
       * bytes once; adding them again would push the bar past 100% and, worse,
       * make it move while nothing is being sent. Storing the latest figure
       * per part means a retry simply overwrites its own number.
       */
      const sentPerPart = new Map<number, number>();
      const bump = () => {
        let sent = 0;
        for (const value of sentPerPart.values()) sent += value;
        setProgress({ sent, total: file.size });
      };

      const etags = new Map<number, string>();
      const queue = [...session.parts];

      const worker = async (): Promise<void> => {
        for (;;) {
          const part = queue.shift();
          if (part === undefined) return;

          const start = (part.partNumber - 1) * session.partSizeBytes;
          const blob = file.slice(start, Math.min(start + session.partSizeBytes, file.size));

          let lastError: unknown = null;
          for (let attempt = 1; attempt <= PART_ATTEMPTS; attempt += 1) {
            try {
              const etag = await putPart(
                part.url,
                blob,
                (loaded) => {
                  sentPerPart.set(part.partNumber, loaded);
                  bump();
                },
                controller.signal,
              );
              etags.set(part.partNumber, etag);
              sentPerPart.set(part.partNumber, blob.size);
              bump();
              lastError = null;
              break;
            } catch (error) {
              if (controller.signal.aborted) throw error;
              lastError = error;
              // Reset this part's contribution — the bytes it reported are
              // not on the server, and leaving them in makes the bar lie.
              sentPerPart.set(part.partNumber, 0);
              bump();
              // Linear back-off. The failures worth retrying here are a
              // dropped connection and a momentary 503, and both clear in
              // seconds; anything that does not is not going to.
              await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
            }
          }
          if (lastError !== null) throw lastError;
        }
      };

      try {
        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, session.parts.length) }, () => worker()),
        );

        const completed = await completeVideoUploadAction(courseId, lessonId, {
          videoId: session.videoId,
          uploadId: session.uploadId,
          parts: [...etags.entries()].map(([partNumber, etag]) => ({ partNumber, etag })),
        });
        if (!completed.ok) {
          setPhase('error');
          setMessage(completed.message);
          return;
        }

        setPhase('processing');
        setEncodeProgress(0);
      } catch (error) {
        if (controller.signal.aborted) return;
        setPhase('error');
        setMessage(error instanceof Error ? error.message : c.videoUploadFailed);
      } finally {
        abortRef.current = null;
      }
    },
    [courseId, lessonId, c.videoUploadTooBig, c.videoUploadWrongType, c.videoUploadFailed],
  );

  const cancel = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = null;

    const session = sessionRef.current;
    sessionRef.current = null;
    setPhase('idle');
    setProgress({ sent: 0, total: 0 });
    setFileName(null);
    if (inputRef.current) inputRef.current.value = '';

    // Tell the API too, so the parts are thrown away and whatever video this
    // was replacing comes back. Without this the lesson is left pointing at
    // an upload that will never finish.
    if (session !== null) {
      await abortVideoUploadAction(courseId, lessonId, {
        videoId: session.videoId,
        uploadId: session.uploadId,
      });
    }
  }, [courseId, lessonId]);

  const percent =
    progress.total === 0 ? 0 : Math.min(100, Math.round((progress.sent / progress.total) * 100));

  return (
    <div className="rounded-lg border border-line bg-surface-1 p-3">
      {phase === 'idle' || phase === 'done' || phase === 'error' ? (
        <>
          <label
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg',
              'border border-dashed border-line px-4 py-6 text-center',
              'transition-colors duration-[160ms] hover:border-accent hover:bg-surface-2',
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void upload(file);
              }}
            />
            <span className="text-[length:var(--fs-text-sm)] font-semibold text-fg">
              {c.videoUploadPick}
            </span>
            <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
              {c.videoUploadHint}
            </span>
          </label>

          {phase === 'done' ? (
            <p
              role="status"
              className="mt-2 text-[length:var(--fs-text-xs)] text-[var(--color-ok,#15803d)]"
            >
              {c.videoUploadDone}
            </p>
          ) : null}
          {phase === 'error' && message !== null ? (
            <p role="alert" className="mt-2 text-[length:var(--fs-text-xs)] text-danger">
              {message}
            </p>
          ) : null}
          {fileName !== null && phase !== 'error' ? (
            <p className="mt-2 truncate text-[length:var(--fs-text-xs)] text-fg-muted">
              {c.videoUploadSource}: {fileName}
            </p>
          ) : null}
        </>
      ) : null}

      {phase === 'uploading' || phase === 'processing' ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[length:var(--fs-text-sm)] text-fg">{fileName}</span>
            <span className="mono tabular text-[length:var(--fs-mono-label)] text-fg-muted">
              {phase === 'uploading' ? `${percent}%` : `${encodeProgress ?? 0}%`}
            </span>
          </div>

          {/* One bar for two phases, because to the instructor it is one wait. */}
          <div
            role="progressbar"
            aria-valuenow={phase === 'uploading' ? percent : (encodeProgress ?? 0)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 w-full overflow-hidden rounded-full bg-surface-3"
          >
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-300 ease-out',
                phase === 'uploading' ? 'bg-accent' : 'bg-[var(--color-info,#2563eb)]',
              )}
              style={{ width: `${phase === 'uploading' ? percent : (encodeProgress ?? 0)}%` }}
            />
          </div>

          <p role="status" className="text-[length:var(--fs-text-xs)] text-fg-muted">
            {phase === 'uploading' ? c.videoUploading : c.videoUploadProcessing}
          </p>

          {phase === 'uploading' ? (
            <>
              <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
                {c.videoUploadKeepOpen}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void cancel()}
                  className="rounded-md border border-line px-3 py-1 text-[length:var(--fs-text-xs)] text-fg-muted hover:bg-surface-2"
                >
                  {c.videoUploadCancel}
                </button>
                <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
                  {c.videoUploadCancelHint}
                </span>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
