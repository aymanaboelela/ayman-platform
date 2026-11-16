import { cacheLife, cacheTag } from 'next/cache';
import {
  FLAG_DECLARATIONS,
  FeatureFlagListSchema,
  type FeatureFlagList,
  type FlagKey,
} from '@ayman/contracts/admin/flags';
import { apiGet } from '@/lib/api';
import { tags } from '@/lib/cache-tags';
import { IS_AYMAN } from '@/lib/tenant';

/**
 * The stack's feature flags, for the PUBLIC and student surfaces.
 *
 * `lib/settings.ts`'s header has promised this loader since the flags
 * contract landed, and `(admin)/admin/flags/actions.ts` has been calling
 * `updateTag(tags.flags())` into nothing ever since. This is the reader that
 * call was written for: a switch flipped on `/admin/flags` reaches the next
 * request, not the next deploy.
 *
 * Server-only (`'use cache'`). A client component gets the ANSWER as a prop;
 * it never imports this module, which builds a Zod schema.
 *
 * ## The fallback is the declared START value, never «everything on»
 *
 * `next build` prerenders with no API reachable, so the read fails there every
 * time, and a failed read is cached like a successful one. `null` is what a
 * failure returns, and `stackFlag` below answers a `null` list from the
 * declarations — under `cacheLife('minutes')`, so the baked answer is replaced
 * by the real one within minutes of the stack coming up.
 */
export async function getFlags(): Promise<FeatureFlagList | null> {
  'use cache';
  cacheTag(tags.flags());

  try {
    const flags = await apiGet('/api/flags', FeatureFlagListSchema);
    cacheLife('hours');
    return flags;
  } catch {
    cacheLife('minutes');
    return null;
  }
}

/**
 * One flag's value on THIS stack.
 *
 * ⚠️ Not `isEnabled()` from the contracts package, and the difference is the
 * whole reason this function exists. A flag with no row answers
 * `defaultValue` there — the value on the ORIGINAL stack. A flag declared
 * `defaultValue: true, defaultForTenant: false` («on for him, off for
 * everyone else») has no row on a teacher's stack for as long as that stack's
 * web container is newer than its API, and for those minutes `isEnabled`
 * would switch a feature on for a teacher nobody opened it for.
 *
 * So a missing row, and a failed read, both answer what the API itself would
 * write when it creates the row (`apps/api/src/common/flag-default.ts`): the
 * tenant default off the original stack, the plain default on it.
 */
export function stackFlag(
  flags: FeatureFlagList | null,
  key: FlagKey,
  isAyman: boolean = IS_AYMAN,
): boolean {
  const declaration = FLAG_DECLARATIONS.find((entry) => entry.key === key);
  if (!declaration) return false;
  const row = flags?.find((flag) => flag.key === key);
  if (row) return row.enabled;
  if (isAyman) return declaration.defaultValue;
  return ('defaultForTenant' in declaration ? declaration.defaultForTenant : undefined) ?? declaration.defaultValue;
}

/** One flag, for the surface that asks about one. */
export async function flagEnabled(key: FlagKey): Promise<boolean> {
  return stackFlag(await getFlags(), key);
}
