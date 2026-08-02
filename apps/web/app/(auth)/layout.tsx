import type { ReactNode } from 'react';
import Link from 'next/link';
import { copy } from '@ayman/contracts';
import { BrandLockup } from '@/components/brand-lockup';
import { AuthShowcase } from '@/components/auth/auth-showcase';
import { privateRouteMetadata } from '@/lib/seo/metadata';
import './auth.css';

/**
 * `noindex` on /login and /register — and unlike `(app)`/`(admin)` these are
 * NOT in `robots.txt`, so this is the only thing keeping them out.
 *
 * That is deliberate: they must stay crawlable for the directive to be seen
 * at all (a disallowed page is never fetched, so its `noindex` is never
 * read). The reason to exclude them is competitive, not private — a sign-in
 * page carries the site name in its title and nothing else, and it routinely
 * outranks the landing page for the brand query. "منصة أيمن أبو العلا" must
 * resolve to the landing page, not to a password field.
 */
export const metadata = privateRouteMetadata;

/**
 * The shared shell for /login and /register: a split screen.
 *
 * Inline-start (the RIGHT half in this RTL document) is the form column. It
 * follows the theme through the ordinary `--n-*` surface tokens, so the inputs,
 * labels and borders here are the same objects the rest of the app uses — which
 * is what makes light mode work at all. Inline-end is `AuthShowcase`, a panel
 * that stays dark in both themes and collapses entirely below 62rem.
 *
 * This replaces the previous single centred card on a hard-coded dark gradient
 * with `color-scheme: dark` forced on the whole shell. That combination pinned
 * the browser's own form-control rendering to dark while the card inside it was
 * painted from the light palette, so /login was the one screen in the product
 * that was neither properly light nor properly dark.
 *
 * The mascot that used to sit above the card (a robot covering its eyes on
 * password focus) is gone with it — along with the client component and the
 * two document-level focus listeners it needed.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <main className="auth-pane">
        <div className="auth-pane__inner">
          <Link href="/" className="auth-brand-link" aria-label={copy.site.name}>
            <BrandLockup />
          </Link>
          {children}
        </div>
      </main>

      <AuthShowcase />
    </div>
  );
}
