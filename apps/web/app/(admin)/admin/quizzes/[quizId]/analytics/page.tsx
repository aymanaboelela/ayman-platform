import { z } from 'zod';
import { formatCopy } from '@ayman/contracts';
import { copy } from '@ayman/contracts/copy/admin';
import { Card, CardBody } from '@ayman/ui';
import { apiGetAuthed, apiGetAuthedOrNotFound } from '@/lib/api-server';
import { ItemAnalysisTable } from '@/components/admin/quiz/item-analysis-table';
import { ScoreHistogram } from '@/components/admin/quiz/score-histogram';

const AnalyticsSchema = z.object({
  quizId: z.string(),
  attemptCount: z.number(),
  meanScore: z.number().nullable(),
  medianScore: z.number().nullable(),
  passRate: z.number().nullable(),
  distribution: z.array(z.object({ bucket: z.number(), n: z.number() })),
  items: z.array(
    z.object({
      questionVersionId: z.string(),
      stemHtml: z.string(),
      n: z.number(),
      facility: z.number().nullable(),
      discrimination: z.number().nullable(),
      distractors: z.array(
        z.object({ optionId: z.string(), bodyHtml: z.string(), fraction: z.number(), picks: z.number() }),
      ),
    }),
  ),
});

export const metadata = { title: copy.quizAdmin.analyticsTitle };

/** Not cached — an instructor checking analytics right after a batch of
 *  students submit must see fresh numbers. */
export default async function QuizAnalyticsPage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const analytics = await apiGetAuthedOrNotFound(`/api/admin/quizzes/${quizId}/analytics`, AnalyticsSchema);

  if (analytics.attemptCount === 0) {
    return (
      <>
        <h1 className="mb-6 text-[length:var(--fs-title-2)] font-semibold">{copy.quizAdmin.analyticsTitle}</h1>
        <div className="rounded-lg border border-line bg-surface-2 p-10 text-center font-mono text-fg-muted">
          {copy.common.empty}
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-[length:var(--fs-title-2)] font-semibold">{copy.quizAdmin.analyticsTitle}</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardBody>
            <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{copy.quizAdmin.attemptsTitle}</p>
            <p className="mono text-[length:var(--fs-title-3)] tabular-nums text-fg">
              {formatCopy(copy.quizAdmin.attemptCount, { n: analytics.attemptCount })}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{copy.quizAdmin.averageScore}</p>
            <p className="mono text-[length:var(--fs-title-3)] tabular-nums text-fg">
              {analytics.meanScore === null ? '—' : analytics.meanScore.toFixed(1)}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{copy.quizAdmin.medianScore}</p>
            <p className="mono text-[length:var(--fs-title-3)] tabular-nums text-fg">
              {analytics.medianScore === null ? '—' : analytics.medianScore.toFixed(1)}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{copy.quizAdmin.passRate}</p>
            <p className="mono text-[length:var(--fs-title-3)] tabular-nums text-fg">
              {analytics.passRate === null ? '—' : `${Math.round(analytics.passRate * 100)}%`}
            </p>
          </CardBody>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 text-[length:var(--fs-title-4)] font-semibold">{copy.quizAdmin.scoreDistribution}</h2>
        <ScoreHistogram distribution={analytics.distribution} />
      </section>

      <section>
        <h2 className="mb-3 text-[length:var(--fs-title-4)] font-semibold">{copy.quizAdmin.distractorAnalysis}</h2>
        <ItemAnalysisTable items={analytics.items} />
      </section>
    </div>
  );
}
