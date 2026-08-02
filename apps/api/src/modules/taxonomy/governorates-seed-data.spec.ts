import { GOVERNORATES, PINNED_GOVERNORATE_CODES } from '../../scripts/seed-data/governorates';

const VALID_REGIONS = new Set(['urban', 'lower', 'upper', 'frontier']);

describe('GOVERNORATES seed data', () => {
  it('has exactly 27 entries', () => {
    expect(GOVERNORATES).toHaveLength(27);
  });

  it('is keyed by unique two-digit codes', () => {
    const codes = GOVERNORATES.map((g) => g.code);
    expect(new Set(codes).size).toBe(27);
    for (const code of codes) {
      expect(code).toMatch(/^\d{2}$/);
    }
  });

  it('has unique slugs', () => {
    const slugs = GOVERNORATES.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(27);
  });

  it('only uses the four known regions', () => {
    for (const g of GOVERNORATES) {
      expect(VALID_REGIONS.has(g.region)).toBe(true);
    }
  });

  it('is ordered by official national-ID code, not alphabetically', () => {
    // القاهرة (Cairo) is code '01' and must be first — an alphabetical sort by
    // nameAr would not put it there. جنوب سيناء (code '35') must be last.
    expect(GOVERNORATES[0]).toMatchObject({ code: '01', nameAr: 'القاهرة', slug: 'cairo' });
    expect(GOVERNORATES[GOVERNORATES.length - 1]).toMatchObject({
      code: '35',
      nameAr: 'جنوب سيناء',
      slug: 'south_sinai',
    });

    const alphabetical = [...GOVERNORATES].sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));
    expect(GOVERNORATES.map((g) => g.code)).not.toEqual(alphabetical.map((g) => g.code));
  });

  it('does not include code 88 (خارج الجمهورية), which is a national-ID code, not a governorate', () => {
    const codes: readonly string[] = GOVERNORATES.map((g) => g.code);
    expect(codes.includes('88')).toBe(false);
  });

  it('pins codes that all exist among the governorates', () => {
    const codes = new Set(GOVERNORATES.map((g) => g.code));
    for (const pinned of PINNED_GOVERNORATE_CODES) {
      expect(codes.has(pinned)).toBe(true);
    }
  });
});
