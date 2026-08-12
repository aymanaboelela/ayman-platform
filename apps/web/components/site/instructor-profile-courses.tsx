'use client';

import { useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import type { CatalogCourse } from '@ayman/contracts/catalog';
import { CourseCard } from '@/components/site/course-card';

const c = copy.landing;

/** `null` is the "all years" tab. */
type Filter = number | null;

/**
 * The tab strip under the profile header, and the grid it filters.
 *
 * The tabs are REAL — they filter the grid by school year. A borrowed profile
 * layout comes with a row of tabs, and three that look pressable but do nothing
 * is worse than not having them: it teaches the visitor that this page's
 * controls are decorative. Filtering by year is the one split the catalogue
 * already carries (`CatalogCourse.year`), so it costs no new data.
 *
 * Client component for exactly this reason, and nothing more — the header, the
 * counts and the fetch all stay on the server in `<InstructorProfile>`. What
 * crosses the boundary is the already-loaded course list.
 */
export function ProfileCourses({
  courses,
  years,
}: {
  courses: CatalogCourse[];
  years: number[];
}) {
  const [active, setActive] = useState<Filter>(null);

  const shown = active === null ? courses : courses.filter((course) => course.year === active);

  // One tab per year plus "all" — but only when there is more than one year to
  // choose between. A single tab is not a choice, it is furniture.
  const tabs: { key: Filter; label: string }[] =
    years.length > 1
      ? [
          { key: null, label: c.profileAll },
          ...years.map((year) => ({ key: year as Filter, label: `${c.profileYear} ${year}` })),
        ]
      : [];

  return (
    <>
      {tabs.length > 0 ? (
        // `tablist`/`tab` rather than plain buttons: this is a filter over one
        // region, which is what the pattern describes, and it gives arrow-key
        // navigation and the selected state to a screen reader for free.
        <div className="profile__tabs" role="tablist" aria-label={c.profileCta}>
          {tabs.map((tab) => {
            const selected = tab.key === active;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                className={`profile__tab ${selected ? 'is-active' : ''}`}
                key={String(tab.key)}
                onClick={() => setActive(tab.key)}
              >
                {tab.key === null ? (
                  <LayoutGrid size={16} aria-hidden="true" />
                ) : null}
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {shown.length === 0 ? (
        <p className="profile__empty">{c.profileEmpty}</p>
      ) : (
        <ul className="profile__grid">
          {shown.map((course) => (
            <CourseCard course={course} key={course.id} />
          ))}
        </ul>
      )}
    </>
  );
}
