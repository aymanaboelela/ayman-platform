import { partialWithoutDefaults, z } from '@ayman/contracts/zod';

/**
 * A13 — the two immutability rules, and why they exist:
 *
 *  1. `EducationSystem.slug` is hardcoded in `OnboardingSchema`
 *     (`z.enum(['bacalorya', 'thanaweya_amma'])`). Renaming it here would make
 *     every future onboarding submission fail validation against a system that
 *     no longer answers to that name — and the failure would appear in the
 *     signup form, nowhere near the taxonomy screen that caused it.
 *  2. `Track.slug` participates in `@@unique([systemId, slug])` and is what
 *     the seed idempotency and any future deep link key on.
 *
 * Labels, aliases, sort order, badges and active flags are all freely
 * editable — that is the whole point of the editor. Slugs are identity, not
 * copy, so neither patch schema below even has a `slug` key: `.strict()`
 * turns an attempt to set one into a 400 naming it, not a silent no-op.
 */
export const SystemPatchSchema = z
  .object({
    nameAr: z.string().min(2).max(80).optional(),
    totalMarks: z.number().int().positive().max(2000).optional(),
    passPercent: z.number().min(0).max(100).optional(),
    allowsRetakes: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();

export type SystemPatch = z.infer<typeof SystemPatchSchema>;

export const AcademicYearPatchSchema = z
  .object({
    labelAr: z.string().min(2).max(80).optional(),
    badgeAr: z.string().min(2).max(40).optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();

export type AcademicYearPatch = z.infer<typeof AcademicYearPatchSchema>;

export const GovernoratePatchSchema = z
  .object({
    nameAr: z.string().min(2).max(80).optional(),
    region: z.enum(['urban', 'lower', 'upper', 'frontier']).optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export type GovernoratePatch = z.infer<typeof GovernoratePatchSchema>;

const slug = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, 'lowercase latin, digits, - and _ only');

export const TrackCreateSchema = z
  .object({
    systemId: z.string().uuid(),
    slug,
    labelAr: z.string().min(2).max(80),
    aliases: z.array(z.string().min(1).max(80)).max(20).default([]),
    minYear: z.number().int().min(1).max(3).default(2),
    sortOrder: z.number().int().default(0),
  })
  .strict();

export type TrackCreate = z.infer<typeof TrackCreateSchema>;

/** Note the absence of `slug` and `systemId` — both are identity. */
export const TrackPatchSchema = z
  .object({
    labelAr: z.string().min(2).max(80).optional(),
    aliases: z.array(z.string().min(1).max(80)).max(20).optional(),
    minYear: z.number().int().min(1).max(3).optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();

export type TrackPatch = z.infer<typeof TrackPatchSchema>;

export const SubjectCreateSchema = z
  .object({ slug, nameAr: z.string().min(2).max(80), aliases: z.array(z.string()).max(20).default([]) })
  .strict();

export type SubjectCreate = z.infer<typeof SubjectCreateSchema>;

export const SubjectPatchSchema = z
  .object({ nameAr: z.string().min(2).max(80).optional(), aliases: z.array(z.string()).max(20).optional() })
  .strict();

export type SubjectPatch = z.infer<typeof SubjectPatchSchema>;

const subjectOfferingShape = {
  systemId: z.string().uuid(),
  year: z.number().int().min(1).max(3),
  trackId: z.string().uuid().nullable(),
  subjectId: z.string().uuid(),
  countsTowardTotal: z.boolean().default(true),
  level: z.enum(['normal', 'advanced']).nullable().default(null),
  electiveGroupId: z.string().uuid().nullable().default(null),
  marks: z.number().int().min(0).max(1000).default(100),
  sortOrder: z.number().int().default(0),
};

const SubjectOfferingBaseSchema = z.object(subjectOfferingShape).strict();

export const SubjectOfferingSchema = SubjectOfferingBaseSchema
  /** Year 1 is common and non-specialized in both systems (spec §5.2). */
  .refine((value) => value.year !== 1 || value.trackId === null, {
    message: 'year 1 offerings cannot be scoped to a track',
    path: ['trackId'],
  });

export type SubjectOffering = z.infer<typeof SubjectOfferingSchema>;

/**
 * A patch never carries `systemId`/`subjectId` shape validation against the
 * year-1-no-track rule by itself — the service re-checks it against the
 * MERGED (existing + patch) row, because a patch that only sends `{ marks:
 * 120 }` must not bypass a rule that only makes sense evaluated against the
 * full row.
 */
// `partialWithoutDefaults`, not `.partial()`: a patch that sends only
// `{ marks: 120 }` must not also reset `countsTowardTotal` to true and
// `sortOrder` to 0. See the helper.
export const SubjectOfferingPatchSchema = z
  .object(partialWithoutDefaults(subjectOfferingShape))
  .strict();

export type SubjectOfferingPatch = z.infer<typeof SubjectOfferingPatchSchema>;
