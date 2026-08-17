import type { StudentSection } from '@ayman/contracts/onboarding';
import type { Taxonomy } from '@ayman/contracts/taxonomy';

/**
 * The three questions this platform stopped asking.
 *
 * ## Why they are constants and not selects
 *
 * The onboarding wizard used to walk a student through النظام الدراسي →
 * الصف → المسار → المادة الاختيارية, four dependent dropdowns with a cascade
 * between them. Every one of those had exactly one right answer here: this is
 * a البكالوريا platform, it teaches مسار الهندسة وعلوم الحاسب, and the subject
 * is البرمجة وعلوم الحاسب. A dropdown with one correct option is not a
 * question — it is a way to get the answer wrong.
 *
 * So the student is asked their YEAR and nothing else, and this module fills
 * the rest from the taxonomy the form already has in hand.
 *
 * ## Why resolve them from the taxonomy instead of hardcoding ids
 *
 * `Track.id` and `SubjectOffering.id` are per-environment uuid7s — the same
 * reason `OnboardingSchema` puts a SLUG on the wire for the system. Slugs are
 * the only identifiers stable enough to name in code, so the ids are looked up
 * through them at render time. The server re-validates whatever comes back
 * against real rows regardless (S10, `profile.service.ts`); nothing here is
 * trusted.
 */
export const FIXED_SYSTEM_SLUG = 'bacalorya';
export const FIXED_TRACK_SLUG = 'engineering_cs';
export const FIXED_ELECTIVE_SUBJECT_SLUG = 'programming_cs';

/**
 * The highest year on offer, i.e. how far the content actually goes — الأولى
 * and التانية بكالوريا. Deliberately NOT `OnboardingSchema`'s `max(3)`, which
 * describes the education system: البكالوريا has a third year and one day this
 * will too, at which point this is the one line that changes.
 */
export const HIGHEST_OFFERED_YEAR = 2;

/** Tracks are chosen at the start of year 2 — year 1 is common, so it has none. */
const FIRST_TRACKED_YEAR = 2;

export interface YearOption {
  value: string;
  label: string;
}

function fixedSystem(taxonomy: Taxonomy) {
  return taxonomy.systems.find((system) => system.slug === FIXED_SYSTEM_SLUG);
}

/**
 * The year select's options, in the taxonomy's own labels so «الصف الثاني
 * الثانوي» is spelled one way across the wizard, the library headings and the
 * identity strip.
 */
export function offeredYearOptions(taxonomy: Taxonomy): YearOption[] {
  return (fixedSystem(taxonomy)?.years ?? [])
    .filter((year) => year.year <= HIGHEST_OFFERED_YEAR)
    .map((year) => ({ value: String(year.year), label: year.labelAr }));
}

/**
 * The full section payload for a student who has told us only their year.
 *
 * Every branch here returns something `refineSection` accepts, which is the
 * whole point — a form with one visible field must never be able to build a
 * payload whose error lands on a field that is not on screen:
 *
 * - year 1 → no track, no elective (year 1 is common across every track)
 * - year 2 → the engineering track, and البرمجة inside it
 *
 * A taxonomy missing the track or the offering degrades to the year alone
 * rather than throwing. That is a seeding problem, and the student — who was
 * only ever asked one question — is not the one who can fix it.
 *
 * `year` is a plain `number`, not `number | undefined`: it is required on both
 * `OnboardingSchema` and `StudentSectionSchema`, so both callers now hand over
 * a chosen value and the old "no year yet → the system alone" branch became
 * unreachable. Kept as a guard it would only look like protection.
 */
export function fixedSectionFor(taxonomy: Taxonomy, year: number): StudentSection {
  const base: StudentSection = { system: FIXED_SYSTEM_SLUG, year };

  if (year < FIRST_TRACKED_YEAR) return base;

  const track = fixedSystem(taxonomy)?.tracks.find((t) => t.slug === FIXED_TRACK_SLUG);
  if (!track) return base;

  const elective = track.electiveGroups
    .find((group) => group.year === year)
    ?.options.find((option) => option.subjectSlug === FIXED_ELECTIVE_SUBJECT_SLUG);

  return { ...base, trackId: track.id, electiveSubjectId: elective?.id };
}
