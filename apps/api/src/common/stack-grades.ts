import { gradesFromSlugs, type Grade } from '@ayman/contracts/grades';
import { GradesSettingsSchema } from '@ayman/contracts/grades-settings';
import { TENANT_GRADES } from './tenant';

/**
 * The grades this stack teaches NOW: the admin's saved «الصفوف» when there
 * is one, else the build-time `TENANT_GRADES` (`[]` on Ayman's stack, which
 * ignores the variable). `raw` is `site_settings.data.grades`, unparsed — a
 * row from before the setting existed has none and resolves to the env.
 */
export function resolveStackGrades(raw: unknown): readonly Grade[] {
  const parsed = GradesSettingsSchema.safeParse(raw ?? {});
  if (!parsed.success || parsed.data.slugs === null) return TENANT_GRADES;
  return gradesFromSlugs(parsed.data.slugs);
}
