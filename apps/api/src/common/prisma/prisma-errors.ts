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

/**
 * The row is not there — Prisma's `P2025`, raised by `findUniqueOrThrow`,
 * `findFirstOrThrow`, and by an `update`/`delete` whose `where` matches nothing.
 *
 * ⚠️ THE OTHER HALF OF THE SENTENCE ABOVE. The predicate before this one exists
 * because "doesn't parse as an id" and "parses fine but doesn't exist" are the
 * same answer from the client's point of view — and only the first of those two
 * was ever mapped. So a well-formed id for a row that has been deleted came back
 * a **500**, and the admin reading it could not tell a missing quiz from a
 * broken server.
 *
 * Measured on the deployed API 2026-08-16: `GET /api/admin/quizzes/:id` and
 * `…/:id/analytics` both answered 500 for a valid UUID with no row, because
 * `quiz-builder.service.ts` and `analytics.service.ts` reach for
 * `findUniqueOrThrow`. Seventeen call sites across the modules use one of the
 * `…OrThrow` pair; mapping the code once at the boundary fixes all of them and
 * every future one, which is why this is here and not seventeen `try`s.
 *
 * A service that wants a MESSAGE with its 404 still throws `NotFoundException`
 * itself and is unaffected — this only catches the ones that would otherwise
 * have fallen through to the generic 500.
 */
export function isPrismaRecordNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2025';
}

/**
 * A UNIQUE constraint rejected the write.
 *
 * Duck-typed on `.code` for the same reason as the predicate above: an
 * `instanceof Prisma.PrismaClientKnownRequestError` check would pull the
 * generated client into modules that otherwise need nothing from it.
 *
 * Callers that treat this as SUCCESS are relying on the index as an idempotency
 * key — `OutreachService.deliver` inserts and lets the index reject the second
 * copy, rather than asking "have I sent this already" and losing the race
 * between two cron ticks. That only works when the index is the one being
 * violated, so a call site swallowing this must have exactly one unique
 * constraint it could plausibly hit.
 */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}
