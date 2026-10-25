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

/** «السبّورة»'s chalk marks: an arrow toward the buttons and two stars, kept clear of the copy and the art. */
export function SabbooraChalk() {
  return (
    <svg className="pk-orn pk-orn--chalk" viewBox="0 0 1000 500" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path className="pk-draw" d="M170 470c70 18 160 12 230-18m0 0-30-4m30 4-16 24" pathLength={1} />
      <path className="pk-draw pk-draw--late" d="M60 60l9 26 27 1-21 17 8 26-23-15-22 15 8-26-21-17 27-1z" pathLength={1} />
      <path className="pk-draw pk-draw--late" d="M930 440l5 14 15 1-12 9 5 14-13-8-12 8 4-14-11-9 15-1z" pathLength={1} />
    </svg>
  );
}

/** «الرحلة»'s road: one winding route across the opener, pinned at both ends. */
export function RihlaRoad() {
  return (
    <svg className="pk-orn pk-orn--road" viewBox="0 0 1200 500" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {/* Along the foot of the opener only, under the copy, never through it. */}
      <path className="pk-road-bed" d="M1220 470C1040 470 960 420 800 440S560 490 400 460 160 410-20 440" />
      <path className="pk-draw pk-road-line" d="M1220 470C1040 470 960 420 800 440S560 490 400 460 160 410-20 440" pathLength={1} />
      <g className="pk-road-pin pk-road-pin--a" transform="translate(800 440)">
        <circle r="10" />
      </g>
      <g className="pk-road-pin pk-road-pin--b" transform="translate(400 460)">
        <circle r="10" />
      </g>
    </svg>
  );
}

/** «النجوم»'s sky: a crescent and a handful of four-point stars that twinkle. */
export function NujoomSky() {
  const stars = [
    [8, 18, 1], [22, 8, 0.7], [35, 30, 0.6], [52, 12, 0.9], [64, 26, 0.5],
    [78, 10, 0.8], [90, 22, 0.6], [14, 60, 0.5], [44, 70, 0.7], [70, 64, 0.6], [94, 74, 0.8],
  ] as const;
  return (
    <div className="pk-orn pk-orn--sky" aria-hidden="true">
      <svg className="pk-moon" viewBox="0 0 100 100" focusable="false">
        <path d="M62 10a42 42 0 1 0 28 72A36 36 0 1 1 62 10z" />
      </svg>
      {stars.map(([x, y, s], i) => (
        <span
          key={i}
          className="pk-star"
          style={{ insetInlineStart: `${x}%`, insetBlockStart: `${y}%`, scale: String(s), animationDelay: `${(i % 5) * 0.7}s` }}
        />
      ))}
    </div>
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
  if (preset === 'sabboora') return <SabbooraChalk />;
  if (preset === 'rihla') return <RihlaRoad />;
  if (preset === 'nujoom') return <NujoomSky />;
  return (
    <div className="pk-orn pk-orn--field" aria-hidden="true">
      <span className="pk-orb pk-orb--a" />
      <span className="pk-orb pk-orb--b" />
      <span className="pk-orb pk-orb--c" />
    </div>
  );
}
