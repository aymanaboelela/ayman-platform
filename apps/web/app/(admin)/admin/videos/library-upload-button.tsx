'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import { MAX_UPLOAD_VIDEO_BYTES, UPLOAD_VIDEO_MIME } from '@ayman/contracts/video';
import { copy } from '@ayman/contracts/copy/admin';
import { startUpload } from '@/lib/video-upload-manager';
import { createUploadSlotAction } from './actions';

const c = copy.admin.videos;

/**
 * «ارفع فيديو» — upload first, put it on a lecture later.
 *
 * Asks the API for a holding lesson (`VIDEO_LIBRARY_COURSE_SLUG`), then hands
 * the file to the same upload manager a lesson's own «ارفع فيديو» uses — so the
 * dock in the corner shows the progress, it survives moving between screens,
 * and it encrypts like every lecture. When the encode is done the video moves
 * to «محفوظة» on its own, where «رجّعه لمحاضرة» puts it on any lesson.
 */
export function LibraryUploadButton() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_UPLOAD_VIDEO_BYTES) return void toast.error(c.uploadTooBig);
    if (!file.type.startsWith('video/')) return void toast.error(c.uploadWrongType);

    setPending(true);
    const slot = await createUploadSlotAction(file.name.replace(/\.[^.]+$/, '') || file.name);
    setPending(false);
    if (!slot.ok) return void toast.error(slot.message);

    const contentType = (UPLOAD_VIDEO_MIME as readonly string[]).includes(file.type) ? file.type : 'video/mp4';
    void startUpload(slot.courseId, slot.lessonId, file, contentType, true, true);
    toast.success(c.uploadStarted);
    router.refresh();
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="video/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          void pick(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => input.current?.click()}
        className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-[length:var(--fs-text-sm)] font-semibold text-[#1A1206] transition-colors duration-[160ms] ease-out hover:bg-accent-hover disabled:opacity-60"
      >
        <Upload className="size-4" aria-hidden="true" />
        {c.upload}
      </button>
    </>
  );
}
