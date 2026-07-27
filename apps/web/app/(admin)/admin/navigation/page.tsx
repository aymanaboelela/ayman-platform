import { NavigationTreeSchema } from '@ayman/contracts/admin/navigation';
import { copy } from '@ayman/contracts';
import { adminGet } from '@/lib/admin-api';
import { getSession } from '@/lib/session';
import { NavEditor } from './nav-editor';

export const metadata = { title: copy.admin.navigation.title };

/** Uncached — an editor must see their own write immediately, drafts included. */
export default async function NavigationPage() {
  const [tree, session] = await Promise.all([
    adminGet('/api/admin/navigation', NavigationTreeSchema),
    getSession(),
  ]);

  return (
    <>
      <h1 className="mb-4 text-[length:var(--fs-title-2)] font-semibold text-fg">
        {copy.admin.navigation.title}
      </h1>
      <p className="mb-24 max-w-[var(--w-prose)] text-fg-muted">{copy.admin.navigation.lead}</p>

      <NavEditor tree={tree} permissionOptions={session?.permissions ?? []} />
    </>
  );
}
