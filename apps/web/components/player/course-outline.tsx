import Link from 'next/link';
import { copy, type CourseOutline } from '@ayman/contracts';
import { Badge, cn } from '@ayman/ui';
import { formatDuration } from '@/lib/format';
import { CheckIcon, LockIcon } from './icons';
import { LessonProgressBar } from './lesson-progress-bar';

export interface CourseOutlineSidebarProps {
  outline: CourseOutline;
  activeLessonId: string;
}

/**
 * RTL-native, not mirrored. Nothing here knows about left or right:
 *   • the grid column order in the page layout follows the writing mode
 *   • the active marker is `border-s-2` — an inline-START border
 *   • the section index sits at `text-start`, the lesson duration at `text-end`
 * Swapping `dir` would produce a correct LTR sidebar with no code change.
 */
export function CourseOutlineSidebar({ outline, activeLessonId }: CourseOutlineSidebarProps) {
  return (
    <nav
      aria-label={copy.player.outline}
      className={cn(
        'rounded-lg border border-line bg-surface-2',
        // `top-*` is block-axis and therefore not a physical-direction class.
        'lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto',
      )}
    >
      <div className="border-b border-line-subtle px-4 py-4">
        <p className="eyebrow mb-2">{copy.player.outline}</p>
        <LessonProgressBar percent={outline.progressPercent} label={copy.player.courseProgress} />
        <p className="mono mt-2 text-[length:var(--fs-mono-label)] tabular text-fg-muted">
          {outline.completedLessons} {copy.player.lessonsCompleted} {outline.totalLessons}
        </p>
      </div>

      <ol className="py-2">
        {outline.sections.map((section, sectionIndex) => (
          <li key={section.id} className="mb-2">
            <p className="mono px-4 py-2 text-[length:var(--fs-mono-label)] tabular text-fg-muted">
              {String(sectionIndex + 1).padStart(2, '0')} / {section.title}
            </p>

            <ol>
              {section.lessons.map((lesson) => {
                const isActive = lesson.id === activeLessonId;
                const isDone = lesson.state === 'completed' || lesson.state === 'passed';
                const isLocked = lesson.gate === 'locked';

                const row = (
                  <>
                      {/* Amber, not green: green means "correct answer" here.
                          `text-accent-text` (--a-11), not `text-accent`
                          (--a-9, the SOLID-fill step): step 9 is tuned as a
                          background fill, not a text/icon colour, and read at
                          2.07:1 here (I5). --a-11 is the ramp's text step and
                          clears 4.5:1 in both themes. */}
                    {isLocked ? (
                      <LockIcon className="h-3.5 w-3.5 text-fg-muted" />
                    ) : (
                      <CheckIcon
                        className={cn(
                          'h-3.5 w-3.5',
                          isDone ? 'text-accent-text' : 'text-transparent',
                        )}
                      />
                    )}
                    <span className="min-w-0 flex-1 text-start">{lesson.title}</span>
                    {lesson.isExam ? (
                      <span className="mono shrink-0 text-[length:var(--fs-mono-label)] text-accent-text">
                        {copy.player.examBadge}
                      </span>
                    ) : null}
                    {lesson.estimatedSeconds ? (
                      <span className="mono tabular text-[length:var(--fs-mono-label)] text-fg-muted">
                        {formatDuration(lesson.estimatedSeconds)}
                      </span>
                    ) : null}
                    {/*
                      Says what it MEANS. This rendered `copy.player.play` —
                      «شغّل الفيديو» — on a badge whose condition is
                      `isFreePreview`, so a lesson that merely happens to be
                      open to everyone advertised itself as the play button,
                      and the actual play control is the poster in the middle
                      of the page. Pointed at directly: «يبقى واضح إن أشغّل
                      الفيديو» — which it now is, because this no longer claims
                      to be it.

                      «معاينة مجانية» is the same words the admin switch uses,
                      so the instructor sets a thing and reads the same thing
                      back on the student's screen.
                    */}
                    {lesson.isFreePreview ? (
                      <Badge tone="accent">{copy.catalog.freePreview}</Badge>
                    ) : null}
                  </>
                );

                const rowClass = cn(
                  'flex w-full items-center gap-3 border-s-2 px-4 py-2.5 text-[length:var(--fs-text-sm)]',
                  isActive
                    ? 'border-accent bg-surface-3 font-medium text-fg'
                    : 'border-transparent text-fg-muted',
                );

                // A locked lesson is not a link. Rendering a disabled-looking
                // anchor that still navigates would be a lie the server then
                // contradicts with a 404 — this simply is not clickable, and
                // the 404 remains the actual enforcement either way.
                return (
                  <li key={lesson.id}>
                    {isLocked ? (
                      <span
                        aria-disabled="true"
                        title={lesson.isExam ? copy.player.examLockedHint : copy.player.lockedHint}
                        className={cn(rowClass, 'cursor-not-allowed opacity-60')}
                      >
                        {row}
                      </span>
                    ) : (
                      <Link
                        href={`/courses/${outline.course.slug}/lessons/${lesson.id}`}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          rowClass,
                          'transition-colors duration-[160ms] ease-out hover:bg-surface-3',
                        )}
                      >
                        {row}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>
    </nav>
  );
}
