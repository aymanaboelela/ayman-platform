'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, ChevronDown, ClipboardList, Layers, ListChecks, Lock, Play } from 'lucide-react';
import { arabicCount } from '@ayman/contracts/arabic-count';
import { quizExperience } from '@ayman/contracts/copy/quiz-experience';
import { formatCopy } from '@ayman/contracts/format';
import type { StudentExternalBookDetail } from '@ayman/contracts/quiz/external-books';
import { PracticeStartDialog } from './practice-start-dialog';

const x = quizExperience.books;
const n = quizExperience.counts;

interface ExternalBookDetailViewProps {
  book: StudentExternalBookDetail;
  courseSlug: string;
}

interface ActiveDialogState {
  scope: 'book' | 'unit' | 'lesson';
  scopeId: string;
  scopeTitle: string;
  availableCount: number;
}

/**
 * A question book's own page: what it is, and a practice on any part of it.
 *
 * Built from the study surface's objects rather than a page of its own —
 * `.stage` for the book (what it is, how big it is, the one action), `.unit`
 * per unit as a real `<details>` (keyboard and no-JS for free, the same
 * element the course outline uses), and `.lesson-row` per lesson ending in its
 * chip. The redesign drew all of this from scratch in Tailwind, in Modern
 * Standard Arabic, with «امتحن على الدرس» — a masculine imperative — on every
 * row, «4 وحدات» / «12 دروس» counts, and a second «أسئلة عامة» practice per
 * unit that drew from exactly the same pool as the unit's own (the API has no
 * unit-only scope), under a count that said otherwise.
 */
export function ExternalBookDetailView({ book, courseSlug }: ExternalBookDetailViewProps) {
  const [dialog, setDialog] = useState<ActiveDialogState | null>(null);

  function openPractice(state: ActiveDialogState) {
    if (state.availableCount > 0) setDialog(state);
  }

  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-4 py-8 md:px-6 md:py-10">
      <header className="stage mb-8">
        <div className="stage__body">
          <Link href={`/library/${encodeURIComponent(courseSlug)}`} className="stage__back">
            <ArrowRight className="size-4" aria-hidden="true" />
            {x.backToCourse}
          </Link>
          <p className="stage__eyebrow mt-4">{formatCopy(x.eyebrowCourse, { label: x.eyebrow, course: book.courseTitle })}</p>
          <h1 className="stage__title">{book.title}</h1>
          <p className="stage__sub">{x.lead}</p>
          <div className="stage__facts">
            <span className="stage__fact">
              <ClipboardList className="size-4" aria-hidden="true" />
              {arabicCount(book.totalReady, x.questionsReady)}
            </span>
            <span className="stage__fact">
              <Layers className="size-4" aria-hidden="true" />
              {arabicCount(book.units.length, n.units)}
            </span>
          </div>
          <div className="exam-stage__action">
            {book.totalReady > 0 ? (
              <button
                type="button"
                className="chip chip--solid"
                onClick={() =>
                  openPractice({
                    scope: 'book',
                    scopeId: book.id,
                    scopeTitle: book.title,
                    availableCount: book.totalReady,
                  })
                }
              >
                <Play className="size-4 rtl:-scale-x-100" aria-hidden="true" />
                {x.wholeBook}
              </button>
            ) : (
              <p className="exam-stage__blocked">{x.noQuestionsYet}</p>
            )}
          </div>
        </div>
      </header>

      <section>
        <div className="group-head">
          <span className="group-head__mark" aria-hidden="true" />
          <h2 className="group-head__title">{x.contentsTitle}</h2>
        </div>
        {/* Under the heading, not beside it: at 390px the two shared one row
            and the title broke over two lines. */}
        <p className="-mt-2 mb-4 text-[length:var(--fs-text-sm)] text-fg-muted">{x.contentsHint}</p>

        {book.units.length === 0 ? (
          <div className="empty">
            <p className="empty__title">{x.emptyBook}</p>
          </div>
        ) : (
          book.units.map((unit, index) => (
            // The first unit open, like the course outline's current section:
            // the page should start with something to press on screen.
            <details key={unit.id} className="unit" open={index === 0}>
              <summary className="unit__head">
                <h3 className="unit__title">
                  {unit.name}
                  <span className="unit__sub">
                    {formatCopy(x.unitMeta, {
                      lessons: arabicCount(unit.lessons.length, n.lessons),
                      questions: arabicCount(unit.totalReady, x.questionsReady),
                    })}
                  </span>
                </h3>
                <ChevronDown size={18} aria-hidden="true" className="unit__chevron" />
              </summary>

              <ul className="unit__body">
                {unit.totalReady === 0 ? (
                  <li className="lesson-row lesson-row--locked">
                    <span className="lesson-row__well" aria-hidden="true">
                      <Lock className="size-4" />
                    </span>
                    <span className="lesson-row__text">
                      <span className="lesson-row__title">{x.emptyUnit}</span>
                    </span>
                  </li>
                ) : (
                  <PracticeRow
                    icon={<ListChecks className="size-4" />}
                    title={x.unitPractice}
                    meta={arabicCount(unit.totalReady, x.questionsReady)}
                    ready={unit.totalReady}
                    onStart={() =>
                      openPractice({
                        scope: 'unit',
                        scopeId: unit.id,
                        scopeTitle: unit.name,
                        availableCount: unit.totalReady,
                      })
                    }
                  />
                )}
                {unit.lessons.map((lesson) => (
                  <PracticeRow
                    key={lesson.id}
                    icon={<BookOpen className="size-4" />}
                    title={lesson.name}
                    meta={lesson.ready > 0 ? arabicCount(lesson.ready, x.questionsReady) : x.noQuestionsYet}
                    ready={lesson.ready}
                    onStart={() =>
                      openPractice({
                        scope: 'lesson',
                        scopeId: lesson.id,
                        scopeTitle: lesson.name,
                        availableCount: lesson.ready,
                      })
                    }
                  />
                ))}
              </ul>
            </details>
          ))
        )}
      </section>

      {dialog ? (
        <PracticeStartDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          bookId={book.id}
          courseSlug={courseSlug}
          scope={dialog.scope}
          scopeId={dialog.scopeId}
          scopeTitle={dialog.scopeTitle}
          availableCount={dialog.availableCount}
        />
      ) : null}
    </main>
  );
}

/**
 * One thing to practise: a lesson, or a whole unit. The study surface's
 * row with its chip at the inline end — solid amber when there is something
 * to start, the locked chip when the bank is still empty, so the row says why
 * it cannot be pressed instead of being a dead button.
 */
function PracticeRow({
  icon,
  title,
  meta,
  ready,
  onStart,
}: {
  icon: React.ReactNode;
  title: string;
  meta: string;
  ready: number;
  onStart: () => void;
}) {
  const open = ready > 0;
  return (
    <li className={`lesson-row${open ? '' : ' lesson-row--locked'}`}>
      <span className="lesson-row__well" aria-hidden="true">
        {icon}
      </span>
      <span className="lesson-row__text">
        <span className="lesson-row__title">{title}</span>
        <span className="lesson-row__meta">{meta}</span>
      </span>
      {open ? (
        <button type="button" className="chip chip--solid" onClick={onStart} aria-label={formatCopy(x.lessonPracticeLabel, { title })}>
          <Play className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
          {x.lessonPractice}
        </button>
      ) : (
        <span className="chip chip--locked">{x.noQuestionsYet}</span>
      )}
    </li>
  );
}
