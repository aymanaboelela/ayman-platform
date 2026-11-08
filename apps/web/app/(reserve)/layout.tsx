import './reserve.css';

/**
 * «الحجز» — the public reservation page's own shell.
 *
 * A group of its own for the bio-link page's reason (`(link)/layout.tsx`):
 * this is a page opened cold from a link on a phone, usually on mobile data,
 * by someone with no account. `(site)` would mount the nav, the footer, Lenis
 * and the WebGL cursor on top of a three-step form whose whole job is to be
 * finished with one thumb. Fonts, `dir="rtl"`, the theme and every token still
 * come from the root layout.
 */
export default function ReserveLayout({ children }: { children: React.ReactNode }) {
  return <div className="rsv-shell">{children}</div>;
}
