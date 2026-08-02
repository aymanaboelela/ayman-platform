import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { copy } from '@ayman/contracts';
import { buildMetadata } from '@/lib/seo/metadata';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { CourseCard } from '@/components/site/course-card';

const YEAR_TITLES: Record<number, string> = {
  1: copy.years.year1,
  2: copy.years.year2,
  3: copy.years.year3,
};

/** `free` is the only filter the catalog can answer today — every published
 *  course is free, so the pill is a no-op selector rather than a query. It is
 *  kept because the reference has it and paid courses are on the roadmap. */
type Filter = 'all' | 'free';

function parseYear(raw: string): number | null {
  // `Number('')` is 0 and `Number(' 1 ')` is 1 — neither is a valid segment,
  // so the shape is checked before the value.
  if (!/^[123]$/.test(raw)) return null;
  return Number(raw);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ year: string }>;
}): Promise<Metadata> {
  const year = parseYear((await params).year);
  // An unparseable segment calls `notFound()` in the page below. `noindex`
  // rather than `{}` so a bad inbound link (`/years/9`) cannot leave an
  // indexable URL behind — `{}` inherits the root's `index: true`.
  if (!year) return { robots: { index: false, follow: false } };

  const title = `${copy.years.title} ${YEAR_TITLES[year]}`;
  return buildMetadata({
    title,
    description: `كورسات ${title} في البرمجة وعلوم الحاسب على ${copy.site.platformName} — ${copy.site.tagline}.`,
    path: `/years/${year}`,
  });
}

export default async function YearPage({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const year = parseYear((await params).year);
  if (!year) notFound();

  const filter: Filter = (await searchParams).filter === 'free' ? 'free' : 'all';
  // `getCatalogOrEmpty`, not `getCatalog`: this page is prerendered at build
  // time, and `getCatalog` throws when the API is unreachable — which is
  // always true inside `docker build`, and briefly true on a server during a
  // restart. An empty catalogue for one build is recoverable; a build that
  // will not complete is not. The list refills on the next request, because
  // the fallback is cached for minutes rather than hours.
  const { courses } = await getCatalogOrEmpty();
  const forYear = courses.filter((course) => course.year === year);

  return (
    <main>
      <header className="page-head site-shell">
        <h1 className="page-title">
          {copy.years.title} {YEAR_TITLES[year]}
        </h1>
      </header>

      <div className="site-shell">
        <nav className="filters" aria-label={copy.years.filterAll}>
          <Link
            className="filters__pill"
            href={`/years/${year}`}
            aria-current={filter === 'all'}
            scroll={false}
          >
            {copy.years.filterAll}
          </Link>
          <Link
            className="filters__pill"
            href={`/years/${year}?filter=free`}
            aria-current={filter === 'free'}
            scroll={false}
          >
            {copy.years.filterFree}
          </Link>
        </nav>

        <div className="catalog-panel">
          {forYear.length === 0 ? (
            <p className="page-empty">{copy.years.empty}</p>
          ) : (
            <ul className="courses__grid">
              {forYear.map((course) => (
                <CourseCard course={course} key={course.id} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
