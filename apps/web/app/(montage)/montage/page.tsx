import { montageCopy } from '@ayman/contracts/copy/montage';
import { MontageInbox } from '@/components/montage/montage-inbox';
import { loadMontage } from '@/components/montage/load-montage';
import { can, getSession } from '@/lib/session';

/** «المونتاج» — the editor's page. `(montage)/layout.tsx` gates it. */
export default async function MontagePage() {
  const [list, session] = await Promise.all([loadMontage(), getSession()]);

  return (
    <>
      <p className="mb-4 max-w-[var(--w-prose)] text-fg-muted">{montageCopy.editorLead}</p>
      <MontageInbox
        initial={list}
        canWrite={can(session, 'montage:write')}
        canPublish={can(session, 'montage:publish')}
        href="/montage"
      />
    </>
  );
}
