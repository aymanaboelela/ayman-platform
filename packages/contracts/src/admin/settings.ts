import { z } from '@ayman/contracts/zod';

/**
 * TOKEN SLOTS, not colours. The admin picks one of these; the mapping from a
 * slot to actual OKLCH values lives in `packages/ui` and is never editable.
 * An editor can therefore never type raw CSS (Global Constraint 18 / A12).
 *
 * There is deliberately no `green` and no `red`: those two hues are
 * load-bearing for quiz correctness and must never become the brand.
 */
export const ACCENT_SLOTS = ['amber', 'cyan', 'blue', 'violet', 'magenta', 'slate'] as const;
export const AccentSlotSchema = z.enum(ACCENT_SLOTS);
export type AccentSlot = z.infer<typeof AccentSlotSchema>;

/** Radius presets. Every preset keeps the card ceiling at ≤ 8px. */
export const RADIUS_SLOTS = ['sharp', 'default', 'soft'] as const;
export const RadiusSlotSchema = z.enum(RADIUS_SLOTS);
export type RadiusSlot = z.infer<typeof RadiusSlotSchema>;

/** Media is referenced by asset id, never by URL. */
const assetId = z.uuid().nullable().default(null);

export const BrandingSchema = z
  .object({
    accent: AccentSlotSchema.default('amber'),
    radius: RadiusSlotSchema.default('default'),
    logoLightAssetId: assetId,
    logoDarkAssetId: assetId,
    faviconAssetId: assetId,
  })
  .strict();

export type Branding = z.infer<typeof BrandingSchema>;

export const SeoSchema = z
  .object({
    titleAr: z.string().max(70).default(''),
    descriptionAr: z.string().max(160).default(''),
    ogImageAssetId: assetId,
  })
  .strict();

export type Seo = z.infer<typeof SeoSchema>;

/**
 * A storage KEY resolved by the API from the asset id beside it.
 *
 * ⚠️ Read-only, and that is the whole point of the separate `*ReadSchema`
 * types below rather than three more fields on the write schemas.
 * `updateSection()` persists whatever the section schema accepts, so a key on
 * `BrandingSchema` would be STORED — and a stored key is a second copy of a
 * fact that already lives in `media_assets.storage_key`, free to go stale the
 * moment an asset's bytes are re-cropped to a new key. `SECTION_SCHEMAS` is
 * deliberately built from the write schemas only.
 */
const resolvedKey = z.string().nullable().default(null);

/**
 * What `GET /api/settings/branding` returns: the stored branding PLUS the
 * storage key of each asset it points at.
 *
 * This exists because the root layout has an asset id and needs a URL, and
 * the two are NOT interconvertible. `mediaUrl()` takes a storage key —
 * `<2 hex>/<uuid>.webp`, the shape `GET /media/:prefix/:name` routes on — and
 * the layout was passing `` `${faviconAssetId}.webp` ``, a single path segment
 * that matches no route. Every favicon an admin has ever chosen 404'd, and
 * silently: a broken `<link rel="icon">` leaves the browser's default globe in
 * the tab, which looks exactly like "not set yet".
 *
 * Resolving server-side rather than deriving the key in the client also keeps
 * `storage_key` free to change for a stable asset id — which is what
 * re-cropping an existing asset does, so that the old URL stays immutable and
 * cacheable instead of being overwritten under a year-long `Cache-Control`.
 */
export const BrandingReadSchema = BrandingSchema.extend({
  logoLightKey: resolvedKey,
  logoDarkKey: resolvedKey,
  faviconKey: resolvedKey,
});

export type BrandingRead = z.infer<typeof BrandingReadSchema>;

/** Same resolution, for the OG image `buildMetadata()` renders. */
export const SeoReadSchema = SeoSchema.extend({ ogImageKey: resolvedKey });

export type SeoRead = z.infer<typeof SeoReadSchema>;

/**
 * `https` only. An `http://` link in the footer is a mixed-content warning on
 * every page that renders it, and there is no legitimate reason for one.
 */
const optionalUrl = z
  .url()
  .refine((value) => value.startsWith('https://'), { message: 'must be an https:// URL' })
  .nullable()
  .default(null);

/** E.164, same convention as `student_profiles.phone`. */
const optionalPhone = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/)
  .nullable()
  .default(null);

/**
 * ⚠️ Every channel the SITE FOOTER renders has to be representable here, or it
 * is not editable from the dashboard — and what is not editable ends up
 * hardcoded in `components/site/site-footer.tsx`, which is where the real
 * profiles lived until this schema grew to hold them.
 *
 * Two of those hardcoded links were bare platform roots — `https://wa.me/` and
 * `https://www.facebook.com/groups/` — so the WhatsApp button and the
 * community link in the footer sent every student to WhatsApp's and
 * Facebook's own landing pages. `instagram` and `tiktok` are here for the
 * opposite reason: the profiles were correct but unreachable from the
 * dashboard, so a change of handle meant a code deploy.
 *
 * `whatsappChannel` and `whatsapp` are different things and both are kept: the
 * first is a broadcast channel URL, the second is the NUMBER the footer's
 * «كلّمنا» button turns into a `wa.me` link.
 */
export const ContactSchema = z
  .object({
    email: z.email().nullable().default(null),
    phone: optionalPhone,
    whatsapp: optionalPhone,
    facebook: optionalUrl,
    youtube: optionalUrl,
    telegram: optionalUrl,
    instagram: optionalUrl,
    tiktok: optionalUrl,
    whatsappChannel: optionalUrl,
    facebookGroup: optionalUrl,
  })
  .strict();

export type Contact = z.infer<typeof ContactSchema>;

/**
 * ⚠️ `.prefault({})`, never `.default({})`.
 *
 * Zod 4 changed `.default()` to short-circuit: the given value is returned
 * as-is, WITHOUT running the inner schema. `BrandingSchema.default({})` would
 * therefore make `SiteSettingsSchema.parse({}).branding` a literal `{}` —
 * typed as `Branding`, `undefined` at every property, and the whole reason
 * jsonb is acceptable here (a never-written key reads as its default) would be
 * quietly false. `.prefault()` is Zod 4's spelling of the old behaviour: the
 * value is fed THROUGH the schema.
 */
export const SiteSettingsSchema = z
  .object({
    branding: BrandingSchema.prefault({}),
    seo: SeoSchema.prefault({}),
    contact: ContactSchema.prefault({}),
  })
  .strict();

export type SiteSettings = z.infer<typeof SiteSettingsSchema>;

/** What the public site is allowed to read. Branding has its own endpoint. */
export const PublicSettingsSchema = z.object({ seo: SeoSchema, contact: ContactSchema }).strict();

export type PublicSettings = z.infer<typeof PublicSettingsSchema>;

/** The same payload as returned over the wire, with the OG image key resolved. */
export const PublicSettingsReadSchema = z
  .object({ seo: SeoReadSchema, contact: ContactSchema })
  .strict();

export type PublicSettingsRead = z.infer<typeof PublicSettingsReadSchema>;

export const SETTINGS_SECTIONS = ['branding', 'seo', 'contact'] as const;
export const SettingsSectionSchema = z.enum(SETTINGS_SECTIONS);
export type SettingsSection = z.infer<typeof SettingsSectionSchema>;

/** One schema per section, so `PATCH /admin/settings/:section` stays typed. */
export const SECTION_SCHEMAS = {
  branding: BrandingSchema,
  seo: SeoSchema,
  contact: ContactSchema,
} as const;
