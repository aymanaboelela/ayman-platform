-- Drops the three enum TYPES left orphaned by `20260807000000_exam_improvement`.
--
-- That migration dropped the columns but named the types in snake_case
-- (`app.quiz_mode`, `app.grade_method`, `app.appeal_status`). Those names never
-- existed: unlike `NotificationKind`, none of the three carried an `@@map`, so
-- Prisma had created them PascalCase — `app."QuizMode"` and friends. Every one
-- of the drops was an `IF EXISTS` no-op and the types survived their columns.
--
-- A separate file rather than a fix to the previous one because that migration
-- has already been applied to a database. Editing an applied migration changes
-- its checksum, which is precisely the corruption `_prisma_migrations` exists
-- to detect. The correction is additive and safe to run against a fresh
-- database too, where it simply drops types nothing references any more.

DROP TYPE IF EXISTS "app"."QuizMode";
DROP TYPE IF EXISTS "app"."GradeMethod";
DROP TYPE IF EXISTS "app"."AppealStatus";
