import { describe, expect, it } from 'vitest';
import { HomeBlockPropsSchema, HomeBlockReorderSchema, StatsPropsSchema } from './home-blocks';

describe('HomeBlockPropsSchema', () => {
  it('rejects a hero variant missing its required headline', () => {
    expect(HomeBlockPropsSchema.safeParse({ type: 'hero', items: [] }).success).toBe(false);
  });

  it('accepts a minimal valid hero variant', () => {
    expect(HomeBlockPropsSchema.safeParse({ type: 'hero', headlineAr: 'مرحبًا بيك' }).success).toBe(true);
  });
});

describe('StatsPropsSchema', () => {
  it('rejects 5 stat items — the cap is 4', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ labelAr: `عنصر ${i}`, value: String(i) }));
    expect(StatsPropsSchema.safeParse({ type: 'stats', items }).success).toBe(false);
  });

  it('accepts exactly 4 stat items', () => {
    const items = Array.from({ length: 4 }, (_, i) => ({ labelAr: `عنصر ${i}`, value: String(i) }));
    expect(StatsPropsSchema.safeParse({ type: 'stats', items }).success).toBe(true);
  });
});

describe('HomeBlockReorderSchema', () => {
  it('rejects a duplicated id', () => {
    const id = '0191f2a0-1111-7000-8000-000000000000';
    expect(HomeBlockReorderSchema.safeParse({ ids: [id, id] }).success).toBe(false);
  });
});
