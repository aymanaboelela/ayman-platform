-- أسئلة الطلبة للمساعد — عشان أيمن يشوفها.
--
-- WHAT PROBLEM THIS SOLVES
--
-- The open chat shipped storing nothing at all, on purpose: no transcript
-- table, no log line carrying what a student typed. That was the right default
-- for a feature nobody had used yet.
--
-- It stopped being right the moment the chat started answering real questions.
-- The list of things students asked — especially the ones المساعد could not
-- answer — is the single most useful thing this product could put in front of
-- the instructor: it is where the next corpus entries come from, in the
-- students' own wording. It was being discarded on every request.
--
-- WHAT IS DELIBERATELY NOT IN THIS TABLE
--
-- No name, no phone, no IP, no session id, no guest-cookie hash. A signed-in
-- student is a `user_id`; a visitor is NULL and is genuinely anonymous rather
-- than pseudonymous. The name the admin screen shows is JOINED from `users` at
-- read time, so deleting an account removes the identification without
-- removing the question.
--
-- ON DELETE SET NULL, not CASCADE
--
-- Same choice `conversations` makes, for the same reason: the question outlives
-- the asker's account because its value is in the WORDING, not in who typed
-- it. Cascade would quietly delete evidence of a gap in the corpus every time
-- a student was removed.
--
-- RETENTION
--
-- Ninety days, swept daily by `AssistantQuestionService`. Long enough to see a
-- pattern across a term; short enough that a database dump is not a permanent
-- record of what a fifteen-year-old typed at midnight. The sweep is in
-- application code rather than a database job so it is visible to anyone
-- reading the module and testable without a scheduler.

CREATE TABLE "app"."assistant_questions" (
    "id" UUID NOT NULL,
    "user_id" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "provider" VARCHAR(120),
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_questions_pkey" PRIMARY KEY ("id")
);

-- Newest-first for the admin list, oldest-first for the retention sweep — one
-- index answers both, because a descending b-tree is scanned either way.
CREATE INDEX "assistant_questions_created_at_idx"
    ON "app"."assistant_questions" ("created_at" DESC);

-- «اللي المساعد وقف قدامه» is the actionable filter on that screen, and the
-- rows it matches are a small fraction of the table.
CREATE INDEX "assistant_questions_escalated_created_at_idx"
    ON "app"."assistant_questions" ("escalated", "created_at" DESC);

ALTER TABLE "app"."assistant_questions"
    ADD CONSTRAINT "assistant_questions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
