import Link from 'next/link';
import { copy } from '@ayman/contracts';

const c = copy.landing;

export function SiteFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-shell lp-footer__grid">
        <div className="lp-footer__brand">
          <span className="lp-brand">
            منصة <b>{copy.site.name}</b>
          </span>
          <p className="lp-footer__tag">{c.footerTagline}</p>
          <p className="lp-footer__rights">{c.footerRights}</p>
        </div>

        <nav className="lp-footer__col" aria-label={c.footerPages}>
          <h4 className="lp-footer__h">{c.footerPages}</h4>
          <Link href="/">{c.footerHome}</Link>
          <Link href="/register">{c.footerRegister}</Link>
          <Link href="/login">{c.footerLogin}</Link>
          <Link href="/courses">{c.coursesCta}</Link>
        </nav>

        <div className="lp-footer__col">
          <h4 className="lp-footer__h">{c.footerContact}</h4>
          <a href="https://wa.me/" target="_blank" rel="noopener noreferrer">
            واتساب
          </a>
          <a href="https://youtube.com/" target="_blank" rel="noopener noreferrer">
            يوتيوب
          </a>
          <a href="https://facebook.com/" target="_blank" rel="noopener noreferrer">
            فيسبوك
          </a>
        </div>
      </div>
    </footer>
  );
}
