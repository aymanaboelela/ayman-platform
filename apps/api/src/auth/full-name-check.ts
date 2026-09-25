import { fullNameProblem, normalizeFullName } from '@ayman/contracts/full-name';

/**
 * Deciding what to do with the `name` in an inbound Better Auth request body —
 * the second pure half of `createAuthBeforeHook`, split out of the hook for the
 * reason `./phone-identity.ts` gives (the hook imports ESM-only
 * `better-auth/api`, which Jest cannot load).
 *
 * The register form already enforces `FullNameSchema`, but that is a
 * convenience: `/sign-up/email` takes whatever it is POSTed, so without this a
 * caller skipping the form still creates «aa». The rule and its messages come
 * from the same contracts module the form uses, so the two cannot drift.
 *
 * `/update-user` is covered too. The web app never calls it — «بياناتك» goes
 * through `PATCH /profile/onboarding` — but Better Auth mounts it for every
 * signed-in user, and it writes the same column.
 */
const NAME_PATHS = new Set(['/sign-up/email', '/update-user']);

export type FullNamePlan =
  | { action: 'ignore' }
  | { action: 'reject'; message: string }
  /** Store this tidied spelling (runs of spaces collapsed, تطويل dropped). */
  | { action: 'rewrite'; name: string };

export function planFullNameCheck(path: string, body: unknown): FullNamePlan {
  if (!NAME_PATHS.has(path)) return { action: 'ignore' };
  const raw = (body as { name?: unknown } | null | undefined)?.name;
  /**
   * `/update-user` changes whatever keys it is given, so a body without a
   * `name` is an update to something else and not this rule's business.
   * Sign-up always needs one — Better Auth's own schema requires it — so an
   * absent name there is refused here, in Arabic, instead of by the library.
   */
  if (raw === undefined && path === '/update-user') return { action: 'ignore' };
  const name = typeof raw === 'string' ? normalizeFullName(raw) : '';
  const problem = fullNameProblem(name);
  return problem ? { action: 'reject', message: problem } : { action: 'rewrite', name };
}
