import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClipboardList, Clock, Repeat2, Target, Trophy } from 'lucide-react';
import {
  QuizOverviewSchema,
  copy,
  formatCopy,
  type AttemptHistoryRow,
  type BlockedReason,
  type QuizOverview,
} from '@ayman/contracts';
import { ApiRequestError } from '@/lib/api';
import { apiGetAuthed } from '@/lib/api-server';
import { attemptHref, reviewHref } from '@/lib/quiz-links';
import { StartAttemptButton } from '@/components/quiz/start-attempt-button';

/*
 * The response shape used to be re-declared here as a local Zod object, field
 * for field, while `@ayman/contracts/quiz/overview` already exported exactly
 * it. Two copies of a wire contract drift the moment one side adds a field —
 * the local copy would keep parsing and silently strip it. There is now one.
 */

const c = copy.quiz;

const BLOCKED_COPY: Record<BlockedReason['code'], string> = {
  quiz_not_open_yet: c.notOpenYet,
  quiz_closed: c.closed,
  no_attempts_left: c.noAttemptsLeft,
};

export const metadata = { title: c.resultsTitle };

/**
 * The screen a student meets an exam on.
 *
 * ## What it has to answer, in order
 *
 * "What is this, how big is it, how long have I got" — then, and only then,
 * "what do I press". The previous version answered all four at the same
 * weight: five identical grey `<p>` stats in a card, a list of inert attempt
 * rows, and a button of the same visual weight as everything else. Nothing on
 * the page told a student whether they were about to sit their one graded
 * paper or look at an old one.
 *
 * So the page is now three objects with three different jobs:
 *
 *   `.stage`     — what this is, and its one action. Violet, per `study.css`:
 *                  the band is structure and the amber chip inside it is the
 *                  only thing on the screen you press.
 *   `.exam-facts`— the four numbers, as tiles with their own icon wells, so
 *                  "20 سؤال" and "٣٠ دقيقة" are scannable rather than prose.
 *   attempt rows — what already happened, each one a link to its own review,
 *                  with the counting sitting marked.
 *
 * ## Why the figures describe ONE paper
 *
 * `questionCount` and `sumMarks` come from the server already scoped to
 * `nextPaper` — the paper about to be sat. Summing both papers of an
 * improvable exam would tell a student facing a 10-question original that it
 * has 20 questions and is marked out of double.
 *
 * Not cached: attempt state and open windows must always be fresh.
 */
export default async function QuizIntroPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;

  let overview: QuizOverview;
  try {
    overview = await apiGetAuthed(`/api/quiz/lessons/${lessonId}`, QuizOverviewSchema);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }

  const improving = overview.nextPaper === 'improvement';
  const minutes = overview.durationSeconds ? Math.round(overview.durationSeconds / 60) : null;

  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-4 py-8 md:px-6 md:py-10">
      <header className="stage mb-6">
        <div className="stage__body">
          <p className="stage__eyebrow">
            {overview.allowsImprovement ? c.papers[overview.nextPaper ?? 'original'] : c.resultsTitle}
          </p>
          <h1 className="stage__title">{improving ? c.improveExam : c.start}</h1>
          <p className="stage__sub">{improving ? copy.examGate.improveIntro : c.hint}</p>

          <div className="exam-stage__action">
            {overview.inProgressAttemptId ? (
              <Link
                href={attemptHref(lessonId, overview.inProgressAttemptId)}
                className="chip chip--solid"
              >
                {c.resume}
              </Link>
            ) : overview.blocked ? (
              <p className="exam-stage__blocked">{BLOCKED_COPY[overview.blocked.code]}</p>
            ) : overview.nextPaper ? (
              <StartAttemptButton
                lessonId={lessonId}
                quizId={overview.quizId}
                paper={overview.nextPaper}
                allowsImprovement={overview.allowsImprovement}
                durationSeconds={overview.durationSeconds}
              />
            ) : null}
          </div>
        </div>
      </header>

      <section className="exam-facts mb-8">
        <Fact
          icon={<ClipboardList className="size-[1.125rem]" />}
          value={String(overview.questionCount)}
          label={formatCopy(c.questionCount, { n: overview.questionCount })}
        />
        <Fact
          icon={<Target className="size-[1.125rem]" />}
          value={String(overview.sumMarks)}
          label={formatCopy(c.totalMarks, { marks: overview.sumMarks })}
        />
        <Fact
          icon={<Clock className="size-[1.125rem]" />}
          value={minutes === null ? '—' : String(minutes)}
          label={minutes === null ? c.noTimeLimit : formatCopy(c.duration, { minutes })}
        />
        <Fact
          icon={<Repeat2 className="size-[1.125rem]" />}
          value={overview.allowsImprovement ? '٢' : '١'}
          label={overview.allowsImprovement ? c.twoAttempts : c.singleAttempt}
        />
      </section>

      {overview.attempts.length > 0 ? (
        <section>
          <div className="group-head">
            <span className="group-head__mark" aria-hidden="true" />
            <h2 className="group-head__title">{c.previousAttempts}</h2>
            {overview.bestScore !== null ? (
              <span className="group-head__count">
                {c.bestScore} {overview.bestScore}
              </span>
            ) : null}
          </div>

          <ul className="space-y-2">
            {overview.attempts.map((attempt) => (
              <li key={attempt.id}>
                <AttemptRow
                  attempt={attempt}
                  lessonId={lessonId}
                  gradeOutOf={overview.gradeOutOf}
                  showPaper={overview.allowsImprovement}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

function Fact({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="exam-fact">
      <span className="exam-fact__well" aria-hidden="true">
        {icon}
      </span>
      <span className="exam-fact__value">{value}</span>
      <span className="exam-fact__label">{label}</span>
    </div>
  );
}

/**
 * One past sitting.
 *
 * The whole row is a link to its own review — the review route resolves the
 * quiz's 4×7 matrix SERVER-SIDE and renders `<ReviewLocked>` when the window
 * forbids it, so following this can never leak an answer and never dead-ends.
 * `in_progress` is the one exception: that sitting is still running, and its
 * destination is the runner.
 *
 * `counts` is rendered as a badge rather than inferred here by comparing
 * scores. The server decides which sitting is the student's grade — a
 * client-side `Math.max` would disagree with it the moment one paper is still
 * awaiting marking with a null score.
 */
function AttemptRow({
  attempt,
  lessonId,
  gradeOutOf,
  showPaper,
}: {
  attempt: AttemptHistoryRow;
  lessonId: string;
  gradeOutOf: number;
  showPaper: boolean;
}) {
  const running = attempt.state === 'in_progress';

  return (
    <div className={`attempt-row${attempt.counts ? ' attempt-row--counts' : ''}`}>
      <span className="attempt-row__well" aria-hidden="true">
        {attempt.counts ? <Trophy className="size-[1.125rem]" /> : <ClipboardList className="size-[1.125rem]" />}
      </span>

      <span className="attempt-row__text">
        <Link
          href={running ? attemptHref(lessonId, attempt.id) : reviewHref(lessonId, attempt.id)}
          className="attempt-row__title after:absolute after:inset-0 after:content-['']"
        >
          {showPaper ? c.papers[attempt.paper] : formatCopy(c.attemptNo, { n: attempt.attemptNo })}
        </Link>
        <span className="attempt-row__meta">
          {attempt.scaledScore === null
            ? c.essayPending
            : formatCopy(c.marksEarned, { earned: attempt.scaledScore, max: gradeOutOf })}
          {attempt.counts ? ` · ${c.counts}` : ''}
        </span>
      </span>

      {attempt.passed !== null ? (
        <span className={`verdict verdict--${attempt.passed ? 'pass' : 'fail'}`}>
          {attempt.passed ? c.passed : c.failed}
        </span>
      ) : null}

      <span className="chip chip--quiet">{running ? c.resume : c.reviewAnswers}</span>
    </div>
  );
}
