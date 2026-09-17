import { CalendarClock, GraduationCap, Route, School } from 'lucide-react';
import { copy, formatCopy } from '@ayman/contracts';
import type { EnrolledCourse } from '@ayman/contracts/progress';
import type { AchievementTier } from '@/lib/achievements';
import { UserAvatar } from '@/components/app/user-avatar';
import { ProgressRing } from '@/components/progress-ring';
import { StatsRow } from './stats-row';

const c = copy.dashboard;

/**
 * One «ميعاد المحاضرة» row: a course the student is enrolled in, and the line
 * its instructor wrote for it.
 */
export type ScheduleLine = {
  courseId: string;
  courseTitle: string;
  /** Printed verbatim. Nothing parses it — see `Course.scheduleNote`. */
  note: string;
};

/**
 * Which enrolled courses contribute a line to the band, and which contribute
 * nothing at all.
 *
 * ## The rule, and the three things it deliberately does not do
 *
 * A course contributes exactly when its instructor wrote a note. That is the
 * whole predicate, and the `.trim()` is not decoration: the write path trims
 * (`CourseCreateSchema`/`CourseUpdateSchema`), but a row that predates the
 * schema — or one written by anything other than the admin form — can still
 * hold `' '`, and a whitespace note would otherwise draw a course label with a
 * blank time next to it, which reads as a bug rather than as an absence.
 *
 * It does NOT filter on `published`. A course taken down for an edit still has
 * a lecture on Saturday at eight, and the band is a sentence rather than a
 * link — unlike `lastLessonId`, which the payload nulls for exactly the
 * opposite reason (it is a press into a lesson the routes would refuse).
 *
 * It does NOT sort. The payload arrives `updatedAt desc`, so the course the
 * student touched last is the first line, which is the closest thing to
 * "relevant" available here — a free-text time cannot be ordered by when it
 * falls, which is the trade `Course.scheduleNote`'s own doc takes on.
 *
 * And it does NOT cap the count. Two lines (عربي on one night, لغات on
 * another) is the normal case and the shape the CSS is tuned for; a student in
 * six courses gets a taller band, which is a worse band but still a correct
 * one. Hiding the sixth lecture time behind a «وكمان ٤» would be the one
 * failure this whole feature exists to prevent.
 *
 * An empty result renders NOTHING — no heading, no empty row, no «مافيش
 * ميعاد». Most accounts are that case until an instructor writes the first
 * note, and a permanent empty block is furniture.
 */
export function scheduleLines(courses: readonly EnrolledCourse[]): ScheduleLine[] {
  return courses.flatMap((course) => {
    const note = course.scheduleNote?.trim() ?? '';
    if (note === '') return [];
    return [{ courseId: course.id, courseTitle: course.title, note }];
  });
}

/**
 * The band the student's own screen opens on.
 *
 * ## What it replaced
 *
 * A `.stage` carrying an eyebrow, «أهلًا مريم» and one sentence — the same
 * rectangle, with the same three lines, every day, and with nothing on it that
 * was true of the student rather than of the page. That is the flattest a home
 * screen can be, and it is where «مافيش روح» starts.
 *
 * Five things are on it now, and every one is real data already fetched by the
 * page: the portrait from the session, the name, the year/track/school from the
 * profile, the overall progress ring, and — as of this pass — the three figures
 * that measure the work («نقاط الخبرة», «وقت المذاكرة», «شارات محققة»), which
 * used to be a loose row of tiles a screen further down. Nothing is invented
 * and nothing is a placeholder.
 *
 * ## Everything the student is told about themselves, in one block
 *
 * That is the rule this pass enforced. Before it, the band stated three small
 * counts inline and a row of tiles restated the same KIND of fact, at a
 * different size, a screen apart: six numbers in two shapes. See `statFigures`
 * in `stats-row.tsx` — that is where the six became three, and why the counts
 * survived as the tiles' second lines rather than being deleted.
 *
 * ## Why the identity chips are optional individually
 *
 * `year`, `track` and `school` are three separate columns and a profile can
 * legitimately have any subset: tracks are only chosen from year 2, and school
 * name is optional in onboarding. Rendering a chip per present value — rather
 * than one «الصف الثالث · علمي علوم · مدرسة …» string — is what keeps a
 * partially-filled profile from showing «· ·» with holes in it.
 *
 * A student with none of the three gets the greeting and the ring, which is
 * still a band. The alternative, prompting for a missing year here, is already
 * `/library`'s `<IdentityStrip>` job and doing it twice is nagging.
 */
export function DashboardHero({
  name,
  image,
  greetingName,
  yearLabel,
  trackLabel,
  schoolName,
  overallPercent,
  courseCount,
  completedLessons,
  averageScore,
  xp,
  learningSeconds,
  badgesEarned,
  badgeTier,
  courses,
}: {
  /** The session name — what the avatar takes its initials from. */
  name: string;
  image: string | null;
  /** First name only, for the greeting. `null` falls back to «أهلًا بيك». */
  greetingName: string | null;
  yearLabel: string | null;
  trackLabel: string | null;
  schoolName: string | null;
  overallPercent: number;
  courseCount: number;
  completedLessons: number;
  /** `null` until the student has been graded at all. */
  averageScore: number | null;
  /**
   * The three figures the band prints big — see `statFigures` in
   * `stats-row.tsx` for how these and the three counts above it were six
   * numbers in two shapes until this pass, and are now three.
   *
   * All computed on the page from data already fetched: `xpFor()`,
   * `summarise()` and `earnedCount()` respectively. Nothing here is stored, so
   * none of it can be stale against the ring drawn beside it.
   */
  xp: number;
  learningSeconds: number;
  badgesEarned: number;
  /** The best badge tier the student HOLDS, from `highestTier()` — it strikes
   *  the «شارات محققة» well in that metal and names itself beside the count.
   *  `null` while the strip is still empty. */
  badgeTier: AchievementTier | null;
  /**
   * Every enrolled course, for «مواعيد المحاضرات» — the band reads
   * `scheduleNote` off them and nothing else. Passed whole rather than
   * pre-filtered by the page so the rule lives in one place next to the markup
   * that depends on it; `scheduleLines` above is that rule.
   */
  courses: readonly EnrolledCourse[];
}) {
  const schedule = scheduleLines(courses);

  return (
    /*
     * Still a `<header>`, as it was before: inside `<main>` it maps to no
     * landmark at all, so this is pure document semantics and cannot collide
     * with the site banner the shell already owns.
     */
    <header className="dash-hero mb-6">
      {/*
        The band's own shapes.

        `.stage`'s dot field is masked away from the reading edge, which leaves
        the middle of a wide band empty — the greeting is at the inline start
        and the dial at the inline end, and between them is flat ember for
        several hundred pixels. Three overlapping rings and a disc fill it, in
        white alphas so nothing here needs a colour of its own.

        Drawn from the LEFT of the viewBox and masked to fade before it reaches
        the dial, which under RTL is the same side; the greeting at the far
        right is beyond the artwork entirely. Hidden below `md`, where the two
        halves stack and there is no gap to fill.
      */}
      <svg
        className="dash-hero__art"
        viewBox="0 0 400 200"
        preserveAspectRatio="xMinYMid slice"
        role="presentation"
        focusable="false"
        aria-hidden="true"
      >
        <circle cx="72" cy="100" r="96" className="dash-hero__disc" />
        <circle cx="72" cy="100" r="72" className="dash-hero__arc" />
        <circle cx="196" cy="42" r="58" className="dash-hero__arc" />
        <circle cx="240" cy="176" r="42" className="dash-hero__disc" />
      </svg>

      <div className="dash-hero__id">
        <UserAvatar name={name} image={image} size={64} className="dash-hero__avatar" />

        <div className="dash-hero__text">
          <p className="dash-hero__eyebrow">{c.eyebrow}</p>
          <h1 className="dash-hero__title">
            {greetingName ? formatCopy(c.greeting, { name: greetingName }) : c.greetingFallback}
          </h1>

          {yearLabel || trackLabel || schoolName ? (
            <div className="dash-hero__facts">
              {yearLabel ? (
                <span className="dash-hero__fact">
                  <GraduationCap size={14} aria-hidden="true" />
                  <span>{yearLabel}</span>
                </span>
              ) : null}
              {trackLabel ? (
                <span className="dash-hero__fact">
                  <Route size={14} aria-hidden="true" />
                  <span>{trackLabel}</span>
                </span>
              ) : null}
              {schoolName ? (
                <span className="dash-hero__fact">
                  <School size={14} aria-hidden="true" />
                  <span>{schoolName}</span>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/*
        The three figures the band states big — XP, learning time, badges.

        A SIBLING of `.dash-hero__id`, not a child of `.dash-hero__text`, and
        that is a layout decision the markup has to carry: the band is a grid,
        and only a direct child of it can be given a row. Nested under the
        greeting these could never be anything but a third line beneath the
        name, indented past the 64px portrait. As a sibling they are the band's
        own second ROW, full width, under the greeting and the dial both — see
        `.dash-hero__stats` in `study.css` for why that beat putting them in a
        middle column, and note that the skeleton in `dashboard/loading.tsx`
        mirrors this nesting and has to move with it.

        ## What arrived here, and what left

        These are the `.tile`s that used to sit under «تكمل من مكانك», a screen
        away — «عاوز تنقل السكشن ده أعلى». And the band's own row of small
        inline figures («٢ كورساتك · ٤ دروس خلصتها · ٢٧٪ متوسط درجاتك») is
        gone AS A SHAPE, not as data: all three counts are now the second line
        of the tile whose headline number they produced, and each tile links
        where its inline figure used to. `statFigures` is that pairing and
        carries the argument for it.

        OUTSIDE the identity conditional above, deliberately: a chip is omitted
        when a profile genuinely lacks the value (tracks are only chosen from
        year 2, school is optional), but zero courses is a fact, not a missing
        value, and a student on day one should see the zero they are about to
        move.

        A fourth figure — «إجمالي تقدّمك» — is NOT here and is not anywhere
        else either. It is `overallPercent`, which is the number the ring at
        the inline end of this very band draws and labels. One figure printed
        twice, six inches apart, is exactly the duplication this pass came to
        remove; it would be odd to spend the pass removing one and adding
        another.
      */}
      <StatsRow
        xp={xp}
        learningSeconds={learningSeconds}
        badgesEarned={badgesEarned}
        completedLessons={completedLessons}
        courseCount={courseCount}
        averageScore={averageScore}
        badgeTier={badgeTier}
      />

      {/*
        «مواعيد المحاضرات» — the live-lesson times, in the band, where they
        cannot be scrolled past.

        «يبقى موجودة في البانر اللي فوق اللي هو أهلاً أيمن، وتكتبها بخط كويس
        وتبقى كبير وباينة، حتى لو فتح من الموبايل.» Every word of that is a
        constraint the CSS answers — see `.dash-hero__schedule` in `study.css`
        for the sizing and why the strip is a full-width row of the band's grid
        rather than a line inside the greeting.

        A SIBLING of the three clusters, for the same reason `.dash-hero__stats`
        is one: only a direct child of the band can be given a grid row, and
        nested under the greeting this could never be anything but a paragraph
        indented past the 64px portrait.

        Rendered only when at least one course has a note — `scheduleLines`
        returns `[]` otherwise and the whole `<section>`, heading included,
        never exists. A student with no scheduled course gets the band exactly
        as it was.

        `<ul>` and not a run of paragraphs: two courses on two different nights
        is the NORMAL case, and a list is what tells a screen reader (and a
        skimming eye) that the second line is a second lecture rather than a
        continuation of the first.
      */}
      {schedule.length > 0 ? (
        <section className="dash-hero__schedule" aria-labelledby="dash-hero-schedule">
          <p className="dash-hero__schedule-title" id="dash-hero-schedule">
            <CalendarClock size={18} aria-hidden="true" />
            <span>{c.scheduleTitle}</span>
          </p>

          <ul className="dash-hero__schedule-list">
            {schedule.map((line) => (
              <li key={line.courseId} className="dash-hero__schedule-row">
                {/* The course first and SMALLER, the time second and biggest:
                    the student already knows which courses are theirs, and
                    what they came to this line for is the when. */}
                <span className="dash-hero__schedule-course">{line.courseTitle}</span>
                <span className="dash-hero__schedule-time">{line.note}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="dash-hero__aside">
        {/* `tone="ink"` — the band is dark in both themes, so the unfilled
            track has to be a white alpha rather than a neutral step. The figure
            is a CHILD rather than a `label` prop: it sits outside the `<svg>`,
            so it is real text a screen reader announces, which is what lets the
            ring itself stay `aria-hidden`. */}
        <ProgressRing percent={overallPercent} size={104} tone="ink">
          <span className="dash-hero__dial-value">{Math.round(overallPercent)}%</span>
        </ProgressRing>
        <p className="dash-hero__aside-label">{c.statOverall}</p>
      </div>
    </header>
  );
}
