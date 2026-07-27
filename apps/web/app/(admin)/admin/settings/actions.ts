'use server';

import { updateTag } from 'next/cache';
import {
  BrandingSchema,
  ContactSchema,
  SeoSchema,
  SiteSettingsSchema,
  type Branding,
  type Contact,
  type Seo,
} from '@ayman/contracts/admin/settings';
import { adminSend } from '@/lib/admin-api';
import { tags } from '@/lib/cache-tags';

export type SettingsActionResult = { ok: true } | { ok: false; message: string };

/**
 * `updateTag`, NEVER `revalidateTag` (Global Constraint 15 — same rule
 * `lib/settings.ts` documents for the public loaders these tags feed):
 * `updateTag` expires the tag AND refreshes it for the CURRENT request, so an
 * editor who just saved sees their own write immediately — in the FOUC-safe
 * `<style>` the root layout injects from `getBranding()`, and in
 * `getPublicSettings()` for SEO/contact. `revalidateTag` would only mark the
 * entry stale for the NEXT visitor, which makes the save look like it
 * silently failed until a second reload.
 *
 * Each section is re-validated here through the EXACT schema the API itself
 * validates the PATCH body against (`@ayman/contracts/admin/settings`) — the
 * client-side `zodResolver` in each form already ran the same schema, this is
 * defence in depth, not a second set of rules.
 */
export async function updateBrandingAction(input: Branding): Promise<SettingsActionResult> {
  try {
    const body = BrandingSchema.parse(input);
    await adminSend('PATCH', '/api/admin/settings/branding', body, SiteSettingsSchema);
    updateTag(tags.settings('branding'));
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/**
 * `getPublicSettings()` is tagged with BOTH `settings('seo')` and
 * `settings('contact')` — one cache entry serves the public site's SEO
 * metadata and its contact block together — so invalidating either tag busts
 * that entry. This action only needs its own section's tag.
 */
export async function updateSeoAction(input: Seo): Promise<SettingsActionResult> {
  try {
    const body = SeoSchema.parse(input);
    await adminSend('PATCH', '/api/admin/settings/seo', body, SiteSettingsSchema);
    updateTag(tags.settings('seo'));
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function updateContactAction(input: Contact): Promise<SettingsActionResult> {
  try {
    const body = ContactSchema.parse(input);
    await adminSend('PATCH', '/api/admin/settings/contact', body, SiteSettingsSchema);
    updateTag(tags.settings('contact'));
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}
