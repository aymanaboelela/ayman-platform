import Link from 'next/link';

import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { CatalogCourse } from '@ayman/contracts/catalog';

import { getCatalogOrEmpty } from '@/lib/catalog';
import { CourseArt } from '@/components/course-art';
import { StreamBadge } from '@/components/stream-badge';
import { formatEGP } from '@/lib/price';

import { StudioHeading } from './studio-heading';
import { studioCopy } from './studio-copy';

/** The cheapest real price a course publishes, or nothing if it publishes none. */
function priceLine(course: CatalogCourse): string | null {
  if (course.monthlyPriceCents !== null) {
    return formatCopy(copy.course.priceMonthly, { price: formatEGP(course.monthlyPriceCents) });
  }
  if (course.quarterlyPriceCents !== null) {
    return formatCopy(copy.course.priceQuarterly, {
      price: formatEGP(course.quarterlyPriceCents),
    });
  }
  if (course.yearlyPriceCents !== null) {
    return formatCopy(copy.course.priceYearly, { price: formatEGP(course.yearlyPriceCents) });
  }
  return null;
}

/**
 * The `courseGrid` block.
 *
 * ## Why the card is mostly picture
 *
 * A course's cover is a designed poster carrying its own title, so the card's
 * job is to show it and get out of the way: the art, the name, one price line.
 * Everything else the catalogue knows about a course belongs on the course's
 * own page, where somebody has decided to read it.
 *
 * ⚠️ The art box drops its fixed ratio when a cover exists — the same switch
 * `board-courses.tsx` documents at length. With no cover `<CourseArt>` draws a
 * composed panel that needs a 16:9 parent; with one it returns a bare `<img>`
 * that must take its own height, or a 3:2 poster loses the top of its title.
 */
export async function StudioCourses({
  title,
  lead,
  ctaLabel,
  limit,
  courseIds,
  level,
}: {
  title: string;
  lead: string;
  ctaLabel: string;
  limit: number;
  courseIds: readonly string[];
  level: 1 | 2;
}) {
  const { courses } = await getCatalogOrEmpty();

  const featured =
    courseIds.length > 0
      ? courseIds
          .map((id) => courses.find((course) => course.id === id))
          .filter((course) => course !== undefined)
          .slice(0, limit)
      : courses.slice(0, limit);

  return (
    <section className="st-section" id="courses">
      <div className="st-shell">
        <StudioHeading chip={studioCopy.chipCourses} title={title} lead={lead} level={level} />

        {featured.length === 0 ? (
          <p className="st-empty">{studioCopy.empty}</p>
        ) : (
          <>
            <ul className="st-courses" role="list">
              {featured.map((course) => {
                const price = priceLine(course);

                return (
                  <li className="st-course" key={course.id}>
                    <Link className="st-course__link" href={`/courses/${course.slug}`}>
                      <div
                        className={
                          course.coverKey ? 'st-course__art st-course__art--bleed' : 'st-course__art'
                        }
                      >
                        <CourseArt
                          coverKey={course.coverKey}
                          subjectNameAr={course.subjectNameAr}
                          seed={course.slug}
                          sizes="(min-width: 64rem) 20rem, (min-width: 44rem) 45vw, 92vw"
                        />
                      </div>

                      <div className="st-course__body">
                        <h3 className="st-course__t">{course.title}</h3>
                        <StreamBadge
                          forGeneral={course.forGeneral}
                          forLanguages={course.forLanguages}
                        />
                        {price ? <p className="st-course__price">{price}</p> : null}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {ctaLabel ? (
              <div className="st-section__foot">
                <Link className="st-btn st-btn--quiet" href="/courses">
                  {ctaLabel}
                </Link>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
