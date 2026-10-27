import { cn } from '@ayman/ui/lib/cn';

/**
 * A gift box opening, two coins flying out of it — the band's picture.
 * Decorative (`aria-hidden`); every paint is a class in `referrals.css`, so
 * the tenant hue and the dark theme apply without a second drawing.
 */
export function InviteArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 200" className={cn('rf-art', className)} aria-hidden="true" focusable="false">
      <circle className="rf-art__glow" cx="120" cy="108" r="90" />
      <g className="rf-art__coin-a">
        <circle className="rf-art__coin" cx="62" cy="46" r="16" />
        <circle className="rf-art__coin-mark" cx="62" cy="46" r="8" />
      </g>
      <g className="rf-art__coin-b">
        <circle className="rf-art__coin" cx="182" cy="40" r="20" />
        <circle className="rf-art__coin-mark" cx="182" cy="40" r="10" />
      </g>
      <rect className="rf-art__box" x="52" y="104" width="136" height="80" rx="14" />
      <rect className="rf-art__lid" x="42" y="80" width="156" height="32" rx="10" transform="rotate(-7 120 96)" />
      <rect className="rf-art__ribbon" x="110" y="104" width="20" height="80" />
      <rect className="rf-art__ribbon" x="110" y="80" width="20" height="32" transform="rotate(-7 120 96)" />
      <path className="rf-art__bow" d="M120 80c-14-22-40-20-36-4 3 12 22 10 36 4zM120 80c14-22 40-20 36-4-3 12-22 10-36 4z" />
      <circle className="rf-art__spark" cx="34" cy="96" r="4" />
      <circle className="rf-art__spark" cx="210" cy="104" r="5" />
      <circle className="rf-art__spark" cx="150" cy="22" r="3" />
    </svg>
  );
}
