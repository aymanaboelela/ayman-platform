import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BookOpenCheck, Languages, Lightbulb, ListChecks } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { PRACTICE_TRACKS, PRACTICE_YEARS, type PracticeYear } from '@ayman/contracts/practice';
import { practiceCopy as p } from '@ayman/contracts/copy/practice';
import { buildMetadata } from '@/lib/seo/metadata';
import { IS_AYMAN } from '@/lib/tenant';
import { brandImage } from '@/lib/brand-image';
import { getBranding } from '@/lib/settings';
import { ThemedImage } from '@/components/themed-image';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd } from '@/lib/seo/jsonld';
import { getPracticeListOrEmpty, practicePath, practiceTotals } from '@/lib/practice/catalog';
import { PracticeShowcase } from '@/components/practice/practice-showcase';

export async function generateMetadata(): Promise<Metadata> {
  // Ayman's curriculum and his courses — see `lib/practice/catalog.ts`. On
  // any other stack the route 404s and describes nothing.
  if (!IS_AYMAN) return { robots: { index: false, follow: false } };
  return buildMetadata({ title: p.meta.indexTitle, description: p.meta.indexDescription, path: '/practice' });
}

/** Year 2 first: it is the year with an exam at the end of it this term. */
const YEARS_SHOWN: readonly PracticeYear[] = [...PRACTICE_YEARS].reverse();

export default async function PracticeIndexPage() {
  if (!IS_AYMAN) notFound();
  const [{ sets }, branding] = await Promise.all([getPracticeListOrEmpty(), getBranding()]);
  const totals = practiceTotals(sets);

  return (
    <main className="practice-page">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: copy.course.breadcrumbHome, path: '/' },
          { name: p.index.title, path: '/practice' },
        ])}
      />

      <section className="practice-hero practice-hero--split">
        <div className="site-shell practice-hero__grid">
          <div className="practice-hero__copy">
            <span className="practice-badge">{p.index.badge}</span>
            <h1 className="page-title">{p.index.title}</h1>
            <p className="site-lead">{p.index.lead}</p>
            <ul className="practice-stats">
              <li data-tone="accent">
                <ListChecks size={22} aria-hidden="true" />
                <strong>{totals.questions}</strong>
                <span>{p.index.stats.questions}</span>
              </li>
              <li data-tone="ok">
                <BookOpenCheck size={22} aria-hidden="true" />
                <strong>{totals.lessons}</strong>
                <span>{p.index.stats.lessons}</span>
              </li>
              <li data-tone="info">
                <Lightbulb size={22} aria-hidden="true" />
                <span>{p.index.stats.instant}</span>
              </li>
            </ul>
          </div>
          <PracticeShowcase priority />
        </div>
      </section>

      <section className="site-shell practice-choose" aria-labelledby="practice-choose">
        <h2 id="practice-choose" className="practice-choose__title">
          {p.index.chooseHeading}
        </h2>
        <p className="practice-choose__lead">{p.index.chooseLead}</p>

        <div className="practice-years-grid">
          {YEARS_SHOWN.map((year) => {
            const poster = brandImage(branding, year === 1 ? 'trackYear1' : 'trackYear2');
            const yearTotals = practiceTotals(sets, { year });
            return (
              <article key={year} className="practice-year-card" data-year={year}>
                <Link href={practicePath(year)} className="practice-year-card__poster" tabIndex={-1} aria-hidden="true">
                  {poster ? (
                    <ThemedImage
                      image={poster}
                      alt=""
                      sizes="(max-width: 48rem) 100vw, 36rem"
                    />
                  ) : (
                    <span className="practice-year-card__art">{year}</span>
                  )}
                </Link>
                <div className="practice-year-card__body">
                  <h3>
                    <Link href={practicePath(year)}>{p.years[year]}</Link>
                  </h3>
                  <p className="practice-year-card__meta">
                    {p.index.lessons.replace('{n}', String(yearTotals.lessons))} · {yearTotals.questions}{' '}
                    {p.index.stats.questions}
                  </p>
                  <div className="practice-track-buttons">
                    {PRACTICE_TRACKS.map((track) => {
                      const n = practiceTotals(sets, { year, track }).lessons;
                      return (
                        <Link key={track} href={practicePath(year, track)} className="practice-track-btn" data-track={track}>
                          <Languages size={18} aria-hidden="true" />
                          <span className="practice-track-btn__label">{p.tracks[track]}</span>
                          <span className="practice-track-btn__count">
                            {p.index.lessons.replace('{n}', String(n))}
                          </span>
                          <ArrowLeft size={18} aria-hidden="true" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
