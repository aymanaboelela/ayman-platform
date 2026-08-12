import Link from 'next/link';
import { copy, type CourseOutline } from '@ayman/contracts';
import { Badge, cn } from '@ayman/ui';
import { formatDuration } from '@/lib/format';
import { CheckIcon, LockIcon } from './icons';
import { LessonProgressBar } from './lesson-progress-bar';
import { OutlineScrollToCurrent } from './outline-scroll-to-current';

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
      // How `<OutlineScrollToCurrent>` (below) finds what to scroll. On the
      // panel rather than on the active row, because the element that has to be
      // located is the SCROLLER — the row is then one `[aria-current]` query
      // inside it, off markup this component already emits.
      data-course-outline=""
      className={cn(
        'rounded-lg border border-line bg-surface-2',
        /*
          The panel is a scroller at EVERY width now, not only from `lg` up.

          Below `lg` every constraint here used to be `lg:`-prefixed, so a phone
          got the list at its natural height: an 8-section, 40-lesson course is
          40 × 44px of row plus section headings — roughly 1,800px of navigation
          appended to the bottom of every lesson page, on a connection where
          that is not free. Nothing above it moves (the player, the materials,
          the completion hint and the prev/next row all live in the first grid
          item and render before this), so the cost is not a shifted fold — it
          is that the course's only on-page navigation becomes a blind scroll
          where the lesson you are ON can sit 1,000px down.

          60dvh, not 60vh: on a phone the two differ by the browser's own
          chrome, and `vh` here would size the box to a viewport the student
          cannot actually see all of — the same reason the `lg:` bound below has
          always been `dvh`.

          `overflow-y-auto` is unprefixed rather than duplicated at `lg:`, so
          the desktop panel computes exactly what it computed before; only
          `max-h` differs by breakpoint.
        */
        'max-h-[60dvh] overflow-y-auto',
        // `top-*` is block-axis and therefore not a physical-direction class.
        'lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start',
      )}
    >
      {/*
        The whole panel is a size up. It was built to the same scale as body
        copy in a 320px column, which on a 15" laptop is a list of 14px rows
        nobody can scan while a video plays — «اللي على الشمال ده عايزك تضبطه
        بشكل كويس وكبرها لي شوية». The column is 380px now (see the page), and
        everything in it is sized for that.
      */}
      <div className="border-b border-line-subtle px-5 py-5">
        {/* A real heading, not an eyebrow. This names the panel, and a 10px
            uppercase label is the wrong weight for the only navigation on the
            page. */}
        <p className="mb-3 text-[length:var(--fs-title-4)] font-semibold text-fg">
          {copy.player.outline}
        </p>
        <LessonProgressBar percent={outline.progressPercent} label={copy.player.courseProgress} />
        <p className="mono mt-2.5 text-[length:var(--fs-text-sm)] tabular text-fg-muted">
          {outline.completedLessons} {copy.player.lessonsCompleted} {outline.totalLessons}
        </p>
      </div>

      <ol className="py-2">
        {outline.sections.map((section, sectionIndex) => (
          <li key={section.id} className="mb-3">
            {/* The section is a HEADING, in the page's own voice, with the
                number as a quiet prefix — it used to be one mono muted line
                where the number and the title carried identical weight, so
                sections read as more list rows rather than as the thing the
                rows belong to. */}
            <p className="flex items-baseline gap-2 px-5 pb-1 pt-2">
              <span className="mono shrink-0 text-[length:var(--fs-mono-label)] tabular text-fg-muted">
                {String(sectionIndex + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0 font-semibold text-fg">{section.title}</span>
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
                  // A 44px row at the base size, not a 34px row at 14px: this
                  // is the list a student taps on a phone while the video is
                  // playing, and every row is a navigation.
                  'flex w-full items-center gap-3 border-s-2 px-5 py-3',
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

      {/* Renders nothing. A bounded panel that opens at lesson 1 of 40 is a
          worse answer than an unbounded one, so the box has to arrive already
          showing where the student is. */}
      <OutlineScrollToCurrent activeLessonId={activeLessonId} />
    </nav>
  );
}
