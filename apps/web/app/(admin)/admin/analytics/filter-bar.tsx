'use client';

import { useQueryStates } from 'nuqs';
import { Download } from 'lucide-react';
import { cn } from '@ayman/ui/lib/cn';
import { copy } from '@ayman/contracts/copy/admin';
import { WINDOW_DAYS, overviewSearchParams } from './search-params';

const c = copy.analytics;

export interface CourseOption {
  id: string;
  title: string;
}

const WINDOW_LABEL: Record<number, string> = {
  7: c.window7,
  30: c.window30,
  90: c.window90,
  365: c.window365,
};

/**
 * The one control row above the charts — window on one side, course on the
 * other, export at the end. Filters never sit between charts: a reader
 * scrolling past one has no way to know a control above it changed what they
 * are looking at.
 *
 * `shallow: false` on every key (see `search-params.ts`) is what makes this a
 * server round-trip rather than a client-side re-filter of data that was never
 * fetched. The URL is the whole state: copy the address, send it, and the
 * other person sees the same numbers.
 */
export function FilterBar({
  courses,
  showWindow = true,
  exportHref,
}: {
  courses: readonly CourseOption[];
  showWindow?: boolean;
  exportHref?: string;
}) {
  const [query, setQuery] = useQueryStates(overviewSearchParams);

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      {showWindow ? (
        <div
          className="flex overflow-hidden rounded-md border border-line"
          role="group"
          aria-label={c.window}
        >
          {WINDOW_DAYS.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => void setQuery({ days })}
              aria-pressed={query.days === days}
              className={cn(
                'px-3 py-1.5 text-[length:var(--fs-text-sm)] transition-colors duration-[160ms] ease-out',
                'border-e border-line last:border-e-0',
                query.days === days
                  ? 'bg-accent text-[color:var(--n-1)]'
                  : 'bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg',
              )}
            >
              {WINDOW_LABEL[days]}
            </button>
          ))}
        </div>
      ) : null}

      <label className="flex items-center gap-2 text-[length:var(--fs-text-sm)] text-fg-muted">
        {c.course}
        <select
          value={query.courseId}
          onChange={(event) => void setQuery({ courseId: event.target.value })}
          className={cn(
            'rounded-md border border-line bg-surface-2 px-2 py-1.5 text-fg',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--a-9)]',
          )}
        >
          <option value="">{c.allCourses}</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.title}
            </option>
          ))}
        </select>
      </label>

      {exportHref ? (
        <a
          href={query.courseId ? `${exportHref}?courseId=${query.courseId}` : exportHref}
          download
          className={cn(
            'ms-auto inline-flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-1.5',
            'text-[length:var(--fs-text-sm)] text-fg',
            'transition-colors duration-[160ms] ease-out hover:border-line-strong hover:bg-surface-3',
          )}
          title={c.exportHint}
        >
          <Download className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
          {c.exportCsv}
        </a>
      ) : null}
    </div>
  );
}
