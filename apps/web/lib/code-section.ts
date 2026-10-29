import type { StudentSection } from '@ayman/contracts/onboarding';
import type { Taxonomy } from '@ayman/contracts/taxonomy';
import { FIXED_SYSTEM_SLUG, fixedSectionFor } from '@/lib/section-defaults';
import { ASKS_GRADE } from '@/lib/tenant-grades';
import { TEACHES_CODE } from '@/lib/tenant-subject';

/**
 * A programming stack that ALSO names its grades — `TENANT_GRADES` beside
 * `programming_cs`.
 *
 * ## Why a programming stack needs grades at all
 *
 * Every programming stack was one section: البكالوريا, مسار الهندسة وعلوم
 * الحاسب, البرمجة — so the student was asked their year and nothing else
 * (`lib/section-defaults.ts`). منصة الخبير (2026-10-28) teaches programming
 * to «تالتة إعدادي» too, and a year select cannot say that: year 3 there is
 * «الصف الثالث بكالوريا», and the student would be filed in a system they are
 * not in, with a track and an elective they never chose.
 *
 * So on that stack the student picks ONE grade card, the same select a
 * non-programming stack with grades shows (`<SectionPickers>`), and:
 *
 * - a البكالوريا grade gets the fixed section, exactly what the year select
 *   always wrote — so the stack's existing students and courses still match;
 * - any other grade (الإعدادية) is its system and year alone. الإعدادية has
 *   no tracks and no electives, so there is nothing else to fill in.
 *
 * Unset `TENANT_GRADES` is `CODE_ASKS_GRADE === false`, and every programming
 * stack — his included, which ignores the variable — runs the year select
 * byte-identically.
 *
 * A NEW module, not more exports on `section-defaults.ts`, for the Turbopack
 * reason `lib/tenant-subject.ts` gives.
 */
export const CODE_ASKS_GRADE = TEACHES_CODE && ASKS_GRADE;

/** The section a programming stack writes for what the student chose. */
export function codeSectionFor(
  taxonomy: Taxonomy,
  values: { system?: string; year: number },
): StudentSection {
  if (CODE_ASKS_GRADE && values.system !== undefined && values.system !== FIXED_SYSTEM_SLUG) {
    const system = taxonomy.systems.find((s) => s.slug === values.system);
    if (system) {
      return {
        system: system.slug as NonNullable<StudentSection['system']>,
        year: values.year,
        trackId: undefined,
        electiveSubjectId: undefined,
      };
    }
  }
  return fixedSectionFor(taxonomy, values.year);
}
