import { cacheLife, cacheTag } from 'next/cache';
import {
  PublicPromoBannerListSchema,
  cairoDayKey,
  promoBannerForYear,
  promoBannerInWindow,
  promoBannerLinkKind,
  type PublicPromoBanner,
} from '@ayman/contracts/admin/promo-banners';
import { apiGet } from '@/lib/api';
import { tags } from '@/lib/cache-tags';
import { getEntitlements } from '@/lib/entitlements';

/**
 * «البانرات الترويجية» — every live banner on this stack, the same list for
 * every student.
 *
 * `'use cache'` on one tag, like `getHonorBoardRounds` and the public
 * settings: the dashboard is the page students land on after every login,
 * and its own comments count per-view requests against the `short` throttle.
 * This is not one of them — the API is asked once per `minutes` for the whole
 * site, and every admin write `updateTag`s the entry so the instructor sees
 * the change on the next render (`app/(admin)/admin/promo-banners/actions.ts`).
 *
 * Fails SOFT to `[]`, which renders nothing at all — the dashboard looks
 * exactly as it did before banners existed, which is the bar every read on
 * that page has to clear.
 */
export async function getPromoBanners(): Promise<PublicPromoBanner[]> {
  'use cache';
  cacheLife('minutes');
  cacheTag(tags.promoBanners());

  // The route 404s on a stack without the feature, and this entry caches its
  // failure too — so ask only when there is something to ask for, same as
  // `getHonorBoardRounds`.
  if (!(await getEntitlements()).promoBanners) return [];

  try {
    return await apiGet('/api/promo-banners', PublicPromoBannerListSchema);
  } catch {
    return [];
  }
}

/**
 * The banners THIS student sees right now: inside their window on today's
 * Cairo date, and aimed at their year or at everyone.
 *
 * Applied at render rather than in the cached read, for the two reasons
 * `PublicPromoBannerSchema` gives: the cache outlives midnight, and the list
 * is shared while the year is not.
 */
export function bannersFor(
  banners: readonly PublicPromoBanner[],
  year: number | null,
  now: Date = new Date(),
): ShownPromoBanner[] {
  const today = cairoDayKey(now);
  return banners
    .filter((banner) => promoBannerInWindow(banner, today) && promoBannerForYear(banner, year))
    .map((banner) => ({
      ...banner,
      linkKind: banner.linkUrl === null ? null : promoBannerLinkKind(banner.linkUrl),
    }));
}

/**
 * A banner ready to draw, its link already classified HERE, on the server —
 * so the strip (a client component) imports only types from the contracts
 * module and never pulls its Zod schemas into the dashboard's client bundle.
 * `null` both for no link and for one that no longer passes the rule; either
 * way the picture is drawn without a link.
 */
export type ShownPromoBanner = PublicPromoBanner & { linkKind: 'internal' | 'external' | null };
