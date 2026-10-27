import { describe, expect, it } from 'vitest';
import { OG_PAGES, ogPageFor } from './seo-pages';
import { SeoReadSchema, SeoSchema } from './settings';

describe('OG_PAGES', () => {
  const stored = Object.keys(SeoSchema.shape);
  const read = Object.keys(SeoReadSchema.shape);

  it.each(OG_PAGES)('$page names a stored field and a resolved key', (def) => {
    expect(stored).toContain(def.field);
    expect(read).toContain(def.key);
  });

  it('covers every per-page share field — none is left without a control', () => {
    const fields = stored.filter((field) => /^og.+AssetId$/.test(field) && field !== 'ogImageAssetId');
    expect(OG_PAGES.map((def) => def.field).sort()).toEqual(fields.sort());
  });

  it('matches a section and its children on a segment boundary', () => {
    expect(ogPageFor('/practice')?.page).toBe('practice');
    expect(ogPageFor('/practice/1')?.page).toBe('practice');
    expect(ogPageFor('/courses/intro')?.page).toBe('courses');
    expect(ogPageFor('/practiced')).toBeUndefined();
    expect(ogPageFor('/')).toBeUndefined();
  });
});
