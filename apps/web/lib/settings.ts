import { cacheLife, cacheTag } from 'next/cache';
import {
  BrandingSchema,
  PublicSettingsSchema,
  type Branding,
  type PublicSettings,
} from '@ayman/contracts/admin/settings';
import { resolve } from './api';
import { tags } from './cache-tags';

/**
 * The public site's cached configuration reads.
 *
 * ⚠️ A `'use cache'` function may not call `cookies()` or `headers()`. Every
 * endpoint below is therefore `@Public()` on the API and returns only fields
 * that are safe for an anonymous visitor. Admin reads of the same data go
 * through `./admin-api.ts` instead, uncached, so an editor never opens a form
 * populated from a stale cache entry.
 *
 * The admin's save path calls `updateTag()` — never `revalidateTag()`.
 * `updateTag` expires the tag AND refreshes it for the current request, so the
 * editor reads their own write; `revalidateTag` only marks it stale for the
 * next visitor, which makes the admin look broken.
 *
 * `getNavigation`, `getFlags` and `getHomeBlocks` belong here too, but their
 * contracts (`admin/navigation`, `admin/flags`, `admin/home-blocks`) are
 * created by Plan 6 Tasks 14 and 15. Declaring them against schemas that do
 * not exist yet would not compile; they land with those tasks, tagged
 * `tags.nav()`, `tags.flags()` and `tags.homeBlocks()` respectively — the
 * vocabulary is already in `./cache-tags.ts`.
 */
async function publicJson(path: string): Promise<unknown> {
  const response = await fetch(resolve(path), { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`GET ${path} failed with ${response.status}`);
  return response.json();
}

/**
 * Branding is read by the ROOT layout, so it is on the path of every single
 * page — including `/_not-found`, which Next prerenders at build time.
 *
 * That makes an unreachable API fatal to `next build` unless this falls back:
 * inside `docker build` there is no API to reach, and on a server a restart
 * would otherwise be enough to fail a deploy. `BrandingSchema.parse({})`
 * yields the shipped defaults (amber, default radius, no custom logos), which
 * is exactly the right answer — the site renders in its default identity
 * rather than not at all.
 *
 * `cacheLife('minutes')` on the fallback path is deliberate: `'use cache'`
 * caches failures too, and a transient outage must not pin the platform to
 * default branding for hours afterwards.
 */
export async function getBranding(): Promise<Branding> {
  'use cache';
  cacheTag(tags.settings('branding'));

  try {
    const branding = BrandingSchema.parse(await publicJson('/api/settings/branding'));
    cacheLife('hours');
    return branding;
  } catch {
    cacheLife('minutes');
    return BrandingSchema.parse({});
  }
}

export async function getPublicSettings(): Promise<PublicSettings> {
  'use cache';
  cacheTag(tags.settings('seo'), tags.settings('contact'));
  cacheLife('hours');
  return PublicSettingsSchema.parse(await publicJson('/api/settings/public'));
}
