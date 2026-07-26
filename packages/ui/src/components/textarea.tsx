import * as React from 'react';
import { cn } from '../lib/cn';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

/** Same treatment as `Input`. `field-sizing-content` grows the box with the text. */
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
