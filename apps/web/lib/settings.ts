import { cacheLife, cacheTag } from 'next/cache';
import {
  BrandingReadSchema,
  PublicSettingsReadSchema,
  type BrandingRead,
  type PublicSettingsRead,
} from '@ayman/contracts/admin/settings';
import { bound, resolve } from './api';
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
  /*
   * ⚠️ `bound(...)` is what stops a hung API from hanging the whole site.
   *
   * This was a bare `fetch`, which in Node has no timeout worth the name —
   * undici's `headersTimeout` is five minutes, and a socket that is open but
   * silent hits neither it nor anything else. `lib/api.ts` documents that at
   * length and applies a 15s ceiling to every call that goes through it. This
   * function did not go through it.
   *
   * That matters more here than almost anywhere: `getBranding()` below is read
   * by the ROOT layout, so it is on the path of EVERY page on the site. An API
   * that accepts the connection and then goes quiet held every render open,
   * indefinitely, with the visitor sitting on a blank tab — the exact symptom
   * («بتقعد تتحمل loading كده بس») the ceiling in `lib/api.ts` was added to
   * kill, arriving through the one path that had opted out of it.
   *
   * `apiFetch` is still not usable here: this runs inside `'use cache'`, and
   * its `ApiRequestError` would be cached as a failure. Bounding the request
   * and letting the caller's own fallback handle the throw is the shape that
   * fits — see `getBranding`'s `cacheLife('minutes')` note.
   */
  const response = await fetch(resolve(path), {
    ...bound({ headers: { accept: 'application/json' } }),
  });
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
export async function getBranding(): Promise<BrandingRead> {
  'use cache';
  cacheTag(tags.settings('branding'));

  try {
    const branding = BrandingReadSchema.parse(await publicJson('/api/settings/branding'));
    cacheLife('hours');
    return branding;
  } catch {
    cacheLife('minutes');
    return BrandingReadSchema.parse({});
  }
}

/**
 * The WhatsApp channel URL, read FRESH on every call — deliberately not
 * `'use cache'`, and the only reader in this file that opts out.
 *
 * `/welcome` is the one screen whose entire existence is decided by this
 * value: no channel means the page has nothing to say and redirects straight
 * through. Reading it through `getPublicSettingsOrDefaults()` made that
 * decision depend on CACHE WARMTH rather than on the setting, and the cache is
 * reliably cold at exactly the wrong moment.
 *
 * `next build` runs with no API reachable — inside `docker build`, and in the
 * `playwright` CI job, which builds before it starts anything. Every cached
 * settings reader is written to fall back rather than fail the build (see
 * `getBranding`), so the build BAKES IN `contact: {}` — no channel — under
 * `cacheLife('minutes')`. The deployed server then serves that stale empty
 * value while it revalidates, so for the first minutes after every single
 * deploy the greeting silently does not exist and nobody is asked to join the
 * channel. In CI it produced something stranger still: the screen appeared for
 * some tests and not others depending on when the cache happened to warm,
 * which is how one Playwright shard passed and the next hung waiting for a
 * button that was never going to render.
 *
 * An uncached read is affordable here in a way it would not be anywhere else:
 * this runs once per student, ever, on the one page between onboarding and the
 * product — not on a hot path where a per-request API call would trip the
 * catalog rate limiter.
 *
 * Returns `null` rather than throwing on an unreachable API, so a blip
 * degrades to "walk them through" instead of a 500 on the screen that
 * welcomes someone to the platform. Unlike the cached version, that answer
 * lasts for one request rather than for minutes.
 */
export async function getWhatsappChannelFresh(): Promise<string | null> {
  try {
    const settings = PublicSettingsReadSchema.parse(await publicJson('/api/settings/public'));
    return settings.contact.whatsappChannel ?? null;
  } catch {
    return null;
  }
}

export async function getPublicSettings(): Promise<PublicSettingsRead> {
  'use cache';
  cacheTag(tags.settings('seo'), tags.settings('contact'));
  cacheLife('hours');
  return PublicSettingsReadSchema.parse(await publicJson('/api/settings/public'));
}

/**
 * The same read, on the path of EVERY page's `generateMetadata`.
 *
 * That promotion is what forces the fallback: `getPublicSettings()` throws
 * when the API is unreachable, and metadata is generated for `/_not-found`
 * during `next build` — inside `docker build` there is no API at all, so the
 * throwing version would make an unreachable API a failed deploy rather than
 * a page with default metadata. Identical reasoning, and identical
 * `cacheLife` split, to `getBranding()` above: a transient outage must not
 * pin the site to default SEO for hours.
 *
 * `PublicSettingsSchema.parse({ seo: {}, contact: {} })` is not an empty
 * object — every field carries a `.default()`, so this yields the shipped
 * defaults (blank admin overrides, no contact links), which is exactly what
 * `buildMetadata` treats as "not configured".
 */
export async function getPublicSettingsOrDefaults(): Promise<PublicSettingsRead> {
  'use cache';
  cacheTag(tags.settings('seo'), tags.settings('contact'));

  try {
    const settings = PublicSettingsReadSchema.parse(await publicJson('/api/settings/public'));
    cacheLife('hours');
    return settings;
  } catch {
    cacheLife('minutes');
    return PublicSettingsReadSchema.parse({ seo: {}, contact: {} });
  }
}
