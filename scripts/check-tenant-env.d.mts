/**
 * Types for the dependency-free preflight beside this file.
 *
 * The script stays plain JavaScript on purpose — it has to run with `node` on a
 * bare server before anything is installed — so its types live here rather
 * than in a `.ts` port that would then need a build step to run at all. The
 * control plane (`apps/web/lib/provisioning/tenant-env.ts`) is the typed
 * caller; the contracts spec still imports it untyped.
 */

export interface TenantEnvReport {
  /** Any one of these means: do not deploy this stack. */
  errors: string[];
  /** Deployable, but something will be regretted. */
  warnings: string[];
}

/** Copied from `packages/contracts/src/subjects.ts`; the spec pins the two. */
export const SUBJECT_SLUGS: readonly string[];

/** The grade slugs of `packages/contracts/src/grades.ts`, copied — see `SUBJECT_SLUGS`. */
export const GRADE_SLUGS: readonly string[];

export function checkTenantEnv(
  env: Record<string, string | undefined>,
  options?: { firstDeploy?: boolean },
): TenantEnvReport;

export function parseEnvFile(path: string): Record<string, string>;

export function parseEnvText(text: string): Record<string, string>;
