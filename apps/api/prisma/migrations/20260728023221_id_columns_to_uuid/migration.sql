-- Audit fix (Defect 1): every id/foreign-key column the app itself generates
-- (via Prisma's `uuid(7)` default) was stored as plain `text`. Postgres
-- therefore accepted ANY string as an id -- including
-- '01990000-0000-7000-8000-0000a11yc001', which contains the letter `y` and
-- is not a valid UUID at all. Zod validates the *shape* at the edge, but
-- never touched the database, so a malformed id could be written directly
-- and would only surface much later (a `ZodError` during `next build`'s
-- static generation, reading the row back out of the catalog contract).
--
-- This migration tightens every such column to the native `uuid` type, which
-- Postgres enforces on every write, from any writer, forever.
--
-- Columns are EXCLUDED on purpose when they hold a Better Auth-generated id
-- (`users.id`, `sessions.id`, etc.) or reference one (`courses.instructor_id`,
-- `enrollments.user_id`, `quiz_attempts.user_id`, `attempt_questions.graded_by`,
-- `question_versions.created_by`, `question_bank_entries.owner_id`,
-- `grade_appeals.resolved_by`, `access_grants.user_id` /
-- `granted_by_user_id`, `session_devices.user_id`, `student_profiles.user_id`):
-- Better Auth generates its OWN ids in application code (observed in dev data
-- as 32-char alphanumeric strings, e.g. `eytXNbcenI4uIpeddaBkYYbkPDgxYLc2`),
-- not this app's uuid7 default, and existing rows are not valid UUIDs.
-- Converting those columns would fail immediately against real data and is
-- out of scope for this app's own id generator.
--
-- `question_categories.owner_id` is also excluded: it is polymorphic per
-- `owner_scope` (global / instructor / course) and can hold either a
-- Course.id (uuid7) or a User.id (Better Auth, not uuid) depending on that
-- scope, so it cannot be safely typed as `uuid` either.
--
-- `governorates.code` (a Char(2) national-id code) and `feature_flags.key`
-- (a natural string key) were never uuid7-generated ids and are unaffected.
--
-- Every foreign key touching a converted column must be dropped before the
-- ALTER COLUMN TYPE (Postgres refuses a type change while a cross-table FK
-- still points at the old type) and re-created identically afterwards,
-- INCLUDING the composite `lessons_section_matches_course` FK (H1 -- Prisma
-- cannot express this constraint, so it is hand-restored here exactly as it
-- already exists; it must never be silently dropped by a future
-- `prisma migrate dev`).

-- ── Step 1: drop every FK that touches a column being retyped ────────────

ALTER TABLE "app"."academic_years" DROP CONSTRAINT "academic_years_system_id_fkey";
ALTER TABLE "app"."access_grants" DROP CONSTRAINT "access_grants_course_id_fkey";
ALTER TABLE "app"."access_grants" DROP CONSTRAINT "access_grants_subject_id_fkey";
ALTER TABLE "app"."attempt_events" DROP CONSTRAINT "attempt_events_attempt_id_fkey";
ALTER TABLE "app"."attempt_questions" DROP CONSTRAINT "attempt_questions_attempt_id_fkey";
ALTER TABLE "app"."attempt_questions" DROP CONSTRAINT "attempt_questions_question_version_id_fkey";
ALTER TABLE "app"."course_sections" DROP CONSTRAINT "course_sections_course_id_fkey";
ALTER TABLE "app"."courses" DROP CONSTRAINT "courses_subject_id_fkey";
ALTER TABLE "app"."courses" DROP CONSTRAINT "courses_system_id_fkey";
ALTER TABLE "app"."courses" DROP CONSTRAINT "courses_track_id_fkey";
ALTER TABLE "app"."elective_groups" DROP CONSTRAINT "elective_groups_track_id_fkey";
ALTER TABLE "app"."enrollments" DROP CONSTRAINT "enrollments_course_id_fkey";
ALTER TABLE "app"."enrollments" DROP CONSTRAINT "enrollments_last_lesson_id_fkey";
ALTER TABLE "app"."grade_appeals" DROP CONSTRAINT "grade_appeals_attempt_question_id_fkey";
ALTER TABLE "app"."lesson_attachments" DROP CONSTRAINT "lesson_attachments_lesson_id_fkey";
ALTER TABLE "app"."lesson_progress" DROP CONSTRAINT "lesson_progress_enrollment_id_fkey";
ALTER TABLE "app"."lesson_progress" DROP CONSTRAINT "lesson_progress_lesson_id_fkey";
ALTER TABLE "app"."lesson_texts" DROP CONSTRAINT "lesson_texts_lesson_id_fkey";
ALTER TABLE "app"."lesson_videos" DROP CONSTRAINT "lesson_videos_lesson_id_fkey";
ALTER TABLE "app"."lessons" DROP CONSTRAINT "lessons_course_id_fkey";
ALTER TABLE "app"."lessons" DROP CONSTRAINT "lessons_section_id_fkey";
-- H1: the composite FK Prisma cannot express. Dropped here and RESTORED
-- verbatim in Step 3 -- never leave this dropped.
ALTER TABLE "app"."lessons" DROP CONSTRAINT "lessons_section_matches_course";
ALTER TABLE "app"."lessons" DROP CONSTRAINT "lessons_unlocks_after_lesson_id_fkey";
ALTER TABLE "app"."navigation_items" DROP CONSTRAINT "navigation_items_parent_id_fkey";
ALTER TABLE "app"."question_bank_entries" DROP CONSTRAINT "question_bank_entries_category_id_fkey";
ALTER TABLE "app"."question_categories" DROP CONSTRAINT "question_categories_parent_id_fkey";
ALTER TABLE "app"."question_options" DROP CONSTRAINT "question_options_question_version_id_fkey";
ALTER TABLE "app"."question_versions" DROP CONSTRAINT "question_versions_bank_entry_id_fkey";
ALTER TABLE "app"."quiz_attempts" DROP CONSTRAINT "quiz_attempts_quiz_id_fkey";
ALTER TABLE "app"."quiz_pools" DROP CONSTRAINT "quiz_pools_quiz_id_fkey";
ALTER TABLE "app"."quiz_slots" DROP CONSTRAINT "quiz_slots_bank_entry_id_fkey";
ALTER TABLE "app"."quiz_slots" DROP CONSTRAINT "quiz_slots_pool_id_fkey";
ALTER TABLE "app"."quiz_slots" DROP CONSTRAINT "quiz_slots_quiz_id_fkey";
ALTER TABLE "app"."quizzes" DROP CONSTRAINT "quizzes_lesson_id_fkey";
ALTER TABLE "app"."student_profiles" DROP CONSTRAINT "student_profiles_elective_subject_id_fkey";
ALTER TABLE "app"."student_profiles" DROP CONSTRAINT "student_profiles_system_id_fkey";
ALTER TABLE "app"."student_profiles" DROP CONSTRAINT "student_profiles_track_id_fkey";
ALTER TABLE "app"."subject_offerings" DROP CONSTRAINT "subject_offerings_elective_group_id_fkey";
ALTER TABLE "app"."subject_offerings" DROP CONSTRAINT "subject_offerings_subject_id_fkey";
ALTER TABLE "app"."subject_offerings" DROP CONSTRAINT "subject_offerings_system_id_fkey";
ALTER TABLE "app"."subject_offerings" DROP CONSTRAINT "subject_offerings_track_id_fkey";
ALTER TABLE "app"."track_faculties" DROP CONSTRAINT "track_faculties_track_id_fkey";
ALTER TABLE "app"."tracks" DROP CONSTRAINT "tracks_system_id_fkey";

-- ── Step 2: retype every column. Unique/primary key indexes on these
-- columns (including the DEFERRABLE ones -- course_sections_course_position_key,
-- course_sections_id_course_key, quiz_slots_quiz_id_position_key) are rebuilt
-- in place by Postgres and do not need to be dropped first; only
-- cross-table foreign keys do. ────────────────────────────────────────────

ALTER TABLE "app"."education_systems" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;

ALTER TABLE "app"."academic_years" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;
ALTER TABLE "app"."academic_years" ALTER COLUMN "system_id" TYPE UUID USING "system_id"::UUID;

ALTER TABLE "app"."tracks" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;
ALTER TABLE "app"."tracks" ALTER COLUMN "system_id" TYPE UUID USING "system_id"::UUID;

ALTER TABLE "app"."track_faculties" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;
ALTER TABLE "app"."track_faculties" ALTER COLUMN "track_id" TYPE UUID USING "track_id"::UUID;

ALTER TABLE "app"."subjects" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;

ALTER TABLE "app"."elective_groups" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;
ALTER TABLE "app"."elective_groups" ALTER COLUMN "track_id" TYPE UUID USING "track_id"::UUID;

ALTER TABLE "app"."subject_offerings" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;
ALTER TABLE "app"."subject_offerings" ALTER COLUMN "system_id" TYPE UUID USING "system_id"::UUID;
ALTER TABLE "app"."subject_offerings" ALTER COLUMN "track_id" TYPE UUID USING "track_id"::UUID;
ALTER TABLE "app"."subject_offerings" ALTER COLUMN "subject_id" TYPE UUID USING "subject_id"::UUID;
ALTER TABLE "app"."subject_offerings" ALTER COLUMN "elective_group_id" TYPE UUID USING "elective_group_id"::UUID;

ALTER TABLE "app"."student_profiles" ALTER COLUMN "system_id" TYPE UUID USING "system_id"::UUID;
ALTER TABLE "app"."student_profiles" ALTER COLUMN "track_id" TYPE UUID USING "track_id"::UUID;
ALTER TABLE "app"."student_profiles" ALTER COLUMN "elective_subject_id" TYPE UUID USING "elective_subject_id"::UUID;

ALTER TABLE "app"."courses" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;
ALTER TABLE "app"."courses" ALTER COLUMN "system_id" TYPE UUID USING "system_id"::UUID;
ALTER TABLE "app"."courses" ALTER COLUMN "track_id" TYPE UUID USING "track_id"::UUID;
ALTER TABLE "app"."courses" ALTER COLUMN "subject_id" TYPE UUID USING "subject_id"::UUID;

ALTER TABLE "app"."course_sections" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;
ALTER TABLE "app"."course_sections" ALTER COLUMN "course_id" TYPE UUID USING "course_id"::UUID;

ALTER TABLE "app"."lessons" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;
ALTER TABLE "app"."lessons" ALTER COLUMN "course_id" TYPE UUID USING "course_id"::UUID;
ALTER TABLE "app"."lessons" ALTER COLUMN "section_id" TYPE UUID USING "section_id"::UUID;
ALTER TABLE "app"."lessons" ALTER COLUMN "unlocks_after_lesson_id" TYPE UUID USING "unlocks_after_lesson_id"::UUID;
ALTER TABLE "app"."lessons" ALTER COLUMN "content_group_id" TYPE UUID USING "content_group_id"::UUID;

ALTER TABLE "app"."lesson_videos" ALTER COLUMN "lesson_id" TYPE UUID USING "lesson_id"::UUID;
ALTER TABLE "app"."lesson_texts" ALTER COLUMN "lesson_id" TYPE UUID USING "lesson_id"::UUID;

ALTER TABLE "app"."lesson_attachments" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;
ALTER TABLE "app"."lesson_attachments" ALTER COLUMN "lesson_id" TYPE UUID USING "lesson_id"::UUID;

ALTER TABLE "app"."access_grants" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;
ALTER TABLE "app"."access_grants" ALTER COLUMN "course_id" TYPE UUID USING "course_id"::UUID;
ALTER TABLE "app"."access_grants" ALTER COLUMN "subject_id" TYPE UUID USING "subject_id"::UUID;

ALTER TABLE "app"."enrollments" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;
ALTER TABLE "app"."enrollments" ALTER COLUMN "course_id" TYPE UUID USING "course_id"::UUID;
ALTER TABLE "app"."enrollments" ALTER COLUMN "last_lesson_id" TYPE UUID USING "last_lesson_id"::UUID;

ALTER TABLE "app"."lesson_progress" ALTER COLUMN "enrollment_id" TYPE UUID USING "enrollment_id"::UUID;
ALTER TABLE "app"."lesson_progress" ALTER COLUMN "lesson_id" TYPE UUID USING "lesson_id"::UUID;

ALTER TABLE "app"."question_categories" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;
ALTER TABLE "app"."question_categories" ALTER COLUMN "parent_id" TYPE UUID USING "parent_id"::UUID;

ALTER TABLE "app"."question_bank_entries" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;
ALTER TABLE "app"."question_bank_entries" ALTER COLUMN "category_id" TYPE UUID USING "category_id"::UUID;

ALTER TABLE "app"."question_versions" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;
ALTER TABLE "app"."question_versions" ALTER COLUMN "bank_entry_id" TYPE UUID USING "bank_entry_id"::UUID;

ALTER TABLE "app"."question_options" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;
ALTER TABLE "app"."question_options" ALTER COLUMN "question_version_id" TYPE UUID USING "question_version_id"::UUID;

ALTER TABLE "app"."quizzes" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;
ALTER TABLE "app"."quizzes" ALTER COLUMN "lesson_id" TYPE UUID USING "lesson_id"::UUID;

ALTER TABLE "app"."quiz_slots" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;
ALTER TABLE "app"."quiz_slots" ALTER COLUMN "quiz_id" TYPE UUID USING "quiz_id"::UUID;
ALTER TABLE "app"."quiz_slots" ALTER COLUMN "bank_entry_id" TYPE UUID USING "bank_entry_id"::UUID;
ALTER TABLE "app"."quiz_slots" ALTER COLUMN "pool_id" TYPE UUID USING "pool_id"::UUID;

ALTER TABLE "app"."quiz_pools" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;
ALTER TABLE "app"."quiz_pools" ALTER COLUMN "quiz_id" TYPE UUID USING "quiz_id"::UUID;

ALTER TABLE "app"."quiz_attempts" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;
ALTER TABLE "app"."quiz_attempts" ALTER COLUMN "quiz_id" TYPE UUID USING "quiz_id"::UUID;

ALTER TABLE "app"."attempt_questions" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;
ALTER TABLE "app"."attempt_questions" ALTER COLUMN "attempt_id" TYPE UUID USING "attempt_id"::UUID;
ALTER TABLE "app"."attempt_questions" ALTER COLUMN "question_version_id" TYPE UUID USING "question_version_id"::UUID;

ALTER TABLE "app"."attempt_events" ALTER COLUMN "attempt_id" TYPE UUID USING "attempt_id"::UUID;
ALTER TABLE "app"."attempt_events" ALTER COLUMN "attempt_question_id" TYPE UUID USING "attempt_question_id"::UUID;

ALTER TABLE "app"."grade_appeals" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;
ALTER TABLE "app"."grade_appeals" ALTER COLUMN "attempt_question_id" TYPE UUID USING "attempt_question_id"::UUID;

ALTER TABLE "app"."navigation_items" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;
ALTER TABLE "app"."navigation_items" ALTER COLUMN "parent_id" TYPE UUID USING "parent_id"::UUID;

ALTER TABLE "app"."home_blocks" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;

ALTER TABLE "app"."media_assets" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;

ALTER TABLE "app"."session_devices" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;

-- ── Step 3: re-create every FK dropped in Step 1, identical to before ────

ALTER TABLE "app"."academic_years" ADD CONSTRAINT "academic_years_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "app"."education_systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."access_grants" ADD CONSTRAINT "access_grants_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "app"."courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."access_grants" ADD CONSTRAINT "access_grants_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "app"."subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."attempt_events" ADD CONSTRAINT "attempt_events_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "app"."quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."attempt_questions" ADD CONSTRAINT "attempt_questions_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "app"."quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."attempt_questions" ADD CONSTRAINT "attempt_questions_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "app"."question_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."course_sections" ADD CONSTRAINT "course_sections_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "app"."courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."courses" ADD CONSTRAINT "courses_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "app"."subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."courses" ADD CONSTRAINT "courses_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "app"."education_systems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."courses" ADD CONSTRAINT "courses_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "app"."tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."elective_groups" ADD CONSTRAINT "elective_groups_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "app"."tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."enrollments" ADD CONSTRAINT "enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "app"."courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."enrollments" ADD CONSTRAINT "enrollments_last_lesson_id_fkey" FOREIGN KEY ("last_lesson_id") REFERENCES "app"."lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."grade_appeals" ADD CONSTRAINT "grade_appeals_attempt_question_id_fkey" FOREIGN KEY ("attempt_question_id") REFERENCES "app"."attempt_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."lesson_attachments" ADD CONSTRAINT "lesson_attachments_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "app"."lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."lesson_progress" ADD CONSTRAINT "lesson_progress_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "app"."enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "app"."lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."lesson_texts" ADD CONSTRAINT "lesson_texts_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "app"."lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."lesson_videos" ADD CONSTRAINT "lesson_videos_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "app"."lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."lessons" ADD CONSTRAINT "lessons_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "app"."courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."lessons" ADD CONSTRAINT "lessons_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "app"."course_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- H1: restored verbatim (no ON UPDATE clause on the original either).
ALTER TABLE "app"."lessons" ADD CONSTRAINT "lessons_section_matches_course" FOREIGN KEY ("section_id", "course_id") REFERENCES "app"."course_sections"("id", "course_id") ON DELETE CASCADE;
ALTER TABLE "app"."lessons" ADD CONSTRAINT "lessons_unlocks_after_lesson_id_fkey" FOREIGN KEY ("unlocks_after_lesson_id") REFERENCES "app"."lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."navigation_items" ADD CONSTRAINT "navigation_items_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "app"."navigation_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."question_bank_entries" ADD CONSTRAINT "question_bank_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "app"."question_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."question_categories" ADD CONSTRAINT "question_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "app"."question_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."question_options" ADD CONSTRAINT "question_options_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "app"."question_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."question_versions" ADD CONSTRAINT "question_versions_bank_entry_id_fkey" FOREIGN KEY ("bank_entry_id") REFERENCES "app"."question_bank_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "app"."quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."quiz_pools" ADD CONSTRAINT "quiz_pools_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "app"."quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."quiz_slots" ADD CONSTRAINT "quiz_slots_bank_entry_id_fkey" FOREIGN KEY ("bank_entry_id") REFERENCES "app"."question_bank_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."quiz_slots" ADD CONSTRAINT "quiz_slots_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "app"."quiz_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."quiz_slots" ADD CONSTRAINT "quiz_slots_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "app"."quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."quizzes" ADD CONSTRAINT "quizzes_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "app"."lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."student_profiles" ADD CONSTRAINT "student_profiles_elective_subject_id_fkey" FOREIGN KEY ("elective_subject_id") REFERENCES "app"."subject_offerings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."student_profiles" ADD CONSTRAINT "student_profiles_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "app"."education_systems"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."student_profiles" ADD CONSTRAINT "student_profiles_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "app"."tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."subject_offerings" ADD CONSTRAINT "subject_offerings_elective_group_id_fkey" FOREIGN KEY ("elective_group_id") REFERENCES "app"."elective_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."subject_offerings" ADD CONSTRAINT "subject_offerings_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "app"."subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."subject_offerings" ADD CONSTRAINT "subject_offerings_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "app"."education_systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."subject_offerings" ADD CONSTRAINT "subject_offerings_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "app"."tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."track_faculties" ADD CONSTRAINT "track_faculties_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "app"."tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."tracks" ADD CONSTRAINT "tracks_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "app"."education_systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
