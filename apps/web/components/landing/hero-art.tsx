/**
 * The friendly hero illustration — the "بسطتهالك" idea (a figure over organic
 * blue blobs with floating icons) rendered as our own SVG scene, adapted to a
 * programming platform: soft blobs, a rounded code window, and playful floating
 * badges (cap, brackets, play, star). No photo, no external asset — all vector,
 * so it is crisp at any size and themeable. Float animations are pure CSS and
 * are frozen under `prefers-reduced-motion` (see landing.css). A drop-in slot
 * is left for a real photo later if the founder sends one.
 */
export function HeroArt() {
  return (
    <div className="lp-art" aria-hidden="true">
      <svg viewBox="0 0 480 440" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* organic blobs */}
        <path
          className="lp-blob lp-blob--a"
          d="M262 44c92 6 156 74 150 168-6 86-72 150-168 152-98 2-176-64-186-158C48 116 148 38 262 44Z"
          fill="#d7e6ff"
        />
        <path
          className="lp-blob lp-blob--b"
          d="M180 110c78-26 176-8 196 66 18 66-28 138-108 160-78 22-160-8-186-78-28-74 24-122 98-148Z"
          fill="#cbeef7"
        />

        {/* floating badges */}
        <g className="lp-float-a">
          <circle cx="86" cy="120" r="30" fill="#2b7fff" />
          {/* graduation cap */}
          <path d="M70 116l16-7 16 7-16 7Z" fill="#fff" />
          <path d="M78 121v9c0 4 16 4 16 0v-9" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M102 116v9" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        </g>

        <g className="lp-float-b">
          <rect x="360" y="86" width="60" height="60" rx="18" fill="#ffd15c" />
          {/* code brackets */}
          <path d="M384 104l-8 12 8 12M396 104l8 12-8 12" stroke="#0f2143" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        <g className="lp-float-a" style={{ animationDelay: '-1.4s' }}>
          <circle cx="392" cy="300" r="26" fill="#12b886" />
          {/* play */}
          <path d="M387 291l12 9-12 9Z" fill="#fff" />
        </g>

        <g className="lp-float-b" style={{ animationDelay: '-0.8s' }}>
          <rect x="70" y="300" width="54" height="54" rx="16" fill="#ff6b5e" />
          {/* star */}
          <path d="M97 314l4 8 9 1-6.5 6 1.6 9-8.1-4.3-8.1 4.3 1.6-9-6.5-6 9-1Z" fill="#fff" />
        </g>

        {/* sparkles */}
        <circle className="lp-twinkle" cx="330" cy="60" r="4" fill="#2b7fff" />
        <circle className="lp-twinkle" cx="48" cy="230" r="5" fill="#ffd15c" style={{ animationDelay: '-0.9s' }} />
        <circle className="lp-twinkle" cx="430" cy="200" r="4" fill="#ff6b5e" style={{ animationDelay: '-1.6s' }} />
      </svg>
    </div>
  );
}
