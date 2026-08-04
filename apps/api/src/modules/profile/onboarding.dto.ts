// Imported from the `./onboarding` subpath, not the package root: the root
// barrel (`@ayman/contracts`'s index.ts) re-exports through several more
// extensionless relative specifiers (`./copy/ar`, `./taxonomy`), which
// Turbopack/tsc/Jest all resolve fine but plain Node's native ESM loader
// (used by the compiled apps/api dist at real runtime) cannot — it requires
// full extensions on relative specifiers. `onboarding.ts` itself has no
// relative imports of its own (only bare `zod`/`libphonenumber-js`
// specifiers), so importing it directly sidesteps the barrel entirely. This
// is the one place in apps/api that needs the real Zod schema value, not
// just its inferred type — everywhere else uses `import type`, which is
// erased at build time and never hits this problem.
import { OnboardingSchema, StudentSectionSchema } from '@ayman/contracts/onboarding';
import { createZodDto } from 'nestjs-zod';

/**
 * S11 (mass assignment): `OnboardingSchema` is `.strict()`, so any key this
 * schema doesn't know about — `role`, `userId`, `onboardingCompletedAt` — is
 * a validation FAILURE (400), not a silently-stripped field. There is no
 * separate "student-scoped" allowlist layered on top of this DTO because the
 * schema itself only ever contained student-writable fields to begin with:
 * `userId` comes from the authenticated session (`@CurrentUser()`), never
 * from the body, and `onboardingCompletedAt`/`role` are server-only and were
 * never fields a client could set in the first place.
 */
export class OnboardingDto extends createZodDto(OnboardingSchema) {}

/**
 * The four section fields alone, for `PATCH /profile/section`.
 *
 * `.strict()` on the same grounds as above — and it matters MORE here, not
 * less: this is a partial update, so a payload carrying `fullName` or
 * `onboardingCompletedAt` would be a plausible-looking way to write a field
 * this route has no business touching. It fails validation instead.
 */
export class StudentSectionDto extends createZodDto(StudentSectionSchema) {}
