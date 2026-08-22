import Link from 'next/link';
import { z } from 'zod';
import { CalendarClock, Layers, Lock } from 'lucide-react';
import { Badge, cn } from '@ayman/ui';
import { copy } from '@ayman/contracts/copy/admin';
import { CourseArt } from '@/components/course-art';
import { apiGetAuthed } from '@/lib/api-server';

const AdminCourseListSchema = z.array(
  z.object({
    id: z.uuid(),
    slug: z.string(),
    title: z.string(),
    subtitle: z.string().nullable(),
    coverKey: z.string().nullable(),
    status: z.enum(['draft', 'published', 'archived']),
    year: z.number().int(),
    requiresGrant: z.boolean(),
    updatedAt: z.iso.datetime(),
    system: z.object({ nameAr: z.string() }),
    track: z.object({ labelAr: z.string() }).nullable(),
    subject: z.object({ nameAr: z.string() }),
    _count: z.object({ lessons: z.number().int() }),
  }),
);

const STATUS_LABEL = {
  draft: copy.admin.course.statusDraft,
  published: copy.admin.course.statusPublished,
  archived: copy.admin.course.statusArchived,
} as const;

/* Amber for published, neutral otherwise. Green is reserved for quiz
   correctness and never used decoratively.

   Archived deliberately does NOT get `warn`: `--warn` is oklch hue 85 and
   `--a-9` is hue 72, so «مؤرشف» and «منشور» would be two amber pills thirteen
   degrees apart — a distinction nobody can read, and one that colour alone
   would not be allowed to carry anyway (WCAG 1.4.1). The WORD is the signal. */
const STATUS_TONE = {
  draft: 'neutral',
  published: 'accent',
  archived: 'neutral',
} as const;

/** `ar-EG`, like every other number on the admin surface — see
 *  `components/admin/charts/format.ts` for why the digits are ١٢٣ here. */
const dateFormatter = new Intl.DateTimeFormat('ar-EG', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const numberFormatter = new Intl.NumberFormat('ar-EG');

function yearLabel(year: number): string {
  if (year === 1) return copy.years.year1;
  if (year === 2) return copy.years.year2;
  return copy.years.year3;
}

export const metadata = { title: copy.admin.course.listTitle };

/**
 * Not cached. The admin list must always reflect the last write — a stale
 * dashboard is how an editor publishes the same course twice.
 *
 * ## Why this is a grid of cards and not a list of rows
 *
 * A course IS its artwork here. The instructor uploads a cover, and until this
 * screen showed one there was nowhere in the admin to find out whether it had
 * landed, or which of thirty courses was still wearing the generated fallback —
 * the row list printed a title, a slug and a badge, and the picture the whole
 * catalog is built around existed only on the edit page, one click away, one
 * course at a time.
 *
 * So the cover goes on top at the size it is actually seen at, and everything
 * that used to be crammed into one grey mono line — الصف، النظام، المسار،
 * المادة، عدد المحاضرات، آخر تعديل — stacks underneath it as separate facts.
 *
 * `CourseArt` is the same component the student's library card renders, which
 * is the point: the tile in the admin and the tile a student sees are the same
 * object, so an editor is looking at the thing they are shipping rather than at
 * an admin-only representation of it.
 */
export default async function AdminCoursesPage() {
  const courses = await apiGetAuthed('/api/admin/courses', AdminCourseListSchema);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">
            {copy.admin.course.listTitle}
          </h1>
          <p className="max-w-[var(--w-prose)] text-fg-muted">{copy.admin.course.listLead}</p>
        </div>
        <Link
          href="/admin/courses/new"
          className="rounded-sm bg-accent px-4 py-2 font-medium text-[#1A1206]"
        >
          {copy.admin.course.new}
        </Link>
      </div>

      {courses.length === 0 ? (
        <p className="text-fg-muted">{copy.admin.course.empty}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => {
            const href = `/admin/courses/${course.id}`;
            const meta = [
              yearLabel(course.year),
              course.system.nameAr,
              course.track?.labelAr,
              course.subject.nameAr,
            ].filter(Boolean);

            return (
              <li key={course.id} className="panel flex flex-col overflow-hidden">
                {/* The art is a second click target for the same destination,
                    not a second LINK to announce: `aria-hidden` + `tabIndex=-1`
                    keep it out of the tab order and out of the accessibility
                    tree, so a keyboard or screen-reader user meets the title
                    once. Same reason the library card links its title rather
                    than wrapping the whole card. */}
                <Link
                  href={href}
                  aria-hidden="true"
                  tabIndex={-1}
                  className={cn(
                    'relative block shrink-0 overflow-hidden',
                    // The ratio belongs to the GENERATED scene, which has no
                    // intrinsic height and collapses without a box. An uploaded
                    // cover brings its own shape and takes the card's full width
                    // at it; the grid stretches its rows, so a row mixing the two
                    // still lines up at the bottom. See the banner in
                    // `course-art.tsx` for why nothing here crops.
                    !course.coverKey && 'aspect-[16/9]',
                  )}
                >
                  <CourseArt
                    coverKey={course.coverKey}
                    subjectNameAr={course.subject.nameAr}
                    seed={course.slug}
                  />

                  {/* Over the artwork, which is a photograph half the time — so
                      the badges sit on their own frosted plate rather than
                      trusting whatever pixel is behind them.

                      `end-3`, NOT `start-3`. `.course-art` is a flex column
                      with `align-items: start`, so the subject glyph's disc
                      occupies the top-INLINE-START corner of every generated
                      scene — a badge there lands on top of it and the two read
                      as one smudged object. The opposite corner is empty in
                      both branches. */}
                  <span className="absolute top-3 end-3 flex flex-wrap items-center gap-1.5 rounded-full bg-[color-mix(in_oklch,var(--n-1),transparent_18%)] p-1 backdrop-blur-sm">
                    <Badge tone={STATUS_TONE[course.status]}>{STATUS_LABEL[course.status]}</Badge>
                    {course.requiresGrant ? (
                      <Badge tone="warn" className="gap-1">
                        <Lock size={11} aria-hidden="true" />
                        {copy.admin.course.lockedBadge}
                      </Badge>
                    ) : null}
                  </span>
                </Link>

                <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
                  <div className="min-w-0">
                    <h2 className="text-[length:var(--fs-title-4)] font-medium">
                      <Link
                        href={href}
                        className="outline-offset-4 transition-colors duration-[160ms] ease-out hover:text-accent-text"
                      >
                        {course.title}
                      </Link>
                    </h2>
                    {course.subtitle ? (
                      <p className="mt-1 line-clamp-2 text-[length:var(--fs-text-sm)] text-fg-muted">
                        {course.subtitle}
                      </p>
                    ) : null}
                  </div>

                  {/* The taxonomy, one fact per chip instead of one mono
                      sentence. `wrap-anywhere` is deliberate: a subject name can
                      be «البرمجة وعلوم الحاسب» inside a 20rem card. */}
                  <ul className="flex flex-wrap gap-1.5">
                    {meta.map((fact) => (
                      <li
                        key={fact}
                        className="rounded-sm border border-study-line bg-study-tint px-2 py-0.5 text-[length:var(--fs-text-xs)] text-study wrap-anywhere"
                      >
                        {fact}
                      </li>
                    ))}
                  </ul>

                  <p className="mono truncate text-[length:var(--fs-mono-label)] text-fg-muted">
                    {course.slug}
                  </p>

                  {/* `mt-auto` pins the counters to the bottom, which is what
                      keeps them on one line across a row of cards whose titles
                      wrap to different heights. */}
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line-subtle pt-3 text-[length:var(--fs-text-xs)] text-fg-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <Layers size={14} aria-hidden="true" className="text-study" />
                      {numberFormatter.format(course._count.lessons)} {copy.catalog.lessonCount}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarClock size={14} aria-hidden="true" className="text-study" />
                      <span className="sr-only">{copy.admin.course.lastUpdated}</span>
                      {dateFormatter.format(new Date(course.updatedAt))}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link href={href} className="chip chip--solid flex-1">
                      {copy.admin.course.open}
                    </Link>
                    {/* Only on a published course. `/courses/:slug` 404s while
                        the course is a draft, so offering it there would be a
                        button that goes to a not-found page. */}
                    {course.status === 'published' ? (
                      <Link href={`/courses/${course.slug}`} className="chip chip--quiet flex-1">
                        {copy.admin.course.preview}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
