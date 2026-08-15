'use client';

import Link from 'next/link';
import { m } from 'motion/react';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { CatalogCourse } from '@ayman/contracts/catalog';
import {
  isEscalateChoice,
  isLinkChoice,
  type AssistantChoice,
} from '@ayman/contracts/assistant/script';
import { cn } from '@ayman/ui/lib/cn';
import * as motionPresets from '@ayman/ui/motion';
import { assistantTrailLabels } from '@/lib/assistant-path';
import { courseHref } from '@/lib/course-href';
import { CHOICE_ICONS } from './choice-icons';
import type { AssistantScriptState } from './use-assistant-script';

const c = copy.assistant;

/** How many courses the panel lists before deferring to the catalog page. */
const COURSE_PREVIEW = 3;

/**
 * The guided half of المساعد: where you have been, what you were told, and
 * what you can ask next.
 *
 * ## Why a trail and not a chat log
 *
 * Every other widget of this shape stacks alternating bubbles, which is the
 * right picture for a conversation and the wrong one here — there is no
 * conversation, there is a ROUTE through a tree. Rendering it as a route means
 * the student sees the whole of where they are in three lines instead of
 * scrolling, and "back" becomes a place on screen rather than a button they
 * have to find. It is also the same object the instructor reads at the top of
 * the thread, so what he sees and what they saw are literally the same value.
 *
 * ## Presentational
 *
 * Every value is a prop. It fetches nothing, so it renders in a test with
 * plain objects.
 */
export function AssistantGuide({
  script,
  courses,
  coursesPending,
  coursesFailed,
  onEscalate,
  onNavigate,
}: {
  script: AssistantScriptState;
  courses: CatalogCourse[] | null;
  coursesPending: boolean;
  coursesFailed: boolean;
  onEscalate: () => void;
  onNavigate: () => void;
}) {
  const { node, nodeId, path, choose, rewindTo } = script;
  const trail = assistantTrailLabels(path);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* ── the trail ────────────────────────────────────────────────── */}
      {trail.length > 1 ? (
        <nav aria-label={c.title}>
          <ol className="flex flex-wrap items-center gap-1.5">
            {trail.map((label, index) => {
              const isCurrent = index === trail.length - 1;
              return (
                <li key={`${path[index]}-${index}`} className="flex items-center gap-1.5">
                  {index > 0 ? (
                    <ChevronLeft className="size-3 shrink-0 text-fg-faint" aria-hidden="true" />
                  ) : null}
                  <button
                    type="button"
                    // The current stop is where you already are. Rendering it
                    // as a live button teaches the student that buttons here
                    // sometimes do nothing.
                    disabled={isCurrent}
                    onClick={() => rewindTo(index)}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[length:var(--fs-text-xs)]',
                      'transition-colors duration-[160ms] ease-out',
                      isCurrent
                        ? 'bg-accent/15 font-medium text-accent-text'
                        : 'border border-line-subtle text-fg-muted hover:border-accent/40 hover:text-fg',
                    )}
                  >
                    {label}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}

      {/* ── the answer ───────────────────────────────────────────────── */}
      <m.div
        // Keyed on the node, so moving through the tree replays the entrance
        // instead of swapping text in place — which reads as a page that
        // glitched rather than one that responded.
        key={nodeId}
        initial={motionPresets.fadeUp.initial}
        animate={motionPresets.fadeUp.animate}
        className="rounded-xl border border-line-subtle bg-surface-2 p-3.5"
      >
        <p className="text-[length:var(--fs-text-sm)] leading-[1.75] text-fg">{c.script[nodeId]}</p>

        {node.data === 'courses' ? (
          <CourseList courses={courses} pending={coursesPending} failed={coursesFailed} />
        ) : null}
      </m.div>

      {/* ── what you can ask next ────────────────────────────────────── */}
      <div>
        <p className="mb-2 text-[length:var(--fs-text-xs)] font-medium text-fg-muted">{c.pick}</p>
        <ul className="flex flex-col gap-1.5">
          {node.choices.map((choice, index) => (
            <m.li
              key={choice.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                // Capped at four steps: a stagger long enough to notice on a
                // five-item list is a delay, not a flourish. The longest node
                // has five choices, so this tops out at 90ms.
                delay: Math.min(index, 4) * 0.03,
                duration: motionPresets.SECONDS.popover,
                ease: motionPresets.EASE_OUT,
              }}
            >
              <ChoiceRow
                choice={choice}
                onSelect={() => {
                  if (isEscalateChoice(choice)) {
                    onEscalate();
                    return;
                  }
                  if (isLinkChoice(choice)) {
                    onNavigate();
                    return;
                  }
                  choose(choice);
                }}
              />
            </m.li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * One choice, as a real row with an icon and an affordance.
 *
 * Deliberately not a list of underlined links: this surface is judged as a
 * product, and a row a thumb can hit reads as one where a line of text does
 * not. The escalation row is tinted, because it is the one choice that leaves
 * the script and reaches a person.
 */
function ChoiceRow({ choice, onSelect }: { choice: AssistantChoice; onSelect: () => void }) {
  const Icon = CHOICE_ICONS[choice.id];
  const isEscalate = isEscalateChoice(choice);
  const isBack = choice.id === 'back';

  const className = cn(
    'group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-start',
    'transition-colors duration-[160ms] ease-out',
    isEscalate
      ? 'border-accent/35 bg-accent/10 hover:border-accent hover:bg-accent/15'
      : 'border-line-subtle bg-surface-1 hover:border-accent/40 hover:bg-surface-2',
  );

  const inner = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-lg',
          'transition-colors duration-[160ms] ease-out',
          isEscalate
            ? 'bg-accent text-[#1A1206]'
            : isBack
              ? 'bg-surface-3 text-fg-muted'
              : 'bg-accent/12 text-accent-text group-hover:bg-accent/20',
        )}
      >
        <Icon className="size-4" />
      </span>
      <span
        className={cn(
          'flex-1 text-[length:var(--fs-text-sm)] text-fg',
          isEscalate && 'font-medium',
        )}
      >
        {copy.assistant.choices[choice.id]}
      </span>
      <ChevronLeft
        aria-hidden="true"
        className="size-4 shrink-0 text-fg-faint transition-colors duration-[160ms] ease-out group-hover:text-accent-text"
      />
    </>
  );

  /*
   * A link choice is a real `<Link>`, not a button that calls `router.push`.
   * Middle-click, open-in-new-tab and the status-bar preview all come free,
   * and a student who wants the catalog in another tab should not have to
   * fight the widget for it. `onSelect` still runs, to close the panel.
   */
  if (isLinkChoice(choice)) {
    return (
      <Link href={choice.href} onClick={onSelect} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onSelect} className={className}>
      {inner}
    </button>
  );
}

/**
 * The one node that shows live data.
 *
 * These rows come from `GET /api/catalog/courses` — the same already-public
 * read the catalog page uses, which only ever returns published courses. The
 * assistant writes no query of its own against content, so there is no path
 * along which a draft could appear here.
 */
function CourseList({
  courses,
  pending,
  failed,
}: {
  courses: CatalogCourse[] | null;
  pending: boolean;
  failed: boolean;
}) {
  if (pending) {
    return (
      <p className="mt-3 flex items-center gap-2 text-[length:var(--fs-text-sm)] text-fg-muted">
        <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {copy.notifications.loading}
      </p>
    );
  }

  if (failed) {
    return <p className="mt-3 text-[length:var(--fs-text-sm)] text-fg-muted">{c.courses.failed}</p>;
  }

  if (!courses || courses.length === 0) {
    return <p className="mt-3 text-[length:var(--fs-text-sm)] text-fg-muted">{c.courses.empty}</p>;
  }

  const shown = courses.slice(0, COURSE_PREVIEW);
  const remaining = courses.length - shown.length;

  return (
    <ul className="mt-3 flex flex-col gap-1.5">
      {shown.map((course) => (
        <li key={course.id}>
          {/*
            `courseHref`, not `/courses/${slug}`. This panel is mounted INSIDE
            the student shell, and that path is the PUBLIC marketing page — so
            this was the last surviving copy of the bug `lib/course-href.ts`
            exists to end: a signed-in student tapping their own course here was
            thrown out of the shell onto a sales page carrying a lock badge and
            «الدروس بتفتح أول ما تدخل بحسابك» over a course they are already
            enrolled in. The regression test for that bug only scans /dashboard,
            and this panel is closed by default, so this instance survived it.
          */}
          <Link
            href={courseHref(course.slug)}
            className="block rounded-lg border border-line-subtle bg-surface-1 px-3 py-2 transition-colors duration-[160ms] ease-out hover:border-accent/40"
          >
            <span className="block text-[length:var(--fs-text-sm)] font-medium text-fg">
              {course.title}
            </span>
            <span className="mt-0.5 block text-[length:var(--fs-text-xs)] text-fg-muted">
              {/* Latin digits, matching the `ar-EG-u-nu-latn` numbering system
                  every other formatter in this app already uses. */}
              {formatCopy(c.courses.meta, {
                subject: course.subjectNameAr,
                lessons: String(course.lessonCount),
              })}
            </span>
          </Link>
        </li>
      ))}
      {remaining > 0 ? (
        <li className="px-1 text-[length:var(--fs-text-xs)] text-fg-muted">
          {formatCopy(c.courses.more, { n: String(remaining) })}
        </li>
      ) : null}
    </ul>
  );
}
