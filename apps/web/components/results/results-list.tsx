import { copy, type QuizHistoryRow } from '@ayman/contracts';
import { verdictOf } from '@/lib/results-view';
import { FILTER_OF, QuizResultCard } from './quiz-result-card';

const c = copy.results;

type Filter = 'all' | 'passed' | 'failed' | 'pending';

const LABEL: Record<Filter, string> = {
  all: c.filterAll,
  passed: c.filterPassed,
  failed: c.filterFailed,
  pending: c.filterPending,
};

/**
 * «كل الامتحانات» — the chips, then every exam as a row.
 *
 * ## The chips filter by VERDICT, not by kind
 *
 * The board's chips are «الشهرية / الكورسات / الكويزات», and the payload has
 * no such field: a row knows its course and its verdict, nothing about what
 * kind of paper it was. So the chips are the verdicts the rows already carry —
 * «اتعدّت / محتاجة مراجعة / بتتصحّح» — which is also the question a student
 * filters for («فين اللي محتاجة مراجعة؟»). They only render when there are at
 * least two kinds to tell apart; one chip that hides nothing is clutter.
 *
 * ## No JavaScript
 *
 * A radio group styled as chips, and `:has()` in `results.css` hides the rows
 * the checked one does not name. The page stays a Server Component, the
 * chips are a real, keyboard-operable radio group, and a browser without
 * `:has()` simply shows every row — the list as it was.
 */
export function ResultsList({
  rows,
  deltas,
  showCourse,
}: {
  rows: readonly QuizHistoryRow[];
  deltas: ReadonlyMap<string, number>;
  showCourse: boolean;
}) {
  const counts: Record<Exclude<Filter, 'all'>, number> = { passed: 0, failed: 0, pending: 0 };
  for (const row of rows) counts[FILTER_OF[verdictOf(row)]] += 1;
  const kinds = (Object.keys(counts) as Array<keyof typeof counts>).filter((key) => counts[key] > 0);
  const filters: Filter[] = kinds.length > 1 ? ['all', ...kinds] : [];

  return (
    <div className="rs-list">
      {filters.length > 0 ? (
        <fieldset className="rs-filter">
          <legend className="sr-only">{c.filterLabel}</legend>
          {filters.map((filter) => (
            <span key={filter} className="rs-filter__item">
              <input
                type="radio"
                name="rs-filter"
                id={`rs-f-${filter}`}
                value={filter}
                defaultChecked={filter === 'all'}
                className="rs-filter__input"
              />
              <label htmlFor={`rs-f-${filter}`} className="rs-chip">
                {LABEL[filter]}
                <span className="rs-chip__n rs-ltr">{filter === 'all' ? rows.length : counts[filter]}</span>
              </label>
            </span>
          ))}
        </fieldset>
      ) : null}

      <ul className="rs-exams">
        {rows.map((row) => (
          <QuizResultCard
            key={row.lessonId}
            row={row}
            delta={deltas.get(row.lessonId) ?? null}
            showCourse={showCourse}
          />
        ))}
      </ul>
    </div>
  );
}
