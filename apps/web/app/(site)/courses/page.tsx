import { copy } from '@ayman/contracts';
import { getCatalog } from '@/lib/catalog';
import { CourseCard } from '@/components/site/course-card';
import { JsonLd } from '@/components/seo/json-ld';
import { courseListJsonLd } from '@/lib/seo/jsonld';

export const metadata = { title: copy.catalog.title };

export default async function CoursesPage() {
  const { courses } = await getCatalog();

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
