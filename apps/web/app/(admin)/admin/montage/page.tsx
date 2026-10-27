import { notFound } from 'next/navigation';
import { montageCopy } from '@ayman/contracts/copy/montage';
import { MontageInbox } from '@/components/montage/montage-inbox';
import { loadMontage } from '@/components/montage/load-montage';
import { MontageEditorsSchema } from '@ayman/contracts/montage';
import { adminGet } from '@/lib/admin-api';
import { featureEnabled } from '@/lib/entitlements';
import { can, getSession } from '@/lib/session';

export const metadata = { title: montageCopy.nav };

/**
 * «المونتاج» — the instructor's door into the editor's hand-overs: the same
 * list, plus «حطه في درس» on every finished video (`montage:publish`).
 */
export default async function AdminMontagePage() {
  if (!(await featureEnabled('montage'))) notFound();
  const session = await getSession();
  if (!can(session, 'montage:read')) notFound();
  const canPublish = can(session, 'montage:publish');
  const [list, editors] = await Promise.all([
    loadMontage(),
    canPublish ? adminGet('/api/admin/montage/editors', MontageEditorsSchema) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto w-full max-w-[72rem]">
      <header className="mb-5">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{montageCopy.nav}</h1>
        <p className="mt-2 max-w-[var(--w-prose)] text-fg-muted">{montageCopy.adminLead}</p>
      </header>
      <MontageInbox
        initial={list}
        canWrite={can(session, 'montage:write')}
        canPublish={canPublish}
        href="/admin/montage"
        editors={editors?.editors}
      />
    </div>
  );
}
