'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@ayman/ui/components/dialog';
import { UploadedVideoPreview } from '@/components/admin/course/uploaded-video-preview';

const c = copy.admin.videos;

/**
 * «شغّل» — watch a video from the library screen, in a dialog, with the same
 * preview the lesson editor uses (it signs its own playlist by video id, so it
 * plays a video in «محفوظة» as well as one on a lecture). Mounted only while
 * open: nothing loads until it is asked for.
 */
export function PlayVideoButton({ videoId, title }: { videoId: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-1.5 rounded-md border border-[color-mix(in_oklab,var(--ok)_40%,var(--border))] bg-[color-mix(in_oklab,var(--ok)_10%,var(--n-2))] px-3 text-[length:var(--fs-text-sm)] font-medium text-fg transition-colors duration-[160ms] ease-out hover:bg-[color-mix(in_oklab,var(--ok)_18%,var(--n-2))] md:h-9"
        >
          <Play className="size-4 text-[color:var(--ok)]" aria-hidden="true" />
          {c.play}
        </button>
      </DialogTrigger>
      <DialogContent closeLabel={copy.common.close} className="max-w-[56rem]">
        <DialogHeader>
          <DialogTitle>{title || c.playTitle}</DialogTitle>
        </DialogHeader>
        {open ? <UploadedVideoPreview externalId={videoId} /> : null}
      </DialogContent>
    </Dialog>
  );
}
