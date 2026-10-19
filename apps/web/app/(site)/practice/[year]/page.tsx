import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Languages } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { PRACTICE_TRACKS } from '@ayman/contracts/practice';
import { practiceCopy as p } from '@ayman/contracts/copy/practice';
import { buildMetadata } from '@/lib/seo/metadata';
import { IS_AYMAN } from '@/lib/tenant';
import { getBrandAsset } from '@/lib/brand-assets';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd } from '@/lib/seo/jsonld';
import { getPracticeListOrEmpty, parsePracticeYear, practicePath, practiceTotals } from '@/lib/practice/catalog';

type Params = Promise<{ year: string }>;

/**
 * «عربي ولا لغات؟» for one year. Reached from the year card's own link; the
 * index already offers both tracks under each year, so this page exists for
 * the shared link «اختبارات تانية ثانوي» and for the breadcrumb.
 */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const year = parsePracticeYear((await params).year);
  if (!IS_AYMAN || !year) return { robots: { index: false, follow: false } };
  return buildMetadata({
    title: p.meta.trackTitle.replace('{year}', p.years[year]).replace(' {track}', ''),
    description: p.meta.trackDescription.replace('{year}', p.years[year]).replace(' ({track})', ''),
    path: practicePath(year),
  });
}

export default async function PracticeYearPage({ params }: { params: Params }) {
  if (!IS_AYMAN) notFound();
  const year = parsePracticeYear((await params).year);
  if (!year) notFound();
  const { sets } = await getPracticeListOrEmpty();
  const poster = getBrandAsset(year === 1 ? 'trackYear1' : 'trackYear2');

  return (
    <main className="practice-page">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: copy.course.breadcrumbHome, path: '/' },
          { name: p.index.title, path: '/practice' },
          { name: p.years[year], path: practicePath(year) },
        ])}
      />
      <section className="practice-hero practice-hero--year" data-year={year}>
        <div className="site-shell practice-hero__grid">
          <div className="practice-hero__copy">
            <Link href="/practice" className="practice-back">
              <ArrowRight size={16} aria-hidden="true" />
              {p.run.back}
            </Link>
            <span className="practice-badge">{p.index.badge}</span>
            <h1 className="page-title">{p.years[year]}</h1>
            <p className="site-lead">{p.index.chooseLead}</p>
          </div>
          {poster ? (
            <Image
              className="practice-hero__poster"
              src={poster.src}
              width={poster.width}
              height={poster.height}
              alt=""
              sizes="(max-width: 48rem) 100vw, 32rem"
              priority
            />
          ) : null}
        </div>
      </section>
      <section className="site-shell practice-tracks">
        {PRACTICE_TRACKS.map((track) => {
          const t = practiceTotals(sets, { year, track });
          return (
            <Link key={track} href={practicePath(year, track)} className="practice-track-card" data-track={track}>
              <span className="practice-track-card__icon" aria-hidden="true">
                <Languages size={30} />
              </span>
              <span className="practice-track-card__title">{p.tracks[track]}</span>
              <span className="practice-track-card__note">{p.trackNotes[track]}</span>
              <span className="practice-track-card__meta">
                {p.index.lessons.replace('{n}', String(t.lessons))} · {t.questions} {p.index.stats.questions}
              </span>
              <span className="practice-btn practice-btn--primary">
                {p.index.open}
                <ArrowLeft size={18} aria-hidden="true" />
              </span>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
