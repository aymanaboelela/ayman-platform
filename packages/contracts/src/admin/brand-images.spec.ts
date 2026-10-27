import { describe, expect, it } from 'vitest';
import { BRAND_IMAGE_FIELDS, BRAND_IMAGE_SLOTS, BRAND_IMAGE_SLOT_IDS } from './brand-images';
import { BrandingReadSchema, BrandingSchema } from './settings';

/*
 * The table's field names are built from template strings and cast, so the
 * type system cannot see a typo in them — `heroDarkAsetId` would compile and
 * then never be stored, resolved or rendered. These assertions are what can.
 */
describe('BRAND_IMAGE_SLOTS', () => {
  const stored = Object.keys(BrandingSchema.shape);
  const read = Object.keys(BrandingReadSchema.shape);

  it('has one row per slot id, in order', () => {
    expect(BRAND_IMAGE_SLOTS.map((def) => def.slot)).toEqual([...BRAND_IMAGE_SLOT_IDS]);
  });

  it.each(BRAND_IMAGE_SLOTS)('$slot names fields that BrandingSchema stores', (def) => {
    expect(stored).toContain(def.light);
    expect(stored).toContain(def.dark);
  });

  it.each(BRAND_IMAGE_SLOTS)('$slot names keys that BrandingReadSchema returns', (def) => {
    expect(read).toContain(def.lightKey);
    expect(read).toContain(def.darkKey);
  });

  it('covers every asset field on the branding section — none is left without a control', () => {
    const assetFields = stored.filter((field) => field.endsWith('AssetId'));
    expect([...BRAND_IMAGE_FIELDS].sort()).toEqual(assetFields.sort());
  });

  it('parses a row stored before dark slots existed, with every new slot empty', () => {
    const parsed = BrandingSchema.parse({ heroAssetId: '0f9a3c2e-8d4b-4a1f-9c3e-2b7d6e5f4a10' });
    expect(parsed.heroAssetId).not.toBeNull();
    expect(parsed.heroDarkAssetId).toBeNull();
    expect(parsed.markAssetId).toBeNull();
  });
});
