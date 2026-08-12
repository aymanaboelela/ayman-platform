'use client';

import { useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { ALLOWED_UPLOAD_EXT } from '@ayman/contracts/admin/media';
import { copy } from '@ayman/contracts/copy/admin';
import { cn } from '@ayman/ui/lib/cn';
import { uploadImage, type UploadFailure } from '@/lib/upload-client';
import { refreshMediaAction } from './actions';

const ACCEPT = ALLOWED_UPLOAD_EXT.map((ext) => `.${ext}`).join(',');

/** The closed set of upload failures, in Arabic an instructor can act on. */
function uploadReason(reason: UploadFailure): string {
  const m = copy.admin.media;
  if (reason === 'tooLarge') return m.uploadTooLarge;
  if (reason === 'badType') return m.uploadBadType;
  if (reason === 'unreadable') return m.uploadUnreadable;
  if (reason === 'network') return m.uploadNetwork;
  return m.uploadFailed;
}

export function UploadForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const pending = progress !== null;

  async function submit(file: File) {
    setProgress(0);
    try {
      // Straight to the API, not through a Server Action — see
      // `refreshMediaAction` for the 1 MB ceiling that silently ate every
      // upload bigger than a thumbnail.
      const result = await uploadImage(file, setProgress);
      if (result.ok) {
        toast.success(copy.admin.media.uploadSuccess);
        void refreshMediaAction();
      } else {
        // The specific reason, not «فشل الرفع» for all of them: a 12 MB photo
        // and a broken file need different things done to them.
        toast.error(uploadReason(result.reason));
      }
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void submit(file);
  }

  return (
    <div className="mb-6">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        id="media-upload-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void submit(file);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        disabled={pending}
        className={cn(
          'flex w-full items-center justify-center rounded-[var(--r-lg)] border border-dashed border-line p-6',
          'text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-150',
          dragOver ? 'border-accent bg-surface-2' : 'hover:border-line-strong',
        )}
      >
        {pending
          ? `${copy.admin.media.uploading} ${Math.round(progress * 100)}%`
          : copy.admin.media.dropHint}
      </button>
    </div>
  );
}
