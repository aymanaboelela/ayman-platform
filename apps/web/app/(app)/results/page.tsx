import type { Metadata } from 'next';
import { StudentQuizHistorySchema, copy } from '@ayman/contracts';
import { apiGetAuthed } from '@/lib/api-server';
import { getMasteryOrNull } from '@/lib/mastery';
import { MasteryCard } from '@/components/dashboard/mastery-card';
import { getBrandAsset } from '@/lib/brand-assets';
import { latestDeltas } from '@/lib/results-view';
import { ImproveCard } from '@/components/results/quiz-result-card';
import { ResultsEmpty } from '@/components/results/results-empty';
import { ResultsHero } from '@/components/results/results-hero';
import { ResultsList } from '@/components/results/results-list';
import '@/components/results/results.css';

export const metadata: Metadata = { title: copy.results.title };

const c = copy.results;

/**
 * The student's own results, across every quiz.
 *
 * Everything it renders already existed in `quiz_attempts` — the review page
 * had been fully built since Plan 5 and nothing in the product linked to it,
 * so this screen is where a student finds out what they answered last time.
 *
 * The dashboard answers "what do I do next". This answers "how am I doing",
 * which is a different question with a different shape, and is why it is a
 * destination in the rail rather than more cards on the dashboard.
 *
 * ## The 2026-11 board, in the order a student asks
 *
 * 1. Where do I stand, which way am I going? — `ResultsHero`: the average as
 *    an orange ring, one sentence, three small facts, and the last sittings
 *    as bars. (The big line chart, `ScoreTrend`, still draws «بروفايلي» and
 *    the guardian page; here the bars carry the trend at a glance.)
 * 2. Is there something I can still fix? — `ImproveCard`: the exam whose
 *    improvement sitting is unused, with the page's ONE orange button.
 * 3. What about each exam? — `ResultsList`: verdict chips, then every exam
 *    as a row with a coloured score tile and a quiet «مراجعة».
 *
 * «مش بحب الزحمة للطالب» — one primary per area, everything else quiet. All
 * of it is one fetch and pure folds over it (`lib/results-view.ts`).
 */
export default async function ResultsPage() {
  const [history, mastery] = await Promise.all([
    apiGetAuthed('/api/me/quizzes', StudentQuizHistorySchema),
    getMasteryOrNull(),
  ]);

  if (history.quizzes.length === 0) {
    return (
      <main className="rs mx-auto w-full max-w-[var(--w-shell)] px-4 py-8 md:px-6 md:py-10">
        <Header />
        <ResultsEmpty />
      </main>
    );
  }

  const deltas = latestDeltas(history.series);
  const showCourse = new Set(history.quizzes.map((row) => row.courseSlug)).size > 1;
  // A failed exam's second chance before a passed one's: that is the one the
  // card exists for. Otherwise the most recently sat, the API's own order.
  const open = history.quizzes.filter((row) => row.allowsImprovement && !row.improvementUsed);
  const improve = open.find((row) => row.passed === false) ?? open[0] ?? null;

  return (
    <main className="rs mx-auto w-full max-w-[var(--w-shell)] px-4 py-8 md:px-6 md:py-10">
      <Header />

      <ResultsHero
        summary={history.summary}
        series={history.series}
        rows={history.quizzes}
        poster={getBrandAsset('practiceGuide')}
      />

      {improve ? (
        <section className="rs-section" aria-labelledby="rs-improve-head">
          <h2 id="rs-improve-head" className="rs-h2">
            {c.improveTitle}
          </h2>
          <ImproveCard row={improve} />
        </section>
      ) : null}

      <section className="rs-section" aria-labelledby="rs-exams-title">
        <h2 id="rs-exams-title" className="rs-h2">
          {c.allExamsTitle}
        </h2>
        <ResultsList rows={history.quizzes} deltas={deltas} showCourse={showCourse} />
      </section>

      {/* «نقوّي النقط دي» moved here from the home page («شيل … وحطها في
          مكانها»): the topics to strengthen belong with the results they are
          read from. Renders nothing until there is enough to say. */}
      {mastery ? (
        <section className="rs-section">
          <MasteryCard mastery={mastery} />
        </section>
      ) : null}
    </main>
  );
}

function Header() {
  return (
    <header className="mb-5">
      <h1 className="text-[length:var(--fs-title-1)] font-bold text-fg">{c.title}</h1>
      <p className="mt-1 max-w-[var(--w-prose)] text-fg-muted">{c.subtitle}</p>
    </header>
  );
}
