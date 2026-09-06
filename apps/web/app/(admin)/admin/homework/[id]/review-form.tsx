'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
// `/copy/admin`, never the root barrel: these screens only ever render
// inside the admin layout, and `copy.admin.*` lives in that module.
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Textarea } from '@ayman/ui/components/textarea';
import { cn } from '@ayman/ui/lib/cn';
import { useRefreshHomeworkPendingCount } from '@/components/admin/homework-alerts';
import { reviewHomeworkAction } from '../actions';

const c = copy.admin.homework;

type Decision = 'accepted' | 'needs_work';

/**
 * The decision, and the words that go with it.
 *
 * ## The canned notes are the point of this form
 *
 * «يبقى فيه كذا أوبشن قدامي أقدر أختار منه… عشان ما أقعدش أكتب كتير.» Thirty
 * submissions in an evening is thirty sentences typed on a phone, and the one
 * that gets typed by the thirtieth is «تمام». So each verdict offers three
 * lines, already picked server-side for THIS submission — the same three on a
 * re-render, different ones for the next student (`pickHomeworkSuggestions`) —
 * and pressing one fills the box. He can still write his own; the box is an
 * ordinary textarea and it is what actually gets sent.
 *
 * ## The grade only exists on «مقبول»
 *
 * A mark on work that is coming back is a mark on something that does not
 * exist yet, and it would sit on the student's card next to «ابعته تاني»
 * contradicting it. The contract refuses the combination
 * (`HomeworkReviewSchema`) and a CHECK refuses it again at the column; this
 * just does not draw the field, so the state is unreachable rather than merely
 * invalid.
 *
 * ## What «مقبول» destroys is said BEFORE it is pressed
 *
 * Accepting deletes the photographs, in the same transaction. That is what was
 * asked for — «أول ما أراجع عليها ووافق، امسحها بقى» — but it is irreversible,
 * so the sentence sits under the button rather than in a dialog after it.
 */
export function HomeworkReviewForm({
  id,
  suggestions,
}: {
  id: string;
  suggestions: { accepted: string[]; needsWork: string[] };
}) {
  const router = useRouter();
  /*
   * The sidebar badge, corrected NOW rather than on the next 30-second tick.
   *
   * The poll is the floor, not the mechanism — same reason «اتشحن» refreshes
   * the book-order count itself: an instructor who has just marked the last
   * waiting answer should not keep seeing «1» beside «الواجبات» for another
   * half minute.
   */
  const refreshPendingCount = useRefreshHomeworkPendingCount();
  const [decision, setDecision] = useState<Decision>('accepted');
  const [message, setMessage] = useState('');
  const [grade, setGrade] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pool = decision === 'accepted' ? suggestions.accepted : suggestions.needsWork;

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await reviewHomeworkAction(id, {
        decision,
        // Only ever sent on «مقبول», and `''` means «من غير درجة» rather than
        // zero — `Number('')` is 0, which would silently mark a correct answer
        // out of a hundred as nought.
        grade: decision === 'accepted' && grade.trim() !== '' ? Number(grade) : null,
        message: message.trim(),
      });
      if (!result.ok) {
        setError(c.failed);
        return;
      }
      refreshPendingCount();
      // Back to the queue: the next thing waiting is the next thing to do, and
      // staying on a submission he has just decided is a screen with nothing
      // left on it.
      router.push('/admin/homework');
    });
  }

  return (
    <section className="mt-4 rounded-xl border border-line bg-surface-2 p-4 sm:p-5">
      {/* Two big targets, not a `<select>`: this is the decision the whole page
          exists for, and which one is chosen has to be visible without reading. */}
      <div className="grid gap-2 sm:grid-cols-2">
        <DecisionButton
          active={decision === 'accepted'}
          tone="ok"
          icon={CheckCircle2}
          label={c.accept}
          onClick={() => setDecision('accepted')}
        />
        <DecisionButton
          active={decision === 'needs_work'}
          tone="warn"
          icon={RotateCcw}
          label={c.needsWork}
          onClick={() => setDecision('needs_work')}
        />
      </div>

      <div className="mt-4">
        <p className="text-[length:var(--fs-text-sm)] font-semibold text-fg">{c.suggestions}</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {pool.map((line) => (
            <li key={line}>
              <button
                type="button"
                onClick={() => setMessage(line)}
                className={cn(
                  'w-full rounded-[var(--r-md)] border px-3 py-2 text-start',
                  'text-[length:var(--fs-text-sm)] leading-relaxed',
                  'transition-colors duration-[160ms] ease-out',
                  message === line
                    ? 'border-accent bg-accent/10 text-fg'
                    : 'border-line bg-surface-3 text-fg-muted hover:border-accent/40 hover:text-fg',
                )}
              >
                {line}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4">
        <Label htmlFor="homework-message">{c.message}</Label>
        <Textarea
          id="homework-message"
          rows={3}
          maxLength={1000}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      </div>

      {decision === 'accepted' ? (
        <div className="mt-3 max-w-[12rem]">
          <Label htmlFor="homework-grade">{c.grade}</Label>
          <Input
            id="homework-grade"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={0.5}
            value={grade}
            onChange={(event) => setGrade(event.target.value)}
          />
          <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{c.gradeOptional}</p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={send} disabled={pending || message.trim().length < 2}>
          {pending ? c.sending : c.send}
        </Button>
        {decision === 'accepted' ? (
          <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.acceptWarning}</p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function DecisionButton({
  active,
  tone,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  tone: 'ok' | 'warn';
  icon: typeof CheckCircle2;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center justify-center gap-2 rounded-[var(--r-md)] border px-4 py-3',
        'text-[length:var(--fs-text-base)] font-semibold',
        'transition-colors duration-[160ms] ease-out',
        active
          ? tone === 'ok'
            ? 'border-[color:var(--ok)] bg-[color-mix(in_oklch,var(--ok),transparent_88%)] text-[color:var(--ok)]'
            : 'border-[color:var(--warn)] bg-[color-mix(in_oklch,var(--warn),transparent_88%)] text-[color:var(--warn)]'
          : 'border-line bg-surface-3 text-fg-muted hover:text-fg',
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
      {label}
    </button>
  );
}
