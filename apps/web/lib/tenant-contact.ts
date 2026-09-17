import {
  OFFICIAL_PROFILES,
  OFFICIAL_WHATSAPP_CHANNEL,
  OFFICIAL_WHATSAPP_E164,
} from '@ayman/contracts/site-profiles';

/**
 * What the footer and `/links` render when `site_settings.contact` comes back
 * empty — which happens far more often than "somebody forgot to fill it in".
 *
 * ## The bug this exists to close
 *
 * `getPublicSettingsOrDefaults()` catches an unreachable API and returns
 * `{ seo: {}, contact: {} }` — every contact field null. `next build` runs
 * inside `docker build`, where nothing is listening on `API_ORIGIN`, and both
 * `/links` and the `(site)` layout are prerendered under `cacheComponents`.
 * So the EMPTY answer is baked into the shipped image and served to the first
 * request after every deploy, before the revalidation replaces it.
 *
 * That was survivable while the two components fell back to
 * `OFFICIAL_PROFILES`. Removing those fallbacks (to stop a second instructor's
 * stack publishing Ayman's accounts) turned a cosmetic staleness into two
 * visibly broken sections: an `<h2>تابعني</h2>` above an empty `<ul>`, and the
 * same for «كلّمنا». Verified by building with no API and reading
 * `.next/server/app/links.html` — both lists ship empty, `wa.me` appears zero
 * times, and the first response carries `x-nextjs-cache: STALE`.
 *
 * ## Why this is not just the old fallback again
 *
 * Because it is gated on `TENANT_KEY`, exactly like `STARTER_HOME_BLOCKS` and
 * the API's `TENANT_CONTACT_SEED`:
 *
 *   · unset or `ayman` — Ayman's stack. His six destinations, so his pages
 *     render during the stale window precisely as they did before.
 *   · anything else — that deployment's own `TENANT_*` values, and NOTHING
 *     where it has not supplied one. A second instructor's empty settings
 *     render an empty list; they never render somebody else's accounts.
 *
 * ## Build time, not request time
 *
 * Read at module load, which is when the prerender happens — so the value has
 * to be present during `docker build`. `docker-compose.yml` passes all six as
 * build args for exactly that reason. The web image is already per-instructor
 * (`NEXT_PUBLIC_APP_URL` is inlined), so this costs nothing that was not
 * already true.
 */
const TENANT_KEY = (process.env.TENANT_KEY ?? '').trim() || 'ayman';

const INHERITS_OFFICIAL = TENANT_KEY === 'ayman';

function fallback(value: string | undefined, official: string): string | null {
  const supplied = (value ?? '').trim();
  if (supplied !== '') return supplied;
  return INHERITS_OFFICIAL ? official : null;
}

export const TENANT_CONTACT_FALLBACK = {
  youtube: fallback(process.env.TENANT_YOUTUBE, OFFICIAL_PROFILES.youtube),
  instagram: fallback(process.env.TENANT_INSTAGRAM, OFFICIAL_PROFILES.instagram),
  tiktok: fallback(process.env.TENANT_TIKTOK, OFFICIAL_PROFILES.tiktok),
  facebook: fallback(process.env.TENANT_FACEBOOK, OFFICIAL_PROFILES.facebook),
  whatsappChannel: fallback(process.env.TENANT_WHATSAPP_CHANNEL, OFFICIAL_WHATSAPP_CHANNEL),
  whatsapp: fallback(process.env.TENANT_WHATSAPP, OFFICIAL_WHATSAPP_E164),
} as const;
