import { z } from 'zod';
import { copy } from '@ayman/contracts/copy/admin';
import { adminGet } from '@/lib/admin-api';
import { SystemsEditor } from './systems-editor';

const AdminAcademicYearSchema = z.object({
  id: z.string(),
  year: z.number().int(),
  labelAr: z.string(),
  badgeAr: z.string(),
  sortOrder: z.number().int(),
});

const AdminSystemSchema = z.object({
  id: z.string(),
  slug: z.string(),
  nameAr: z.string(),
  totalMarks: z.number().int(),
  passPercent: z.union([z.number(), z.string()]).transform((value) => Number(value)),
  allowsRetakes: z.boolean(),
  sortOrder: z.number().int(),
  years: z.array(AdminAcademicYearSchema),
});

export const metadata = { title: copy.admin.taxonomy.systemsTitle };

/**
 * Uncached. `slug` is never in the response's editable columns — it renders
 * read-only, and the API's `SystemPatchSchema` has no `slug` key at all
 * (A13), so there is no path from this screen that could change one.
 */
export default async function SystemsPage() {
  const systems = await adminGet('/api/admin/taxonomy/systems', z.array(AdminSystemSchema));

  return (
    <>
      <h1 className="mb-4 text-[length:var(--fs-title-2)] font-semibold text-fg">
        {copy.admin.taxonomy.systemsTitle}
      </h1>
      <SystemsEditor systems={systems} />
    </>
  );
}
