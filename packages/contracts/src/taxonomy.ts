import { z } from 'zod';

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
export type ElectiveGroup = z.infer<typeof ElectiveGroupSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type EducationSystem = z.infer<typeof EducationSystemSchema>;
export type Taxonomy = z.infer<typeof TaxonomySchema>;
