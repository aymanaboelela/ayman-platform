import { z } from '@ayman/contracts/zod';
import { GRADES, type GradeSlug } from '@ayman/contracts/grades';

/*
 * The zod half of `@ayman/contracts/grades`, in its own module: `grades.ts` is
 * imported by client components a layout mounts (the footer, the onboarding),
 * and `client-barrel.test.ts` keeps zod off that path.
 */

export const GradeSlugSchema = z.enum(
  GRADES.map((grade) => grade.slug) as [GradeSlug, ...GradeSlug[]],
);

/**
 * «الصفوف اللي بتدرّسها» — the grades a stack's OWN admin chose
 * (`PATCH /admin/settings/grades`, owner 2026-11-04: «هو اللي يقدر يحدد مين
 * عنده، في كل المنصات»).
 *
 * `null` — never saved — means the build-time `TENANT_GRADES`, exactly as
 * before this setting existed; that is what keeps every stack byte-identical
 * until its admin presses save. An EMPTY list is a real answer too: «the old
 * questions» (system → year), which is what `TENANT_GRADES` unset meant.
 */
export const GradesSettingsSchema = z
  .object({
    slugs: z.array(GradeSlugSchema).max(GRADES.length).nullable().default(null),
  })
  .strict();

export type GradesSettings = z.infer<typeof GradesSettingsSchema>;

