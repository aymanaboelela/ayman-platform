import * as React from 'react';
import { cn } from '../lib/cn';

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement> & {
  /** Renders the required marker. Never uppercase — Arabic has no case. */
  required?: boolean;
};

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { className, required, children, ...props },
  ref,
) {
  return (
    <label
      ref={ref}
      className={cn('mb-1.5 block text-[length:var(--fs-text-sm)] font-medium text-fg', className)}
      {...props}
    >
      {children}
      {required ? (
        <span aria-hidden="true" className="ms-1 text-accent-text">
          *
        </span>
      ) : null}
    </label>
  );
});
