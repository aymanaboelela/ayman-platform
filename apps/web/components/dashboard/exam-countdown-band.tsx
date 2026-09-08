import Link from 'next/link';
import { AlarmClock, AlertTriangle, BookOpen, CalendarClock, Hourglass } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { EXAM_LIVE_COUNTDOWN_SECONDS, type StudentExam } from '@ayman/contracts/quiz/scheduled';
import { quizHref } from '@/lib/quiz-links';
import { ExamCountdownClock } from './exam-countdown-clock';

const c = copy.dashboard.exams;

/**
 * `Africa/Cairo`, pinned, and not the machine's zone.
 *
 * `openFrom` is a UTC instant and this line is the whole point of the band —
 * «هيفتح الجمعة ٨ م». Formatted with no `timeZone`, Node uses the container's,
 * which in production is UTC: an exam the instructor scheduled for 8pm would
 * print as 6pm to every student in the country, and the band would be lying
 * about the one fact it exists to state. Every student on this platform sits in
 * one zone, so this is a constant rather than a preference — the same call
 * `admin/audit/columns.tsx` and `marketing/pacing.ts` already make.
 *
 * ⚠️ Formatted on the SERVER only. The string is baked into the markup and
 * handed down; nothing re-formats it in the browser, so a device set to another
 * zone cannot produce a hydration mismatch here.
 */
const stamp = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  timeZone: 'Africa/Cairo',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * «امتحان الشهر» — the band directly under `<DashboardHero>`, in the two phases
 * where the exam is still ahead of the student.
 *
 * ## Where it sits, and what the page's own rules make of that
 *
 * `dashboard/page.tsx` is organised around one rule: exactly ONE element on the
 * screen is the primary action. This band obeys it in both directions.
 *
 *   `upcoming` — ember, full width, and NOT pressable. There is nothing to
 *                press yet, so putting an accent button here would be a door
 *                onto a room the server has locked (`assertCanAttempt` answers
 *                `quiz_not_open_yet` until the instant `openFrom` names). What
 *                it carries instead is the countdown, the date, and the covered
 *                lessons — the answer to "what do I revise tonight".
 *   `open`      — the same band, now carrying «ادخل الامتحان», and the page
 *                 stands `<NextUpBlock>` down for exactly as long as it is
 *                 there. That is the one-action rule holding rather than being
 *                 excepted: for those few hours, the exam IS what to do next.
 *   `closed`    — gone from here entirely. `<MonthlyExamsSection>` picks it up
 *                 down in the main column, with its score and its paper.
 *
 * ## Why it is a band and not a card
 *
 * «شكلها كبير ويبقى باين». A card in the main column is one of nine blocks
 * competing at the same width; a full-width band above the split is the page
 * saying something before the page starts. Ember, because ember is STRUCTURE
 * and this is chrome announcing a fact — see `exam-band.css` for the colour
 * argument in full, including why the eyebrow is the one amber thing on it
 * while nothing is pressable.
 *
 * ## Absent, not empty
 *
 * `exam === null` renders nothing at all — no heading, no «مافيش امتحان». That
 * is most students on most days, and it is also what a failed
 * `/api/me/exams` produces (`getStudentExamsOrEmpty` returns `{ exams: [] }`
 * and swallows its own failure). The ambiguity is deliberate and is the safe
 * way round: the dashboard then looks exactly as it did before this feature
 * existed.
 */
export function ExamCountdownBand({
  exam,
  /** `StudentExams.serverTime` — the instant the payload was built. The clock
   *  anchors on it so a wrong device clock cannot warp the number, and the
   *  48-hour decision below is taken against it rather than against this
   *  machine's `Date.now()`, so the band and the payload can never disagree
   *  about how far away the exam is. */
  serverTime,
}: {
  /** `bandExam(...)` — the one exam this band gets, or `null`. */
  exam: StudentExam | null;
  serverTime: string;
}) {
  if (exam === null) return null;

  /*
   * Defensive, and cheap. `bandExam` cannot return a closed exam, but this
   * component is the thing that would render a countdown to a date in the past
   * if a future caller passed one, and a band counting UP is a support ticket.
   */
  if (exam.phase === 'closed') return null;

  const isOpen = exam.phase === 'open';

  /*
   * Whether the clock ticks, or the band prints a calendar line instead.
   *
   * `EXAM_LIVE_COUNTDOWN_SECONDS` is 48 hours and the contract owns the number.
   * Above it, «هيفتح الجمعة ٢٤ أكتوبر ٨:٠٠ م» is the honest rendering: a
   * per-second clock on a five-day wait tells the student nothing they can act
   * on and re-renders the dashboard every second for four days to do it.
   */
  const msUntilOpen =
    exam.openFrom === null ? null : new Date(exam.openFrom).getTime() - new Date(serverTime).getTime();
  const isLive =
    !isOpen &&
    exam.openFrom !== null &&
    msUntilOpen !== null &&
    msUntilOpen > 0 &&
    msUntilOpen <= EXAM_LIVE_COUNTDOWN_SECONDS * 1000;

  const durationMinutes =
    exam.durationSeconds === null ? null : Math.round(exam.durationSeconds / 60);
  const closesAt = exam.openUntil === null ? null : stamp.format(new Date(exam.openUntil));
  const opensAt = exam.openFrom === null ? null : stamp.format(new Date(exam.openFrom));

  return (
    /*
     * `<section>` with a real label rather than a `<div>`: on a page that is
     * already a run of named sections this is one more, and a student on a
     * screen reader landing on «امتحان قرب» followed by the exam's own title is
     * the whole band in two lines.
     */
    <section className="exam-band mb-6" aria-labelledby="exam-band-title">
      <div className="exam-band__main">
        <p className="exam-band__eyebrow">
          <AlarmClock size={16} aria-hidden="true" />
          <span>{isOpen ? c.openEyebrow : c.upcomingEyebrow}</span>
        </p>

        <h2 className="exam-band__title" id="exam-band-title">
          {exam.title}
        </h2>

        {/* Which course this belongs to. A student in عربي and لغات can have two
            monthly exams in a term, and «امتحان أكتوبر» on its own does not say
            which one they are being counted down to. */}
        <p className="exam-band__course">
          {formatCopy(c.courseLine, { course: exam.courseTitle })}
        </p>

        {/*
          «على الدروس» — the single most useful thing on the band, because it is
          what to revise. Chips rather than one joined sentence: see
          `exam-band.css` for why, and `ExamCoveredLesson` in the contract for
          why none of them is a link.

          An exam with no coverage recorded renders nothing here at all rather
          than an empty label — the picker is optional on the admin side, and a
          heading over no chips reads as a load that failed.
        */}
        {exam.coveredLessons.length > 0 ? (
          <div>
            <p className="exam-band__covers-label">
              <BookOpen size={14} aria-hidden="true" />
              <span>{c.coversLabel}</span>
            </p>
            <ul className="exam-band__covers-list">
              {exam.coveredLessons.map((lesson) => (
                <li key={lesson.lessonId} className="exam-band__cover">
                  {lesson.title}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* The two facts that change how a student plans the evening rather
            than just whether they show up. Either can be absent: an untimed
            paper has no `durationSeconds`, and an exam with no `openUntil` is
            open from its date onward. */}
        {durationMinutes !== null || closesAt !== null ? (
          <p className="exam-band__facts">
            {durationMinutes !== null ? (
              <span className="exam-band__fact">
                <Hourglass size={14} aria-hidden="true" />
                <span>{formatCopy(c.durationLine, { n: durationMinutes })}</span>
              </span>
            ) : null}
            {closesAt !== null ? (
              <span className="exam-band__fact">
                <CalendarClock size={14} aria-hidden="true" />
                <span>{formatCopy(c.closesAtLine, { date: closesAt })}</span>
              </span>
            ) : null}
          </p>
        ) : null}

        {/*
          «عندك محاولة واحدة بس» — stated BEFORE they press, in both phases.

          Verified rather than assumed: `attemptAllowance(false)` is 1, and
          `decideNextSitting` burns the allowance on EVERY attempt row including
          an abandoned one. A student whose phone dies at 20:04 has spent their
          exam, and the only remedy after that is an admin grant. Discovering
          that afterwards is the worst possible way to learn it, so it is on the
          band while the exam is still ahead of them — including in `upcoming`,
          where they still have time to arrange a quiet hour and a good
          connection, which is exactly what the sentence asks them to do.
        */}
        <p className="exam-band__warning">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{c.oneSittingWarning}</span>
        </p>
      </div>

      <div className="exam-band__aside">
        {isOpen ? (
          /* The page's one accent-filled action while this is on screen.
             `quizHref` and not a deep link into an attempt: the doorway is
             where the paper introduces itself, states its length and its
             marks, and starts the sitting — and it is the surface that
             already handles a student who is somehow blocked. */
          <Link href={quizHref(exam.lessonId)} className="exam-band__cta">
            {c.enter}
          </Link>
        ) : isLive && exam.openFrom !== null ? (
          <ExamCountdownClock opensAt={exam.openFrom} serverTime={serverTime} />
        ) : opensAt !== null ? (
          <p className="exam-band__opens">{formatCopy(c.opensAtLine, { date: opensAt })}</p>
        ) : null}
      </div>
    </section>
  );
}
