import { Prisma } from '../../generated/prisma/client';

type ReorderTable = 'lessons' | 'course_sections';
type ScopeColumn = 'section_id' | 'course_id';

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
 * `'quiz_slots'` / `'quiz_id'`; Plan 6 Task 15 adds `'navigation_items'` and
 * `'home_blocks'` with scope `'parent_id'` / `'id'`. Whoever extends this
 * function appends to the union and to the two ternaries below; they never
 * interpolate a caller-supplied string into `target`/`scope`, because column
 * and table names cannot be parameterised and that whitelist is the
 * SQL-injection control (A3).
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

  // The table and column names come from the two union types above, never from
  // a request. Identifiers cannot be parameterised in Postgres, which is exactly
  // why they are constrained to a closed set at the type level.
  const target =
    table === 'lessons' ? Prisma.sql`"app"."lessons"` : Prisma.sql`"app"."course_sections"`;
  const scope =
    scopeColumn === 'section_id' ? Prisma.sql`"section_id"` : Prisma.sql`"course_id"`;

  // Explicit casts: a bare `$1` inside VALUES leaves Postgres unable to infer
  // the column type and it errors with "could not determine data type".
  const rows = Prisma.join(
    orderedIds.map((id, index) => Prisma.sql`(${id}::text, ${index}::int)`),
  );

  return Prisma.sql`
    UPDATE ${target} AS t
    SET "position" = v.position, "updated_at" = now()
    FROM (VALUES ${rows}) AS v(id, position)
    WHERE t."id" = v.id AND t.${scope} = ${scopeId}::text
  `;
}
