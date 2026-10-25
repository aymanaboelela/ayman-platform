import { PREPARATORY_SYSTEM, parseTenantGrades, stageWords, type Grade } from '@ayman/contracts/grades';
import { IS_AYMAN } from '@/lib/tenant';

/**
 * The grades this stack teaches — `TENANT_GRADES`, the web's copy of
 * `apps/api/src/common/tenant.ts`'s. See `@ayman/contracts/grades` for why a
 * stack names grades instead of systems.
 *
 * `[]` — every stack that sets nothing, and his whatever it sets — means the
 * old questions: the fixed section on a programming stack, system → year →
 * track on any other. Only a non-empty list turns on the grade cards.
 *
 * A NEW module, not more exports on `lib/tenant.ts` or `lib/tenant-subject.ts`,
 * for the Turbopack reason `lib/tenant-subject.ts` gives: a tab open across a
 * deploy keeps an old module's factory, and a new export read off it is
 * `undefined`.
 *
 * Build time: inlined by `next.config.ts` → `env`. Changing it is a rebuild.
 */
export const TENANT_GRADES: readonly Grade[] = IS_AYMAN ? [] : parseTenantGrades(process.env.TENANT_GRADES);

/** Whether the student is asked for a GRADE (one card) instead of a system and a year. */
export const ASKS_GRADE = TENANT_GRADES.length > 0;

/** Whether الإعدادية is one of them. */
export const TEACHES_PREPARATORY = TENANT_GRADES.some((g) => g.system === PREPARATORY_SYSTEM.slug);

/** The `{stage}` words of `copy/subject.ts`; the old literal on every other stack. */
export const STAGE_WORDS = stageWords(TENANT_GRADES);
