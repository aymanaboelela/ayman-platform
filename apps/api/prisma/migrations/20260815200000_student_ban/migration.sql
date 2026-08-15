-- ═══════════════════════════════════════════════════════════════════════════
-- Banning a student — «حظر»
--
-- ## Why a ban exists alongside delete
--
-- The admin asked for both, and they answer different problems. A student who
-- is cheating, abusing المساعد, or sharing an account needs to be stopped
-- TODAY and possibly let back in next week — that is a ban, and it is
-- reversible. A student who asked to be removed, or who was created by
-- mistake, needs to be gone — that is a delete, and it is not.
--
-- Building only delete would have made every disciplinary action permanent and
-- destroyed the student's quiz history along with it. Building only a ban would
-- have left «امسحه خلاص» unanswerable.
--
-- ## Why a nullable timestamp and not a boolean
--
-- `banned_at` answers "since when", which is the question support is actually
-- asked, and it is the same shape every other state column in this schema uses
-- (`revoked_at`, `published_at`, `completed_at`). A boolean cannot be widened
-- into a timestamp later without a backfill that has no data to draw on.
--
-- ## Why the issuer is SET NULL and not CASCADE
--
-- `banned_by_user_id` records which admin did it. If that admin's own account
-- is later deleted, the ban must SURVIVE — a cascade here would silently
-- un-ban every student banned by a departed admin, which is the kind of
-- security regression nobody would think to look for. So the issuer pointer is
-- nulled and the ban stands on its own.
--
-- ## What this migration does NOT do
--
-- It does not enforce anything. Enforcement is two application-level controls,
-- and the column is inert without them:
--   · `databaseHooks.session.create.before` in `auth.config.ts` refuses to mint
--     a session for a banned user — one place, covering email/password sign-in,
--     sign-up, and Google.
--   · `StudentsService.ban` deletes the user's existing session rows, because
--     the hook above only fires on CREATION and a student already holding a
--     90-day session would otherwise be unaffected by their own ban.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "app"."users"
  ADD COLUMN "banned_at"         TIMESTAMP(3),
  ADD COLUMN "banned_reason"     TEXT,
  ADD COLUMN "banned_by_user_id" TEXT;

-- ON DELETE SET NULL — see the note above on why the ban outlives its issuer.
ALTER TABLE "app"."users"
  ADD CONSTRAINT "users_banned_by_user_id_fkey"
  FOREIGN KEY ("banned_by_user_id") REFERENCES "app"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial index: the only query that reads this column is "list the banned
-- students", and banned accounts are by construction a tiny minority of the
-- table. A partial index stays small forever and is not touched at all by the
-- overwhelmingly common case of an ordinary, un-banned user being written.
CREATE INDEX "users_banned_at_idx" ON "app"."users" ("banned_at") WHERE "banned_at" IS NOT NULL;
