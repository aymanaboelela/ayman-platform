import { Prisma } from '../../generated/prisma/client';

type ReorderTable = 'lessons' | 'course_sections' | 'quiz_slots';
type ScopeColumn = 'section_id' | 'course_id' | 'quiz_id';

const TABLE_SQL: Record<ReorderTable, Prisma.Sql> = {
  lessons: Prisma.sql`"app"."lessons"`,
  course_sections: Prisma.sql`"app"."course_sections"`,
  quiz_slots: Prisma.sql`"app"."quiz_slots"`,
};

const SCOPE_SQL: Record<ScopeColumn, Prisma.Sql> = {
  section_id: Prisma.sql`"section_id"`,
  course_id: Prisma.sql`"course_id"`,
  quiz_id: Prisma.sql`"quiz_id"`,
};

/** `quiz_slots` (Plan 5 Task 2's schema) has no `updated_at` column — only
 *  `lessons`/`course_sections` track one. */
const TABLES_WITH_UPDATED_AT: ReadonlySet<ReorderTable> = new Set(['lessons', 'course_sections']);

/**
 * ONE statement that rewrites every position in the scope.
 *
 * Reordering 40 lessons is 40 position changes. Sending 40 UPDATEs — or worse,
 * 40 HTTP requests — is 40 chances to interleave with a second editor and 40
 * round trips of latency for one drag. `UPDATE ... FROM (VALUES ...)` does the
 * whole thing in a single pass, and because the unique constraint on
 * (section_id, position) is DEFERRABLE INITIALLY DEFERRED, the intermediate
 * duplicate positions inside the statement are legal — only the state at COMMIT
 * has to be unique.
 *
 * `Prisma.sql` is a tagged template: every value below becomes a bound
 * parameter, never string-interpolated SQL. `$executeRawUnsafe` is banned by the
 * `no-restricted-syntax` ESLint rule and is not needed for any of this.
 *
 * RECONCILED: the table/scope union is OPEN by design — Plan 5 Task 15 adds
 * `'quiz_slots'` / `'quiz_id'` (done, below); Plan 6 Task 15 adds
 * `'navigation_items'` and `'home_blocks'` with scope `'parent_id'` / `'id'`.
 * Whoever extends this function appends to the union and to the two lookup
 * tables above; they never interpolate a caller-supplied string into
 * `target`/`scope`, because column and table names cannot be parameterised
 * and that whitelist is the SQL-injection control (A3).
 *
 * H2: `now()` is a `timestamptz`; every `updated_at` column here is a naive
 * `timestamp(3)` storing UTC wall-clock (Prisma's own writes always store the
 * UTC instant). Assigning `now()` directly would silently convert through the
 * DB session's timezone (Africa/Cairo, +3) instead — every OTHER write path
 * in this codebase stores true UTC, so a reorder's `updated_at` would quietly
 * disagree with a same-instant Prisma `.update()`'s `updated_at` by 3 hours.
 * Cast: `(now() AT TIME ZONE 'UTC')`.
 */
export function buildReorderSql(
  table: ReorderTable,
  scopeColumn: ScopeColumn,
  scopeId: string,
  orderedIds: readonly string[],
): Prisma.Sql {
  if (orderedIds.length === 0) {
    throw new Error('buildReorderSql received an empty orderedIds array');
  }

  // The table and column names come from the two lookup tables above, never
  // from a request. Identifiers cannot be parameterised in Postgres, which is
  // exactly why they are constrained to a closed set at the type level.
  const target = TABLE_SQL[table];
  const scope = SCOPE_SQL[scopeColumn];
  const setClause = TABLES_WITH_UPDATED_AT.has(table)
    ? Prisma.sql`"position" = v.position, "updated_at" = (now() AT TIME ZONE 'UTC')`
    : Prisma.sql`"position" = v.position`;

  // Explicit casts: a bare `$1` inside VALUES leaves Postgres unable to infer
  // the column type and it errors with "could not determine data type".
  const rows = Prisma.join(
    orderedIds.map((id, index) => Prisma.sql`(${id}::text, ${index}::int)`),
  );

  return Prisma.sql`
    UPDATE ${target} AS t
    SET ${setClause}
    FROM (VALUES ${rows}) AS v(id, position)
    WHERE t."id" = v.id AND t.${scope} = ${scopeId}::text
  `;
}
