import { copy } from '@ayman/contracts/copy/admin';
import { getTaxonomyLiveOrNull } from '@/lib/taxonomy';
import { gradesOf } from '@/lib/tenant-grades';
import { GradesForm } from './grades-form';

export const metadata = { title: copy.admin.taxonomy.gradesTitle };

/**
 * «الصفوف» — the grades this platform teaches, chosen by its own admin.
 *
 * Read LIVE (`getTaxonomyLiveOrNull`), not through the cached loader: this is
 * the screen that changes the value, and a form pre-ticked from a cache entry
 * a minute old would save back the list the admin just replaced.
 *
 * What is ticked on arrival is what the platform shows right now — the saved
 * list, or the build-time `TENANT_GRADES` when nothing was ever saved — so the
 * first visit reads as «this is what you have», not as an empty form.
 */
export default async function GradesPage() {
  const taxonomy = await getTaxonomyLiveOrNull();
  const current = gradesOf(taxonomy).map((grade) => grade.slug);

  return (
    <>
      <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">
        {copy.admin.taxonomy.gradesTitle}
      </h1>
      <p className="mb-6 max-w-[var(--w-prose)] text-fg-muted">{copy.admin.taxonomy.gradesLead}</p>
      <GradesForm current={current} />
    </>
  );
}
