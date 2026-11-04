import { GRADES, PREPARATORY_SYSTEM } from '@ayman/contracts/grades';
import type { PrismaClient } from '../generated/prisma/client';

type Db = Pick<PrismaClient, 'educationSystem' | 'academicYear' | 'subject' | 'subjectOffering'>;

/**
 * «المرحلة الإعدادية» — the system, its three years, and the stack's own
 * subject opened on each — created if missing, idempotent.
 *
 * Two callers, one shape: the seed on every boot for a stack whose
 * `TENANT_GRADES` (or saved «الصفوف») names a prep grade, and
 * `PATCH /admin/settings/grades` the moment an admin ticks one — so a teacher
 * who adds «أولى إعدادي» from the dashboard can create a course for it
 * without waiting for a deploy.
 *
 * Seeded only where it is taught: `GET /api/taxonomy` lists every system row
 * (there is no `is_active` column), so a row on a stack that does not teach
 * it would sit in every admin picker. Nothing deletes it when the grade is
 * later unticked — a course or a profile may point at it by then, and a
 * dangling FK is worse than an unused row; the pickers filter by the saved
 * grades instead.
 *
 * `sortOrder: -1` puts it first: the course form defaults to
 * `taxonomy.systems[0]`. `totalMarks` must be positive —
 * `EducationSystemSchema` refuses 0, and one refused system empties the whole
 * taxonomy the onboarding reads (280 is الشهادة الإعدادية's total). The
 * subject offering is findFirst + create because `trackId: null` makes the
 * unique key NULL-distinct; `assertOfferingExists` refuses a course whose
 * (system, year, subject) has no offering.
 */
export async function ensurePreparatorySystem(db: Db, subjectSlug: string | null): Promise<void> {
  const preparatory = await db.educationSystem.upsert({
    where: { slug: PREPARATORY_SYSTEM.slug },
    update: { nameAr: PREPARATORY_SYSTEM.nameAr, totalMarks: 280 },
    create: {
      slug: PREPARATORY_SYSTEM.slug,
      nameAr: PREPARATORY_SYSTEM.nameAr,
      totalMarks: 280,
      passPercent: 50,
      allowsRetakes: false,
      sortOrder: -1,
    },
  });

  const subject =
    subjectSlug === null
      ? null
      : await db.subject.findUnique({ where: { slug: subjectSlug }, select: { id: true } });

  for (const grade of GRADES.filter((g) => g.system === PREPARATORY_SYSTEM.slug)) {
    await db.academicYear.upsert({
      where: { systemId_year: { systemId: preparatory.id, year: grade.year } },
      update: { labelAr: grade.labelAr, badgeAr: grade.year === 3 ? 'سنة شهادة' : 'سنة نقل' },
      create: {
        systemId: preparatory.id,
        year: grade.year,
        labelAr: grade.labelAr,
        badgeAr: grade.year === 3 ? 'سنة شهادة' : 'سنة نقل',
        sortOrder: grade.year,
      },
    });
    if (!subject) continue;
    const where = { systemId: preparatory.id, year: grade.year, trackId: null, subjectId: subject.id };
    const existing = await db.subjectOffering.findFirst({ where, select: { id: true } });
    if (!existing) {
      await db.subjectOffering.create({ data: { ...where, countsTowardTotal: true, sortOrder: 0 } });
    }
  }
}
