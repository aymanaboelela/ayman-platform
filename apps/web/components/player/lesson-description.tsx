import { copy } from '@ayman/contracts/copy';

const c = copy.player;

/**
 * «ملخص الدرس» — the recap, closed until the student opens it.
 *
 * ## Why it is collapsed, and why that is not a gate
 *
 * The instruction was «قوله متشوفش الوصف إلا لما تشوف الدرس كله». That is
 * about reading ORDER, not secrecy: a summary read first is the answers read
 * first, and the lecture stops being a thing you work through. So the panel
 * states plainly what it is and when to open it, and then lets the student
 * decide — which is the honest shape for a request about self-discipline.
 *
 * It is deliberately NOT gated on `state === 'completed'`. Completion here is
 * a progress heuristic (a view threshold, a quiz grade), and a student who
 * watched the whole lecture on a phone with a flaky connection can easily not
 * be marked complete. Locking the recap behind that would punish the wrong
 * person for a telemetry gap, and the thing being protected is a paragraph.
 *
 * ## `<details>`, not React state
 *
 * No `'use client'`, no `useState`, no hydration for a disclosure the browser
 * has implemented natively for years — and it works before any JavaScript
 * loads, which on a 3G phone is the several seconds a student is most likely
 * to press it.
 *
 * `whitespace-pre-wrap`: the column is plain text with the instructor's own
 * line breaks (see `Lesson.description`), and collapsing them turns a list of
 * four points into one paragraph.
 */
export function LessonDescription({ description }: { description: string | null }) {
  if (!description) return null;

  return (
    <details className="mt-6 rounded-xl border border-line bg-surface-2">
      <summary className="cursor-pointer list-none p-4 text-[length:var(--fs-text-base)] font-semibold text-fg">
        {c.descriptionTitle}
        <span className="mt-1 block text-[length:var(--fs-text-xs)] font-normal text-fg-muted">
          {c.descriptionWarning}
        </span>
      </summary>
      <p className="whitespace-pre-wrap break-words border-t border-line px-4 py-3 text-[length:var(--fs-text-sm)] leading-relaxed text-fg">
        {description}
      </p>
    </details>
  );
}
