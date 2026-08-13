import { Suspense } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { copy } from '@ayman/contracts';
import { BrandLockup } from '@/components/brand-lockup';
import { AuthShowcase } from '@/components/auth/auth-showcase';
import { privateRouteMetadata } from '@/lib/seo/metadata';
import './auth.css';
import { AssistantWidget } from '@/components/assistant/assistant-widget';

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
      {/*
        المساعد. Mounted per ROUTE GROUP, not at the root — and that is a
        boundary, not a preference.

        At the root it also rendered on the NOT-FOUND tree, which is the SAME
        tree Next renders when `(admin)/layout.tsx` calls `notFound()` on a
        student who reached `/admin/*`. The only difference between the two
        was `usePathname()`, so the launcher appeared on one and not the
        other — and `admin-publish-course.e2e.ts` caught it within a minute:
        that test asserts a student probing `/admin` gets output byte-identical
        to a route that does not exist, precisely so "forbidden" cannot be told
        apart from "absent". A visible button is a difference.

        Route-group layouts do not wrap that root tree, so mounting
        here means neither 404 carries the widget. `(admin)` has no mount at
        all — the instructor does not message himself.

        `<Suspense>` is REQUIRED: the widget reads `useSearchParams()` (a reply
        notification links to `?assistant=1`), and under `cacheComponents: true`
        an unsuspended search-param read makes every prerendered page a build
        error. `null` for a fallback — it renders nothing until hydration.
      */}
      <Suspense fallback={null}>
        <AssistantWidget />
      </Suspense>
    </div>
  );
}
