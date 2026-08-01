import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/**
 * A semantic `<table>` shell — no ARIA grid role-play, just the elements a
 * screen reader already understands. Horizontal overflow scrolls inside
 * `TableWrapper` so the page body never scrolls sideways (every admin list in
 * this plan can grow columns past the viewport).
 */
export function TableWrapper({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('w-full overflow-x-auto rounded-[var(--r-lg)] border border-line', className)}
      {...props}
    />
  );
}

/**
 * `tabular-nums` on the whole table: every score, count and date column has
 * to align, and turning it on per-cell is a rule nobody remembers.
 */
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <table
      className={cn('w-full border-collapse text-[length:var(--fs-text-sm)] tabular-nums', className)}
      {...props}
    />
  );
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn(className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={className} {...props} />;
}

export function TableFooter({ className, ...props }: ComponentProps<'tfoot'>) {
  return (
    <tfoot
      className={cn('border-t border-line bg-surface-2 font-[var(--fw-medium)]', className)}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-line bg-surface-2 px-3 py-2 text-start font-[var(--fw-medium)]',
        'font-mono text-[length:var(--fs-mono-label)] text-fg-muted',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return (
    <td
      className={cn('border-b border-line-subtle px-3 py-2 text-start', className)}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      className={cn('hover:bg-surface-2 data-[selected=true]:bg-surface-3', className)}
      {...props}
    />
  );
}

export function TableCaption({ className, ...props }: ComponentProps<'caption'>) {
  return (
    <caption
      className={cn('mt-2 text-[length:var(--fs-text-xs)] text-fg-muted', className)}
      {...props}
    />
  );
}
