import { z } from '@ayman/contracts/zod';

export const RegionSchema = z.enum(['urban', 'lower', 'upper', 'frontier']);

export const GovernorateSchema = z.object({
  code: z.string().length(2),
  nameAr: z.string().min(1),
  slug: z.string().min(1),
  region: RegionSchema,
  sortOrder: z.number().int(),
});

export const AcademicYearSchema = z.object({
  year: z.number().int().min(1).max(3),
  labelAr: z.string().min(1),
  badgeAr: z.string().min(1),
});

/**
 * One option inside an elective group — a `subject_offerings` row that has an
 * `elective_group_id` set. `id` is the `SubjectOffering.id`, which is exactly
 * what the client must submit back as `electiveSubjectId` (see
 * `OnboardingSchema` in `onboarding.ts`) — never `Subject.id`, since a
 * subject is only meaningful scoped by `(system, year, track)`.
 */
export const ElectiveOptionSchema = z.object({
  id: z.string(),
  /**
   * `Subject.id` — deliberately DIFFERENT from `id` above (`SubjectOffering.id`).
   * The admin course editor's taxonomy-scoped subject picker (Plan 3 Task 11)
   * needs the actual `Subject.id` to submit as `Course.subjectId`; the
   * onboarding flow keeps using `id` (the offering id) exactly as before.
   * Additive field — nothing that already destructures `{ id, subjectSlug,
   * nameAr }` changes shape.
   */
  subjectId: z.string(),
  subjectSlug: z.string().min(1),
  nameAr: z.string().min(1),
});

/**
 * "Choose exactly `pickCount` of these `options`" for a given track and year.
 * v1 only ever seeds one group per track (year-2 البكالوريا, pickCount 1,
 * 2 options), but the shape doesn't assume that.
 */
export const ElectiveGroupSchema = z.object({
  id: z.string(),
  year: z.number().int(),
  labelAr: z.string().min(1),
  pickCount: z.number().int().positive(),
  options: z.array(ElectiveOptionSchema),
});

/**
 * A plain, non-elective `subject_offerings` row — `elective_group_id IS
 * NULL`. Same four fields as `ElectiveOptionSchema` (same meaning: `id` is
 * the offering, `subjectId` the subject itself) plus `year`/`trackId` to
 * scope it, since this sits at the SYSTEM level, not nested under one track
 * the way `electiveGroups` is — a year-1 subject has no track at all
 * (`trackId: null`), so there is no track node to hang it off.
 */
export const SubjectOfferingOptionSchema = ElectiveOptionSchema.extend({
  year: z.number().int(),
  trackId: z.string().nullable(),
});

export const TrackSchema = z.object({
  id: z.string(),
  slug: z.string().min(1),
  labelAr: z.string().min(1),
  /** Tracks are chosen at the start of year 2 — year 1 has no track at all. */
  minYear: z.number().int(),
  /**
   * Empty for every ثانوية عامة track — only البكالوريا seeds electives.
   * Drives the onboarding UI's elective-subject step; the server
   * re-validates the choice against the DB regardless of what this exposes
   * (S10, `profile.service.ts`).
   */
  electiveGroups: z.array(ElectiveGroupSchema),
});

export const EducationSystemSchema = z.object({
  id: z.string(),
  slug: z.string().min(1),
  nameAr: z.string().min(1),
  totalMarks: z.number().int().positive(),
  passPercent: z.number().min(0).max(100),
  allowsRetakes: z.boolean(),
  years: z.array(AcademicYearSchema),
  tracks: z.array(TrackSchema),
  /**
   * Every plain (non-elective) subject offered anywhere in this system —
   * year-1 common subjects (either system), year-2/3 shared and specialist
   * subjects (البكالوريا). The admin create-course form filters this by
   * `(year, trackId)` and merges it with the matching track's
   * `electiveGroups` options — the two are siblings in the same dropdown,
   * not alternatives; most subjects are plain, electives are the exception.
   */
  subjects: z.array(SubjectOfferingOptionSchema),
});

export const TaxonomySchema = z.object({
  governorates: z.array(GovernorateSchema),
  /** Codes pinned to the top of the dropdown; the rest follow in code order. */
  pinnedGovernorateCodes: z.array(z.string().length(2)),
  systems: z.array(EducationSystemSchema),
});

export type Region = z.infer<typeof RegionSchema>;
export type Governorate = z.infer<typeof GovernorateSchema>;
export type AcademicYear = z.infer<typeof AcademicYearSchema>;
export type ElectiveOption = z.infer<typeof ElectiveOptionSchema>;
export type SubjectOfferingOption = z.infer<typeof SubjectOfferingOptionSchema>;
export type ElectiveGroup = z.infer<typeof ElectiveGroupSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type EducationSystem = z.infer<typeof EducationSystemSchema>;
export type Taxonomy = z.infer<typeof TaxonomySchema>;
