import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, CircleHelp, FileText, PlayCircle, Paperclip } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { mediaUrl } from '@ayman/ui/branding';
import { getCourse } from '@/lib/catalog';
import { RichText } from '@/components/content/rich-text';
import { YouTubeEmbed } from '@/components/content/youtube-embed';
import { JsonLd } from '@/components/seo/json-ld';
import { SITE_URL, breadcrumbJsonLd, courseJsonLd, videoObjectJsonLd } from '@/lib/seo/jsonld';
import { formatDuration } from '@/components/site/course-card';

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
  if (!course) return { title: copy.course.notFound };

  const description = course.subtitle ?? course.description ?? copy.site.tagline;

  return {
    title: course.title,
    description,
    // Relative canonicals resolve against metadataBase; setting it
    // absolutely here keeps the value correct even when the page is
    // rendered from a background revalidation with no request context.
    alternates: { canonical: `${SITE_URL}/courses/${course.slug}` },
    openGraph: {
      type: 'website',
      locale: 'ar_EG',
      title: course.title,
      description,
      url: `${SITE_URL}/courses/${course.slug}`,
      siteName: copy.site.name,
    },
  };
}

/**
 * The one free-preview video lesson to feature above the outline, if any —
 * a video id is exposed only for free-preview lessons (the catalog service
 * strips it for everything else, so there is nothing further to check here).
 */
function findPreviewVideo(course: NonNullable<Awaited<ReturnType<typeof getCourse>>>) {
  for (const section of course.sections) {
    for (const lesson of section.lessons) {
      if (lesson.kind === 'video' && lesson.isFreePreview && lesson.videoExternalId) {
        return lesson;
      }
    }
  }
  return null;
}

export default async function CourseDetailPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const course = await getCourse(slug);
  if (!course) notFound();

  const preview = findPreviewVideo(course);

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
      {preview && preview.videoExternalId ? (
        <JsonLd
          data={videoObjectJsonLd({
            externalId: preview.videoExternalId,
            name: preview.title,
            description: course.subtitle ?? course.title,
            durationSeconds: preview.durationSeconds ?? preview.estimatedSeconds,
            uploadDate: course.publishedAt,
          })}
        />
      ) : null}
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
          {preview && preview.videoExternalId ? (
            <section className="course-panel">
              <YouTubeEmbed externalId={preview.videoExternalId} title={preview.title} />
              <p className="course-panel__body">{copy.catalog.freePreview}</p>
            </section>
          ) : null}

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
