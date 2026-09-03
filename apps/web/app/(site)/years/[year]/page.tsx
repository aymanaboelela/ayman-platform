import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { copy } from '@ayman/contracts';
import { buildMetadata } from '@/lib/seo/metadata';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { isFreeCourse } from '@/lib/price';
import { foundationCoursesOutsideYear } from '@/lib/foundation-courses';
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

/**
 * `all` | `free` — and it is a real query now.
 *
 * This used to be documented as a no-op «because every published course is
 * free». That stopped being true the day the البكالوريا courses went up at
 * 150 ج/الشهر, and the pill kept rendering, kept taking the press, kept
 * setting `?filter=free`, and kept showing the paid cards — «الفلتر اللي فوق
 * مش شغال أصلاً». A control that changes nothing is worse than no control:
 * it teaches the reader that the page's filters lie.
 */
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
   * one that is not up yet — neither page has a course of its own. Putting a
   * blank page in front of a student searching «كورسات برمجة تالتة بكالوريا»
   * costs more than not ranking at all.
   *
   * ⚠️ THE FOUNDATION COURSE DOES NOT COUNT, and that is why this still asks
   * `isYearIndexable(courses, year)` rather than «does the page render a
   * card». That course is now listed on every year page that does not own it,
   * so counting it would make all three indexable on the strength of the SAME
   * single card — three near-identical pages competing for three different
   * queries, none of which they answer. It is there for the reader who already
   * arrived, not to make an empty year rank.
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
  // The pill's own predicate — see `isFreeCourse` for why the book price is
  // not part of it. `all` keeps everything, so the filter is applied once,
  // here, and both lists below inherit it.
  const visible =
    filter === 'free' ? courses.filter((course) => isFreeCourse(course)) : courses;
  const forYear = visible.filter((course) => course.year === year);
  /* The تأسيس course belongs to whoever has not started yet, not to a year —
     see `foundationCoursesOutsideYear`. Empty on the year that already lists
     it under its own subject, so nothing is ever shown twice. */
  const foundation = foundationCoursesOutsideYear(visible, year);
  const listed = [...foundation, ...forYear];

  /**
   * These three pages are the site's «بكالوريا» landing pages — the title is
   * literally «الصف الأول بكالوريا» — and until now they were the only public
   * catalogue pages emitting no structured data at all. `/courses` and
   * `/courses/[slug]` both do, so a crawler understood the whole catalogue and
   * one course, and understood the year in between as an untyped list of links.
   *
   * Nothing new is described here: both builders already exist and both are
   * fed the SAME `listed` the grid renders — the year's own courses AND the
   * foundation course above them — so a filtered or empty year cannot describe
   * courses that are not on the page. `courseListJsonLd` returns null below
   * three courses and `JsonLd` renders nothing for null, which is why no
   * length check is needed here.
   */
  return (
    <main>
      <JsonLd data={courseListJsonLd(listed)} />
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
        {listed.length === 0 ? (
          <div className="catalog-panel">
            <p className="page-empty">
              {filter === 'free' ? copy.years.emptyFree : copy.years.empty}
            </p>
          </div>
        ) : (
          <div className="catalog-groups">
            {/*
              THE FOUNDATION COURSE, ABOVE THE YEAR'S OWN SUBJECTS.

              It is not one of them and it must not be filed as one: it carries
              `year: 2` on the contract, so grouping it in would have put «كورس
              تأسيس» under «البرمجة» on a page headed «الصف الأول بكالوريا» and
              told the reader it was a first-year course. Its own section, with
              a lead that says the course belongs to no year, is the honest
              shape — and on year 2, where the course IS the year's, this list
              is empty and the section does not render at all.
            */}
            {foundation.length > 0 ? (
              <section className="catalog-group catalog-group--foundation">
                <header className="catalog-group__head">
                  <h2 className="catalog-group__title">{copy.years.foundationTitle}</h2>
                  <span className="catalog-group__badge">{copy.years.foundationBadge}</span>
                  <span className="catalog-group__count">
                    {courseCountLabel(foundation.length)}
                  </span>
                </header>
                <p className="catalog-group__lead">{copy.years.foundationLead}</p>
                <ul className="courses__grid">
                  {foundation.map((course, index) => (
                    <CourseCard course={course} key={course.id} priority={index === 0} />
                  ))}
                </ul>
              </section>
            ) : null}

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
                    /* The FIRST card on the page only — it is this page's
                       LCP element, measured at 3.72s on a throttled phone, and
                       preloading one per group would put the later ones in
                       competition with it. The foundation section renders
                       ABOVE these, so when it exists the preload belongs to
                       its first card and not to this one. See `<CourseCard>`. */
                    <CourseCard
                      course={course}
                      key={course.id}
                      priority={
                        foundation.length === 0 && groupIndex === 0 && index === 0
                      }
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
