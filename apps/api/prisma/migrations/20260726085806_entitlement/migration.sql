-- CreateEnum
CREATE TYPE "enrollment_status" AS ENUM ('active', 'suspended', 'expired', 'revoked', 'completed');

-- CreateEnum
CREATE TYPE "enrollment_source" AS ENUM ('free', 'manual', 'purchase', 'coupon', 'code');

-- CreateEnum
CREATE TYPE "access_scope" AS ENUM ('platform', 'course', 'subject_teacher', 'unassigned');

-- CreateEnum
CREATE TYPE "grant_source" AS ENUM ('auto_free', 'admin', 'access_code', 'purchase', 'coupon', 'scholarship');

-- CreateEnum
CREATE TYPE "scholarship_kind" AS ENUM ('orphans', 'financial', 'twinz');

-- NOTE: Prisma's diff engine generated a DropForeignKey for
-- "lessons_section_matches_course" and a DropIndex for
-- "course_sections_id_course_key" here. Both are hand-written invariants from
-- the content_constraints migration (Task 3) that have no representation in
-- schema.prisma — Prisma sees them as drift and wants to remove them on every
-- migration from here on. They are intentionally kept: the composite FK is
-- what makes "a lesson's denormalised course_id matches its section's" a
-- structural guarantee rather than a service-layer promise. Deleted from this
-- generated migration on purpose; do not reintroduce them.

-- CreateTable
CREATE TABLE "access_grants" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scope" "access_scope" NOT NULL,
    "course_id" TEXT,
    "subject_id" TEXT,
    "instructor_id" TEXT,
    "source" "grant_source" NOT NULL,
    "scholarship_kind" "scholarship_kind",
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "granted_by_user_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "source" "enrollment_source" NOT NULL DEFAULT 'free',
    "status" "enrollment_status" NOT NULL DEFAULT 'active',
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "progress_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "last_lesson_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "access_grants_user_id_scope_idx" ON "access_grants"("user_id", "scope");

-- CreateIndex
CREATE INDEX "access_grants_course_id_idx" ON "access_grants"("course_id");

-- CreateIndex
CREATE INDEX "enrollments_user_id_status_idx" ON "enrollments"("user_id", "status");

-- CreateIndex
CREATE INDEX "enrollments_course_id_status_idx" ON "enrollments"("course_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_user_id_course_id_key" ON "enrollments"("user_id", "course_id");

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_last_lesson_id_fkey" FOREIGN KEY ("last_lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
