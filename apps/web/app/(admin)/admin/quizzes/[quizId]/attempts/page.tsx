import Link from 'next/link';
import { z } from 'zod';
import { formatCopy } from '@ayman/contracts';
import { copy } from '@ayman/contracts/copy/admin';
import { Badge, Card, CardBody } from '@ayman/ui';
import { apiGetAuthed } from '@/lib/api-server';
import { AttemptActions } from '@/components/admin/quiz/attempt-actions';

const AdminAttemptRowSchema = z.object({
  id: z.string(),
  userId: z.string(),
  studentName: z.string(),
  quizId: z.string(),
  quizTitle: z.string(),
  attemptNumber: z.number(),
  state: z.enum(['in_progress', 'overdue', 'submitted', 'pending_review', 'abandoned']),
  score: z.number().nullable(),
  startedAt: z.string(),
  submittedAt: z.string().nullable(),
  deadlineAt: z.string().nullable(),
});

const STATE_LABEL = {
  in_progress: copy.quizAdmin.stateInProgress,
  overdue: copy.quizAdmin.stateOverdue,
  submitted: copy.quizAdmin.stateSubmitted,
  pending_review: copy.quizAdmin.statePendingReview,
  abandoned: copy.quizAdmin.stateAbandoned,
} as const;

const STATE_TONE = {
  in_progress: 'accent',
  overdue: 'warn',
  submitted: 'neutral',
  pending_review: 'accent',
  abandoned: 'neutral',
} as const;

export const metadata = { title: copy.quizAdmin.attemptsTitle };

/** Not cached — an instructor acting on a row must see the result immediately. */
export default async function QuizAttemptsPage({
  params,
  searchParams,
}: {
  params: Promise<{ quizId: string }>;
  searchParams: Promise<{ state?: string; q?: string; needsGrading?: string }>;
}) {
  const { quizId } = await params;
  const query = await searchParams;
  const state = query.needsGrading === '1' ? 'pending_review' : query.state;

  const search = new URLSearchParams();
  if (state) search.set('state', state);
  if (query.q) search.set('q', query.q);
  const attempts = await apiGetAuthed(
    `/api/admin/quizzes/${quizId}/attempts?${search}`,
    z.array(AdminAttemptRowSchema),
  );

  return (
    <>
      <h1 className="mb-6 text-[length:var(--fs-title-2)] font-semibold">{copy.quizAdmin.attemptsTitle}</h1>

      <form className="mb-6 flex flex-wrap items-end gap-3" action={`/admin/quizzes/${quizId}/attempts`}>
        <div>
          <label className="mb-1.5 block text-[length:var(--fs-text-sm)] font-medium text-fg" htmlFor="q">
            {copy.quizAdmin.searchStudent}
          </label>
          <input
            id="q"
            name="q"
            defaultValue={query.q ?? ''}
            className="block h-10 rounded-sm border border-line bg-surface-2 px-3 text-fg"
          />
        </div>
        <label className="flex h-10 items-center gap-2 text-[length:var(--fs-text-sm)] text-fg">
          <input type="checkbox" name="needsGrading" value="1" defaultChecked={query.needsGrading === '1'} />
          {copy.quizAdmin.needsGradingOnly}
        </label>
        <button type="submit" className="h-10 rounded-sm bg-accent px-4 font-medium text-[#1A1206]">
          {copy.quizAdmin.search}
        </button>
      </form>

      {attempts.length === 0 ? (
        <p className="text-fg-muted">{copy.common.empty}</p>
      ) : (
        <ul className="space-y-3">
          {attempts.map((attempt) => (
            <li key={attempt.id}>
              <Card>
                <CardBody className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-fg">{attempt.studentName}</p>
                      <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
                        {formatCopy(copy.quiz.attemptNo, { n: attempt.attemptNumber })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {attempt.score !== null ? (
                        <span className="mono tabular-nums text-fg">{attempt.score}</span>
                      ) : null}
                      <Badge tone={STATE_TONE[attempt.state]}>{STATE_LABEL[attempt.state]}</Badge>
                    </div>
                  </div>

                  <AttemptActions
                    attemptId={attempt.id}
                    quizId={attempt.quizId}
                    userId={attempt.userId}
                    canReopen={attempt.state === 'submitted' || attempt.state === 'pending_review'}
                  />
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Link
        href={`/admin/quizzes/${quizId}/analytics`}
        className="mt-6 inline-block text-[length:var(--fs-text-sm)] text-fg-muted underline"
      >
        {copy.quizAdmin.analyticsTitle}
      </Link>
    </>
  );
}
