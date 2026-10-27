/**
 * The parent's page drawings — original, inline, and brand-neutral.
 *
 * Inline SVG for the same reasons `SpotIllustration` gives: it re-themes with
 * the page, is sharp at any size, and costs no request on a page parents open
 * on a phone over mobile data. Every fill is a class (see `guardian.css`), and
 * every class resolves to the token layer — so another teacher's stack paints
 * these in its own colours, and nothing here names or draws a teacher.
 *
 * All `aria-hidden`: each sits next to text that says what it shows.
 */

/** The hero: an open notebook with a chart climbing out of it, a star, a pencil. */
export function GuardianHeroArt() {
  return (
    <svg className="gd-art gd-art--hero" viewBox="0 0 220 170" role="presentation" aria-hidden="true" focusable="false">
      {/* soft ground and halo */}
      <ellipse cx="110" cy="152" rx="88" ry="10" className="gd-art__shadow" />
      <circle cx="150" cy="58" r="44" className="gd-art__halo" />

      {/* the notebook */}
      <path d="M26 118 L104 104 L104 150 L26 160 Z" className="gd-art__page" />
      <path d="M104 104 L184 116 L184 158 L104 150 Z" className="gd-art__page gd-art__page--right" />
      <path d="M104 104 L104 150" className="gd-art__spine" />
      <path d="M38 126 L92 117 M38 136 L92 127 M38 146 L76 140" className="gd-art__rule" />
      <path d="M116 120 L172 128 M116 130 L172 138 M116 140 L156 145" className="gd-art__rule" />

      {/* the chart rising out of it */}
      <rect x="58" y="72" width="18" height="40" rx="3" className="gd-art__bar gd-art__bar--1" />
      <rect x="84" y="54" width="18" height="56" rx="3" className="gd-art__bar gd-art__bar--2" />
      <rect x="110" y="34" width="18" height="74" rx="3" className="gd-art__bar gd-art__bar--3" />
      <path d="M52 78 L84 58 L112 44 L146 22" className="gd-art__trend" />
      <circle cx="146" cy="22" r="5" className="gd-art__dot" />

      {/* a star for the good week, and a pencil */}
      <path
        d="M168 66 l4.7 9.6 10.6 1.5 -7.7 7.4 1.8 10.5 -9.4 -5 -9.4 5 1.8 -10.5 -7.7 -7.4 10.6 -1.5 Z"
        className="gd-art__star"
      />
      <g transform="rotate(-38 184 128)">
        <rect x="150" y="122" width="58" height="11" rx="2" className="gd-art__pencil" />
        <path d="M208 122 L220 127.5 L208 133 Z" className="gd-art__pencil-tip" />
        <rect x="150" y="122" width="9" height="11" rx="2" className="gd-art__pencil-end" />
      </g>

      {/* sparkles */}
      <path d="M30 44 v10 M25 49 h10" className="gd-art__spark" />
      <path d="M196 30 v8 M192 34 h8" className="gd-art__spark" />
      <circle cx="44" cy="92" r="3" className="gd-art__confetti" />
      <circle cx="198" cy="96" r="2.5" className="gd-art__confetti" />
    </svg>
  );
}

/** «كله تمام» — a badge with a tick and a little confetti. */
export function GuardianClearArt() {
  return (
    <svg className="gd-art gd-art--clear" viewBox="0 0 96 80" role="presentation" aria-hidden="true" focusable="false">
      <circle cx="48" cy="40" r="28" className="gd-art__ok-ring" />
      <circle cx="48" cy="40" r="20" className="gd-art__ok-disc" />
      <path d="M38 40.5 L45 47.5 L59 33" className="gd-art__ok-tick" />
      <path d="M14 20 v8 M10 24 h8" className="gd-art__ok-spark" />
      <path d="M82 52 v8 M78 56 h8" className="gd-art__ok-spark" />
      <circle cx="80" cy="18" r="3" className="gd-art__ok-confetti" />
      <circle cx="16" cy="60" r="2.5" className="gd-art__ok-confetti" />
    </svg>
  );
}

/** An empty block — a calm stack of papers with a sprout, for «لسه مفيش». */
export function GuardianEmptyArt() {
  return (
    <svg className="gd-art gd-art--empty" viewBox="0 0 120 84" role="presentation" aria-hidden="true" focusable="false">
      <path d="M18 72 H102" className="gd-art__ground" />
      <rect x="30" y="40" width="52" height="32" rx="3" className="gd-art__sheet gd-art__sheet--back" />
      <rect x="38" y="32" width="52" height="40" rx="3" className="gd-art__sheet" />
      <path d="M46 44 H80 M46 52 H80 M46 60 H68" className="gd-art__sheet-rule" />
      <path d="M96 72 C96 58 92 52 86 48" className="gd-art__stem" />
      <path d="M90 56 C84 54 82 50 84 46 C89 48 91 52 90 56 Z" className="gd-art__leaf" />
      <path d="M95 62 C101 60 104 56 102 51 C97 53 95 57 95 62 Z" className="gd-art__leaf" />
    </svg>
  );
}
