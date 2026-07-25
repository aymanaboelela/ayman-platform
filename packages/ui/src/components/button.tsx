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
  sm: 'h-8 px-3 text-[length:var(--fs-text-sm)]',
  md: 'h-10 px-4 text-[length:var(--fs-text-base)]',
};

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-sm font-medium',
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
