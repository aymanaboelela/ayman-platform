import type { InputHTMLAttributes } from 'react';
import { cn } from '@ayman/ui/lib/cn';

export interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  errorMessage?: string;
  /**
   * Standing help text, shown whether or not anything is wrong — as opposed to
   * `errorMessage`, which replaces nothing and appears only on failure.
   *
   * Added for the optional email field on /register, where the label alone
   * cannot carry the point: a student needs to know not just that the field is
   * optional but that skipping it costs them nothing, or they will type
   * something in anyway.
   */
  hint?: string;
}

/**
 * `ref` is accepted as a normal prop here — no `forwardRef` needed, React 19
 * lets function components take `ref` directly, and it rides along through
 * the `...props` spread below to reach the underlying `<input>`. This is
 * what lets `{...register('email')}` (react-hook-form's `ref`/`onChange`/
 * `onBlur`/`name` bundle) attach directly to a `<FormField>`.
 */
export function FormField({ label, errorMessage, hint, id, className, ...props }: FormFieldProps) {
  const fieldId = id ?? props.name;
  const errorId = errorMessage ? `${fieldId}-error` : undefined;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  /**
   * BOTH ids, space-separated, and in this order. `aria-describedby` takes a
   * list; passing only the error would silence the hint for a screen reader at
   * exactly the moment the field is hardest to understand, and passing only
   * the hint would swallow the error.
   */
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

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
        aria-describedby={describedBy}
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
      {hint && (
        <p id={hintId} className="text-[length:var(--fs-text-xs)] text-fg-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
