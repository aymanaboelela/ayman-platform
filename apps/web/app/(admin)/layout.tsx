import { notFound, redirect } from 'next/navigation';
import { AppSidebar } from '@/components/admin/app-sidebar';
import { AdminHeader } from '@/components/admin/admin-header';
import { Toaster } from '@/components/toaster';
import { can, getSession } from '@/lib/session';

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
 * The `sonner` <Toaster/> is mounted HERE, once — Plan 5's quiz builder and
 * Plan 6's every-save-is-a-toast surfaces both assume exactly one mount in
 * the admin tree. Two mounts render every toast twice.
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
        <main className="min-w-0 flex-1 p-16 md:p-24">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
