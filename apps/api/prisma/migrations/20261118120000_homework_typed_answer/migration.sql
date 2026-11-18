-- «اكتب الحل» — a homework answer typed instead of photographed, for students
-- on the ministry tablet (Samsung Galaxy Tab), where photographing a sheet of
-- paper with the tablet and uploading it is the clumsy part of the exercise.
--
-- `answer_text` holds the typed answer; NULL on a photographed submission.
-- `device_model` is what the browser reported when the text was handed in
-- («SM-X205»), kept so the instructor can see which tablet it came from and so
-- a later look at the real models can tighten the matcher. Both nullable and
-- default-free: every existing row is a photographed submission, which is true.
--
-- The CHECK is the same ceiling the contract enforces (10,000 characters), so
-- a client that skips the schema still cannot park a novel in the queue.

ALTER TABLE "app"."homework_submissions"
    ADD COLUMN "answer_text" TEXT,
    ADD COLUMN "device_model" VARCHAR(64);

ALTER TABLE "app"."homework_submissions"
    ADD CONSTRAINT "homework_submissions_answer_text_length"
    CHECK ("answer_text" IS NULL OR char_length("answer_text") BETWEEN 1 AND 10000);
