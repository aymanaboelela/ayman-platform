/**
 * A laurel wreath, drawn — the one ornament on لوحة الشرف.
 *
 * Lucide has a trophy and a medal but no wreath, and a wreath is the mark that
 * reads «تكريم» rather than «مسابقة»: it frames a name instead of ranking it.
 * The leaves are computed once at module load (pure arithmetic, no client
 * code) so the board stays a server-rendered page with no JavaScript.
 *
 * It paints in `currentColor`, so the place that uses it picks the metal.
 */
const LEAVES = Array.from({ length: 7 }, (_, i) => {
  // Along the left half of a circle, from the stem at the bottom up to the
  // tip at the top-left. Alternate leaves sit a little in and out of the arc,
  // which is what makes it read as a branch and not a dotted line.
  const theta = 100 + i * 17.5;
  const rad = (theta * Math.PI) / 180;
  const r = 44 + (i % 2 === 0 ? 5 : -5);
  return {
    cx: 60 + r * Math.cos(rad),
    cy: 60 + r * Math.sin(rad),
    // Long axis along the branch, tilted outward by 30°.
    rotate: theta - 30,
    ry: 9 - i * 0.6,
  };
});

function Branch() {
  return (
    <g>
      <path d="M58 112 A 48 48 0 0 1 22 30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {LEAVES.map((leaf, i) => (
        <ellipse
          key={i}
          cx={leaf.cx}
          cy={leaf.cy}
          rx={3.6}
          ry={leaf.ry}
          fill="currentColor"
          transform={`rotate(${leaf.rotate} ${leaf.cx} ${leaf.cy})`}
        />
      ))}
    </g>
  );
}

export function HonorLaurel({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <Branch />
      <g transform="translate(120 0) scale(-1 1)">
        <Branch />
      </g>
    </svg>
  );
}
