import { notFound, redirect } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { reservationsCopy } from '@ayman/contracts/copy/center-reservations';
import { SignOutButton } from '@/components/sign-out-button';
import { featureEnabled } from '@/lib/entitlements';
import { can, getSession } from '@/lib/session';
import { privateRouteMetadata } from '@/lib/seo/metadata';

const t = reservationsCopy.portal;

export const metadata = { ...privateRouteMetadata, title: t.title };

/**
 * «لوحة السنتر» — a centre owner's whole world: a top bar, their centre's
 * reservations, a way out.
 *
 * Its own shell for the montage editor's reason (`(montage)/layout.tsx`): a
 * `center_manager` holds `center-portal:read` and nothing else, so the
 * dashboard 404s for them. This layout only decides what renders; the API's
 * permission, its `center_managers` lookup and `@RequireFeature` are the lock.
 */
export default async function CenterLayout({ children }: { children: React.ReactNode }) {
  if (!(await featureEnabled('centerReservations'))) notFound();
  const session = await getSession();
  if (!session) redirect('/login');
  if (!can(session, 'center-portal:read')) notFound();

  return (
    <div className="product-type min-h-dvh bg-surface-1">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-[linear-gradient(90deg,color-mix(in_oklab,var(--viz-2)_16%,transparent),color-mix(in_oklab,var(--a-9)_12%,transparent)),var(--n-2)] px-4 py-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-md bg-[linear-gradient(135deg,var(--viz-2),var(--viz-3))] text-[color:var(--ink-fg)]"
        >
          <Building2 className="size-5" />
        </span>
        <span className="whitespace-nowrap font-bold text-fg">{t.title}</span>
        <span className="ms-auto truncate text-[length:var(--fs-text-sm)] text-fg-muted">{session.name}</span>
        {can(session, 'admin:access') ? (
          <a
            href="/admin/centers/reservations"
            className="inline-flex h-10 items-center rounded-md border border-line bg-surface-3 px-3 text-[length:var(--fs-text-sm)] whitespace-nowrap text-fg hover:bg-surface-4"
          >
            {reservationsCopy.admin.nav}
          </a>
        ) : null}
        <SignOutButton className="w-auto shrink-0 border border-line" />
      </header>
      <main className="mx-auto max-w-[var(--w-shell)] p-4">{children}</main>
    </div>
  );
}
