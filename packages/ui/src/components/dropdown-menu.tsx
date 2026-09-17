'use client';

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/**
 * ## ⚠️ `modal={false}` is a DEFAULT here, and it is a bug fix
 *
 * Radix's own default is `modal={true}`, which wraps the open menu in
 * `<RemoveScroll>`. That library locks the page by writing
 * `body { overflow: hidden !important }`.
 *
 * On a normal document that is harmless: the root element's overflow is
 * `visible`, so the BODY's overflow is the value the UA propagates to the
 * viewport, the viewport stops scrolling, and the body itself is used as
 * `visible`. This product is not a normal document. `globals.css` sets
 * `html, body { overflow-x: clip }` to stop the sideways drag on phones, and
 * a root element that is not `visible` in both axes cancels that propagation
 * entirely — so `overflow: hidden` lands on `<body>` and means what it says:
 * body becomes its own scroll container.
 *
 * Every `position: sticky` element in the student shell is then sticking to a
 * container whose scroll offset is 0 instead of to the viewport. Measured in
 * Chromium at `scrollY: 1500`, the topbar and the rail both jumped from
 * `top: 0` to `top: -1500` the instant the menu opened — i.e. off the top of
 * the screen — and the menu, anchored to a trigger that had just left the
 * viewport, went with them. Reported as «أضغط على أيمن ألاقي الحاجات بتختفي من
 * على اليمين… لازم أطلع فوق خالص عشان تظهرلي».
 *
 * Non-modal is also simply the right behaviour for a menu: no scroll lock, no
 * `pointer-events: none` on the body, and the panel tracks its trigger while
 * the page scrolls. Outside clicks and Escape still close it — that is the
 * dismissable layer, which both modes have. Pass `modal` explicitly if a call
 * site ever genuinely needs the page frozen underneath.
 *
 * `dir` lives on the ROOT for this primitive, not on `Content` — Radix's
 * Menu context reads it once, at the top, and every descendant (including the
 * portal-rendered Content) consumes it from there. A thin wrapper that
 * defaults `dir="rtl"` means every call site gets correct arrow-key
 * traversal for free instead of relying on remembering the prop.
 */
export function DropdownMenu({
  dir = 'rtl',
  modal = false,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root dir={dir} modal={modal} {...props} />;
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
