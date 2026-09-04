import Link from 'next/link';
import { GraduationCap, Route, School } from 'lucide-react';
import { copy, formatCopy } from '@ayman/contracts';
import { UserAvatar } from '@/components/app/user-avatar';
import { ProgressRing } from '@/components/progress-ring';

const c = copy.dashboard;

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
 * Four things are on it now, and every one is real data already fetched by the
 * page: the portrait from the session, the name, the year/track/school from the
 * profile, and the overall progress ring. Nothing is invented and nothing is a
 * placeholder.
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
}) {
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
        The three figures that used to be `.tile`s in a row under the band.

        A SIBLING of `.dash-hero__id`, not a child of `.dash-hero__text`, and
        that is a layout decision the markup has to carry: the band is a grid,
        and only a direct child of it can be given a column. Nested under the
        greeting it could never be anything but a third line beneath the name,
        which is what left the band with a growing empty middle once the
        signed-in shell stopped capping its pages at 1152px — see `--w-app` in
        `packages/ui/src/tokens/space.css`. As a sibling it stays that third
        line up to `lg`, and becomes the band's MIDDLE column from `90rem` up,
        where there is finally room for three clusters. See `.dash-hero` in
        `study.css`; the skeleton in `dashboard/loading.tsx` mirrors this
        nesting and has to move with it.

        OUTSIDE the identity conditional above, deliberately: a chip is
        omitted when a profile genuinely lacks the value (tracks are only
        chosen from year 2, school is optional), but zero courses is a
        fact, not a missing value, and a student on day one should see the
        zero they are about to move.

        The fourth figure — «إجمالي تقدّمك» — is NOT here and is not
        anywhere else either. It was `overallPercent`, which is the number
        the ring at the inline end of this very band draws and labels. One
        figure printed twice, six inches apart, was a third of what made
        this screen read as cluttered.
      */}
      {/*
        The three figures are LINKS now, and each goes to the screen that
        holds the rest of the number it prints.

        They were three `<span>`s. Every one of them names something the
        product has a whole page for — «٣ كورسات» → the library, «١٢ درس
        خلص» → the path, «متوسط درجاتك ٧٨٪» → the results — and none of
        them went there. On a phone that matters twice over: the rail is
        gone below `md`, so for a student who has not found the menu, this
        band is most of what is on screen, and it was entirely inert.

        They stay visually identical. A figure that underlines itself or
        grows a chevron would turn a calm band into a row of buttons, and
        the band is deliberately not where the page's primary action lives
        — that is the card directly below it. The affordance is the hover
        and the focus ring, plus the fact that they now behave the way a
        student who taps a number expects.
      */}
      <div className="dash-hero__stats">
        <Link href="/library" className="dash-hero__stat">
          <span className="dash-hero__stat-value">{courseCount}</span>
          <span>{c.statCourses}</span>
        </Link>
        <Link href="/path" className="dash-hero__stat">
          <span className="dash-hero__stat-value">{completedLessons}</span>
          <span>{c.statLessonsDone}</span>
        </Link>
        <Link href="/results" className="dash-hero__stat">
          <span className="dash-hero__stat-value">
            {averageScore === null ? c.statNoScores : `${averageScore}%`}
          </span>
          <span>{c.statAverage}</span>
        </Link>
      </div>

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
