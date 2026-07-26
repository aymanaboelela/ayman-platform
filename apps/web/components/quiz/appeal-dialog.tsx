'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { copy } from '@ayman/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Textarea,
} from '@ayman/ui';
import { apiPost } from '@/lib/api';

const OpenedAppealSchema = z.object({ id: z.string() });

export interface AppealDialogProps {
  attemptQuestionId: string;
  /** From `GET /api/quiz/attempts/:attemptId/appeals`, cross-referenced by
   *  the review page — server-derived, never a client guess. */
  alreadyOpen: boolean;
  onSubmitted?: () => void;
}

export function AppealDialog({ attemptQuestionId, alreadyOpen, onSubmitted }: AppealDialogProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await apiPost(`/api/quiz/attempt-questions/${attemptQuestionId}/appeals`, OpenedAppealSchema, { note });
      toast.success(copy.appeal.submitted);
      setOpen(false);
      setNote('');
      onSubmitted?.();
    } catch {
      toast.error(copy.admin.common.saveFailed);
    } finally {
      setSubmitting(false);
    }
  }

  if (alreadyOpen) {
    return (
      <Button type="button" variant="secondary" size="sm" disabled>
        {copy.appeal.alreadyOpen}
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          {copy.appeal.open}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={copy.admin.common.close}>
        <DialogHeader>
          <DialogTitle>{copy.appeal.title}</DialogTitle>
        </DialogHeader>

        <div>
          <label className="mb-1.5 block text-[length:var(--fs-text-sm)] font-medium text-fg" htmlFor="appeal-note">
            {copy.appeal.note}
          </label>
          <Textarea
            id="appeal-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={copy.appeal.notePlaceholder}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {copy.admin.common.cancel}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={submitting || note.trim().length < 10}>
            {copy.appeal.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
