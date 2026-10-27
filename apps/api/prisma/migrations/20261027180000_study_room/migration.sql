-- ═══════════════════════════════════════════════════════════════════════════
-- «بطاقات المراجعة», «أوضة المذاكرة», «دوري الأسبوع».
--
-- Three small tables keyed on the student, cascading with them. The league
-- stores nothing but the opt-out: its points are summed from rows that
-- already exist (progress, sittings, homework, the daily card, focus).
--
-- `flash_cards.bank_entry_id` has no foreign key for the same reason
-- `daily_answers.question_version_id` has none: the bank may archive or drop
-- an entry, and the read side simply stops dealing it.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "app"."flash_cards" (
    "user_id" TEXT NOT NULL,
    "bank_entry_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "box" SMALLINT NOT NULL,
    "due_on" DATE NOT NULL,
    "reviews" INTEGER NOT NULL DEFAULT 0,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flash_cards_pkey" PRIMARY KEY ("user_id","bank_entry_id"),
    CONSTRAINT "flash_cards_box_check" CHECK ("box" BETWEEN 1 AND 5)
);

CREATE TABLE "app"."focus_sessions" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "minutes" SMALLINT NOT NULL,
    "ended_at" TIMESTAMP(3),
    "completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "focus_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "focus_sessions_minutes_check" CHECK ("minutes" BETWEEN 5 AND 90),
    CONSTRAINT "focus_sessions_completed_check" CHECK (NOT "completed" OR "ended_at" IS NOT NULL)
);

CREATE TABLE "app"."league_settings" (
    "user_id" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "league_settings_pkey" PRIMARY KEY ("user_id")
);

CREATE INDEX "flash_cards_user_id_course_id_due_on_idx" ON "app"."flash_cards"("user_id", "course_id", "due_on");
CREATE INDEX "focus_sessions_user_id_started_at_idx" ON "app"."focus_sessions"("user_id", "started_at" DESC);
CREATE INDEX "focus_sessions_started_at_idx" ON "app"."focus_sessions"("started_at");

ALTER TABLE "app"."flash_cards" ADD CONSTRAINT "flash_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."focus_sessions" ADD CONSTRAINT "focus_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."league_settings" ADD CONSTRAINT "league_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
