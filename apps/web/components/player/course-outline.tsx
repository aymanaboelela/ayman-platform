import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, ClipboardList, Lock, Play } from 'lucide-react';
import { copy, type CourseOutline } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { formatDuration } from '@/lib/format';
import {
  groupIntoEntries,
  isLessonFinished,
  remainingLectures,
  type RemainingLecture,
} from '@/lib/course-outline';
import { LockedExam } from '@/components/library/locked-exam';
import { MonthLockedDialog } from '@/components/library/month-locked-dialog';
import { LtrRatio } from '@/components/ltr-ratio';
import { ChevronForward } from './icons';
import { OutlineScrollToCurrent } from './outline-scroll-to-current';
import { LessonProgressBar } from './lesson-progress-bar';
import { UnitPoster } from './unit-poster';

const c = copy.library;
const u = copy.player.units;

type Lesson = CourseOutline['sections'][number]['lessons'][number];
type Section = CourseOutline['sections'][number];

export interface CourseOutlineSidebarProps {
  outline: CourseOutline;
  activeLessonId: string;
  /**
   * The lecture right after the active one in reading order — the player
   * payload's `next`. It is the one row that wears a chip («التالي»); every
   * other open row is simply a link, see `Row`.
   */
  nextLessonId: string | null;
  /** «جروب الدفعة» · «مساعدة» · «اطلب الكتاب» — `CourseSideLinks`, or nothing. */
  footer?: ReactNode;
}

/** Shared by every row of a unit — what the locked rows need to explain themselves. */
interface RowContext {
  courseSlug: string;
  activeLessonId: string;
  nextLessonId: string | null;
  /** Whether this course sells by month at all — the padlock says «شهر تاني»
   *  only when there is a month to name. See `MonthLockedDialog`. */
  byMonth: boolean;
  /** What the locked exam is still waiting on — course-wide. */
  remaining: number;
  totalLessons: number;
  left: readonly RemainingLecture[];
}

/**
 * What a quiz row offers to DO. «دخول الامتحان» invites a sitting, and a
 * lecture quiz has exactly one — so a quiz already sat (passed OR failed)
 * offers the result instead, and a cleared one reads «مراجعة» like any other
 * finished lesson.
 */
function quizLabel(lesson: Lesson): string {
  if (lesson.gate === 'cleared') return c.review;
  const sat = lesson.state === 'failed' || lesson.state === 'passed';
  return sat ? c.quizDone : c.takeQuiz;
}

/**
 * One lesson row, and the rule that replaced «مشاهدة» on forty rows.
 *
 * The old row was icon + title + a meta line («المحاضرة ٥ · 48:10 · لسه
 * ماشوفتهاش») + a solid chip on every row. In a 380px rail that is three lines
 * per lecture and a wall of amber; the student reported the page as crowded.
 * Now a row is a state mark, the title and the duration — and exactly ONE
 * thing is a control:
 *
 *   - the row you are ON is not a control at all; it says so («بتتفرج دلوقتي»)
 *   - a quiz keeps a chip, because sitting an exam is a different act from
 *     opening a video and must not be a tap on a title
 *   - the NEXT lecture keeps a quiet chip, because it is the one row a
 *     student looks for after the video ends
 *   - a locked row keeps the padlock chip that explains itself
 *   - every other row IS the link, title and all, so a tap anywhere opens it
 *
 * Still one tab stop per row (the chip rows stretch the chip's hit area over
 * the row with `.orow__chip::after`), so a screen reader gets one entry per
 * lesson rather than two.
 */
function Row({
  lesson,
  isQuiz = false,
  n = null,
  ctx,
}: {
  lesson: Lesson;
  /** A quiz hanging off the lecture above it — indented, not a lecture of its own. */
  isQuiz?: boolean;
  /** The lecture's place in its unit — printed in the ring of a row still ahead. */
  n?: number | null;
  ctx: RowContext;
}) {
  const isActive = lesson.id === ctx.activeLessonId;
  const finished = isLessonFinished(lesson);
  const locked = lesson.gate === 'locked';
  const href = `/courses/${ctx.courseSlug}/lessons/${lesson.id}`;
  const time = lesson.estimatedSeconds ? formatDuration(lesson.estimatedSeconds) : null;

  const mark = (
    <span className="orow__mark" aria-hidden="true">
      {/* The play glyph wins on the row you are on, finished or not — the
          board's ▶ «where we are» — and the tick is for the rows behind. */}
      {isActive ? (
        <Play className="size-3" fill="currentColor" />
      ) : finished ? (
        <Check className="size-3" strokeWidth={3} />
      ) : locked ? (
        <Lock className="size-3" />
      ) : lesson.kind === 'quiz' ? (
        <ClipboardList className="size-3.5" />
      ) : n !== null ? (
        <span className="orow__n">{n}</span>
      ) : null}
    </span>
  );
  const text = (
    <>
      <span className="orow__title">{lesson.title}</span>
      {time ? <span className="orow__time">{time}</span> : null}
    </>
  );
  const className = cn(
    'orow',
    finished && 'orow--done',
    isActive && 'orow--current',
    isQuiz && 'orow--quiz',
    locked && 'orow--locked',
  );

  if (isActive) {
    /* Two lines, the board's: the title, then where we are and how long it
       is — the label is a fact about the row, not a control beside it. */
    return (
      <li className={className} aria-current="true">
        {mark}
        <span className="orow__stack">
          <span className="orow__title">{lesson.title}</span>
          <span className="orow__state">
            {u.watching}
            {time ? (
              <>
                {' · '}
                <span className="orow__time">{time}</span>
              </>
            ) : null}
          </span>
        </span>
      </li>
    );
  }

  if (locked) {
    /*
     * `locked` has TWO causes and they need opposite dialogs — the same split
     * `library/course-outline.tsx` makes. The final exam is waiting on WORK;
     * a lecture in a month the subscription does not cover is waiting on a
     * PAYMENT, and the padlock exists so there is something to press.
     */
    return (
      <li className={className}>
        {mark}
        {text}
        {lesson.isExam ? (
          <LockedExam
            remaining={ctx.remaining}
            total={ctx.totalLessons}
            left={ctx.left}
            courseSlug={ctx.courseSlug}
          />
        ) : (
          <MonthLockedDialog
            courseSlug={ctx.courseSlug}
            month={lesson.month}
            byMonth={ctx.byMonth}
            triggerClassName="chip chip--locked orow__chip"
          >
            <Lock className="size-3.5" />
            {ctx.byMonth ? c.lessonMonthLocked : c.lessonLocked}
          </MonthLockedDialog>
        )}
      </li>
    );
  }

  if (lesson.kind === 'quiz') {
    const label = quizLabel(lesson);
    return (
      <li className={className}>
        {mark}
        {text}
        <Link
          href={href}
          // The visible word is the same on every quiz row; the title is
          // appended so the links list reads one distinct name per row.
          aria-label={`${label} — ${lesson.title}`}
          className={cn('chip orow__chip', finished ? 'chip--done' : 'chip--solid')}
        >
          {label}
        </Link>
      </li>
    );
  }

  if (lesson.id === ctx.nextLessonId) {
    return (
      <li className={className}>
        {mark}
        {text}
        <Link
          href={href}
          aria-label={`${u.nextChip} — ${lesson.title}`}
          className="chip chip--quiet orow__chip orow__chip--next"
        >
          {u.nextChip}
          <ChevronForward className="size-3.5" />
        </Link>
      </li>
    );
  }

  return (
    <li className={className}>
      <Link href={href} className="orow__link">
        {mark}
        {text}
      </Link>
    </li>
  );
}

/**
 * One unit as a CARD: its picture, its name, how far along it is — and its
 * lessons only while it is open.
 *
 * Every section used to be a flat label over every one of its rows, all
 * expanded, so a four-unit course was forty rows the student scrolled past to
 * find where they were. The unit holding the active lesson is the only one
 * open; a finished unit folds to a tick; a unit the subscription does not
 * cover yet is a greyed card with the one thing to press on it.
 *
 * Native `<details>`: the disclosure needs no JavaScript, works from the
 * keyboard, and keeps this file a Server Component — the same call
 * `/library/[slug]`'s `<Unit>` made.
 */
function UnitCard({ section, index, ctx }: { section: Section; index: number; ctx: RowContext }) {
  const entries = groupIntoEntries(section.lessons);
  const lectures = entries.map((entry) => entry.lecture);
  const done = lectures.filter(isLessonFinished).length;
  const isCurrent = section.lessons.some((lesson) => lesson.id === ctx.activeLessonId);
  const allDone = lectures.length > 0 && done === lectures.length;
  const percent = lectures.length > 0 ? Math.round((done / lectures.length) * 100) : 0;
  const unitLabel = copy.player.header.unit.replace('{n}', String(index + 1));

  /*
   * A unit whose EVERY lecture is month-locked is a month the student has not
   * bought: one card, one «افتح الشهر». Opening it to show six padlocks would
   * be six copies of the same answer. The exam is excluded from the test —
   * it locks for a different reason (work, not payment).
   */
  const monthLocked =
    !isCurrent &&
    lectures.length > 0 &&
    lectures.every((lesson) => lesson.gate === 'locked' && !lesson.isExam);
  const month = lectures.find((lesson) => lesson.month !== null)?.month ?? null;

  if (monthLocked) {
    return (
      <li className="ocard ocard--locked">
        <div className="ocard__head ocard__head--static">
          <UnitPoster coverKey={section.coverKey} seed={section.id} number={index + 1} locked />
          <span className="ocard__text">
            <span className="ocard__eyebrow">
              {unitLabel}
              {month ? ` · ${month.title}` : ''}
            </span>
            <span className="ocard__title">{section.title}</span>
          </span>
          <MonthLockedDialog
            courseSlug={ctx.courseSlug}
            month={month}
            byMonth={ctx.byMonth}
            triggerClassName="chip chip--quiet"
          >
            <Lock className="size-3.5" />
            {u.openMonth}
          </MonthLockedDialog>
        </div>
      </li>
    );
  }

  return (
    <li>
      <details className={cn('ocard', isCurrent && 'ocard--current')} open={isCurrent}>
        {/* The unit you are in wears its picture as a BANNER — the board's
            poster header, with a scrim for the white type over it and the
            unit's progress as a hairline along its foot. Every other unit
            keeps the square tile. */}
        <summary className={cn('ocard__head', isCurrent && 'ocard__head--banner')}>
          <UnitPoster coverKey={section.coverKey} seed={section.id} number={index + 1} banner={isCurrent} />
          {isCurrent ? <span className="ocard__scrim" aria-hidden="true" /> : null}
          <span className="ocard__text">
            <span className="ocard__eyebrow">
              {unitLabel}
              {isCurrent ? ` · ${u.youAreHere}` : ''}
            </span>
            <span className="ocard__title">{section.title}</span>
          </span>
          {allDone ? (
            <span className="chip chip--done ocard__done">
              <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
              <LtrRatio value={done} of={lectures.length} />
            </span>
          ) : (
            <span className="ocard__ratio">
              <LtrRatio value={done} of={lectures.length} />
            </span>
          )}
          <ChevronDown size={18} aria-hidden="true" className="ocard__chevron" />
          {isCurrent ? (
            <span className="ocard__track" aria-hidden="true">
              <span className="ocard__fill" style={{ inlineSize: `${percent}%` }} />
            </span>
          ) : null}
        </summary>

        <ol className="ocard__body">
          {entries.map((entry, at) => (
            <Fragment key={entry.lecture.id}>
              <Row lesson={entry.lecture} n={at + 1} ctx={ctx} />
              {entry.quizzes.map((quiz) => (
                <Row lesson={quiz} isQuiz ctx={ctx} key={quiz.id} />
              ))}
            </Fragment>
          ))}
        </ol>
      </details>
    </li>
  );
}

/**
 * «محتوى الكورس» in the lesson page: the course's progress, then its units as
 * cards, then the three side links. Rendered once in the desktop rail and
 * once inside the phone's bottom sheet (`OutlineSheet`) — same element, two
 * slots.
 *
 * RTL-native, not mirrored. Nothing here knows about left or right.
 */
export function CourseOutlineSidebar({
  outline,
  activeLessonId,
  nextLessonId,
  footer,
}: CourseOutlineSidebarProps) {
  const lessons = outline.sections.flatMap((section) => section.lessons);
  const ctx: RowContext = {
    courseSlug: outline.course.slug,
    activeLessonId,
    nextLessonId,
    // A lecture carrying a month anywhere means the course sells by month;
    // none at all means a padlock here is a code-only student's, not a month's.
    byMonth: lessons.some((lesson) => lesson.month !== null),
    remaining: Math.max(0, outline.totalLessons - outline.completedLessons),
    totalLessons: outline.totalLessons,
    // Same list the library outline builds — the locked exam explains itself
    // identically in both places.
    left: remainingLectures(lessons),
  };

  return (
    <nav aria-label={copy.player.outline} data-course-outline="" className="outline">
      <div className="outline__head">
        <div className="outline__row">
          <span className="outline__title">{copy.player.outline}</span>
          <span className="outline__ratio tabular">
            <LtrRatio value={outline.completedLessons} of={outline.totalLessons} />
            {' · '}
            <bdi dir="ltr">{`${Math.round(outline.progressPercent)}%`}</bdi>
          </span>
        </div>
        <LessonProgressBar percent={outline.progressPercent} label={copy.player.courseProgress} />
      </div>

      {/* `data-outline-scroller`: on a desktop this list is the part that
          scrolls inside the sticky rail, so `OutlineScrollToCurrent` centres
          the current row in IT rather than in the panel. */}
      <ol className="outline__units" data-outline-scroller="">
        {outline.sections.map((section, index) => (
          <UnitCard section={section} index={index} ctx={ctx} key={section.id} />
        ))}
      </ol>

      {footer}

      {/* Renders nothing. A bounded list that opens at lesson 1 of 40 is a
          worse answer than an unbounded one, so the box has to arrive already
          showing where the student is. */}
      <OutlineScrollToCurrent activeLessonId={activeLessonId} />
    </nav>
  );
}
