import { cn } from '@ayman/ui';

export interface ProgressRingProps {
  /** 0..100. */
  percent: number;
  /** Rendered in the middle of the ring — a course number, or a check. */
  children?: React.ReactNode;
  /** Outer diameter in px. The stroke scales with it. */
  size?: number;
  className?: string;
}

/**
 * A course's progress as a ring rather than a bar.
 *
 * Amber, never green — the same rule `LessonProgressBar` documents: green and
 * red are load-bearing for quiz correctness, and spending green on "progress"
 * here trains students to read it as "correct" three screens early.
 *
 * `aria-hidden`, and that is deliberate. Every place this renders already
 * prints the same fact as text right next to it ("3 / 7", "خلصت 40%"). A
 * `role="progressbar"` here would make a screen reader announce the same number
 * twice per course — nine courses, eighteen announcements. The ring is the
 * decoration; the text is the content.
 *
 * The dash offset runs the ring COUNTER-clockwise from 12 o'clock via the
 * `-rotate-90` on the group, which is the direction a clock hand sweeps in the
 * mirrored RTL layout the rest of this screen uses. There is nothing to flip
 * per writing mode: a circle has no inline axis.
 */
export function ProgressRing({ percent, children, size = 44, className }: ProgressRingProps) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  // Stroke is a ratio of the diameter so a 44px rail ring and a 72px card ring
  // read as the same object at two scales, rather than as two different rings.
  const stroke = Math.max(2, Math.round(size * 0.09));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        aria-hidden="true"
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-surface-4"
        />
        {clamped > 0 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - clamped / 100)}
            className="stroke-accent"
          />
        ) : null}
      </svg>

      {children ? (
        <span className="absolute inset-0 flex items-center justify-center">{children}</span>
      ) : null}
    </span>
  );
}
