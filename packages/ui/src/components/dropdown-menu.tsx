'use client';

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/**
 * `dir` lives on the ROOT for this primitive, not on `Content` — Radix's
 * Menu context reads it once, at the top, and every descendant (including the
 * portal-rendered Content) consumes it from there. A thin wrapper that
 * defaults `dir="rtl"` means every call site gets correct arrow-key
 * traversal for free instead of relying on remembering the prop.
 */
export function DropdownMenu({
  dir = 'rtl',
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root dir={dir} {...props} />;
}

export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuSeparator = DropdownMenuPrimitive.Separator;

/** Row action menus (the students list's per-row actions, the command palette's overflow). */
export function DropdownMenuContent({
  className,
  sideOffset = 4,
  align = 'start',
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-50 min-w-[10rem] overflow-hidden rounded-[var(--r-md)] border border-line',
          'bg-surface-2 p-1 text-start shadow-none',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        'flex cursor-default items-center gap-2 rounded-[var(--r-xs)] px-2 py-2 text-start',
        'text-[length:var(--fs-text-sm)] text-fg outline-none',
        'data-[highlighted]:bg-surface-3',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      className={cn(
        // `relative` is load-bearing: the indicator below is absolutely
        // positioned, and without a positioned ancestor here it anchored to
        // the nearest one further up — the portalled Content — so the tick
        // sat at the top of the menu instead of beside its own row.
        'relative flex cursor-default items-center gap-2 rounded-[var(--r-xs)] py-2 ps-6 pe-2 text-start',
        'text-[length:var(--fs-text-sm)] text-fg outline-none',
        'data-[highlighted]:bg-surface-3',
        className,
      )}
      {...props}
    >
      <span className="absolute start-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="size-3.5" aria-hidden="true" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn(
        'px-2 py-1 font-mono text-[length:var(--fs-mono-label)] text-fg-muted',
        className,
      )}
      {...props}
    />
  );
}
