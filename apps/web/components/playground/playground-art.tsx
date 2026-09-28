/**
 * The hero's drawing: a browser window showing a small colourful page, an
 * editor in front of it typing coloured lines, and a terminal chip with a
 * blinking prompt — the three things the page underneath actually does.
 *
 * Drawn rather than a picture, for the same three reasons as `/rank`'s cup: it
 * takes its colours from the chart tokens (so dark mode and every tenant's
 * palette just work), it names nobody (no teacher, no photo — safe on any
 * stack), and it weighs less than one small PNG. Purely decorative, so it is
 * hidden from assistive tech; the copy beside it says everything it shows.
 *
 * Motion is CSS only (`playground.css`), inside `prefers-reduced-motion:
 * no-preference`.
 */
export function PlaygroundArt() {
  return (
    <svg
      className="pg-art"
      viewBox="0 0 320 240"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="pg-art__halo" cx="170" cy="120" r="112" />
      <circle className="pg-art__halo" cx="170" cy="120" r="78" />

      {/* Browser window, behind. */}
      <g className="pg-art__float">
        <rect className="pg-art__win" x="118" y="26" width="178" height="132" rx="10" />
        <path className="pg-art__win-bar" d="M118 36a10 10 0 0 1 10-10h158a10 10 0 0 1 10 10v10H118z" />
        <circle className="pg-art__dot--r" cx="131" cy="37" r="3.5" />
        <circle className="pg-art__dot--y" cx="142" cy="37" r="3.5" />
        <circle className="pg-art__dot--g" cx="153" cy="37" r="3.5" />
        <rect className="pg-art__banner" x="130" y="56" width="154" height="40" rx="6" />
        <rect className="pg-art__banner-2" x="142" y="66" width="62" height="7" rx="3.5" />
        <rect className="pg-art__win" x="142" y="79" width="40" height="7" rx="3.5" opacity="0.8" />
        <rect className="pg-art__tile" x="130" y="104" width="46" height="42" rx="6" />
        <rect className="pg-art__tile pg-art__tile--b" x="184" y="104" width="46" height="42" rx="6" />
        <rect className="pg-art__tile pg-art__tile--c" x="238" y="104" width="46" height="42" rx="6" />
      </g>

      {/* Editor, in front. */}
      <g className="pg-art__float pg-art__float--late">
        <rect className="pg-art__ink" x="22" y="92" width="170" height="118" rx="10" />
        <path className="pg-art__ink-bar" d="M22 102a10 10 0 0 1 10-10h150a10 10 0 0 1 10 10v8H22z" />
        <circle className="pg-art__dot--r" cx="35" cy="101" r="3.5" />
        <circle className="pg-art__dot--y" cx="46" cy="101" r="3.5" />
        <circle className="pg-art__dot--g" cx="57" cy="101" r="3.5" />
        <line className="pg-art__line pg-art__line--1" x1="40" y1="128" x2="104" y2="128" />
        <line className="pg-art__line pg-art__line--2" x1="56" y1="144" x2="150" y2="144" />
        <line className="pg-art__line pg-art__line--3" x1="56" y1="160" x2="122" y2="160" />
        <line className="pg-art__line pg-art__line--4" x1="40" y1="176" x2="88" y2="176" />
        <line className="pg-art__line pg-art__line--5" x1="40" y1="192" x2="132" y2="192" />
        <rect className="pg-art__cursor" x="138" y="186" width="3" height="12" rx="1" />
      </g>

      {/* Terminal chip. */}
      <g className="pg-art__float">
        <rect className="pg-art__ink" x="206" y="170" width="92" height="40" rx="8" />
        <path className="pg-art__prompt" d="M218 183l8 7-8 7" strokeWidth="3.5" />
        <rect className="pg-art__term-text" x="232" y="193" width="16" height="3.5" rx="1.75" />
        <rect className="pg-art__cursor" x="252" y="184" width="3" height="12" rx="1" />
      </g>

      <path className="pg-art__spark" d="M300 14l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" />
      <path className="pg-art__spark" d="M20 50l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
      <path className="pg-art__spark" d="M108 8l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
      <path className="pg-art__spark" d="M306 214l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
    </svg>
  );
}
