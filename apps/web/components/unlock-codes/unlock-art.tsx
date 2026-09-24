/**
 * The «كود الكورس» illustration: a printed ticket carrying a six-character
 * code, an open padlock riding its corner, and a few sparkles.
 *
 * Drawn here rather than downloaded: every paint is a class in
 * `unlock-codes.css`, so it takes the tenant's brand hue and the dark theme
 * the way the rest of the page does — a stock image would be one tenant's
 * orange on every stack. Purely decorative, so it is hidden from assistive
 * tech; the page's heading already says what it is.
 */
export function UnlockArt({ className }: { className?: string }) {
  const chars = ['K', '7', 'M', '2', 'Q', 'X'];
  return (
    <svg
      viewBox="0 0 320 230"
      className={`uc-art ${className ?? ''}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="uc-ticket-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" className="uc-art__stop-a" />
          <stop offset="100%" className="uc-art__stop-b" />
        </linearGradient>
      </defs>

      <circle className="uc-art__glow" cx="160" cy="120" r="104" />

      {/* The ticket, with a notch cut into each end. */}
      <g transform="rotate(-6 160 125)">
        <path
          className="uc-art__ticket"
          d="M58 66 H262 a18 18 0 0 1 18 18 V108 a16 16 0 0 0 0 32 V164 a18 18 0 0 1 -18 18 H58 a18 18 0 0 1 -18 -18 V140 a16 16 0 0 0 0 -32 V84 a18 18 0 0 1 18 -18 Z"
        />
        <path
          className="uc-art__edge"
          d="M64 76 H256 a12 12 0 0 1 12 12 V160 a12 12 0 0 1 -12 12 H64 a12 12 0 0 1 -12 -12 V88 a12 12 0 0 1 12 -12 Z"
        />
        <line className="uc-art__perf" x1="92" y1="80" x2="92" y2="168" />
        {chars.map((char, index) => {
          const x = 106 + index * 26;
          return (
            <g key={char + String(index)}>
              <rect className="uc-art__slot" x={x} y="108" width="21" height="30" rx="6" />
              <text className="uc-art__char" x={x + 10.5} y="129" textAnchor="middle">
                {char}
              </text>
            </g>
          );
        })}
        {/* A small ✓ tag on the stub — «done» before anything is typed. */}
        <circle className="uc-art__tag" cx="71" cy="124" r="13" />
        <path className="uc-art__tick" d="M65 124.5 l4.2 4.2 l7.8 -8.4" />
      </g>

      {/* The padlock, shackle swung open. */}
      <path className="uc-art__shackle" d="M248 58 V42 a22 22 0 0 1 41 -10" />
      <rect className="uc-art__lock" x="232" y="56" width="62" height="50" rx="12" />
      <circle className="uc-art__keyhole" cx="263" cy="76" r="7" />
      <rect className="uc-art__keyhole" x="260" y="78" width="6" height="14" rx="3" />

      {/* Sparkles and confetti. */}
      <path className="uc-art__spark-1" d="M44 42 l4 11 l11 4 l-11 4 l-4 11 l-4 -11 l-11 -4 l11 -4 Z" />
      <path className="uc-art__spark-2" d="M288 164 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 Z" />
      <path className="uc-art__spark-3" d="M150 16 l2.5 7 l7 2.5 l-7 2.5 l-2.5 7 l-2.5 -7 l-7 -2.5 l7 -2.5 Z" />
      <circle className="uc-art__dot-1" cx="30" cy="160" r="6" />
      <circle className="uc-art__dot-2" cx="212" cy="206" r="5" />
      <circle className="uc-art__dot-3" cx="98" cy="208" r="4" />
      <rect className="uc-art__dot-2" x="200" y="18" width="9" height="9" rx="2" transform="rotate(20 204 22)" />
      <rect className="uc-art__dot-1" x="18" y="98" width="8" height="8" rx="2" transform="rotate(-15 22 102)" />
    </svg>
  );
}
