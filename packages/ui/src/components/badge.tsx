import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

type Tone = 'neutral' | 'ok' | 'err' | 'warn' | 'accent';

const TONES: Record<Tone, string> = {
  neutral: 'text-fg-muted border-line bg-surface-3',
  ok: 'text-[color:var(--ok)] border-[color-mix(in_oklch,var(--ok),transparent_70%)] bg-[color-mix(in_oklch,var(--ok),transparent_92%)]',
  err: 'text-[color:var(--err)] border-[color-mix(in_oklch,var(--err),transparent_70%)] bg-[color-mix(in_oklch,var(--err),transparent_92%)]',
  warn: 'text-[color:var(--warn)] border-[color-mix(in_oklch,var(--warn),transparent_70%)] bg-[color-mix(in_oklch,var(--warn),transparent_92%)]',
  accent: 'text-accent-text border-[color-mix(in_oklch,var(--a-9),transparent_70%)] bg-[color-mix(in_oklch,var(--a-9),transparent_92%)]',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

/** --r-full is used here deliberately: pills are for status chips and avatars only. */
export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'mono inline-flex items-center rounded-full border px-2 py-0.5',
        'text-[length:var(--fs-mono-label)] font-medium',
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
