import Link from 'next/link';
import { copy } from '@ayman/contracts';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { CourseCard } from '@/components/site/course-card';

const c = copy.landing;

/** How many rows the landing shows before sending people to the full catalog. */
const FEATURED_LIMIT = 3;

export interface FeaturedCoursesProps {
  title?: string;
  lead?: string;
  ctaLabel?: string;
  limit?: number;
  /** Explicit ids curate the row; empty means "the newest `limit` courses". */
  courseIds?: readonly string[];
}

/**
 * Server component: reads the cached catalog directly rather than taking
 * courses as a prop, so the landing page stays a plain composition of sections
 * and no parent has to thread data through it.
 *
 * Reads through `getCatalogOrEmpty`, so an unreachable API costs this one
 * section rather than the whole landing — this is the marketing front door, the
 * page that has to keep working while the API is being deployed or restarted.
 * `/courses` deliberately uses the strict loader instead: there, "no courses"
 * and "the backend is down" are different answers and the second should surface.
 */
export async function FeaturedCourses({
  title = c.coursesTitle,
  lead = c.coursesLead,
  ctaLabel = c.coursesCta,
  limit = FEATURED_LIMIT,
  courseIds = [],
}: FeaturedCoursesProps = {}) {
  const { courses } = await getCatalogOrEmpty();

  // A curated row keeps the ADMIN's order, not the catalogue's — an editor who
  // drags three ids into a specific sequence means that sequence. Ids that no
  // longer resolve (unpublished, deleted) are dropped rather than rendered as
  // holes; the row simply gets shorter.
  const featured =
    courseIds.length > 0
      ? courseIds
          .map((id) => courses.find((course) => course.id === id))
          .filter((course) => course !== undefined)
          .slice(0, limit)
      : courses.slice(0, limit);

  // An empty catalog is a legitimate state on a fresh install — and the state
  // this component is left in when the API is unreachable. Rendering the
  // heading over an empty grid looks broken, so the whole section stands down.
  if (featured.length === 0) return null;

  return (
    <section className="site-section site-section--tint" id="featured-courses">
      <div className="site-shell">
        <div className="site-eyebrow-row">
          <div>
            <h2 className="site-h2">{title}</h2>
            {lead ? (
              <p className="site-lead" style={{ maxWidth: '38rem' }}>
                {lead}
              </p>
            ) : null}
          </div>
          {ctaLabel ? (
            <Link className="site-btn site-btn--solid" href="/courses">
              {ctaLabel}
            </Link>
          ) : null}
        </div>

        <ul className="courses__grid">
          {featured.map((course) => (
            <CourseCard course={course} electric key={course.id} />
          ))}
        </ul>
      </div>
    </section>
  );
}
