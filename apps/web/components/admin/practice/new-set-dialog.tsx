'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { adminPractice as c } from '@ayman/contracts/copy/admin-practice';
import type { PracticeTrack, PracticeYear } from '@ayman/contracts/practice';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { createPracticeSet } from '@/app/(admin)/admin/practice/actions';
import { SetMetaFields, blankToNull, checkSetMeta, type SetMetaValue } from './set-meta-fields';

/**
 * «إضافة درس» — a new set, created as a draft, then straight into its editor:
 * an empty set is only ever made in order to put questions in it.
 *
 * Opens on the year and track being looked at, so adding the fifth lesson of
 * «تانية · عربي» does not start from «أولى».
 */
export function NewSetDialog({
  defaultYear = 2,
  defaultTrack = 'arabic',
  triggerClassName,
}: {
  defaultYear?: PracticeYear;
  defaultTrack?: PracticeTrack;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [shown, setShown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState<SetMetaValue>({
    year: defaultYear,
    track: defaultTrack,
    lessonCode: '',
    title: '',
    unitTitle: '',
    articleSlug: '',
  });

  const errors = shown ? checkSetMeta(value) : {};

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setShown(true);
    setError(null);
    if (Object.keys(checkSetMeta(value)).length > 0) return;
    setBusy(true);
    try {
      const result = await createPracticeSet({
        year: value.year,
        track: value.track,
        lessonCode: value.lessonCode.trim(),
        title: value.title.trim(),
        unitTitle: blankToNull(value.unitTitle),
        articleSlug: blankToNull(value.articleSlug),
        published: false,
      });
      if (!result.ok) {
        // A taken code is fixable right here, so it stays in the dialog
        // rather than in a toast that leaves with the instructor's attention.
        setError(result.message);
        return;
      }
      toast.success(c.create.done);
      setOpen(false);
      startTransition(() => router.push(`/admin/practice/${result.data.id}`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={triggerClassName ?? 'chip chip--solid'}>
          <Plus className="size-5" aria-hidden="true" />
          {c.create.open}
        </button>
      </DialogTrigger>
      <DialogContent closeLabel={c.actions.close} className="max-w-[640px]">
        <form method="post" onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{c.create.title}</DialogTitle>
            <DialogDescription>{c.create.lead}</DialogDescription>
          </DialogHeader>
          <div className="my-4">
            <SetMetaFields value={value} onChange={setValue} errors={errors} />
          </div>
          {error ? (
            <p role="alert" className="prx-error mb-3">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {c.actions.cancel}
            </Button>
            <Button type="submit" disabled={busy}>
              {c.create.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
