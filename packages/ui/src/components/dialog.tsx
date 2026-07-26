'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ComponentProps } from 'react';
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
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#000000B3] data-[state=closed]:animate-none" />
      <DialogPrimitive.Content
        dir="rtl"
        className={cn(
          'fixed start-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-[420px] -translate-x-1/2 -translate-y-1/2',
          'rounded-lg border border-line bg-surface-2 p-5 shadow-[var(--shadow-lg)]',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label={closeLabel}
          className="absolute end-4 top-4 rounded-xs p-1 text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg focus-visible:outline-2"
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
