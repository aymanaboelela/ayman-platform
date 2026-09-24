import type { SelectHTMLAttributes } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
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
  /** The onboarding wizard's look — see `FormField`'s `variant`. */
  variant?: 'plain' | 'pill';
  icon?: LucideIcon;
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
  variant = 'plain',
  icon: Icon,
  ...props
}: SelectFieldProps) {
  const fieldId = id ?? name;
  const errorId = errorMessage ? `${fieldId}-error` : undefined;

  const pill = variant === 'pill';

  const control = (
    /* 16px on phones, 15px from `md` up — same iOS-zoom fix and same reason
       it has to be spelled on the element as `../auth/form-field.tsx`; a
       focused `<select>` under 16px zooms the viewport just like an
       `<input>` does. `h-10` pins the height, so nothing in the wizard's
       step layout moves. Full reasoning in
       packages/ui/src/components/input.tsx. */
    <select
      id={fieldId}
      name={name}
      aria-invalid={errorMessage ? true : undefined}
      aria-describedby={errorId}
      className={cn(
        pill
          ? 'field__control field__control--select'
          : [
              'block h-10 w-full rounded-sm border bg-surface-2 px-3 text-[1rem] text-fg md:text-[length:var(--fs-text-base)]',
              'transition-colors duration-[var(--d-hover)] ease-[var(--ease)]',
              errorMessage ? 'border-[color:var(--err)]' : 'border-line',
            ],
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
  );

  return (
    <div className={pill ? 'field field--pill' : 'space-y-1.5'}>
      <label
        htmlFor={fieldId}
        className={
          pill ? 'field__label' : 'block text-[length:var(--fs-text-sm)] font-medium text-fg'
        }
      >
        {label}
      </label>
      {pill ? (
        /* The native arrow is switched off (`appearance: none`) and drawn
           here instead, so it can sit between the text and the field's own
           icon the way the reference lays it out — and so it is one glyph on
           every browser rather than three different ones. */
        <div className="field__box">
          {control}
          <ChevronDown className="field__chevron" aria-hidden="true" />
          {Icon ? <Icon className="field__icon" aria-hidden="true" /> : null}
        </div>
      ) : (
        control
      )}
      {errorMessage && (
        <p
          id={errorId}
          role="alert"
          className={
            pill ? 'field__error' : 'text-[length:var(--fs-text-xs)] text-[color:var(--err)]'
          }
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}
