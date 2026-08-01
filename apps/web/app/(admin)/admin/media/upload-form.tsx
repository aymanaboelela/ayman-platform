'use client';

import { useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { ALLOWED_UPLOAD_EXT } from '@ayman/contracts/admin/media';
import { copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { uploadMediaAction } from './actions';

const ACCEPT = ALLOWED_UPLOAD_EXT.map((ext) => `.${ext}`).join(',');

export function UploadForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function submit(file: File) {
    setPending(true);
    try {
      const formData = new FormData();
      formData.set('file', file);
      const result = await uploadMediaAction(formData);
      if (result.ok) {
        toast.success(copy.admin.media.uploadSuccess);
      } else {
        toast.error(copy.admin.media.uploadFailed);
      }
    } finally {
      setPending(false);
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
        {pending ? copy.admin.media.uploading : copy.admin.media.dropHint}
      </button>
    </div>
  );
}
