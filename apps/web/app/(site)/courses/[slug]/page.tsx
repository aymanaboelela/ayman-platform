import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowRight,
  CircleHelp,
  FileText,
  Lock,
  Play,
  PlayCircle,
  Paperclip,
  Sparkles,
} from 'lucide-react';
import { copy } from '@ayman/contracts';
import { isComingSoon as catalogIsComingSoon } from '@ayman/contracts/catalog';
import { mediaUrl } from '@ayman/ui/branding';
import { getCourse } from '@/lib/catalog';
import { getPublicSettingsOrDefaults } from '@/lib/settings';
import { getBookShippingCents } from '@/lib/books';
import { formatCopy } from '@ayman/contracts/format';
import { formatEGP } from '@/lib/price';
import { RichText } from '@/components/content/rich-text';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd, courseJsonLd } from '@/lib/seo/jsonld';
import { buildMetadata } from '@/lib/seo/metadata';
import { formatDuration } from '@/components/site/course-card';
import { CourseCover } from '@/components/site/course-cover';
import { CourseStartButton } from '@/components/site/course-start-button';
import { BookOrderButton } from '@/components/site/book-order-button';
import { courseBookCtaVisible } from '@/lib/course-book';
import { CourseSubscribeState } from '@/components/site/course-subscribe-state';
import { CourseEntry } from '@/components/site/course-entry';
import { StreamBadge } from '@/components/stream-badge';

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
  const { contact } = await getPublicSettingsOrDefaults();
  /* The delivery fee «اطلب الكتاب» has to quote. One cached read shared with
     `/books` and every other course page — see `getBookShippingCents`. */
  const shippingCents = await getBookShippingCents();
  const priced =
    course.monthlyPriceCents !== null ||
    course.quarterlyPriceCents !== null ||
    course.yearlyPriceCents !== null ||
    course.terms.length > 0;
  // الكتاب الورقي — entirely independent of `priced` above: a free course
  // can sell a book, and a priced one can sell none. Both `bookTitle` and
  // `bookPriceCents` are set together or not at all (`courses_book_needs_
  // price_and_title`), and the linked catalogue row's `showOnCourse` can then
  // take the CTA away — «الكتاب معروض في المتجر بس مش على صفحة الكورس». One
  // shared predicate with the dashboard card and the player outline, so the
  // three surfaces cannot drift; see `courseBookCtaVisible`.
  const hasBook = courseBookCtaVisible(course);

  /*
   * Zero real LECTURES, not zero rows — `course.lessonCount` already excludes
   * quizzes (`isComingSoon` in `catalog.ts`), and `hasLessons` above does not:
   * it counts every kind, so a course whose only published row is a lone quiz
   * (an exam scaffold, say — `CourseService.setStatus` only requires ONE
   * published lesson of ANY kind to go live) would read `hasLessons: true`
   * with nothing a student could actually watch. This is the stricter, correct
   * check for "is there a curriculum here yet", and `hasLessons` is left alone
   * everywhere else on this page — it still gates the play control below,
   * which is a different question (can THIS row be pressed).
   */
  const isComingSoon = catalogIsComingSoon(course.lessonCount);

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
          <div
            className={
              course.coverKey
                ? 'course-aside__thumb course-aside__thumb--bleed'
                : 'course-aside__thumb'
            }
          >
            {course.coverKey ? (
              /*
               * The same correction made in `<CourseCard>`: the note here said
               * the media origin was not in `next.config`'s `remotePatterns`
               * and that `next/image` would reject these. It has been
               * allowlisted under `pathname: '/media/**'` the whole time, and
               * `mediaUrl()` builds exactly that shape.
               *
               * `fill` is safe: `.course-aside__thumb` is `position: relative`
               * with `aspect-ratio: 16 / 10` (`(site)/styles/pages.css`), so
               * the box exists before the image does, and that file's
               * `object-fit: cover` still lands on the `<img>` Next renders.
               *
               * `sizes` comes off `.course-detail`, which is
               * `minmax(0, 0.8fr) minmax(0, 1.2fr)` above 64rem and one column
               * below it. The aside is the 0.8 — 40% of the shell's content
               * width less the gap, less the card's own 1rem of padding on
               * each side. That is ~483px once `.site-shell` reaches its
               * 1440px cap and stops growing, and tracks ~0.36vw between
               * 1024px and there; below 1024px the aside is the whole column.
               */
              /*
                `<CourseCover>` rather than a bare `<Image>`: this box is 16/10
                and the cover is a designed poster, so cropping it took the top
                off the course's own title on the page that names the course.
              */
              <CourseCover
                coverKey={course.coverKey}
                sizes="(min-width: 1400px) 500px, (min-width: 1024px) 37vw, 92vw"
              />
            ) : (
              <span className="course-card__thumb-mark" aria-hidden="true">
                {`YEAR ${course.year}`}
              </span>
            )}
          </div>

          {priced ? (
            <div className="course-aside__price">
              {course.monthlyPriceCents !== null ? (
                <span className="course-aside__price-row">
                  {formatCopy(copy.course.priceMonthly, { price: formatEGP(course.monthlyPriceCents) })}
                </span>
              ) : null}
              {course.quarterlyPriceCents !== null ? (
                <span className="course-aside__price-row">
                  {formatCopy(copy.course.priceQuarterly, { price: formatEGP(course.quarterlyPriceCents) })}
                </span>
              ) : null}
              {course.terms.map((term) => (
                <span key={term.id} className="course-aside__price-row">
                  {formatCopy(copy.course.priceTerm, { price: formatEGP(term.priceCents), term: term.title })}
                </span>
              ))}
              {course.yearlyPriceCents !== null ? (
                <span className="course-aside__price-row">
                  {formatCopy(copy.course.priceYearly, { price: formatEGP(course.yearlyPriceCents) })}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="course-aside__free">{copy.course.freeBanner}</p>
          )}

          {priced ? (
            // A second instance of the SAME button the play panel carries
            // below — not a lighter link that scrolls to it, and not a
            // second control with its own idea of what a click does. Both
            // instances run `CourseStartButton`'s one click handler
            // (401/403/200 branches, the subscribe dialog); only the label
            // changes, to read as a subscribe CTA this close to the price
            // rather than the "press play" framing lower down. This is what
            // makes the price block «بايِن» — the action right under it,
            // not just further down the page.
            <div className="course-aside__subscribe">
              <CourseStartButton
                courseId={course.id}
                slug={course.slug}
                hasLessons={hasLessons}
                monthlyPriceCents={course.monthlyPriceCents}
                quarterlyPriceCents={course.quarterlyPriceCents}
                yearlyPriceCents={course.yearlyPriceCents}
                terms={course.terms}
                vodafoneCash={contact.vodafoneCash}
                label={copy.subscribe.cta}
              />
              {/* Client-only, renders nothing for the common anonymous
                  visitor — see its own docblock for the signed-in check
                  that gates everything else in it. */}
              <CourseSubscribeState
                courseId={course.id}
                slug={course.slug}
                whatsapp={contact.whatsapp}
              />
            </div>
          ) : null}

          {hasBook ? (
            // Entirely independent of the subscribe block above — a free
            // course renders THIS with no price block at all, and a priced
            // one renders both, stacked. See `hasBook`'s own note.
            <div className="course-aside__subscribe">
              <BookOrderButton
                courseId={course.id}
                bookTitle={course.bookTitle as string}
                bookPriceCents={course.bookPriceCents as number}
                shippingCents={shippingCents}
                vodafoneCash={contact.vodafoneCash}
              />
            </div>
          ) : null}

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
          {/*
            The «لسه هننزل قريبًا» signal — a course a student can already
            subscribe/enroll into with nothing playable in it yet.

            Purely informational: it changes nothing about `CourseStartButton`
            below, priced or free, so pressing it still does exactly what it
            did before this panel existed. It exists so the empty outline
            further down reads as "not up yet" rather than as a page that
            failed to load — the same worry `library.emptyTitle`'s own note
            describes for the signed-in equivalent of this page.

            Placed FIRST in this column, above the play frame, because a
            visitor scanning the page top to bottom should learn this before
            reaching a play button that has nothing behind it.
          */}
          {isComingSoon ? (
            <section className="course-panel course-coming-soon">
              <span className="course-coming-soon__icon" aria-hidden="true">
                <Sparkles size={26} />
              </span>
              <div>
                <p className="course-coming-soon__title">{copy.course.comingSoonTitle}</p>
                <p className="course-coming-soon__body">
                  {course.comingSoonNote ?? copy.course.comingSoonDefaultNote}
                </p>
              </div>
            </section>
          ) : null}

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
            {priced ? (
              // Not a `CourseEntry`: that control's only branch besides
              // "worked" is a 401, so a priced course pressed it, got the
              // SAME 403 `CourseStartButton` gates on, and fell through to
              // `startError` («مقدرناش نفتح الكورس دلوقتي») — a play button
              // that could never actually play anything for a visitor who
              // has not subscribed. `CourseStartButton` right below already
              // owns the real 403 branch (the subscribe panel); this frame
              // stops pretending to be a second one and just says why.
              <div className="course-play__frame course-play__frame--locked" aria-hidden="true">
                {course.coverKey ? (
                  <Image
                    src={mediaUrl(course.coverKey)}
                    alt=""
                    fill
                    sizes="(min-width: 1400px) 780px, (min-width: 1024px) 56vw, 92vw"
                  />
                ) : null}
                <span className="course-play__badge">
                  <Lock size={28} aria-hidden="true" />
                </span>
                <span className="course-play__cta">{copy.course.subscribeToWatch}</span>
              </div>
            ) : (
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
                  /*
                   * The 1.2fr column, so ~60% of the same content width the
                   * aside above takes 40% of: ~773px once the shell caps, and
                   * ~0.55vw between 1024px and there, full width below. It is
                   * the same FILE as the aside's copy and deliberately a
                   * different request — two elements showing one image at two
                   * sizes is precisely what `sizes` being per-element is for,
                   * and asking for one width to serve both would either soften
                   * this frame or overpay for that thumbnail.
                   *
                   * `.course-play__frame img` already declares `position:
                   * absolute; inset: 0` with `object-fit: cover` and the 0.45
                   * dim that buys the play badge its contrast; `fill` restates
                   * the positioning and changes none of the rest.
                   */
                  <Image
                    src={mediaUrl(course.coverKey)}
                    alt=""
                    aria-hidden="true"
                    fill
                    sizes="(min-width: 1400px) 780px, (min-width: 1024px) 56vw, 92vw"
                  />
                ) : null}
                <span className="course-play__badge" aria-hidden="true">
                  <Play size={28} aria-hidden="true" />
                </span>
                <span className="course-play__cta">{copy.course.playCta}</span>
              </CourseEntry>
            )}

            <CourseStartButton
              courseId={course.id}
              slug={course.slug}
              hasLessons={hasLessons}
              monthlyPriceCents={course.monthlyPriceCents}
              quarterlyPriceCents={course.quarterlyPriceCents}
              yearlyPriceCents={course.yearlyPriceCents}
              terms={course.terms}
              vodafoneCash={contact.vodafoneCash}
            />
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

            {priced ? (
              // Every row below is a `CourseEntry` — see the note on the
              // play frame above for why that meant a priced, unsubscribed
              // visitor got a page of buttons that all led to the same
              // generic error. Listing lesson TITLES pre-subscription also
              // gave away that there is currently exactly one — the
              // placeholder "coming soon" lecture — which undercuts the
              // curriculum pitch this section exists to make.
              <p className="course-panel__body">{copy.course.lessonsLockedNote}</p>
            ) : (
              course.sections.map((section, i) => (
              <details className="section-row" key={section.id} open={i === 0}>
                <summary className="section-row__q">
                  <span>
                    {section.title}
                    {section.summary ? (
                      /* ⚠️ NO `opacity` — the weight is what separates this
                         line from the section title above it, and it is enough.
                         At 0.85 the white composited to rgb(247,228,217) over
                         the summary's own rgb(202,74,0), which measures 3.80:1
                         against the 4.5:1 that 15px/400 text has to clear. Full
                         white on the same fill is 4.68:1 and passes. The dark
                         theme was already passing at 5.84:1 and is unharmed —
                         it composites the other way, toward ink. */
                      <span style={{ display: 'block', fontWeight: 400 }}>
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
                    // and «مشاهدة» on one is the kind of small lie that makes a
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
                        {/* Only when the lesson is NARROWER than its course.
                            A course serving both, whose every lecture also
                            serves both, would otherwise repeat the same two
                            chips down the whole outline and say nothing. */}
                        {lesson.forGeneral && lesson.forLanguages ? null : (
                          <StreamBadge
                            forGeneral={lesson.forGeneral}
                            forLanguages={lesson.forLanguages}
                          />
                        )}
                        {/* ⚠️ Rendered only when there IS one. A quiz has no
                            duration, so this printed «0 دقيقة» beside «ادخل
                            الاختبار» — an outline that tells a student a lesson
                            takes zero minutes is worse than one that says
                            nothing, and the two video rows beside it carrying
                            real values made it read as a broken number rather
                            than as an absent one. */}
                        {lesson.durationSeconds || lesson.estimatedSeconds ? (
                          <span className="lesson-row__time">
                            {formatDuration(lesson.durationSeconds ?? lesson.estimatedSeconds)}
                          </span>
                        ) : null}
                        {/* These rows were inert `<li>`s: a title, an icon and
                            a duration, and nothing to press. The accessible
                            name carries the lesson title as well as the verb,
                            because a screen-reader user meeting the eleventh
                            «مشاهدة» of the page learns nothing from it. */}
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
              ))
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
