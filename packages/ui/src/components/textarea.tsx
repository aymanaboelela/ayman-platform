import * as React from 'react';
import { cn } from '../lib/cn';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

/**
 * Same treatment as `Input`, including the 16px-on-phones font size that keeps
 * iOS Safari from auto-zooming on focus — the reasoning is written out once, in
 * `input.tsx`. `field-sizing-content` grows the box with the text, and neither
 * `min-h-32` nor the essay variant's `min-h-56` is pinned to a viewport
 * fraction, so the ~2px the larger text adds to a line just makes the box
 * slightly taller rather than pushing anything out of a fixed frame.
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'block min-h-32 w-full rounded-sm border border-line bg-surface-2 px-3 py-2',
        'text-[1rem] md:text-[length:var(--fs-text-base)]',
        'text-fg placeholder:text-fg-muted [field-sizing:content]',
        'transition-colors duration-150 ease-out',
        'hover:border-line-strong focus-visible:border-accent',
        'disabled:cursor-not-allowed disabled:opacity-60',
        invalid && 'border-err',
        className,
      )}
      {...props}
    />
  );
});
