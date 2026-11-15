'use client';

import { useState, type ReactNode } from 'react';
import { ChevronUp } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@ayman/ui/components/sheet';
import { LtrRatio } from '@/components/ltr-ratio';

export interface OutlineSheetProps {
  /** The current unit's tile — `UnitArt`, rendered by the server. */
  art: ReactNode;
  /** «الوحدة ٢» */
  unitLabel: string;
  unitTitle: string;
  unitDone: number;
  unitCount: number;
  courseDone: number;
  courseTotal: number;
  /** The outline itself — the same `CourseOutlineSidebar` the desktop rail draws. */
  children: ReactNode;
}

/**
 * The phone's door to «محتوى الكورس»: a card under the lecture naming the unit
 * the student is in, and the outline in a bottom sheet behind it.
 *
 * Below `lg` the outline used to follow everything else in the page as a 60dvh
 * scroller — forty rows after the homework, where nobody looking for the next
 * lecture thought to scroll. The door sits where the eye is after the video;
 * the sheet is the whole outline, unit cards and all, dismissed by the back
 * gesture like every other sheet in the app (`SheetContent` arms `BackStop`).
 *
 * Radix's sheet, not a hand-rolled fixed panel: focus trap, Escape, scroll
 * lock and the portal are the parts that go wrong when written again. The
 * price is that the outline renders twice on a phone — once hidden in the
 * rail's slot, once in here — which is forty rows of HTML, not a second fetch.
 *
 * Everything here is `lg:hidden`; on a desktop the rail is the outline.
 */
export function OutlineSheet({
  art,
  unitLabel,
  unitTitle,
  unitDone,
  unitCount,
  courseDone,
  courseTotal,
  children,
}: OutlineSheetProps) {
  const [open, setOpen] = useState(false);
  const c = copy.player.sheet;
  const percent = unitCount > 0 ? Math.round((unitDone / unitCount) * 100) : 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button type="button" className="odoor lg:hidden">
          {art}
          <span className="odoor__text">
            <span className="odoor__row">
              <span className="odoor__title">{c.open}</span>
              <span className="odoor__ratio">
                <LtrRatio value={courseDone} of={courseTotal} />
              </span>
            </span>
            <span className="odoor__sub">
              {unitLabel} · {unitTitle} · <LtrRatio value={unitDone} of={unitCount} />
            </span>
            <span className="odoor__bar" aria-hidden="true">
              <span className="odoor__fill" style={{ inlineSize: `${percent}%` }} />
            </span>
          </span>
          <ChevronUp className="size-5 shrink-0 text-fg-muted" aria-hidden="true" />
        </button>
      </SheetTrigger>
      {/*
        A BOTTOM sheet. `SheetContent` is written for the side drawer (fixed to
        the inline start, 20rem wide); these utilities re-pin it to the bottom
        edge at full width, and `cn`'s tailwind-merge drops the ones they
        replace. `lg:hidden` so a desktop never shows two outlines even if the
        door were somehow pressed.
      */}
      <SheetContent
        closeLabel={c.close}
        className="osheet inset-y-auto inset-x-0 bottom-0 start-0 end-0 w-full max-h-[85dvh] rounded-t-[var(--r-lg)] border-e-0 border-t p-3 pb-6 lg:hidden"
      >
        <SheetTitle className="sr-only">{copy.player.outline}</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
}
