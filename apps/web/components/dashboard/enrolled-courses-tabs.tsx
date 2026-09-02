'use client';

import { useState } from 'react';
import { copy } from '@ayman/contracts/copy';
import type { EnrolledCourse } from '@ayman/contracts/progress';
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
 * `completedLessons >= totalLessons` (both live-counted per course by
 * `DashboardService`, `>=` for the same "can arrive fractionally over"
 * reason `achievements.ts` uses `>=` for its own «كورس كامل» check) —
 * deliberately NOT `course.progressPercent`. That field is `Enrollment
 * .progressPercent`, a column written by a SEPARATE recalculation path and
 * observed to sit stuck at 100 on a real account with an obviously
 * in-progress lesson (a live resume target, partial watch time) — a
 * pre-existing data staleness this tab split would otherwise take at face
 * value and use to hide a course the student is actively studying. The ring
 * on `DashboardHero` and this split now agree on the same live count; only
 * the per-course tile's own display percentage still reads the (separately
 * tracked, and separately at risk of the same staleness) `progressPercent`.
 */
function isCourseComplete(course: EnrolledCourse): boolean {
  return course.totalLessons > 0 && course.completedLessons >= course.totalLessons;
}
export function EnrolledCoursesTabs({
  courses,
  shippingCents,
  vodafoneCash,
}: {
  courses: readonly EnrolledCourse[];
  /** Threaded straight through to `BookOrderButton` — see its own note. */
  shippingCents: number;
  vodafoneCash: string | null;
}) {
  const [tab, setTab] = useState<Tab>('current');

  if (courses.length === 0) {
    // A brand-new student has no split to offer — the page's own empty state
    // (rendered by the caller) already covers this case.
    return null;
  }

  const shown = courses.filter((course) =>
    tab === 'completed' ? isCourseComplete(course) : !isCourseComplete(course),
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
            <EnrolledCourseCard
              key={course.id}
              course={course}
              shippingCents={shippingCents}
              vodafoneCash={vodafoneCash}
            />
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
