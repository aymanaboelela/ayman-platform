'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { QuestionInputSchema, copy, formatCopy } from '@ayman/contracts';
import { Button, Input, Label } from '@ayman/ui';
import { z } from 'zod';
import { apiGet, apiPatch } from '@/lib/api';
import { PublishQuestionButton } from './publish-question-button';
import { QuestionForm } from './question-form';

const c = copy.quizAdmin;

/**
 * Identical to the shape `/admin/questions/[bankEntryId]`'s own page
 * validates, plus the share count. Kept as its own literal rather than
 * imported from the page: a page module is a server component and importing
 * it here would drag `apiGetAuthed` and `next/headers` into the browser
 * bundle.
 */
const HydratedQuestionSchema = z.object({
  bankEntryId: z.string(),
  versionId: z.string(),
  version: z.number(),
  status: z.enum(['draft', 'ready', 'hidden']),
  usedInQuizzes: z.number(),
  input: QuestionInputSchema,
});
type HydratedQuestion = z.infer<typeof HydratedQuestionSchema>;

export interface SlotQuestionPanelProps {
  quizId: string;
  slotId: string;
  bankEntryId: string;
  /** The slot's own mark — NOT the bank's `defaultMark`. See `slotMark`. */
  maxMark: number;
  categories: { id: string; name: string }[];
  onClose: () => void;
}

/**
 * The whole question, opened underneath its row in the exam builder.
 *
 * ## Why the fetch is here and not on the page
 *
 * The builder lists every slot, and a quiz of fifteen questions rendering
 * fifteen hydrated questions on load would issue fifteen requests to draw a
 * list nobody has expanded yet. So the panel fetches on FIRST open and keeps
 * what it got for as long as the row stays mounted — reopening a row the
 * instructor already looked at costs nothing.
 *
 * ## Two marks, one of them shown
 *
 * `QuestionVersion.defaultMark` is the bank's suggestion, copied into a slot
 * once at creation and never consulted again. `QuizSlot.maxMark` is what the
 * row displays, what `sumMarks` totals and what a student is graded against.
 * The form runs with `embedded` so it hides the former, and the field below
 * writes the latter.
 */
export function SlotQuestionPanel({
  quizId,
  slotId,
  bankEntryId,
  maxMark,
  categories,
  onClose,
}: SlotQuestionPanelProps) {
  const [question, setQuestion] = useState<HydratedQuestion | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  /** Set after a save, because a save turns a `ready` question into a draft. */
  const [savedAsDraft, setSavedAsDraft] = useState(false);

  useEffect(() => {
    // Guards against a response from a request the instructor has already
    // navigated away from overwriting fresher state.
    let live = true;
    apiGet(`/api/admin/questions/${bankEntryId}`, HydratedQuestionSchema)
      .then((result) => {
        if (live) setQuestion(result);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [bankEntryId, attempt]);

  if (failed) {
    return (
      <PanelShell onClose={onClose}>
        <p role="alert" className="text-[length:var(--fs-text-sm)] text-err">
          {c.slotLoadFailed}{' '}
          <button
            type="button"
            // Clearing the error HERE and not at the top of the effect: a
            // setState run synchronously inside an effect re-renders the
            // whole panel a second time before paint, and the only moment the
            // flag needs clearing is the one the instructor causes.
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
            className="underline underline-offset-2"
          >
            {c.slotRetry}
          </button>
        </p>
      </PanelShell>
    );
  }

  if (question === null) {
    return (
      <PanelShell onClose={onClose}>
        <p aria-live="polite" className="text-fg-muted">
          {c.slotLoading}
        </p>
      </PanelShell>
    );
  }

  const isDraft = question.status === 'draft';

  return (
    <PanelShell onClose={onClose}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
          {formatCopy(c.versionBadge, { n: question.version })}
          {isDraft ? ` · ${c.draftBadge}` : ''}
        </p>
        {isDraft ? <PublishQuestionButton versionId={question.versionId} /> : null}
      </div>

      {question.usedInQuizzes > 1 ? (
        <p className="mb-4 rounded-sm border border-line bg-surface-3 p-3 text-[length:var(--fs-text-sm)]">
          {formatCopy(c.slotSharedWarning, { n: question.usedInQuizzes })}
        </p>
      ) : null}

      {/* Only after a save, and only while the question is still a draft: on
          first open a draft is simply unfinished, whereas a draft the
          instructor just created by editing a published question is one the
          students cannot see yet — a different sentence for a different
          situation. */}
      {savedAsDraft && isDraft ? (
        <p role="status" className="mb-4 rounded-sm border border-line bg-surface-3 p-3 text-[length:var(--fs-text-sm)]">
          {c.slotDraftPending}
        </p>
      ) : null}

      <SlotMarkField quizId={quizId} slotId={slotId} maxMark={maxMark} />

      <QuestionForm
        categories={categories}
        bankEntryId={question.bankEntryId}
        defaultValues={question.input}
        embedded
        // Stays open on save. The instructor is mid-exam, and closing the
        // thing they just edited hides whether the edit took.
        onSaved={() => {
          setSavedAsDraft(true);
          setAttempt((n) => n + 1);
        }}
      />
    </PanelShell>
  );
}

/**
 * The mark this question is worth in THIS exam.
 *
 * Saved on blur rather than behind its own button: it is one number next to a
 * form that already has a save, and two save buttons in one panel is how the
 * wrong one gets pressed. A rejected write puts the previous value back —
 * a number left on screen that the server does not hold is how an exam ends
 * up totalled to something nothing on the page agrees with.
 */
function SlotMarkField({
  quizId,
  slotId,
  maxMark,
}: {
  quizId: string;
  slotId: string;
  maxMark: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(maxMark));
  const [saving, setSaving] = useState(false);
  const saved = useRef(maxMark);

  async function commit() {
    const next = Number(value);
    if (!Number.isFinite(next) || next <= 0 || next === saved.current) {
      setValue(String(saved.current));
      return;
    }
    setSaving(true);
    try {
      await apiPatch(`/api/admin/quizzes/${quizId}/slots/${slotId}`, { maxMark: next });
      saved.current = next;
      toast.success(copy.admin.common.saved);
      // The mark on the row beside this field and the exam total above it are
      // both server-rendered, so the write has to be followed by a refetch of
      // that render. `router.refresh()` and NOT a page reload: a reload would
      // close the panel and throw away whatever the instructor had typed into
      // the question form next to this field but not yet saved.
      router.refresh();
    } catch {
      setValue(String(saved.current));
      toast.error(c.slotMarkFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-5 max-w-[12rem]">
      <Label htmlFor={`slot-mark-${slotId}`}>{c.slotMark}</Label>
      <Input
        id={`slot-mark-${slotId}`}
        type="number"
        step="0.5"
        min={0.5}
        value={value}
        disabled={saving}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
      />
    </div>
  );
}

function PanelShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      /*
       * ## Why the panel is DARKER than the row, and edged
       *
       * It shipped as `bg-surface-1` under a `bg-surface-2` row — the panel
       * was LIGHTER than the thing it hangs off, on a page that is also
       * surface-1, so the only thing separating a whole open question from
       * the page was a 1px line. It read as unfinished rather than as a
       * panel.
       *
       * `surface-3` puts it a step BELOW the row, which is what "inside" looks
       * like, and the accent edge on the inline-start side ties the open panel
       * to its row the way a thread does — so with three questions open at
       * once it stays obvious which block belongs to which question.
       */
      className="rounded-b-sm border border-t-0 border-line bg-surface-3 p-4 border-s-2 border-s-accent"
      // Escape closes the panel from anywhere inside it, including from the
      // form's own fields — `QuestionForm` runs with `embedded`, which is
      // exactly what stops it from handling the key itself and navigating
      // away from the exam.
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      {children}
      <div className="mt-4 flex justify-end border-t border-line-subtle pt-3">
        <Button type="button" variant="ghost" onClick={onClose}>
          {c.slotCollapse}
        </Button>
      </div>
    </div>
  );
}
