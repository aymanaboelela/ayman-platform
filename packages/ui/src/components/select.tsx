import * as React from 'react';
import { cn } from '../lib/cn';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
};

/**
 * A native <select>. RTL, keyboard behaviour, and mobile pickers are all
 * correct for free, and a custom listbox would be extra JS to reimplement
 * them worse. There is deliberately no Radix `Select` in this product — this
 * native element is the select, everywhere.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'block w-full rounded-sm border border-line bg-surface-2 px-3 py-2',
        'text-fg transition-colors duration-150 ease-out',
        'hover:border-line-strong focus-visible:border-accent',
        'disabled:cursor-not-allowed disabled:opacity-60',
        invalid && 'border-err',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
