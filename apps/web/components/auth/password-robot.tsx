'use client';

import { useEffect, useState } from 'react';

/**
 * The login mascot: a little robot that covers its eyes whenever ANY password
 * field on the page is focused, and peeks again when you leave it. It listens to
 * document focus events (not the form's internals), so it works on /login and
 * /register without touching the auth logic. Decorative and aria-hidden.
 */
export function PasswordRobot() {
  const [covering, setCovering] = useState(false);

  useEffect(() => {
    const isPassword = (t: EventTarget | null): t is HTMLInputElement =>
      t instanceof HTMLInputElement && t.type === 'password';
    const onIn = (e: FocusEvent) => {
      if (isPassword(e.target)) setCovering(true);
    };
    const onOut = (e: FocusEvent) => {
      if (isPassword(e.target)) setCovering(false);
    };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
    };
  }, []);

  return (
    <div className={`auth-bot${covering ? ' is-cover' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 150 128" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="auth-bot-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff8a1a" />
            <stop offset="1" stopColor="#fbbf24" />
          </linearGradient>
        </defs>

        {/* antenna */}
        <line x1="75" y1="20" x2="75" y2="9" stroke="url(#auth-bot-g)" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="75" cy="6" r="4.5" fill="#fbbf24" />

        {/* head */}
        <rect x="30" y="20" width="90" height="72" rx="22" fill="#241708" stroke="url(#auth-bot-g)" strokeWidth="3" />
        <rect x="42" y="34" width="66" height="44" rx="16" fill="#0d0803" />

        {/* open eyes */}
        <circle className="auth-bot__eye" cx="60" cy="56" r="7" fill="#fbbf24" />
        <circle className="auth-bot__eye" cx="90" cy="56" r="7" fill="#fbbf24" />
        {/* closed eyes (shown while covering) */}
        <path className="auth-bot__lid" d="M52 56c4 5 12 5 16 0" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
        <path className="auth-bot__lid" d="M82 56c4 5 12 5 16 0" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />

        {/* smile */}
        <path d="M64 72c4 3 18 3 22 0" stroke="#ff5a3c" strokeWidth="3" strokeLinecap="round" />

        {/* hands that slide up to cover the eyes */}
        <g className="auth-bot__hands">
          <circle cx="52" cy="104" r="13" fill="#241708" stroke="url(#auth-bot-g)" strokeWidth="3" />
          <circle cx="98" cy="104" r="13" fill="#241708" stroke="url(#auth-bot-g)" strokeWidth="3" />
        </g>
      </svg>
    </div>
  );
}
