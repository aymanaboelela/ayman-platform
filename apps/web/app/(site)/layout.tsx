import { SmoothScroll } from '@/components/motion/smooth-scroll';
import { SiteNav } from '@/components/site/site-nav';
import { SiteFooter } from '@/components/site/site-footer';
import './styles/theme.css';
import './styles/media.css';
import './styles/sections.css';
import './styles/pages.css';

/**
 * The public marketing shell: landing, catalog, year listings, essentials.
 *
 * Everything here is deliberately absent from `(app)` and `(admin)` — momentum
 * scrolling under a graded quiz attempt or a long admin table is a liability,
 * and the orange marketing palette has no business overriding the product's
 * neutral surfaces.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site">
      <SmoothScroll />
      <SiteNav />
      {children}
      <SiteFooter />
    </div>
  );
}
