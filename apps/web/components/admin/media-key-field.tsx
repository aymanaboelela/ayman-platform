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
 * The API's refusal, in Arabic an instructor can act on.
 *
 * `media.service.ts` answers with a specific English reason and the action
 * passes it through verbatim; this is the only place that knows what those
 * strings mean. Matched on a SUBSTRING rather than on equality — the message is
 * a human sentence on the API's side, not a code, and a wording change there
 * should degrade to the generic line rather than to a blank.
 *
 * `status:413` is the shape the action returns when the body was not JSON at
 * all, which is what a reverse proxy's own size refusal looks like: it never
 * reaches Nest, so there is no message to forward.
 */
function uploadReason(raw: string): string {
  const m = copy.admin.media;
  const text = raw.toLowerCase();
  if (text.includes('too large') || text.includes('status:413')) return m.uploadTooLarge;
  if (text.includes('unsupported') || text.includes('type')) return m.uploadBadType;
  if (text.includes('could not be processed')) return m.uploadUnreadable;
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
  const [reason, setReason] = useState<string | null>(null);
  const describedBy = useId();

  async function upload(file: File) {
    setPending(true);
    setReason(null);
    try {
      const formData = new FormData();
      formData.set('file', file);
      const result = await uploadMediaAction(formData);
      if (result.ok) {
        setStorageKey(result.storageKey);
        toast.success(copy.admin.media.uploadSuccess);
      } else {
        // Both, and they are not redundant: the toast is the notification, the
        // inline line is the one still on screen after it fades — and an
        // instructor who has just watched a spinner end in nothing needs to be
        // able to READ why, not catch it.
        const message = uploadReason(result.message);
        setReason(message);
        toast.error(message);
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

      {reason ? (
        <p role="alert" className="mb-2 text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
          {reason}
        </p>
      ) : null}

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

      {/* The limits, BEFORE anything is picked. An instructor whose phone
          shoots 12 MB HEIC needs to know that here, not after a spinner. */}
      <p id={describedBy} className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
        {hint ? `${hint} · ` : ''}
        {copy.admin.media.uploadHint}
      </p>
    </div>
  );
}
