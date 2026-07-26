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

export const TrackSchema = z.object({
  id: z.string(),
  slug: z.string().min(1),
  labelAr: z.string().min(1),
  /** Tracks are chosen at the start of year 2 — year 1 has no track at all. */
  minYear: z.number().int(),
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
export type Track = z.infer<typeof TrackSchema>;
export type EducationSystem = z.infer<typeof EducationSystemSchema>;
export type Taxonomy = z.infer<typeof TaxonomySchema>;
