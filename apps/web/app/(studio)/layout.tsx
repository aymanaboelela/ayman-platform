import { notFound, redirect } from 'next/navigation';
import { Brush } from 'lucide-react';
import { designsCopy } from '@ayman/contracts/copy/designs';
import { SignOutButton } from '@/components/sign-out-button';
import { can, getSession } from '@/lib/session';
import { privateRouteMetadata } from '@/lib/seo/metadata';
import { IS_AYMAN } from '@/lib/tenant';
import '@/components/designs/design-studio.css';

export const metadata = { ...privateRouteMetadata, title: designsCopy.title };

/**
 * The designer's whole world: a top bar, the studio, a way out.
 *
 * Its own shell rather than the admin one on purpose. A `designer` holds
 * `design:read`/`design:write` and nothing else — no `admin:access` — so the
 * dashboard 404s for them, and there is no sidebar of things they cannot open.
 * This layout only decides what renders; the API's per-route permission is
 * the lock (`layout-is-not-an-auth-boundary`), and every read below goes
 * through it with the visitor's own cookie.
 */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  if (!IS_AYMAN) notFound();
  const session = await getSession();
  if (!session) redirect('/login');
  if (!can(session, 'design:read')) notFound();

  return (
    <div className="ds-shell product-type">
      <header className="ds-topbar">
        <span className="ds-topbar__mark" aria-hidden="true">
          <Brush className="size-5" />
        </span>
        <span className="ds-topbar__title">{designsCopy.title}</span>
        <span className="ds-topbar__who">{session.name}</span>
        {can(session, 'admin:access') ? (
          <a href="/admin/designs" className="ds-linkbtn">
            {designsCopy.nav}
          </a>
        ) : null}
        <SignOutButton className="w-auto shrink-0 border border-line" />
      </header>
      <main className="ds-shell__main">{children}</main>
    </div>
  );
}
