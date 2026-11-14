-- «مفتوح لغير المشتركين»: a monthly exam that any student matching the
-- course's system/year/stream can sit without an enrollment. Defaults to
-- false so every existing quiz keeps the enrolment-only gate it has today.
-- A constant default on ADD COLUMN is metadata-only in Postgres 11+: no
-- table rewrite, no long lock on `quizzes`.
ALTER TABLE "app"."quizzes"
  ADD COLUMN "open_to_non_subscribers" BOOLEAN NOT NULL DEFAULT false;
