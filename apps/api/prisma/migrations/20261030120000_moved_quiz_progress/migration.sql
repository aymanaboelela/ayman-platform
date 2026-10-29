-- A moved quiz left its results behind.
--
-- `PATCH /admin/quizzes/:id/lesson` re-pointed the quiz (and so its attempts)
-- at a new lesson, but each sitting's result stayed in `lesson_progress` on
-- the OLD lesson. The path, «المتراكم» and the study plan read a quiz-kind
-- lesson's stop from `lesson_progress`, so every student who had already sat
-- a moved quiz saw it again as «مفتوح ومتسلّمش» — including at 100%.
--
-- This writes each student's best sitting onto the lesson the quiz sits on
-- NOW, for every quiz on a `quiz`-kind lesson. Same rule as
-- `recordQuizResultTx`: a pass wins, completion is the best, an existing
-- pass/completion is never taken away. On a quiz that was never moved the
-- row already says the same thing, so this is a no-op there; re-running it
-- changes nothing. `QuizBuilderService.carryResultsTx` does the same per move
-- from now on.

INSERT INTO app.lesson_progress
  (enrollment_id, lesson_id, completion, state, completed_at, completed_via, updated_at)
SELECT e.id, l.id, best.completion,
       (CASE WHEN best.passed THEN 'passed' ELSE 'failed' END)::app.lesson_progress_state,
       CASE WHEN best.passed THEN best.passed_at END,
       CASE WHEN best.passed THEN 'auto'::app.completion_source END,
       now()
  FROM (
    SELECT a.quiz_id,
           a.user_id,
           bool_or(a.passed IS TRUE) AS passed,
           LEAST(GREATEST(COALESCE(max(a.scaled_score / NULLIF(a.grade_out_of, 0)), 0), 0), 1) AS completion,
           min(a.submitted_at) FILTER (WHERE a.passed IS TRUE) AS passed_at
      FROM app.quiz_attempts a
     WHERE a.submitted_at IS NOT NULL
     GROUP BY a.quiz_id, a.user_id
  ) best
  JOIN app.quizzes q ON q.id = best.quiz_id
  JOIN app.lessons l ON l.id = q.lesson_id AND l.kind = 'quiz'
  JOIN app.enrollments e ON e.user_id = best.user_id AND e.course_id = l.course_id
ON CONFLICT (enrollment_id, lesson_id) DO UPDATE SET
  completion = GREATEST(lesson_progress.completion, EXCLUDED.completion),
  state = CASE WHEN lesson_progress.state IN ('passed', 'completed') THEN lesson_progress.state
               ELSE EXCLUDED.state END,
  completed_at = CASE WHEN lesson_progress.state IN ('passed', 'completed') THEN lesson_progress.completed_at
                      ELSE EXCLUDED.completed_at END,
  completed_via = CASE WHEN lesson_progress.state IN ('passed', 'completed') THEN lesson_progress.completed_via
                       ELSE EXCLUDED.completed_via END,
  updated_at = now()
-- Only rows that actually change: an already-right `failed` row is left
-- untouched rather than rewritten with the same values.
WHERE (lesson_progress.state NOT IN ('passed', 'completed') AND lesson_progress.state <> EXCLUDED.state)
   OR lesson_progress.completion < EXCLUDED.completion;
