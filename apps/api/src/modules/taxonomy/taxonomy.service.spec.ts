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
    expect(year2?.labelAr).toBe('الصف الثاني بكالوريا');
    expect(year2?.badgeAr).toBe('سنة شهادة');
  });

  /**
   * The other half of the same rule, and the reason it is asserted separately:
   * the label is PER-SYSTEM now, and the failure mode this guards against is a
   * migration or a seed edit that renames the word everywhere instead of
   * inside one system. «الثانوي» is the right name here and only here.
   */
  it('keeps الثانوية العامة on «الثانوي» for the same year number', async () => {
    const { systems } = await service.getTaxonomy();
    const tha = systems.find((s) => s.slug === 'thanaweya_amma');
    expect(tha?.years.find((y) => y.year === 2)?.labelAr).toBe('الصف الثاني الثانوي');
  });

  /**
   * The fix this file's own existing cases could not catch: `electiveGroups`
   * was the ONLY subject source the create-course form had, and it is empty
   * for every ثانوية عامة track (the case right above) AND for year 1 of
   * either system (no track exists yet to even look at). `system.subjects`
   * is the plain-offering sibling that makes both of those submittable.
   */
  it('gives both systems plain, trackless year-1 subjects — the combo electiveGroups can never cover', async () => {
    const { systems } = await service.getTaxonomy();
    for (const slug of ['bacalorya', 'thanaweya_amma']) {
      const system = systems.find((s) => s.slug === slug);
      const year1 = system?.subjects.filter((option) => option.year === 1) ?? [];
      expect(year1.length).toBeGreaterThan(0);
      for (const option of year1) {
        expect(option.trackId).toBeNull();
        // The submittable value is the SubjectOffering id, never the bare Subject id.
        expect(option.id).not.toBe(option.subjectId);
      }
    }
  });

  it('gives الثانوية العامة tracks no plain subjects beyond year 1 — documented gap, not this fix', async () => {
    const { systems } = await service.getTaxonomy();
    const tha = systems.find((s) => s.slug === 'thanaweya_amma');
    const beyondYear1 = tha?.subjects.filter((option) => option.year !== 1) ?? [];
    expect(beyondYear1).toEqual([]);
  });

  it('gives every تانية بكالوريا track its own 3 shared plain subjects', async () => {
    const { systems } = await service.getTaxonomy();
    const bac = systems.find((s) => s.slug === 'bacalorya');
    const engineering = bac?.tracks.find((t) => t.slug === 'engineering_cs');
    expect(engineering).toBeDefined();
    const year2Shared = (bac?.subjects ?? []).filter(
      (option) => option.year === 2 && option.trackId === engineering?.id,
    );
    // Shared, not trackless: `YEAR_2_SHARED` is seeded once PER track in
    // `seed.ts` (same 3 subjects, 4 separate `SubjectOffering` rows, one per
    // track), so the form's `trackId` filter must match the SELECTED track —
    // not `null` — or a year-2 picker would show every track's rows at once.
    expect(year2Shared.map((option) => option.subjectSlug).sort()).toEqual([
      'arabic',
      'egyptian_history',
      'first_foreign_language',
    ]);
  });

  /**
   * «الصفحة بتقول المادة دي مش موجودة في المناهج» — صبري، مدرّس برمجة، جرّب
   * كل مسار في البكالوريا وكل واحد رفض. `programming_cs` كانت بس اختيارية
   * داخل مسار الهندسة سنة ٢ (جوه `electiveGroups`)، ومفيش صف ليها في أي
   * مسار تاني ولا في سنة ٣ خالص. المنصة كلها «البرمجة وعلوم الحاسب»، فمدرّس
   * برمجة لازم يقدر يعمل كورس لأي مسار، سنة ٢ أو ٣.
   */
  it('makes البرمجة وعلوم الحاسب reachable for every بكالوريا track, years 2 and 3', async () => {
    const { systems } = await service.getTaxonomy();
    const bac = systems.find((s) => s.slug === 'bacalorya');
    expect(bac).toBeDefined();

    for (const track of bac?.tracks ?? []) {
      for (const year of [2, 3]) {
        const plain = (bac?.subjects ?? []).some(
          (option) => option.subjectSlug === 'programming_cs' && option.year === year && option.trackId === track.id,
        );
        const elective = track.electiveGroups.some(
          (group) => group.year === year && group.options.some((option) => option.subjectSlug === 'programming_cs'),
        );
        expect(plain || elective).toBe(true);
      }
    }
  });
});
