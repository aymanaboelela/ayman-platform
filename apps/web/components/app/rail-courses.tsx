import Link from 'next/link';
import { copy } from '@ayman/contracts';
import { cn, Skeleton } from '@ayman/ui';
import { enrolledCourseHref } from '@/lib/course-href';
import { getDashboard } from '@/lib/dashboard';

/**
 * The student's own courses, in the rail — the thing that makes it a rail and
 * not a menu. Each row carries its progress as a 2px meter under the title, so
 * "where am I in this course" is answerable without opening it.
 *
 * ## Why this is its own async Server Component
 *
 * `(app)/layout.tsx` is deliberately NOT `async` — see the comment there. It
 * used to `await getSession()` to decide whether to draw the admin link, and
 * that blocked every client-side transition into the group on a round-trip
 * with the previous page still mounted. Streaming the read from inside its own
 * `<Suspense>` boundary is what fixed it, and this component follows that rule
 * rather than reverting it: the shell paints immediately and the course list
 * arrives under `<RailCoursesSkeleton>`.
 *
 * ## The cost, stated plainly
 *
 * This fetch runs on every signed-in route the chrome is drawn on, including
 * the lesson player where the rail is collapsed and this list is hidden by
 * CSS. That is one small, `cache()`-shared GET issued in parallel with the
 * page's own data and never on the critical path — the same bargain the shell
 * already makes with `/api/session` for the account menu, and on the player it
 * is the right one: the list is one CSS toggle away from being visible again.
 *
 * The one route where it was NOT the right bargain is the running attempt,
 * where the shell is discarded outright and this list can never be revealed.
 * It no longer runs there. `proxy.ts` forwards the pathname as a request
 * header and `<ChromeUnlessAttempt>` — the wrapper `(app)/layout.tsx` puts
 * between the `<Suspense>` boundary and this component — returns `null`
 * before this ever renders. The header is read down there rather than in the
 * layout because an `await` in the layout is exactly what this whole comment
 * exists to prevent; `chrome-unless-attempt.tsx` has the rest of it.
 */
export async function RailCourses() {
  const dashboard = await getDashboard();

  if (dashboard.enrolledCourses.length === 0) {
    return (
      <p className="rail__label px-3 py-2 text-[length:var(--fs-text-base)] text-fg-muted">
        {copy.nav.railCoursesEmpty}
      </p>
    );
  }

  return (
    <ul className="rail__label flex flex-col gap-0.5">
      {dashboard.enrolledCourses.map((course) => {
        // `enrolledCourseHref`, not a local expression. The local expression
        // this replaced sent an enrolled-but-not-yet-started student to the
        // PUBLIC course page — out of the shell, onto a lock badge. See
        // `lib/course-href.ts` for the whole account of it.
        const href = enrolledCourseHref(course);

        /*
          A course the instructor has taken down. It used to be filtered out of
          this payload entirely, so it simply vanished from the rail; it is
          reported now (see `EnrolledCourseSchema.published`) and has to stop
          being a link, because `enrolledCourseHref` resolves to
          `/library/{slug}` and that page answers `notFound()` for anything the
          published-only catalog does not hold.

          A `<span>` rather than a dialog, and only here: the rail is a list of
          destinations, not a surface that explains things, and the card on the
          dashboard and the map on `/path` both carry the full explanation one
          click away. What this owes the student is not to lie about where it
          goes.
        */
        if (!course.published) {
          return (
            <li key={course.id}>
              <span
                title={course.title}
                className="flex cursor-not-allowed flex-col gap-1.5 rounded-md px-3 py-2 opacity-60"
              >
                <span className="line-clamp-2 text-[length:var(--fs-text-base)] leading-snug text-fg-muted">
                  {course.title}
                </span>
                <span className="truncate text-[length:var(--fs-mono-label)] text-fg-faint">
                  {copy.path.closedBadge}
                </span>
              </span>
            </li>
          );
        }

        return (
          <li key={course.id}>
            <Link
              href={href}
              title={course.title}
              className={cn(
                'flex flex-col gap-1.5 rounded-md px-3 py-2',
                'transition-colors duration-[160ms] ease-out hover:bg-surface-3',
              )}
            >
              <span className="line-clamp-2 text-[length:var(--fs-text-base)] leading-snug text-fg-muted">
                {course.title}
              </span>
              {/*
                Decorative: the percentage is not announced because the course
                card on the dashboard states it in text, and a rail full of
                "٦٨٪" readings between link names is noise, not information.
              */}
              <span
                className="h-[2px] w-full overflow-hidden rounded-full bg-surface-4"
                aria-hidden="true"
              >
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${Math.min(Math.max(course.progressPercent, 0), 100)}%` }}
                />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Three rows at the same height the real ones settle at, so the rail's footer
 * does not jump when the list lands. `rail__label` so the skeleton disappears
 * in the collapsed rail exactly like the content it stands in for — otherwise
 * a collapsed rail flashes three grey bars on every navigation.
 */
export function RailCoursesSkeleton() {
  return (
    <div className="rail__label flex flex-col gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex flex-col gap-1.5 px-3 py-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-[2px] w-full" />
        </div>
      ))}
    </div>
  );
}
