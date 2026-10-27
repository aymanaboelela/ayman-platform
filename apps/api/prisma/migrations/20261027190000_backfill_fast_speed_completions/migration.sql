-- ═══════════════════════════════════════════════════════════════════════════
-- Lectures watched to the end that never counted as watched.
--
-- Until this release a video lecture auto-completed only at 95% position AND
-- 70% of its runtime in watch time — and watch time is wall-clock, capped by
-- the server's own clock. On 2× that was 60% at best, and the player threw
-- most 2× ticks away as "seeks" besides, so a lecture watched start to finish
-- at speed stayed `in_progress`: open in «المتراكم», missing from the
-- progress bar, blocking the final exam. Students said so.
--
-- The rule is now 90% position and 35% watch time (`progress.ts`,
-- `MAX_PLAYBACK_RATE`). This marks the rows the OLD rule stranded.
--
-- The watch-time bar here is lower than the new rule's (10%, not 35%), on
-- purpose: those rows were recorded by the broken client, which under-reported
-- 2× viewing to almost nothing, so their `watched_seconds` cannot be held to a
-- bar the fixed client would meet. Reaching 90% of the lecture with at least
-- a tenth of it actually played is what separates watching from dragging the
-- scrubber to the end — and the manual «خلاص» button completes a lecture on
-- no evidence at all, so this is not a weaker gate than one that exists.
--
-- `completed_at` is the last heartbeat — when they actually finished — not
-- now(), so the timeline and the weekly league date it truthfully.
-- `enrollments.progress_percent` is not recomputed here (it depends on the
-- month slice, which lives in code); it catches up on the student's next
-- completion in that course. «المتراكم» and the exam gate read these rows
-- directly and are right immediately.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE "app"."lesson_progress" AS p
   SET "state"         = 'completed',
       "completion"    = 1,
       "completed_at"  = COALESCE(p."last_heartbeat_at", p."updated_at"),
       "completed_via" = 'auto',
       "updated_at"    = now()
  FROM "app"."lessons" AS l
  JOIN "app"."lesson_videos" AS v ON v."lesson_id" = l."id"
 WHERE p."lesson_id" = l."id"
   AND l."kind" = 'video'
   AND p."state" = 'in_progress'
   AND p."completed_at" IS NULL
   AND v."duration_seconds" > 0
   AND p."max_position_seconds" >= 0.9 * v."duration_seconds"
   AND p."watched_seconds" >= 0.1 * v."duration_seconds";
