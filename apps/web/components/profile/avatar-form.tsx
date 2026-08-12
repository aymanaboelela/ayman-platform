'use client';

import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy';
import { ALLOWED_UPLOAD_EXT } from '@ayman/contracts/admin/media';
import { cn } from '@ayman/ui/lib/cn';
import { refreshAvatarAction } from '@/app/(app)/profile/actions';
import { uploadAvatar, type UploadFailure } from '@/lib/upload-client';
import { UserAvatar } from '@/components/app/user-avatar';

/**
 * The refusal, in words a student can act on.
 *
 * `tooLarge` is raised in the browser from `MAX_AVATAR_BYTES`, before the
 * photo is sent — a student on a phone should not upload 5 MB in order to be
 * told it was too much.
 */
function photoReason(reason: UploadFailure): string {
  if (reason === 'tooLarge') return copy.profile.photoTooLarge;
  if (reason === 'badType' || reason === 'unreadable') return copy.profile.photoWrongType;
  return copy.profile.photoFailed;
}

/** Built from the same allowlist the server enforces, so the file picker and
 *  the API cannot disagree about what is acceptable. */
const ACCEPT = ALLOWED_UPLOAD_EXT.map((ext) => `.${ext}`).join(',');

/**
 * The student's profile photo, and the control that changes it.
 *
 * ## Optimistic preview, deliberately local
 *
 * On success the new photo is shown immediately from a local object URL rather
 * than waiting for the revalidated server render. The upload has already
 * succeeded at that point — the round-trip that remains is only React
 * refreshing the tree, and a photo that stays stale for a second after
 * "اتغيّرت صورتك" reads as a failure.
 *
 * The object URL is revoked when it is replaced, so a student who uploads five
 * photos in a row does not leak five blobs.
 *
 * ## Why the input is hidden behind the avatar
 *
 * A bare `<input type="file">` renders as an OS button whose label cannot be
 * translated or styled, and it would sit next to the photo saying something in
 * English. The input keeps its role and its keyboard behaviour — it is not
 * `display: none`, it is visually hidden and still focusable — and the visible
 * button forwards the click to it.
 */
export function AvatarForm({ name, image }: { name: string; image: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onPick(file: File) {
    setPending(true);
    try {
      const result = await uploadAvatar(file);

      if (!result.ok) {
        toast.error(photoReason(result.reason));
        return;
      }

      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = URL.createObjectURL(file);
      setPreview(previewRef.current);
      toast.success(copy.profile.photoDone);
      // The photo is already stored; this only re-reads the trees that render
      // it, so the topbar catches up with the local preview above.
      void refreshAvatarAction();
    } finally {
      setPending(false);
      // Cleared unconditionally: without this, picking the SAME file again
      // after a failure fires no `change` event, and the retry silently does
      // nothing.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex items-center gap-4">
      <span className={cn('relative', pending && 'opacity-60')}>
        {/* `preview` is a blob: URL, which `next/image` cannot optimise —
            `<UserAvatar>` is for the persisted value; this branch renders the
            local one directly. */}
        {preview ? (
          /* A bare <img>, not next/image: the optimiser cannot fetch a blob:
             URL, and this element lives for the few seconds between a
             successful upload and the revalidated server render. */
          <img
            src={preview}
            alt=""
            width={72}
            height={72}
            className="size-[72px] shrink-0 rounded-full border border-line object-cover"
          />
        ) : (
          <UserAvatar name={name} image={image} size={72} />
        )}
      </span>

      <div className="min-w-0">
        <p className="text-[length:var(--fs-text-sm)] font-medium text-fg">
          {copy.profile.photoTitle}
        </p>
        <p className="mt-0.5 text-[length:var(--fs-text-sm)] text-fg-muted">
          {copy.profile.photoHint}
        </p>

        {/*
          Removed from the accessibility tree entirely, and unreachable by tab.

          It first carried `aria-label={photoChange}` — the same name as the
          button below it — which put TWO controls called "غيّر صورتك" in the
          tree, one of them invisible. A screen-reader user would hear the
          control twice and have no way to tell which one does anything.

          The button IS the control: it is focusable, correctly named, and
          forwards its click here. This element is the mechanism.
        */}
        <input
          ref={inputRef}
          // Named even though nothing submits it — the file goes out through
          // `onPick`. Chrome's DevTools flags every field with neither `id` nor
          // `name` ("a form field element should have an id or name
          // attribute"), and a hidden-but-real input is still a field to it.
          // A name it will never read is cheaper than the noise.
          name="avatar"
          type="file"
          accept={ACCEPT}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onPick(file);
          }}
        />

        <button
          type="button"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'mt-3 inline-flex h-9 items-center gap-2 rounded-sm border border-line px-3',
            'text-[length:var(--fs-text-sm)] text-fg',
            'transition-colors duration-[160ms] ease-out hover:bg-surface-3',
            'disabled:pointer-events-none disabled:opacity-60',
          )}
        >
          <Camera className="size-4" aria-hidden="true" />
          {pending ? copy.profile.photoUploading : copy.profile.photoChange}
        </button>
      </div>
    </div>
  );
}
