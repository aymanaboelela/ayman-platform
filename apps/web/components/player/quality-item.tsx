import type { ReactNode } from 'react';
import { cn } from '@ayman/ui/lib/cn';

/** One choice in the settings menu's quality grid — shared by our own copy and the YouTube bar. */
export function QualityItem({
  selected,
  onClick,
  wide = false,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  /** «تلقائي» takes the whole first row — it is the default, and it is longer. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'rounded-md px-2 py-1.5 text-center text-[length:var(--fs-text-sm)] transition-colors duration-[160ms]',
        wide && 'col-span-3',
        selected ? 'bg-accent font-semibold text-[#1A1206]' : 'bg-white/10 hover:bg-white/20',
      )}
    >
      {children}
    </button>
  );
}
