import { z } from 'zod';
import { copy } from '@ayman/contracts';
import { adminGet } from '@/lib/admin-api';
import { TracksEditor } from './tracks-editor';

const AdminTrackSchema = z.object({
  id: z.string(),
  systemId: z.string(),
  slug: z.string(),
  labelAr: z.string(),
  aliases: z.array(z.string()),
  minYear: z.number().int(),
  sortOrder: z.number().int(),
});

const AdminSystemOptionSchema = z.object({ id: z.string(), nameAr: z.string() });

export const metadata = { title: copy.admin.taxonomy.tracksTitle };

/** Uncached. `slug` and `systemId` are identity — neither has a patch-schema key (A13). */
export default async function TracksPage() {
  const [tracks, systems] = await Promise.all([
    adminGet('/api/admin/taxonomy/tracks', z.array(AdminTrackSchema)),
    adminGet('/api/admin/taxonomy/systems', z.array(AdminSystemOptionSchema)),
  ]);

  return (
    <>
      <h1 className="mb-16 text-[length:var(--fs-title-2)] font-semibold text-fg">
        {copy.admin.taxonomy.tracksTitle}
      </h1>
      <TracksEditor tracks={tracks} systems={systems} />
    </>
  );
}
