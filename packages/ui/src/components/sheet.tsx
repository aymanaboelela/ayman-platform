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
          'fixed inset-y-0 start-0 z-50 flex w-[min(80vw,20rem)] flex-col gap-16',
          'border-e border-line bg-surface-2 p-16',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label={closeLabel}
          className="absolute end-16 top-16 rounded-[var(--r-xs)] p-4 text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg focus-visible:outline-2"
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
