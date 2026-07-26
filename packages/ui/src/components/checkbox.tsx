'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export type CheckboxProps = ComponentProps<typeof CheckboxPrimitive.Root>;

/**
 * Radix-backed, not native — the quiz runner (Plan 5) needs a controlled,
 * keyboard-correct, RTL-native checkbox and a native `<input type="checkbox">`
 * cannot be restyled to the token set without `appearance: none` hacks.
 */
export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-xs border border-line',
        'bg-surface-2 transition-colors duration-150 ease-out',
        'hover:border-line-strong focus-visible:border-accent',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-[#1A1206]">
        {/* A plain check mark, not an icon-font glyph or an emoji. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="size-3"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 8.5 6.5 12 13 4.5" />
        </svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
