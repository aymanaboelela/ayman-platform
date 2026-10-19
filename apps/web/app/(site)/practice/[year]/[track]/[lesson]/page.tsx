import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { arabicCount } from '@ayman/contracts/arabic-count';
import { quizExperience } from '@ayman/contracts/copy/quiz-experience';
import { practiceCopy as p } from '@ayman/contracts/copy/practice';
import { buildMetadata } from '@/lib/seo/metadata';
import { IS_AYMAN } from '@/lib/tenant';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd } from '@/lib/seo/jsonld';
import {
  getPracticeSet,
  parsePracticeTrack,
  parsePracticeYear,
  practiceCourseSlug,
  practicePath,
  unitLook,
  unitNumber,
} from '@/lib/practice/catalog';
import { PracticeRunner } from '@/components/practice/practice-runner';
import { UnitIcon } from '@/components/practice/unit-icon';

type Params = Promise<{ year: string; track: string; lesson: string }>;

/*
 * No `generateStaticParams`: the sets live in the database and the list is
 * empty inside `docker build`, which `cacheComponents` rejects — the reason
 * `news/[slug]/page.tsx` gives. `getPracticeSet` is `'use cache'`d instead.
 */

async function resolve(params: Params) {
  const raw = await params;
  const year = parsePracticeYear(raw.year);
  const track = parsePracticeTrack(raw.track);
  if (!year || !track) return null;
  const code = decodeURIComponent(raw.lesson);
  const set = await getPracticeSet(year, track, code);
  return set ? { year, track, code, set } : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const found = IS_AYMAN ? await resolve(params) : null;
  if (!found) return { robots: { index: false, follow: false } };
  const { year, track, code, set } = found;
  const fill = (t: string) =>
    t
      .replace('{lesson}', set.title)
      .replace('{year}', p.years[year])
      .replace('{track}', p.tracks[track])
      .replace('{count}', arabicCount(set.questions.length, quizExperience.counts.questions));
  return buildMetadata({
    title: fill(p.meta.setTitle),
    description: fill(p.meta.setDescription),
    path: practicePath(year, track, code),
  });
}

export default async function PracticeLessonPage({ params }: { params: Params }) {
  if (!IS_AYMAN) notFound();
  const found = await resolve(params);
  if (!found) notFound();
  const { year, track, code, set } = found;
  const look = unitLook(year, unitNumber(code));

  return (
    <main className="practice-page">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: copy.course.breadcrumbHome, path: '/' },
          { name: p.index.title, path: '/practice' },
          { name: p.years[year], path: practicePath(year) },
          { name: p.tracks[track], path: practicePath(year, track) },
          { name: set.title, path: practicePath(year, track, code) },
        ])}
      />
      <section className="practice-hero practice-hero--lesson" data-tone={look.tone}>
        <div className="site-shell practice-lesson-head">
          <span className="practice-lesson-head__icon" aria-hidden="true">
            <UnitIcon icon={look.icon} size={34} />
          </span>
          <div>
            <Link href={practicePath(year, track)} className="practice-back">
              <ArrowRight size={16} aria-hidden="true" />
              {p.years[year]} · {p.tracks[track]}
            </Link>
            <span className="practice-badge">
              {set.unitTitle ?? p.years[year]} · {p.index.lessonCode} <span className="practice-code">{code}</span>
            </span>
            <h1 className="page-title" data-lang={track === 'languages' ? 'en' : undefined}>
              {set.title}
            </h1>
          </div>
        </div>
      </section>
      <div className="site-shell practice-run">
        <PracticeRunner
          set={set}
          articleHref={set.articleSlug ? `/news/${set.articleSlug}` : null}
          courseHref={`/courses/${practiceCourseSlug(year, track)}`}
        />
      </div>
    </main>
  );
}
