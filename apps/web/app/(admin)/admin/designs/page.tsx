import { notFound } from 'next/navigation';
import { designsCopy } from '@ayman/contracts/copy/designs';
import { DesignStudio } from '@/components/designs/design-studio';
import { loadStudio } from '@/components/designs/load-studio';
import { can, getSession } from '@/lib/session';
import { IS_AYMAN } from '@/lib/tenant';

export const metadata = { title: designsCopy.nav };

/**
 * «التصميمات» — the instructor's door into the designer's studio: the same
 * folders, the originals one press away, and the same rename/replace/delete
 * the designer has. Making one a lecture cover happens from the cover field
 * itself («من التصميمات»), where the target is already known.
 */
export default async function AdminDesignsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  if (!IS_AYMAN) notFound();
  const [{ f }, session] = await Promise.all([searchParams, getSession()]);
  if (!can(session, 'design:read')) notFound();
  const { studio, folder } = await loadStudio(f);

  return (
    <div className="mx-auto w-full max-w-[90rem]">
      <header className="mb-5">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{designsCopy.nav}</h1>
        <p className="mt-2 max-w-[var(--w-prose)] text-fg-muted">{designsCopy.adminLead}</p>
      </header>
      <DesignStudio initialStudio={studio} initialFolder={folder} canWrite={can(session, 'design:write')} />
    </div>
  );
}
