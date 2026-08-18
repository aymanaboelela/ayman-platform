import type { Metadata } from 'next';
import { copy } from '@ayman/contracts';
import { buildMetadata } from '@/lib/seo/metadata';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { foundationCourses } from '@/lib/foundation-courses';
import { JsonLd } from '@/components/seo/json-ld';
import {
  SITE_URL,
  breadcrumbJsonLd,
  courseListJsonLd,
  definedTermSetJsonLd,
} from '@/lib/seo/jsonld';
import { CourseCard } from '@/components/site/course-card';
import { LiquidBackdrop } from '@/components/site/liquid-backdrop';
import { SpotlightGrid } from '@/components/site/spotlight-grid';
import { ESSENTIAL_TERMS, termSlug } from '@/lib/essentials-terms';

const e = copy.essentials;


export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ title: e.title, description: e.listLead, path: '/essentials' });
}

export default async function EssentialsPage() {
  /*
   * `getCatalogOrEmpty`, not `getCatalog`: this page is prerendered, and
   * `getCatalog` throws when the API is unreachable — which is always true
   * inside `docker build`. An empty catalogue means the course section below
   * simply does not render, and the twelve definitions — which are the page —
   * are untouched. Same trade `/years/[year]` documents.
   */
  const { courses } = await getCatalogOrEmpty();
  const foundation = foundationCourses(courses);

  return (
    <main>
      {/* The twelve definitions are the reason this page gets cited — see
          `definedTermSetJsonLd`. The `termUrl` closure is what keeps the
          published anchors and the `id`s on the list items below in step. */}
      <JsonLd
        data={definedTermSetJsonLd(
          ESSENTIAL_TERMS,
          (term) => `${SITE_URL}/essentials#${termSlug(term)}`,
        )}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: copy.course.breadcrumbHome, path: '/' },
          { name: e.title, path: '/essentials' },
        ])}
      />
      <section className="essentials-hero">
        <LiquidBackdrop className="essentials-hero__fluid" />
        <div className="essentials-hero__wash" aria-hidden="true" />
        <div className="site-shell">
          <span className="site-badge">{e.badge}</span>
          <h1 className="page-title" style={{ marginTop: '1rem' }}>
            {e.title}
          </h1>
          <p className="site-lead">
            {e.leadBefore} <code className="code-chip">{e.leadCode}</code> {e.leadAfter}
          </p>
        </div>
      </section>

      {/*
        THE COURSE, ABOVE THE GLOSSARY.

        «التأسيس» on the landing page promised a starting point and delivered a
        dictionary: twelve definitions, a «نختار صفّك» button that went straight
        back to the year picker the reader had just come from, and no way from
        here to the foundation course that is actually published — «يبقى فيه
        برضه الكورس التأسيسي اللي نزل على المنصة». A reader who presses «ابدأ من
        هنا» is asking to begin, so the thing they can begin comes first and the
        vocabulary they will need while doing it comes under it. That button is
        now gone from the hero entirely («شيلها خالص») — this section is the
        answer to "what do I start", so a link back to the picker above it was
        competing with it.

        Rendered only when the catalogue actually has one (see
        `lib/foundation-courses.ts`), so the page never grows an empty section —
        and `courseListJsonLd` returns null below three courses, which is why no
        length check guards the `<JsonLd>`.
      */}
      {foundation.length > 0 ? (
        <section className="site-section">
          <JsonLd data={courseListJsonLd(foundation)} />
          <div className="site-shell">
            <p style={{ textAlign: 'center' }}>
              <span className="site-badge">{e.courseBadge}</span>
            </p>
            <h2 className="site-h2" style={{ textAlign: 'center', marginTop: '1rem' }}>
              {e.courseTitle}
            </h2>
            <p
              className="site-lead"
              style={{ textAlign: 'center', maxWidth: '40rem', marginInline: 'auto' }}
            >
              {e.courseLead}
            </p>

            {/* `electric` for the same reason the landing's featured strip has
                it and `/courses` does not: this is a showpiece of one or two
                cards, not a catalogue grid, so the per-card canvas is a
                flourish rather than a fan-spinning scroll. */}
            <ul className="courses__grid" style={{ marginTop: '2.5rem' }}>
              {foundation.map((course, index) => (
                <CourseCard
                  course={course}
                  key={course.id}
                  electric
                  priority={index === 0}
                />
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="site-section">
        <div className="site-shell">
          <h2 className="site-h2" style={{ textAlign: 'center' }}>
            {e.listTitle}
          </h2>
          <p className="site-lead" style={{ textAlign: 'center', maxWidth: '40rem', marginInline: 'auto' }}>
            {e.listLead}
          </p>

          <SpotlightGrid>
            <ul id="glossary" className="terms__grid">
              {ESSENTIAL_TERMS.map((term, i) => (
                /* `id` is what makes the `url` published for this term in the
                   JSON-LD resolve to the definition instead of the page top. */
                <li className="term" data-spot-card id={termSlug(term)} key={term.en}>
                  <div className="term__head">
                    <span className="term__en">{term.en}</span>
                    <span className="term__n">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <h3 className="term__ar">{term.ar}</h3>
                  <p className="term__body">{term.body}</p>
                </li>
              ))}
            </ul>
          </SpotlightGrid>
        </div>
      </section>
    </main>
  );
}
