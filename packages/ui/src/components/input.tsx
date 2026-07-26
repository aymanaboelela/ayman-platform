import * as React from 'react';
import { cn } from '../lib/cn';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

/**
 * Hairline border, 4px radius (--r-sm), amber focus ring from the token. No
 * shadow — depth comes from the surface ladder, and `--shadow-*` is
 * transparent in dark mode anyway. Logical padding only.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'block w-full rounded-sm border border-line bg-surface-2 px-3 py-2',
        'text-fg placeholder:text-fg-muted',
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
