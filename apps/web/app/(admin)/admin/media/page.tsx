import type { SearchParams } from 'nuqs/server';
import { listResponse } from '@ayman/contracts/admin/list';
import { MediaAssetSchema } from '@ayman/contracts/admin/media';
import { copy } from '@ayman/contracts/copy/admin';
import { ListPager } from '@/components/admin/list-controls';
import { adminGet } from '@/lib/admin-api';
import { MediaGrid } from './media-grid';
import { UploadForm } from './upload-form';

const ResponseSchema = listResponse(MediaAssetSchema);

/** Sixty was hardcoded into the URL; it is a constant now so the pager and the
 *  request cannot disagree about the page size. */
const PER_PAGE = 60;

export const metadata = { title: copy.admin.media.title };

/** Uncached — an upload must appear in the grid immediately. */
export default async function MediaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const includeArchived = params.archived === '1';

  /* `page=1` was hardcoded and the grid rendered no pager, so asset 61 onward
     was permanently unreachable — and `rowCount`, which the API already
     returns, was being thrown away. */
  const page = Math.max(1, Number(params.page) || 1);

  const data = await adminGet(
    `/api/admin/media?page=${page}&perPage=${PER_PAGE}&includeArchived=${includeArchived ? 'true' : 'false'}`,
    ResponseSchema,
  );

  return (
    <>
      <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">
        {copy.admin.media.title}
      </h1>
      <p className="mb-6 max-w-[var(--w-prose)] text-fg-muted">{copy.admin.media.lead}</p>

      <UploadForm />
      <MediaGrid assets={data.rows} includeArchived={includeArchived} />
      <ListPager
        page={page}
        perPage={PER_PAGE}
        rowCount={data.rowCount}
        labels={{
          previous: copy.admin.books.pagerPrevious,
          next: copy.admin.books.pagerNext,
          of: copy.admin.books.pagerOf,
        }}
      />
    </>
  );
}
