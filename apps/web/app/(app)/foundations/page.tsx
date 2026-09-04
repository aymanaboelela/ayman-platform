import type { Metadata } from 'next';
import Link from 'next/link';
import { copy } from '@ayman/contracts';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { foundationCourses } from '@/lib/foundation-courses';
import { CourseArt } from '@/components/course-art';
import { formatDuration } from '@/lib/format';
import { ESSENTIAL_TERMS } from '@/lib/essentials-terms';

const e = copy.essentials;

export const metadata: Metadata = { title: e.appTitle };

/**
 * The twelve terms, inside the student shell.
 *
 * ## Why this exists next to the public `/essentials`
 *
 * Same twelve definitions, different reader. `/essentials` is a marketing
 * page: a liquid hero, a WARM-UP badge, and a closing «نختار صفّك» — all of
 * which are wrong for someone who has already chosen their year and is looking
 * something up mid-lesson. Clicking «التأسيس» in the rail used to leave the
 * dashboard entirely to land there.
 *
 * The definitions themselves come from `lib/essentials-terms.ts`, which both
 * pages read. Two copies of a glossary drift the first time either definition
 * is retouched.
 *
 * ## Why it is a plain static grid
 *
 * No search box, no filter, no client component. Twelve items fit on one
 * screen at desktop widths and are one `⌘F` away everywhere else; a search
 * input over twelve rows is chrome that costs a hydration boundary and saves
 * nobody a scroll.
 */
export default async function FoundationsPage() {
  /*
   * The same selection the public page makes — see `lib/foundation-courses.ts`.
   * `getCatalogOrEmpty` rather than `getCatalog` for the reason that file gives:
   * an unreachable API must cost this screen its course strip, not its glossary.
   */
  const { courses } = await getCatalogOrEmpty();
  const foundation = foundationCourses(courses);

  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-6 py-10 md:py-12">
      <header className="mb-8">
        <p className="eyebrow mb-2 text-fg-muted">{e.appEyebrow}</p>
        <h1 className="text-[length:var(--fs-title-1)] font-semibold text-fg">{e.appTitle}</h1>
        <p className="mt-2 max-w-[var(--w-prose)] text-fg-muted">{e.appSubtitle}</p>
      </header>

      {/*
        The COURSE, above the vocabulary — the same correction the public
        `/essentials` just took. «التأسيس» in the rail is the same word the
        landing page's third track card carries, and it landed on twelve
        definitions with no route to the foundation course that is published.
        A student who opens this from the rail is at least as likely to want to
        START as to look a term up.

        `/library/{slug}`, NOT `/courses/{slug}`: this reader is already inside
        the shell, and sending them out to the marketing surface is the exact
        bug `(app)/library` exists to prevent. That route renders for a student
        who is not enrolled too — it shows the outline and an enrol CTA.
      */}
      {foundation.length > 0 ? (
        <section className="mb-10">
          <p className="eyebrow mb-3 text-fg-muted">{e.courseBadge}</p>
          {/* A third column from `2xl`, and only there. These are horizontal
              cards — a 128px thumbnail and two lines of text — so at two
              columns on a `--w-app` page each one is ~760px wide and most of
              that is blank to the inline end of the title. Three is the count
              at which the row is dense without the title truncating. */}
          <ul className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {foundation.map((course) => (
              <li key={course.id}>
                <Link
                  href={`/library/${course.slug}`}
                  className="panel flex items-center gap-4 overflow-hidden p-3 transition-colors duration-[160ms] ease-out hover:border-[color:var(--border-strong)]"
                >
                  <span className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-[var(--r-sm)]">
                    <CourseArt
                      coverKey={course.coverKey}
                      subjectNameAr={course.subjectNameAr}
                      seed={course.slug}
                      compact
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-fg">{course.title}</span>
                    <span className="mono tabular mt-1 block text-[length:var(--fs-mono-label)] text-fg-muted">
                      {course.lessonCount} {copy.catalog.lessonCount} · {formatDuration(course.totalSeconds)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ESSENTIAL_TERMS.map((term, index) => (
          <li className="panel flex flex-col gap-2 p-4" key={term.en}>
            <div className="flex items-baseline justify-between gap-3">
              {/* The English keyword is a CODE token, not prose: it keeps the
                  mono face and an explicit `dir="ltr"`, because `Input / Output`
                  reorders around the slash under the page's RTL base direction. */}
              <span
                dir="ltr"
                className="mono text-[length:var(--fs-mono-label)] text-accent-text"
              >
                {term.en}
              </span>
              <span className="mono tabular text-[length:var(--fs-mono-label)] text-fg-muted">
                {String(index + 1).padStart(2, '0')}
              </span>
            </div>
            <h2 className="text-[length:var(--fs-title-4)] font-medium text-fg">{term.ar}</h2>
            <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{term.body}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
