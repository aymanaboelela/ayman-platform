import type { CSSProperties } from 'react';
import Link from 'next/link';
import { copy, type PathCourse, type PathNode } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { CourseArt, SubjectMark } from '@/components/course-art';
import { ExamLockedDialog } from '@/components/library/exam-locked-dialog';
import { CourseClosedDialog } from './course-closed-dialog';
import { lessonStateLabel } from '@/lib/course-outline';
import { CheckIcon, LockIcon } from '@/components/player/icons';
import { LessonKindIcon } from '@/components/player/lesson-kind-icon';
import { ProgressRing } from '@/components/progress-ring';
import { Trophy } from 'lucide-react';
import { PATH_HUES } from './path-hues';

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
 *   · current   — filled amber, one size up, badged, with a pulsing halo. The
 *                 single thing this screen exists to point at.
 *   · cleared   — a light wash of the COURSE's hue and a check in it
 *                 (`path.css`, `data-hue`). Present, obviously done, quiet.
 *   · available — white, ringed in the course's hue, the lesson's KIND icon. Its meta line is what
 *                 says whether the student has actually been there; the ring
 *                 alone cannot, and since `gate-rule.ts` removed the chain
 *                 almost every stop on a course is in this state.
 *   · locked    — muted ring, a lock, muted title. The final exam, and nothing
 *                 else: it is the one row `resolveGate` can still close.
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

/**
 * النقط بين محطتين. `done` لما المحطة اللي قبلها اتقفلت: الجزء اللي اتمشى من
 * الطريق بياخد لون الكورس، واللي لسه رمادي — نفس فكرة الطريق في رسمة الهيرو.
 */
function Connector({ from, to, done }: { from: number; to: number; done: boolean }) {
  return (
    <span aria-hidden="true" className="flex flex-col items-center gap-2 py-3">
      {DOT_STOPS.map((t) => (
        <span
          key={t}
          className="path-run__at pth-dot"
          data-done={done || undefined}
          style={offset(from + (to - from) * t)}
        />
      ))}
    </span>
  );
}

// الألوان كلها في `path.css` تحت `.pth-stop[data-state]` — الأيقونة بتورث
// `currentColor` من الدايرة، فمفيش لون مكتوب هنا يختلف عن اللي هناك.
function stopIcon(node: PathNode, isCurrent: boolean) {
  if (isCurrent) return <LessonKindIcon kind={node.kind} className="h-7 w-7" />;
  if (node.gate === 'cleared') return <CheckIcon className="h-7 w-7" />;
  if (node.gate === 'locked') return <LockIcon className="h-6 w-6" />;
  return <LessonKindIcon kind={node.kind} className="h-6 w-6" />;
}

/**
 * The meta line under a title. Built as a list and joined rather than as nested
 * ternaries so an exam that is also cleared says both, in a fixed order.
 */
function stopMeta(node: PathNode): string {
  const parts: string[] = [];
  if (node.isExam) parts.push(c.exam);
  if (node.gate === 'locked') {
    parts.push(c.locked);
    return parts.join(' · ');
  }
  // What the lesson IS — the one line that gives the kind icon above it a
  // meaning a student can actually learn — and then where the student stands
  // on it. The second half used to be «خلصت» or nothing at all, which was
  // readable only while most stops were padlocked and the run's SHAPE said the
  // rest. Every lecture is open now, so a map of identical neutral rings needs
  // each one to say for itself whether it has been watched.
  parts.push(copy.course.lessonKind[node.kind], lessonStateLabel(node));
  return parts.join(' · ');
}

function PathStop({
  node,
  remaining,
  totalLessons,
  courseSlug,
  courseClosed,
  isCurrent,
  wave,
}: {
  node: PathNode;
  /**
   * LECTURES still to clear, and how many the course has — the only thing the
   * locked exam is waiting on, and the same pair the course header on this
   * screen already prints. It replaces the whole `nodes` run, which this
   * component took solely to hand to `blockerFor`; the sequential chain that
   * needed naming is gone (`gate-rule.ts`).
   */
  remaining: number;
  totalLessons: number;
  courseSlug: string;
  /**
   * The course itself has been unpublished. It outranks the per-lesson gate:
   * nothing in a closed course opens, including the lessons the student had
   * already cleared, so the stop explains the COURSE rather than the lesson.
   */
  courseClosed: boolean;
  isCurrent: boolean;
  wave: number;
}) {
  // The exam and nothing else: it is the one row `resolveGate` can still close.
  const locked = node.gate === 'locked';

  /*
   * الدايرة. الحالات الأربعة زي ما هي، بس بقت ملوّنة بلون الكورس (`data-hue`
   * على الـsection):
   *
   *   · current   — كهرماني مليان، أكبر مقاس، بهالة بتنبض. لسه هي الحاجة
   *                 الوحيدة المليانة بلون قوي، فمفيش تعادل مع اللي خلص.
   *   · cleared   — لون الكورس فاتح وعلامة صح بلونه الغامق.
   *   · available — أبيض بإطار ملوّن والأيقونة بلون الكورس.
   *   · locked    — رمادي بخط متقطّع.
   *
   * الامتحان لسه شكل مختلف (مربع مدوّر) مش لون مختلف.
   */
  const state = isCurrent ? 'current' : node.gate;
  const disc = (
    <span className="pth-stop" data-state={state} data-exam={node.isExam || undefined}>
      {stopIcon(node, isCurrent)}
    </span>
  );

  const label = (
    <>
      <span className="pth-stop__title" data-state={state}>
        {node.title}
      </span>
      <span className="pth-stop__meta" data-kind={node.kind}>
        {stopMeta(node)}
      </span>
    </>
  );

  // Fixed width, not `max-w`: every stop reserving the same box is what keeps
  // the discs on the zigzag when one title runs to three lines and its
  // neighbour to one.
  const stack = 'flex w-40 flex-col items-center gap-2 text-center sm:w-44';

  /*
   * The «نبدأ من هنا» badge, INSIDE the link.
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
    <span className="pth-badge">{c.startHere}</span>
  ) : null;

  return (
    <div className="path-run__at flex flex-col items-center" style={offset(wave)}>
      {/* One link around the disc, the title AND the badge. Two would double
          every lesson in the tab order and read the same name twice to a
          screen reader. */}
      {courseClosed ? (
        /*
          Every stop, whatever its own gate. A closed course has no openable
          lesson in it — `LessonAccessService` compiles `status: 'published'`
          into its `where` — so linking any of them would be a link into the
          404 this whole change exists to remove.
        */
        <CourseClosedDialog
          triggerClassName={cn(stack, 'cursor-not-allowed rounded-lg outline-offset-4 opacity-70')}
          triggerLabel={`${node.title} — ${c.closedBadge}`}
        >
          {disc}
          {label}
        </CourseClosedDialog>
      ) : locked ? (
        /*
          It PRESSES now, and it says why.

          This was `<span aria-disabled className="cursor-not-allowed">` — no
          href, no handler, no title, not focusable. A student tapping the one
          visibly-blocked thing on their own learning map got nothing back at
          all: no message, no movement, no focus ring. «مش عايز إن هو يضغط على
          حاجة وما يبقاش ليه استجابة.» Nothing on the screen distinguished
          "locked" from "broken", and the lock glyph is not an explanation —
          it is a restatement of the thing they can already see.

          Same dialog `/library/[slug]` and the player's sidebar open, and all
          three feed it the same cleared/total pair, so no two screens can
          print a different number of lectures remaining.
          `cursor-not-allowed` stays on the trigger for exactly the reason
          `.chip--locked` keeps it: the EXAM is what is unavailable; pressing
          this only explains it.
        */
        <ExamLockedDialog
          remaining={remaining}
          total={totalLessons}
          triggerClassName={cn(stack, 'cursor-not-allowed rounded-lg outline-offset-4')}
          // The disc is an icon and the label is a title; neither says that
          // pressing this explains anything. `stopMeta` already prints «مقفول»
          // visually, and this is its spoken twin.
          triggerLabel={`${node.title} — ${c.locked}`}
        >
          {disc}
          {label}
          {badge}
        </ExamLockedDialog>
      ) : (
        <Link
          href={`/courses/${courseSlug}/lessons/${node.lessonId}`}
          className={cn(stack, 'pth-stop-link rounded-lg outline-offset-4')}
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
    <section className="pth-course" data-hue={index % PATH_HUES}>
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
      <header className="pth-course__head relative mb-2 flex items-center gap-4 overflow-hidden py-4 pe-5">
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
          {/*
            The counter joins the eyebrow BELOW `sm`, and rides at the far end
            above it.

            At 412px this row is a 40px subject mark, a 52px ring, three 16px
            gaps and 40px of padding before the title gets anything — about
            220px of furniture in a 364px column. With the «{cleared}/{total}»
            counter also holding its own 43px at the end, the title was left
            ~150px and truncated to «التفاضل والتكام…»: a course name cut off
            mid-word is not a name. Folding the counter up here is free — the
            eyebrow line is one short word — and hands the title the whole
            remaining width, which is what lets it wrap to two readable lines
            instead of ellipsising on the first.
          */}
          <p className="eyebrow flex flex-wrap items-baseline gap-2 text-fg-muted">
            {c.courseIndex.replace('{n}', String(index + 1))}
            <span className="mono tabular text-[length:var(--fs-mono-label)] sm:hidden">
              {course.clearedLessons} / {course.totalLessons}
            </span>
            {/* The state of the COURSE, on the eyebrow rather than beside the
                title: the title is allowed to wrap to two lines on a phone and
                a badge next to it would be the thing that gets pushed off. It
                is a plain chip and NOT `--err` red — study.css licenses red for
                a graded outcome, and nothing here is a mark. */}
            {course.published ? null : (
              <span className="mono rounded-full border border-line-strong bg-surface-3 px-2 py-0.5 text-[length:var(--fs-mono-label)] text-fg-muted">
                {c.closedBadge}
              </span>
            )}
          </p>
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
          {/* ⚠️ `line-clamp-2` below `sm`, `truncate` from `sm` up. The desktop
              row is wide enough that one line and an ellipsis is the tidier
              answer; a phone is not, and there the title is allowed the second
              line the counter above just freed up. `line-clamp` also brings its
              own `overflow: hidden`, so nothing can run under its neighbours —
              the collision this element was clipped by before. */}
          {/* ⚠️ Not a link while the course is closed. `/library/{slug}` reads
              the catalog, which is published-only, so it answers `notFound()`
              — the title would have been one more press into the 404 this
              change removes, and the most tempting one on the card. Plain text
              instead; the stops below carry the explanation. */}
          <h2 className="line-clamp-2 min-w-0 text-[length:var(--fs-title-3)] font-medium text-fg sm:truncate">
            {course.published ? (
              <Link
                href={`/library/${course.slug}`}
                className="outline-offset-4 transition-colors duration-[160ms] ease-out hover:text-accent-text after:absolute after:inset-0 after:content-['']"
              >
                {course.title}
              </Link>
            ) : (
              course.title
            )}
          </h2>
        </div>

        {/* Its phone-sized copy sits on the eyebrow line above — see the note
            there. Hidden rather than moved so the desktop row is untouched. */}
        <span className="mono tabular hidden shrink-0 text-[length:var(--fs-mono-label)] text-fg-muted sm:block">
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
                remaining={Math.max(0, course.totalLessons - course.clearedLessons)}
                totalLessons={course.totalLessons}
                courseSlug={course.slug}
                courseClosed={!course.published}
                isCurrent={node.id === course.nextLessonId}
                wave={waveAt(nodeIndex)}
              />
              {/* بعد آخر درس كمان: الطريق بيكمّل لحد خط النهاية تحت. */}
              <Connector
                from={waveAt(nodeIndex)}
                to={nodeIndex < course.nodes.length - 1 ? waveAt(nodeIndex + 1) : 0}
                done={node.gate === 'cleared'}
              />
            </li>
          ))}
          {/* خط النهاية — مش درس ولا لينك، علامة إن الكورس ليه آخر. بيتملى
              دهبي لما الكورس يخلص. */}
          <li className="flex flex-col items-center" aria-hidden="true">
            <span className="pth-finish" data-done={isDone || undefined}>
              <Trophy className="size-7" />
            </span>
            <span className="pth-finish__label">{isDone ? c.courseDone : c.finish}</span>
          </li>
        </ol>
      )}
    </section>
  );
}
