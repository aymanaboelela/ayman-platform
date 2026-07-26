-- citext (`phone`/`father_phone`/`mother_phone`) is a trusted extension since
-- PG 13 — installable here by `ayman_owner` without superuser rights, given
-- the one-time `GRANT CREATE ON DATABASE` in scripts/db-bootstrap.sql.
CREATE EXTENSION IF NOT EXISTS "citext" SCHEMA "app";

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female');

-- CreateTable
CREATE TABLE "student_profiles" (
    "user_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "phone" CITEXT NOT NULL,
    "phone_verified_at" TIMESTAMP(3),
    "governorate_code" CHAR(2) NOT NULL,
    "school_name" TEXT,
    "father_phone" CITEXT,
    "mother_phone" CITEXT,
    "system_id" TEXT,
    "year" INTEGER,
    "track_id" TEXT,
    "elective_subject_id" TEXT,
    "onboarding_completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_phone_key" ON "student_profiles"("phone");

-- CreateIndex
CREATE INDEX "student_profiles_governorate_code_idx" ON "student_profiles"("governorate_code");

-- CreateIndex
CREATE INDEX "student_profiles_system_id_idx" ON "student_profiles"("system_id");

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_governorate_code_fkey" FOREIGN KEY ("governorate_code") REFERENCES "governorates"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "education_systems"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_elective_subject_id_fkey" FOREIGN KEY ("elective_subject_id") REFERENCES "subject_offerings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prisma cannot express a cross-column CHECK — hand-written. §5.2: grade 1 is
-- common/non-specialized across both systems, so a year-1 row can never carry
-- a track. `year IS NULL` and `track_id IS NULL` are both legitimate
-- (pre-onboarding-completion) states and must pass this constraint too.
ALTER TABLE "app"."student_profiles"
  ADD CONSTRAINT "student_profiles_year1_has_no_track"
  CHECK ("year" IS NULL OR "year" <> 1 OR "track_id" IS NULL);
