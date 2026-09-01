'use client';

import { useState } from 'react';
import { copy, type EnrolledCourse } from '@ayman/contracts';
import { EnrolledCourseCard } from './enrolled-course-card';
import { SpotIllustration } from './spot-illustration';

const c = copy.dashboard;

type Tab = 'current' | 'completed';

/**
 * The two tabs under «كورساتي»: courses still in progress, and courses
 * already finished.
 *
 * ## Why a client component wrapping the grid, rather than two grids on the
 * page
 *
 * The split is presentation only — `dashboard.enrolledCourses` is one array,
 * already on the page from the one `getDashboard()` read, and which HALF of
 * it is on screen is a UI state with no server consequence. A `'use client'`
 * boundary this small keeps that state local (no URL param, no server round
 * trip on every tab press) without dragging the rest of the page — the grid,
 * the group heading, the count — across the boundary with it.
 *
 * ## The split itself
 *
 * `progressPercent >= 100` — the same `>=` (not `===`) `achievements.ts` uses
 * for «كورس كامل», and for the identical reason: `progressPercent` is a
 * Postgres `numeric` and an arithmetically finished course can arrive as
 * 100.000000001, which `===` would silently leave in «الحالية».
 */
export function EnrolledCoursesTabs({
  courses,
  vodafoneCash,
}: {
  courses: readonly EnrolledCourse[];
  vodafoneCash: string | null;
}) {
  const [tab, setTab] = useState<Tab>('current');

  if (courses.length === 0) {
    // A brand-new student has no split to offer — the page's own empty state
    // (rendered by the caller) already covers this case.
    return null;
  }

  const shown = courses.filter((course) =>
    tab === 'completed' ? course.progressPercent >= 100 : course.progressPercent < 100,
  );

  return (
    <>
      <div className="mb-3 flex gap-2" role="tablist" aria-label={c.myCourses}>
        <TabButton active={tab === 'current'} onClick={() => setTab('current')}>
          {c.tabCurrentCourses}
        </TabButton>
        <TabButton active={tab === 'completed'} onClick={() => setTab('completed')}>
          {c.tabCompletedCourses}
        </TabButton>
      </div>

      {shown.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {shown.map((course) => (
            <EnrolledCourseCard key={course.id} course={course} vodafoneCash={vodafoneCash} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <SpotIllustration name="courses" />
          <p className="empty__body">
            {tab === 'completed' ? c.noCompletedCoursesYet : c.noCurrentCoursesYet}
          </p>
        </div>
      )}
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      // `.chip`, the same object every status/action marker on the study
      // surface uses — `chip--accent` (outlined) is the row's OWN action
      // elsewhere on this page, which is exactly what "the tab you are on"
      // means here too. `chip--quiet` is everything not currently pressed.
      className={`chip ${active ? 'chip--accent' : 'chip--quiet'}`}
    >
      {children}
    </button>
  );
}
