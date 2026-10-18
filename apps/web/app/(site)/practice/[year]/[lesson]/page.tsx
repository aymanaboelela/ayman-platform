import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { practiceCopy as p } from '@ayman/contracts/copy/practice';
import { arabicCount } from '@ayman/contracts/arabic-count';
import { quizExperience } from '@ayman/contracts/copy/quiz-experience';
import { buildMetadata } from '@/lib/seo/metadata';
import { IS_AYMAN } from '@/lib/tenant';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd } from '@/lib/seo/jsonld';
import {
  PRACTICE_COURSE,
  allPracticeLessons,
  getPracticeSet,
  parsePracticeYear,
  practiceLesson,
  practicePath,
} from '@/lib/practice/catalog';
import { PracticeRunner } from '@/components/practice/practice-runner';

type Params = Promise<{ year: string; lesson: string }>;

/**
 * Every set is in the repo, so every page prerenders — and the list can never
 * be empty, which `cacheComponents` would reject (see `news/[slug]/page.tsx`).
 */
export function generateStaticParams() {
  return allPracticeLessons().map((l) => ({ year: String(l.year), lesson: l.code }));
}

async function resolve(params: Params) {
  const raw = await params;
  const year = parsePracticeYear(raw.year);
  if (!year) return null;
  // A Next segment arrives percent-encoded in some paths; lesson codes are
  // ASCII, so a decode is only ever a no-op or a fix.
  const code = decodeURIComponent(raw.lesson);
  const set = getPracticeSet(year, code);
  const lesson = practiceLesson(year, code);
  return set && lesson ? { year, code, set, lesson } : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const found = IS_AYMAN ? await resolve(params) : null;
  if (!found) return { robots: { index: false, follow: false } };
  const yearLabel = p.index.yearHeading[found.year];
  const count = arabicCount(found.set.questions.length, quizExperience.counts.questions);
  return buildMetadata({
    title: p.meta.setTitle.replace('{lesson}', found.set.title).replace('{year}', yearLabel),
    description: p.meta.setDescription
      .replace('{count}', count)
      .replace('{lesson}', found.set.title)
      .replace('{year}', yearLabel),
    path: practicePath(found.year, found.code),
  });
}

export default async function PracticeLessonPage({ params }: { params: Params }) {
  if (!IS_AYMAN) notFound();
  const found = await resolve(params);
  if (!found) notFound();
  const { year, code, set, lesson } = found;
  const yearLabel = p.index.yearHeading[year];

  return (
    <main className="practice-page">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: copy.course.breadcrumbHome, path: '/' },
          { name: p.index.title, path: '/practice' },
          { name: set.title, path: practicePath(year, code) },
        ])}
      />
      <section className="practice-hero practice-hero--lesson">
        <div className="site-shell">
          <Link href="/practice" className="practice-back">
            <ArrowRight size={16} aria-hidden="true" />
            {p.run.back}
          </Link>
          <span className="practice-badge">
            {yearLabel} · {p.index.lessonCode} <span className="practice-code">{code}</span>
          </span>
          <h1 className="page-title">{set.title}</h1>
        </div>
      </section>
      <div className="site-shell practice-run">
        <PracticeRunner
          set={set}
          articleHref={`/news/${lesson.article}`}
          courseHref={`/courses/${PRACTICE_COURSE[year]}`}
        />
      </div>
    </main>
  );
}
