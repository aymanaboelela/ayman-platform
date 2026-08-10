'use client';

import { useState } from 'react';
import { QUIZ_PAPERS, copy, formatCopy, type QuizPaper } from '@ayman/contracts';
import { AddPoolDialog } from './add-pool-dialog';
import { AddSlotDialog } from './add-slot-dialog';
import { NewQuestionDialog } from './new-question-dialog';
import { RemovableSlotList } from './removable-slot-list';
import type { QuizSlotRow } from './slot-list';

const c = copy.quizAdmin;

export interface PaperTabsProps {
  quizId: string;
  slots: QuizSlotRow[];
  /** Whether this quiz offers an improvement sitting at all. */
  allowsImprovement: boolean;
  sumMarks: number;
  improvementSumMarks: number;
  /**
   * The question bank's categories, fetched by the page and passed down.
   *
   * `NewQuestionDialog` embeds the bank's own editor, and that editor requires
   * a category — fetching them from inside a dialog would mean an empty select
   * for as long as the request took, on a form the instructor is already
   * typing into.
   */
  categories: { id: string; name: string }[];
}

/**
 * The two papers of a course exam, as two editable lists behind one switcher.
 *
 * ## Why tabs and not two stacked sections
 *
 * An improvement paper is built by comparing it against the original — "did I
 * already use that question?" is the instructor's constant question, and the
 * publish guard refuses the exam outright if the answer is yes. Two lists
 * stacked down one page means scrolling between them; two tabs means one is
 * always the one you are editing, and the other's count sits on its tab.
 *
 * ## Why it renders nothing when improvement is off
 *
 * A quiz with one paper has no papers, it has questions — a switcher with a
 * single disabled tab is chrome that explains itself and nothing else. Every
 * lecture quiz therefore looks exactly as it did before, and the second tab
 * appears only once an instructor turns the improvement toggle on.
 *
 * ## State
 *
 * `paper` is local component state, deliberately not a URL param. Switching
 * tabs is not a destination — the page it belongs to is the quiz builder, and
 * putting the tab in the URL would make the browser Back button undo a tab
 * switch instead of leaving the builder.
 */
export function PaperTabs({
  quizId,
  slots,
  allowsImprovement,
  sumMarks,
  improvementSumMarks,
  categories,
}: PaperTabsProps) {
  const [paper, setPaper] = useState<QuizPaper>('original');

  const active = allowsImprovement ? paper : 'original';
  const shown = slots.filter((slot) => slot.paper === active);
  const marks = active === 'improvement' ? improvementSumMarks : sumMarks;

  function countFor(target: QuizPaper): number {
    return slots.filter((slot) => slot.paper === target).length;
  }

  return (
    <section>
      {allowsImprovement ? (
        <div className="mb-3">
          <p className="mb-2 text-[length:var(--fs-text-sm)] text-fg-muted">{c.paperSwitchLabel}</p>
          <div className="review-filter" role="group" aria-label={c.paperSwitchLabel}>
            {QUIZ_PAPERS.map((value) => (
              <button
                key={value}
                type="button"
                className="review-filter__option"
                aria-pressed={active === value}
                onClick={() => setPaper(value)}
              >
                {c.papers[value]}
                <span className="mono text-[length:var(--fs-mono-label)]">{countFor(value)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-[length:var(--fs-title-4)] font-semibold">
          {allowsImprovement ? c.papers[active] : c.slots}
        </h2>
        {/* «اكتب سؤال جديد» first, and it is the primary one. The two beside
            it both draw from the question bank, which is empty until somebody
            has written something — so on a new exam they are the two buttons
            that cannot help. `flex-wrap` because three buttons and a heading do
            not share a phone's row. */}
        <div className="flex flex-wrap gap-2">
          <NewQuestionDialog quizId={quizId} paper={active} categories={categories} />
          <AddSlotDialog quizId={quizId} paper={active} />
          <AddPoolDialog quizId={quizId} paper={active} />
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-fg-muted">
          {/*
            The improvement paper's empty state says something different on
            purpose: an empty original is simply unfinished, whereas an empty
            improvement paper is the exact state `publish()` refuses, and
            saying so here is cheaper than discovering it at the end.
          */}
          {active === 'improvement' ? c.paperEmpty : c.slotsEmpty}
        </p>
      ) : (
        <>
          <p className="mb-2 mono text-[length:var(--fs-mono-label)] text-fg-muted">
            {formatCopy(c.paperCount, { n: shown.length, marks })}
          </p>
          {/* Keyed by paper as well as membership: switching tabs replaces the
              whole list, and a reused `SortableList` would carry the other
              paper's debounced order across with it. */}
          <RemovableSlotList
            key={active}
            quizId={quizId}
            slots={shown}
            paper={active}
            categories={categories}
          />
        </>
      )}
    </section>
  );
}
