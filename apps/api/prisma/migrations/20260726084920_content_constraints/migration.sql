-- ── Deferrable ordering constraints ──────────────────────────────────────
-- A non-deferred UNIQUE is checked per row DURING a statement, so a single
-- `UPDATE ... FROM (VALUES ...)` that rewrites every position in a section
-- trips a duplicate-key error partway through even though the FINAL state is
-- valid. DEFERRABLE INITIALLY DEFERRED moves the check to COMMIT, which is
-- what makes "reorder 40 lessons in one write" possible at all.
--
-- Prisma cannot express deferrability and does not introspect it, so the
-- @@unique in schema.prisma keeps drift detection quiet while THIS is the
-- constraint that actually exists.
--
-- NOTE: Prisma's generated `content` migration emitted these as bare
-- `CREATE UNIQUE INDEX`, not `ADD CONSTRAINT ... UNIQUE` — a plain unique
-- index has no entry in pg_constraint, so it is dropped with DROP INDEX, not
-- DROP CONSTRAINT (which errors "constraint ... does not exist").
DROP INDEX "app"."course_sections_course_position_key";
ALTER TABLE "app"."course_sections"
  ADD CONSTRAINT "course_sections_course_position_key"
  UNIQUE ("course_id", "position") DEFERRABLE INITIALLY DEFERRED;

DROP INDEX "app"."lessons_section_position_key";
ALTER TABLE "app"."lessons"
  ADD CONSTRAINT "lessons_section_position_key"
  UNIQUE ("section_id", "position") DEFERRABLE INITIALLY DEFERRED;

-- ── The SSRF backstop ────────────────────────────────────────────────────
-- external_id may only ever be an 11-character YouTube id. This holds against
-- a direct psql write, a future service that forgets the Zod schema, and a
-- migration that backfills from the wrong column.
ALTER TABLE "app"."lesson_videos"
  ADD CONSTRAINT "lesson_videos_youtube_id_only"
  CHECK ("provider" <> 'youtube' OR "external_id" ~ '^[A-Za-z0-9_-]{11}$');

-- ── Taxonomy coherence ───────────────────────────────────────────────────
-- Mirrors student_profiles_year1_has_no_track: grade 1 is common and
-- non-specialized across both systems, so a grade-1 course cannot have a track.
ALTER TABLE "app"."courses"
  ADD CONSTRAINT "courses_year1_has_no_track"
  CHECK ("year" <> 1 OR "track_id" IS NULL);

ALTER TABLE "app"."courses"
  ADD CONSTRAINT "courses_year_range"
  CHECK ("year" BETWEEN 1 AND 3);

-- A published course must have a published_at. Nothing else can express
-- "published" without also recording when.
ALTER TABLE "app"."courses"
  ADD CONSTRAINT "courses_published_has_timestamp"
  CHECK ("status" <> 'published' OR "published_at" IS NOT NULL);

-- ── Positions are non-negative ───────────────────────────────────────────
ALTER TABLE "app"."course_sections" ADD CONSTRAINT "course_sections_position_nonneg" CHECK ("position" >= 0);
ALTER TABLE "app"."lessons"         ADD CONSTRAINT "lessons_position_nonneg"         CHECK ("position" >= 0);

-- ── A lesson's denormalised course_id must match its section's ───────────
-- The service writes it, but a composite FK makes the invariant structural.
ALTER TABLE "app"."course_sections"
  ADD CONSTRAINT "course_sections_id_course_key" UNIQUE ("id", "course_id");
ALTER TABLE "app"."lessons"
  ADD CONSTRAINT "lessons_section_matches_course"
  FOREIGN KEY ("section_id", "course_id")
  REFERENCES "app"."course_sections" ("id", "course_id")
  ON DELETE CASCADE;
