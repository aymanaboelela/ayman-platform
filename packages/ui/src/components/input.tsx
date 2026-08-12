import * as React from 'react';
import { cn } from '../lib/cn';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

/**
 * Hairline border, 4px radius (--r-sm), amber focus ring from the token. No
 * shadow — depth comes from the surface ladder, and `--shadow-*` is
 * transparent in dark mode anyway. Logical padding only.
 *
 * The font size is 16px on phones and only drops to the 15px body size at
 * `md`. That one pixel is not a taste call: iOS Safari auto-zooms the whole
 * viewport whenever it focuses a control whose computed font-size is under
 * 16px, and `--fs-text-base` is 0.9375rem = 15px (see the header of
 * ../tokens/typography.css — "Base is 15px, not 16 — denser, more tool-like").
 * The zoom is not undone on blur, so the student is left scrolled and
 * off-centre for the rest of the session. The other way to stop it —
 * `maximum-scale=1` / `user-scalable=no` on the viewport meta — is off the
 * table: it disables pinch-zoom entirely, fails WCAG 1.4.4, and would remove
 * the only escape from an over-tall dialog. Chrome for Android does not
 * auto-zoom at all, so on the majority device here this costs nothing.
 *
 * Note this is deliberately a class on the component and not an
 * `input, select, textarea { font-size: 1rem }` rule in `@layer base`. The
 * hand-rolled fields in apps/web (components/auth/form-field.tsx,
 * components/onboarding/select-field.tsx) put the font size on the element
 * itself, and a utility class beats an element selector in a base layer — so
 * a global rule would silently miss exactly the onboarding wizard this is
 * for. Those two files carry the same pair of utilities instead.
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
        'text-[1rem] md:text-[length:var(--fs-text-base)]',
        'text-fg placeholder:text-fg-faint',
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
