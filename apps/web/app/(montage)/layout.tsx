import { notFound, redirect } from 'next/navigation';
import { Clapperboard } from 'lucide-react';
import { montageCopy } from '@ayman/contracts/copy/montage';
import { SignOutButton } from '@/components/sign-out-button';
import { featureEnabled } from '@/lib/entitlements';
import { can, getSession } from '@/lib/session';
import { privateRouteMetadata } from '@/lib/seo/metadata';

export const metadata = { ...privateRouteMetadata, title: montageCopy.title };

/**
 * The video editor's whole world: a top bar, the hand-over list, a way out.
 *
 * Its own shell for the studio's reason (`(studio)/layout.tsx`): a
 * `video_editor` holds `montage:read`/`montage:write` and nothing else, so the
 * dashboard 404s for them. This layout only decides what renders; the API's
 * per-route permission and `@RequireFeature('montage')` are the lock.
 */
export default async function MontageLayout({ children }: { children: React.ReactNode }) {
  if (!(await featureEnabled('montage'))) notFound();
  const session = await getSession();
  if (!session) redirect('/login');
  if (!can(session, 'montage:read')) notFound();

  return (
    <div className="product-type min-h-dvh bg-surface-1">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-[linear-gradient(90deg,color-mix(in_oklab,var(--viz-3)_16%,transparent),color-mix(in_oklab,var(--viz-2)_14%,transparent)),var(--n-2)] px-4 py-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-md bg-[linear-gradient(135deg,var(--viz-3),var(--viz-4))] text-[color:var(--ink-fg)]"
        >
          <Clapperboard className="size-5" />
        </span>
        <span className="whitespace-nowrap font-bold text-fg">{montageCopy.title}</span>
        <span className="ms-auto truncate text-[length:var(--fs-text-sm)] text-fg-muted">{session.name}</span>
        {can(session, 'admin:access') ? (
          <a
            href="/admin/montage"
            className="inline-flex h-10 items-center rounded-md border border-line bg-surface-3 px-3 text-[length:var(--fs-text-sm)] whitespace-nowrap text-fg hover:bg-surface-4"
          >
            {montageCopy.nav}
          </a>
        ) : null}
        <SignOutButton className="w-auto shrink-0 border border-line" />
      </header>
      <main className="mx-auto max-w-[var(--w-shell)] p-4">{children}</main>
    </div>
  );
}
