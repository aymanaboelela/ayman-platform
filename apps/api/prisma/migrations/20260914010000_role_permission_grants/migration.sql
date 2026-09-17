-- «الصلاحيات اللي اتفتحت» — a permission opened up to a role after the image
-- that defined the baselines had already shipped.
--
-- `ROLE_PERMISSIONS` in `apps/api/src/auth/permissions.ts` is compiled in, and
-- has to be: it is what a role can do before anybody decides anything, and a
-- default that lives in the database cannot exist on the first boot that
-- creates the database. But «this feature is ready, open it for him» is a
-- decision a person makes months later, on one deployment. That is a row.
--
-- ## Additive only, on purpose
--
-- No `revoked` column, and no way to express "take this away". `roleHasPermission`
-- checks the baseline first and returns early, so a row here can only ever ADD.
-- Subtraction was left out because a row that silently removed `course:read`
-- from an instructor would present as a broken platform, and whoever debugged
-- it would be reading the code, not the table. Closing a feature is a DELETE.
--
-- ## No tenant column
--
-- Every instructor runs their own deployment against their own database, so
-- «this stack's owner may now see payments» is one row here and reaches nobody
-- else. A `tenant_id` would be the same value in every row of every database.
--
-- ## Types
--
-- `role` and `permission` are TEXT, matching `users.role` — the role column is
-- not an enum either, for the reason recorded there: a role added in code must
-- not need a migration before it can be used.
--
-- `granted_at` is TIMESTAMP(3), not TIMESTAMPTZ: unlike `quizzes.late_after`
-- this is not a wall-clock moment somebody typed, it is when a write happened,
-- and every other audit-shaped timestamp in this schema (`created_at`,
-- `updated_at`) is the same type. Being consistent with them matters more than
-- the offset does for a value nobody reads across a DST boundary.

CREATE TABLE "app"."role_permission_grants" (
  "role"               TEXT         NOT NULL,
  "permission"         TEXT         NOT NULL,
  "granted_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "granted_by_user_id" TEXT,
  CONSTRAINT "role_permission_grants_pkey" PRIMARY KEY ("role", "permission")
);

-- Every read is "what does this role hold", and the primary key already leads
-- with `role` — but the composite is only usable for that when the planner
-- picks a prefix scan, and the table is read on every cache refresh. One
-- narrow index makes that a plain index scan.
CREATE INDEX "role_permission_grants_role_idx" ON "app"."role_permission_grants"("role");

-- `SET NULL`: deleting the operator who opened a feature must not silently
-- close it again. The grant outlives its issuer — the same rule
-- `access_grants` and `users.banned_by_user_id` already follow.
ALTER TABLE "app"."role_permission_grants"
  ADD CONSTRAINT "role_permission_grants_granted_by_user_id_fkey"
  FOREIGN KEY ("granted_by_user_id") REFERENCES "app"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
