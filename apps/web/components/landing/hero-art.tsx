/**
 * The friendly hero illustration — our OWN vector scene (not a copy of any
 * platform's photo or layout): soft warm blobs, a rounded code window, and
 * playful floating badges (cap, brackets, play, star). All-orange identity, so
 * it stands on its own. Float animations are pure CSS and frozen under
 * `prefers-reduced-motion` (see landing.css). A drop-in slot is left for a real
 * photo later if the founder sends one.
 */
export function HeroArt() {
  return (
    <div className="lp-art" aria-hidden="true">
      <svg viewBox="0 0 480 440" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* organic blobs */}
        <path
          className="lp-blob lp-blob--a"
          d="M262 44c92 6 156 74 150 168-6 86-72 150-168 152-98 2-176-64-186-158C48 116 148 38 262 44Z"
          fill="#ffe1c4"
        />
        <path
          className="lp-blob lp-blob--b"
          d="M180 110c78-26 176-8 196 66 18 66-28 138-108 160-78 22-160-8-186-78-28-74 24-122 98-148Z"
          fill="#ffedcf"
        />

        {/* central code window */}
        <g className="lp-float-slow">
          <rect x="118" y="126" width="244" height="188" rx="20" fill="#ffffff" stroke="#2a1c12" strokeWidth="2.5" />
          <path d="M118 146a20 20 0 0 1 20-20h204a20 20 0 0 1 20 20v16H118Z" fill="#fff2e6" />
          <circle cx="140" cy="144" r="4.5" fill="#ff4d3d" />
          <circle cx="156" cy="144" r="4.5" fill="#ffb020" />
          <circle cx="172" cy="144" r="4.5" fill="#ff7a18" />
          {/* code lines */}
          <rect x="140" y="184" width="40" height="9" rx="4.5" fill="#ff7a18" />
          <rect x="188" y="184" width="66" height="9" rx="4.5" fill="#2a1c12" opacity="0.26" />
          <rect x="158" y="206" width="52" height="9" rx="4.5" fill="#e8620a" />
          <rect x="218" y="206" width="46" height="9" rx="4.5" fill="#2a1c12" opacity="0.26" />
          <rect x="158" y="228" width="36" height="9" rx="4.5" fill="#ffb020" />
          <rect x="140" y="250" width="30" height="9" rx="4.5" fill="#ff7a18" />
          <rect x="178" y="250" width="80" height="9" rx="4.5" fill="#2a1c12" opacity="0.26" />
          <rect x="140" y="272" width="22" height="9" rx="4.5" fill="#ff4d3d" />
        </g>

        {/* floating badges */}
        <g className="lp-float-a">
          <circle cx="86" cy="120" r="30" fill="#ff7a18" />
          {/* graduation cap */}
          <path d="M70 116l16-7 16 7-16 7Z" fill="#fff" />
          <path d="M78 121v9c0 4 16 4 16 0v-9" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M102 116v9" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        </g>

        <g className="lp-float-b">
          <rect x="360" y="86" width="60" height="60" rx="18" fill="#ffb020" />
          {/* code brackets */}
          <path d="M384 104l-8 12 8 12M396 104l8 12-8 12" stroke="#2a1c12" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        <g className="lp-float-a" style={{ animationDelay: '-1.4s' }}>
          <circle cx="392" cy="300" r="26" fill="#ff4d3d" />
          {/* play */}
          <path d="M387 291l12 9-12 9Z" fill="#fff" />
        </g>

        <g className="lp-float-b" style={{ animationDelay: '-0.8s' }}>
          <rect x="70" y="300" width="54" height="54" rx="16" fill="#e8620a" />
          {/* star */}
          <path d="M97 314l4 8 9 1-6.5 6 1.6 9-8.1-4.3-8.1 4.3 1.6-9-6.5-6 9-1Z" fill="#fff" />
        </g>

        {/* sparkles */}
        <circle className="lp-twinkle" cx="330" cy="60" r="4" fill="#ff7a18" />
        <circle className="lp-twinkle" cx="48" cy="230" r="5" fill="#ffb020" style={{ animationDelay: '-0.9s' }} />
        <circle className="lp-twinkle" cx="430" cy="200" r="4" fill="#ff4d3d" style={{ animationDelay: '-1.6s' }} />
      </svg>
    </div>
  );
}
