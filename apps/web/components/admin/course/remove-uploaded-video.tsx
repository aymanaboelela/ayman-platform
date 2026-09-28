'use client';

import { useState } from 'react';
import { toast } from 'sonner';
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
import { removeLessonVideoAction } from '@/app/(admin)/admin/courses/actions';

/**
 * «شيل الفيديو» for an UPLOADED lecture — with the question the owner asked
 * for: «امسحه خالص من السيرفر ولا شيله بس، عشان لو حبيت أرجّعه تاني».
 *
 * A YouTube lecture keeps the plain confirm: there is nothing of ours to keep
 * or to delete, only a link to take off.
 */
export function RemoveUploadedVideo({
  courseId,
  lessonId,
  onRemoved,
}: {
  courseId: string;
  lessonId: string;
  onRemoved: () => void;
}) {
  const c = copy.admin.lesson;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<'keep' | 'delete' | null>(null);

  async function go(keep: boolean) {
    setPending(keep ? 'keep' : 'delete');
    const result = await removeLessonVideoAction(courseId, lessonId, keep);
    setPending(null);
    if (result.ok) {
      setOpen(false);
      toast.success(c.removeVideoDone);
      onRemoved();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : setOpen(next))}>
      <DialogTrigger asChild>
        <button type="button" className="chip chip--quiet">
          {c.removeVideo}
        </button>
      </DialogTrigger>
      <DialogContent closeLabel={copy.common.close}>
        <DialogHeader>
          <DialogTitle>{c.removeUploadedTitle}</DialogTitle>
          <DialogDescription>{c.removeUploadedBody}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending !== null}>
              {copy.admin.videos.back}
            </Button>
          </DialogClose>
          <Button variant="danger" onClick={() => void go(false)} disabled={pending !== null}>
            {c.removeUploadedDelete}
          </Button>
          <Button onClick={() => void go(true)} disabled={pending !== null}>
            {c.removeUploadedKeep}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
