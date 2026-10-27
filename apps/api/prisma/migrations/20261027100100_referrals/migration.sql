-- ═══════════════════════════════════════════════════════════════════════════
-- «ادعي صاحبك» — a share link per student; a friend who signs up through it
-- and makes a first REAL payment earns both of them wallet credit.
--
-- Three tables and one ledger column:
--
--   · `referral_program`  — the switch and the numbers (singleton, OFF until
--     an admin turns it on).
--   · `referral_codes`    — one stable code per student, `/r/<code>`.
--   · `referrals`         — one row per friend, attributed once at sign-up
--     (UNIQUE `referred_user_id`), moved `joined → credited` by a conditional
--     UPDATE in the same transaction as both ledger credits.
--   · `wallet_transactions.referral_id` — which referral a reward or reversal
--     row belongs to, with `(referral_id, user_id, kind)` UNIQUE so the
--     database itself refuses a second reward for the same person.
--
-- ## The ledger's CHECKs are rewritten, not loosened
--
-- `referral_reward` joins the positive kinds; `referral_reversal` falls into
-- the negative ELSE. Both are NEVER income — no money arrived from anybody —
-- and that is exactly what keeps a referral credit from ever counting as «real
-- money» when the reward rules ask whether a wallet purchase was funded by it.
--
-- No GRANT: `scripts/db-bootstrap.sql`'s ALTER DEFAULT PRIVILEGES covers new
-- tables. No docker-entrypoint change.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "app"."referral_status" AS ENUM ('joined', 'credited', 'reversed', 'blocked', 'voided');

-- ── the program ──────────────────────────────────────────────────────────

CREATE TABLE "app"."referral_program" (
  "id"                    INTEGER NOT NULL DEFAULT 1,
  "enabled"               BOOLEAN NOT NULL DEFAULT false,
  "referrer_reward_cents" INTEGER NOT NULL DEFAULT 5000,
  "friend_reward_cents"   INTEGER NOT NULL DEFAULT 2500,
  "monthly_cap"           INTEGER NOT NULL DEFAULT 10,
  "window_days"           INTEGER NOT NULL DEFAULT 30,
  "whatsapp_notice"       BOOLEAN NOT NULL DEFAULT true,
  "updated_by"            TEXT,
  "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_program_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "referral_program_singleton" CHECK ("id" = 1),
  -- ١٠٠٠ جنيه سقف للمكافأة الواحدة: رقم أكبر من كده صفر زيادة اتكتب غلط.
  CONSTRAINT "referral_program_rewards_range" CHECK (
    "referrer_reward_cents" BETWEEN 0 AND 100000 AND "friend_reward_cents" BETWEEN 0 AND 100000
  ),
  CONSTRAINT "referral_program_cap_range" CHECK ("monthly_cap" BETWEEN 1 AND 1000),
  CONSTRAINT "referral_program_window_range" CHECK ("window_days" BETWEEN 1 AND 90)
);

-- ── one code per student ─────────────────────────────────────────────────

CREATE TABLE "app"."referral_codes" (
  "user_id"    TEXT NOT NULL,
  "code"       VARCHAR(16) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("user_id")
);
CREATE UNIQUE INDEX "referral_codes_code_key" ON "app"."referral_codes"("code");
ALTER TABLE "app"."referral_codes" ADD CONSTRAINT "referral_codes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── one row per friend ───────────────────────────────────────────────────

CREATE TABLE "app"."referrals" (
  "id"                    UUID NOT NULL,
  "referrer_user_id"      TEXT NOT NULL,
  "referred_user_id"      TEXT NOT NULL,
  "code"                  VARCHAR(16) NOT NULL,
  "status"                "app"."referral_status" NOT NULL DEFAULT 'joined',
  "block_reason"          VARCHAR(32),
  "trigger_submission_id" UUID,
  "referrer_reward_cents" INTEGER,
  "friend_reward_cents"   INTEGER,
  "credited_at"           TIMESTAMP(3),
  "reversed_cents"        INTEGER,
  "reversed_at"           TIMESTAMP(3),
  "voided_at"             TIMESTAMP(3),
  "voided_by_user_id"     TEXT,
  "void_reason"           VARCHAR(300),
  "notice_at"             TIMESTAMP(3),
  "notice_outcome"        VARCHAR(32),
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referrals_pkey" PRIMARY KEY ("id"),
  -- Nobody refers themselves — also refused in the sign-up hook, and again at
  -- reward time; this is the floor under both.
  CONSTRAINT "referrals_not_self" CHECK ("referrer_user_id" <> "referred_user_id"),
  -- A credited row says when and how much; nothing else claims to be paid.
  CONSTRAINT "referrals_credited_shape" CHECK (
    "status" NOT IN ('credited', 'reversed') OR (
      "credited_at" IS NOT NULL AND "referrer_reward_cents" IS NOT NULL AND "friend_reward_cents" IS NOT NULL
    )
  ),
  CONSTRAINT "referrals_blocked_reason" CHECK (("status" = 'blocked') = ("block_reason" IS NOT NULL))
);

CREATE UNIQUE INDEX "referrals_referred_user_id_key" ON "app"."referrals"("referred_user_id");
CREATE UNIQUE INDEX "referrals_trigger_submission_id_key" ON "app"."referrals"("trigger_submission_id");
CREATE INDEX "referrals_referrer_user_id_created_at_idx" ON "app"."referrals"("referrer_user_id", "created_at" DESC);
CREATE INDEX "referrals_status_created_at_idx" ON "app"."referrals"("status", "created_at");
CREATE INDEX "referrals_status_credited_at_idx" ON "app"."referrals"("status", "credited_at");

ALTER TABLE "app"."referrals" ADD CONSTRAINT "referrals_referrer_user_id_fkey"
  FOREIGN KEY ("referrer_user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."referrals" ADD CONSTRAINT "referrals_referred_user_id_fkey"
  FOREIGN KEY ("referred_user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."referrals" ADD CONSTRAINT "referrals_voided_by_user_id_fkey"
  FOREIGN KEY ("voided_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."referrals" ADD CONSTRAINT "referrals_trigger_submission_id_fkey"
  FOREIGN KEY ("trigger_submission_id") REFERENCES "app"."payment_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── the ledger ───────────────────────────────────────────────────────────

ALTER TABLE "app"."wallet_transactions" ADD COLUMN "referral_id" UUID;
CREATE UNIQUE INDEX "wallet_transactions_referral_id_user_id_kind_key"
  ON "app"."wallet_transactions"("referral_id", "user_id", "kind");
-- SET NULL, not CASCADE: a referral goes with a deleted account, the money
-- row it moved does not. The append-only trigger allows this — `referral_id`
-- is not one of the money columns it guards — and the CHECK below accepts a
-- NULL on any kind.
ALTER TABLE "app"."wallet_transactions" ADD CONSTRAINT "wallet_transactions_referral_id_fkey"
  FOREIGN KEY ("referral_id") REFERENCES "app"."referrals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."wallet_transactions" DROP CONSTRAINT "wallet_transactions_sign_by_kind";
ALTER TABLE "app"."wallet_transactions" ADD CONSTRAINT "wallet_transactions_sign_by_kind" CHECK (
  CASE
    WHEN "kind" IN ('admin_credit', 'code_topup', 'transfer_topup', 'refund', 'referral_reward') THEN "amount_cents" > 0
    ELSE "amount_cents" < 0
  END
);

ALTER TABLE "app"."wallet_transactions" DROP CONSTRAINT "wallet_transactions_income_by_kind";
ALTER TABLE "app"."wallet_transactions" ADD CONSTRAINT "wallet_transactions_income_by_kind" CHECK (
  CASE
    WHEN "kind" = 'transfer_topup' THEN "counts_as_income"
    WHEN "kind" IN ('course_purchase', 'refund', 'referral_reward', 'referral_reversal') THEN NOT "counts_as_income"
    ELSE true
  END
);

ALTER TABLE "app"."wallet_transactions" ADD CONSTRAINT "wallet_transactions_referral_by_kind" CHECK (
  "referral_id" IS NULL OR "kind" IN ('referral_reward', 'referral_reversal')
);
