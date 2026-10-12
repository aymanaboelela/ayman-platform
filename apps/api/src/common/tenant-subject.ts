import { isSubjectSlug, subjectNameAr, type SubjectSlug } from '@ayman/contracts/subjects';
import { fillSubject, subjectCopy } from '@ayman/contracts/copy/subject';
import { TEACHES_CODE, TENANT_SUBJECT } from './tenant';

/**
 * The server-side half of `apps/web/lib/subject-copy.ts` — the stack's subject,
 * resolved to the slug the seed opens and the name the assistant says.
 *
 * Kept out of `./tenant.ts` because that file stays free of `@ayman/contracts`
 * (scripts boot from it before the copy table resolves), and naming the subject
 * needs the subject list. Subpath imports only — the root barrel stops the API
 * booting.
 */

/**
 * The slug the seed opens on every track — `programming_cs` on a programming
 * stack whatever the environment says, the configured slug otherwise, and
 * `null` for a slug the list does not know.
 *
 * `null` rather than a fallback subject: the seed must not invent a subject
 * nobody asked for on a stack whose configuration is wrong, and must not crash
 * either — a seed that throws on boot is a stack whose API never answers, and
 * Traefik then 404s the whole domain. The preflight
 * (`scripts/check-tenant-env.mjs`) refuses the slug before it gets this far.
 */
export const STACK_SUBJECT_SLUG: SubjectSlug | null = TEACHES_CODE
  ? 'programming_cs'
  : isSubjectSlug(TENANT_SUBJECT)
    ? TENANT_SUBJECT
    : null;

/**
 * «الفيزياء», «اللغة العربية» — with the article, as every template in
 * `@ayman/contracts/copy/subject` expects. An unknown slug is «المادة»; see
 * `subjectCopy.unknownSubject`.
 */
export const SUBJECT_NAME_AR: string =
  STACK_SUBJECT_SLUG === null ? subjectCopy.unknownSubject : subjectNameAr(STACK_SUBJECT_SLUG);

/**
 * The programming sentence on a programming stack, its neutral twin with the
 * subject filled in anywhere else. Same contract as the web's `bySubject`: a
 * programming stack gets back the very string it passed in.
 */
export function bySubject(
  programming: string,
  neutral: string,
  vars: Readonly<Record<string, string>> = {},
): string {
  if (TEACHES_CODE) return programming;
  return fillSubject(neutral, { subject: SUBJECT_NAME_AR, ...vars });
}
