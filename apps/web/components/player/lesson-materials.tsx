'use client';

import { useState } from 'react';
import { copy } from '@ayman/contracts/copy';
import type { PlayerResource } from '@ayman/contracts/progress';
import { cn } from '@ayman/ui/lib/cn';
import { ResourceList } from './resource-list';
import { DownloadIcon } from './icons';

/**
 * One control that reveals everything hanging off this lesson.
 *
 * ## Why the materials are CLOSED by default
 *
 * They used to be open, and a document among them rendered as a 36rem-tall
 * embedded PDF viewer — so the page below every video was a scrollbar's worth
 * of slides nobody had asked to see, with its own scroll area competing with
 * the page's. Reported directly: «بيجيب PDF تحت. أنا مش عايز PDF تحت» and «أنا
 * مش عايز PDF يكون ظهر لي على طول».
 *
 * The lesson is the video. Everything else is a reference the student reaches
 * for when they want it, which is what a disclosure is for.
 *
 * ## Why one control rather than a card per kind
 *
 * A lesson can carry a deck, a tutorial video, a link and three more documents,
 * and the set changes per lesson. «لو ضفت فيه فيديو على اليوتيوب tutorial أو
 * الكلام ده كله هتظهر» — one place that says how many things are here, and
 * opens them all, stays correct whatever the instructor attaches. A per-kind
 * card would need a new case every time a kind is added.
 *
 * ## Why it is not a `<details>`
 *
 * `<details>` cannot animate, ignores the `open` state on the server render
 * under hydration in a way that flashes, and its marker is unstyleable in
 * Safari. The button carries `aria-expanded` and `aria-controls`, which is the
 * same information for assistive tech and none of the trouble.
 */
export function LessonMaterials({ resources }: { resources: PlayerResource[] }) {
  const [open, setOpen] = useState(false);
  if (resources.length === 0) return null;

  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="lesson-materials"
        className={cn(
          'flex w-full items-center gap-3 rounded-lg border border-line bg-surface-2 px-4 py-3.5',
          'text-start transition-colors duration-[160ms] ease-out',
          'hover:border-line-strong hover:bg-surface-3',
        )}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-3 text-accent-text">
          <DownloadIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-fg">{copy.player.materials}</span>
          <span className="block text-[length:var(--fs-text-sm)] text-fg-muted">
            {resources.length} {copy.player.materialsCount}
          </span>
        </span>
        {/* A caret drawn in CSS rather than an icon import: it is two lines and
            it has to rotate, which an inline SVG does more predictably than a
            shared icon whose viewBox this file does not own. */}
        <span
          aria-hidden="true"
          className={cn(
            'shrink-0 text-fg-muted transition-transform duration-[160ms] ease-out',
            open && 'rotate-180',
          )}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open ? (
        <div id="lesson-materials" className="mt-4">
          <ResourceList resources={resources} />
        </div>
      ) : null}
    </section>
  );
}
