import type { StudentSection } from '@ayman/contracts/onboarding';
import type { Taxonomy } from '@ayman/contracts/taxonomy';
import { subjectCopy } from '@ayman/contracts/copy/subject';
import { TENANT_SUBJECT } from '@/lib/tenant-subject';

/**
 * The section a student gives on a stack that does NOT teach code — the three
 * questions `lib/section-defaults.ts` stopped asking, asked again.
 *
 * ## Why they come back here and only here
 *
 * `section-defaults.ts` fills the system, the track and the elective from the
 * taxonomy because a programming stack has exactly one right answer for each:
 * البكالوريا, مسار الهندسة وعلوم الحاسب, البرمجة. None of that is true of a
 * physics teacher. Physics is taught in الثانوية العامة AND in البكالوريا, in
 * years one to three, on four Bakalorya tracks and three Thanaweya ones — so
 * filling those answers in would file every one of their students as a
 * second-year Bakalorya engineering student studying programming, and
 * `/library` (which groups a student's own courses by year and track) would
 * show them the wrong shelf.
 *
 * So on that kind of stack the student is asked: the system, then the year
 * (its labels come from the chosen system — «الصف الثاني الثانوي» in one,
 * «الصف الثاني بكالوريا» in the other), then the track from year two on. The
 * elective is still not asked: it is filled in when the stack's own subject is
 * one of the track's options that year, which is the one case the platform can
 * know.
 *
 * ## Nothing here is trusted
 *
 * The API re-checks every id against real rows (S10 in `profile.service.ts`):
 * the track must belong to the system, the elective to the track and the year.
 * What these helpers guarantee is the other half — that the payload they build
 * is one `refineSection` accepts, so no error can land on a field that is not
 * on screen.
 *
 * A NEW module rather than more exports on `section-defaults.ts`, for the
 * Turbopack reason `lib/tenant-subject.ts` gives.
 */

/** Tracks start at year 2 in both systems — year 1 is common. */
const FIRST_TRACKED_YEAR = 2;

export interface SectionOption {
  value: string;
  label: string;
}

type SystemSlug = NonNullable<StudentSection['system']>;

function systemOf(taxonomy: Taxonomy, slug: string | undefined) {
  return slug === undefined ? undefined : taxonomy.systems.find((system) => system.slug === slug);
}

/** Every system the taxonomy offers, in its own order and its own names. */
export function systemOptions(taxonomy: Taxonomy): SectionOption[] {
  return taxonomy.systems.map((system) => ({ value: system.slug, label: system.nameAr }));
}

/**
 * The chosen system's years, labelled by that system — or none until one is
 * chosen. Empty rather than a guess: the two systems spell every year
 * differently, and a label from the wrong one is the bug
 * `20260818120000_bacalorya_year_labels` was written to stop.
 */
export function yearOptionsFor(taxonomy: Taxonomy, system: string | undefined): SectionOption[] {
  return (systemOf(taxonomy, system)?.years ?? []).map((year) => ({
    value: String(year.year),
    label: year.labelAr,
  }));
}

/** The chosen system's tracks for that year — none in year 1, none without a system. */
export function trackOptionsFor(
  taxonomy: Taxonomy,
  system: string | undefined,
  year: number | undefined,
): SectionOption[] {
  if (year === undefined || year < FIRST_TRACKED_YEAR) return [];
  return (systemOf(taxonomy, system)?.tracks ?? [])
    .filter((track) => track.minYear <= year)
    .map((track) => ({ value: track.id, label: track.labelAr }));
}

/**
 * The questions this form can demand but the schema cannot — `system` and
 * `trackId` are optional on `OnboardingSchema`, because a programming stack
 * never sends them. Same shape as `centerFieldErrors`: field → Arabic message.
 */
export function sectionFieldErrors(
  values: { system?: string; year?: number; trackId?: string },
  taxonomy: Taxonomy,
): Partial<Record<'system' | 'trackId', string>> {
  const issues: Partial<Record<'system' | 'trackId', string>> = {};
  if (!systemOf(taxonomy, values.system)) issues.system = subjectCopy.onboarding.systemError;
  const tracks = trackOptionsFor(taxonomy, values.system, values.year);
  if (tracks.length > 0 && !tracks.some((track) => track.value === values.trackId)) {
    issues.trackId = subjectCopy.onboarding.trackError;
  }
  return issues;
}

/**
 * The section payload for what the student chose.
 *
 * - no known system → the year alone (the form's own check stops this from
 *   being submitted; this only refuses to invent a system)
 * - year 1 → the system and the year — year 1 has no track in either system
 * - a track that is not one of that system's for that year → dropped
 * - البكالوريا year 2 → the elective too, when THIS stack's subject is one of
 *   the chosen track's options that year; otherwise none, which
 *   `refineSection` accepts (an elective nobody asked about is not a user
 *   error)
 *
 * ⚠️ All four keys are ALWAYS present, `undefined` where they do not apply,
 * and that is load-bearing. The callers spread this LAST over the form's
 * values, and react-hook-form keeps a field's value after its select unmounts:
 * a student who picked a track in year 2 and then went back to year 1 still
 * holds that `trackId`. A result that merely OMITTED the key would let it ride
 * through into the payload, and `refineSection` would answer «الصف الأول لا
 * يختار مسارًا بعد» on a field that is no longer on screen. `JSON.stringify`
 * drops the `undefined`s on the way out, so the API never sees them.
 */
export function subjectSectionFor(
  taxonomy: Taxonomy,
  values: { system?: string; year: number; trackId?: string },
): StudentSection {
  const none = { system: undefined, trackId: undefined, electiveSubjectId: undefined };
  const system = systemOf(taxonomy, values.system);
  if (!system) return { ...none, year: values.year };

  const base: StudentSection = { ...none, system: system.slug as SystemSlug, year: values.year };
  const trackId = trackOptionsFor(taxonomy, system.slug, values.year).find(
    (track) => track.value === values.trackId,
  )?.value;
  if (trackId === undefined) return base;

  const elective =
    system.slug === 'bacalorya' && values.year === 2
      ? system.tracks
          .find((track) => track.id === trackId)
          ?.electiveGroups.find((group) => group.year === values.year)
          ?.options.find((option) => option.subjectSlug === TENANT_SUBJECT)
      : undefined;

  return { ...base, trackId, electiveSubjectId: elective?.id };
}

/**
 * A stored system id back to the slug the form speaks — for «بياناتك».
 *
 * Narrowed to the two slugs `OnboardingSystemSchema` accepts: a third system
 * added to the taxonomy without the schema would otherwise prefill a value the
 * form's own resolver refuses on save.
 */
export function systemSlugOf(
  taxonomy: Taxonomy,
  systemId: string | null | undefined,
): SystemSlug | undefined {
  if (!systemId) return undefined;
  const slug = taxonomy.systems.find((system) => system.id === systemId)?.slug;
  return slug === 'bacalorya' || slug === 'thanaweya_amma' ? slug : undefined;
}
