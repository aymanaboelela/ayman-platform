-- ═══════════════════════════════════════════════════════════════════════════
-- «ساحة التحدي» plays on what the teacher picks, not on what the student picks.
--
-- Until now the arena lobby listed every active challenge topic of a course
-- and let the student pick one (or combine several into an open challenge).
-- The teacher wants the opposite: they choose, from the curriculum, what this
-- week's arena is about («الدرس التالت», «الوحدة التانية», «الوحدتين الأولى
-- والتانية»), and every subscribed student of that course meets that one
-- challenge.
--
-- `in_arena` marks the topic. At most one per course (the partial unique index)
-- — the service clears the old one in the same transaction that sets the new.
-- It is independent of `is_active`: a topic can be the arena's without being
-- listed in the single-player games, and the other way round.
--
-- Defaults to false, so after this migration no course has an arena challenge
-- until the teacher marks one from «قسم التحديات».
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "app"."challenge_topics" ADD COLUMN "in_arena" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "challenge_topics_one_arena_per_course"
  ON "app"."challenge_topics" ("course_id")
  WHERE "in_arena";
