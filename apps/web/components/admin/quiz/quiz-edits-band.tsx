'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { PublishQuizEditsResultSchema, RegradeResultSchema } from '@ayman/contracts/quiz/regrade';
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
import { apiPost } from '@/lib/api';
import './question-bank.css';

const c = copy.quizAdmin;

/** `publish-edits` answers without its `regrade` half — that is a second call. */
const PublishedSchema = PublishQuizEditsResultSchema.omit({ regrade: true });

export interface QuizEditsBandProps {
  quizId: string;
  /** Questions whose newest version is an edit nobody published. */
  pendingDrafts: number;
  /** Answers marked against an older version than the one now served. */
  staleAnswers: number;
  students: number;
}

/**
 * «فيه تعديلات متنشرتش» — above the exam's questions, only while there is
 * something to say.
 *
 * Two different facts, one place to act on them:
 *
 *   · an edit saved and never published — the builder's row shows the edited
 *     stem, students are still served the old version, and nothing on the
 *     page used to say so (on 2026-10-17 one teacher had 22 of them);
 *   · answers marked against an older version than students now get — the key
 *     was corrected, and the papers already handed in still carry the old
 *     marks.
 *
 * Publishing offers the regrade with it, ticked, because the reason to publish
 * a correction is almost always the marks it fixes.
 */
export function QuizEditsBand({ quizId, pendingDrafts, staleAnswers, students }: QuizEditsBandProps) {
  const router = useRouter();
  const checkboxId = useId();
  const [open, setOpen] = useState(false);
  const [regrade, setRegrade] = useState(true);
  const [pending, setPending] = useState(false);

  if (pendingDrafts === 0 && staleAnswers === 0) return null;
  const publishing = pendingDrafts > 0;

  async function run() {
    setPending(true);
    try {
      if (publishing) {
        const published = await apiPost(`/api/admin/quizzes/${quizId}/publish-edits`, PublishedSchema, {});
        if (published.published > 0) toast.success(formatCopy(c.editsPublished, { n: published.published }));
        if (published.failed.length > 0) toast.error(formatCopy(c.editsPublishFailed, { n: published.failed.length }));
      }
      if (!publishing || regrade) {
        const result = await apiPost(`/api/admin/quizzes/${quizId}/regrade`, RegradeResultSchema, {});
        toast.success(
          result.raised + result.lowered > 0
            ? formatCopy(c.regradeDone, { raised: result.raised, lowered: result.lowered })
            : c.regradeNoChange,
        );
      }
      setOpen(false);
      router.refresh();
    } catch {
      toast.error(c.editsFailed);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="qbank-drafts" role="region" aria-label={publishing ? c.editsPublish : c.editsRegrade}>
      <div className="qbank-drafts__lead">
        {pendingDrafts > 0 ? <p>{formatCopy(c.editsPendingBody, { n: pendingDrafts })}</p> : null}
        {staleAnswers > 0 ? <p>{formatCopy(c.editsStaleBody, { answers: staleAnswers, students })}</p> : null}
      </div>
      <div className="qbank-drafts__actions">
        <button type="button" className="qbank-drafts__go" onClick={() => setOpen(true)}>
          {publishing ? <Send className="size-4" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
          {publishing ? c.editsPublish : c.editsRegrade}
        </button>
      </div>

      <Dialog open={open} onOpenChange={(next) => (pending ? null : setOpen(next))}>
        <DialogContent closeLabel={copy.admin.common.close} className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{publishing ? c.editsConfirmTitle : c.editsConfirmRegradeTitle}</DialogTitle>
            <DialogDescription>{publishing ? c.editsConfirmBody : c.editsConfirmRegradeBody}</DialogDescription>
          </DialogHeader>

          {publishing ? (
            <div className="qconfirm__regrade">
              <Checkbox
                id={checkboxId}
                checked={regrade}
                onCheckedChange={(next) => setRegrade(next === true)}
                disabled={pending}
              />
              <label htmlFor={checkboxId} className="qconfirm__regrade-label">
                <span>{c.editsConfirmRegradeBody}</span>
                <span className="qconfirm__regrade-hint">{c.saveConfirmRegradeHint}</span>
              </label>
            </div>
          ) : (
            <p className="qconfirm__checking">{c.saveConfirmRegradeHint}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" autoFocus onClick={() => setOpen(false)} disabled={pending}>
              {c.saveConfirmCancel}
            </Button>
            <Button type="button" onClick={() => void run()} disabled={pending}>
              {publishing ? c.editsPublish : c.editsRegrade}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
