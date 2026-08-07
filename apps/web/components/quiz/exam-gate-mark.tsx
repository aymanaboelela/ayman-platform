/**
 * The illustration on the pre-sitting gate.
 *
 * ## Why a drawn SVG and not an image
 *
 * An illustration here has one job: make a dialog full of consequences feel
 * like part of the product rather than a browser `confirm()`. A raster would
 * cost a request, ship a fixed palette into a page that has a light and a dark
 * theme, and land at whatever resolution it was exported at.
 *
 * This is built from the study surface's own tokens instead — `--v-*` for the
 * structure, `--a-*` for the one element that means "this is the live one" —
 * so it re-themes with everything else, scales to any size, and adds nothing
 * to the network.
 *
 * ## What it shows
 *
 * A paper with a clock over it and a single filled mark: the three facts the
 * dialog states in words (this is a paper, it is timed, one attempt is
 * recorded). `variant` swaps the accent detail — a checked seal for the
 * original sitting, an upward arrow for the improvement one — so the two
 * dialogs are recognisably different at a glance rather than the same picture
 * with different text.
 *
 * `aria-hidden`: every fact in here is stated in the dialog's own prose. A
 * screen reader announcing a decorative diagram would be repetition.
 */
export function ExamGateMark({ variant = 'start' }: { variant?: 'start' | 'improve' }) {
  return (
    <svg
      className="exam-gate-mark"
      viewBox="0 0 160 120"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {/* The sheet. Rotated slightly so it reads as an object on a desk
          rather than a box drawn to fill the frame. */}
      <g transform="rotate(-4 80 60)">
        <rect
          x="34"
          y="18"
          width="76"
          height="88"
          rx="6"
          className="exam-gate-mark__sheet"
        />
        {/* Ruled lines — shortening toward the bottom so the sheet reads as
            written-on without drawing anything a reader would try to read. */}
        <g className="exam-gate-mark__rule">
          <rect x="46" y="36" width="52" height="4" rx="2" />
          <rect x="46" y="48" width="44" height="4" rx="2" />
          <rect x="46" y="60" width="50" height="4" rx="2" />
          <rect x="46" y="72" width="34" height="4" rx="2" />
          <rect x="46" y="84" width="40" height="4" rx="2" />
        </g>
      </g>

      {/* The clock, overlapping the sheet's corner. The hands sit at roughly
          ten-to-two: a clock face with both hands vertical reads as stopped. */}
      <g className="exam-gate-mark__clock">
        <circle cx="112" cy="34" r="21" className="exam-gate-mark__clock-face" />
        <circle cx="112" cy="34" r="21" className="exam-gate-mark__clock-ring" />
        <path d="M112 22 L112 34 L121 39" className="exam-gate-mark__hands" />
      </g>

      {/* The one accent element. */}
      {variant === 'improve' ? (
        <g className="exam-gate-mark__seal">
          <circle cx="46" cy="92" r="17" className="exam-gate-mark__seal-fill" />
          <path d="M46 100 L46 84 M39 91 L46 84 L53 91" className="exam-gate-mark__seal-glyph" />
        </g>
      ) : (
        <g className="exam-gate-mark__seal">
          <circle cx="46" cy="92" r="17" className="exam-gate-mark__seal-fill" />
          <path d="M38 92 L44 98 L55 86" className="exam-gate-mark__seal-glyph" />
        </g>
      )}
    </svg>
  );
}
