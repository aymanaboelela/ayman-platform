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

/**
 * A paragraph of bars whose widths cycle 100% / 85% / 60%.
 *
 * Uniform-width bars are the single biggest "cheap skeleton" tell — real text
 * does not have a flush right edge, and the eye reads the difference instantly.
 */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  const cycle: Width[] = ['full', 'wide', 'narrow'];
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={cycle[i % cycle.length]} />
      ))}
    </div>
  );
}

/**
 * Card placeholders that share the real grid's gap, radius and border so the
 * swap does not shift a single pixel. `--r-lg` (8px) is the card ceiling.
 */
export function SkeletonCardGrid({
  count = 3,
  columns = 3,
  className,
}: {
  count?: number;
  columns?: 2 | 3;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid gap-4',
        columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="rounded-lg border border-line-subtle p-5"
          style={{ borderRadius: 'var(--r-lg)' }}
        >
          <Skeleton width="narrow" className="mb-4 h-3" />
          <Skeleton width="wide" className="mb-3 h-5" />
          <SkeletonText lines={2} />
        </div>
      ))}
    </div>
  );
}
