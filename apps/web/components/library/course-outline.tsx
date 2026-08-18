import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { CourseEntry } from '@/components/site/course-entry';
import { LessonKindIcon } from '@/components/player/lesson-kind-icon';
import { formatDuration } from '@/components/site/course-card';
import { isLessonFinished, lessonStateLabel, lessonStateMark } from '@/lib/course-outline';
import type {
  CourseOutline,
  OutlineEntry,
  OutlineLesson,
  OutlineSection,
} from '@/lib/course-outline';
import { LockedExam } from './locked-exam';

const c = copy.library;

/**
 * The course's sections and lessons, in the four states the gate produces.
 *
 * ## Why a section is a `<details>` now
 *
 * A forty-lesson course was one uninterrupted column of rows: correct, and
 * unreadable. `.unit` gives each section a real container with a filled header
 * and its own counter, and collapsing all but one turns the page into
 * something a student can hold in their head. The disclosure is native —
 * `<details>`/`<summary>` — so it works with no JavaScript, keyboard included,
 * and this file stays a Server Component.
 *
 * Which one opens is not a preference: the section holding `nextLessonId` is
 * where the student left off, so that is the one already open when the page
 * paints. Nothing in progress → the first section, because that is where a new
 * student starts.
 *
 * ## Why the lesson number counts across sections
 *
 * A student says "I'm on lecture 7", never "I'm on lecture 2 of section 3".
 * The number is the one label they use to locate themselves, so it counts the
 * whole course — which is also the order the progression gate walks.
 *
 * ## Why «امتحن» and «مشاهدة» are different words
 *
 * They are different acts with different stakes: one is a graded, timed sitting
 * that goes on a record, the other is a video that can be closed. A single
 * «فتح» on both is how a student ends up starting an exam by accident.
 *
 * ⚠️ Everything here is a RENDER of a decision the server already made. The
 * gate is re-derived by `/courses/:slug/lessons/:id` on every request, which
 * 404s a locked lesson — opening a `<details>` or editing a class in devtools
 * unlocks nothing.
 */
/**
 * What the button offers to DO.
 *
 * «امتحن» is an invitation to start something, and a lecture quiz has exactly
 * one sitting — so offering it to a student who has already sat the quiz asks
 * them to do a thing the server will refuse: «أقول امتحن، امتحن إزاي، وأنا
 * أصلاً ممتحن». A quiz they have already taken — passed OR failed — offers the
 * only thing left, which is the result.
 *
 * `cleared` is handled by the caller: a passed quiz reads «راجع» like any other
 * finished lesson. This is the FAILED and in-progress case, which the gate
 * cannot distinguish from "never opened" on its own.
 */
function actionLabel(lesson: OutlineLesson): string {
  if (lesson.kind !== 'quiz') return c.watch;
  const sat = lesson.state === 'failed' || lesson.state === 'passed';
  return sat ? c.quizDone : c.takeQuiz;
}

function LessonAction({
  lesson,
  courseSlug,
  courseId,
  clearedLessons,
  totalLessons,
}: {
  lesson: OutlineLesson;
  courseSlug: string;
  courseId: string;
  /** LECTURES cleared and in all — what the locked exam is still waiting on. */
  clearedLessons: number;
  totalLessons: number;
}) {
  // The ONE row the gate can still close. Every lecture and every lecture quiz
  // is available from the day the student enrols — see `gate-rule.ts`.
  if (lesson.gate === 'locked') {
    return (
      <LockedExam
        remaining={Math.max(0, totalLessons - clearedLessons)}
        total={totalLessons}
      />
    );
  }

  /*
   * No gate at all → signed in, but not enrolled in THIS course.
   *
   * This used to render nothing, on the reasoning that the outline should stay
   * readable to someone deciding whether to start while "nothing in it opens".
   * That reasoning does not survive contact with what the course actually is:
   * every course on this platform is free, and enrolling is a single upsert
   * that the student is going to perform anyway. So the row offered a student
   * who was already signed in, already looking at the course, a title and no
   * way in — the same dead end the public page's lock badge was, one route
   * over.
   *
   * `<CourseEntry>` collapses the two steps into the one the student meant:
   * press «مشاهدة», get enrolled, land in the lesson. It is the same component
   * the public course page uses, so both routes resolve a click identically —
   * and it still cannot open a lesson the gate has closed, because the server
   * re-derives that on arrival and redirects to this very page.
   */
  if (lesson.gate === null) {
    const label = lesson.kind === 'quiz' ? c.takeQuiz : c.watch;
    return (
      <CourseEntry
        courseId={courseId}
        slug={courseSlug}
        lessonId={lesson.id}
        ariaLabel={`${label} — ${lesson.title}`}
        className="chip chip--solid lesson-row__link"
      >
        {label}
      </CourseEntry>
    );
  }

  const cleared = lesson.gate === 'cleared';
  // Two different questions, and they part company on exactly one row: a quiz
  // that was sat and failed. It is FINISHED — one sitting, spent — but it is
  // not CLEARED, so it keeps «نتيجتك» as its word while wearing the finished
  // chip. See `isLessonFinished`.
  const finished = isLessonFinished(lesson);
  const label = cleared ? c.review : actionLabel(lesson);

  return (
    <Link
      href={`/courses/${courseSlug}/lessons/${lesson.id}`}
      // The visible word is «مشاهدة» on forty rows; a screen reader user
      // pulling up the links list would get forty identical entries. The title
      // is appended, never substituted, so the label still reads first.
      aria-label={`${label} — ${lesson.title}`}
      // The amber solid goes on the ONE class of thing that moves a student
      // forward. A cleared lesson is a revisit, so it wears the completion
      // green instead — otherwise a finished course is a wall of accent
      // buttons and none of them mean anything.
      //
      // `.lesson-row__link` stretches this link's hit area over the whole row
      // without adding a second tab stop — see study.css. The row washed on
      // hover and did nothing when pressed, and a student aims at the TITLE.
      className={cn('chip lesson-row__link', finished ? 'chip--done' : 'chip--solid')}
    >
      {label}
    </Link>
  );
}

function LessonRow({
  lesson,
  courseSlug,
  courseId,
  clearedLessons,
  totalLessons,
  isQuiz = false,
}: {
  lesson: OutlineLesson;
  courseSlug: string;
  courseId: string;
  clearedLessons: number;
  totalLessons: number;
  /** A quiz hanging off the lecture above it — indented, and not numbered. */
  isQuiz?: boolean;
}) {
  const finished = isLessonFinished(lesson);
  const locked = lesson.gate === 'locked';
  /*
    No gate at all → signed in, but not enrolled in THIS course.

    The state marker is suppressed for exactly the reason the section counter
    prints «٥ محاضرات» instead of «0 / 5» before enrolling: «لسه ماشوفتهاش» on
    all forty rows tells someone still deciding whether to start that they have
    failed at forty things. Nothing has happened because nothing COULD have.
  */
  const enrolled = lesson.gate !== null;
  const mark = enrolled ? lessonStateMark(lesson) : null;

  // One line, joined rather than laid out: the meta is mono and tabular, and a
  // flex row of four spans wrapped raggedly on a phone. The state is carried as
  // a WORD and not only as a colour — it must survive being read aloud,
  // printed, or looked at by someone who cannot separate two greys.
  //
  // ⚠️ It used to say «خلصت» on the finished rows and NOTHING on the rest,
  // which was survivable only while the padlock was doing the telling: a run of
  // locks with one open row at the front answered "where am I" by the shape of
  // the column. Every lecture opens now (`gate-rule.ts`), so the shape says
  // nothing and every row states where the student stands — «بس ابقى علّم عليها
  // إن هو ما شافهاش». The locked exam is the exception: its chip already reads
  // «مقفول» two columns over, and «لسه ما امتحنتش» beside it would be a second
  // answer to a question the row has already answered.
  //
  // A quiz does NOT restate «المحاضرة ٢»: it is already sitting under that
  // lecture and its own title names it. Repeating the number was what made the
  // outline read as five lectures when the course has three.
  const meta = [
    isQuiz ? c.lessonQuiz : c.lessonIndex.replace('{n}', String(lesson.index)),
    lesson.isExam ? c.exam : null,
    lesson.durationSeconds ? formatDuration(lesson.durationSeconds) : null,
    locked || !enrolled ? null : lessonStateLabel(lesson),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li
      className={cn(
        'lesson-row',
        finished && 'lesson-row--done',
        locked && 'lesson-row--locked',
        // The unwatched row gets a mark of its own in the well — see study.css.
        // Not a colour on the title: the row is not a warning, it is a row the
        // student has not reached yet, and forty of them tinted would make the
        // handful they HAVE watched the exception rather than the signal.
        mark === 'new' && !locked && 'lesson-row--new',
        mark === 'started' && 'lesson-row--started',
        isQuiz && 'lesson-row--quiz',
      )}
    >
      {/* WHAT the row is — video, quiz, reading. Structural, so ember; the
          chip beside it is what you can DO about it, so amber. */}
      <span className="lesson-row__well" aria-hidden="true">
        <LessonKindIcon kind={lesson.kind} className="h-4 w-4" />
      </span>

      <div className="lesson-row__text">
        {/* The title WRAPS — no `truncate`. It is how a student identifies the
            lecture, and on a phone the row's fixed well and chip left it about
            150px, which turned «الكورس التأسيسي لمادة البرمجة — المحاضرة
            الأولى» into «الكورس التأسي…». The meta line keeps truncating: it is
            «المحاضرة ١ · ٣٩ دقيقة», already short, and nothing is lost if its
            tail goes. */}
        <p className="lesson-row__title">{lesson.title}</p>
        <p className="lesson-row__meta truncate">{meta}</p>
      </div>

      {/* The row itself is never a link. Exactly one control per row, or every
          lesson lands twice in the tab order and is read twice. */}
      <LessonAction
        lesson={lesson}
        courseSlug={courseSlug}
        courseId={courseId}
        clearedLessons={clearedLessons}
        totalLessons={totalLessons}
      />
    </li>
  );
}

/**
 * One lecture and, tucked under it, its quiz.
 *
 * The nesting is the point: a quiz is not the next thing in the course, it is
 * the check on the thing above it. Rendering it as a sibling row made a
 * three-lecture course look like five steps, gave each quiz a lecture number of
 * its own, and — before `resolveGate` stopped treating quizzes as chain links —
 * let one failed quiz sit in the middle of the column with everything after it
 * shut.
 */
function LectureEntry({
  entry,
  courseSlug,
  courseId,
  clearedLessons,
  totalLessons,
}: {
  entry: OutlineEntry;
  courseSlug: string;
  courseId: string;
  clearedLessons: number;
  totalLessons: number;
}) {
  const counts = { clearedLessons, totalLessons };
  return (
    <>
      <LessonRow
        lesson={entry.lecture}
        courseSlug={courseSlug}
        courseId={courseId}
        {...counts}
      />
      {entry.quizzes.map((quiz) => (
        <LessonRow
          lesson={quiz}
          courseSlug={courseSlug}
          courseId={courseId}
          {...counts}
          isQuiz
          key={quiz.id}
        />
      ))}
    </>
  );
}

function Unit({
  section,
  courseSlug,
  courseId,
  enrolled,
  open,
  clearedLessons,
  totalLessons,
}: {
  section: OutlineSection;
  courseSlug: string;
  courseId: string;
  enrolled: boolean;
  open: boolean;
  /** Course-wide, not this section's — the exam waits on the whole course. */
  clearedLessons: number;
  totalLessons: number;
}) {
  // Counted over LECTURES — the quizzes hanging off them are not steps, and the
  // API's `clearedLessons`/`totalLessons` count the same way. «٢ / ٣» beside a
  // «66.67%» that was computed out of five is the bug this closes.
  const cleared = section.entries.filter((entry) => entry.lecture.gate === 'cleared').length;

  return (
    <details className="unit" open={open}>
      <summary className="unit__head">
        {/* A heading inside <summary> is legal (the content model allows one)
            and it is what keeps the outline navigable by heading for a screen
            reader — a page of forty lessons under a single h2 is a wall. */}
        <h3 className="unit__title">
          {section.title}
          {section.summary ? <span className="unit__sub">{section.summary}</span> : null}
        </h3>

        {/* «٣ / ٥» only means something once there is progress to count.
            Before enrolling every section would read "0 / 5", which says
            "you have failed at nothing yet" — so it states the size instead. */}
        <span className="unit__count">
          {enrolled
            ? `${cleared} / ${section.entries.length}`
            : c.lessonCount.replace('{n}', String(section.entries.length))}
        </span>

        <ChevronDown size={18} aria-hidden="true" className="unit__chevron" />
      </summary>

      <ul className="unit__body">
        {section.entries.map((entry) => (
          <LectureEntry
            entry={entry}
            clearedLessons={clearedLessons}
            totalLessons={totalLessons}
            courseSlug={courseSlug}
            courseId={courseId}
            key={entry.lecture.id}
          />
        ))}
      </ul>
    </details>
  );
}

export function CourseOutlineView({
  outline,
  courseSlug,
  courseId,
}: {
  outline: CourseOutline;
  courseSlug: string;
  /** Needed only by the not-enrolled rows, which enroll on click. */
  courseId: string;
}) {
  const { nextLessonId } = outline;
  const openSectionId =
    (nextLessonId
      ? outline.sections.find((section) =>
          section.entries.some(
            (entry) =>
              entry.lecture.id === nextLessonId ||
              entry.quizzes.some((quiz) => quiz.id === nextLessonId),
          ),
        )?.id
      : undefined) ??
    outline.sections[0]?.id ??
    null;

  return (
    <section>
      <div className="group-head">
        <span className="group-head__mark" aria-hidden="true" />
        <h2 className="group-head__title">{c.outline}</h2>
        <span className="group-head__count">
          {c.lessonCount.replace('{n}', String(outline.totalLessons))}
        </span>
      </div>

      {outline.sections.map((section) => (
        <Unit
          section={section}
          courseSlug={courseSlug}
          courseId={courseId}
          enrolled={outline.enrolled}
          clearedLessons={outline.clearedLessons}
          totalLessons={outline.totalLessons}
          open={section.id === openSectionId}
          key={section.id}
        />
      ))}
    </section>
  );
}
