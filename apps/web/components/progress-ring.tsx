import { cn } from '@ayman/ui';

export interface ProgressRingProps {
  /** 0..100. */
  percent: number;
  /** Rendered in the middle of the ring — a course number, a check, a figure. */
  children?: React.ReactNode;
  /** Outer diameter in px. The stroke scales with it. */
  size?: number;
  /**
   * Which surface the ring is drawn ON.
   *
   * `surface` — the app's own panels, where the unfilled track is a neutral
   * step (`--n-4`).
   * `ink` — a panel that is dark in BOTH themes: the dashboard's ember band.
   * `--n-4` there is #1F1C18 in dark and a pale warm grey in light, so the
   * track either vanishes into the band or glares off it depending on the
   * theme. A white alpha composites against whatever part of the gradient it
   * lands on instead, which is the same reasoning `--stage-fg-2` is set with.
   */
  tone?: 'surface' | 'ink';
  className?: string;
}

/**
 * Progress as a ring rather than a bar.
 *
 * Amber, never green — the same rule `LessonProgressBar` documents: green and
 * red are load-bearing for quiz correctness, and spending green on "progress"
 * here trains students to read it as "correct" three screens early.
 *
 * ## One component, and it briefly was not
 *
 * This lived at `components/path/progress-ring.tsx` and the dashboard's rebuild
 * grew a SECOND one — a `.dial` sized in CSS, with a white track and a
 * `role="img"` label — because the band needed a track colour this one could
 * not produce. Two rings for one idea is precisely what `study.css` and
 * `StatTile` both warn about, and the honest fix was a `tone` prop rather than
 * a second file. It moved up a directory for the second consumer.
 *
 * ## `aria-hidden`, deliberately
 *
 * Every place this renders already prints the same fact as text — either beside
 * it ("3 / 7", «خلصت 40%») or as the `children` inside it, which are OUTSIDE
 * the `<svg>` and therefore still announced. A `role="progressbar"` here would
 * make a screen reader read the same number twice per course — nine courses,
 * eighteen announcements. The ring is the decoration; the text is the content.
 *
 * The dash offset runs the ring COUNTER-clockwise from 12 o'clock via the
 * `-rotate-90` on the group, which is the direction a clock hand sweeps in the
 * mirrored RTL layout the rest of this screen uses. There is nothing to flip
 * per writing mode: a circle has no inline axis.
 */
export function ProgressRing({
  percent,
  children,
  size = 44,
  tone = 'surface',
  className,
}: ProgressRingProps) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  // Stroke is a ratio of the diameter so a 44px rail ring and a 104px band ring
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
          className={tone === 'ink' ? 'stroke-[rgb(255_255_255/0.20)]' : 'stroke-surface-4'}
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
