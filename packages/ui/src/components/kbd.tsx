import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/** Mono, hairline, tiny. Used by the command palette to teach its own shortcuts. */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex min-w-[1.5rem] items-center justify-center rounded-[var(--r-xs)]',
        'border border-line bg-surface-3 px-4 py-2 font-mono',
        'text-[length:var(--fs-mono-label)] text-fg-muted',
        className,
      )}
      {...props}
    />
  );
}
