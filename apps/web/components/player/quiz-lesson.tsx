import Link from 'next/link';
import { copy } from '@ayman/contracts/copy';
import type { LessonProgressDto } from '@ayman/contracts/progress';
import { Card, CardBody } from '@ayman/ui/components/card';
import { cn } from '@ayman/ui/lib/cn';
import { quizHref } from '@/lib/quiz-links';
import { QuizIcon } from './icons';

export interface QuizLessonProps {
  lessonId: string;
  /**
   * The lesson's own progress row — which, for a quiz lesson, IS the result.
   *
   * `recordQuizResultTx` writes the graded outcome straight into it: `state`
   * becomes `passed`/`failed` and `completion` carries the scaled score as a
   * 0..1 fraction (the max across attempts, so it is the BEST score, matching
   * `bestScore` everywhere else). Nothing extra had to be fetched to show a
   * mark here — the player payload was already carrying it.
   */
  progress: LessonProgressDto;
}

/**
 * A quiz lesson in the player is a doorway, not a runner. The attempt lives on
 * its own route with its own timer, `deadline_at` and attempt token — running
 * it inside a page the student can navigate away from mid-attempt would be a
 * design mistake, not a shortcut.
 *
 * ## What it says once the door has been used
 *
 * The doorway used to be all it was: «الدرس ده اختبار — ابدأ لما تكون جاهز»
 * and a button, drawn identically whether the student had never opened the exam
 * or had sat it and scored 27%. Their own mark was on the dashboard, on
 * `/results` and on the quiz's own page — everywhere except the lesson the mark
 * belongs to. So the one screen a student lands on from the course outline was
 * the one screen that would not tell them how they had done.
 *
 * `progress` answers it without a second request (see the prop).
 *
 * `@ayman/ui`'s `Button` has no `asChild` prop, so the primary-button look is
 * applied directly to the `Link` rather than nesting a `<button>` inside an
 * `<a>` (invalid HTML, and two nested interactive elements).
 */
export function QuizLesson({ lessonId, progress }: QuizLessonProps) {
  const c = copy.player;

  // `passed`/`failed` are written only by the grader, so either one means the
  // exam has actually been sat. `completed` is not in this set on purpose: a
  // quiz lesson can no longer reach it (`completeManually` refuses one now),
  // and a historic row that holds it carries no score worth printing.
  const sat = progress.state === 'passed' || progress.state === 'failed';
  const passed = progress.state === 'passed';
  // Rounded for display only — `completion` is the stored fraction and stays
  // the source of truth for every percentage this platform prints.
  const percent = Math.round(progress.completion * 100);

  return (
    <Card>
      <CardBody className="flex flex-col items-start gap-4">
        <QuizIcon className="h-6 w-6 text-accent" />

        {sat ? (
          <div className="flex flex-col gap-2">
            <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.quizYourScore}</p>

            <div className="flex flex-wrap items-center gap-3">
              {/* The number first and largest: it is what the student opened
                  this lesson to find. `tabular` so a 9% and a 100% do not
                  shift the row they sit in. */}
              <span className="mono tabular text-[length:var(--fs-title-2)] font-semibold text-fg">
                {percent}%
              </span>

              {/* The verdict carries its word as well as its hue — the same
                  rule `.verdict` holds everywhere else in the study surface,
                  so nothing here depends on telling green from red. */}
              <span className={`verdict verdict--${passed ? 'pass' : 'fail'}`}>
                {passed ? copy.quiz.passed : copy.quiz.failed}
              </span>
            </div>

            <p className="max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] text-fg-muted">
              {passed ? c.quizPassedNote : c.quizFailedNote}
            </p>
          </div>
        ) : (
          <p className="max-w-[var(--w-prose)] text-fg-muted">{c.quizIntro}</p>
        )}

        {/*
          One link, two jobs. `/quizzes/[lessonId]` is the quiz's own page and
          it already resolves what is actually available to this student —
          resume a running attempt, sit an improvement paper, or review a spent
          one. Deciding that a second time here would be the same rules in two
          places, and the copy is the only part that needs to differ.
        */}
        <Link
          href={quizHref(lessonId)}
          className={cn(
            'inline-flex h-10 items-center justify-center gap-2 rounded-sm px-4',
            'text-[length:var(--fs-text-base)] font-medium',
            'bg-accent text-[#1A1206] transition-colors duration-[var(--d-hover)] ease-[var(--ease)] hover:bg-accent-hover',
          )}
        >
          {sat ? c.quizOpenCta : c.quizCta}
        </Link>
      </CardBody>
    </Card>
  );
}
