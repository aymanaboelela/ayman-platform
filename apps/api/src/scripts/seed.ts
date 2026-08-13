import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { FLAG_DECLARATIONS } from '@ayman/contracts/admin/flags';
import { SiteSettingsSchema } from '@ayman/contracts/admin/settings';
import { OFFICIAL_PROFILES } from '@ayman/contracts/site-profiles';
import { copy } from '@ayman/contracts/copy';
import { PrismaClient, type Region } from '../generated/prisma/client';
import { GOVERNORATES } from './seed-data/governorates';
import { SITE_SETTINGS_ID } from '../modules/admin/admin.constants';

// Prisma 7 requires a driver adapter at construction time (see Task 8's
// prisma.service.ts) — bare `new PrismaClient()` throws. Seeding is pure DML
// (upserts/inserts/updates), so the runtime role (DATABASE_URL) is sufficient;
// it never needs the owner/DDL connection that `prisma migrate` uses.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Subjects are canonical names only — no grading semantics live here. */
const SUBJECTS = [
  { slug: 'arabic', nameAr: 'اللغة العربية' },
  { slug: 'first_foreign_language', nameAr: 'اللغة الأجنبية الأولى' },
  { slug: 'second_foreign_language', nameAr: 'اللغة الأجنبية الثانية' },
  { slug: 'egyptian_history', nameAr: 'التاريخ المصري' },
  { slug: 'mathematics', nameAr: 'الرياضيات' },
  { slug: 'integrated_science', nameAr: 'العلوم المتكاملة' },
  { slug: 'philosophy_logic', nameAr: 'الفلسفة والمنطق' },
  { slug: 'religious_education', nameAr: 'التربية الدينية' },
  { slug: 'programming_cs', nameAr: 'البرمجة وعلوم الحاسب' },
  { slug: 'physics', nameAr: 'الفيزياء' },
  { slug: 'chemistry', nameAr: 'الكيمياء' },
  { slug: 'biology', nameAr: 'الأحياء' },
  { slug: 'accounting', nameAr: 'المحاسبة' },
  { slug: 'business_administration', nameAr: 'إدارة الأعمال' },
  { slug: 'psychology', nameAr: 'علم النفس' },
  { slug: 'economics', nameAr: 'الاقتصاد' },
  { slug: 'geography', nameAr: 'الجغرافيا' },
  { slug: 'statistics', nameAr: 'الإحصاء' },
] as const;

const BACALORYA_TRACKS = [
  {
    slug: 'medicine_life_sciences',
    labelAr: 'مسار الطب وعلوم الحياة',
    aliases: ['الطب والعلوم الحيوية', 'الطب والصحة'],
    faculties: ['الطب البشري', 'طب الأسنان', 'الصيدلة', 'العلاج الطبيعي', 'التمريض', 'الطب البيطري', 'العلوم', 'الزراعة'],
    electives: ['mathematics', 'physics'],
  },
  {
    slug: 'engineering_cs',
    labelAr: 'مسار الهندسة وعلوم الحاسب',
    aliases: ['مسار الهندسة والحاسبات', 'العلوم الهندسية والتكنولوجيا'],
    faculties: ['الهندسة', 'الحاسبات والمعلومات', 'الذكاء الاصطناعي', 'الاتصالات والإلكترونيات', 'التخطيط العمراني'],
    electives: ['chemistry', 'programming_cs'],
  },
  {
    slug: 'business',
    labelAr: 'مسار الأعمال',
    aliases: ['قطاع الأعمال', 'إدارة الأعمال'],
    faculties: ['التجارة', 'إدارة الأعمال', 'المحاسبة', 'التسويق', 'التمويل', 'الاقتصاد', 'اللوجستيات'],
    electives: ['accounting', 'business_administration'],
  },
  {
    slug: 'arts_humanities',
    labelAr: 'مسار الآداب والفنون',
    aliases: ['الآداب والعلوم الإنسانية', 'الفنون والتصميم'],
    faculties: ['الألسن', 'الآداب', 'الإعلام', 'الحقوق', 'الآثار', 'السياحة والفنادق', 'الفنون الجميلة', 'الخدمة الاجتماعية'],
    electives: ['psychology', 'second_foreign_language'],
  },
] as const;

const THANAWEYA_TRACKS = [
  { slug: 'science_science', labelAr: 'علمي علوم', aliases: [] },
  { slug: 'science_math', labelAr: 'علمي رياضة', aliases: [] },
  { slug: 'literary', labelAr: 'أدبي', aliases: [] },
] as const;

/** Common to BOTH systems — grade 1 is non-specialized. */
const YEAR_1_SUBJECTS = [
  { slug: 'arabic', counts: true },
  { slug: 'first_foreign_language', counts: true },
  { slug: 'egyptian_history', counts: true },
  { slug: 'mathematics', counts: true },
  { slug: 'integrated_science', counts: true },
  { slug: 'philosophy_logic', counts: true },
  { slug: 'religious_education', counts: false, passOverride: 70 },
  { slug: 'second_foreign_language', counts: false },
  { slug: 'programming_cs', counts: false },
] as const;

/** Shared across all four مسارات in grade 2 البكالوريا. */
const YEAR_2_SHARED = ['arabic', 'first_foreign_language', 'egyptian_history'] as const;

async function main(): Promise<void> {
  // ── governorates ────────────────────────────────────────────────────
  for (const [index, g] of GOVERNORATES.entries()) {
    await prisma.governorate.upsert({
      where: { code: g.code },
      update: { nameAr: g.nameAr, slug: g.slug, region: g.region as Region, sortOrder: index },
      create: { code: g.code, nameAr: g.nameAr, slug: g.slug, region: g.region as Region, sortOrder: index },
    });
  }

  // ── subjects ────────────────────────────────────────────────────────
  const subjectIdBySlug = new Map<string, string>();
  for (const s of SUBJECTS) {
    const row = await prisma.subject.upsert({
      where: { slug: s.slug },
      update: { nameAr: s.nameAr },
      create: { slug: s.slug, nameAr: s.nameAr },
    });
    subjectIdBySlug.set(s.slug, row.id);
  }
  const subjectId = (slug: string): string => {
    const id = subjectIdBySlug.get(slug);
    if (!id) throw new Error(`Seed bug: unknown subject slug "${slug}"`);
    return id;
  };

  // ── systems ─────────────────────────────────────────────────────────
  const bacalorya = await prisma.educationSystem.upsert({
    where: { slug: 'bacalorya' },
    update: {},
    create: {
      slug: 'bacalorya',
      nameAr: 'البكالوريا المصرية',
      totalMarks: 600,
      passPercent: 70,
      allowsRetakes: true,
      sortOrder: 0,
    },
  });

  const thanaweya = await prisma.educationSystem.upsert({
    where: { slug: 'thanaweya_amma' },
    update: {},
    create: {
      slug: 'thanaweya_amma',
      nameAr: 'الثانوية العامة',
      totalMarks: 320,
      passPercent: 50,
      allowsRetakes: false,
      sortOrder: 1,
    },
  });

  // ── academic years ──────────────────────────────────────────────────
  const YEARS = [
    { year: 1, labelAr: 'الصف الأول الثانوي', bac: 'مرحلة تمهيدية', tha: 'سنة نقل' },
    { year: 2, labelAr: 'الصف الثاني الثانوي', bac: 'سنة شهادة', tha: 'سنة نقل' },
    { year: 3, labelAr: 'الصف الثالث الثانوي', bac: 'سنة شهادة', tha: 'سنة شهادة' },
  ];
  for (const y of YEARS) {
    for (const [system, badge] of [
      [bacalorya, y.bac],
      [thanaweya, y.tha],
    ] as const) {
      await prisma.academicYear.upsert({
        where: { systemId_year: { systemId: system.id, year: y.year } },
        update: { labelAr: y.labelAr, badgeAr: badge },
        create: {
          systemId: system.id,
          year: y.year,
          labelAr: y.labelAr,
          badgeAr: badge,
          sortOrder: y.year,
        },
      });
    }
  }

  // ── tracks ──────────────────────────────────────────────────────────
  const bacTrackIdBySlug = new Map<string, string>();
  for (const [index, t] of BACALORYA_TRACKS.entries()) {
    const track = await prisma.track.upsert({
      where: { systemId_slug: { systemId: bacalorya.id, slug: t.slug } },
      update: { labelAr: t.labelAr, aliases: [...t.aliases], sortOrder: index },
      create: {
        systemId: bacalorya.id,
        slug: t.slug,
        labelAr: t.labelAr,
        aliases: [...t.aliases],
        minYear: 2,
        sortOrder: index,
      },
    });
    bacTrackIdBySlug.set(t.slug, track.id);

    await prisma.trackFaculty.deleteMany({ where: { trackId: track.id } });
    await prisma.trackFaculty.createMany({
      data: t.faculties.map((nameAr, i) => ({ trackId: track.id, nameAr, sortOrder: i })),
    });
  }

  for (const [index, t] of THANAWEYA_TRACKS.entries()) {
    await prisma.track.upsert({
      where: { systemId_slug: { systemId: thanaweya.id, slug: t.slug } },
      update: { labelAr: t.labelAr, sortOrder: index },
      create: {
        systemId: thanaweya.id,
        slug: t.slug,
        labelAr: t.labelAr,
        aliases: [],
        minYear: 2,
        sortOrder: index,
      },
    });
  }

  // ── year 1 offerings (identical for both systems, no track) ─────────
  // These rows have track_id IS NULL. Postgres treats NULLs as distinct, so the
  // composite unique constraint does not identify them and `upsert` would insert
  // a duplicate on every run. findFirst + create keeps the seed idempotent; the
  // partial unique index added in Task 9 is the database-level backstop.
  for (const system of [bacalorya, thanaweya]) {
    for (const [index, s] of YEAR_1_SUBJECTS.entries()) {
      const existing = await prisma.subjectOffering.findFirst({
        where: { systemId: system.id, year: 1, trackId: null, subjectId: subjectId(s.slug) },
        select: { id: true },
      });

      const data = {
        countsTowardTotal: s.counts,
        passPercentOverride: 'passOverride' in s ? s.passOverride : null,
        sortOrder: index,
      };

      if (existing) {
        await prisma.subjectOffering.update({ where: { id: existing.id }, data });
      } else {
        await prisma.subjectOffering.create({
          data: {
            systemId: system.id,
            year: 1,
            trackId: null,
            subjectId: subjectId(s.slug),
            ...data,
          },
        });
      }
    }
  }

  // ── year 2 البكالوريا: 3 shared + 1 elective from a pair ────────────
  for (const t of BACALORYA_TRACKS) {
    const trackId = bacTrackIdBySlug.get(t.slug);
    if (!trackId) throw new Error(`Seed bug: track "${t.slug}" was not created`);

    for (const [index, slug] of YEAR_2_SHARED.entries()) {
      await prisma.subjectOffering.upsert({
        where: {
          systemId_year_trackId_subjectId: {
            systemId: bacalorya.id,
            year: 2,
            trackId,
            subjectId: subjectId(slug),
          },
        },
        update: {},
        create: {
          systemId: bacalorya.id,
          year: 2,
          trackId,
          subjectId: subjectId(slug),
          countsTowardTotal: true,
          sortOrder: index,
        },
      });
    }

    const group = await prisma.electiveGroup.upsert({
      where: { trackId_year_labelAr: { trackId, year: 2, labelAr: 'المادة الاختيارية' } },
      update: {},
      create: { trackId, year: 2, labelAr: 'المادة الاختيارية', pickCount: 1 },
    });

    for (const [index, slug] of t.electives.entries()) {
      await prisma.subjectOffering.upsert({
        where: {
          systemId_year_trackId_subjectId: {
            systemId: bacalorya.id,
            year: 2,
            trackId,
            subjectId: subjectId(slug),
          },
        },
        update: { electiveGroupId: group.id },
        create: {
          systemId: bacalorya.id,
          year: 2,
          trackId,
          subjectId: subjectId(slug),
          countsTowardTotal: true,
          electiveGroupId: group.id,
          sortOrder: 10 + index,
        },
      });
    }
  }

  // ── year 3 البكالوريا: 2 specialist subjects per track ──────────────
  const YEAR_3: Record<string, ReadonlyArray<{ slug: string; level: 'advanced' | 'normal' }>> = {
    medicine_life_sciences: [
      { slug: 'biology', level: 'advanced' },
      { slug: 'chemistry', level: 'advanced' },
    ],
    engineering_cs: [
      { slug: 'mathematics', level: 'advanced' },
      { slug: 'physics', level: 'advanced' },
    ],
    business: [
      { slug: 'economics', level: 'advanced' },
      { slug: 'mathematics', level: 'normal' },
    ],
    arts_humanities: [
      { slug: 'geography', level: 'advanced' },
      { slug: 'statistics', level: 'normal' },
    ],
  };

  for (const [trackSlug, subjects] of Object.entries(YEAR_3)) {
    const trackId = bacTrackIdBySlug.get(trackSlug);
    if (!trackId) throw new Error(`Seed bug: track "${trackSlug}" was not created`);

    for (const [index, s] of subjects.entries()) {
      await prisma.subjectOffering.upsert({
        where: {
          systemId_year_trackId_subjectId: {
            systemId: bacalorya.id,
            year: 3,
            trackId,
            subjectId: subjectId(s.slug),
          },
        },
        update: { level: s.level },
        create: {
          systemId: bacalorya.id,
          year: 3,
          trackId,
          subjectId: subjectId(s.slug),
          countsTowardTotal: true,
          level: s.level,
          sortOrder: index,
        },
      });
    }

    // التربية الدينية: every track, every year, 70% to pass, excluded from the total.
    await prisma.subjectOffering.upsert({
      where: {
        systemId_year_trackId_subjectId: {
          systemId: bacalorya.id,
          year: 3,
          trackId,
          subjectId: subjectId('religious_education'),
        },
      },
      update: {},
      create: {
        systemId: bacalorya.id,
        year: 3,
        trackId,
        subjectId: subjectId('religious_education'),
        countsTowardTotal: false,
        passPercentOverride: 70,
        sortOrder: 90,
      },
    });
  }

  // FlagsService.onModuleInit does this same reconciliation on every Nest
  // boot; it is repeated here so a freshly seeded database (CI, a clean
  // local reset) has the full declared set even before the app has ever
  // started once. `enabled` is only set on CREATE — an operator's toggle
  // must survive a re-seed exactly like it survives a deploy.
  for (const declaration of FLAG_DECLARATIONS) {
    await prisma.featureFlag.upsert({
      where: { key: declaration.key },
      create: {
        key: declaration.key,
        descriptionAr: declaration.descriptionAr,
        enabled: declaration.defaultValue,
      },
      update: { descriptionAr: declaration.descriptionAr },
    });
  }

  /*
   * ── Site settings ─────────────────────────────────────────────────────
   *
   * Production ran for months with `site_settings.data` completely empty:
   * no SEO title, no description, and not one contact link. Read off the live
   * API on 2026-08-13 — every field `null` or `''`. The dashboard form was
   * showing empty boxes because the row genuinely held nothing, which is also
   * why nobody noticed that the favicon and OG image were 404ing: you cannot
   * see an image slot fail if no image was ever chosen.
   *
   * The same class of gap `migrate deploy` left in the taxonomy tables, and it
   * gets the same treatment — seeded on every boot from the entrypoint.
   *
   * ## FILL-IF-EMPTY, never overwrite
   *
   * Exactly the rule the feature-flag block above follows for `enabled`: an
   * operator's own value has to survive a re-seed the way it survives a
   * deploy. So each key is written only where the stored value is still the
   * schema's default — `''` for the two SEO strings, `null` for a link. The
   * moment an admin types something in `/admin/settings`, this stops touching
   * that field forever.
   *
   * ## What is deliberately left empty
   *
   * The phone, the WhatsApp number, the WhatsApp channel, the Facebook group
   * and the contact email. None of them are recoverable from this repository,
   * and a guessed contact detail on a live platform is worse than a blank one:
   * it sends a student to a stranger. The footer already renders those
   * channels only when they hold a real destination.
   *
   * Branding assets are absent for the same reason — an asset id has to point
   * at a row in `media_assets`, and inventing one would produce exactly the
   * dangling reference `readBranding()` resolves to `null`.
   */
  const settingsRow = await prisma.siteSetting.findUnique({
    where: { id: SITE_SETTINGS_ID },
    select: { data: true },
  });

  if (settingsRow) {
    const current = SiteSettingsSchema.parse(settingsRow.data ?? {});

    const seo = {
      ...current.seo,
      titleAr: current.seo.titleAr || copy.seo.defaultTitle,
      // `homeDescription`, not `description`: `SeoSchema` caps this at 160
      // characters and the longer one is 200+, so it would fail validation the
      // first time an admin opened the form and pressed save.
      descriptionAr: current.seo.descriptionAr || copy.seo.homeDescription,
    };

    const contact = {
      ...current.contact,
      youtube: current.contact.youtube ?? OFFICIAL_PROFILES.youtube,
      instagram: current.contact.instagram ?? OFFICIAL_PROFILES.instagram,
      tiktok: current.contact.tiktok ?? OFFICIAL_PROFILES.tiktok,
      facebook: current.contact.facebook ?? OFFICIAL_PROFILES.facebook,
    };

    const next = SiteSettingsSchema.parse({ ...current, seo, contact });

    // Compared as a whole rather than field by field, so a boot that changes
    // nothing performs no write at all — this runs on EVERY container start.
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      await prisma.siteSetting.update({
        where: { id: SITE_SETTINGS_ID },
        data: { data: next as never },
      });
      console.log('Seeded site settings (empty fields only).');
    }
  }

  console.log('Seed complete.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
