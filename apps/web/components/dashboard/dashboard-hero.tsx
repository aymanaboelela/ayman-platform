import { GraduationCap, Route, School } from 'lucide-react';
import { copy, formatCopy } from '@ayman/contracts';
import { UserAvatar } from '@/components/app/user-avatar';
import { ProgressRing } from './progress-ring';

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

      <div className="dash-hero__aside">
        <ProgressRing
          percent={overallPercent}
          label={formatCopy(c.overallLabel, { percent: Math.round(overallPercent) })}
        />
        <p className="dash-hero__aside-label">{c.statOverall}</p>
      </div>
    </header>
  );
}
