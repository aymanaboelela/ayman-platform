'use client';

import { useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ALLOWED_UPLOAD_EXT } from '@ayman/contracts/admin/media';
import { copy } from '@ayman/contracts';
import { Button, Label } from '@ayman/ui';
import { mediaUrl } from '@ayman/ui/branding';
import { uploadMediaAction } from '@/app/(admin)/admin/media/actions';

const ACCEPT = ALLOWED_UPLOAD_EXT.map((ext) => `.${ext}`).join(',');

/**
 * Pick an image and carry its storage KEY into the surrounding `<form>`.
 *
 * ## Why this exists at all
 *
 * `courses.cover_key` and `lesson_videos.poster_key` have been columns since
 * their first migration, the API has always accepted both, and every reader —
 * the course card, the library grid, the dashboard, the player's `posterUrl` —
 * has always rendered them. The only thing missing was a way to SET one: both
 * admin actions passed a literal `null`. So the platform could display a cover
 * it gave you no way to choose.
 *
 * ## Upload here, not "go and find the key"
 *
 * The alternative was a text input for the storage key plus a link to the
 * media library. That is a fine tool for someone who knows what a storage key
 * is, and this admin is used by the teacher whose name is on the site. Here the
 * file goes straight through `uploadMediaAction`, which now returns the key it
 * had been parsing and discarding.
 *
 * ## The value lives in a hidden input
 *
 * Not in component state alone: everything else in these forms is uncontrolled
 * and read from `FormData` on submit, and a hidden input keeps this one on that
 * path. Clearing it submits an empty string, which `readOptionalText` turns
 * back into `null` — so "شيل الصورة" genuinely removes the cover rather than
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
  const [pending, setPending] = useState(false);
  const describedBy = useId();

  async function upload(file: File) {
    setPending(true);
    try {
      const formData = new FormData();
      formData.set('file', file);
      const result = await uploadMediaAction(formData);
      if (result.ok) {
        setStorageKey(result.storageKey);
        toast.success(copy.admin.media.uploadSuccess);
      } else {
        toast.error(copy.admin.media.uploadFailed);
      }
    } finally {
      setPending(false);
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
          if (file) void upload(file);
        }}
      />

      <div className="media-key">
        <div className="media-key__preview">
          {storageKey ? (
            // A raw <img>: media-origin uploads are not in next.config's
            // `remotePatterns`, so the optimiser would reject them — the same
            // reason `<CourseCard>` uses one.
            <img src={mediaUrl(storageKey)} alt="" />
          ) : (
            <span className="media-key__empty">{copy.admin.media.noImage}</span>
          )}
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
            <Button type="button" variant="ghost" size="sm" onClick={() => setStorageKey('')}>
              {copy.admin.media.removeImage}
            </Button>
          ) : null}
        </div>
      </div>

      {hint ? (
        <p id={describedBy} className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
