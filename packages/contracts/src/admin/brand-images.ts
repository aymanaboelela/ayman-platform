import type { Branding, BrandingRead } from './settings';

/**
 * Every picture an instructor can replace from «الهوية البصرية», each as a
 * light-mode file and an optional dark-mode one.
 *
 * ONE table, read by three places that used to each carry their own list:
 *
 *   · `settings.service.ts` resolves every `…AssetId` here to its `…Key`;
 *   · the admin form draws one card per row, grouped by `group`;
 *   · `apps/web/lib/brand-image.ts` turns a row into what a page renders.
 *
 * A slot that is missing from here therefore has no control, no resolved key
 * and no renderer — it fails loudly in `brand-images.spec.ts` rather than
 * quietly as a picture nobody can change.
 *
 * `slot` doubles as the `BrandAssetKind` in `apps/web/lib/brand-assets.ts`
 * wherever one exists, which is what lets an upload override the file shipped
 * in `public/brand/` by name.
 */
type AssetField = Extract<keyof Branding, `${string}AssetId`>;
type KeyField = Extract<keyof BrandingRead, `${string}Key`>;

export const BRAND_IMAGE_GROUPS = ['identity', 'landing', 'pages', 'documents'] as const;
export type BrandImageGroup = (typeof BRAND_IMAGE_GROUPS)[number];

export interface BrandImageSlotDef {
  slot: BrandImageSlot;
  group: BrandImageGroup;
  light: AssetField;
  /** `null` for a slot with one file — the app icon: a launcher has no theme. */
  dark: AssetField | null;
  lightKey: KeyField;
  darkKey: KeyField | null;
}

export const BRAND_IMAGE_SLOT_IDS = [
  'logo',
  'mark',
  'favicon',
  'hero',
  'portrait',
  'trackEssentials',
  'trackYear1',
  'trackYear2',
  'login',
  'honorHost',
  'practiceGuide',
  'courseCover',
  'appIcon',
  'signature',
] as const;
export type BrandImageSlot = (typeof BRAND_IMAGE_SLOT_IDS)[number];

/** The `…AssetId` → `…Key` rename the API resolver applies. */
function pair(slot: BrandImageSlot, group: BrandImageGroup): BrandImageSlotDef {
  return {
    slot,
    group,
    light: `${slot}AssetId` as AssetField,
    dark: `${slot}DarkAssetId` as AssetField,
    lightKey: `${slot}Key` as KeyField,
    darkKey: `${slot}DarkKey` as KeyField,
  };
}

export const BRAND_IMAGE_SLOTS: readonly BrandImageSlotDef[] = [
  /*
   * The logo predates this table and its fields are named `logoLight…`, not
   * `logo…`, so it is the one row spelled out by hand.
   */
  {
    slot: 'logo',
    group: 'identity',
    light: 'logoLightAssetId',
    dark: 'logoDarkAssetId',
    lightKey: 'logoLightKey',
    darkKey: 'logoDarkKey',
  },
  pair('mark', 'identity'),
  pair('favicon', 'identity'),
  pair('hero', 'landing'),
  pair('portrait', 'landing'),
  pair('trackEssentials', 'landing'),
  pair('trackYear1', 'landing'),
  pair('trackYear2', 'landing'),
  pair('login', 'pages'),
  pair('honorHost', 'pages'),
  pair('practiceGuide', 'pages'),
  pair('courseCover', 'pages'),
  {
    slot: 'appIcon',
    group: 'identity',
    light: 'appIconAssetId',
    dark: null,
    lightKey: 'appIconKey',
    darkKey: null,
  },
  pair('signature', 'documents'),
];

/** Every asset-id field the branding section stores, light and dark. */
export const BRAND_IMAGE_FIELDS: readonly AssetField[] = BRAND_IMAGE_SLOTS.flatMap((def) =>
  def.dark ? [def.light, def.dark] : [def.light],
);
