import Link from 'next/link';
import { PencilLine, Users } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import type { CourseHeadcountRow } from '@ayman/contracts/admin/analytics';
import { formatCopy } from '@ayman/contracts/format';
import { CourseArt } from '@/components/course-art';

const c = copy.admin.overview;

/** How many rows the strip shows before it stops and says how many it left.
 *  Eight is the whole roster on production and a readable top-of-list on a
 *  database full of test courses — and the tail line below never lets the cap
 *  hide the count, which is the only way a cap can lie. */
const LIMIT = 8;

/**
 * «كام واحد مشترك في كل كورس» — the headcount strip on the admin overview.
 *
 * ## Why a bar and not a table
 *
 * The question this answers is comparative («الكورس ده فيه أكتر من ده ولا
 * أقل»), and five numbers in a column are compared by reading them one at a
 * time. The bar is scaled against the BIGGEST row, not against the student
 * total: a course holding 200 of 715 students would otherwise draw a stub on
 * every row and the comparison — which is the point — would be invisible.
 *
 * ## The second number only appears on a closed course
 *
 * `subscribed` is live grants naming the course. On a free course that is 0
 * and always will be — access there comes from the platform-wide grant every
 * registered student holds — so printing «٠ اشتراك شغال» beside «٢٠٠ طالب»
 * would read as a broken number rather than as "this course does not sell
 * subscriptions". `requiresGrant` is the switch, and the badge says which kind
 * of course the reader is looking at before they reach the numbers.
 *
 * See `CourseHeadcountRowSchema` for what each of the two counts, and why
 * neither bounds the other.
 */
export function OverviewCourses({ rows }: { rows: readonly CourseHeadcountRow[] | null }) {
  if (rows === null) {
    return (
      <p className="mb-8 rounded-lg border border-dashed border-line px-4 py-3 text-[length:var(--fs-text-sm)] text-fg-muted">
        {c.coursesUnavailable}
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="mb-8 rounded-lg border border-dashed border-line px-4 py-3 text-[length:var(--fs-text-sm)] text-fg-muted">
        {c.coursesNone}
      </p>
    );
  }

  const shown = rows.slice(0, LIMIT);
  const hidden = rows.length - shown.length;
  // Scaled against the biggest row on the strip. `Math.max(1, …)` so a roster
  // where every course is empty divides by one instead of by zero.
  const max = Math.max(1, ...shown.map((row) => Math.max(row.enrolled, row.subscribed)));

  return (
    <section className="mb-8">
      <div className="group-head">
        <span className="group-head__mark" aria-hidden="true" />
        <h2 className="group-head__title">{c.coursesTitle}</h2>
        <span className="group-head__note">{c.coursesLead}</span>
      </div>

      {/*
        Cards, each with the course's own cover (2026-10-30, «عاوز الكورسات
        تبقى كاردس شكلها حلو وكبير وفيها صور»). The comparison the bars were
        for survives: every bar is still scaled against the biggest course,
        and the number sits on the same line of every card.
      */}
      <ul className="course-cards">
        {shown.map((row) => {
          const lead = row.requiresGrant ? row.subscribed : row.enrolled;
          return (
            <li key={row.courseId} className="panel course-card">
              <Link href={`/admin/courses/${row.courseId}`} className="course-card__art" tabIndex={-1} aria-hidden="true">
                <CourseArt
                  coverKey={row.coverKey}
                  subjectNameAr={row.subjectNameAr}
                  seed={row.courseId}
                  sizes="(min-width: 80rem) 22rem, (min-width: 40rem) 45vw, 92vw"
                />
                <span
                  className={
                    row.requiresGrant
                      ? 'course-count__badge course-count__badge--paid course-card__badge'
                      : 'course-count__badge course-card__badge'
                  }
                >
                  {row.requiresGrant ? c.coursesPaid : c.coursesFree}
                </span>
              </Link>

              <div className="course-card__body">
                <Link href={`/admin/courses/${row.courseId}`} className="course-card__title">
                  {row.title}
                </Link>

                <p className="course-card__count">
                  {lead === 0 ? (
                    <span className="text-fg-muted">{c.coursesEmpty}</span>
                  ) : (
                    <>
                      <span className="course-card__value tabular">{lead}</span>{' '}
                      <span className="text-fg-muted">
                        {row.requiresGrant ? c.coursesSubscribed : c.coursesEnrolled}
                      </span>
                    </>
                  )}
                </p>

                <div className="course-count__track" role="img" aria-label={`${row.title}: ${lead}`}>
                  <span
                    className={
                      row.requiresGrant
                        ? 'course-count__fill course-count__fill--paid'
                        : 'course-count__fill'
                    }
                    // A card with people in it always draws something — a
                    // 1-in-700 bar rounds to nothing and reads as zero.
                    style={{ inlineSize: `${lead > 0 ? Math.max((lead / max) * 100, 3) : 0}%` }}
                  />
                </div>

                {/* Only on a closed course, and only when the two disagree: an
                    enrollment outlives the grant that allowed it. */}
                {row.requiresGrant && row.enrolled !== row.subscribed ? (
                  <p className="course-count__figures">
                    <span className="tabular">{row.enrolled}</span> {c.coursesEnrolled}
                  </p>
                ) : null}

                <div className="course-card__actions">
                  <Link
                    href={`/admin/analytics?courseId=${row.courseId}`}
                    className="course-count__go"
                    aria-label={formatCopy(c.coursesOpenFor, { title: row.title })}
                  >
                    <Users className="size-4 shrink-0" aria-hidden="true" />
                    <span>{c.coursesOpen}</span>
                  </Link>
                  <Link
                    href={`/admin/courses/${row.courseId}`}
                    className="course-count__go"
                    aria-label={formatCopy(c.coursesEditFor, { title: row.title })}
                  >
                    <PencilLine className="size-4 shrink-0" aria-hidden="true" />
                    <span>{c.coursesEdit}</span>
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {hidden > 0 ? (
        <Link
          href="/admin/courses"
          className="mt-2 inline-block text-[length:var(--fs-text-sm)] text-fg-muted underline-offset-4 hover:text-fg hover:underline"
        >
          {formatCopy(c.coursesMore, { n: String(hidden) })}
        </Link>
      ) : null}
    </section>
  );
}
