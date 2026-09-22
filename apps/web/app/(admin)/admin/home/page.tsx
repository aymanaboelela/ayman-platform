import { HomeBlockListSchema } from '@ayman/contracts/admin/home-blocks';
import { MediaAssetSchema } from '@ayman/contracts/admin/media';
import { listResponse } from '@ayman/contracts/admin/list';
import { copy } from '@ayman/contracts/copy/admin';
import { adminGet } from '@/lib/admin-api';
import { BlockComposer } from './block-composer';

/** Same shape the branding screen builds for the same endpoint. */
const MediaListSchema = listResponse(MediaAssetSchema);

export const metadata = { title: copy.admin.home.title };

/** Uncached — an editor must see their own write immediately, drafts included. */
export default async function HomeComposerPage() {
  // The media library comes down with the blocks because the `about` block can
  // carry a picture, and a picker with nothing to pick from is a dead control.
  // Same page size and the same `includeArchived=false` as the branding
  // screen's copy of this call — an archived asset is one the admin has
  // already said they are done with.
  const [blocks, media] = await Promise.all([
    adminGet('/api/admin/home-blocks', HomeBlockListSchema),
    adminGet('/api/admin/media?page=1&perPage=100&includeArchived=false', MediaListSchema),
  ]);

  return (
    <>
      <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">
        {copy.admin.home.title}
      </h1>
      <p className="mb-6 max-w-[var(--w-prose)] text-fg-muted">{copy.admin.home.lead}</p>

      <BlockComposer blocks={blocks} assets={media.rows} />
    </>
  );
}
