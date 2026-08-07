/**
 * The small drawings that sit in an empty state.
 *
 * ## Why drawn, and why here
 *
 * An empty state was a sentence in a tinted box. It reads as a page that has
 * not finished loading rather than as a place waiting to be filled, and the
 * dashboard has three of them at once for a brand-new student — which is the
 * very first thing they ever see of the product.
 *
 * Built from the study surface's own tokens (`--e-*` for the structure,
 * `--a-*` for the one live element) rather than shipped as raster art, for the
 * same reasons `ExamGateMark` gives: it re-themes with the page, it is sharp
 * at any size, and it costs no request on the screen that has to paint fastest.
 *
 * `aria-hidden` on all of them: every one sits directly above copy that says
 * the same thing in words. A screen reader announcing the drawing would be
 * repetition, and none of them carry information the sentence does not.
 */

export type SpotName = 'courses' | 'exams' | 'scores';

export function SpotIllustration({ name }: { name: SpotName }) {
  return (
    <svg
      className="spot"
      viewBox="0 0 120 84"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {/* The ground line every spot sits on, so the three read as a set. */}
      <path d="M18 72 H102" className="spot__ground" />

      {name === 'courses' ? <Courses /> : name === 'exams' ? <Exams /> : <Scores />}
    </svg>
  );
}

/** A short stack of books — "you have no courses yet". */
function Courses() {
  return (
    <g>
      <rect x="30" y="52" width="58" height="12" rx="3" className="spot__solid" />
      <rect x="35" y="40" width="48" height="12" rx="3" className="spot__line" />
      <rect x="42" y="28" width="34" height="12" rx="3" className="spot__accent" />
      {/* The spine marks: two short rules that make the blocks read as books
          rather than as bars on a chart. */}
      <path d="M38 56 h6 M43 44 h6 M50 32 h6" className="spot__mark" />
    </g>
  );
}

/** A paper with a tick — "no exam sat yet". */
function Exams() {
  return (
    <g>
      <rect x="38" y="20" width="44" height="46" rx="4" className="spot__solid" />
      <path d="M46 32 h28 M46 41 h22 M46 50 h25" className="spot__mark" />
      <circle cx="82" cy="58" r="11" className="spot__accent-fill" />
      <path d="M77 58 l4 4 l7 -8" className="spot__accent-glyph" />
    </g>
  );
}

/** Three rising bars — "no scores yet". */
function Scores() {
  return (
    <g>
      <rect x="34" y="50" width="14" height="18" rx="3" className="spot__line" />
      <rect x="53" y="38" width="14" height="30" rx="3" className="spot__solid" />
      <rect x="72" y="26" width="14" height="42" rx="3" className="spot__accent" />
    </g>
  );
}
