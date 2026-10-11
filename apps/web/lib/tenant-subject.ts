import { IS_AYMAN } from '@/lib/tenant';

/**
 * Which SUBJECT this stack teaches — the second switch, beside `TENANT_KEY`.
 *
 * ## Why this is not two more exports on `lib/tenant.ts`
 *
 * It belongs there, and the API's copy of the rule is there
 * (`apps/api/src/common/tenant.ts`). The web one cannot be: `lib/tenant.ts` is
 * in the client graph, Turbopack derives a client module's id from its path,
 * and a tab that was open across a deploy keeps the OLD factory for that id.
 * Every new chunk that tab loads would read these two names off the old module
 * as `undefined` — and `TEACHES_CODE` undefined is falsy, which on Ayman's own
 * stack renders the neutral year cards and drops «تجربة الكود» from the rail
 * until somebody reloads. A module that did not exist before has no old
 * factory to be pinned to. `IS_AYMAN` is safe to import: every build has
 * exported it.
 *
 * ## Dependency-free, like `lib/tenant.ts`
 *
 * No `@ayman/contracts` here, for the reason that file gives: `proxy.ts`
 * reads `TEACHES_CODE` on every request to 404 the programming routes, and
 * client components read it too. The Arabic NAME of the subject needs the
 * subject list, so it is resolved one module over, in `lib/subject-copy.ts`,
 * where the copy that prints it is assembled.
 *
 * ## Build time, not request time
 *
 * Inlined by `next.config.ts` → `env`, like `TENANT_KEY`. Changing a stack's
 * subject is a rebuild, not a restart.
 */

/**
 * A slug from `packages/contracts/src/subjects.ts` — `physics`, `arabic`, ….
 *
 * A plain string, not a `SubjectSlug`: this module cannot import the list to
 * check it. `scripts/check-tenant-env.mjs` refuses an unknown slug before a
 * deploy.
 *
 * Unset or empty means `programming_cs`: what every stack taught before the
 * variable existed — his, and the first two instructors' — so silence keeps
 * all three byte-identical.
 */
export const TENANT_SUBJECT = (process.env.TENANT_SUBJECT ?? '').trim() || 'programming_cs';

/**
 * Whether this stack teaches programming — the one question every
 * programming-shaped surface asks: the code playground, the glossary, the
 * editor-window cards on the landing page, the subject line in the title.
 *
 * `IS_AYMAN ||` first, so his stack answers `true` whatever its environment
 * says: his platform is programming by definition, and a stray
 * `TENANT_SUBJECT` must not be able to take his playground away or retitle his
 * site. An unknown slug answers `false` — a stack whose «physics» was mistyped
 * should lose the Python playground, not keep it.
 */
export const TEACHES_CODE = IS_AYMAN || TENANT_SUBJECT === 'programming_cs';

/**
 * The routes that exist only on a stack that teaches code: the playground, the
 * twelve-term glossary in the shell, and its public twin. On any other stack
 * they 404 — in `proxy.ts` before the auth round trip, and again in each page,
 * so neither layer is the only thing standing between a physics student and a
 * Python interpreter.
 */
export const PROGRAMMING_ONLY_ROUTES: readonly string[] = ['/playground', '/foundations', '/essentials'];

/** Whether `pathname` is one of those routes or under one. */
export function isProgrammingOnlyRoute(pathname: string): boolean {
  return PROGRAMMING_ONLY_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}
