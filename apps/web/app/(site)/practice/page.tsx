import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { practiceCopy as p } from '@ayman/contracts/copy/practice';
import { arabicCount } from '@ayman/contracts/arabic-count';
import { quizExperience } from '@ayman/contracts/copy/quiz-experience';
import { buildMetadata } from '@/lib/seo/metadata';
import { IS_AYMAN } from '@/lib/tenant';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd } from '@/lib/seo/jsonld';
import { PRACTICE_YEARS, practicePath, practiceUnits } from '@/lib/practice/catalog';
import { PracticeBestChip } from '@/components/practice/practice-best-chip';

export async function generateMetadata(): Promise<Metadata> {
  // Ayman's curriculum and his courses — see `lib/practice/catalog.ts`. On
  // any other stack the route 404s and describes nothing.
  if (!IS_AYMAN) return { robots: { index: false, follow: false } };
  return buildMetadata({ title: p.meta.indexTitle, description: p.meta.indexDescription, path: '/practice' });
}

export default function PracticeIndexPage() {
  if (!IS_AYMAN) notFound();

  return (
    <main className="practice-page">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: copy.course.breadcrumbHome, path: '/' },
          { name: p.index.title, path: '/practice' },
        ])}
      />
      <section className="practice-hero">
        <div className="site-shell">
          <span className="practice-badge">{p.index.badge}</span>
          <h1 className="page-title">{p.index.title}</h1>
          <p className="site-lead">{p.index.lead}</p>
        </div>
      </section>

      <div className="site-shell practice-years">
        {PRACTICE_YEARS.map((year) => {
          const units = practiceUnits(year);
          if (units.length === 0) return null;
          return (
            <section key={year} className="practice-year" data-year={year} aria-labelledby={`practice-year-${year}`}>
              <h2 id={`practice-year-${year}`} className="practice-year__title">
                {p.index.yearHeading[year]}
              </h2>
              {units.map((unit) => (
                <div key={unit.title} className="practice-unit">
                  <h3 className="practice-unit__title">{unit.title}</h3>
                  <ul className="practice-grid">
                    {unit.lessons.map((lesson) => (
                      <li key={lesson.code}>
                        <Link href={practicePath(year, lesson.code)} className="practice-lesson">
                          <span className="practice-lesson__code">
                            {p.index.lessonCode} <span className="practice-code">{lesson.code}</span>
                          </span>
                          <span className="practice-lesson__title">{lesson.title}</span>
                          <span className="practice-lesson__meta">
                            {arabicCount(lesson.count, quizExperience.counts.questions)}
                          </span>
                          <PracticeBestChip year={year} code={lesson.code} />
                          <span className="practice-lesson__go" aria-hidden="true">
                            <ArrowLeft size={18} />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </main>
  );
}
