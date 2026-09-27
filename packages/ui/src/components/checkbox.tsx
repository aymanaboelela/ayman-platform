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
        // نص مفتوح — بيتلوّن زي المعلّم، بس بشرطة مش صح (تحت).
        'data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-[#1A1206]">
        {/*
         * A plain check mark, not an icon-font glyph or an emoji.
         *
         * ⚠️ And a DASH when the state is `indeterminate`, because Radix
         * renders this same Indicator for it. A group checkbox that is half
         * open would otherwise draw a full check mark — and «الفلوس» reading
         * as fully granted when half of it is withheld is the one thing the
         * permissions screen must never do.
         */}
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
          {props.checked === 'indeterminate' ? (
            <path d="M3.5 8h9" />
          ) : (
            <path d="M3 8.5 6.5 12 13 4.5" />
          )}
        </svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
