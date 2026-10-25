import { designsCopy } from '@ayman/contracts/copy/designs';
import { DesignStudio } from '@/components/designs/design-studio';
import { loadStudio } from '@/components/designs/load-studio';
import { can, getSession } from '@/lib/session';

/** «ستوديو التصميم» — the designer's page. `(studio)/layout.tsx` gates it. */
export default async function StudioPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const [{ f }, session] = await Promise.all([searchParams, getSession()]);
  const { studio, folder } = await loadStudio(f);

  return (
    <>
      <p className="mb-4 text-fg-muted">{designsCopy.studioLead}</p>
      <DesignStudio initialStudio={studio} initialFolder={folder} canWrite={can(session, 'design:write')} />
    </>
  );
}
