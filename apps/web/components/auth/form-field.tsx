import type { InputHTMLAttributes } from 'react';
import { cn } from '@ayman/ui';

export interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  errorMessage?: string;
}

/**
 * `ref` is accepted as a normal prop here — no `forwardRef` needed, React 19
 * lets function components take `ref` directly, and it rides along through
 * the `...props` spread below to reach the underlying `<input>`. This is
 * what lets `{...register('email')}` (react-hook-form's `ref`/`onChange`/
 * `onBlur`/`name` bundle) attach directly to a `<FormField>`.
 */
export function FormField({ label, errorMessage, id, className, ...props }: FormFieldProps) {
  const fieldId = id ?? props.name;
  const errorId = errorMessage ? `${fieldId}-error` : undefined;

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={fieldId}
        className="block text-[length:var(--fs-text-sm)] font-medium text-fg"
      >
        {label}
      </label>
      {/* 16px on phones, 15px from `md` up. This is a hand-rolled `<input>`
          rather than `@ayman/ui`'s `Input`, so it does not inherit that
          component's iOS-zoom fix and has to spell the same pair out — and
          because the size lives on the element as a utility, no
          `input { font-size: 1rem }` rule in `@layer base` could have reached
          it either. Below 16px iOS Safari zooms the viewport on focus and
          never zooms back, which lands hardest here: /login, /register and the
          onboarding wizard are the phone-first screens that gate entry to the
          product. `h-10` pins the height, so the extra pixel of type does not
          move this field's box at all. Full reasoning in
          packages/ui/src/components/input.tsx. */}
      <input
        id={fieldId}
        aria-invalid={errorMessage ? true : undefined}
        aria-describedby={errorId}
        className={cn(
          'block h-10 w-full rounded-sm border bg-surface-2 px-3 text-[1rem] text-fg md:text-[length:var(--fs-text-base)]',
          'placeholder:text-fg-faint',
          'transition-colors duration-[var(--d-hover)] ease-[var(--ease)]',
          errorMessage ? 'border-[color:var(--err)]' : 'border-line',
          className,
        )}
        {...props}
      />
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
