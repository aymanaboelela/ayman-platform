import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { copy, formatCopy } from '@ayman/contracts';
import { Badge, Card, CardBody } from '@ayman/ui';
import { ApiRequestError } from '@/lib/api';
import { apiGetAuthed } from '@/lib/api-server';
import { attemptHref } from '@/lib/quiz-links';
import { StartAttemptButton } from '@/components/quiz/start-attempt-button';

const AttemptRowSchema = z.object({
  id: z.string(),
  attemptNo: z.number(),
  state: z.enum(['in_progress', 'overdue', 'submitted', 'pending_review', 'abandoned']),
  submittedAt: z.string().nullable(),
  scaledScore: z.number().nullable(),
  passed: z.boolean().nullable(),
});

const QuizOverviewSchema = z.object({
  quizId: z.string(),
  lessonId: z.string(),
  mode: z.enum(['practice', 'graded']),
  questionCount: z.number(),
  sumMarks: z.number(),
  gradeOutOf: z.number(),
  durationSeconds: z.number().nullable(),
  maxAttempts: z.number(),
  passPercent: z.number(),
  attemptsUsed: z.number(),
  attemptsRemaining: z.number().nullable(),
  inProgressAttemptId: z.string().nullable(),
  blocked: z
    .object({
      code: z.enum(['quiz_not_open_yet', 'quiz_closed', 'no_attempts_left', 'retry_cooldown']),
      availableAt: z.string().nullable(),
    })
    .nullable(),
  attempts: z.array(AttemptRowSchema),
});

const BLOCKED_COPY: Record<'quiz_not_open_yet' | 'quiz_closed' | 'no_attempts_left', string> = {
  quiz_not_open_yet: copy.quiz.notOpenYet,
  quiz_closed: copy.quiz.closed,
  no_attempts_left: copy.quiz.noAttemptsLeft,
};

/**
 * `retry_cooldown` is the one `BLOCKED_COPY` entry with a placeholder
 * (`{hours}`) — it needs `overview.blocked.availableAt` interpolated in,
 * unlike the other three fixed strings, so it is handled separately here
 * rather than folded into the flat lookup above (which would render the
 * literal, un-interpolated `{hours}` token to every rate-limited student).
 */
function describeBlocked(blocked: { code: 'quiz_not_open_yet' | 'quiz_closed' | 'no_attempts_left' | 'retry_cooldown'; availableAt: string | null }): string {
  if (blocked.code !== 'retry_cooldown') return BLOCKED_COPY[blocked.code];
  const hours = blocked.availableAt
    ? Math.max(1, Math.ceil((new Date(blocked.availableAt).getTime() - Date.now()) / (60 * 60 * 1000)))
    : 0;
  return formatCopy(copy.quiz.cooldown, { hours });
}

export const metadata = { title: copy.quiz.resultsTitle };

/** Not cached — attempt counts and blocked windows must always be fresh. */
export default async function QuizIntroPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;

  let overview: z.infer<typeof QuizOverviewSchema>;
  try {
    overview = await apiGetAuthed(`/api/quiz/lessons/${lessonId}`, QuizOverviewSchema);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }

  return (
    <main className="mx-auto max-w-[var(--w-prose)] px-6 py-10">
      <div className="mb-6 flex items-center gap-3">
        <Badge tone="accent">{copy.quiz.modes[overview.mode]}</Badge>
        <h1 className="text-[length:var(--fs-title-2)] font-semibold">{copy.quiz.resultsTitle}</h1>
      </div>
      <p className="mb-6 text-fg-muted">
        {overview.mode === 'practice' ? copy.quiz.practiceHint : copy.quiz.gradedHint}
      </p>

      <Card className="mb-6">
        <CardBody className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label={formatCopy(copy.quiz.questionCount, { n: overview.questionCount })} />
          <Stat label={formatCopy(copy.quiz.totalMarks, { marks: overview.sumMarks })} />
          <Stat
            label={
              overview.durationSeconds
                ? formatCopy(copy.quiz.duration, { minutes: Math.round(overview.durationSeconds / 60) })
                : copy.quiz.noTimeLimit
            }
          />
          <Stat
            label={
              overview.maxAttempts === 0
                ? copy.quiz.unlimitedAttempts
                : formatCopy(copy.quiz.attemptsLeft, { n: overview.attemptsRemaining ?? 0 })
            }
          />
          <Stat label={formatCopy(copy.quiz.passMark, { percent: overview.passPercent })} />
        </CardBody>
      </Card>

      {overview.attempts.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-2 text-[length:var(--fs-title-4)] font-semibold">{copy.quiz.previousAttempts}</h2>
          <ul className="space-y-2">
            {overview.attempts.map((attempt) => (
              <li key={attempt.id}>
                <Card>
                  <CardBody className="flex items-center justify-between gap-4">
                    <span className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
                      {formatCopy(copy.quiz.attemptNo, { n: attempt.attemptNo })}
                    </span>
                    {attempt.scaledScore !== null ? (
                      <span className="mono tabular-nums text-fg">
                        {formatCopy(copy.quiz.marksEarned, { earned: attempt.scaledScore, max: overview.gradeOutOf })}
                      </span>
                    ) : (
                      <span className="text-fg-muted">{copy.quiz.essayPending}</span>
                    )}
                    {attempt.passed !== null ? (
                      <Badge tone={attempt.passed ? 'ok' : 'err'}>
                        {attempt.passed ? copy.quiz.passed : copy.quiz.failed}
                      </Badge>
                    ) : null}
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {overview.inProgressAttemptId ? (
        <Link
          href={attemptHref(lessonId, overview.inProgressAttemptId)}
          className="inline-flex h-10 items-center justify-center rounded-sm bg-accent px-4 font-medium text-[#1A1206]"
        >
          {copy.quiz.resume}
        </Link>
      ) : overview.blocked ? (
        <div className="rounded-sm border border-line-subtle bg-surface-2 p-4">
          <p className="mb-1 font-medium text-fg">{copy.quiz.blockedTitle}</p>
          <p className="text-fg-muted">{describeBlocked(overview.blocked)}</p>
        </div>
      ) : (
        <StartAttemptButton lessonId={lessonId} quizId={overview.quizId} />
      )}
    </main>
  );
}

function Stat({ label }: { label: string }) {
  return <p className="text-[length:var(--fs-text-sm)] text-fg">{label}</p>;
}
