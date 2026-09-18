import {
  OFFICIAL_PROFILES,
  OFFICIAL_WHATSAPP_CHANNEL,
  OFFICIAL_WHATSAPP_E164,
} from '@ayman/contracts/site-profiles';

/**
 * The contact destinations this DEPLOYMENT seeds into `site_settings.contact`.
 *
 * ## Why this file exists
 *
 * `site-profiles.ts` in `@ayman/contracts` holds Ayman's real YouTube,
 * Instagram, TikTok, Facebook, WhatsApp channel and WhatsApp NUMBER as
 * compile-time constants, and `seed.ts` fill-if-empty wrote all six into
 * `site_settings.contact` on EVERY container boot.
 *
 * For one instructor that is correct and convenient. For a second one it is
 * the most dangerous line in the repository. The `20260727024705` migration
 * INSERTs the singleton `site_settings` row, so every fresh database has one
 * with an empty `contact`; the very next boot would fill it with Ayman's six
 * destinations and publish them on somebody else's domain. Nothing would look
 * broken — the footer, `/links` and the dashboard band would each render a
 * perfectly valid link, and that tenant's students would message HIM.
 *
 * ## `TENANT_KEY` is what makes this fail closed
 *
 * A plain `process.env.X ?? OFFICIAL_…` default does NOT fix the leak: it just
 * moves it to "whoever forgets to set six variables". Since forgetting is the
 * expected failure and the cost of it is a stranger's students in Ayman's
 * inbox, the inheritance is gated on the deployment SAYING who it is.
 *
 *   · `TENANT_KEY` unset or `ayman` — Ayman's deployment. Every constant below
 *     applies exactly as before, so his live platform is byte-identical and
 *     needs no new environment at all.
 *   · any other value — a different instructor. NOTHING is inherited. Each
 *     field is whatever its own `TENANT_*` variable says, and silence means
 *     the field stays null and the link is not rendered.
 *
 * That is the same principle as `roleHasPermission` and the settings guard:
 * an unrecognised input holds nothing.
 *
 * ## Why environment and not a row in the database
 *
 * Because it has to be right on the FIRST boot, before anybody has opened
 * `/admin/settings`. A default that lives in the database cannot seed the
 * database. Afterwards the stored row is authoritative for ever — these are
 * `??` fallbacks for an empty field and never overwrite what an admin typed
 * (`seed.ts` compares the whole object and skips the write when nothing
 * changed).
 */

/** The deployment's own identity. `ayman` is the default so his stack is unchanged. */
export const TENANT_KEY = (process.env.TENANT_KEY ?? '').trim() || 'ayman';

/** Whether this deployment inherits the constants in `site-profiles.ts`. */
const INHERITS_OFFICIAL_PROFILES = TENANT_KEY === 'ayman';

/**
 * `null` means "seed nothing" — `seed.ts` uses `??`, so a null leaves the
 * field empty, which is exactly the intent for a tenant that has not supplied
 * that channel yet.
 *
 * An empty string is treated as unset for the reason `config/env.ts` documents
 * at `optionalSecret`: compose's `${VAR:-}`, Dokploy's editor and a `VAR=""`
 * line all deliver "not configured" as an empty string far more often than by
 * omitting the key. Here, unlike there, unset does not mean "fall back" unless
 * this deployment is Ayman's.
 */
function envContact(key: string, official: string): string | null {
  const raw = (process.env[key] ?? '').trim();
  if (raw !== '') return raw;
  return INHERITS_OFFICIAL_PROFILES ? official : null;
}

/**
 * Whether this deployment seeds the SHIPPED page title and meta description.
 *
 * ## The leak this closes
 *
 * `seed.ts` fills `site_settings.seo` the same fill-if-empty way it fills
 * `contact`, out of `copy.seo.defaultTitle` and `copy.seo.homeDescription` —
 * two strings with AYMAN'S NAME WELDED INTO THE MIDDLE OF THEM:
 *
 *   «منصة أيمن أبو العلا — البرمجة وعلوم الحاسب للبكالوريا المصرية»
 *   «البرمجة وعلوم الحاسب صح مع المهندس أيمن أبو العلا: …»
 *
 * The seed runs on EVERY container boot, and the migration that creates the
 * singleton settings row leaves `seo` empty — so a fresh instructor's platform
 * came up with his name as its `<title>`, its `og:title` and its meta
 * description. Worse, `buildMetadata` resolves `adminTitle || SITE_TITLE`, so
 * the stored string BEATS the gated fallback in `lib/seo/metadata.ts`: gating
 * the code path could never have been enough while the database itself held
 * the name.
 *
 * Found by running a second instructor's stack locally — every name gate on
 * the page read correctly and the browser tab still said «منصة أيمن أبو العلا».
 *
 * ## Why nothing rather than a generated title
 *
 * A non-Ayman stack seeds NOTHING. `SeoSchema` allows both fields empty and
 * `buildMetadata` already falls back to `SITE_TITLE`, which is built from
 * `TENANT_DISPLAY_NAME` — so the page gets that deployment's own name without
 * a second place deciding what it is. Writing a generated title into the row
 * would make the database the authority and leave the admin editing a
 * sentence nobody chose.
 */
export const SEEDS_OFFICIAL_SEO = INHERITS_OFFICIAL_PROFILES;

export const TENANT_CONTACT_SEED = {
  youtube: envContact('TENANT_YOUTUBE', OFFICIAL_PROFILES.youtube),
  instagram: envContact('TENANT_INSTAGRAM', OFFICIAL_PROFILES.instagram),
  tiktok: envContact('TENANT_TIKTOK', OFFICIAL_PROFILES.tiktok),
  facebook: envContact('TENANT_FACEBOOK', OFFICIAL_PROFILES.facebook),
  whatsappChannel: envContact('TENANT_WHATSAPP_CHANNEL', OFFICIAL_WHATSAPP_CHANNEL),
  whatsapp: envContact('TENANT_WHATSAPP', OFFICIAL_WHATSAPP_E164),
} as const;
