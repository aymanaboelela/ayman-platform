import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, CircleHelp, FileText, Play, PlayCircle, Paperclip } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { mediaUrl } from '@ayman/ui/branding';
import { getCourse } from '@/lib/catalog';
import { RichText } from '@/components/content/rich-text';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd, courseJsonLd } from '@/lib/seo/jsonld';
import { buildMetadata } from '@/lib/seo/metadata';
import { formatDuration } from '@/components/site/course-card';
import { CourseStartButton } from '@/components/site/course-start-button';
import { CourseEntry } from '@/components/site/course-entry';

const LESSON_ICON = {
  video: PlayCircle,
  quiz: CircleHelp,
  attachment: Paperclip,
  text: FileText,
} as const;

type Params = { slug: string };

/**
 * Prerenders every currently-published course at build time — a genuine
 * performance win, and it is deliberately NOT paired with `dynamicParams =
 * false`: that would 404 any course published after the last build until
 * the next deploy, which defeats the entire point of `updateTag()` making a
 * publish visible immediately. `dynamicParams` therefore stays at its
 * default (`true`), so an unlisted slug still renders on demand.
 *
 * ⚠️ KNOWN LIMITATION, verified against both `next dev` and a production
 * `next build && next start`: because this route depends on fetched data to
 * decide whether to call `notFound()`, and this app has `cacheComponents:
 * true` globally (Next 16 Cache Components/PPR), the response for an
 * unlisted or draft slug streams — the 200 status line is committed before
 * `notFound()` resolves, so the HTML body correctly renders the not-found
 * UI (confirmed empty of any draft data) but the outer HTTP status stays
 * 200 instead of 404. Every officially documented mitigation was tried and
 * did not change this for a route without full static coverage: moving the
 * check before any other `await`, removing `loading.tsx`, removing `'use
 * cache'` from `getCourse`, and `htmlLimitedBots`. The actual security/data
 * boundary is unaffected — `GET /api/catalog/courses/:slug` (the real data
 * source) returns a genuine 404 for both cases, verified directly — this
 * note exists so nobody mistakes the page's status code for a fixable
 * regression before checking the API first.
 */
/**
 * There is deliberately NO `generateStaticParams` here.
 *
 * It used to call `getCatalog()`, which throws when the API is unreachable —
 * so `next build` died with ECONNREFUSED on this route unless an API was
 * already running. That is impossible to satisfy inside `docker build`, where
 * no API exists yet.
 *
 * Returning an empty list instead does NOT work either: under Cache
 * Components, Next 16 rejects an empty result with
 * `EmptyGenerateStaticParamsError`, because it cannot then validate the route
 * for dynamic access at build time.
 *
 * Omitting the function entirely is the honest answer. Course pages render on
 * demand and are cached from then on — which is already what happens to every
 * course published after a build. The only thing lost is a warm cache for
 * courses that existed at build time, and the thing gained is a build that
 * does not depend on a running database.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const course = await getCourse(slug);
  // A missing course renders `notFound()` below, so this title is only ever
  // seen for the fraction of a second before the 404 commits — but it must
  // still be `noindex`, or a deleted course's URL keeps its index entry.
  if (!course) return { title: copy.course.notFound, robots: { index: false, follow: false } };

  return buildMetadata({
    title: course.title,
    description: course.subtitle ?? course.description ?? copy.site.tagline,
    path: `/courses/${course.slug}`,
    // A course IS an article-like object with a subject and an author, and
    // `article` is what makes Facebook/WhatsApp render the large card rather
    // than the compact link preview students would otherwise see.
    type: 'article',
    // `buildMetadata` falls back to the admin's site-wide OG image; a course
    // with its own cover should use that instead, and `mediaUrl` is already
    // absolute, so it needs no metadataBase resolution.
    image: course.coverKey ? mediaUrl(course.coverKey) : null,
  });
}

/**
 * ⚠️ There used to be a `findPreviewVideo()` here, feeding a `<YouTubeEmbed>`
 * and a `videoObjectJsonLd` block further down. Both are gone, and neither
 * should come back.
 *
 * Together they played a lesson to anybody who opened this URL — no account, no
 * session, nothing — and then announced the same YouTube id a second time in
 * the page's structured data for good measure. The catalog API no longer
 * publishes `videoExternalId` at all
 * (`2026-08-03-login-gated-content-design.md` §4.1), so there is nothing left
 * to embed; what stands in its place is the play panel below, which opens the
 * real player behind a session instead of streaming a lesson to nobody in
 * particular.
 *
 * The rest of the page is untouched on purpose. Titles, descriptions, section
 * and lesson names, durations and `courseJsonLd` all still render for anonymous
 * visitors and crawlers — gating the catalog too would have taken the platform
 * out of search results, which is how students find it in the first place
 * (§3.1).
 */
export default async function CourseDetailPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const course = await getCourse(slug);
  if (!course) notFound();

  const hasLessons = course.sections.some((section) => section.lessons.length > 0);

  return (
    <main>
      <JsonLd data={courseJsonLd(course)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: copy.course.breadcrumbHome, path: '/' },
          { name: copy.course.breadcrumbCatalog, path: '/courses' },
          { name: course.title, path: `/courses/${course.slug}` },
        ])}
      />
      <header className="course-hero">
        <div className="site-shell">
          <nav aria-label={copy.course.breadcrumbCatalog}>
            <Link href="/courses" className="course-hero__back">
              <ArrowRight size={16} aria-hidden="true" />
              {copy.course.back}
            </Link>
          </nav>
          <h1 className="course-hero__title">{course.title}</h1>
          <p className="course-hero__sub">
            {course.subtitle ??
              `${course.systemNameAr} · ${course.subjectNameAr}${
                course.trackLabelAr ? ` · ${course.trackLabelAr}` : ''
              }`}
          </p>
        </div>
      </header>

      <div className="site-shell course-detail">
        <aside className="course-aside">
          <div className="course-aside__thumb">
            {course.coverKey ? (
              // Covers are user uploads from the media origin, which is not in
              // `next.config`'s remotePatterns — `next/image` would reject them.
              <img src={mediaUrl(course.coverKey)} alt="" />
            ) : (
              <span className="course-card__thumb-mark" aria-hidden="true">
                {`YEAR ${course.year}`}
              </span>
            )}
          </div>

          <p className="course-aside__free">{copy.course.freeBanner}</p>

          <p className="course-aside__label">{copy.course.lessonsLabel}</p>
          <ul className="course-aside__list">
            {course.sections.map((section) => (
              <li key={section.id}>
                <PlayCircle size={15} aria-hidden="true" />
                {section.title}
              </li>
            ))}
          </ul>
        </aside>

        <div>
          {/* Where the anonymous player used to be. The backdrop is the course
              COVER, not `youTubeThumbnailUrl(externalId)` — the thumbnail would
              need exactly the id this design just stopped publishing.

              This frame used to carry a padlock. It said "locked" to every
              visitor alike, including the student who was signed in and
              already enrolled — a cached page asserting a session state it
              cannot read. The frame is now the play control itself: pressing
              it enrolls and opens the course for a student, and sends a
              stranger to `/login?next=` back to here. Both are true of the
              same HTML, which is the only kind of promise this page may make. */}
          <section className="course-panel course-play">
            <CourseEntry
              courseId={course.id}
              slug={course.slug}
              className="course-play__frame"
              /*
               * The accessible name STARTS with the visible label, and that
               * ordering is the requirement, not a preference.
               *
               * It read «شغّل «<course>»» — which does not contain the visible
               * «شغّل الكورس» as a substring, so a speech-input user saying the
               * words printed on the page could not activate the page's main
               * control (WCAG 2.5.3, Label in Name; confirmed by running axe's
               * `label-content-name-mismatch` against the live page — 1
               * violation). Note that `a11y.e2e.ts` cannot catch this: the rule
               * is tagged `experimental` and the suite runs by WCAG tag, so
               * that run stays green while the defect is real.
               *
               * Composed here rather than as a `{course}` template so the
               * visible label and the spoken one cannot drift: there is one
               * string, and the title is appended to it.
               */
              ariaLabel={`${copy.course.playCta} — ${course.title}`}
              // A published course with no published lessons has nowhere to
              // send anyone. `CourseStartButton` below has always known that;
              // this control did not.
              disabled={!hasLessons}
            >
              {course.coverKey ? (
                <img src={mediaUrl(course.coverKey)} alt="" aria-hidden="true" />
              ) : null}
              <span className="course-play__badge" aria-hidden="true">
                <Play size={28} aria-hidden="true" />
              </span>
              <span className="course-play__cta">{copy.course.playCta}</span>
            </CourseEntry>

            <CourseStartButton courseId={course.id} slug={course.slug} hasLessons={hasLessons} />
          </section>

          <section className="course-panel">
            <h2 className="course-panel__h">{copy.course.about}</h2>
            {course.description ? (
              <RichText html={course.description} className="course-panel__body" />
            ) : (
              <p className="course-panel__body">{course.subtitle ?? course.title}</p>
            )}
          </section>

          <section className="course-panel">
            <h2 className="course-panel__h" style={{ marginBottom: '1rem' }}>
              {copy.course.lessons}
            </h2>

            {course.sections.map((section, i) => (
              <details className="section-row" key={section.id} open={i === 0}>
                <summary className="section-row__q">
                  <span>
                    {section.title}
                    {section.summary ? (
                      <span style={{ display: 'block', fontWeight: 400, opacity: 0.85 }}>
                        {section.summary}
                      </span>
                    ) : null}
                  </span>
                  <span className="section-row__count">({section.lessons.length})</span>
                </summary>

                <ul className="section-row__lessons">
                  {section.lessons.map((lesson) => {
                    const Icon = LESSON_ICON[lesson.kind];
                    // The row's own verb. A quiz is not something you watch,
                    // and «اتفرّج» on one is the kind of small lie that makes a
                    // student distrust every other label on the page.
                    const action =
                      lesson.kind === 'quiz' ? copy.course.takeQuiz : copy.course.watch;

                    return (
                      <li className="lesson-row" key={lesson.id}>
                        <Icon size={16} className="lesson-row__icon" aria-hidden="true" />
                        <span className="lesson-row__title">{lesson.title}</span>
                        {lesson.isFreePreview ? (
                          <span className="lesson-row__badge">{copy.catalog.freePreview}</span>
                        ) : null}
                        <span className="lesson-row__time">
                          {formatDuration(lesson.durationSeconds ?? lesson.estimatedSeconds)}
                        </span>
                        {/* These rows were inert `<li>`s: a title, an icon and
                            a duration, and nothing to press. The accessible
                            name carries the lesson title as well as the verb,
                            because a screen-reader user meeting the eleventh
                            «اتفرّج» of the page learns nothing from it. */}
                        <CourseEntry
                          courseId={course.id}
                          slug={course.slug}
                          lessonId={lesson.id}
                          className="lesson-row__go"
                          ariaLabel={`${action} ${lesson.title}`}
                        >
                          {action}
                        </CourseEntry>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}
