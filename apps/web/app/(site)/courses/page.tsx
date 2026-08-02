import type { Metadata } from 'next';
import { copy } from '@ayman/contracts';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { CourseCard } from '@/components/site/course-card';
import { JsonLd } from '@/components/seo/json-ld';
import { courseListJsonLd } from '@/lib/seo/jsonld';
import { buildMetadata } from '@/lib/seo/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: copy.catalog.title,
    description: copy.seo.catalogDescription,
    path: '/courses',
  });
}

export default async function CoursesPage() {
  // `getCatalogOrEmpty`, not `getCatalog`: this page is prerendered at build
  // time, and `getCatalog` throws when the API is unreachable — which is
  // always true inside `docker build`, and briefly true on a server during a
  // restart. An empty catalogue for one build is recoverable; a build that
  // will not complete is not. The list refills on the next request, because
  // the fallback is cached for minutes rather than hours.
  const { courses } = await getCatalogOrEmpty();

  return (
    <main>
      {/* null below three courses — the ItemList rich result needs ≥3, and
          the component renders nothing rather than a useless one-item list. */}
      <JsonLd data={courseListJsonLd(courses)} />

      <header className="page-head site-shell">
        <h1 className="page-title">{copy.catalog.title}</h1>
        <p className="site-lead">{copy.catalog.subtitle}</p>
      </header>

      <div className="site-shell">
        <div className="catalog-panel">
          {courses.length === 0 ? (
            <p className="page-empty">{copy.catalog.empty}</p>
          ) : (
            <ul className="courses__grid">
              {courses.map((course) => (
                <CourseCard course={course} key={course.id} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
