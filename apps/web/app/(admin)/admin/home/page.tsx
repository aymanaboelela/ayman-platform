import { HomeBlockListSchema } from '@ayman/contracts/admin/home-blocks';
import { copy } from '@ayman/contracts';
import { adminGet } from '@/lib/admin-api';
import { BlockComposer } from './block-composer';

export const metadata = { title: copy.admin.home.title };

/** Uncached — an editor must see their own write immediately, drafts included. */
export default async function HomeComposerPage() {
  const blocks = await adminGet('/api/admin/home-blocks', HomeBlockListSchema);

  return (
    <>
      <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">
        {copy.admin.home.title}
      </h1>
      <p className="mb-6 max-w-[var(--w-prose)] text-fg-muted">{copy.admin.home.lead}</p>

      <BlockComposer blocks={blocks} />
    </>
  );
}
