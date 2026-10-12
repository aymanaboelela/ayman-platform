import { describe, expect, it } from 'vitest';
import { BrandingSchema } from './settings';
import { tenantBrandingDefaults } from './tenant-branding';

describe('tenantBrandingDefaults', () => {
  it('is empty when nothing is set — every existing stack keeps the schema defaults', () => {
    expect(tenantBrandingDefaults({})).toEqual({});
    expect(BrandingSchema.parse(tenantBrandingDefaults({}))).toEqual(BrandingSchema.parse({}));
  });

  it('carries a valid preset and accent into a branding the schema accepts', () => {
    const picked = tenantBrandingDefaults({ TENANT_LANDING_PRESET: 'board', TENANT_ACCENT: 'blue' });
    expect(picked).toEqual({ landingPreset: 'board', accent: 'blue' });
    expect(BrandingSchema.parse(picked)).toMatchObject({ landingPreset: 'board', accent: 'blue' });
  });

  it('ignores a typo instead of failing a boot over a cosmetic setting', () => {
    expect(tenantBrandingDefaults({ TENANT_LANDING_PRESET: 'bord', TENANT_ACCENT: 'red' })).toEqual({});
  });
});
