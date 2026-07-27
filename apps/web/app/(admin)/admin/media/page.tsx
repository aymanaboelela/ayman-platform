import type { SearchParams } from 'nuqs/server';
import { listResponse } from '@ayman/contracts/admin/list';
import { MediaAssetSchema } from '@ayman/contracts/admin/media';
import { copy } from '@ayman/contracts';
import { adminGet } from '@/lib/admin-api';
import { MediaGrid } from './media-grid';
import { UploadForm } from './upload-form';

const ResponseSchema = listResponse(MediaAssetSchema);

export const metadata = { title: copy.admin.media.title };

/** Uncached — an upload must appear in the grid immediately. */
export default async function MediaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const includeArchived = params.archived === '1';

  const data = await adminGet(
    `/api/admin/media?page=1&perPage=60&includeArchived=${includeArchived ? 'true' : 'false'}`,
    ResponseSchema,
  );

  return (
    <>
      <h1 className="mb-4 text-[length:var(--fs-title-2)] font-semibold text-fg">
        {copy.admin.media.title}
      </h1>
      <p className="mb-24 max-w-[var(--w-prose)] text-fg-muted">{copy.admin.media.lead}</p>

      <UploadForm />
      <MediaGrid assets={data.rows} includeArchived={includeArchived} />
    </>
  );
}
