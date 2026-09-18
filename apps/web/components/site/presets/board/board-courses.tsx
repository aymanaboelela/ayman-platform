import Link from 'next/link';
import { GraduationCap, Layers } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { CatalogCourse } from '@ayman/contracts/catalog';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { CourseArt } from '@/components/course-art';
import { StreamBadge } from '@/components/stream-badge';
import { formatEGP } from '@/lib/price';
import { BoardHeading } from './board-heading';
import { boardCopy } from './board-copy';

/**
 * The cheapest plan a visitor can actually buy, as the platform already writes
 * it — monthly, else quarterly, else yearly, else the course is free.
 *
 * ⚠️ The preference ORDER and the three templates are lifted from
 * `course-card.tsx`'s `priceBadge` on purpose, not reinvented. One number is
 * what fits on a card, and if this preset picked a different one (the largest,
 * say, or the yearly) then the same course would advertise two different
 * prices depending on which landing preset the tenant had selected — and the
 * course page a click later would agree with only one of them.
 */
function priceLine(course: CatalogCourse): { from: boolean; text: string } {
  if (course.monthlyPriceCents !== null) {
    return {
      from: true,
      text: formatCopy(copy.course.priceMonthly, { price: formatEGP(course.monthlyPriceCents) }),
    };
  }
  if (course.quarterlyPriceCents !== null) {
    return {
      from: true,
      text: formatCopy(copy.course.priceQuarterly, {
        price: formatEGP(course.quarterlyPriceCents),
      }),
    };
  }
  if (course.yearlyPriceCents !== null) {
    return {
      from: true,
      text: formatCopy(copy.course.priceYearly, { price: formatEGP(course.yearlyPriceCents) }),
    };
  }
  /* «مجاني بالكامل» is a statement, not a price, so it gets no «يبدأ من»
     above it — «يبدأ من مجاني بالكامل» is not a sentence. */
  return { from: false, text: copy.landing.courseFree };
}

/**
 * The `courseGrid` block on «اللوح» — and, when the catalogue is empty, the
 * most important section on the whole page.
 *
 * ## ⚠️ IT DOES NOT STAND DOWN WHEN THERE ARE NO COURSES
 *
 * `<FeaturedCourses>` returns `null` on an empty catalogue, and on `classic`
 * that is right: Ayman's catalogue is full, so an empty one there means the
 * API is unreachable, and a heading over an empty grid during an outage looks
 * broken.
 *
 * On a brand-new instructor's stack an empty catalogue is not an outage — it
 * is Tuesday. It is the state the database ships in, it lasts until the first
 * lecture is uploaded, and during that window THIS PAGE IS THE FIRST THING HIS
 * STUDENTS SEE. Standing the section down would leave them a page that goes
 * straight from the opener to the year tiles with nothing said about lessons at
 * all, which reads as a platform that does not have any and never explains
 * when it will.
 *
 * So the empty state is designed rather than absent: the section keeps its
 * heading, and the grid is replaced by one slab that says the lectures are
 * being recorded and hands the reader the one action that is worth anything
 * today — make the account now, be inside when the first one lands. `/register`
 * exists on every deployment from first boot, so this link cannot 404 on a
 * stack that has never been configured.
 *
 * The «شوف كل الكورسات» button is suppressed in that state for the same
 * reason: sending somebody to `/courses` to look at nothing is worse than not
 * offering.
 *
 * ## Curation, and why ids that no longer resolve are dropped
 *
 * `courseIds` keeps the ADMIN's order — an editor who dragged three ids into a
 * sequence meant that sequence. An id that no longer resolves (unpublished,
 * deleted) is dropped rather than rendered as a hole, so the row gets shorter
 * instead of broken. Identical to `<FeaturedCourses>`, and deliberately so:
 * the two presets must not disagree about what a curated row means.
 */
export async function BoardCourses({
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
    <section className="board-band" id="courses">
      <div className="board-shell">
        <BoardHeading chip={boardCopy.courses.chip} title={title} lead={lead} level={level} />

        {featured.length === 0 ? (
          <div className="board-empty">
            <p className="board-empty__title">{boardCopy.courses.emptyTitle}</p>
            <p className="board-empty__body">{boardCopy.courses.emptyBody}</p>
            {/* `--light`, not `--solid`: the plate is a deep block of the
                brand colour, so the accent-filled button would be the accent
                on the accent. The white pill is the same one the opener panel
                uses, which is also the last thing this reader saw. */}
            <Link className="site-btn site-btn--light" href="/register">
              {boardCopy.courses.emptyCta}
            </Link>
          </div>
        ) : (
          <>
            <ul className="board-courses" role="list">
              {featured.map((course) => {
                const price = priceLine(course);

                return (
                  <li className="board-course" key={course.id}>
                    {/*
                      ⚠️ THE ART BOX DROPS ITS ASPECT RATIO WHEN A COVER EXISTS,
                      and that is not a style tweak — it is the difference
                      between showing a poster and cropping one.

                      `<CourseArt>` returns two completely different things.
                      With no cover it returns a `<span class="course-art">`
                      that is `block-size: 100%` and therefore NEEDS a parent
                      with a height — a 16/9 box, like every other catalogue
                      card on this platform. With a cover it returns a bare
                      `<img class="course-art__photo">` at `width: 100%;
                      height: auto`, because a cover is a designed poster with
                      the course's own title written across it and the box is
                      meant to take its height from the picture rather than the
                      other way round (that component's own banner documents
                      both answers this replaced, and the «الصورة متقصّة من
                      فوق» report that killed the crop).

                      Leaving `aspect-ratio: 16 / 9` on the box in the second
                      case clips a 3:2 cover by 18% of its height, taking the
                      top off the title. `.course-card__thumb--bleed` is the
                      same switch on the classic card, for the same reason.
                    */}
                    <div
                      className={
                        course.coverKey
                          ? 'board-course__art board-course__art--bleed'
                          : 'board-course__art'
                      }
                    >
                      {/*
                        `<CourseArt>` rather than a bare `<Image>`, and this is
                        the other half of the empty-database problem: a new
                        instructor's first courses have no uploaded cover, and
                        this component draws a composed panel in the subject's
                        own hue for exactly that case instead of leaving a grey
                        box. `seed` is the slug so two courses in one subject
                        share a hue and not a composition.

                        `sizes` is measured off `.board-courses`: a 68rem shell
                        less its padding packs three ~21rem columns from 64rem
                        up, two from 44rem, one below.
                      */}
                      <CourseArt
                        coverKey={course.coverKey}
                        subjectNameAr={course.subjectNameAr}
                        seed={course.slug}
                        sizes="(min-width: 64rem) 21rem, (min-width: 44rem) 45vw, 92vw"
                      />
                    </div>

                    <div className="board-course__body">
                      <h3 className="board-course__title">
                        {/*
                          The title is the card's ONLY anchor, and the pill at
                          the foot is a `<span>` inside the same stretched link
                          — see `.board-course__link::after`. Two anchors to one
                          href is two tab stops and two identical announcements
                          for one destination; a stretched pseudo-element is one
                          of each with the whole card still clickable.
                        */}
                        <Link className="board-course__link" href={`/courses/${course.slug}`}>
                          {course.title}
                        </Link>
                      </h3>

                      <StreamBadge
                        forGeneral={course.forGeneral}
                        forLanguages={course.forLanguages}
                      />

                      <p className="board-course__meta">
                        <span className="board-course__meta-row">
                          <GraduationCap size={15} aria-hidden="true" />
                          {course.systemNameAr}
                          {course.trackLabelAr ? ` · ${course.trackLabelAr}` : ''}
                        </span>
                        <span className="board-course__meta-row">
                          <Layers size={15} aria-hidden="true" />
                          {course.lessonCount} {copy.catalog.lessonCount}
                        </span>
                      </p>

                      <p className="board-course__price">
                        {price.from ? (
                          <span className="board-course__price-from">
                            {boardCopy.courses.priceFrom}
                          </span>
                        ) : null}
                        {/* `.tabular-nums` so a column of cards keeps its
                            figures in line whatever digits land in them. */}
                        <span className="board-course__price-n tabular-nums">{price.text}</span>
                      </p>

                      {/* Styled as the filled pill the design asks for, and it
                          is NOT focusable: `.board-course__link` above already
                          covers the whole card, so a second stop here would be
                          a keyboard user pressing Tab twice to reach the same
                          page. `aria-hidden` for the same reason. */}
                      <span className="board-course__cta" aria-hidden="true">
                        {copy.landing.courseOpen}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>

            {ctaLabel ? (
              <div className="board-band__foot">
                <Link className="site-btn site-btn--solid" href="/courses">
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
