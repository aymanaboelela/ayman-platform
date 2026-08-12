import type { CSSProperties } from 'react';
import Link from 'next/link';
import { copy, type PathCourse, type PathNode } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { CourseArt, SubjectMark } from '@/components/course-art';
import { CheckIcon, LockIcon } from '@/components/player/icons';
import { LessonKindIcon } from '@/components/player/lesson-kind-icon';
import { ProgressRing } from '@/components/progress-ring';

const c = copy.path;

/**
 * The run of stops for one course, drawn as a map rather than a list.
 *
 * ## Why a map and not the list this replaced
 *
 * The list was correct and unreadable: forty identical rows, each the same
 * height, with the one row that matters — the next lesson — distinguishable
 * only by a small badge at the far inline end. A student opening this screen to
 * answer "where was I" had to scan every row to find out.
 *
 * The map answers it at a glance. The current stop is the only FILLED disc on
 * the screen, it is the largest object in its course, and it carries the badge
 * directly underneath it rather than off to one side.
 *
 * ## The four states, and why exactly one of them is filled
 *
 *   · current   — filled amber, one size up, badged. The single thing this
 *                 screen exists to point at.
 *   · cleared   — amber ring, amber check. Present, obviously done, quiet.
 *   · available — neutral ring, the lesson's KIND icon.
 *   · locked    — muted ring, a lock, muted title.
 *
 * A second filled state would put the current stop in a tie with every lesson
 * the student already finished, which on a mostly-complete course means it
 * loses. `--ok` green is not spent on "done" for the reason
 * `LessonProgressBar` documents: green means "correct answer" in the quiz
 * runner, and this screen is two clicks from it.
 *
 * ## The lock is a RENDER of a server decision, never the decision itself
 *
 * Editing it away in devtools buys nothing — `/courses/../lessons/..`
 * re-derives the gate on every request and 404s a locked lesson.
 */

/**
 * The zigzag, as a number per stop that CSS turns into an inline offset.
 *
 * One full period every four stops, which is what makes the run read as a path
 * rather than as a column that failed to align. The values are unitless
 * multipliers of `--path-amp` (see `.path-run` in `globals.css`) so the SAME
 * pattern narrows to almost-straight on a phone and opens up on a desktop
 * without a second set of numbers to keep in sync.
 */
const WAVE = [0, 1, 0, -1];
const waveAt = (index: number) => WAVE[index % WAVE.length]!;

/** The three dots between two stops, interpolated along the diagonal. */
const DOT_STOPS = [0.25, 0.5, 0.75];

function offset(wave: number): CSSProperties {
  return { '--wave': wave } as CSSProperties;
}

function Connector({ from, to }: { from: number; to: number }) {
  return (
    <span aria-hidden="true" className="flex flex-col items-center gap-2 py-3">
      {DOT_STOPS.map((t) => (
        <span
          key={t}
          className="path-run__at size-1.5 rounded-full bg-surface-4"
          style={offset(from + (to - from) * t)}
        />
      ))}
    </span>
  );
}

function stopIcon(node: PathNode, isCurrent: boolean) {
  if (isCurrent) return <LessonKindIcon kind={node.kind} className="h-7 w-7 text-[#1A1206]" />;
  if (node.gate === 'cleared') return <CheckIcon className="h-7 w-7 text-accent-text" />;
  if (node.gate === 'locked') return <LockIcon className="h-6 w-6 text-fg-muted" />;
  return <LessonKindIcon kind={node.kind} className="h-6 w-6 text-fg" />;
}

/**
 * The meta line under a title. Built as a list and joined rather than as nested
 * ternaries so an exam that is also cleared says both, in a fixed order.
 */
function stopMeta(node: PathNode): string {
  const parts: string[] = [];
  if (node.isExam) parts.push(c.exam);
  if (node.gate === 'cleared') parts.push(c.done);
  else if (node.gate === 'locked') parts.push(c.locked);
  // Neither done nor locked: say what the lesson IS. This is the one line that
  // gives the kind icon above it a meaning a student can actually learn.
  else parts.push(copy.course.lessonKind[node.kind]);
  return parts.join(' · ');
}

function PathStop({
  node,
  courseSlug,
  isCurrent,
  wave,
}: {
  node: PathNode;
  courseSlug: string;
  isCurrent: boolean;
  wave: number;
}) {
  const locked = node.gate === 'locked';

  const disc = (
    <span
      className={cn(
        'flex items-center justify-center border-2 transition-colors duration-[160ms] ease-out',
        // The exam is a different SHAPE, not a different colour — a rounded
        // square among circles, so it is distinguishable without spending
        // another hue on a screen that already rations them.
        node.isExam ? 'rounded-lg' : 'rounded-full',
        isCurrent
          ? 'size-[4.5rem] border-transparent bg-accent'
          : 'size-16 bg-surface-2',
        !isCurrent && node.gate === 'cleared' && 'border-accent',
        !isCurrent && node.gate === 'available' && 'border-line-strong',
        !isCurrent && locked && 'border-line',
      )}
    >
      {stopIcon(node, isCurrent)}
    </span>
  );

  const label = (
    <>
      <span
        className={cn(
          'text-[length:var(--fs-text-sm)]',
          locked ? 'text-fg-muted' : 'text-fg',
          isCurrent && 'font-medium',
        )}
      >
        {node.title}
      </span>
      <span className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
        {stopMeta(node)}
      </span>
    </>
  );

  // Fixed width, not `max-w`: every stop reserving the same box is what keeps
  // the discs on the zigzag when one title runs to three lines and its
  // neighbour to one.
  const stack = 'flex w-40 flex-col items-center gap-2 text-center sm:w-44';

  /*
   * The «ابدأ من هنا» badge, INSIDE the link.
   *
   * It used to be a sibling of it — rendered after the `<Link>` closed, in the
   * wrapping `<div>`. So the one element on this screen that says "press this"
   * was the one element on it that could not be pressed: clicking the badge did
   * nothing, and the student had to find and hit the disc above it instead.
   * That is exactly what was reported ("لما بضغط على كلمة ابدأ من هنا دي مش
   * شغالة، لازم أضغط على الفيديو اللي فوق").
   *
   * Moving it inside costs nothing it was paying for — it is not a second
   * link, so the tab order is unchanged and a screen reader still announces
   * one stop — and it means the badge, the disc and the title are one target.
   */
  const badge = isCurrent ? (
    <span className="mono rounded-sm bg-accent px-2.5 py-1 text-[length:var(--fs-mono-label)] text-[#1A1206]">
      {c.startHere}
    </span>
  ) : null;

  return (
    <div className="path-run__at flex flex-col items-center" style={offset(wave)}>
      {/* One link around the disc, the title AND the badge. Two would double
          every lesson in the tab order and read the same name twice to a
          screen reader. */}
      {locked ? (
        <span aria-disabled="true" className={cn(stack, 'cursor-not-allowed')}>
          {disc}
          {label}
          {badge}
        </span>
      ) : (
        <Link
          href={`/courses/${courseSlug}/lessons/${node.id}`}
          className={cn(
            stack,
            'rounded-lg outline-offset-4',
            'transition-colors duration-[160ms] ease-out hover:text-accent-text',
          )}
        >
          {disc}
          {label}
          {badge}
        </Link>
      )}
    </div>
  );
}

export function PathMap({ course, index }: { course: PathCourse; index: number }) {
  const isDone = course.totalLessons > 0 && course.clearedLessons === course.totalLessons;

  return (
    <section>
      {/* The course's own header, as a card rather than a bare heading: it is
          the thing the rail links to, so it has to be findable after a jump.

          It opens on the course's ARTWORK now — the same generated scene its
          card wears on the dashboard and in the library, at 5rem. A student
          scrolling a path of four courses was previously separating them by
          reading four titles in the same weight; the art does it at a glance,
          and it is the one thing on this screen that carries any colour beyond
          the amber the stops ration so carefully.

          `overflow-hidden` on the header, not on the art: the scene has to be
          clipped by the panel's own radius or it squares off the corner. */}
      <header className="panel relative mb-2 flex items-center gap-4 overflow-hidden py-4 pe-5">
        <span className="relative hidden aspect-[4/3] w-20 shrink-0 self-stretch overflow-hidden sm:block">
          <CourseArt
            coverKey={course.coverKey}
            subjectNameAr={course.subjectNameAr}
            seed={course.slug}
            compact
          />
        </span>

        {/* Below `sm` the strip goes and the mark stands in for it — an 80px
            image plus a ring plus a title does not fit a 360px row. */}
        <SubjectMark
          subjectNameAr={course.subjectNameAr}
          className="ms-5 size-10 sm:hidden"
        />

        <ProgressRing percent={course.progressPercent} size={52}>
          {isDone ? (
            <CheckIcon className="h-5 w-5 text-accent-text" />
          ) : (
            <span className="mono tabular text-[length:var(--fs-mono-label)] text-accent-text">
              {index + 1}
            </span>
          )}
        </ProgressRing>

        <div className="min-w-0 flex-1">
          <p className="eyebrow text-fg-muted">{c.courseIndex.replace('{n}', String(index + 1))}</p>
          {/*
            The title is a LINK now, and it opens the course's own page — its
            full outline, every unit and every lesson in one list.

            It was inert text, which made this the only course title in the
            product you could not press: the dashboard card, the library card
            and the rail all lead somewhere. Asked for directly («عايز لما
            أضغط على كلمة الكورس التأسيسي… يفتح لي كل الكورسات نفسها»).

            `/library/{slug}`, not `/courses/{slug}` — the signed-in course page
            rather than the public catalog one. Sending a student who is already
            inside the shell out to the marketing surface is the exact bug
            `enrolledCourseHref` and `(app)/library` exist to prevent.

            The stretched `::after` makes the whole HEADER the target: at this
            size a title alone is a thin strip to aim at, and the artwork beside
            it reads as part of the same object. It cannot swallow anything else
            — the header holds no other control.

            `truncate` sits on the <h2> and not on the <a>, because `overflow`
            and `text-overflow` do not apply to a non-replaced INLINE box: on
            the anchor only the `white-space: nowrap` half of it took effect, so
            the title never ellipsised, it just refused to wrap. At 360px the
            header has 312px, and the furniture below `sm` — ms-5 20 +
            SubjectMark 40 + gap 16 + ProgressRing 52 + gap 16 + gap 16 + the
            «{cleared}/{total}» counter ~43 + pe-5 20 — leaves the title ~89px.
            «الكورس التأسيسي لمادة البرمجة» is ~250px. The counter is a later
            DOM sibling, so it paints ON TOP: the overflowing title ran under it
            and was then hard-clipped by the header's `overflow-hidden`. A
            collision, not a truncation, with no «…» to say anything was cut.

            The <h2> is a block, so all three declarations apply. `min-w-0` is
            on it as well as on its parent flex item because the ellipsis has to
            be computed against a box that is allowed to be narrower than its
            content. The hit area is unaffected: the stretched `::after`'s
            containing block is the `relative` header, not the anchor.
          */}
          <h2 className="min-w-0 truncate text-[length:var(--fs-title-3)] font-medium text-fg">
            <Link
              href={`/library/${course.slug}`}
              className="outline-offset-4 transition-colors duration-[160ms] ease-out hover:text-accent-text after:absolute after:inset-0 after:content-['']"
            >
              {course.title}
            </Link>
          </h2>
        </div>

        <span className="mono tabular shrink-0 text-[length:var(--fs-mono-label)] text-fg-muted">
          {course.clearedLessons} / {course.totalLessons}
        </span>
      </header>

      {course.nodes.length === 0 ? (
        <p className="px-5 py-4 text-fg-muted">{c.nothingOpen}</p>
      ) : (
        <ol className="path-run flex flex-col items-center py-4">
          {course.nodes.map((node, nodeIndex) => (
            <li key={node.id} className="flex flex-col items-center">
              <PathStop
                node={node}
                courseSlug={course.slug}
                isCurrent={node.id === course.nextLessonId}
                wave={waveAt(nodeIndex)}
              />
              {nodeIndex < course.nodes.length - 1 ? (
                <Connector from={waveAt(nodeIndex)} to={waveAt(nodeIndex + 1)} />
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
