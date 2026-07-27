'use server';

import { updateTag } from 'next/cache';
import { FeatureFlagSchema } from '@ayman/contracts/admin/flags';
import { adminSend } from '@/lib/admin-api';
import { tags } from '@/lib/cache-tags';

/**
 * `updateTag`, NOT `revalidateTag` (Global Constraint 15): this expires the
 * tag AND refreshes it for the CURRENT request, so the editor's next read —
 * even in another already-open tab that re-renders — is their own write.
 * `revalidateTag` only marks it stale for the NEXT visitor, which makes the
 * toggle look like it silently failed until a second reload.
 */
export async function setFlag(key: string, enabled: boolean) {
  const flag = await adminSend(
    'PATCH',
    `/api/admin/flags/${encodeURIComponent(key)}`,
    { enabled },
    FeatureFlagSchema,
  );

  updateTag(tags.flags());

  return flag;
}
