import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { copy, type CourseOutline } from '@ayman/contracts';
import { Badge, cn } from '@ayman/ui';
import { formatDuration } from '@/lib/format';
import {
  groupIntoEntries,
  isLessonFinished,
  lessonStateLabel,
  lessonStateMark,
  remainingLectures,
  type RemainingLecture,
} from '@/lib/course-outline';
import { LockedExam } from '@/components/library/locked-exam';
import { BookOrderButton } from '@/components/site/book-order-button';
import { courseBookCtaVisible } from '@/lib/course-book';
import { LessonKindIcon } from './lesson-kind-icon';
import { OutlineScrollToCurrent } from './outline-scroll-to-current';
import { LessonProgressBar } from './lesson-progress-bar';

const c = copy.library;

type Lesson = CourseOutline['sections'][number]['lessons'][number];
type Entry = { lecture: Lesson; quizzes: Lesson[] };

export interface CourseOutlineSidebarProps {
  outline: CourseOutline;
  activeLessonId: string;
  /** The delivery fee, from `getBookShippingCents()`. Quoted on the CTA so
   *  «اطلب الكتاب» names the total the form will ask for. */
  shippingCents: number;
  /** `contact.vodafoneCash`, E.164 or `null` — same prop `BookOrderButton`
   *  takes everywhere else it appears. */
  vodafoneCash: string | null;
}

/**
 * What the row's chip offers to DO.
 *
 * «امتحن» is an invitation to start something, and a lecture quiz has exactly
 * one sitting — so offering it to a student who has already sat the quiz asks
 * them to do a thing the server will refuse. `cleared` is handled by the
 * caller (a passed quiz reads «راجع» like any other finished lesson); this is
 * the FAILED-or-never-sat case, which the gate alone cannot tell apart.
 */
function actionLabel(lesson: Lesson): string {
  if (lesson.kind !== 'quiz') return c.watch;
  const sat = lesson.state === 'failed' || lesson.state === 'passed';
  return sat ? c.quizDone : c.takeQuiz;
}

function LessonChip({ lesson, courseSlug }: { lesson: Lesson; courseSlug: string }) {
  const cleared = lesson.gate === 'cleared';
  const finished = isLessonFinished(lesson);
  const label = cleared ? c.review : actionLabel(lesson);

  return (
    <Link
      href={`/courses/${courseSlug}/lessons/${lesson.id}`}
      // The visible word is «مشاهدة» on every row; the title is appended, never
      // substituted, so a screen reader pulling up the links list still gets
      // one distinct name per row rather than a wall of identical «مشاهدة».
      aria-label={`${label} — ${lesson.title}`}
      className={cn('chip lesson-row__link', finished ? 'chip--done' : 'chip--solid')}
    >
      {label}
    </Link>
  );
}

/**
 * One lesson row: kind icon, title, meta, and its one chip.
 *
 * The row itself is never a link — exactly one control per row, or every
 * lesson lands twice in the tab order and is announced twice. `.lesson-row__link`
 * (on the chip) stretches the pointer target over the whole row without adding
 * a second tab stop — see `study.css`.
 */
function LessonRow({
  lesson,
  courseSlug,
  isActive,
  isQuiz = false,
}: {
  lesson: Lesson;
  courseSlug: string;
  isActive: boolean;
  /** A quiz hanging off the lecture above it — indented, not a lecture of its own. */
  isQuiz?: boolean;
}) {
  const finished = isLessonFinished(lesson);
  const mark = lessonStateMark(lesson);

  const meta = [
    isQuiz ? c.lessonQuiz : null,
    lesson.isExam ? c.exam : null,
    lesson.estimatedSeconds ? formatDuration(lesson.estimatedSeconds) : null,
    lessonStateLabel(lesson),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li
      className={cn(
        'lesson-row',
        finished && 'lesson-row--done',
        mark === 'new' && 'lesson-row--new',
        mark === 'started' && 'lesson-row--started',
        isQuiz && 'lesson-row--quiz',
        isActive && 'outline-row--current',
      )}
      aria-current={isActive ? 'true' : undefined}
    >
      <span className="lesson-row__well" aria-hidden="true">
        <LessonKindIcon kind={lesson.kind} className="h-4 w-4" />
      </span>

      <div className="lesson-row__text">
        <p className="lesson-row__title">{lesson.title}</p>
        <p className="lesson-row__meta truncate">{meta}</p>
        {lesson.isFreePreview ? <Badge tone="accent">{copy.catalog.freePreview}</Badge> : null}
      </div>

      <LessonChip lesson={lesson} courseSlug={courseSlug} />
    </li>
  );
}

/**
 * One lecture, collapsed to its title until pressed — «اللي على الشمال ده
 * عايزك تكبّرها وتوضّح فيها زرار المشاهدة وزرار الامتحان لما بضغط عليها».
 *
 * Only entries that actually carry a quiz collapse at all. A lecture with
 * nothing hanging off it has exactly one action, and hiding a single chip
 * behind a click adds a tap with nothing to show for it — that case stays the
 * plain, always-visible row it always was.
 *
 * Native `<details>`, not client state: the disclosure needs no JavaScript,
 * works from the keyboard for free, and keeps this file a Server Component —
 * same call `/library/[slug]`'s own `<Unit>` accordion already made.
 */
function LectureEntry({
  entry,
  courseSlug,
  activeLessonId,
  remaining,
  totalLessons,
  left,
}: {
  entry: Entry;
  courseSlug: string;
  activeLessonId: string;
  /** What the locked exam is still waiting on — course-wide, not this entry's. */
  remaining: number;
  totalLessons: number;
  /** The same waiting-on, by name — the dialog lists them. */
  left: readonly RemainingLecture[];
}) {
  const { lecture, quizzes } = entry;

  if (lecture.gate === 'locked') {
    // The one row the gate can still close — the course's final exam. Never
    // nested under anything (an exam is excluded from `groupIntoEntries`'
    // quiz-adjacency rule), so it stays a plain row: there is nothing to
    // reveal by expanding it, only a reason it will not open yet.
    return (
      <li className="mb-2">
        <div className="lesson-row lesson-row--locked">
          <span className="lesson-row__well" aria-hidden="true">
            <LessonKindIcon kind={lecture.kind} className="h-4 w-4" />
          </span>
          <div className="lesson-row__text">
            <p className="lesson-row__title">{lecture.title}</p>
          </div>
          <LockedExam
            remaining={remaining}
            total={totalLessons}
            left={left}
            courseSlug={courseSlug}
          />
        </div>
      </li>
    );
  }

  if (quizzes.length === 0) {
    return (
      <LessonRow
        lesson={lecture}
        courseSlug={courseSlug}
        isActive={lecture.id === activeLessonId}
      />
    );
  }

  const isOpen =
    lecture.id === activeLessonId || quizzes.some((quiz) => quiz.id === activeLessonId);

  return (
    <li className="mb-2">
      <details className="unit" open={isOpen}>
        <summary className="unit__head">
          <span className="lesson-row__well" aria-hidden="true">
            <LessonKindIcon kind={lecture.kind} className="h-4 w-4" />
          </span>
          {/* A `<p>`, not a heading — the section label above it (`.map` in
              `CourseOutlineSidebar`) is plain text too, so nesting an `<h4>`
              under nothing would open a heading level the panel never
              started. */}
          <p className="unit__title">{lecture.title}</p>
          <span className="unit__count">
            {lecture.estimatedSeconds ? formatDuration(lecture.estimatedSeconds) : null}
          </span>
          <ChevronDown size={18} aria-hidden="true" className="unit__chevron" />
        </summary>

        <ul className="unit__body">
          <LessonRow
            lesson={lecture}
            courseSlug={courseSlug}
            isActive={lecture.id === activeLessonId}
          />
          {quizzes.map((quiz) => (
            <LessonRow
              lesson={quiz}
              courseSlug={courseSlug}
              isActive={quiz.id === activeLessonId}
              isQuiz
              key={quiz.id}
            />
          ))}
        </ul>
      </details>
    </li>
  );
}

/**
 * RTL-native, not mirrored. Nothing here knows about left or right — the
 * grid column order in the page layout follows the writing mode, and the
 * study.css classes this renders (`.lesson-row`, `.unit`, `.chip`) are all
 * built the same way.
 */
export function CourseOutlineSidebar({
  outline,
  activeLessonId,
  shippingCents,
  vodafoneCash,
}: CourseOutlineSidebarProps) {
  const remaining = Math.max(0, outline.totalLessons - outline.completedLessons);
  // Same list the library outline builds, off the flat payload this screen
  // already has — the locked exam explains itself identically in both places.
  const left = remainingLectures(outline.sections.flatMap((section) => section.lessons));
  // Title, price and placement — the same predicate the public course page and
  // `EnrolledCourseCard` read, so the linked book's `showOnCourse` cannot end
  // up honoured on two surfaces out of three.
  const hasBook = courseBookCtaVisible(outline.course);

  return (
    <nav
      aria-label={copy.player.outline}
      data-course-outline=""
      className={cn(
        'rounded-lg border border-line bg-surface-2',
        'max-h-[60dvh] overflow-y-auto',
        'lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start',
      )}
    >
      <div className="border-b border-line-subtle px-5 py-5">
        <p className="mb-3 text-[length:var(--fs-title-4)] font-semibold text-fg">
          {copy.player.outline}
        </p>
        <LessonProgressBar percent={outline.progressPercent} label={copy.player.courseProgress} />
        <p className="mono mt-2.5 text-[length:var(--fs-text-sm)] tabular text-fg-muted">
          {outline.completedLessons} {copy.player.lessonsCompleted} {outline.totalLessons}
        </p>

        {/* «اطلب الكتاب» — the same entry point the public course page and
            `EnrolledCourseCard` offer, here too: a student watching a lesson
            is arguably the most "inside" this course they ever are. No `z-`
            wrapper needed — unlike the dashboard card, nothing in this
            header carries a stretched link. `BookOrderButton`'s own
            `.course-start` wrapper supplies the top spacing. */}
        {hasBook ? (
          <BookOrderButton
            courseId={outline.course.id}
            bookTitle={outline.course.bookTitle as string}
            bookPriceCents={outline.course.bookPriceCents as number}
            shippingCents={shippingCents}
            vodafoneCash={vodafoneCash}
          />
        ) : null}
      </div>

      <ol className="py-2">
        {outline.sections.map((section, sectionIndex) => (
          <li key={section.id} className="mb-3">
            <p className="flex items-baseline gap-2 px-5 pb-1 pt-2">
              <span className="mono shrink-0 text-[length:var(--fs-mono-label)] tabular text-fg-muted">
                {String(sectionIndex + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0 font-semibold text-fg">{section.title}</span>
            </p>

            <ol className="px-2">
              {groupIntoEntries(section.lessons).map((entry) => (
                <LectureEntry
                  entry={entry}
                  courseSlug={outline.course.slug}
                  activeLessonId={activeLessonId}
                  remaining={remaining}
                  totalLessons={outline.totalLessons}
                  left={left}
                  key={entry.lecture.id}
                />
              ))}
            </ol>
          </li>
        ))}
      </ol>

      {/* Renders nothing. A bounded panel that opens at lesson 1 of 40 is a
          worse answer than an unbounded one, so the box has to arrive already
          showing where the student is. Still finds `[aria-current]` on the
          panel — `LessonRow` above sets it the same way the old flat list did. */}
      <OutlineScrollToCurrent activeLessonId={activeLessonId} />
    </nav>
  );
}
