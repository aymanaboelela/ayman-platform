import type { Metadata } from 'next';
import { BookOpen, ListChecks } from 'lucide-react';
import { StudentQuizHistorySchema, copy, formatCopy } from '@ayman/contracts';
import { apiGetAuthed } from '@/lib/api-server';
import { groupByCourse, latestDeltas } from '@/lib/results-view';
import { QuizResultCard } from '@/components/results/quiz-result-card';
import { ResultsEmpty } from '@/components/results/results-empty';
import { ResultsHero } from '@/components/results/results-hero';
import { ScoreTrend } from '@/components/results/score-trend';
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
 * ## Three regions, in the order a student asks
 *
 * 1. Where do I stand? — `ResultsHero`: the average as a gauge, its band, one
 *    sentence that adds the numbers up, and the four supporting figures.
 * 2. Which way am I going? — `ScoreTrend`, from ONE attempt up. It used to
 *    hide below two, which left a first-time student with no chart at all on
 *    the screen whose job is to show them one.
 * 3. What about each exam? — one card per exam, grouped by course once there
 *    is more than one course, so a student with three does not read one long
 *    list where the course is small print on every row.
 *
 * All of it is one fetch and pure folds over it (`lib/results-view.ts`); no
 * region asks the API for anything the payload does not already carry.
 */
export default async function ResultsPage() {
  const history = await apiGetAuthed('/api/me/quizzes', StudentQuizHistorySchema);

  if (history.quizzes.length === 0) {
    return (
      <main className="rs mx-auto w-full max-w-[var(--w-app)] px-4 py-8 md:px-6 md:py-10">
        <Header />
        <ResultsEmpty />
      </main>
    );
  }

  const deltas = latestDeltas(history.series);
  const groups = groupByCourse(history.quizzes);
  const grouped = groups.length > 1;

  return (
    <main className="rs mx-auto w-full max-w-[var(--w-app)] px-4 py-8 md:px-6 md:py-10">
      <Header />

      <ResultsHero summary={history.summary} series={history.series} rows={history.quizzes} />

      <div className="rs-section">
        <ScoreTrend series={history.series} />
      </div>

      <section className="rs-section" aria-labelledby="rs-exams-title">
        <div className="rs-section__head">
          <span className="rs-card__icon" aria-hidden="true">
            <ListChecks className="size-4" />
          </span>
          <h2 id="rs-exams-title" className="rs-section__title">
            {c.quizzesTitle}
          </h2>
        </div>

        {grouped ? (
          <div className="rs-groups">
            {groups.map((group) => (
              <section
                key={group.courseSlug}
                className="rs-group"
                aria-labelledby={`rs-group-${group.courseSlug}`}
              >
                <div className="rs-group__head">
                  <BookOpen className="rs-group__icon size-4" aria-hidden="true" />
                  <h3 id={`rs-group-${group.courseSlug}`} className="rs-group__title">
                    {group.courseTitle}
                  </h3>
                  <span className="rs-group__meta">
                    <span className="rs-pill">{formatCopy(c.groupCount, { count: group.rows.length })}</span>
                    {group.passed > 0 ? (
                      <span className="rs-pill" data-tone="ok">
                        {formatCopy(c.groupPassed, { passed: group.passed })}
                      </span>
                    ) : null}
                  </span>
                </div>
                <ul className="rs-exams">
                  {group.rows.map((row) => (
                    <QuizResultCard
                      key={row.lessonId}
                      row={row}
                      delta={deltas.get(row.lessonId) ?? null}
                      headingLevel={4}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <ul className="rs-exams">
            {history.quizzes.map((row) => (
              <QuizResultCard
                key={row.lessonId}
                row={row}
                delta={deltas.get(row.lessonId) ?? null}
                showCourse
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Header() {
  return (
    <header className="mb-6">
      <p className="eyebrow mb-2 text-fg-muted">{c.eyebrow}</p>
      <h1 className="text-[length:var(--fs-title-1)] font-bold text-fg">{c.title}</h1>
      <p className="mt-2 max-w-[var(--w-prose)] text-fg-muted">{c.subtitle}</p>
    </header>
  );
}
