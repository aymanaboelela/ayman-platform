-- Re-derive every enrolment's progress percentage now that the denominator is
-- LECTURES rather than every lesson row.
--
-- `CourseProgressService.recalculate` stopped counting quiz lessons, but
-- `enrollment.progress_percent` is a STORED aggregate: it is only rewritten
-- when a lesson changes state. Without this backfill, an enrolment that had
-- not moved since the deploy would keep serving the old number — so the
-- library page would print «خلصت ١٧٪» directly above «١ / ٥», the two
-- computed over different sets. That disagreement is precisely what this
-- change set out to remove, and leaving it in the stored column would have
-- reproduced it on every existing enrolment.
--
-- Recomputed with the same three predicates the service uses, and the same
-- cleared states (`completed`, `passed`) the gate treats as cleared:
--   · the lesson is published
--   · its section is published
--   · its kind is not `quiz`
--
-- `completed_at` is re-derived too, for the same reason: a course whose only
-- unfinished rows were quizzes could not previously reach 100%, so its
-- `completed_at` was never stamped and it stayed in «اللي لسه شغال عليه»
-- forever. A course with no lectures at all (the quiz fixtures, and any
-- course still being built) has no denominator, so it scores 0 and is not
-- finished — matching `totalLessons > 0 && …` in the service.

-- LEFT JOIN from `enrollments`, not from `lessons`: an enrolment in a course
-- with no published lecture at all must still be reset to 0, and an inner join
-- would leave exactly those rows carrying their old number.
WITH reachable AS (
  SELECT
    e.id AS enrollment_id,
    count(l.id) FILTER (WHERE l.kind <> 'quiz') AS total_lectures,
    count(l.id) FILTER (
      WHERE l.kind <> 'quiz' AND lp.state IN ('completed', 'passed')
    ) AS cleared_lectures
  FROM app.enrollments e
  LEFT JOIN app.course_sections s
    ON s.course_id = e.course_id
   AND s.is_published
  LEFT JOIN app.lessons l
    ON l.section_id = s.id
   AND l.course_id = e.course_id
   AND l.is_published
  LEFT JOIN app.lesson_progress lp
    ON lp.enrollment_id = e.id
   AND lp.lesson_id = l.id
  GROUP BY e.id
)
UPDATE app.enrollments e
SET
  progress_percent = CASE
    WHEN r.total_lectures = 0 THEN 0
    ELSE round((r.cleared_lectures::numeric / r.total_lectures) * 100, 2)
  END,
  completed_at = CASE
    WHEN r.total_lectures > 0 AND r.cleared_lectures = r.total_lectures
      THEN coalesce(e.completed_at, now())
    ELSE NULL
  END
FROM reachable r
WHERE r.enrollment_id = e.id;
