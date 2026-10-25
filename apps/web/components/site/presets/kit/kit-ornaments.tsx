import type { KitPreset } from './kit-preset';

/**
 * The drawn things that make each kit preset itself, and nothing else.
 *
 * Every shape here is `aria-hidden` decoration in `currentColor`: the
 * stylesheet decides the colour from the stack's own ramp, so a teacher who
 * moves their hue moves the gold-on-teal of «الرقعة» or the ink of
 * «الكرّاسة» with it. Paths that animate carry `pathLength="1"` so one
 * `stroke-dasharray: 1` in CSS draws any of them on, whatever its real
 * length.
 */

/**
 * «۞» — two squares turned 45° to each other, the eight-pointed star of the
 * Rub el Hizb. The one motif the calligraphic preset is built on: the hero's
 * tiled field, the heading divider and the frame's corners are all this star.
 */
function Star({ size = 80, className }: { size?: number; className?: string }) {
  const c = size / 2;
  const r = size * 0.36;
  const d = r * Math.SQRT1_2;
  return (
    <g className={className}>
      <polygon
        points={`${c},${c - r} ${c + r},${c} ${c},${c + r} ${c - r},${c}`}
        pathLength={1}
      />
      <polygon
        points={`${c - d},${c - d} ${c + d},${c - d} ${c + d},${c + d} ${c - d},${c + d}`}
        pathLength={1}
      />
      <circle cx={c} cy={c} r={r * 0.42} pathLength={1} />
    </g>
  );
}

/** The tiled star field behind «الرقعة»'s opener, drawn on once at load. */
export function RuqaaField() {
  return (
    <svg className="pk-orn pk-orn--field" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="pk-ruqaa-tile" width="96" height="96" patternUnits="userSpaceOnUse">
          <Star size={96} />
          <path d="M0 48h12M84 48h12M48 0v12M48 84v12" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#pk-ruqaa-tile)" />
    </svg>
  );
}

/** One star between a heading and its lead — the manuscript's section mark. */
export function RuqaaDivider() {
  return (
    <svg className="pk-orn pk-orn--divider" viewBox="0 0 160 24" aria-hidden="true" focusable="false">
      <path d="M0 12h58M102 12h58" pathLength={1} />
      <g transform="translate(68 0)">
        <Star size={24} />
      </g>
    </svg>
  );
}

/** The arch's outline around the portrait — drawn on with the field. */
export function RuqaaArch() {
  return (
    <svg className="pk-orn pk-orn--arch" viewBox="0 0 300 400" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path className="pk-draw" d="M14 396V170C14 82 76 22 150 10c74 12 136 72 136 160v226" pathLength={1} />
      <path className="pk-draw pk-draw--late" d="M30 396V174C30 96 84 42 150 30c66 12 120 66 120 144v222" pathLength={1} />
    </svg>
  );
}

/** «الكرّاسة»'s pencil marks: a scribbled underline and a star in the margin. */
export function KurrasaDoodles() {
  return (
    <svg className="pk-orn pk-orn--doodles" viewBox="0 0 400 300" aria-hidden="true" focusable="false">
      <path
        className="pk-draw"
        d="M60 70c10-18 22 6 32-10s20 8 28-6M70 40l4 12 12 2-10 7 3 12-9-7-10 6 4-12-9-8h12z"
        pathLength={1}
      />
      <path
        className="pk-draw pk-draw--late"
        d="M300 230c30 10 52-8 50-30-2-20-30-22-36-4-6 16 18 30 40 18"
        pathLength={1}
      />
    </svg>
  );
}

/** The hand-drawn check in front of each «ليه هنا» line on «الكرّاسة». */
export function KurrasaCheck() {
  return (
    <svg className="pk-check" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M5 17c4 2 6 6 8 9 4-9 9-15 15-20" pathLength={1} />
    </svg>
  );
}

/**
 * The preset's signature behind the opener. `taif` draws its colour field in
 * CSS alone (a conic gradient turning on a registered property), so it has no
 * markup here.
 */
export function HeroOrnament({ preset }: { preset: KitPreset }) {
  if (preset === 'ruqaa') return <RuqaaField />;
  if (preset === 'kurrasa') return <KurrasaDoodles />;
  return (
    <div className="pk-orn pk-orn--field" aria-hidden="true">
      <span className="pk-orb pk-orb--a" />
      <span className="pk-orb pk-orb--b" />
      <span className="pk-orb pk-orb--c" />
    </div>
  );
}
