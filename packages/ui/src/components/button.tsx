import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANTS: Record<Variant, string> = {
  // Accent is used FLAT — never as a gradient. That distinction is the whole
  // difference between "Linear's indigo" and "the AI purple gradient".
  primary: 'bg-accent text-[#1A1206] hover:bg-accent-hover',
  secondary: 'bg-surface-3 text-fg border border-line hover:bg-surface-4',
  ghost: 'bg-transparent text-fg-muted hover:bg-surface-3 hover:text-fg',
  danger: 'bg-transparent text-[color:var(--err)] border border-[color:var(--err)] hover:bg-[color-mix(in_oklch,var(--err),transparent_88%)]',
};

const SIZES: Record<Size, string> = {
  // 40px on a phone, 32 from `md` up. Measured on production at 360px,
  // every `sm` button came in at 32px tall — «اقفل الجهاز», «غيّر صورتك» —
  // which is under both platform touch guidelines and WCAG 2.5.5. The
  // compact size is a DENSITY choice for pointer layouts, and a thumb was
  // never the reason for it; the type size is unchanged either way.
  sm: 'h-10 px-3 text-[length:var(--fs-text-sm)] md:h-8',
  md: 'h-10 px-4 text-[length:var(--fs-text-base)]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  // A bare <button> defaults to type="submit", which silently submits any
  // enclosing <form> — a real hazard once quiz forms have several buttons
  // (تسليم / تخطي / السابق) and only one of them should submit. Default to
  // "button"; a caller that actually wants a submit button still can with
  // <Button type="submit">, since destructuring only supplies the default
  // when the caller didn't pass one.
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        // `whitespace-nowrap` because both sizes lock the box to `h-10` (32px
        // from `md` up) and centre their content: the instant a label wraps to
        // two lines it is ~46px of text in a 40px box, so it renders proud of
        // its own border instead of making the button taller. Not
        // hypothetical — «سلّم الامتحان» did exactly that in the quiz runner's
        // footer at 320px, on the control that ends a timed exam.
        //
        // Safe as a base rule: every label in this product is one to three
        // words, and `.site-btn` in the marketing stylesheet has carried the
        // same declaration since it was written. What it does change is that a
        // squeezed button now reports its FULL label as its min-content width
        // rather than a wrapped fragment, so a tight row has to be allowed to
        // wrap (see `.runner-foot`) or it will overflow sideways instead.
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium',
        'transition-colors duration-[var(--d-hover)] ease-[var(--ease)]',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
