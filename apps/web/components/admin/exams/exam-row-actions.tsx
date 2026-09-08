'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Eye, EyeOff, PenLine, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import type { AdminExamRow } from '@ayman/contracts/admin/exams';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { deleteExamAction, setExamPublishedAction } from '@/app/(admin)/admin/exams/actions';
import { DuplicateExamDialog } from './duplicate-exam-dialog';
import { examFailureMessage, type ExamFailure } from './exam-errors';
import type { ExamCourseOption } from './exam-form';

const c = copy.admin.monthlyExams;

/**
 * The four things a row can do, and the hierarchy between them.
 *
 * ## UNPUBLISH is the visible one; DELETE is the quiet one
 *
 * This is the whole point of the cluster, not a styling preference. Delete
 * cascades the quiz, every attempt and every coverage row, permanently — and
 * the API refuses it outright the moment anyone has sat the paper. An exam he
 * wants off the dashboard before it opens is UNPUBLISHED: that takes it out of
 * `/api/me/exams` and off every student's card while keeping the paper, the
 * window and (later) the grades.
 *
 * So publish and unpublish are amber, full weight, first in the row. Delete
 * sits past a hairline, colourless until hover (`.chip--danger` in admin.css),
 * and asks before it does anything — and when the exam has attempts it does not
 * ask at all, it explains and points at unpublish.
 *
 * ## The publish preflight runs here as well as on the API
 *
 * `setPublished` rejects an empty paper (`quiz_has_no_slots`) and a paper whose
 * questions are all worth zero (`sum_marks_must_be_positive`). The row already
 * knows `questionCount`, so an empty one never leaves the browser — «مينفعش
 * تنشر امتحان من غير أسئلة» appears instantly, next to the button, instead of
 * arriving as a failed request.
 *
 * ⚠️ The same `questionCount` is what disambiguates the API's own refusal:
 * `AllExceptionsFilter` strips the machine-readable `code` off the response
 * (see `exam-errors.ts`), so a 400 on a publish is read as "the marks" when the
 * paper has questions and "the questions" when it does not. Those are the only
 * two things that preflight rejects.
 */
export function ExamRowActions({
  row,
  courses,
}: {
  row: AdminExamRow;
  /** For the duplicate dialog — every course but this exam's own. */
  courses: readonly ExamCourseOption[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ExamFailure | null>(null);
  const [confirming, setConfirming] = useState(false);

  /*
   * Both, not either. The service publishes the quiz and its lesson in one
   * transaction precisely so they cannot drift — but if they ever have, the
   * honest reading is "not published", and «انشر» is then also the repair: it
   * writes both again.
   */
  const published = row.quizPublished && row.lessonPublished;

  /** The paper. `quizId` is null only on an exam whose quiz is missing entirely,
   *  in which case the lesson route is the one that get-or-creates it. */
  const paperHref = row.quizId
    ? `/admin/quizzes/${row.quizId}`
    : `/admin/quizzes/lesson/${row.lessonId}`;

  async function togglePublished() {
    setFailure(null);

    if (!published && row.questionCount === 0) {
      setFailure('no_questions');
      return;
    }

    setPending(true);
    const result = await setExamPublishedAction(row.lessonId, !published);
    setPending(false);

    if (!result.ok) {
      // See the class note: with no `code` on the wire, `questionCount` is what
      // tells the two publish refusals apart.
      const guessed =
        result.failure === 'unknown'
          ? row.questionCount === 0
            ? 'no_questions'
            : 'no_marks'
          : result.failure;
      setFailure(guessed);
      return;
    }
    router.refresh();
  }

  async function remove() {
    setPending(true);
    const result = await deleteExamAction(row.lessonId);
    setPending(false);
    setConfirming(false);

    if (!result.ok) {
      // The only thing `remove` refuses is an exam somebody has sat, and the
      // dialog above never offers the confirm button in that case — so a
      // failure here is either a race (a student started the exam while the
      // dialog was open) or a fault.
      const guessed = result.failure === 'unknown' ? 'has_attempts' : result.failure;
      setFailure(guessed);
      toast.error(examFailureMessage(guessed));
      return;
    }
    toast.success(copy.admin.common.saved);
    router.refresh();
  }

  return (
    /*
      A plain block, NOT a `flex-col`, around `.row-actions`.
      `.row-actions` takes `flex-basis: 100%` under 640px so the cluster wraps
      onto its own line — which only means anything while it is a flex ITEM of a
      ROW. Inside a column it would be resolving a basis against a height, which
      is not what admin.css is describing there.
    */
    <div className="shrink-0">
      <div className="row-actions">
        {/* «حط الأسئلة» — into the existing quiz builder, which is where every
            paper on this platform is written. This screen deliberately does not
            grow a second question editor. */}
        <Link href={paperHref} className="chip chip--quiet">
          <PenLine className="size-3.5" aria-hidden="true" />
          {c.addQuestions}
        </Link>

        <button
          type="button"
          className={published ? 'chip chip--accent' : 'chip chip--solid'}
          disabled={pending}
          onClick={() => void togglePublished()}
        >
          {published ? (
            <EyeOff className="size-3.5" aria-hidden="true" />
          ) : (
            <Eye className="size-3.5" aria-hidden="true" />
          )}
          {published ? c.unpublish : c.publish}
        </button>

        <DuplicateExamDialog
          lessonId={row.lessonId}
          sourceTitle={row.title}
          courses={courses}
        />

        {/* Past the hairline, and colourless until hover. The separator is the
            same one every admin row uses to keep a destructive control out of
            the reading path. */}
        <span aria-hidden="true" className="row-actions__sep" />
        <button
          type="button"
          className="chip chip--danger"
          disabled={pending}
          onClick={() => {
            setFailure(null);
            setConfirming(true);
          }}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          {c.delete}
        </button>
      </div>

      {/* `aria-live` as well as `role="alert"`: the message replaces an empty
          node rather than appearing fresh, and some screen readers do not
          announce a `role="alert"` that was already in the tree. Same reasoning
          as `ActionError` in the course editor. */}
      {failure !== null ? (
        <p
          role="alert"
          aria-live="polite"
          className="mt-1.5 max-w-[22rem] text-[length:var(--fs-text-xs)] text-err"
        >
          {examFailureMessage(failure)}
        </p>
      ) : null}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent closeLabel={copy.admin.common.close}>
          <DialogHeader>
            <DialogTitle>{row.title}</DialogTitle>
            {/*
              Two different sentences, and the difference is the whole design:

              · nobody has sat it   → «هيتمسح الامتحان وكل حاجة فيه، ومفيش رجوع»
              · somebody has        → «فيه طلبة دخلوا… لو عايزه يختفي، اوقف النشر»

              The second is not an error message. It is the answer to what he
              was actually trying to do, and it names the control that does it.
            */}
            <DialogDescription>
              {row.attemptCount > 0 ? c.deleteHasAttempts : c.deleteConfirm}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            {row.attemptCount > 0 ? (
              <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
                {copy.admin.common.close}
              </Button>
            ) : (
              <>
                <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
                  {copy.admin.common.cancel}
                </Button>
                <Button type="button" variant="danger" disabled={pending} onClick={() => void remove()}>
                  {c.delete}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
