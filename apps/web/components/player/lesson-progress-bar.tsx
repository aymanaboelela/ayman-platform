import { cn } from '@ayman/ui';

export interface LessonProgressBarProps {
  /** 0..100. */
  percent: number;
  label: string;
  className?: string;
}

/**
 * Amber, never green. Green and red are load-bearing for quiz correctness
 * (Global Constraint 10) — using green for "progress" here would train
 * students to read it as "correct" three screens before the quiz runner does.
 *
 * The fill is sized with `inlineSize` rather than `width` so it grows from the
 * inline start: right-to-left in Arabic, left-to-right the day English exists.
 */
export function LessonProgressBar({ percent, label, className }: LessonProgressBarProps) {
  const clamped = Math.min(Math.max(percent, 0), 100);

  return (
    <div
      className={cn('h-1 w-full overflow-hidden rounded-full bg-surface-3', className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-full bg-accent transition-[inline-size] duration-300 ease-out"
        style={{ inlineSize: `${clamped}%` }}
      />
    </div>
  );
}
