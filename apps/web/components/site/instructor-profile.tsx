import Link from 'next/link';
import { copy } from '@ayman/contracts';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { MediaSlot } from '@/components/site/media-slot';
import { ProfileCourses } from '@/components/site/instructor-profile-courses';
import { DEMO_COURSES } from '@/lib/demo-courses';

const c = copy.landing;

/**
 * The instructor as a PROFILE — avatar, tier, a row of counts, and his courses
 * in a grid underneath, laid out the way a social profile is.
 *
 * The shape is borrowed on purpose. A visitor landing here already knows how to
 * read this: the face, who it is, how much there is, and the work below. It
 * carries more in one screen than a heading and a paragraph do, and it is the
 * one place on the page where the numbers and the catalogue sit together.
 *
 * ## The counts are real
 *
 * The course count is the catalogue's own length, not a figure typed into the
 * copy table — it cannot drift from what the grid underneath actually shows.
 * Students and hours come from `copy` because nothing in the system measures
 * them yet; when something does, they move here and nothing else changes.
 *
 * ## What it is NOT
 *
 * There are no posts, followers or following, because there is no social layer
 * on this platform and putting the words there would promise one. The row keeps
 * the borrowed layout and fills it with what an education platform actually has.
 *
 * ## It renders on an empty catalogue, and that is deliberate
 *
 * `<FeaturedCourses>` stands itself down when there is nothing to feature — a
 * heading over an empty grid reads as broken. This one does the opposite and
 * falls back to `DEMO_COURSES`, for the same reason `<MediaSlot>` ships a
 * composed stand-in rather than a grey rectangle: the profile is the section's
 * own content, the grid is its illustration, and a fresh checkout should be
 * able to SEE the page it is going to have. Read the rules on `DEMO_COURSES`
 * before touching this — the fallback is narrow on purpose.
 *
 * ## Data
 *
 * Server component reading the cached catalogue directly, exactly like
 * `<FeaturedCourses>` — the landing page stays a plain list of sections and no
 * parent threads data through it. `getCatalogOrEmpty` means an unreachable API
 * costs this section its grid rather than costing the whole page.
 */
export async function InstructorProfile() {
  const catalogue = await getCatalogOrEmpty();
  // The ONE place the fallback is chosen. Everything below is written against
  // `courses` and cannot tell the difference.
  const courses = catalogue.courses.length > 0 ? catalogue.courses : DEMO_COURSES;

  // Ascending, so the tab strip reads first year → last rather than in whatever
  // order the catalogue happened to return.
  const years = [...new Set(courses.map((course) => course.year))].sort((a, b) => a - b);

  const totalHours = Math.round(
    courses.reduce((sum, course) => sum + course.totalSeconds, 0) / 3600,
  );

  return (
    <section className="site-section profile" id="instructor">
      <div className="site-shell">
        <div className="profile__card">
          {/* The banner is decorative and sits behind the avatar, so it is
              marked as such and carries no content of its own. */}
          <div className="profile__banner" aria-hidden="true">
            <span className="profile__tier">{c.profileTier}</span>
          </div>

          <div className="profile__avatar">
            <MediaSlot kind="portrait" alt={copy.site.instructor} sizes="10rem" />
          </div>

          <h2 className="profile__name">{copy.site.instructor}</h2>
          <p className="profile__role">{c.profileRole}</p>

          <dl className="profile__stats">
            <div className="profile__stat">
              <dt className="profile__stat-n">{courses.length}</dt>
              <dd className="profile__stat-l">{c.profileCoursesLabel}</dd>
            </div>
            <div className="profile__stat">
              <dt className="profile__stat-n">{c.statStudents}</dt>
              <dd className="profile__stat-l">{c.profileStudentsLabel}</dd>
            </div>
            <div className="profile__stat">
              <dt className="profile__stat-n">{totalHours}</dt>
              <dd className="profile__stat-l">{c.profileHoursLabel}</dd>
            </div>
          </dl>

          <div className="profile__actions">
            <Link className="site-btn site-btn--solid profile__action" href="/courses">
              {c.profileCta}
            </Link>
            <Link className="site-btn site-btn--outline profile__action" href="#about">
              {c.profileSecondary}
            </Link>
          </div>

          <ProfileCourses courses={courses} years={years} />
        </div>
      </div>
    </section>
  );
}
