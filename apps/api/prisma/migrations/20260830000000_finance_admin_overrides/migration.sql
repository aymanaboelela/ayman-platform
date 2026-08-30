-- ═══════════════════════════════════════════════════════════════════════════
-- `/admin/finance` super-admin controls — early-cancel with a reason.
--
-- Two new nullable/defaulted columns on `access_grants`: `cancel_reason` (the
-- admin's own words for why he cut a subscription short) and
-- `cancel_reason_visible_to_student` (whether that reason should ever reach
-- the student — a separate choice from writing it at all, defaulting to
-- `false` so typing a reason never becomes student-visible by accident).
-- See the model doc on `AccessGrant.cancelReason`.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "app"."access_grants" ADD COLUMN "cancel_reason" TEXT;
ALTER TABLE "app"."access_grants" ADD COLUMN "cancel_reason_visible_to_student" BOOLEAN NOT NULL DEFAULT false;
