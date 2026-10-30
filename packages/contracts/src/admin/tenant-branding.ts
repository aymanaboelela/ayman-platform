import { ACCENT_SLOTS, LANDING_PRESETS, type AccentSlot, type LandingPreset } from '@ayman/contracts/admin/settings';

/**
 * The landing page's look, chosen when the control plane creates a stack.
 *
 * `site_settings.branding` is the real home of both values — the teacher
 * changes them later from `/admin/settings`. But a brand-new stack has no
 * database when its web image is built, and the owner picked a look in the
 * «مدرّس جديد» form. So the pick travels as two env vars, read in exactly two
 * places that must agree:
 *
 *   · the API seed, which writes them into `branding` ONCE — only while the
 *     stored settings have never had a `branding` key at all, i.e. on the
 *     first boot of a fresh database. Any save from the admin form creates the
 *     key, and from then on the seed never touches it. (Fill-if-empty on the
 *     values themselves cannot work here: `classic` and `amber` are both a
 *     default and a deliberate choice.)
 *   · the web's branding FALLBACK (`getBranding` when the API is unreachable),
 *     which is what `next build` bakes into the prerendered page. Without it a
 *     new teacher's first minutes after every deploy would flash the default
 *     amber classic page before the cache refilled with their own.
 *
 * Unset — Ayman's stack and every stack created before this existed — is `{}`,
 * the schema's own defaults, so nothing changes for them. An unknown value is
 * ignored the same way rather than failing a boot over a cosmetic setting;
 * the preflight is where a typo is refused.
 */
export interface TenantBrandingEnv {
  TENANT_LANDING_PRESET?: string;
  TENANT_ACCENT?: string;
}

export function tenantBrandingDefaults(env: TenantBrandingEnv): { landingPreset?: LandingPreset; accent?: AccentSlot } {
  const out: { landingPreset?: LandingPreset; accent?: AccentSlot } = {};
  const preset = (env.TENANT_LANDING_PRESET ?? '').trim();
  const accent = (env.TENANT_ACCENT ?? '').trim();
  if ((LANDING_PRESETS as readonly string[]).includes(preset)) out.landingPreset = preset as LandingPreset;
  if ((ACCENT_SLOTS as readonly string[]).includes(accent)) out.accent = accent as AccentSlot;
  return out;
}
