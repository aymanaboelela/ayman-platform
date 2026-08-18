import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { copy } from '@ayman/contracts';
import { buildMetadata } from '@/lib/seo/metadata';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd, courseListJsonLd } from '@/lib/seo/jsonld';
import { isYearIndexable } from '@/lib/seo/year-visibility';
import { CourseCard } from '@/components/site/course-card';
import { courseCountLabel, groupBySubject } from '@/lib/course-groups';

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

  /**
   * A year with no published course is `noindex`, and `app/sitemap.ts` drops it
   * from the sitemap using the SAME `isYearIndexable` — see that function for
   * why the two answers cannot be allowed to disagree.
   *
   * These are not placeholders worth indexing. As of 2026-08-13 the البكالوريا
   * rollout has not reached year 3 at all, and year 1's course is a second-term
   * one that is not up yet — both pages render nothing but «لسه مفيش كورسات
   * منشورة للصف ده». Putting a blank page in front of a student searching
   * «كورسات برمجة تالتة بكالوريا» costs more than not ranking at all.
   *
   * `follow: true` so the links out of an empty year still carry, and the whole
   * thing self-heals: publish a year-3 course and the page is indexable again
   * on the next build, with no code change.
   */
  const { courses } = await getCatalogOrEmpty();
  if (!isYearIndexable(courses, year)) {
    return {
      ...buildMetadata({ title, path: `/years/${year}` }),
      robots: { index: false, follow: true },
    };
  }
  return buildMetadata({
    title,
    // ⚠️ `YEAR_TITLES[year]`, NOT `title` — `title` is already prefixed with
    // `copy.years.title` ("كورسات"), so interpolating it after the literal
    // below shipped "كورسات كورسات الصف الأول بكالوريا" to all three year
    // pages. Google renders the description verbatim in the snippet, so the
    // stutter was visible to every searcher who saw the result.
    description: `كورسات ${YEAR_TITLES[year]} في البرمجة وعلوم الحاسب على ${copy.site.platformName} — ${copy.site.tagline}.`,
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

  /**
   * These three pages are the site's «بكالوريا» landing pages — the title is
   * literally «الصف الأول بكالوريا» — and until now they were the only public
   * catalogue pages emitting no structured data at all. `/courses` and
   * `/courses/[slug]` both do, so a crawler understood the whole catalogue and
   * one course, and understood the year in between as an untyped list of links.
   *
   * Nothing new is described here: both builders already exist and both are
   * fed the SAME `forYear` the grid renders, so a filtered or empty year
   * cannot describe courses that are not on the page. `courseListJsonLd`
   * returns null below three courses and `JsonLd` renders nothing for null,
   * which is why no length check is needed here.
   */
  return (
    <main>
      <JsonLd data={courseListJsonLd(forYear)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: copy.course.breadcrumbHome, path: '/' },
          { name: copy.course.breadcrumbCatalog, path: '/courses' },
          { name: YEAR_TITLES[year] ?? '', path: `/years/${year}` },
        ])}
      />
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

        {/*
          ONE PANEL PER SUBJECT, not one panel holding everything.

          The flat grid inside a single `.catalog-panel` was fine in the
          abstract and wrong at both ends of the catalogue it actually has to
          serve. With today's one published course it drew a card floating in
          the middle of a box most of a screen wide, because
          `.courses__grid:has(> :last-child:nth-child(-n + 2))` centres a short
          row — «يبقى الكورسات جنب بعض». With a full year in it, twenty cards
          ran together with nothing marking where البرمجة ends and قواعد
          البيانات begins.

          Grouping is by subject and the order is the catalogue's own — see
          `groupBySubject`, which documents why not by track and why not
          alphabetical. The panel styling moved from `.catalog-panel` to
          `.catalog-group`, so `/courses` (one flat grid, filtered by CSS) is
          untouched.
        */}
        {forYear.length === 0 ? (
          <div className="catalog-panel">
            <p className="page-empty">{copy.years.empty}</p>
          </div>
        ) : (
          <div className="catalog-groups">
            {groupBySubject(forYear).map((group, groupIndex) => (
              <section className="catalog-group" key={group.subject}>
                <header className="catalog-group__head">
                  <h2 className="catalog-group__title">{group.subject}</h2>
                  <span className="catalog-group__count">
                    {courseCountLabel(group.courses.length)}
                  </span>
                </header>
                <ul className="courses__grid">
                  {group.courses.map((course, index) => (
                    /* The FIRST card of the FIRST group only — it is this
                       page's LCP element, measured at 3.72s on a throttled
                       phone, and preloading one per group would put the later
                       ones in competition with it. See `<CourseCard>`. */
                    <CourseCard
                      course={course}
                      key={course.id}
                      priority={groupIndex === 0 && index === 0}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
