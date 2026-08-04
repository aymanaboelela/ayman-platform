import Link from 'next/link';
import type { Metadata } from 'next';
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
        <p className="eyebrow mb-2 text-fg-muted">{c.eyebrow}</p>
        <h1 className="text-[length:var(--fs-title-1)] font-semibold text-fg">{c.title}</h1>
        <div className="mt-8 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-10 text-center">
          <p className="text-[length:var(--fs-title-4)] font-medium text-fg">{c.empty}</p>
          <Link
            href="/courses"
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
      <header className="mb-8">
        <p className="eyebrow mb-2 text-fg-muted">{c.eyebrow}</p>
        <h1 className="text-[length:var(--fs-title-1)] font-semibold text-fg">{c.title}</h1>
        <p className="mt-2 max-w-[var(--w-prose)] text-fg-muted">{c.subtitle}</p>
      </header>

      {/* The summary card the reference opens with, in flat tokens. */}
      <section className="mb-8 rounded-lg border border-line bg-surface-2 px-5 py-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[length:var(--fs-title-4)] font-medium text-fg">{summary}</p>
          <p className="mono tabular text-[length:var(--fs-mono-label)] text-accent-text">
            {c.percentComplete.replace('{percent}', String(path.percent))}
          </p>
        </div>
        <LessonProgressBar percent={path.percent} label={c.title} />
      </section>

      {/* Two columns, mirroring the reference's shape. The rail is a plain
          list rather than a second nav landmark — the global header already
          owns navigation. */}
      <div className="grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
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
