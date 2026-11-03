-- ═══════════════════════════════════════════════════════════════════════════
-- «نسيت كلمة السر» — a six-digit code on WhatsApp, one row per request.
--
-- Every request is a row, whether or not an account owns the number: the
-- per-number and per-client limits are counts over this table, and counting
-- only registered numbers would make "too many requests" an answer to "is this
-- number registered?". See `PasswordResetRequest` in schema.prisma.
--
-- `code_hash` stays NULL until the sidecar has put the message on the wire —
-- the opposite order to Better Auth's phone OTP, which is why those routes are
-- still closed. A CHECK below holds that: no live state carries a hash it was
-- never sent with.
--
-- `whatsapp_sends.source` gains `otp`, so the device page counts codes against
-- the number like every other message.
--
-- No GRANT: `ALTER DEFAULT PRIVILEGES` in the entrypoint covers new tables.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "app"."password_reset_requests" (
  "id"         UUID NOT NULL,
  "phone"      VARCHAR(20) NOT NULL,
  "ip_bucket"  VARCHAR(64) NOT NULL,
  "user_id"    TEXT,
  "status"     VARCHAR(16) NOT NULL,
  "code_hash"  CHAR(64),
  "attempts"   INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at"    TIMESTAMP(3),
  "used_at"    TIMESTAMP(3),
  CONSTRAINT "password_reset_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "password_reset_requests_status_check"
    CHECK ("status" IN ('queued', 'no_account', 'capped', 'sending', 'sent', 'failed', 'used', 'spent', 'superseded')),
  -- The ordering rule, in the schema: a code that was never delivered has no
  -- hash to verify against, so nothing about a failed send can be guessed.
  CONSTRAINT "password_reset_requests_hash_only_once_sent"
    CHECK ("code_hash" IS NULL OR "status" IN ('sent', 'used', 'spent', 'superseded')),
  CONSTRAINT "password_reset_requests_attempts_non_negative" CHECK ("attempts" >= 0)
);

CREATE INDEX "password_reset_requests_phone_created_at_idx"
  ON "app"."password_reset_requests"("phone", "created_at" DESC);
CREATE INDEX "password_reset_requests_ip_bucket_created_at_idx"
  ON "app"."password_reset_requests"("ip_bucket", "created_at");
CREATE INDEX "password_reset_requests_created_at_idx"
  ON "app"."password_reset_requests"("created_at");

ALTER TABLE "app"."whatsapp_sends" DROP CONSTRAINT "whatsapp_sends_source_check";
ALTER TABLE "app"."whatsapp_sends" ADD CONSTRAINT "whatsapp_sends_source_check"
  CHECK ("source" IN ('campaign', 'shipping', 'outreach', 'test', 'other', 'bot', 'inbox', 'otp'));
