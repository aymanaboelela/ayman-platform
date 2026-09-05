import Link from 'next/link';
import { ClipboardCheck, Trophy } from 'lucide-react';
import { formatCopy } from '@ayman/contracts/format';
import type { Dashboard } from '@ayman/contracts/progress';
import { ProgressRing } from '@/components/progress-ring';
import { finishedCourseTitles, nextUp, type NextUpItem } from '@/lib/next-up';
import { copy } from '@ayman/contracts/copy';

/**
 * «ناقصك كذا وكذا» — the block that turns the dashboard's percentage into a
 * way forward, and, at 100%, into a celebration.
 *
 * ## What it replaced
 *
 * A `<ProgressRing>` printing «80%» under the label «إجمالي تقدّمك». That is a
 * verdict with no instruction attached: it says how far off the student is and
 * nothing at all about what to press. The whole ask was the second half —
 * «عاوز يبقى فيه حاجة تحت، إن أنا أعرف اللي ناقصني وأضبطها، عشان يعرف يوصل
 * ليها… ولما أضغط عليها توديه ليها عشان يخلصها».
 *
 * So the ring is still here, and it is now the HEADING of a list rather than
 * the whole content. Every row under it is a link with a real destination —
 * see `lib/next-up.ts`, which builds them and documents the ordering, the cap
 * at three, and what it deliberately cannot derive.
 *
 * ## Why the rows are links and not buttons
 *
 * Each one navigates and does nothing else, which is what an `<a>` is for: it
 * gets middle-click, "open in new tab", and a status-bar preview for free, all
 * of which a `<button onClick={router.push}>` throws away. The amber pill at
 * the end of the row is inside that same `<a>` — it LOOKS like the button it
 * is behaving as, without becoming a second tab stop on a row with one
 * destination.
 *
 * ## The 100% branch
 *
 * Absent from this component: any notification, e-mail or WhatsApp message.
 * The card below is the in-page celebration only. Sending «مبروك» to a student
 * who is not currently looking at the screen needs an emit point in the API
 * and a new notification kind, neither of which is this slice's to add — see
 * the handover note at the bottom of this file.
 */

const C = copy.dashboard.nextUp;

/** Past this many the celebration stops listing and counts the rest. Three
 *  names is a sentence; nine is an inventory, and the card is a congratulation
 *  rather than a transcript. */
const NAMED_COURSES = 3;

export interface NextUpBlockProps {
  dashboard: Dashboard;
  /**
   * The overall figure the ring draws — `summarise(dashboard).overallPercent`,
   * passed in rather than recomputed so this block and the band above it can
   * never print two different numbers for the same fact.
   */
  percent: number;
  /** First name only, for the congratulation. `null` → «مبروك!» unaddressed. */
  greetingName?: string | null;
  /**
   * Whether to draw the block's own ring.
   *
   * `false` where `<DashboardHero>` already draws one immediately above — two
   * rings on one screen showing the same percentage is the same fact stated
   * twice, and the second one reads as a second, different measurement. The
   * prop exists rather than the ring being deleted because this block is also
   * the right thing to render on a surface with no band above it, and there it
   * needs its own heading.
   */
  showRing?: boolean;
}

export function NextUpBlock({
  dashboard,
  percent,
  greetingName = null,
  showRing = true,
}: NextUpBlockProps) {
  const items = nextUp(dashboard);

  /*
   * The celebration is keyed on the LIST being empty, not on the percentage
   * alone, and the two genuinely come apart: a course whose lectures are all
   * cleared reports 100% while its final exam sits there unopened, because
   * `EnrolledCourse.completedLessons` counts what was completed and an
   * un-sat exam is not. Congratulating a student on finishing while the one
   * thing that grades them is still waiting is the worst version of this
   * card. When they disagree, the list wins and the exam is what shows.
   */
  const finished = finishedCourseTitles(dashboard);
  const celebrating = items.length === 0 && percent >= 100 && dashboard.enrolledCourses.length > 0;

  /*
   * Nothing to show and nothing to celebrate — a student with no enrolments,
   * or one whose only courses are closed or not yet uploaded. The block
   * renders NOTHING rather than an empty box, the same call
   * `PendingExamsCard` and `recommendedCourses` make: the first screen of the
   * product already has `<StartHereCard>` for a student with no courses, and
   * a second empty rectangle beside it says the dashboard is broken.
   */
  if (!celebrating && items.length === 0) return null;

  if (celebrating) return <Celebration titles={finished} greetingName={greetingName} />;

  return (
    <section className="next-up" aria-labelledby="next-up-title">
      <div className="next-up__head">
        {/* `tone="surface"` — this card sits on the ordinary app surface, not
            on the ember band, so the unfilled track is the neutral step. The
            figure is a CHILD of the ring rather than a prop: it renders
            outside the `<svg>`, which is what lets the ring itself stay
            `aria-hidden` while the number is still announced. */}
        {showRing ? (
          <ProgressRing percent={percent} size={72}>
            <span className="next-up__dial">{Math.round(percent)}%</span>
          </ProgressRing>
        ) : null}

        <div>
          <h2 className="next-up__title" id="next-up-title">
            {C.title}
          </h2>
          <p className="next-up__lead">{C.lead}</p>
        </div>
      </div>

      <ul className="next-up__list">
        {items.map((item) => (
          <li key={item.id}>
            <NextUpRow item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function NextUpRow({ item }: { item: NextUpItem }) {
  return (
    <Link href={item.href} className="next-up__item">
      {/*
        The well carries the COUNT itself for a lecture row — «3» in solid
        amber. It is the one number on this screen that is a task rather than
        a score, and printing it at the head of the row is the difference
        between «فاضلك 3 دروس» reading as a sentence and reading as a label.
        The exam has no count worth drawing, so it gets its glyph instead.
      */}
      <span className="next-up__well" aria-hidden="true">
        {item.kind === 'exam' ? <ClipboardCheck className="size-[1.125rem]" /> : item.count}
      </span>

      <span className="next-up__text">
        <span className="next-up__label">{item.label}</span>
        <span className="next-up__course">{item.courseTitle}</span>
      </span>

      <span className="next-up__cta">
        {item.kind === 'exam' ? C.ctaExam : C.ctaLessons}
      </span>
    </Link>
  );
}

/**
 * 100%.
 *
 * It names what was finished, because a congratulation that does not know what
 * you did is a status message with an exclamation mark on it. It says
 * something in Ayman's own voice rather than the platform's, because the one
 * thing a student wants at the end of a syllabus is for the person who taught
 * it to have noticed. And it ends in two real controls, because «مبروك» with
 * nowhere to go next is where a finished student quietly stops opening the
 * app.
 */
function Celebration({
  titles,
  greetingName,
}: {
  titles: readonly string[];
  greetingName: string | null;
}) {
  const named = titles.slice(0, NAMED_COURSES).join(C.listSeparator);
  const rest = titles.length - NAMED_COURSES;
  const courses =
    rest > 0 ? `${named}${C.listSeparator}${formatCopy(C.wonAndMore, { n: rest })}` : named;

  return (
    <section className="next-up next-up--won" aria-labelledby="next-up-won-title">
      {/* Rays behind the disc. Pure decoration, so `aria-hidden` and no title:
          everything it means is already in the heading under it. */}
      <svg
        className="next-up__burst"
        viewBox="-100 -100 200 200"
        aria-hidden="true"
        focusable="false"
      >
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d="M 0 0 L -5 -100 L 5 -100 Z" transform={`rotate(${i * 30})`} />
        ))}
      </svg>

      <div className="next-up__won-body-wrap">
        <span className="next-up__trophy" aria-hidden="true">
          <Trophy className="size-8" />
        </span>

        <h2 className="next-up__won-title" id="next-up-won-title">
          {greetingName
            ? formatCopy(C.wonTitle, { name: greetingName })
            : C.wonTitleFallback}
        </h2>

        <p className="next-up__won-body">
          {courses.length > 0 ? formatCopy(C.wonCourses, { courses }) : C.wonCoursesPlain}
        </p>

        <p className="next-up__won-note">{C.wonNote}</p>

        <div className="next-up__won-actions">
          <Link href="/results" className="next-up__won-cta">
            {C.wonResults}
          </Link>
          <Link href="/library" className="next-up__won-cta next-up__won-cta--quiet">
            {C.wonBrowse}
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   HANDOVER — what a «مبروك» NOTIFICATION would still need.

   Ayman asked for two things at 100%: «فرحة عليها بشكل حلو» (this card) and
   «تهنّيه وتبعتله مسج تشجّعه» — an actual message. The second is deliberately
   NOT built here, because it cannot be built in a component at all:

   1. AN EMIT POINT IN THE API, not the browser. This block only renders while
      a student is looking at `/dashboard`, which is exactly when they least
      need to be told. The moment worth catching is the heartbeat or the
      manual-complete that takes the last lesson over the line — `PlayerService`
      already computes `justCompleted` and `courseProgressPercent` per request
      and is the only place that knows the transition happened rather than that
      the total is currently 100.

   2. A NEW NOTIFICATION KIND in `@ayman/contracts/notifications`, plus its
      Prisma enum value and a migration. Reusing an existing kind would put a
      congratulation under whatever heading and icon that kind already owns.

   3. ONCE-ONLY DELIVERY, which needs somewhere to write "this was sent". Every
      other derived thing on this screen is deliberately stateless and may go
      backwards — `achievements.ts` says so out loud — and that is fine for a
      badge and unacceptable for a message: a student who unenrols and re-enrols
      must not be congratulated twice, and one whose last lesson is
      un-published must not have it retracted. This is the one piece of the
      feature that genuinely wants a row.

   4. THE COPY, in `ar.ts`, under the notification's own keys rather than these.
      A push notification is read on a lock screen with no card around it, so it
      cannot be the same sentence as `C.wonNote`.

   None of the four is in this slice's files. This comment is the spec.
   --------------------------------------------------------------------------- */
