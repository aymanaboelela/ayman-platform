import Link from 'next/link';
import { CourseArt } from '@/components/course-art';
import type { CatalogCourse } from '@ayman/contracts/catalog';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { formatEGP } from '@/lib/price';
import { Mono, NeonCommand, NeonHead, NeonMeta, NeonWindow, type MetaRow } from './neon-chrome';
import { META, MARKERS, neonCopy } from './neon-copy';

/**
 * The cheapest plan's price as a bare number, or «مجاني».
 *
 * Monthly, then quarterly, then yearly — the same precedence `CourseCard`'s
 * badge uses, so the two surfaces cannot quote a student different figures for
 * the same course. NO currency word, which is what `/books` and the classic
 * book strip already do: one number is what fits an aligned column, and a
 * course whose price reads «250 ج / الشهر» in one place and «250» in another
 * is how a reader stops trusting either.
 */
function priceRow(course: CatalogCourse): MetaRow {
  const cents =
    course.monthlyPriceCents ?? course.quarterlyPriceCents ?? course.yearlyPriceCents ?? null;

  return cents === null
    ? { key: META.price, value: neonCopy.courseFree, arabic: true }
    : { key: META.price, value: formatEGP(cents) };
}

/**
 * One catalogue row as a code window.
 *
 * ## Why not `<CourseCard>`
 *
 * That component is the classic page's card and it is a different object: a
 * 16/9 cover, badge pills, lucide icons, an optional `<ElectricCard>` canvas
 * running its own `requestAnimationFrame` loop. Reusing it here would have put
 * the classic page's visual vocabulary into the middle of a preset whose whole
 * argument is that it does not share one — and it would have dragged a client
 * component onto a page that otherwise ships no JavaScript at all.
 *
 * What IS reused is the data and every decision about it: the same
 * `getCatalogOrEmpty()` read, the same curation-order rule, the same price
 * precedence. The card is different; the facts are not.
 *
 * ## The cover, and why it is back
 *
 * This card shipped WITHOUT one, on the argument that a poster in whatever
 * palette its designer chose breaks a page that is one unbroken dark ground
 * lit by a single hue. That argument is real and it lost to a simpler fact:
 * with no cover the whole catalogue is text, and a student scrolling a course
 * list on a phone has nothing to recognise a course BY. «شكل الكورسات» was the
 * first thing asked for after seeing it.
 *
 * So the cover renders inside the window, above the title, in the one place
 * that keeps the original argument's point: it sits UNDER the title bar, so
 * the frame still reads as an editor and the poster reads as a file open in
 * it — bounded, not floating on the ground. `<CourseArt>` (not a bare
 * `<Image>`) because a course with no cover yet must still draw something
 * rather than collapse, and it already derives a per-subject composition for
 * exactly that case.
 */
function NeonCourseWindow({ course }: { course: CatalogCourse }) {
  const href = `/courses/${course.slug}`;

  const rows: MetaRow[] = [
    {
      key: META.track,
      value: course.trackLabelAr
        ? `${course.systemNameAr} · ${course.trackLabelAr}`
        : course.systemNameAr,
      arabic: true,
    },
    /*
     * ⚠️ `lessons` and `runtime` are deliberately NOT here any more.
     *
     * They were the two rows a brand-new course is worst at: «lessons 1» and
     * «runtime 03:37» under a title that promises a curriculum reads as a
     * course nobody finished, and it is the first thing a visitor sees. A
     * lecture count is a fact the COURSE PAGE should state, next to the outline
     * that justifies it — not a number on a card, with nothing around it, at
     * the moment a student is deciding whether to look at all.
     *
     * What stays is what helps someone choose: which year and stream it is for,
     * and what it costs.
     */
    priceRow(course),
  ];

  return (
    <li className="neon-course">
      <NeonWindow file={course.slug}>
        <Link href={href} className="neon-course__art" tabIndex={-1} aria-hidden="true">
          <CourseArt
            coverKey={course.coverKey ?? null}
            subjectNameAr={course.subjectNameAr}
            seed={course.slug}
            sizes="(max-width: 48rem) 92vw, 30rem"
          />
        </Link>
        <h3 className="neon-course__title">
          <Link href={href}>{course.title}</Link>
        </h3>
        {course.subtitle ? <p className="neon-course__sub">{course.subtitle}</p> : null}

        <NeonMeta rows={rows} />

        {/*
          `tabIndex={-1}`, exactly as the classic card does it: the title above
          is already a link to the same place, and leaving both in the tab
          order makes a keyboard reader press Tab twice per card to get past a
          grid. The command stays clickable and stays visible — it is the
          affordance a mouse reader looks for — it just is not a second stop.
        */}
        <div className="neon-course__cmd">
          <NeonCommand href={href} variant="path" tabIndex={-1}>
            {neonCopy.coursesOpen}
          </NeonCommand>
        </div>
      </NeonWindow>
    </li>
  );
}

/**
 * The empty catalogue — and on a brand-new instructor's stack this is not an
 * edge case, it is the first screen their students see.
 *
 * `<FeaturedCourses>` returns `null` here and that is right for Ayman: his
 * catalogue is full, so an empty one means the API is down, and a heading over
 * an empty grid during an outage looks broken. On a stack that has genuinely
 * published nothing yet the same `null` leaves the page as a hero and then
 * nothing, which reads as a site that failed to load rather than as a site
 * that is new.
 *
 * So it renders a window, and the window says three things in order: what is
 * true (`0 نتيجة`), what happens next, and the one action still worth taking
 * today. `ls` returning nothing is the honest terminal spelling of it, and it
 * is a joke a student gets without knowing any shell — the comment under it is
 * in Arabic and says the same thing.
 *
 * The secondary command goes to `/years`-style browsing rather than to
 * `/courses`, because `/courses` is the page that is also empty.
 */
function NeonCoursesEmpty() {
  return (
    <div className="neon-empty">
      <NeonWindow file={neonCopy.coursesEmptyFile} lit>
        <p className="neon-empty__line">
          <Mono className="neon-empty__sigil" hidden>
            $
          </Mono>
          <Mono className="neon-empty__cmd">{neonCopy.coursesEmptyFile}</Mono>
        </p>
        <p className="neon-empty__out">
          <Mono className="neon-empty__hash" hidden>
            #
          </Mono>
          <span>{neonCopy.coursesEmptyComment}</span>
        </p>

        <h3 className="neon-empty__title">{neonCopy.coursesEmptyTitle}</h3>
        <p className="neon-empty__body">{neonCopy.coursesEmptyBody}</p>

        <div className="neon-empty__cmds">
          <NeonCommand href="/register" variant="run">
            {neonCopy.coursesEmptyCta}
          </NeonCommand>
          <NeonCommand href="/years/1" variant="path">
            {neonCopy.coursesEmptySecondary}
          </NeonCommand>
        </div>
      </NeonWindow>
    </div>
  );
}

export interface NeonCoursesProps {
  title: string;
  lead: string;
  ctaLabel: string;
  limit: number;
  courseIds: readonly string[];
  level: 1 | 2;
}

/**
 * The `courseGrid` block — `// courses`.
 *
 * Reads through `getCatalogOrEmpty`, which never throws, so an unreachable API
 * costs this section its cards rather than costing the page a 500. That matters
 * more on a marketing front door than anywhere else: this is the page that has
 * to keep working while the API is being deployed.
 */
export async function NeonCourses({
  title,
  lead,
  ctaLabel,
  limit,
  courseIds,
  level,
}: NeonCoursesProps) {
  const { courses } = await getCatalogOrEmpty();

  /*
   * A curated row keeps the ADMIN's order, not the catalogue's — the rule
   * `<FeaturedCourses>` states and the reason it states it: an editor who put
   * three ids in a particular sequence meant that sequence. An id that no
   * longer resolves is dropped rather than rendered as a hole, so the row
   * simply gets shorter.
   */
  const featured =
    courseIds.length > 0
      ? courseIds
          .map((id) => courses.find((course) => course.id === id))
          .filter((course) => course !== undefined)
          .slice(0, limit)
      : courses.slice(0, limit);

  return (
    <section className="neon-section" id="featured-courses">
      <div className="neon-shell">
        <NeonHead marker={MARKERS.courses} title={title} lead={lead} level={level} />

        {featured.length === 0 ? (
          <NeonCoursesEmpty />
        ) : (
          <>
            <ul className="neon-grid">
              {featured.map((course) => (
                <NeonCourseWindow course={course} key={course.id} />
              ))}
            </ul>
            {ctaLabel ? (
              <div className="neon-section__foot">
                <NeonCommand href="/courses" variant="path">
                  {ctaLabel}
                </NeonCommand>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
