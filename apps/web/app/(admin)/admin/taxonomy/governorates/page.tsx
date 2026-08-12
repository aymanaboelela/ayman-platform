import { z } from 'zod';
import { copy } from '@ayman/contracts/copy/admin';
import { adminGet } from '@/lib/admin-api';
import { GovernoratesEditor } from './governorates-editor';

const AdminGovernorateSchema = z.object({
  code: z.string(),
  nameAr: z.string(),
  slug: z.string(),
  region: z.enum(['urban', 'lower', 'upper', 'frontier']),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});

export const metadata = { title: copy.admin.taxonomy.governoratesTitle };

/**
 * Uncached — an editor must see their own write immediately. There is no
 * delete here: `Governorate` is the FK target of every student profile, so
 * `isActive: false` (toggled inline) is the entire answer to "remove one".
 */
export default async function GovernoratesPage() {
  const governorates = await adminGet(
    '/api/admin/taxonomy/governorates',
    z.array(AdminGovernorateSchema),
  );

  return (
    <>
      <h1 className="mb-4 text-[length:var(--fs-title-2)] font-semibold text-fg">
        {copy.admin.taxonomy.governoratesTitle}
      </h1>
      <GovernoratesEditor governorates={governorates} />
    </>
  );
}
