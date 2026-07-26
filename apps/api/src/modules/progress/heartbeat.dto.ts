// Imported from the `./progress` subpath rather than the package root: the
// root barrel re-exports through extensionless relative specifiers that
// plain Node's ESM loader cannot resolve at runtime. `progress.ts` has no
// relative imports of its own, so importing it directly sidesteps the
// barrel — same reasoning as `onboarding.dto.ts`.
import { EmptyBodySchema, HeartbeatRequestSchema } from '@ayman/contracts/progress';
import { createZodDto } from 'nestjs-zod';

/**
 * Global Constraint 8. `HeartbeatRequestSchema` is `.strict()`, so a student
 * posting `{position, delta, completed: true}` — or `{completion: 1}`, or
 * `{score: 100}`, or `{watchedSeconds: 99999}` — gets a 400, not a
 * silently-stripped field. `delta` is also range-capped here, which is the
 * cheapest possible rejection; the wall-clock clamp in `HeartbeatService` is
 * the control that actually matters.
 */
export class HeartbeatDto extends createZodDto(HeartbeatRequestSchema) {}

/** Deliberately empty and strict — the manual-complete button sends nothing. */
export class EmptyBodyDto extends createZodDto(EmptyBodySchema) {}
