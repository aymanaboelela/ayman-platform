import Link from 'next/link';
import type { Metadata } from 'next';
import { Award, ClipboardList, Repeat2, Target } from 'lucide-react';
import { StudentQuizHistorySchema, copy } from '@ayman/contracts';
import { apiGetAuthed } from '@/lib/api-server';
import { SpotIllustration } from '@/components/dashboard/spot-illustration';
import { StatTile } from '@/components/dashboard/stat-tile';
import { QuizResultRow } from '@/components/results/quiz-result-row';
import { ScoreTrend } from '@/components/results/score-trend';

export const metadata: Metadata = { title: copy.results.title };

const c = copy.results;

/**
 * The student's own results, across every quiz.
 *
 * This is the screen the quiz engine never had. Everything it renders already
 * existed in `quiz_attempts` — the review page has been fully built since Plan
 * 5 and nothing in the product linked to it, so a student could not see what
 * they had answered last time.
 *
 * The dashboard answers "what do I do next" and shows the last five scores as
 * a strip. This answers "how am I doing", which is a different question with a
 * different shape, and is why it is a destination in the rail rather than more
 * cards on the dashboard.
 *
 * `<StatTile>` is reused from the dashboard deliberately: two screens showing
 * a row of headline numbers must use the same object, or the product grows two
 * dialects of the same idea. Only `statPassed` carries a meter — it is the one
 * figure here that is a share of a whole (quizzes passed, of quizzes sat).
 */
export default async function ResultsPage() {
  const history = await apiGetAuthed('/api/me/quizzes', StudentQuizHistorySchema);
  const { summary } = history;

  if (history.quizzes.length === 0) {
    return (
      <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-8 md:px-6 md:py-10">
        <Header />
        {/*
          `.empty` — the same object the dashboard's three empty states use,
          and a drawing rather than a dashed grey rectangle, which is
          indistinguishable from something that failed to load.
        */}
        <div className="empty">
          <SpotIllustration name="scores" />
          <p className="empty__title">{c.emptyTitle}</p>
          <p className="empty__body mx-auto max-w-[34rem]">{c.emptyBody}</p>
          <div className="empty__action">
            <Link href="/path" className="chip chip--solid">
              {c.emptyCta}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-8 md:px-6 md:py-10">
      <Header />

      {/* The same four hues, in the same order, as the dashboard's row — these
          are a different four statistics, but a student meets both rows in one
          session and two unrelated colour orders would read as two different
          products. «امتحانات نجحت فيها» takes the amber `accent` well for the
          same reason «إجمالي تقدّمك» does over there: it is the one figure on
          the screen that is a share of a whole the student is moving. */}
      <section className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          icon={<ClipboardList className="size-4" />}
          value={summary.quizzesTaken}
          label={c.statQuizzes}
          hue={225}
        />
        <StatTile
          icon={<Repeat2 className="size-4" />}
          value={summary.attemptsTotal}
          label={c.statAttempts}
          hue={165}
        />
        <StatTile
          icon={<Target className="size-4" />}
          value={summary.averagePercent ?? c.noneYet}
          suffix={summary.averagePercent === null ? undefined : '%'}
          label={c.statAverage}
          hue={295}
        />
        <StatTile
          icon={<Award className="size-4" />}
          value={summary.passedCount}
          suffix={`/ ${summary.quizzesTaken}`}
          label={c.statPassed}
          meterPercent={
            summary.quizzesTaken > 0 ? (summary.passedCount / summary.quizzesTaken) * 100 : undefined
          }
          accent
        />
      </section>

      {/* One attempt is not a trend. The chart renders from two points up;
          below that the per-quiz list already states the single score. */}
      {history.series.length > 1 ? (
        <section className="mb-8">
          <ScoreTrend series={history.series} />
        </section>
      ) : null}

      <section>
        <h2 className="mb-4 text-[length:var(--fs-title-3)] font-medium text-fg">
          {c.quizzesTitle}
        </h2>
        <ul className="overflow-hidden rounded-lg border border-line bg-surface-2">
          {history.quizzes.map((row) => (
            <QuizResultRow key={row.lessonId} row={row} />
          ))}
        </ul>
      </section>
    </main>
  );
}

function Header() {
  return (
    <header className="mb-6">
      <p className="eyebrow mb-2 text-fg-muted">{c.eyebrow}</p>
      <h1 className="text-[length:var(--fs-title-1)] font-semibold text-fg">{c.title}</h1>
      <p className="mt-2 max-w-[var(--w-prose)] text-fg-muted">{c.subtitle}</p>
    </header>
  );
}
