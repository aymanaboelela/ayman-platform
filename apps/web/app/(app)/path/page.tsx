import Link from 'next/link';
import type { Metadata } from 'next';
import { Route } from 'lucide-react';
import { LearningPathSchema, copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { apiGetAuthed } from '@/lib/api-server';
import { CourseRail } from '@/components/path/course-rail';
import { PathMap } from '@/components/path/path-map';
import { LessonProgressBar } from '@/components/player/lesson-progress-bar';

const c = copy.path;

export const metadata: Metadata = { title: c.title };

/**
 * The learning path: every enrolled course as an ordered run of nodes, each
 * drawn in the lock state the lesson routes actually enforce.
 *
 * The lock here is a RENDER of a server decision, never the decision itself.
 * Removing it in devtools buys nothing — `/courses/../lessons/..` re-derives
 * the gate on every request and 404s a locked lesson.
 */
export default async function PathPage() {
  const path = await apiGetAuthed('/api/me/path', LearningPathSchema);

  if (path.courses.length === 0) {
    return (
      <main className="mx-auto w-full max-w-[var(--w-shell)] px-6 py-10 md:py-12">
        <header className="study-head">
          <p className="eyebrow mb-2 text-fg-muted">{c.eyebrow}</p>
          <h1 className="study-head__title">{c.title}</h1>
        </header>
        {/* Ember-tinted, like every other empty state in the study surface: a
            container waiting to be filled is structure, and a dashed neutral
            box is indistinguishable from something that failed to load. The
            amber button on it is still the one action. */}
        <div className="rounded-lg border border-study-line bg-study-tint px-6 py-10 text-center">
          <p className="text-[length:var(--fs-title-4)] font-medium text-fg">{c.empty}</p>
          <Link
            href="/library"
            className={cn(
              'mt-5 inline-flex h-10 items-center rounded-sm bg-accent px-4',
              'text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]',
              'transition-colors duration-[160ms] ease-out hover:bg-accent-hover',
            )}
          >
            {c.emptyCta}
          </Link>
        </div>
      </main>
    );
  }

  const summary = c.summary
    .replace('{cleared}', String(path.clearedLessons))
    .replace('{total}', String(path.totalLessons))
    .replace('{courses}', String(path.courses.length));

  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-6 py-10 md:py-12">
      <header className="study-head">
        <p className="eyebrow mb-2 text-fg-muted">{c.eyebrow}</p>
        <h1 className="study-head__title">{c.title}</h1>
        <p className="study-head__lead">{c.subtitle}</p>
      </header>

      {/*
        "Here is where you are", and it must not look like the panels under it.

        The ember tint rather than a full `.stage`: a stage carries a
        title-1, and the `<h1>` two lines above it is already a title-1 — two
        of them stacked leaves the page with two openings and no top. The tint
        does the same job at the right weight, and the disc marks the object as
        chrome (this is the statement ABOUT your courses, not one of them).

        The one amber pair on it is the percentage and the bar it labels, which
        is amber's other job: where you are.
      */}
      <section className="mb-8 rounded-lg border border-study-line bg-study-tint px-5 py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-md bg-stage text-[color:var(--ink-fg)]"
            >
              <Route className="size-5" />
            </span>
            <p className="min-w-0 text-[length:var(--fs-title-4)] font-medium text-fg">
              {summary}
            </p>
          </div>
          <p className="mono tabular shrink-0 text-[length:var(--fs-mono-label)] text-accent-text">
            {c.percentComplete.replace('{percent}', String(path.percent))}
          </p>
        </div>
        <LessonProgressBar percent={path.percent} label={c.title} />
      </section>

      {/* Two columns, mirroring the reference's shape. The rail is a plain
          list rather than a second nav landmark — the global header already
          owns navigation.

          No `.group-head` over this region, deliberately. The only «الكورسات»
          label on the screen is the rail's own eyebrow, inside
          `components/path/course-rail.tsx`; a section heading here would print
          the same word twice, a hand's width apart, at two different sizes.
          When the rail's label moves out of that component, this is where the
          heading belongs. */}
      {/*
        ⚠️ `grid-cols-[minmax(0,1fr)]` ON THE PHONE TOO, and it is not a tidy-up
        of the `lg:` rule below — without it this screen hangs off the side.

        A single-column grid with no `grid-template-columns` gets one IMPLICIT
        column, which is sized `auto` — that is `minmax(min-content, max-content)`,
        so the column is never allowed to be narrower than its widest item's
        min-content. `<PathMap>`'s header measures 399px there (a 40px subject
        mark, a 52px ring, gaps, the «{cleared}/{total}» counter, and a `truncate`
        title, which is `white-space: nowrap` and therefore contributes its FULL
        width to min-content). At 412px, less this page's `px-6`, the column had
        364px to play with and took 451 — and because the document is RTL the
        overflow goes LEFT, so the rail and every course header sat half off the
        inline start with nothing to scroll to. Reported as «في الموبايل بتبقى
        لازقة على الشمال».

        `minmax(0, 1fr)` floors the track at zero, so the column is the container
        and the flex rows inside it are finally allowed to shrink — which is what
        makes the `truncate` on the course title actually ellipsise instead of
        simply refusing to wrap. Nothing changes above `lg`, where the explicit
        template already said the same thing about the map column.
      */}
      <div className="grid gap-8 grid-cols-[minmax(0,1fr)] lg:grid-cols-[18rem_minmax(0,1fr)]">
        <CourseRail courses={path.courses} currentCourseId={path.currentCourseId} />

        <div className="space-y-10">
          {path.courses.map((course, i) => (
            <div key={course.id} id={`course-${course.id}`} className="scroll-mt-6">
              {/* `index` is what numbers the course in its own header ring.
                  Without it `index + 1` was `NaN`, and every course on this
                  screen introduced itself as "الكورس NaN". */}
              <PathMap course={course} index={i} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
