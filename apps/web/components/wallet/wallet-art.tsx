import { cn } from '@ayman/ui/lib/cn';

/**
 * A wallet with money coming out of it — the band's picture. Decorative
 * (`aria-hidden`); every paint is a class in `wallet.css`, so the tenant hue
 * and the dark theme apply without a second drawing.
 */
export function WalletArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 200" className={cn('wl-art', className)} aria-hidden="true" focusable="false">
      <circle className="wl-art__glow" cx="120" cy="104" r="92" />
      <rect className="wl-art__note" x="62" y="34" width="112" height="62" rx="10" transform="rotate(-10 118 65)" />
      <rect className="wl-art__note-2" x="74" y="42" width="112" height="62" rx="10" transform="rotate(6 130 73)" />
      <rect className="wl-art__back" x="34" y="72" width="172" height="104" rx="18" />
      <rect className="wl-art__body" x="34" y="86" width="172" height="96" rx="18" />
      <path className="wl-art__flap" d="M150 110h56v40h-56a20 20 0 0 1 0-40z" />
      <circle className="wl-art__clasp" cx="160" cy="130" r="8" />
      <circle className="wl-art__dot" cx="160" cy="130" r="3.5" />
      <g className="wl-art__coin-2">
        <circle className="wl-art__coin" cx="196" cy="58" r="17" />
        <path className="wl-art__coin-mark" d="M196 49v18M190 53h9a4 4 0 0 1 0 8h-6a4 4 0 0 0 0 8h9" />
      </g>
      <g className="wl-art__coin-3">
        <circle className="wl-art__coin" cx="40" cy="48" r="13" />
        <path className="wl-art__coin-mark" d="M40 41v14" />
      </g>
    </svg>
  );
}
