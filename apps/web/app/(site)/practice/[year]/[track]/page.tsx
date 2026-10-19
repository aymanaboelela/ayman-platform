import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { ArrowLeft, ArrowRight, Languages } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { arabicCount } from '@ayman/contracts/arabic-count';
import { quizExperience } from '@ayman/contracts/copy/quiz-experience';
import { practiceCopy as p } from '@ayman/contracts/copy/practice';
import { buildMetadata } from '@/lib/seo/metadata';
import { IS_AYMAN } from '@/lib/tenant';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd } from '@/lib/seo/jsonld';
import {
  LESSON_CODE,
  getPracticeListOrEmpty,
  parsePracticeTrack,
  parsePracticeYear,
  practicePath,
  practiceTotals,
  practiceUnits,
} from '@/lib/practice/catalog';
import { bestKey } from '@/lib/practice/grade';
import { PracticeBestChip } from '@/components/practice/practice-best-chip';
import { UnitIcon } from '@/components/practice/unit-icon';

type Params = Promise<{ year: string; track: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const raw = await params;
  const year = parsePracticeYear(raw.year);
  const track = parsePracticeTrack(raw.track);
  if (!IS_AYMAN || !year || !track) return { robots: { index: false, follow: false } };
  return buildMetadata({
    title: p.meta.trackTitle.replace('{year}', p.years[year]).replace('{track}', p.tracks[track]),
    description: p.meta.trackDescription.replace('{year}', p.years[year]).replace('{track}', p.tracks[track]),
    path: practicePath(year, track),
  });
}

export default async function PracticeTrackPage({ params }: { params: Params }) {
  if (!IS_AYMAN) notFound();
  const raw = await params;
  const year = parsePracticeYear(raw.year);
  if (!year) notFound();

  /*
   * `/practice/2/2-1` is the URL the first release shipped (Arabic only, no
   * track segment), and it is in the sitemap and in search results already.
   * It is the same set as `/practice/2/arabic/2-1`, so it moves there
   * permanently rather than 404ing a page Google has indexed.
   */
  const segment = decodeURIComponent(raw.track);
  if (LESSON_CODE.test(segment)) permanentRedirect(practicePath(year, 'arabic', segment));

  const track = parsePracticeTrack(segment);
  if (!track) notFound();

  const { sets } = await getPracticeListOrEmpty();
  const units = practiceUnits(sets, year, track);
  const totals = practiceTotals(sets, { year, track });
  const other = track === 'arabic' ? 'languages' : 'arabic';

  return (
    <main className="practice-page">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: copy.course.breadcrumbHome, path: '/' },
          { name: p.index.title, path: '/practice' },
          { name: p.years[year], path: practicePath(year) },
          { name: p.tracks[track], path: practicePath(year, track) },
        ])}
      />
      <section className="practice-hero practice-hero--track" data-track={track}>
        <div className="site-shell">
          <Link href={practicePath(year)} className="practice-back">
            <ArrowRight size={16} aria-hidden="true" />
            {p.years[year]}
          </Link>
          <span className="practice-badge">{p.index.badge}</span>
          <h1 className="page-title">
            {p.years[year]} <span className="practice-hero__track">{p.tracks[track]}</span>
          </h1>
          <p className="site-lead">
            {p.trackNotes[track]} · {p.index.lessons.replace('{n}', String(totals.lessons))} ·{' '}
            {totals.questions} {p.index.stats.questions}
          </p>
          <Link href={practicePath(year, other)} className="practice-switch">
            <Languages size={16} aria-hidden="true" />
            {p.index.otherTrack.replace('{track}', p.tracks[other])}
          </Link>
        </div>
      </section>

      <div className="site-shell practice-units">
        {units.length === 0 ? <p className="practice-empty">{p.index.empty}</p> : null}
        {units.map((unit) => (
          <section key={unit.number} className="practice-unit" data-tone={unit.tone} aria-labelledby={`unit-${unit.number}`}>
            <header className="practice-unit__head">
              <span className="practice-unit__icon">
                <UnitIcon icon={unit.icon} size={24} />
              </span>
              <h2 id={`unit-${unit.number}`} className="practice-unit__title">
                {unit.title}
              </h2>
              <span className="practice-unit__count">{p.index.lessons.replace('{n}', String(unit.sets.length))}</span>
            </header>
            <ul className="practice-grid">
              {unit.sets.map((set) => (
                <li key={set.lessonCode}>
                  <Link href={practicePath(year, track, set.lessonCode)} className="practice-lesson">
                    <span className="practice-lesson__band" aria-hidden="true">
                      <UnitIcon icon={unit.icon} size={18} />
                    </span>
                    <span className="practice-lesson__code">
                      {p.index.lessonCode} <span className="practice-code">{set.lessonCode}</span>
                    </span>
                    <span className="practice-lesson__title" dir={track === 'languages' ? 'ltr' : undefined}>
                      {set.title}
                    </span>
                    <span className="practice-lesson__meta">
                      {arabicCount(set.questionCount, quizExperience.counts.questions)}
                    </span>
                    <PracticeBestChip id={bestKey(year, track, set.lessonCode)} />
                    <span className="practice-lesson__cta">
                      {p.index.start}
                      <ArrowLeft size={16} aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
