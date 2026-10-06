'use client';

import Link from 'next/link';
import { CheckCircle2, CloudUpload, X } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { cn } from '@ayman/ui/lib/cn';
import { formatBytes, formatEta, formatSpeed } from '@/lib/upload-format';
import { dismissUpload, useUploads } from '@/lib/video-upload-manager';

const c = copy.admin.lesson;

/**
 * The corner card that follows an upload around the whole dashboard — YouTube
 * Studio's «جاري التحميل» box.
 *
 * Mounted once in the admin layout, so moving from the course editor to the
 * students list or the payments screen keeps the bar in view; the transfer
 * itself never depended on the panel (see `video-upload-manager.ts`), and now
 * the instructor can see that too. Renders nothing when nothing is uploading.
 */
export function UploadDock() {
  const uploads = useUploads();
  if (uploads.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 start-4 z-40 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {uploads.map((upload) => {
        const percent = upload.total === 0 ? 0 : Math.min(100, Math.round((upload.sent / upload.total) * 100));
        const uploading = upload.phase === 'uploading';
        return (
          <div key={upload.key} className="rounded-xl border border-line bg-surface-2 p-3 shadow-lg">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-lg',
                  uploading ? 'bg-accent/12 text-accent-text' : 'bg-[color-mix(in_oklab,var(--ok)_14%,var(--n-2))] text-ok',
                )}
              >
                {uploading ? <CloudUpload className="size-4" /> : <CheckCircle2 className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[length:var(--fs-text-xs)] font-semibold text-fg">
                  {uploading ? c.videoUploadDockTitle : upload.phase === 'error' ? c.videoUploadFailed : c.videoUploadDockProcessing}
                </p>
                <p dir="ltr" className="mono truncate text-start text-[length:var(--fs-text-xs)] text-fg-muted">
                  {upload.fileName}
                </p>
              </div>
              {uploading ? (
                <span className="mono tabular text-[length:var(--fs-text-sm)] font-semibold text-fg">{percent}%</span>
              ) : (
                <button
                  type="button"
                  onClick={() => dismissUpload(upload.key)}
                  aria-label={copy.common.close}
                  className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-surface-3 hover:text-fg"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-300 ease-out',
                  upload.phase === 'error' ? 'bg-err' : uploading ? 'bg-accent' : 'bg-ok',
                )}
                style={{ width: `${uploading ? percent : 100}%` }}
              />
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
              {uploading ? (
                <>
                  <span dir="ltr" className="mono tabular">
                    {formatBytes(upload.sent)} / {formatBytes(upload.total)}
                  </span>
                  {upload.bytesPerSecond !== null ? (
                    <span dir="ltr" className="mono tabular">
                      {formatSpeed(upload.bytesPerSecond)}
                    </span>
                  ) : null}
                  {upload.secondsLeft !== null && upload.secondsLeft > 0 ? <span>{formatEta(upload.secondsLeft)}</span> : null}
                </>
              ) : null}
              <Link
                href={`/admin/courses/${upload.courseId}`}
                className="ms-auto font-medium text-accent-text hover:underline"
              >
                {c.videoUploadDockOpen}
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
