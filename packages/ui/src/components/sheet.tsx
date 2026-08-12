'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = DialogPrimitive.Title;

/**
 * A start-anchored, full-height panel — the admin shell's mobile nav (Task
 * 8) and any later off-canvas editor share this shape rather than each
 * fighting `DialogContent`'s centred-modal positioning with className
 * overrides. Anchored to the inline START, never `inset-inline-start-0`
 * spelled out by hand: `start-0` already IS the logical utility, so in RTL
 * this sits at the right edge without any `rtl:` override, unlike a
 * transform-based center (which has no logical form and needs one).
 */
export type SheetContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  closeLabel: string;
};

export function SheetContent({ className, children, closeLabel, ...props }: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#000000B3] data-[state=closed]:animate-none" />
      <DialogPrimitive.Content
        dir="rtl"
        className={cn(
          // 16px gap and padding. These were `gap-16 p-16`, which Tailwind's
          // 0.25rem spacing multiplier resolves to 64px — the panel is at most
          // 20rem wide, so a 64px inset left the nav labels almost no room.
          'fixed inset-y-0 start-0 z-50 flex w-[min(80vw,20rem)] flex-col gap-4',
          'overflow-y-auto border-e border-line bg-surface-2 p-4',
          className,
        )}
        {...props}
      >
        {children}
        {/*
          44×44 below `md`, and the glyph does not move.

          `p-1` around a 16px mark is a 24×24 box — WCAG 2.5.8's minimum cleared
          by exactly zero — sitting in the corner furthest from the thumb, and in
          the student's navigation drawer it is the only SIGNPOSTED way out (the
          backdrop closes too, but nothing says so). The 44px floor is stated in
          `tokens/space.css` as `--min-tap-size` and already enforced on the
          topbar controls, the study chips and the menu button; this control
          missed all of those passes because it lives in the shared primitive
          rather than in app CSS.

          `grid place-items-center` grows the BOX only: the mark stays `size-4`,
          and the inset drops from 16px to 6px so its centre lands at 6 + 22 =
          28px from both edges — exactly where 16 + 4 + 8 put it before. Nothing
          shifts; the hit area is the whole change.

          Back to the original 24px at `md`, same breakpoint and same reason as
          `.topbar__actions` in the app's `globals.css`: a mouse does not need
          44px, and up there the hover fill would otherwise paint a plate nearly
          twice the size of the mark it contains. Both sheets that exist today
          are themselves `md:hidden`, so that branch is this primitive keeping
          its promise for a future caller rather than anything either of them
          can show.

          One consequence, checked at 360px: the enlarged box can reach over
          whatever the panel puts on its first line. In the student drawer that
          is a `BrandLockup` inside `SheetTitle` — a 38px portrait plus «المهندس
          أيمن أبو العلا», ~230px against the ~238px where the box begins in a
          288px panel. Nothing interactive is under it, and the fill only paints
          on hover, which a touch device does not have.
        */}
        <DialogPrimitive.Close
          aria-label={closeLabel}
          className="absolute end-1.5 top-1.5 grid size-11 place-items-center rounded-[var(--r-xs)] text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg focus-visible:outline-2 md:end-4 md:top-4 md:size-6"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
          >
            <path d="M3 3l10 10M13 3 3 13" />
          </svg>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
