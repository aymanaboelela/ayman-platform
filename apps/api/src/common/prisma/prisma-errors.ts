/**
 * id-type-and-delete-path audit (Defect 1): route params (`:id`, `:lessonId`,
 * …) are plain `@Param() id: string` — never Zod-validated the way request
 * BODIES are — so a client-supplied garbage string used to reach Prisma raw
 * and simply match zero rows against a `text` column; every service's own
 * `if (!found) throw new NotFoundException()` already turned that into a
 * 404. Now that every id/FK column the app generates is `uuid`, Postgres
 * itself rejects a non-UUID string with `invalid input syntax for type
 * uuid`, which Prisma surfaces as `PrismaClientKnownRequestError` code
 * `P2007` ("Data validation error") instead of an empty result set.
 *
 * This predicate exists so call sites can preserve their EXACT prior 404
 * behaviour for a malformed id — "doesn't parse as an id" and "parses fine
 * but doesn't exist" are the same answer from the client's point of view —
 * rather than this becoming a new 500 the moment the database starts
 * enforcing the format itself. `AllExceptionsFilter` uses this as a
 * last-resort safety net at the HTTP boundary; `LessonAccessService.require`
 * (Plan 4's single progress-write gate) uses it directly because its own
 * test asserts on the THROWN EXCEPTION TYPE, not the eventual HTTP status.
 *
 * Duck-typed on `.code`, matching this codebase's own `isUniqueViolation`
 * (course.service.ts) rather than importing
 * `Prisma.PrismaClientKnownRequestError` just for an `instanceof` check.
 */
export function isPrismaDataValidationError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2007';
}
