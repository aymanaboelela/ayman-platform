// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { TaxonomySchema } from '@ayman/contracts';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { TaxonomyService } from './taxonomy.service';
import { PrismaService } from '../../prisma/prisma.service';

// Integration test against the real seeded database — mocks here would only
// prove the mock matches itself.
describe('TaxonomyService', () => {
  let prisma: PrismaService;
  let service: TaxonomyService;

  beforeAll(async () => {
    // Prisma 7 requires a driver adapter at construction time — a bare
    // `new PrismaClient()` throws (see PrismaService for the same wiring).
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as PrismaService;
    await prisma.$connect();
    service = new TaxonomyService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns a payload matching the shared contract exactly', async () => {
    const taxonomy = await service.getTaxonomy();
    expect(() => TaxonomySchema.parse(taxonomy)).not.toThrow();
  });

  it('returns all 27 governorates in official code order, not alphabetical', async () => {
    const { governorates } = await service.getTaxonomy();
    expect(governorates).toHaveLength(27);
    expect(governorates[0]?.code).toBe('01');
    expect(governorates[0]?.nameAr).toBe('القاهرة');
    expect(governorates.at(-1)?.code).toBe('35');

    const codes = governorates.map((g) => g.code);
    expect([...codes]).toEqual([...codes].sort());
    // Alphabetical Arabic order would NOT start with القاهرة.
    const alphabetical = [...governorates].sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));
    expect(alphabetical[0]?.nameAr).not.toBe(governorates[0]?.nameAr);
  });

  it('exposes البكالوريا as 600 marks at 70% with retakes allowed', async () => {
    const { systems } = await service.getTaxonomy();
    const bac = systems.find((s) => s.slug === 'bacalorya');
    expect(bac).toBeDefined();
    expect(bac?.totalMarks).toBe(600);
    expect(bac?.passPercent).toBe(70);
    expect(bac?.allowsRetakes).toBe(true);
  });

  it('gives البكالوريا exactly four tracks, none available before year 2', async () => {
    const { systems } = await service.getTaxonomy();
    const bac = systems.find((s) => s.slug === 'bacalorya');
    expect(bac?.tracks).toHaveLength(4);
    for (const track of bac?.tracks ?? []) expect(track.minYear).toBe(2);
    expect(bac?.tracks.map((t) => t.slug).sort()).toEqual([
      'arts_humanities',
      'business',
      'engineering_cs',
      'medicine_life_sciences',
    ]);
  });

  it('keeps الثانوية العامة alive in parallel with three شعب', async () => {
    const { systems } = await service.getTaxonomy();
    const tha = systems.find((s) => s.slug === 'thanaweya_amma');
    expect(tha).toBeDefined();
    expect(tha?.totalMarks).toBe(320);
    expect(tha?.tracks).toHaveLength(3);
  });

  it('exposes exactly one year-2 elective group of 2 options per بكالوريا track', async () => {
    const { systems } = await service.getTaxonomy();
    const bac = systems.find((s) => s.slug === 'bacalorya');

    const engineering = bac?.tracks.find((t) => t.slug === 'engineering_cs');
    expect(engineering?.electiveGroups).toHaveLength(1);
    const group = engineering?.electiveGroups[0];
    expect(group?.year).toBe(2);
    expect(group?.pickCount).toBe(1);
    expect(group?.options).toHaveLength(2);
    expect(group?.options.map((o) => o.subjectSlug).sort()).toEqual([
      'chemistry',
      'programming_cs',
    ]);
    // The submittable value is the SubjectOffering id, never the bare Subject id.
    for (const option of group?.options ?? []) {
      expect(option.id).not.toBe(option.subjectSlug);
      expect(typeof option.id).toBe('string');
      expect(option.nameAr.length).toBeGreaterThan(0);
    }
  });

  it('gives every البكالوريا track its own distinct elective pair', async () => {
    const { systems } = await service.getTaxonomy();
    const bac = systems.find((s) => s.slug === 'bacalorya');

    const bySlug = new Map(bac?.tracks.map((t) => [t.slug, t]));
    expect(bySlug.get('medicine_life_sciences')?.electiveGroups[0]?.options.map((o) => o.subjectSlug).sort()).toEqual(['mathematics', 'physics']);
    expect(bySlug.get('business')?.electiveGroups[0]?.options.map((o) => o.subjectSlug).sort()).toEqual(['accounting', 'business_administration']);
    expect(bySlug.get('arts_humanities')?.electiveGroups[0]?.options.map((o) => o.subjectSlug).sort()).toEqual(['psychology', 'second_foreign_language']);
  });

  it('leaves الثانوية العامة tracks with no elective groups at all', async () => {
    const { systems } = await service.getTaxonomy();
    const tha = systems.find((s) => s.slug === 'thanaweya_amma');
    for (const track of tha?.tracks ?? []) {
      expect(track.electiveGroups).toEqual([]);
    }
  });

  it('labels year 2 البكالوريا as a certificate year', async () => {
    const { systems } = await service.getTaxonomy();
    const bac = systems.find((s) => s.slug === 'bacalorya');
    const year2 = bac?.years.find((y) => y.year === 2);
    expect(year2?.labelAr).toBe('الصف الثاني الثانوي');
    expect(year2?.badgeAr).toBe('سنة شهادة');
  });
});
