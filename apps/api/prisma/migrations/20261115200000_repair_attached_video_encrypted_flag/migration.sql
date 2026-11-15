-- Repair lesson videos whose `encrypted` flag was inherited from the video
-- they replaced.
--
-- `VideoLibraryService.attach` / `restore` upserted the lesson's row without
-- the flag, so a lesson that used to hold a YouTube id or a plain upload
-- (`false`) kept `false` under an AES-128 ladder. The key route then refused
-- the key and the lecture would not play for anyone (2026-11-15).
--
-- Only rows provably touched by attach/restore of THAT video are changed, and
-- only towards `true` — the safe direction: a plain ladder's playlists carry
-- no #EXT-X-KEY, so its key is never requested. No match = no-op, which is
-- the expected result on most stacks.
UPDATE "app"."lesson_videos" AS lv
SET "encrypted" = true
WHERE lv."provider" = 'upload'
  AND lv."encrypted" = false
  AND EXISTS (
    SELECT 1
    FROM "app"."audit_log" AS a
    WHERE a."resource_type" = 'lessons'
      AND a."resource_id" = lv."lesson_id"::text
      AND a."action" = 'lesson:update'
      AND a."metadata"->>'operation' IN ('attachVideo', 'restoreVideo')
      AND a."metadata"->>'videoId' = lv."external_id"
  );
