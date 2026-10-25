'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, PenLine } from 'lucide-react';
// `/copy/admin`, never the root barrel: these screens only ever render inside /admin.
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Textarea } from '@ayman/ui/components/textarea';
import { cn } from '@ayman/ui/lib/cn';
import { reviewHomeworkAction } from '../actions';

const c = copy.admin.homework;

export interface HomeworkReviewedCardProps {
  id: string;
  initialGrade: number | null;
  initialNote: string | null;
  suggestions: string[];
}

/**
 * The reviewed verdict card on an accepted homework submission.
 *
 * An instructor can view their previous grade and note, and edit the grade (0–100)
 * and note at any time if a mistake was made or if the mark needs adjustment.
 */
export function HomeworkReviewedCard({
  id,
  initialGrade,
  initialNote,
  suggestions,
}: HomeworkReviewedCardProps) {
  const router = useRouter();
  const gradeFieldId = useId();
  const messageFieldId = useId();

  const [grade, setGrade] = useState<number | null>(initialGrade);
  const [note, setNote] = useState<string | null>(initialNote);
  const [isEditing, setIsEditing] = useState(false);
  const [gradeInput, setGradeInput] = useState(initialGrade !== null ? String(initialGrade) : '');
  const [messageInput, setMessageInput] = useState(initialNote ?? '');
  const [savedToast, setSavedToast] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startEditing() {
    setGradeInput(grade !== null ? String(grade) : '');
    setMessageInput(note ?? '');
    setError(null);
    setSavedToast(false);
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setError(null);
  }

  function handleSave() {
    setError(null);
    const trimmedMessage = messageInput.trim();
    if (trimmedMessage.length < 2) {
      return;
    }

    const trimmedGrade = gradeInput.trim();
    const parsedGrade = trimmedGrade !== '' ? Number(trimmedGrade) : null;
    if (parsedGrade !== null && (!Number.isFinite(parsedGrade) || parsedGrade < 0 || parsedGrade > 100)) {
      setError(c.failed);
      return;
    }

    startTransition(async () => {
      const result = await reviewHomeworkAction(id, {
        decision: 'accepted',
        grade: parsedGrade,
        message: trimmedMessage,
      });

      if (!result.ok) {
        setError(c.failed);
        return;
      }

      setGrade(parsedGrade);
      setNote(trimmedMessage);
      setIsEditing(false);
      setSavedToast(true);
      router.refresh();
    });
  }

  return (
    <section className="mt-4 rounded-xl border border-line bg-surface-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[length:var(--fs-text-sm)] font-semibold text-fg-muted">{c.yourNote}</h2>
        {!isEditing ? (
          <Button type="button" variant="ghost" size="sm" onClick={startEditing}>
            <PenLine className="size-4" aria-hidden="true" />
            {c.editGrade}
          </Button>
        ) : null}
      </div>

      {!isEditing ? (
        <div className="mt-2">
          {note ? (
            <p className="whitespace-pre-line text-[length:var(--fs-text-base)] text-fg">{note}</p>
          ) : (
            <p className="text-[length:var(--fs-text-sm)] text-fg-muted">—</p>
          )}

          {grade !== null ? (
            <p className="mt-2 text-[length:var(--fs-text-base)] font-semibold text-[color:var(--ok)] tabular-nums">
              {grade} / 100
            </p>
          ) : (
            <p className="mt-2 text-[length:var(--fs-text-xs)] text-fg-muted">{c.noGradeGiven}</p>
          )}

          {savedToast ? (
            <p className="mt-2 flex items-center gap-1.5 text-[length:var(--fs-text-xs)] text-[color:var(--ok)]">
              <Check className="size-3.5" aria-hidden="true" />
              {c.reviewedAccepted}
            </p>
          ) : null}
        </div>
      ) : (
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          {suggestions.length > 0 ? (
            <div>
              <p className="text-[length:var(--fs-text-xs)] font-semibold text-fg-muted">
                {c.suggestions}
              </p>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {suggestions.map((line) => (
                  <li key={line}>
                    <button
                      type="button"
                      onClick={() => setMessageInput(line)}
                      className={cn(
                        'w-full rounded-[var(--r-md)] border px-3 py-2 text-start',
                        'text-[length:var(--fs-text-sm)] leading-relaxed',
                        'transition-colors duration-[160ms] ease-out',
                        messageInput === line
                          ? 'border-accent bg-accent/10 text-fg'
                          : 'border-line bg-surface-2 text-fg-muted hover:border-accent/40 hover:text-fg',
                      )}
                    >
                      {line}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <Label htmlFor={messageFieldId}>{c.message}</Label>
            <Textarea
              id={messageFieldId}
              rows={3}
              maxLength={1000}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="max-w-[12rem]">
            <Label htmlFor={gradeFieldId}>{c.grade}</Label>
            <Input
              id={gradeFieldId}
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={0.5}
              value={gradeInput}
              onChange={(e) => setGradeInput(e.target.value)}
              className="mt-1 tabular-nums"
            />
            <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{c.gradeOptional}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="submit" size="sm" disabled={pending || messageInput.trim().length < 2}>
              {pending ? c.sending : c.saveEdit}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={cancelEditing}>
              {c.cancelEdit}
            </Button>
          </div>

          {error ? (
            <p role="alert" className="text-[length:var(--fs-text-xs)] text-[color:var(--err)]">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}
