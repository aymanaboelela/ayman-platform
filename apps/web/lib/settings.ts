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

export async function getBranding(): Promise<Branding> {
  'use cache';
  cacheTag(tags.settings('branding'));
  cacheLife('hours');
  return BrandingSchema.parse(await publicJson('/api/settings/branding'));
}

export async function getPublicSettings(): Promise<PublicSettings> {
  'use cache';
  cacheTag(tags.settings('seo'), tags.settings('contact'));
  cacheLife('hours');
  return PublicSettingsSchema.parse(await publicJson('/api/settings/public'));
}
