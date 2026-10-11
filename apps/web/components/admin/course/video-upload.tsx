'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { UploadCloud } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { MAX_UPLOAD_VIDEO_BYTES, UPLOAD_VIDEO_MIME, type VideoMirrorStatus } from '@ayman/contracts/video';
import { cn } from '@ayman/ui/lib/cn';
import { videoUploadStatusAction } from '@/app/(admin)/admin/courses/actions';
import { formatBytes, formatEta, formatSpeed } from '@/lib/upload-format';
import {
  cancelUpload,
  dismissUpload,
  forgetSaved,
  isSameFile,
  resumeUpload,
  savedUpload,
  startUpload,
  useUpload,
  type SavedUpload,
} from '@/lib/video-upload-manager';
import { ReuseVideoPicker } from './reuse-video-picker';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * «ارفع الفيديو» — one lesson's view of the upload.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The transfer itself lives in `lib/video-upload-manager.ts`, so leaving this
 * panel does not stop it — the corner card keeps counting, and coming back
 * here picks the same bar straight up. What this panel adds is the lesson's
 * own story: the file already on it, the encoder's progress once the bytes
 * are up, and «كمّل الرفع» when a previous tab lost the upload halfway.
 *
 * ⚠️ Nothing here goes through a Server Action except small JSON messages.
 * The file is PUT straight to the bucket with pre-signed URLs — a Server
 * Action body is capped at 1 MB silently.
 */

/** How often the encoder is asked whether it is done. */
const POLL_MS = 4000;

const noopSubscribe = () => () => undefined;

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
  const entry = useUpload(lessonId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [encodeProgress, setEncodeProgress] = useState<number | null>(null);
  const [encodeDone, setEncodeDone] = useState(false);
  /*
   * `localStorage` only once hydrated: it does not exist on the server, and a
   * panel that rendered «كمّل» on the client only would be a hydration
   * mismatch. Read on either of the two occasions a session can be waiting:
   * the row says an upload was left open (another tab, yesterday), or one
   * failed in THIS tab — whose parts are just as resumable.
   */
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [startedOver, setStartedOver] = useState(false);
  /** A file is being dragged over the box — it lights up to say «سيبه هنا». */
  const [dragging, setDragging] = useState(false);
  /** «احتفظ بيه / امسحه خالص» for the video a new upload replaces. Keep by default. */
  const [keepOld, setKeepOld] = useState(true);
  /** AES-128-encrypt the mirrored copy — «مينفعش حد ينزّل الفيديو». On by
   *  default, matching every lecture uploaded before this toggle existed. */
  const [encrypt, setEncrypt] = useState(true);
  const saved: SavedUpload | null =
    hydrated && !startedOver && (current?.status === 'uploading' || entry?.phase === 'error')
      ? savedUpload(lessonId)
      : null;

  const processing =
    entry?.phase === 'processing' ||
    (entry === null && !encodeDone && (current?.status === 'pending' || current?.status === 'mirroring'));

  /** Poll the encoder until it is finished, one way or the other. */
  useEffect(() => {
    if (!processing) return undefined;
    let live = true;
    const tick = async () => {
      const status = await videoUploadStatusAction(lessonId);
      if (!live || status === null) return;
      setEncodeProgress(status.progress);
      if (status.status === 'ready') {
        setEncodeDone(true);
        setMessage(null);
        dismissUpload(lessonId);
        onDone?.();
      } else if (status.status === 'failed') {
        setEncodeDone(true);
        setMessage(status.error ?? c.videoUploadFailed);
        dismissUpload(lessonId);
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [processing, lessonId, onDone, c.videoUploadFailed]);

  /** The browser's own guess at the type. `ffprobe` is what actually decides. */
  function check(file: File): string | null {
    if (file.size > MAX_UPLOAD_VIDEO_BYTES) return c.videoUploadTooBig;
    if (!file.type.startsWith('video/')) return c.videoUploadWrongType;
    return null;
  }

  function pick(file: File) {
    const refusal = check(file);
    if (refusal !== null) {
      setMessage(refusal);
      return;
    }
    setMessage(null);
    setEncodeDone(false);

    if (saved !== null) {
      if (!isSameFile(file, saved)) {
        setMessage(c.videoUploadNotSameFile);
        return;
      }
      void resumeUpload(lessonId, file, saved);
      return;
    }

    const contentType = (UPLOAD_VIDEO_MIME as readonly string[]).includes(file.type) ? file.type : 'video/mp4';
    // A fresh upload's own failure must be resumable again.
    setStartedOver(false);
    void startUpload(courseId, lessonId, file, contentType, keepOld, encrypt);
  }

  const uploading = entry?.phase === 'uploading';
  const percent = entry === null || entry.total === 0 ? 0 : Math.min(100, Math.round((entry.sent / entry.total) * 100));
  const shownPercent = uploading ? percent : (encodeProgress ?? 0);
  const failed = entry?.phase === 'error' ? (entry.message ?? c.videoUploadFailed) : message;

  if (uploading || processing) {
    return (
      <div className="rounded-lg border border-line bg-surface-1 p-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[length:var(--fs-text-sm)] text-fg">
              {entry?.fileName ?? current?.sourceName}
            </span>
            <span className="mono tabular text-[length:var(--fs-mono-label)] text-fg-muted">{shownPercent}%</span>
          </div>

          {/* One bar for two phases, because to the instructor it is one wait. */}
          <div
            role="progressbar"
            aria-valuenow={shownPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 w-full overflow-hidden rounded-full bg-surface-3"
          >
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-300 ease-out',
                uploading ? 'bg-accent' : 'bg-[var(--color-info,#2563eb)]',
              )}
              style={{ width: `${shownPercent}%` }}
            />
          </div>

          {uploading && entry !== null ? (
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-muted">
              <span dir="ltr" className="mono tabular">
                {formatCopy(c.videoUploadOf, { sent: formatBytes(entry.sent), total: formatBytes(entry.total) })}
              </span>
              {entry.bytesPerSecond !== null ? (
                <span dir="ltr" className="mono tabular">
                  {formatSpeed(entry.bytesPerSecond)}
                </span>
              ) : null}
              {entry.secondsLeft !== null && entry.secondsLeft > 0 ? <span>{formatEta(entry.secondsLeft)}</span> : null}
            </p>
          ) : null}

          <p role="status" className="text-[length:var(--fs-text-xs)] text-fg-muted">
            {uploading ? c.videoUploading : c.videoUploadProcessing}
          </p>

          {uploading ? (
            <>
              <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.videoUploadKeepOpen}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void cancelUpload(courseId, lessonId)}
                  className="rounded-md border border-line px-3 py-1 text-[length:var(--fs-text-xs)] text-fg-muted hover:bg-surface-2"
                >
                  {c.videoUploadCancel}
                </button>
                <span className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.videoUploadCancelHint}</span>
              </div>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  const resumable = saved !== null;
  const resumeAt =
    entry !== null && entry.total > 0 ? Math.round((entry.sent / entry.total) * 100) : null;

  return (
    <div className="rounded-lg border border-line bg-surface-1 p-3">
      {resumable ? (
        <div className="mb-3 rounded-md border border-[color-mix(in_oklab,var(--warn)_40%,var(--border))] bg-[color-mix(in_oklab,var(--warn)_8%,var(--n-2))] p-3">
          <p className="text-[length:var(--fs-text-sm)] font-semibold text-fg">
            {resumeAt !== null ? formatCopy(c.videoUploadResumeTitle, { percent: resumeAt }) : c.videoUploadInterrupted}
          </p>
          <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{c.videoUploadResumeHint}</p>
          <p dir="ltr" className="mono mt-1 truncate text-start text-[length:var(--fs-text-xs)] text-fg-subtle">
            {saved.fileName} · {formatBytes(saved.size)}
          </p>
          <button
            type="button"
            onClick={() => {
              forgetSaved(lessonId);
              setStartedOver(true);
              setMessage(null);
            }}
            className="mt-2 text-[length:var(--fs-text-xs)] text-fg-muted underline underline-offset-2 hover:text-fg"
          >
            {c.videoUploadStartOver}
          </button>
        </div>
      ) : null}

      {/*
        Replacing a finished lecture: ask what happens to the one on it now,
        BEFORE the file is picked — once the new one lands, the old one is
        either kept in «الفيديوهات» or gone.
      */}
      {!resumable && current?.status === 'ready' ? (
        <fieldset className="mb-3 rounded-md border border-line bg-surface-2 p-3">
          <legend className="px-1 text-[length:var(--fs-text-xs)] font-semibold text-fg">{c.videoReplaceKeepTitle}</legend>
          <label className="flex items-center gap-2 py-1 text-[length:var(--fs-text-sm)] text-fg">
            <input type="radio" name={`keep-${lessonId}`} checked={keepOld} onChange={() => setKeepOld(true)} />
            {c.videoKeepOld}
          </label>
          <label className="flex items-center gap-2 py-1 text-[length:var(--fs-text-sm)] text-err">
            <input type="radio" name={`keep-${lessonId}`} checked={!keepOld} onChange={() => setKeepOld(false)} />
            {c.videoDeleteOld}
          </label>
        </fieldset>
      ) : null}

      {/*
        Fixed for the mirror's whole life once this upload starts — not shown
        while resuming an upload already in flight, since that choice was
        already made and sent when the session opened.
      */}
      {!resumable ? (
        <fieldset className="mb-3 rounded-md border border-line bg-surface-2 p-3">
          <legend className="px-1 text-[length:var(--fs-text-xs)] font-semibold text-fg">{c.videoEncryptTitle}</legend>
          <label className="flex items-center gap-2 py-1 text-[length:var(--fs-text-sm)] text-fg">
            <input type="radio" name={`encrypt-${lessonId}`} checked={encrypt} onChange={() => setEncrypt(true)} />
            {c.videoEncryptOn}
          </label>
          <label className="flex items-center gap-2 py-1 text-[length:var(--fs-text-sm)] text-fg-muted">
            <input type="radio" name={`encrypt-${lessonId}`} checked={!encrypt} onChange={() => setEncrypt(false)} />
            {c.videoEncryptOff}
          </label>
        </fieldset>
      ) : null}

      {/*
        Drop target as well as a picker: the file is usually already on the
        screen (Finder, the editing app) and dragging it here is one motion
        instead of a file dialog and a folder hunt. The same `pick()` runs
        either way, so a dropped file gets every check a chosen one does —
        size, type, «نفس الملف» for a resume.

        ⚠️ `preventDefault` on dragover is what makes this a drop target at
        all; without it the browser opens the video in the tab and the admin
        loses the page.
      */}
      <label
        data-dragging={dragging || undefined}
        onDragEnter={(event) => {
          if (!event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={(event) => {
          // Leaving for a child (the text spans) is not leaving the box.
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) pick(file);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg',
          'border border-dashed border-line px-4 py-6 text-center',
          'transition-colors duration-[160ms] hover:border-accent hover:bg-surface-2',
          'data-[dragging]:border-2 data-[dragging]:border-accent data-[dragging]:bg-accent/10',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) pick(file);
          }}
        />
        <UploadCloud
          className={cn('size-7 transition-transform duration-[160ms]', dragging ? 'scale-110 text-accent' : 'text-fg-muted')}
          aria-hidden="true"
        />
        <span className="text-[length:var(--fs-text-sm)] font-semibold text-fg">
          {dragging ? c.videoUploadDrop : resumable ? c.videoUploadResumePick : c.videoUploadPick}
        </span>
        <span className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.videoUploadHint}</span>
      </label>

      {/* A resume is about THAT file; offering another video then would read
          as «the upload is lost, pick something else». */}
      {resumable ? null : (
        <ReuseVideoPicker courseId={courseId} lessonId={lessonId} hasVideo={current !== null} onDone={onDone} />
      )}

      {encodeDone && failed === null ? (
        <p role="status" className="mt-2 text-[length:var(--fs-text-xs)] text-[var(--color-ok,#15803d)]">
          {c.videoUploadDone}
        </p>
      ) : null}
      {failed !== null ? (
        <p role="alert" className="mt-2 text-[length:var(--fs-text-xs)] text-danger">
          {failed}
        </p>
      ) : null}
      {current?.sourceName && !resumable && failed === null ? (
        <p className="mt-2 truncate text-[length:var(--fs-text-xs)] text-fg-muted">
          {c.videoUploadSource}: {current.sourceName}
        </p>
      ) : null}
    </div>
  );
}
