-- A centre group («مجموعة») can teach one track: عربي or لغات. NULL = both,
-- which is what every existing slot means today, so nothing changes for them.
-- The reservation page filters groups by the track the student picked.
ALTER TABLE "app"."center_slots"
  ADD COLUMN "track" TEXT,
  ADD CONSTRAINT "center_slots_track" CHECK ("track" IS NULL OR "track" IN ('arabic', 'languages'));
