import { notFound, redirect } from 'next/navigation';
import { AppSidebar } from '@/components/admin/app-sidebar';
import { AdminHeader } from '@/components/admin/admin-header';
import { can, getSession } from '@/lib/session';
import { privateRouteMetadata } from '@/lib/seo/metadata';

/** Never indexed. See `(app)/layout.tsx` for why `robots.txt` alone is not enough. */
export const metadata = privateRouteMetadata;

/**
 * `proxy.ts` (`PROTECTED_PREFIXES` includes `/admin`) is what keeps an
 * anonymous visitor out before this even renders. NestJS's deny-by-default
 * guard + `resource:action` permissions is what actually keeps a non-admin
 * out even with a valid session — this layout only decides what gets
 * rendered, it is not a security boundary.
 *
 * The admin is never prerendered and never cached: `getSession()` reads
 * `headers()`, which forces this whole subtree dynamic. That is the intent —
 * an admin screen served from a cache is indistinguishable from a lost write.
 *
 * The `sonner` <Toaster/> used to be mounted HERE. (app) and (admin) are
 * SIBLING route groups — this layout is not an ancestor of `/quizzes/*`, so
 * every failure toast a student could hit during a graded attempt (a failed
 * autosave, a failed auto-submit at the buzzer) rendered nothing at all
 * (B5). It now lives once in the root layout (`app/layout.tsx`), which is
 * an ancestor of every route group. Do not add a second mount here — two
 * mounts render every toast twice.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!session) redirect('/login');

  // notFound(), not a 403 page: a 403 confirms the admin area exists at this
  // path. A student poking at /admin should learn nothing beyond "not found".
  // The API guard is still the real gate — this only decides what renders.
  if (!can(session, 'admin:access')) notFound();

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[var(--admin-sidebar-w)_1fr]">
      <AppSidebar permissions={session.permissions} />
      <div className="flex min-w-0 flex-col">
        <AdminHeader email={session.email} permissions={session.permissions} />
        {/*
          16px / 24px. This was `p-16 md:p-24`, i.e. 64px / 96px — Tailwind's
          spacing scale is a 0.25rem multiplier, not a pixel value, and the
          whole admin surface was authored as though `p-16` meant 16px. Every
          admin screen inherited a 96px frame from this one line.
        */}
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
