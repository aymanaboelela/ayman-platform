import Link from 'next/link';
import { ChevronDown, Clock3, Timer } from 'lucide-react';
import {
  AdminAttemptListSchema,
  AdminAttemptsOverviewSchema,
  type AdminAttemptList,
} from '@ayman/contracts/admin/attempts';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { adminGet } from '@/lib/admin-api';
import { AdminEmpty } from '@/components/admin/admin-empty';
import { ListControl } from '@/components/admin/list-controls';
import { AttemptRow } from './attempt-row';
import { groupAttemptQuizzes, type AttemptCourseGroup } from './groups';
import { WASH } from './labels';
import { overviewHref, type OverviewParams } from './nav';
import { Pager } from './pager';
import { QuizCard } from './quiz-card';

const b = copy.quizAdmin.board;

/** One of `PAGE_SIZES`. Twenty, because this is a search result being scanned
 *  for one name, not a class being worked through. */
const STUDENT_PAGE = 20;

/**
 * The default view: every quiz, under its course and unit, in the course's own
 * order — «كل حاجة تحت الكورس بتاعها».
 *
 * ## One box, two searches
 *
 * The owner asked for one search that finds a quiz by its title AND a student
 * by name or phone. Both run in parallel off the same `q` and render as two
 * blocks — the students' sittings first, because a name is the commoner thing
 * to type, then the quizzes whose title matched. A search that is plainly a
 * phone number simply finds no quiz.
 *
 * The course picker is a native `<select>` that writes the URL (`ListControl`)
 * and the search is a plain GET form: the result IS the URL, so a filtered
 * overview can be sent to an assistant and the back button walks searches.
 */
export async function AttemptsOverview({ params }: { params: OverviewParams }) {
  const overviewQuery = new URLSearchParams();
  if (params.courseId) overviewQuery.set('courseId', params.courseId);
  if (params.q) overviewQuery.set('q', params.q);

  const studentQuery = new URLSearchParams({ perPage: String(STUDENT_PAGE), page: String(params.page ?? 1) });
  if (params.q) studentQuery.set('q', params.q);
  if (params.courseId) studentQuery.set('courseId', params.courseId);

  const [overview, students] = await Promise.all([
    adminGet(`/api/admin/attempts/overview?${overviewQuery}`, AdminAttemptsOverviewSchema),
    params.q
      ? adminGet(`/api/admin/attempts?${studentQuery}`, AdminAttemptListSchema)
      : Promise.resolve<AdminAttemptList | null>(null),
  ]);
  const groups = groupAttemptQuizzes(overview.quizzes);
  const courseKnown = overview.courses.some((course) => course.courseId === params.courseId);
  const searching = Boolean(params.q);
  const nothingFound = searching && groups.length === 0 && (students?.rowCount ?? 0) === 0;
  // A course id from an old link whose quizzes have all gone: the same empty
  // state as a stack nobody has sat anything on, rather than a bare toolbar.
  const emptyCourse = !searching && groups.length === 0;

  return (
    <>
      <div>
        <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{copy.quizAdmin.attemptsTitle}</h1>
        <p className="mt-1 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] text-fg-muted">{b.lead}</p>
      </div>

      {overview.courses.length === 0 ? (
        <AdminEmpty spot="exams" title={b.empty} hint={b.emptyHint} />
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            {/* A GET form: `courseId` rides along because submitting replaces
                the whole query string, and `page` deliberately does not — a
                new search starts on its first page. */}
            <form action="/admin/attempts" role="search" className="flex min-w-0 flex-1 basis-72 items-center gap-2">
              {params.courseId ? <input type="hidden" name="courseId" value={params.courseId} /> : null}
              <label htmlFor="attempts-q" className="sr-only">
                {b.searchLabel}
              </label>
              <input
                id="attempts-q"
                name="q"
                type="search"
                defaultValue={params.q ?? ''}
                maxLength={120}
                placeholder={b.searchPlaceholder}
                className="h-10 min-w-0 flex-1 rounded-full border border-line bg-surface-2 px-4 text-[length:var(--fs-text-sm)] text-fg placeholder:text-fg-faint"
              />
              <button
                type="submit"
                className="h-10 shrink-0 rounded-full bg-accent px-5 text-[length:var(--fs-text-sm)] font-medium text-[color:var(--on-accent-ink)]"
              >
                {b.searchSubmit}
              </button>
              {searching ? (
                <Link
                  href={overviewHref({ courseId: params.courseId })}
                  className="h-10 shrink-0 rounded-full border border-line px-4 text-[length:var(--fs-text-sm)] leading-10 text-fg-muted transition-colors duration-[160ms] ease-out hover:border-accent/40 hover:text-fg"
                >
                  {b.searchClear}
                </Link>
              ) : null}
            </form>
            <ListControl
              name="courseId"
              label={b.courseLabel}
              value={courseKnown ? (params.courseId ?? '') : ''}
              className="max-sm:w-full"
              options={[
                { value: '', label: b.allCourses },
                ...overview.courses.map((course) => ({
                  value: course.courseId,
                  label: course.courseTitle,
                  count: course.attempts,
                })),
              ]}
            />
          </div>

          {students && students.rowCount > 0 ? (
            <section aria-labelledby="attempts-students" className="mt-6">
              <h2 id="attempts-students" className="text-[length:var(--fs-title-3)] font-semibold text-fg">
                {b.studentsHeading}
              </h2>
              <p className="mt-0.5 text-[length:var(--fs-text-sm)] text-fg-muted tabular-nums">
                {formatCopy(b.studentsLead, { n: students.rowCount, q: params.q ?? '' })}
              </p>
              <ul className="mt-3 flex flex-col gap-2.5">
                {students.rows.map((row) => (
                  <li key={row.id}>
                    <AttemptRow row={row} context={{ back: params, q: params.q }} />
                  </li>
                ))}
              </ul>
              <Pager
                page={params.page ?? 1}
                perPage={STUDENT_PAGE}
                rowCount={students.rowCount}
                shown={students.rows.length}
                hrefFor={(page) => overviewHref({ ...params, page })}
              />
            </section>
          ) : null}

          {nothingFound ? (
            <AdminEmpty
              spot="exams"
              title={formatCopy(b.noMatches, { q: params.q ?? '' })}
              hint={b.noMatchesHint}
            />
          ) : null}
          {emptyCourse ? <AdminEmpty spot="exams" title={b.empty} hint={b.emptyHint} /> : null}

          {groups.length > 0 ? (
            <div className="mt-6 flex flex-col gap-8">
              {searching ? (
                <h2 className="-mb-4 text-[length:var(--fs-title-3)] font-semibold text-fg">
                  {formatCopy(b.quizzesHeading, { q: params.q ?? '' })}
                </h2>
              ) : null}
              {groups.map((course) => (
                <CourseBlock key={course.courseId} course={course} back={params} />
              ))}
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

/**
 * One course: its header with the totals that need him, then its units.
 *
 * A native `<details>`, so a course he is not working on folds away to its one
 * header line — no script, and the browser's own find-in-page still reaches
 * into a folded course. Open by default; an ARCHIVED course starts folded,
 * because its sittings are history and it sits at the bottom for that reason.
 */
function CourseBlock({ course, back }: { course: AttemptCourseGroup; back: OverviewParams }) {
  const chip = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[length:var(--fs-text-sm)] font-medium tabular-nums';
  return (
    <details open={!course.archived} className="group">
      <summary
        className={cn(
          'flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5',
          '[&::-webkit-details-marker]:hidden',
        )}
      >
        <h2 className="flex min-w-0 items-center gap-2 text-[length:var(--fs-title-3)] font-semibold text-fg">
          <ChevronDown
            className="size-5 shrink-0 text-fg-muted transition-transform duration-[160ms] ease-out group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
          <span className="min-w-0">{course.courseTitle}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {course.archived ? <span className={cn(chip, WASH.neutral)}>{b.archived}</span> : null}
          {course.pendingReview > 0 ? (
            <span className={cn(chip, WASH.accent)}>
              <Clock3 className="size-4" aria-hidden="true" />
              {formatCopy(b.coursePending, { n: course.pendingReview })}
            </span>
          ) : null}
          {course.inProgress > 0 ? (
            <span className={cn(chip, WASH.info)}>
              <Timer className="size-4" aria-hidden="true" />
              {formatCopy(b.courseLive, { n: course.inProgress })}
            </span>
          ) : null}
          <span className={cn(chip, WASH.neutral)}>{formatCopy(b.courseAttempts, { n: course.attempts })}</span>
        </div>
      </summary>

      {course.sections.map((section) => (
        <div key={section.sectionId} className="mt-4">
          <h3 className="mb-2 text-[length:var(--fs-text-xs)] font-semibold tracking-wide text-fg-muted">
            {section.title}
          </h3>
          {/* Two columns only once the CONTENT is wide enough: the admin rail
              takes 296px of the viewport, so `xl` here is a ~980px column. */}
          <ul className="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
            {section.quizzes.map((quiz) => (
              <li key={quiz.quizId}>
                <QuizCard quiz={quiz} back={back} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </details>
  );
}
