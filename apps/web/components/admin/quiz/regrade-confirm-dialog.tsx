'use client';

import { useEffect, useId, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { RegradePreviewSchema, type RegradePreview } from '@ayman/contracts/quiz/regrade';
import { Button } from '@ayman/ui/components/button';
import { Checkbox } from '@ayman/ui/components/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { apiGet } from '@/lib/api';
import './question-bank.css';

const c = copy.quizAdmin;

export interface RegradeConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What is about to happen, one fact per line — read before the button. */
  lines: readonly string[];
  /** Shown highlighted: the key changed, the one edit that moves marks. */
  warning?: string | null;
  /**
   * The bank question whose past answers would be marked again. The dialog
   * asks the API how many there are — ALL of them (`scope=all`), because it
   * runs before the edit is published, while those answers still sit on the
   * version about to be replaced. With none, or without the permission to
   * regrade (`attempt:grade`), the option simply does not appear.
   */
  bankEntryId: string | null;
  /** Ticked when the key changed — a fix to the key is exactly what a
   *  regrade is for; unticked for a wording fix, which moves no mark. */
  defaultRegrade: boolean;
  confirmLabel: string;
  pending: boolean;
  onConfirm: (regrade: boolean) => void;
}

/**
 * «متأكد إنك عايز تحفظ التعديل؟» — the stop between a click and a change
 * students see.
 *
 * The owner asked for it in so many words: while reviewing questions, a
 * mis-click must not go live. It is also where the regrade is offered, because
 * the moment of fixing a key is the only moment anyone thinks of the students
 * who were marked against the old one — on 2026-10-17 a teacher had corrected
 * 22 questions without a single past answer being marked again.
 *
 * «لأ، ارجع» holds the initial focus: an Enter pressed by habit must cancel,
 * never publish.
 */
export function RegradeConfirmDialog(props: RegradeConfirmDialogProps) {
  const { open, onOpenChange, pending } = props;
  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? null : onOpenChange(next))}>
      <DialogContent closeLabel={copy.admin.common.close} className="max-w-[560px]">
        {/* Radix mounts the content on every open, so the body below starts
            from its props each time — the tick and the count can never
            carry over from the last question the dialog asked about. */}
        <ConfirmBody {...props} />
      </DialogContent>
    </Dialog>
  );
}

function ConfirmBody({
  onOpenChange,
  title,
  lines,
  warning,
  bankEntryId,
  defaultRegrade,
  confirmLabel,
  pending,
  onConfirm,
}: RegradeConfirmDialogProps) {
  const checkboxId = useId();
  const [preview, setPreview] = useState<RegradePreview | 'loading' | null>(bankEntryId ? 'loading' : null);
  const [regrade, setRegrade] = useState(defaultRegrade);

  useEffect(() => {
    if (!bankEntryId) return;
    let live = true;
    apiGet(`/api/admin/questions/${bankEntryId}/regrade?scope=all`, RegradePreviewSchema)
      .then((result) => {
        if (live) setPreview(result);
      })
      .catch(() => {
        // No permission, or the API is away: the save itself does not depend
        // on this, so the option is left out rather than blocking the dialog.
        if (live) setPreview(null);
      });
    return () => {
      live = false;
    };
  }, [bankEntryId]);

  const answers = preview && preview !== 'loading' ? preview.answers : 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription asChild>
          <div className="qconfirm__lines">
            {lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </DialogDescription>
      </DialogHeader>

      {warning ? (
        <p className="qconfirm__warning" role="status">
          <CircleAlert className="size-4 flex-none" aria-hidden="true" />
          <span>{warning}</span>
        </p>
      ) : null}

      {preview === 'loading' ? (
        <p className="qconfirm__checking" aria-live="polite">
          {c.saveConfirmChecking}
        </p>
      ) : answers > 0 ? (
        <div className="qconfirm__regrade">
          <Checkbox
            id={checkboxId}
            checked={regrade}
            onCheckedChange={(next) => setRegrade(next === true)}
            disabled={pending}
          />
          <label htmlFor={checkboxId} className="qconfirm__regrade-label">
            <span>{formatCopy(c.saveConfirmRegrade, { n: answers })}</span>
            <span className="qconfirm__regrade-hint">{c.saveConfirmRegradeHint}</span>
          </label>
        </div>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="ghost" autoFocus onClick={() => onOpenChange(false)} disabled={pending}>
          {c.saveConfirmCancel}
        </Button>
        <Button
          type="button"
          onClick={() => onConfirm(answers > 0 && regrade)}
          disabled={pending || preview === 'loading'}
        >
          {/* A regrade of a few hundred papers takes seconds; a button that
              only greys out reads as a tap that did nothing. */}
          {pending ? copy.admin.common.saving : confirmLabel}
        </Button>
      </DialogFooter>
    </>
  );
}
