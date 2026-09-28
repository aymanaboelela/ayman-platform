'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Undo2 } from 'lucide-react';
import type { VideoLibraryTarget } from '@ayman/contracts/admin/video-upload';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { restoreVideoAction } from './actions';

const c = copy.admin.videos;

/**
 * «رجّعه لمحاضرة» — choose a video lesson, and the kept video plays there
 * again. Grouped by course, because a platform has dozens of «المحاضرة
 * الأولى» and only the course tells them apart.
 */
export function RestoreVideoButton({ videoId, targets }: { videoId: string; targets: readonly VideoLibraryTarget[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [lessonId, setLessonId] = useState('');

  const courses = [...new Set(targets.map((target) => target.courseTitle))];

  async function go() {
    if (lessonId === '') return;
    setPending(true);
    const result = await restoreVideoAction(videoId, lessonId);
    setPending(false);
    if (result.ok) {
      setOpen(false);
      toast.success(c.restored);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : setOpen(next))}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-accent/40 bg-accent/10 px-3 text-[length:var(--fs-text-sm)] font-medium text-accent-text transition-colors duration-[160ms] ease-out hover:bg-accent/20 md:h-9"
        >
          <Undo2 className="size-4" aria-hidden="true" />
          {c.restore}
        </button>
      </DialogTrigger>
      <DialogContent closeLabel={copy.common.close}>
        <DialogHeader>
          <DialogTitle>{c.restoreTitle}</DialogTitle>
          <DialogDescription>{c.restoreBody}</DialogDescription>
        </DialogHeader>
        <label className="block text-[length:var(--fs-text-sm)] text-fg">
          <span className="mb-1 block text-fg-muted">{c.restorePick}</span>
          <select
            value={lessonId}
            onChange={(event) => setLessonId(event.currentTarget.value)}
            className="h-10 w-full rounded-md border border-line bg-surface-1 px-2 text-fg"
          >
            <option value="">—</option>
            {courses.map((course) => (
              <optgroup key={course} label={course}>
                {targets
                  .filter((target) => target.courseTitle === course)
                  .map((target) => (
                    <option key={target.lessonId} value={target.lessonId}>
                      {target.sectionTitle} · {target.lessonTitle} {target.hasVideo ? c.restoreHasVideo : ''}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              {c.back}
            </Button>
          </DialogClose>
          <Button onClick={() => void go()} disabled={pending || lessonId === ''}>
            {c.restoreConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
