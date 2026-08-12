import type { SelectHTMLAttributes } from 'react';
import { cn } from '@ayman/ui/lib/cn';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  placeholder: string;
  options: SelectOption[];
  errorMessage?: string;
}

/**
 * `<select>` counterpart to `../auth/form-field.tsx`'s `<input>` — same
 * label/error/id wiring, same "ref rides along as a normal prop" trick (React
 * 19, no `forwardRef` needed) so `{...register(name)}` attaches directly.
 * Always renders a blank leading option so the visible DOM state matches
 * react-hook-form's `undefined` until the student actually chooses something
 * — a select with no blank option would visually show its first real option
 * as chosen while the form state still thinks nothing was picked.
 */
export function SelectField({
  label,
  placeholder,
  options,
  errorMessage,
  id,
  className,
  name,
  ...props
}: SelectFieldProps) {
  const fieldId = id ?? name;
  const errorId = errorMessage ? `${fieldId}-error` : undefined;

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={fieldId}
        className="block text-[length:var(--fs-text-sm)] font-medium text-fg"
      >
        {label}
      </label>
      {/* 16px on phones, 15px from `md` up — same iOS-zoom fix and same reason
          it has to be spelled on the element as `../auth/form-field.tsx`; a
          focused `<select>` under 16px zooms the viewport just like an
          `<input>` does. `h-10` pins the height, so nothing in the wizard's
          step layout moves. Full reasoning in
          packages/ui/src/components/input.tsx. */}
      <select
        id={fieldId}
        name={name}
        aria-invalid={errorMessage ? true : undefined}
        aria-describedby={errorId}
        className={cn(
          'block h-10 w-full rounded-sm border bg-surface-2 px-3 text-[1rem] text-fg md:text-[length:var(--fs-text-base)]',
          'transition-colors duration-[var(--d-hover)] ease-[var(--ease)]',
          errorMessage ? 'border-[color:var(--err)]' : 'border-line',
          className,
        )}
        {...props}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {errorMessage && (
        <p
          id={errorId}
          role="alert"
          className="text-[length:var(--fs-text-xs)] text-[color:var(--err)]"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}
