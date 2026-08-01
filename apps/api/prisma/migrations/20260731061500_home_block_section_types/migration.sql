-- Four new landing-section variants for the homepage composer.
--
-- `whyRail`, `about` and `courseGrid` carry their own copy; `instructor` and
-- `yearTracks` are placement-only (the sections build themselves from the
-- catalogue and the taxonomy — see packages/contracts/src/admin/home-blocks.ts).
--
-- ADD VALUE is append-only and cannot run inside a transaction block in older
-- servers; IF NOT EXISTS makes each statement idempotent so re-running this
-- migration against a partially-applied database is safe.
ALTER TYPE "app"."home_block_type" ADD VALUE IF NOT EXISTS 'whyRail';
ALTER TYPE "app"."home_block_type" ADD VALUE IF NOT EXISTS 'instructor';
ALTER TYPE "app"."home_block_type" ADD VALUE IF NOT EXISTS 'yearTracks';
ALTER TYPE "app"."home_block_type" ADD VALUE IF NOT EXISTS 'about';
