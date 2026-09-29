'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import type { HeartbeatResponse } from '@ayman/contracts/progress';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { cn } from '@ayman/ui/lib/cn';
import { deleteComplete } from '@/lib/progress-undo-client';
import { CheckIcon } from './icons';

const p = copy.player;

export interface UndoCompleteButtonProps {
  lessonId: string;
  onProgress: (response: HeartbeatResponse) => void;
}

/**
 * «تم», when it can be taken back — «في ناس بتضغط بالغلط. عاوز لما أضغط على
 * "تم" تاني يطلعلي بوب أب شكله حلو إن ممكن أتراجع».
 *
 * `LessonNav` draws this INSTEAD of the disabled «تم» badge, and only when
 * `isCompletionUndoable` says the completion came from «خلاص · التالي» on a
 * lecture that has not since been watched. Every other «تم» — watched to the
 * end, dwelt on, a passed quiz — stays the badge it always was, because the
 * server would refuse the undo and a dialog whose «أيوه» is a 400 is worse
 * than no dialog.
 *
 * ## Why it asks
 *
 * The mistake this undoes is a mis-tap, so undoing it on ONE tap would just
 * move the mis-tap: «تم» sits exactly where «خلاص · التالي» was, under the
 * same thumb. The question costs a correct press one extra tap; skipping it
 * costs a wrong one a lecture's worth of progress.
 *
 * ## After the yes
 *
 * The same two moves `LessonNav.finish` makes, minus the navigation: the
 * server's answer goes to `onProgress` (so the button reads «خلاص · التالي»
 * again without waiting on anything), and `router.refresh()` so the outline's
 * tick, the course ring and the dashboard stop showing the lesson finished —
 * see `finish()`'s note on `staleTimes` for why that call is not optional.
 *
 * A failure keeps the dialog OPEN with the reason inside it: the student is
 * looking at the dialog, and closing it on an error would read as «اتعملت».
 */
export function UndoCompleteButton({ lessonId, onProgress }: UndoCompleteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function confirm(): Promise<void> {
    setSending(true);
    setFailed(false);
    try {
      const response = await deleteComplete(lessonId);
      setOpen(false);
      onProgress(response);
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Not while the request is in flight: closing then would hide the
        // answer, and the lesson would flip under a dialog nobody is reading.
        if (sending) return;
        setOpen(next);
        if (next) setFailed(false);
      }}
    >
      <DialogTrigger
        aria-haspopup="dialog"
        className={cn(
          'inline-flex h-10 w-full items-center justify-center gap-2 rounded-sm px-4 sm:w-auto',
          'border border-ok/40 bg-ok/10 text-ok',
          'text-[length:var(--fs-text-base)] font-medium',
          'transition-colors duration-[var(--d-hover)] ease-[var(--ease)] hover:bg-ok/20',
        )}
      >
        <CheckIcon />
        {p.completed}
      </DialogTrigger>

      <DialogContent closeLabel={copy.common.close}>
        <DialogHeader className="items-center text-center">
          <span
            aria-hidden="true"
            className="mb-2 grid size-16 place-items-center rounded-full bg-accent/10 text-accent-text"
          >
            {/* An undo arrow points BACK, which in this script is the inline
                end — hence the mirror. */}
            <Undo2 className="size-8 rtl:-scale-x-100" />
          </span>
          <DialogTitle>{p.undoTitle}</DialogTitle>
          <DialogDescription className="max-w-[32ch] leading-7">{p.undoBody}</DialogDescription>
        </DialogHeader>

        {failed ? (
          <p
            role="alert"
            className="mb-3 text-center text-[length:var(--fs-text-sm)] text-err"
          >
            {p.undoFailed}
          </p>
        ) : null}

        {/* Stacked on a phone, side by side from `sm`: «لأ، يفضل زي ما هو» is
            too long to share a 290px row without wrapping inside a button that
            refuses to wrap. The yes comes first — it is what the student
            opened this for. */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <Button onClick={() => void confirm()} disabled={sending} className="h-12 font-semibold">
            {sending ? p.undoing : p.undoConfirm}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setOpen(false)}
            disabled={sending}
            className="h-12 font-semibold"
          >
            {p.undoCancel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
