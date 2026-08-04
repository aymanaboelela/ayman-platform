import Link from 'next/link';
import { copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { CheckIcon } from '@/components/player/icons';
import { LessonKindIcon } from '@/components/player/lesson-kind-icon';
import { formatDuration } from '@/components/site/course-card';
import type { CourseOutline, OutlineLesson } from '@/lib/course-outline';
import { LockedLesson } from './locked-lesson';

const c = copy.library;

/**
 * The course's sections and lessons, in the four states the gate produces.
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
 */
function LessonAction({ lesson, courseSlug }: { lesson: OutlineLesson; courseSlug: string }) {
  if (lesson.gate === 'locked') return <LockedLesson lesson={lesson} courseSlug={courseSlug} />;

  // No gate at all → not enrolled. The row still renders, so the outline is
  // readable by someone deciding whether to start, but nothing in it opens.
  if (lesson.gate === null) return null;

  const isQuiz = lesson.kind === 'quiz';
  const label = lesson.gate === 'cleared' ? c.review : isQuiz ? c.takeQuiz : c.watch;
  // The accent goes on the ONE thing that moves a student forward. A cleared
  // lesson is a revisit, so it steps down to the quiet treatment — otherwise a
  // finished course is a wall of accent buttons and none of them mean anything.
  const primary = lesson.gate === 'available';

  return (
    <Link
      href={`/courses/${courseSlug}/lessons/${lesson.id}`}
      className={cn(
        'inline-flex h-9 shrink-0 items-center justify-center rounded-sm px-3',
        'text-[length:var(--fs-text-sm)] font-medium',
        'transition-colors duration-[160ms] ease-out',
        primary
          ? 'bg-accent text-[#1A1206] hover:bg-accent-hover'
          : 'border border-line text-fg hover:bg-surface-3',
      )}
    >
      {label}
    </Link>
  );
}

function LessonRow({ lesson, courseSlug }: { lesson: OutlineLesson; courseSlug: string }) {
  const cleared = lesson.gate === 'cleared';
  const locked = lesson.gate === 'locked';

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        aria-hidden="true"
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full border',
          cleared
            ? 'border-accent text-accent-text'
            : locked
              ? 'border-line text-fg-muted'
              : 'border-line-strong text-fg',
        )}
      >
        {cleared ? (
          <CheckIcon className="h-4 w-4" />
        ) : (
          <LessonKindIcon kind={lesson.kind} className="h-4 w-4" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-[length:var(--fs-text-base)]',
            locked ? 'text-fg-muted' : 'text-fg',
          )}
        >
          {lesson.title}
        </p>
        <p className="mono flex flex-wrap items-center gap-x-3 text-[length:var(--fs-mono-label)] text-fg-muted">
          <span className="tabular">{c.lessonIndex.replace('{n}', String(lesson.index))}</span>
          {lesson.isExam ? <span>{c.exam}</span> : null}
          {lesson.durationSeconds ? (
            <span className="tabular">{formatDuration(lesson.durationSeconds)}</span>
          ) : null}
          {cleared ? <span className="text-accent-text">{c.lessonDone}</span> : null}
        </p>
      </div>

      <LessonAction lesson={lesson} courseSlug={courseSlug} />
    </li>
  );
}

export function CourseOutlineView({
  outline,
  courseSlug,
}: {
  outline: CourseOutline;
  courseSlug: string;
}) {
  return (
    <section>
      <h2 className="mb-4 text-[length:var(--fs-title-3)] font-medium text-fg">{c.outline}</h2>

      <div className="flex flex-col gap-5">
        {outline.sections.map((section) => (
          <div className="panel overflow-hidden" key={section.id}>
            <div className="border-b border-line bg-surface-2 px-4 py-3">
              <h3 className="text-[length:var(--fs-title-4)] font-medium text-fg">
                {section.title}
              </h3>
              {section.summary ? (
                <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
                  {section.summary}
                </p>
              ) : null}
            </div>
            <ul className="divide-y divide-line">
              {section.lessons.map((lesson) => (
                <LessonRow lesson={lesson} courseSlug={courseSlug} key={lesson.id} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
