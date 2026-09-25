import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ListChecks, Target, Timer } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { LessonProgressDto } from '@ayman/contracts/progress';
import { quizHref } from '@/lib/quiz-links';
import { QuizIcon } from './icons';
import './player-cards.css';

/** What the doorway can say about the paper before it is opened. Every field
 *  is optional — an older API sends none of them, and the card then simply
 *  has no facts row. */
export interface QuizFacts {
  questionCount?: number;
  /** `null` = untimed. */
  durationSeconds?: number | null;
  passPercent?: number;
}

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
  /**
   * `'exam'` (default): the lesson IS the quiz — `kind === 'quiz'`.
   * `'attached'`: a bonus quiz hanging off a lesson of another kind (a video
   * lecture, say). Same engine, same route, same score — only the copy
   * changes, because "الدرس ده اختبار" and "والدرس اتقفل" are both false
   * statements about a video lesson that merely carries a quiz alongside it.
   */
  variant?: 'exam' | 'attached';
  /** `LessonPlayer.quiz` — the question count, the time limit and the pass
   *  mark, printed as chips under the band. */
  facts?: QuizFacts | null;
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
export function QuizLesson({ lessonId, progress, variant = 'exam', facts = null }: QuizLessonProps) {
  const c = copy.player;
  const isAttached = variant === 'attached';

  // `passed`/`failed` are written only by the grader, so either one means the
  // exam has actually been sat. `completed` is not in this set on purpose: a
  // quiz lesson can no longer reach it (`completeManually` refuses one now),
  // and a historic row that holds it carries no score worth printing.
  const sat = progress.state === 'passed' || progress.state === 'failed';
  const passed = progress.state === 'passed';
  // Rounded for display only — `completion` is the stored fraction and stays
  // the source of truth for every percentage this platform prints.
  const percent = Math.round(progress.completion * 100);

  const chips = factChips(facts);

  return (
    <section
      className="qz-door"
      data-state={sat ? (passed ? 'passed' : 'sat') : 'fresh'}
      aria-label={isAttached ? c.quizAttachedEyebrow : c.quizEyebrow}
    >
      {/* The band. It was a grey card with a 24px question-mark and one line
          of muted text — «حط صورة وألوان، خلي الدنيا فيها روح». The picture
          and the colour are what say «ده امتحان» before a word is read. */}
      <div className="qz-door__band">
        <div className="qz-door__text">
          <span className="qz-door__eyebrow">
            <QuizIcon className="size-4" />
            {isAttached ? c.quizAttachedEyebrow : c.quizEyebrow}
          </span>

          {sat ? (
            <div className="qz-door__score">
              <p className="qz-door__score-label">{c.quizYourScore}</p>
              <div className="flex flex-wrap items-center gap-3">
                {/* The number first and largest: it is what the student opened
                    this lesson to find. `tabular` so a 9% and a 100% do not
                    shift the row they sit in. */}
                <span className="qz-door__percent mono tabular">{percent}%</span>

                {/* The PASS verdict only, for the reason `ExamsSection`
                    records: «محتاج تحاول تاني» in red is a label on the
                    student rather than information for them, and the score
                    beside it plus the sentence below have already said it. */}
                {passed ? <span className="verdict verdict--pass">{copy.quiz.passed}</span> : null}
              </div>
              <p className="qz-door__lead">
                {passed ? (isAttached ? c.quizAttachedPassedNote : c.quizPassedNote) : c.quizFailedNote}
              </p>
            </div>
          ) : (
            <>
              <h2 className="qz-door__title">{isAttached ? c.quizAttachedReadyTitle : c.quizReadyTitle}</h2>
              <p className="qz-door__lead">{isAttached ? c.quizAttachedIntro : c.quizIntro}</p>
            </>
          )}
        </div>

        <QuizArt passed={passed} />
      </div>

      {chips.length > 0 ? (
        <ul className="qz-door__facts">
          {chips.map((chip) => (
            <li key={chip.key} className="qz-door__fact" data-fact={chip.key}>
              {chip.icon}
              {chip.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="qz-door__foot">
        {/*
          One link, two jobs. `/quizzes/[lessonId]` is the quiz's own page and
          it already resolves what is actually available to this student —
          resume a running attempt, sit an improvement paper, or review a spent
          one. Deciding that a second time here would be the same rules in two
          places, and the copy is the only part that needs to differ.

          A link, not `<Button>`: that one has no `asChild`, and a `<button>`
          inside an `<a>` is invalid HTML with two interactive elements.
        */}
        <Link href={quizHref(lessonId)} className="qz-door__cta">
          {sat
            ? isAttached
              ? c.quizAttachedOpenCta
              : c.quizOpenCta
            : isAttached
              ? c.quizAttachedCta
              : c.quizCta}
          <ArrowLeft className="size-[18px]" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

/** The facts the paper carries, as chips. Each one is dropped when the API
 *  did not say — a chip reading «0 سؤال» would be a number that failed to
 *  load, not a fact. */
function factChips(facts: QuizFacts | null) {
  const c = copy.player;
  const chips: { key: string; icon: ReactNode; label: string }[] = [];
  if (!facts) return chips;

  if (facts.questionCount !== undefined && facts.questionCount > 0) {
    chips.push({
      key: 'questions',
      icon: <ListChecks className="size-4" aria-hidden="true" />,
      label: formatCopy(c.quizFactQuestions, { count: facts.questionCount }),
    });
  }
  if (facts.durationSeconds !== undefined) {
    chips.push({
      key: 'time',
      icon: <Timer className="size-4" aria-hidden="true" />,
      label:
        facts.durationSeconds === null
          ? c.quizFactUntimed
          : formatCopy(c.quizFactMinutes, { count: Math.max(1, Math.round(facts.durationSeconds / 60)) }),
    });
  }
  if (facts.passPercent !== undefined) {
    chips.push({
      key: 'pass',
      icon: <Target className="size-4" aria-hidden="true" />,
      label: formatCopy(c.quizFactPass, { percent: Math.round(facts.passPercent) }),
    });
  }
  return chips;
}

/**
 * An answer sheet with ticked bubbles, a pencil across it and a stopwatch at
 * its corner — or a medal once the exam is passed. Colours are classes, so
 * both themes and every tenant's hue come from the tokens.
 */
function QuizArt({ passed }: { passed: boolean }) {
  return (
    <svg className="qz-door__art" viewBox="0 0 170 130" aria-hidden="true" focusable="false">
      <ellipse cx="86" cy="120" rx="60" ry="6" className="qz-art__shadow" />
      <g transform="rotate(-6 80 66)">
        <rect x="34" y="12" width="92" height="106" rx="12" className="qz-art__sheet" />
        <rect x="34" y="12" width="92" height="20" rx="10" className="qz-art__head" />
        <rect x="34" y="22" width="92" height="10" className="qz-art__head" />
        {[0, 1, 2, 3].map((row) => (
          <g key={row} transform={`translate(0 ${44 + row * 18})`}>
            <circle cx="50" cy="0" r="5" className={row === 3 ? 'qz-art__bubble' : 'qz-art__bubble qz-art__bubble--on'} />
            <rect x="62" y="-3" width={row % 2 === 0 ? 48 : 36} height="6" rx="3" className="qz-art__line" />
          </g>
        ))}
      </g>
      {/* the pencil */}
      <g transform="translate(112 70) rotate(40)">
        <rect x="0" y="-5" width="46" height="10" rx="2" className="qz-art__pencil" />
        <rect x="-8" y="-5" width="9" height="10" rx="2" className="qz-art__eraser" />
        <path d="M46 -5 L58 0 L46 5 Z" className="qz-art__tip" />
      </g>
      {passed ? (
        <g transform="translate(132 30)">
          <path d="M-8 10 L-12 30 L0 24 L12 30 L8 10 Z" className="qz-art__ribbon" />
          <circle r="16" className="qz-art__medal" />
          <path d="M-6 0 l4 5 l9 -10" className="qz-art__medal-tick" />
        </g>
      ) : (
        <g transform="translate(134 32)">
          <rect x="-4" y="-22" width="8" height="6" rx="2" className="qz-art__watch-cap" />
          <circle r="17" className="qz-art__watch" />
          <circle r="12" className="qz-art__watch-face" />
          <path d="M0 0 V-8 M0 0 L6 4" className="qz-art__watch-hand" />
        </g>
      )}
      <circle cx="22" cy="30" r="3.5" className="qz-art__spark" />
      <circle cx="160" cy="90" r="3" className="qz-art__spark qz-art__spark--b" />
      <path d="M20 96 l3 -7 l3 7 l-3 7 z" className="qz-art__spark qz-art__spark--b" />
    </svg>
  );
}
