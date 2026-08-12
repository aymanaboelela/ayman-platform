'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useRef, type ComponentProps } from 'react';
import { useBackDismiss } from '../hooks/use-back-dismiss';
import { cn } from '../lib/cn';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * The single confirm-prompt shape in the product — Plan 5's submit
 * confirmation and Plan 6's destructive confirmations both use this. Radius
 * capped at `--r-lg` (8px, the ceiling for any surface) and no shadow in dark
 * mode, same rule as `Card`. Every Radix root that renders a portal gets
 * `dir="rtl"` explicitly — a portal escapes the `<html dir="rtl">` ancestor.
 */
export type DialogContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  /**
   * `@ayman/ui` carries no copy of its own — every user-facing string is
   * `@ayman/contracts` — so the close button's accessible name is a required
   * prop, never a literal baked into this package.
   */
  closeLabel: string;
};

export function DialogContent({ className, children, closeLabel, ...props }: DialogContentProps) {
  /*
    The Android back gesture closes this dialog instead of leaving the page.

    Wired here, in the primitive, rather than at each of the ~14 call sites, so
    every dialog in the product inherits it and no future one can forget. The
    hook arms on mount and stands down on unmount, which for a Radix dialog is
    precisely "while open": `Portal` renders nothing at all when it is closed.
    That is why it takes no `open` prop — the mount IS the open state, and a
    second source of truth for it could only ever disagree.

    Closing goes through the dialog's OWN close button rather than through some
    new callback prop. `DialogContent` has no access to the root's
    `onOpenChange` — Radix does not expose that context — and clicking the
    control that is already rendered two lines below runs the identical path a
    tap on it would: Radix's controlled/uncontrolled handling, its focus
    restore, its scroll unlock. A parallel close path is how a dialog ends up
    hidden while the body is still locked.
  */
  const closeRef = useRef<HTMLButtonElement>(null);
  useBackDismiss(() => closeRef.current?.click());

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#000000B3] data-[state=closed]:animate-none" />
      <DialogPrimitive.Content
        dir="rtl"
        className={cn(
          // `start-1/2` is logical (the inset flips per `dir`), but `translate-x`
          // has no logical form in CSS — it always shifts along the physical X
          // axis. Pairing a logical inset with an un-countered physical
          // `-translate-x-1/2` only centers under `dir="ltr"`; under this
          // component's own `dir="rtl"` (see the doc comment above) it shifts
          // the dialog a FULL extra half-width further off in the same
          // direction the logical inset already anchored it, landing the whole
          // box off-screen. `rtl:translate-x-1/2` counters that.
          'fixed start-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-[420px] -translate-x-1/2 rtl:translate-x-1/2 -translate-y-1/2',
          'rounded-lg border border-line bg-surface-2 p-5 shadow-[var(--shadow-lg)]',
          /*
            The height cap, and it is a correctness fix rather than polish.

            This box is centred with `top-1/2` and `-translate-y-1/2`, which
            means a dialog TALLER than the viewport does not overflow downward
            where it could be scrolled to — it grows equally off BOTH ends, and
            the parts that leave the top and bottom are simply unreachable.
            There is no page scroll to rescue them either: Radix locks the body
            while a modal is open.

            What that cost: `<ExamGateDialog>` is the only route into a graded
            attempt (see `start-attempt-button.tsx`), and it stacks a title, the
            rules list, a warning and two buttons — measured at roughly 690px.
            On a 640px-tall phone in portrait, «فاهم، ابدأ الامتحان» sat below
            the fold with no way to reach it. The student could not start the
            exam at all.

            `dvh`, not `vh`: on mobile browsers `vh` is frozen to the LARGEST
            viewport (URL bar collapsed), so a `vh` cap still overflows by the
            height of the bar while it is showing — which is exactly when a
            student first opens the dialog. `-2rem` leaves the same 1rem gutter
            the width already reserves, so the box never touches the edges.

            `overscroll-contain` stops a scroll that reaches the end of this
            list from chaining to whatever is behind the overlay.

            Above the cap nothing changes: dialogs shorter than the viewport are
            laid out exactly as before, so every existing desktop dialog and
            every admin dialog is untouched.
          */
          'max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain',
          className,
        )}
        {...props}
      >
        {children}
        {/*
          44×44 below `md` without the mark moving a pixel — the same change as
          `sheet.tsx`'s close, which carries the full reasoning. In short: `p-1`
          around a 16px mark was a 24×24 target against a documented 44px floor
          (`--min-tap-size`), `grid place-items-center` grows only the box, and
          the inset drops 16px → 6px so the mark's centre stays at 28px from
          both edges. `md` restores the original 24px geometry exactly, so
          nothing above that breakpoint changes in any state.

          `absolute`, so the day `DialogContent` gains an `overflow-y-auto` cap
          this scrolls with the content instead of pinning to the corner. That
          is accepted rather than overlooked: Escape and the overlay both close,
          and every dialog in the product carries a visible cancel in its
          footer. Pinning it would mean restructuring the content box as a
          `flex-col` with the close outside a scrolling body.
        */}
        <DialogPrimitive.Close
          ref={closeRef}
          aria-label={closeLabel}
          className="absolute end-1.5 top-1.5 grid size-11 place-items-center rounded-xs text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg focus-visible:outline-2 md:end-4 md:top-4 md:size-6"
        >
          {/* A plain X, not an icon font or an emoji. */}
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

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mb-4 flex flex-col gap-1', className)} {...props} />;
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-[length:var(--fs-title-4)] font-semibold text-fg', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-[length:var(--fs-text-sm)] text-fg-muted', className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mt-5 flex items-center justify-end gap-2', className)} {...props} />;
}
