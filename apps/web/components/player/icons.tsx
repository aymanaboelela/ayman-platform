import { cn } from '@ayman/ui/lib/cn';

type IconProps = { className?: string };

const BASE = 'h-4 w-4 shrink-0';
const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** Points toward the inline END — "next" in any writing mode. */
export function ChevronForward({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn(BASE, 'icon-inline', className)}
      {...STROKE}
    >
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

/** Points toward the inline START — "previous" in any writing mode. */
export function ChevronBack({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn(BASE, 'icon-inline', className)}
      {...STROKE}
    >
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

export function PlayIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn(BASE, className)} fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn(BASE, className)} {...STROKE}>
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

export function DownloadIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn(BASE, className)} {...STROKE}>
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 20h16" />
    </svg>
  );
}

export function DocumentIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn(BASE, className)} {...STROKE}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zm0 0v5h5" />
    </svg>
  );
}

export function QuizIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn(BASE, className)} {...STROKE}>
      <path d="M9 9a3 3 0 1 1 4 2.8c-.6.3-1 .9-1 1.6v.6M12 17.5h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function LinkIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn(BASE, className)} {...STROKE}>
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </svg>
  );
}

export function VideoIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn(BASE, className)} {...STROKE}>
      <rect x="3" y="5" width="13" height="14" rx="2" />
      <path d="m16 10 5-3v10l-5-3z" />
    </svg>
  );
}

export function SlidesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn(BASE, className)} {...STROKE}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M12 16v4m-3 0h6" />
    </svg>
  );
}

export function LockIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn(BASE, className)} {...STROKE}>
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/**
 * The fullscreen corner control — four brackets pointing out, and the same
 * four pointing in once you are there.
 *
 * ONE component with a flag rather than two exports, because the two states
 * are the same control and the icon must never disagree with the button's own
 * label about which way it will go.
 */
export function FullscreenIcon({ className, exiting = false }: IconProps & { exiting?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('h-5 w-5 shrink-0', className)} {...STROKE}>
      {exiting ? (
        <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      ) : (
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      )}
    </svg>
  );
}
