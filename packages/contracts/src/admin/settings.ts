import { z } from 'zod';

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

export const ContactSchema = z
  .object({
    email: z.email().nullable().default(null),
    phone: optionalPhone,
    whatsapp: optionalPhone,
    facebook: optionalUrl,
    youtube: optionalUrl,
    telegram: optionalUrl,
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

export const SETTINGS_SECTIONS = ['branding', 'seo', 'contact'] as const;
export const SettingsSectionSchema = z.enum(SETTINGS_SECTIONS);
export type SettingsSection = z.infer<typeof SettingsSectionSchema>;

/** One schema per section, so `PATCH /admin/settings/:section` stays typed. */
export const SECTION_SCHEMAS = {
  branding: BrandingSchema,
  seo: SeoSchema,
  contact: ContactSchema,
} as const;
