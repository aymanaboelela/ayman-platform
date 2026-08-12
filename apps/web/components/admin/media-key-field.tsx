'use client';

import { useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ALLOWED_UPLOAD_EXT } from '@ayman/contracts/admin/media';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@ayman/ui/components/dialog';
import { Label } from '@ayman/ui/components/label';
import { cn } from '@ayman/ui/lib/cn';
import { mediaUrl } from '@ayman/ui/branding';
import { uploadImage, type UploadFailure } from '@/lib/upload-client';
import { CoverCropper } from './cover-cropper';

const ACCEPT = ALLOWED_UPLOAD_EXT.map((ext) => `.${ext}`).join(',');

/**
 * Both surfaces this field serves — a course cover and a lesson poster — are
 * rendered at 16/9 by `.media-key__preview` and by every reader downstream, so
 * that is the frame the crop offers. One constant rather than a prop, because
 * a caller free to pass 4/3 would be free to store an image no surface can
 * show without cropping it again at render time.
 */
const COVER_ASPECT = 16 / 9;

/** The closed set of upload failures, in Arabic an instructor can act on. */
function uploadReason(reason: UploadFailure): string {
  const m = copy.admin.media;
  if (reason === 'tooLarge') return m.uploadTooLarge;
  if (reason === 'badType') return m.uploadBadType;
  if (reason === 'unreadable') return m.uploadUnreadable;
  if (reason === 'network') return m.uploadNetwork;
  return m.uploadFailed;
}

/**
 * Pick an image and carry its storage KEY into the surrounding `<form>`.
 *
 * ## Why this exists at all
 *
 * `courses.cover_key` and `lesson_videos.poster_key` have been columns since
 * their first migration, the API has always accepted both, and every reader —
 * the course card, the library grid, the dashboard, the player's `posterUrl` —
 * has always rendered them. The only thing missing was a way to SET one.
 *
 * ## The upload goes STRAIGHT to the API now
 *
 * It used to go through `uploadMediaAction`, a Server Action, and Server
 * Actions cap their payload at 1 MB by default. So this field silently
 * refused every image a phone produces while the hint underneath promised
 * 8 MB — measured at 515 KB (saved) against 1,056 KB (nothing happened, no
 * error anywhere). `lib/upload-client.ts` carries the full measurement and why
 * raising the limit was the wrong repair.
 *
 * ## The value lives in a hidden input
 *
 * Not in component state alone: everything else in these forms is uncontrolled
 * and read from `FormData` on submit, and a hidden input keeps this one on that
 * path. Clearing it submits an empty string, which `readOptionalText` turns
 * back into `null` — so «شيل الصورة» genuinely removes the cover rather than
 * leaving the old key in place.
 */
export function MediaKeyField({
  name,
  id,
  label,
  hint,
  defaultValue,
}: {
  /** The FormData key — `coverKey` on a course, `posterKey` on a lesson. */
  name: string;
  id: string;
  label: string;
  hint?: string;
  defaultValue: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [storageKey, setStorageKey] = useState(defaultValue ?? '');
  const [progress, setProgress] = useState<number | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  /*
   * Counted, not a boolean. `dragenter`/`dragleave` fire for every child the
   * pointer crosses, so a boolean flickers off the moment the cursor moves
   * from the drop zone onto the preview inside it — the highlight strobes
   * while the file is held perfectly still over the target.
   */
  const [dragDepth, setDragDepth] = useState(0);
  /*
   * The picked file, held back from the upload while the crop dialog is open.
   *
   * The field used to upload the instant a file was chosen. It still can —
   * «من غير قص» inside the dialog does exactly that — but the default is now
   * to ask, because «أقدر أضبط المسافات بتاعتها، أقصها» is a step that has to
   * happen BEFORE the bytes leave: the crop is applied to the file, not stored
   * beside it, so there is nothing to adjust afterwards.
   */
  const [picked, setPicked] = useState<File | null>(null);
  const describedBy = useId();

  const pending = progress !== null;

  /**
   * Drops the staged file and resets the input.
   *
   * Both halves matter. Without clearing `<input type="file">`, choosing the
   * SAME file again fires no `change` event — so cancelling a crop and then
   * picking that picture a second time does nothing at all, and the field
   * looks broken.
   */
  function clearPick() {
    setPicked(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function upload(file: File) {
    setProgress(0);
    setReason(null);
    try {
      const result = await uploadImage(file, setProgress);
      if (result.ok) {
        setStorageKey(result.value.storageKey);
        toast.success(copy.admin.media.uploadSuccess);
      } else {
        // Both, and they are not redundant: the toast is the notification, the
        // inline line is the one still on screen after it fades — and an
        // instructor who has just watched a spinner end in nothing needs to be
        // able to READ why, not catch it.
        const message = uploadReason(result.reason);
        setReason(message);
        toast.error(message);
      }
    } finally {
      setProgress(null);
      // Without this, picking the SAME file twice after a failure fires no
      // change event and the button looks dead.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <input type="hidden" name={name} value={storageKey} />
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-describedby={hint ? describedBy : undefined}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Staged, not uploaded — the crop dialog decides what actually goes.
          if (file) setPicked(file);
        }}
      />

      {reason ? (
        <p role="alert" className="mb-2 text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
          {reason}
        </p>
      ) : null}

      {/*
        The whole block is the drop target, not a separate strip beside it.
        Asked for as «أقدر أعمل drag and drop عادي للصورة»; a zone that is only
        the empty state would stop working the moment a cover exists, which is
        exactly when replacing one matters.

        `onDragOver` must `preventDefault` or the browser navigates to the
        dropped file and the page is simply gone.
      */}
      <div
        className={cn('media-key', dragDepth > 0 && 'media-key--dropping')}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragDepth((depth) => depth + 1);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragDepth((depth) => Math.max(0, depth - 1))}
        onDrop={(event) => {
          event.preventDefault();
          setDragDepth(0);
          const file = event.dataTransfer.files?.[0];
          // Dropping a folder, or a link dragged off another page, yields no
          // file — silently doing nothing is right, the pointer never
          // suggested it would work.
          if (file) setPicked(file);
        }}
      >
        <div className="media-key__preview">
          {storageKey ? (
            // A raw <img>: media-origin uploads are not in next.config's
            // `remotePatterns`, so the optimiser would reject them — the same
            // reason `<CourseCard>` uses one.
            <img src={mediaUrl(storageKey)} alt="" />
          ) : (
            <span className="media-key__empty">{copy.admin.media.dropHint}</span>
          )}

          {pending ? (
            <span className="media-key__progress" aria-hidden="true">
              <span className="media-key__bar" style={{ inlineSize: `${Math.round(progress * 100)}%` }} />
            </span>
          ) : null}
        </div>

        <div className="media-key__actions">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
          >
            {pending
              ? copy.admin.media.uploading
              : storageKey
                ? copy.admin.media.replaceImage
                : copy.admin.media.chooseImage}
          </Button>
          {storageKey ? (
            <>
              {/*
                «أقدر أبص عليها» — the panel preview is a thumbnail by
                necessity, and judging a cover means seeing it at the size a
                student will. A plain link to the media origin: no lightbox to
                trap focus, and the browser's own zoom is better than anything
                built here.
              */}
              <a
                href={mediaUrl(storageKey)}
                target="_blank"
                rel="noreferrer"
                className="text-[length:var(--fs-text-sm)] text-accent-text underline"
              >
                {copy.admin.media.viewImage}
              </a>
              <Button type="button" variant="ghost" size="sm" onClick={() => setStorageKey('')}>
                {copy.admin.media.removeImage}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {/* The limits, BEFORE anything is picked. An instructor whose phone
          shoots 12 MB HEIC needs to know that here, not after a spinner. */}
      <p id={describedBy} className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
        {hint ? `${hint} · ` : ''}
        {copy.admin.media.uploadHint}
      </p>

      {/*
        The crop step. Mounted only while a file is staged, so the cropper's
        `createImageBitmap` and its object URL never exist on a page where
        nobody has picked anything.

        `onOpenChange` covers Escape and the overlay click as well as the
        dialog's own close button — all three mean "I did not want this file",
        and all three must clear the staged file AND the input, or picking the
        same file again fires no change event and the field looks dead.
      */}
      <Dialog open={picked !== null} onOpenChange={(open) => (open ? null : clearPick())}>
        <DialogContent closeLabel={copy.admin.media.cropCancel} className="max-w-[34rem]">
          <DialogHeader>
            <DialogTitle>{copy.admin.media.cropTitle}</DialogTitle>
          </DialogHeader>
          {picked ? (
            <CoverCropper
              file={picked}
              aspect={COVER_ASPECT}
              onCancel={clearPick}
              onCropped={(cropped) => {
                clearPick();
                void upload(cropped);
              }}
              onUseOriginal={() => {
                const original = picked;
                clearPick();
                void upload(original);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
