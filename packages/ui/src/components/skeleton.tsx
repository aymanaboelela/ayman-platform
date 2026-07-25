import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

type Width = 'full' | 'wide' | 'narrow';

/** Varying bar widths is the single biggest difference between a skeleton that
 *  reads as designed and one that reads as cheap. */
const WIDTHS: Record<Width, string> = {
  full: 'w-full',
  wide: 'w-[85%]',
  narrow: 'w-[60%]',
};

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  width?: Width;
}

export function Skeleton({ width = 'full', className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'relative h-4 overflow-hidden rounded-sm bg-[color-mix(in_oklch,var(--n-12),transparent_95%)]',
        // The trailing `_180ms` is a second <time> value in the `animation`
        // shorthand: the first <time> (1.8s) is duration, the second (180ms)
        // is delay — see the note on the dead `.animate-\[...\]` selector
        // rule this replaced, in globals.css's history / task-6 report.
        'after:absolute after:inset-0 after:-translate-x-full after:animate-[shimmer_1.8s_infinite_180ms]',
        'after:bg-gradient-to-r after:from-transparent after:via-[color-mix(in_oklch,var(--n-12),transparent_92%)] after:to-transparent',
        WIDTHS[width],
        className,
      )}
      {...props}
    />
  );
}
