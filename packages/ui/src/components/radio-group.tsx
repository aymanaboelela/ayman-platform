'use client';

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/**
 * Radix reads `dir` for arrow-key semantics — a plain `<html dir="rtl">`
 * ancestor is not enough once this renders inside a portal-free but still
 * keyboard-navigable group, so `dir="rtl"` is passed explicitly.
 */
export function RadioGroup({ className, ...props }: ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root dir="rtl" className={cn('flex flex-col gap-2', className)} {...props} />
  );
}

export function RadioGroupItem({
  className,
  ...props
}: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full border border-line',
        'bg-surface-2 transition-colors duration-150 ease-out',
        'hover:border-line-strong focus-visible:border-accent',
        'data-[state=checked]:border-accent',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="size-2.5 rounded-full bg-accent" />
    </RadioGroupPrimitive.Item>
  );
}
