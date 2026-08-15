import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { CourseEntry } from '@/components/site/course-entry';
import { LessonKindIcon } from '@/components/player/lesson-kind-icon';
import { formatDuration } from '@/components/site/course-card';
import type { CourseOutline, OutlineLesson, OutlineSection } from '@/lib/course-outline';
import { LockedLesson } from './locked-lesson';

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
 * «افتح» on both is how a student ends up starting an exam by accident.
 *
 * ⚠️ Everything here is a RENDER of a decision the server already made. The
 * gate is re-derived by `/courses/:slug/lessons/:id` on every request, which
 * 404s a locked lesson — opening a `<details>` or editing a class in devtools
 * unlocks nothing.
 */
function LessonAction({
  lesson,
  courseSlug,
  courseId,
}: {
  lesson: OutlineLesson;
  courseSlug: string;
  courseId: string;
}) {
  if (lesson.gate === 'locked') return <LockedLesson lesson={lesson} courseSlug={courseSlug} />;

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
  const label = cleared ? c.review : lesson.kind === 'quiz' ? c.takeQuiz : c.watch;

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
      className={cn('chip lesson-row__link', cleared ? 'chip--done' : 'chip--solid')}
    >
      {label}
    </Link>
  );
}

function LessonRow({
  lesson,
  courseSlug,
  courseId,
}: {
  lesson: OutlineLesson;
  courseSlug: string;
  courseId: string;
}) {
  const cleared = lesson.gate === 'cleared';
  const locked = lesson.gate === 'locked';

  // One line, joined rather than laid out: the meta is mono and tabular, and a
  // flex row of four spans wrapped raggedly on a phone. «خلصت» is carried as a
  // WORD and not only as the green — the state must survive being read aloud,
  // printed, or looked at by someone who cannot separate green from grey.
  const meta = [
    c.lessonIndex.replace('{n}', String(lesson.index)),
    lesson.isExam ? c.exam : null,
    lesson.durationSeconds ? formatDuration(lesson.durationSeconds) : null,
    cleared ? c.lessonDone : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li
      className={cn(
        'lesson-row',
        cleared && 'lesson-row--done',
        locked && 'lesson-row--locked',
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
      <LessonAction lesson={lesson} courseSlug={courseSlug} courseId={courseId} />
    </li>
  );
}

function Unit({
  section,
  courseSlug,
  courseId,
  enrolled,
  open,
}: {
  section: OutlineSection;
  courseSlug: string;
  courseId: string;
  enrolled: boolean;
  open: boolean;
}) {
  const cleared = section.lessons.filter((lesson) => lesson.gate === 'cleared').length;

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
            ? `${cleared} / ${section.lessons.length}`
            : c.lessonCount.replace('{n}', String(section.lessons.length))}
        </span>

        <ChevronDown size={18} aria-hidden="true" className="unit__chevron" />
      </summary>

      <ul className="unit__body">
        {section.lessons.map((lesson) => (
          <LessonRow
            lesson={lesson}
            courseSlug={courseSlug}
            courseId={courseId}
            key={lesson.id}
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
          section.lessons.some((lesson) => lesson.id === nextLessonId),
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
          open={section.id === openSectionId}
          key={section.id}
        />
      ))}
    </section>
  );
}
