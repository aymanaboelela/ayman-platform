import { Brain, Code2, Sparkles } from 'lucide-react';

/**
 * Dark hero visual (neon lab): the founder's photo in a glowing frame, a small
 * AI robot mascot beside it, an orbiting ring, and floating lucide icon chips
 * (code, brain, spark). Matches the reference programming/AI platform's hero
 * shape. Motion is CSS and freezes under reduced motion (landing.css).
 */
export function HeroArt() {
  return (
    <div className="lp-art">
      <span className="lp-art__ring" aria-hidden="true" />
      <span className="lp-art__glow" aria-hidden="true" />

      <img className="lp-photo" src="/team/ayman.jpg" alt="أ. أيمن أبو العيلة" />

      <RobotMascot />

      <span className="lp-chip lp-chip--1" aria-hidden="true" style={{ ['--c' as string]: 'var(--cyan)' }}>
        <Code2 size={22} strokeWidth={2.2} />
      </span>
      <span className="lp-chip lp-chip--2" aria-hidden="true" style={{ ['--c' as string]: 'var(--violet)' }}>
        <Brain size={22} strokeWidth={2.2} />
      </span>
      <span className="lp-chip lp-chip--3" aria-hidden="true" style={{ ['--c' as string]: 'var(--pink)' }}>
        <Sparkles size={20} strokeWidth={2.2} />
      </span>
    </div>
  );
}

function RobotMascot() {
  return (
    <svg className="lp-robot" viewBox="0 0 120 132" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="lp-bot" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      {/* antenna */}
      <line x1="60" y1="20" x2="60" y2="9" stroke="url(#lp-bot)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="60" cy="6" r="4" fill="#22d3ee" />
      {/* head */}
      <rect x="28" y="20" width="64" height="50" rx="18" fill="#1a1436" stroke="url(#lp-bot)" strokeWidth="2.5" />
      <rect x="37" y="30" width="46" height="30" rx="12" fill="#0a0715" />
      <circle cx="51" cy="45" r="5.5" fill="#22d3ee" />
      <circle cx="69" cy="45" r="5.5" fill="#22d3ee" />
      <path d="M52 55c3 3 13 3 16 0" stroke="#a855f7" strokeWidth="2.6" strokeLinecap="round" />
      {/* body */}
      <rect x="34" y="72" width="52" height="46" rx="16" fill="#1a1436" stroke="url(#lp-bot)" strokeWidth="2.5" />
      <circle cx="60" cy="92" r="7" fill="#a855f7" />
      <rect x="48" y="105" width="24" height="6" rx="3" fill="#2a2350" />
      {/* arms */}
      <rect x="20" y="78" width="9" height="26" rx="4.5" fill="#1a1436" stroke="url(#lp-bot)" strokeWidth="2" />
      <rect x="91" y="78" width="9" height="26" rx="4.5" fill="#1a1436" stroke="url(#lp-bot)" strokeWidth="2" />
    </svg>
  );
}
