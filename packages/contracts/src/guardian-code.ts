/**
 * The guardian code's shape as plain constants — no zod in this module.
 *
 * Why it is split from `guardian.ts`: the login page's `GuardianCodeForm`
 * needs only the length, and importing it from `guardian.ts` dragged the
 * whole zod library (82 KB gzip) into `/login`'s client chunks. Every public
 * page links to `/login`, Next prefetches it, and the Flight client preloads
 * each client module the payload names — so every landing visit downloaded
 * zod for a `6`. Measured on production after #844 (2026-11-23). The schema
 * stays in `guardian.ts`, which re-exports these for the API.
 */
export const GUARDIAN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789@#$%&*+=?';
export const GUARDIAN_CODE_LENGTH = 6;
