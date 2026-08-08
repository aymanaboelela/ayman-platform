'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export type SwitchProps = ComponentProps<typeof SwitchPrimitive.Root>;

/**
 * Radix-backed, not a checkbox styled to look like a toggle — Radix already
 * gets the keyboard model (Space to toggle, no arrow-key stealing) and the
 * `data-state` hooks right. The thumb travels along the inline axis via
 * `rtl:-translate-x-4`/logical-equivalent handling below rather than a
 * physical `translate-x`, because `translate-x` has no logical CSS form: it
 * always shifts along the physical X axis regardless of `dir`.
 */
export function Switch({ className, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      /*
       * 44×24 with a 20px thumb, and the numbers are load-bearing.
       *
       * This read `h-20 w-36` with a `size-16` thumb — 80px tall by 144px wide,
       * a control the size of a playing card for a yes/no. It also looked
       * BROKEN rather than merely large: the thumb's travel stayed at 18px, so
       * a 64px ball shuffled a thumb's width along a 144px track and the two
       * states were nearly indistinguishable. Reported as «زرار معاينة مجانية
       * دي أصغرها شوية», which is every switch in the admin, not one of them.
       *
       * The travel is derived, not guessed: 44 (track) − 20 (thumb) − 2 (start
       * inset) = 22. Change any of the three and this must change with it, or
       * the thumb hangs off the end or stops short of it.
       *
       * 44px wide also keeps the whole control at the 24px height a label sits
       * beside without shifting the row's baseline, while the hit area stays
       * comfortably past the 24px minimum for touch.
       */
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-line',
        'bg-surface-3 transition-colors duration-150 ease-out',
        'focus-visible:outline-2 focus-visible:outline-offset-2',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'block size-5 rounded-full bg-surface-1 shadow-none transition-transform duration-150 ease-out',
          'translate-x-[2px] rtl:-translate-x-[2px]',
          'data-[state=checked]:translate-x-[22px] data-[state=checked]:rtl:-translate-x-[22px]',
        )}
      />
    </SwitchPrimitive.Root>
  );
}
