-- Phone becomes the primary sign-up identifier.
--
-- Two columns, both dictated by Better Auth's `phoneNumber` plugin
-- (`better-auth/dist/plugins/phone-number/schema.mjs`), which declares them on
-- the USER model and offers only a rename — they cannot be pointed at
-- `app.student_profiles`, which is why the number now lives in two places with
-- `users.phone_number` authoritative and `student_profiles.phone` a mirror.

ALTER TABLE "app"."users" ADD COLUMN "phone_number" TEXT;
ALTER TABLE "app"."users" ADD COLUMN "phone_number_verified" BOOLEAN DEFAULT false;

-- Backfill from the number every onboarded student already gave us. Without
-- this, every existing account would be treated as "has no phone" and bounced
-- back through onboarding on its next request.
--
-- TEXT, not citext, on the destination: the plugin looks accounts up with an
-- exact byte comparison, so a case-insensitive column would let the database
-- consider two rows equal that the library considers different. The cast is
-- safe in that direction — a citext UNIQUE index already guarantees no two
-- rows collide case-INsensitively, which is strictly stronger than what the
-- plain-text unique index below demands, so it cannot fail on duplicates.
--
-- The `LIKE '+20%'` guard is deliberately narrow. `students_profiles.phone` is
-- written only by the onboarding wizard, whose zod schema normalises to E.164,
-- so in practice this matches every row. But an un-normalised value copied
-- here would be strictly worse than a NULL: Better Auth matches on the exact
-- string, so such a row is an account whose owner can never sign in by phone
-- and gets no error explaining why. A NULL instead routes them through the
-- onboarding phone step, which fixes the row.
UPDATE "app"."users" u
SET "phone_number" = sp."phone"::text
FROM "app"."student_profiles" sp
WHERE sp."user_id" = u."id"
  AND sp."phone"::text LIKE '+20%';

-- Created AFTER the backfill: building it first would force Postgres to
-- maintain the index across every updated row for no benefit.
--
-- NULLs are exempt from a Postgres unique index, which is exactly right here —
-- the un-phoned populations (pre-existing accounts that never onboarded, and
-- Google sign-ups between the callback and onboarding step 1) are all NULL and
-- must not collide with each other.
CREATE UNIQUE INDEX "users_phone_number_key" ON "app"."users"("phone_number");
