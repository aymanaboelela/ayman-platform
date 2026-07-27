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
      className={cn(
        'relative inline-flex h-20 w-36 shrink-0 items-center rounded-full border border-line',
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
          'block size-16 rounded-full bg-surface-1 shadow-none transition-transform duration-150 ease-out',
          'translate-x-[2px] rtl:-translate-x-[2px]',
          'data-[state=checked]:translate-x-[18px] data-[state=checked]:rtl:-translate-x-[18px]',
        )}
      />
    </SwitchPrimitive.Root>
  );
}
