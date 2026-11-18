-- «السؤال المقالي اتصحّح» — the student's notification that their daily essay
-- has a mark on it.
--
-- `ALTER TYPE … ADD VALUE` alone in its own file, with no INSERT beside it:
-- Postgres allows it inside a transaction (Prisma wraps every migration in
-- one) only as long as the new value is not USED before that transaction
-- commits. Same rule `20260906000100_homework_notification_kinds` records.

ALTER TYPE "app"."notification_kind" ADD VALUE IF NOT EXISTS 'essay_marked';
