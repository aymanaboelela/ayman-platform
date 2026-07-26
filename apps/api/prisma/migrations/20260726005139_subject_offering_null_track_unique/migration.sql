-- Postgres treats NULLs as distinct, so the composite unique constraint on
-- (system_id, year, track_id, subject_id) does not constrain rows where
-- track_id IS NULL — i.e. every year-1 offering. This partial index does.
CREATE UNIQUE INDEX "subject_offerings_system_year_subject_null_track_key"
  ON "app"."subject_offerings" ("system_id", "year", "subject_id")
  WHERE "track_id" IS NULL;
