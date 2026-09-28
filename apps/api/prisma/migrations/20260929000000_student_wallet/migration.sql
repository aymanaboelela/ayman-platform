-- ═══════════════════════════════════════════════════════════════════════════
-- «المحفظة» — رصيد لكل طالب، بيتشحن (هو بتحويل، أو الأدمن بإيده، أو بكود)
-- وبيتصرف على اشتراكات الكورسات.
--
-- ## دفتر، مش رقم بيتعدّل
--
-- `wallet_transactions` هو الحقيقة: كل حركة صف، بإشارتها (موجب = دخل
-- المحفظة، سالب = خرج منها)، ومفيش صف بيتعدّل ولا بيتمسح (التريجر تحت).
-- `wallets.balance_cents` مجرد المجموع الجاري، وبيتكتب في نفس الترانزاكشن مع
-- كل صف — وتريجر مؤجَّل بيتأكد وقت الـCOMMIT إن الرقم ده = SUM الدفتر، فلو
-- حد كتب واحد من غير التاني الترانزاكشن كلها بتقع.
--
-- ## مفيش رصيد بالسالب — من بوستجرس مش من الكود
--
-- الخصم UPDATE واحد مشروط: `balance_cents = balance_cents - x WHERE
-- balance_cents >= x`. طلبين بيصرفوا نفس الـ٣٠٠ جنيه في نفس اللحظة: الصف
-- بيتقفل للأول، والتاني بيلاقي صفر صفوف. و`wallets_balance_non_negative`
-- تحته لو حد نسي الشرط.
--
-- ## مفيش شحن مرتين
--
-- كل مصدر فلوس ليه UNIQUE بتاعه: `topup_id` (طلب الشحن اتقبل مرة)،
-- `unlock_code_id` (الكود اتصرف مرة)، `idempotency_key` (دوسة واحدة على
-- «اشحن» أو «ادفع من المحفظة»). الدبل كليك بيقع على الـUNIQUE.
--
-- ## الفلوس بتتحسب مرة واحدة بس في المالية
--
-- الشحن اللي جه بفلوس حقيقية دخل (`counts_as_income`) في يومه. الاشتراك من
-- المحفظة **مش** دخل جديد — `payment_submissions.wallet_transaction_id` معلّم
-- عليه، وكل مجموع إيرادات بيستبعده (`SUBSCRIPTION_CASH_SQL`). الهدية/التعويض
-- بتدخل المحفظة من غير ما تتحسب دخل.
--
-- ## ALTER TYPE في نفس الملف
--
-- `ADD VALUE` مسموح جوّه ترانزاكشن طول ما القيمة الجديدة مش مستخدمة قبل
-- الـcommit — ومفيش حاجة تحت بتكتب إشعار. نفس كلام
-- `20260905010000_course_completed_notification`.
--
-- مفيش GRANT: `scripts/db-bootstrap.sql` فيه ALTER DEFAULT PRIVILEGES اللي
-- بيغطّي أي جدول جديد. والحماية هنا تريجرات مش REVOKE، عشان الـentrypoint
-- بيرجّع كل الصلاحيات مع كل boot (شوف `audit_log`).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "app"."wallet_transaction_kind" AS ENUM (
  'admin_credit', 'code_topup', 'transfer_topup', 'refund', 'course_purchase', 'admin_debit'
);
CREATE TYPE "app"."wallet_topup_method" AS ENUM ('instapay', 'vodafone_cash');

ALTER TYPE "app"."notification_kind" ADD VALUE IF NOT EXISTS 'wallet_topup_submitted';
ALTER TYPE "app"."notification_kind" ADD VALUE IF NOT EXISTS 'wallet_credited';
ALTER TYPE "app"."notification_kind" ADD VALUE IF NOT EXISTS 'wallet_topup_rejected';

-- ── المحفظة ───────────────────────────────────────────────────────────────

CREATE TABLE "app"."wallets" (
  "user_id"       TEXT NOT NULL,
  "balance_cents" INTEGER NOT NULL DEFAULT 0,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wallets_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "wallets_balance_non_negative" CHECK ("balance_cents" >= 0)
);

ALTER TABLE "app"."wallets" ADD CONSTRAINT "wallets_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── طلبات الشحن (إنستاباي / فودافون كاش) ─────────────────────────────────

CREATE TABLE "app"."wallet_topups" (
  "id"                    UUID NOT NULL,
  "user_id"               TEXT NOT NULL,
  "method"                "app"."wallet_topup_method" NOT NULL,
  "amount_cents"          INTEGER NOT NULL,
  "approved_amount_cents" INTEGER,
  "sender"                TEXT NOT NULL,
  "note"                  TEXT,
  "screenshot_key"        TEXT NOT NULL,
  "status"                "app"."payment_submission_status" NOT NULL DEFAULT 'pending',
  "rejection_reason"      TEXT,
  "reviewed_by_user_id"   TEXT,
  "reviewed_at"           TIMESTAMP(3),
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wallet_topups_pkey" PRIMARY KEY ("id"),
  -- ١٠٠ ألف جنيه سقف للحركة الواحدة: رقم زيادة غلط في الكتابة مش شحن.
  CONSTRAINT "wallet_topups_amount_range" CHECK ("amount_cents" > 0 AND "amount_cents" <= 10000000),
  CONSTRAINT "wallet_topups_approved_amount_range"
    CHECK ("approved_amount_cents" IS NULL OR ("approved_amount_cents" > 0 AND "approved_amount_cents" <= 10000000)),
  -- المبلغ اللي اتشحن فعلًا موجود لما الطلب يتقبل، ولما يتقبل بس.
  CONSTRAINT "wallet_topups_approved_amount_pair"
    CHECK (("status" = 'approved') = ("approved_amount_cents" IS NOT NULL)),
  CONSTRAINT "wallet_topups_rejection_pair"
    CHECK ("rejection_reason" IS NULL OR "status" = 'rejected'),
  CONSTRAINT "wallet_topups_reviewed_pair"
    CHECK (("status" = 'pending') = ("reviewed_at" IS NULL))
);

CREATE INDEX "wallet_topups_status_created_at_idx" ON "app"."wallet_topups"("status", "created_at");
CREATE INDEX "wallet_topups_user_id_created_at_idx" ON "app"."wallet_topups"("user_id", "created_at");

ALTER TABLE "app"."wallet_topups" ADD CONSTRAINT "wallet_topups_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."wallet_topups" ADD CONSTRAINT "wallet_topups_reviewed_by_user_id_fkey"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── كود شحن المحفظة: كود من غير كورس ────────────────────────────────────

ALTER TABLE "app"."unlock_codes"
  ADD COLUMN "wallet_credit_cents" INTEGER,
  ADD COLUMN "wallet_credit_paid" BOOLEAN NOT NULL DEFAULT true,
  ALTER COLUMN "course_id" DROP NOT NULL;

-- شكلين بس للصف: كود كورس (كورس، ومفيش فلوس)، أو كود محفظة (فلوس، ومفيش
-- كورس ولا «الكورس كله»). كل الأكواد الموجودة من النوع الأول.
ALTER TABLE "app"."unlock_codes" ADD CONSTRAINT "unlock_codes_one_target" CHECK (
  ("course_id" IS NOT NULL AND "wallet_credit_cents" IS NULL)
  OR ("course_id" IS NULL AND "wallet_credit_cents" IS NOT NULL AND "whole_course" = false)
);
ALTER TABLE "app"."unlock_codes" ADD CONSTRAINT "unlock_codes_wallet_credit_range" CHECK (
  "wallet_credit_cents" IS NULL OR ("wallet_credit_cents" > 0 AND "wallet_credit_cents" <= 10000000)
);

-- ── الدفتر ────────────────────────────────────────────────────────────────

CREATE TABLE "app"."wallet_transactions" (
  "id"                      UUID NOT NULL,
  "user_id"                 TEXT NOT NULL,
  "kind"                    "app"."wallet_transaction_kind" NOT NULL,
  "amount_cents"            INTEGER NOT NULL,
  "balance_after_cents"     INTEGER NOT NULL,
  "counts_as_income"        BOOLEAN NOT NULL DEFAULT false,
  "topup_id"                UUID,
  "unlock_code_id"          UUID,
  "refund_of_submission_id" UUID,
  "idempotency_key"         UUID,
  "actor_user_id"           TEXT,
  "note"                    TEXT,
  "created_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "wallet_transactions_amount_range"
    CHECK ("amount_cents" <> 0 AND abs("amount_cents") <= 10000000),
  CONSTRAINT "wallet_transactions_balance_after_non_negative" CHECK ("balance_after_cents" >= 0),
  -- الإشارة من النوع: الشحن بيزوّد بس، والصرف بيخصم بس.
  CONSTRAINT "wallet_transactions_sign_by_kind" CHECK (
    CASE
      WHEN "kind" IN ('admin_credit', 'code_topup', 'transfer_topup', 'refund') THEN "amount_cents" > 0
      ELSE "amount_cents" < 0
    END
  ),
  -- الدخل: التحويل دايمًا دخل، والشراء من المحفظة والمرتجع عليه أبدًا.
  CONSTRAINT "wallet_transactions_income_by_kind" CHECK (
    CASE
      WHEN "kind" = 'transfer_topup' THEN "counts_as_income"
      WHEN "kind" IN ('course_purchase', 'refund') THEN NOT "counts_as_income"
      ELSE true
    END
  ),
  -- كل نوع بمرجعه، ومفيش مرجع على نوع مش بتاعه.
  CONSTRAINT "wallet_transactions_topup_by_kind"
    CHECK (("kind" = 'transfer_topup') = ("topup_id" IS NOT NULL)),
  CONSTRAINT "wallet_transactions_code_by_kind"
    CHECK (("kind" = 'code_topup') = ("unlock_code_id" IS NOT NULL)),
  CONSTRAINT "wallet_transactions_refund_by_kind"
    CHECK ("refund_of_submission_id" IS NULL OR "kind" = 'refund')
);

CREATE UNIQUE INDEX "wallet_transactions_topup_id_key" ON "app"."wallet_transactions"("topup_id");
CREATE UNIQUE INDEX "wallet_transactions_unlock_code_id_key" ON "app"."wallet_transactions"("unlock_code_id");
CREATE UNIQUE INDEX "wallet_transactions_idempotency_key_key" ON "app"."wallet_transactions"("idempotency_key");
CREATE INDEX "wallet_transactions_user_id_created_at_idx" ON "app"."wallet_transactions"("user_id", "created_at" DESC);
CREATE INDEX "wallet_transactions_created_at_idx" ON "app"."wallet_transactions"("created_at");
CREATE INDEX "wallet_transactions_refund_of_submission_id_idx" ON "app"."wallet_transactions"("refund_of_submission_id");

ALTER TABLE "app"."wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app"."wallets"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."wallet_transactions" ADD CONSTRAINT "wallet_transactions_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- NO ACTION مش RESTRICT: مسح حساب الطالب بيمسح الطلب والدفتر في نفس
-- الـstatement، وRESTRICT بيتشيك فورًا حسب ترتيب الكاسكيد فيقع. NO ACTION
-- بيتشيك في آخر الـstatement، ووقتها الاتنين راحوا.
ALTER TABLE "app"."wallet_transactions" ADD CONSTRAINT "wallet_transactions_topup_id_fkey"
  FOREIGN KEY ("topup_id") REFERENCES "app"."wallet_topups"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "app"."wallet_transactions" ADD CONSTRAINT "wallet_transactions_unlock_code_id_fkey"
  FOREIGN KEY ("unlock_code_id") REFERENCES "app"."unlock_codes"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "app"."wallet_transactions" ADD CONSTRAINT "wallet_transactions_refund_of_submission_id_fkey"
  FOREIGN KEY ("refund_of_submission_id") REFERENCES "app"."payment_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── الاشتراك اللي اتدفع من المحفظة ─────────────────────────────────────

ALTER TABLE "app"."payment_submissions" ADD COLUMN "wallet_transaction_id" UUID;
CREATE UNIQUE INDEX "payment_submissions_wallet_transaction_id_key"
  ON "app"."payment_submissions"("wallet_transaction_id");
ALTER TABLE "app"."payment_submissions" ADD CONSTRAINT "payment_submissions_wallet_transaction_id_fkey"
  FOREIGN KEY ("wallet_transaction_id") REFERENCES "app"."wallet_transactions"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
-- دفعة من المحفظة اتقبلت بطبيعتها، ومش «مجاني» — الفلوس اتدفعت فعلًا.
ALTER TABLE "app"."payment_submissions" ADD CONSTRAINT "payment_submissions_wallet_paid_shape" CHECK (
  "wallet_transaction_id" IS NULL OR ("status" = 'approved' AND "is_free" = false)
);

-- ── الحراسة ───────────────────────────────────────────────────────────────

-- الدفتر مابيتعدّلش: أي UPDATE بيغيّر فلوس أو صاحبها أو تاريخها بيترفض.
-- الأعمدة التانية (مين عمله، المرتجع على أنهي دفعة) بتتصفّر لوحدها بـSET NULL
-- لما الأدمن أو الكورس يتمسح، فلازم تفضل مسموحة.
-- والمسح مسموح بس لما يكون كاسكيد من مسح الحساب (`pg_trigger_depth() > 1` —
-- الكاسكيد نفسه تريجر، فالمسح اللي جاي منه بيبقى على عمق ٢). DELETE مباشر
-- على الجدول بيترفض.
CREATE OR REPLACE FUNCTION "app"."wallet_transactions_append_only"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() < 2 THEN
      RAISE EXCEPTION 'wallet_transactions is append-only'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW."amount_cents" IS DISTINCT FROM OLD."amount_cents"
     OR NEW."balance_after_cents" IS DISTINCT FROM OLD."balance_after_cents"
     OR NEW."kind" IS DISTINCT FROM OLD."kind"
     OR NEW."user_id" IS DISTINCT FROM OLD."user_id"
     OR NEW."counts_as_income" IS DISTINCT FROM OLD."counts_as_income"
     OR NEW."topup_id" IS DISTINCT FROM OLD."topup_id"
     OR NEW."unlock_code_id" IS DISTINCT FROM OLD."unlock_code_id"
     OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'wallet_transactions is append-only'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "wallet_transactions_append_only"
  BEFORE UPDATE OR DELETE ON "app"."wallet_transactions"
  FOR EACH ROW EXECUTE FUNCTION "app"."wallet_transactions_append_only"();

-- ونفس الكلام على صف المحفظة: مسحه مباشرة كان هياخد الدفتر كله معاه
-- بالكاسكيد. مسموح بس وهو نفسه جاي كاسكيد من مسح الحساب.
CREATE OR REPLACE FUNCTION "app"."wallets_no_direct_delete"()
RETURNS TRIGGER AS $$
BEGIN
  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'a wallet is removed only with its account'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "wallets_no_direct_delete"
  BEFORE DELETE ON "app"."wallets"
  FOR EACH ROW EXECUTE FUNCTION "app"."wallets_no_direct_delete"();

-- الرصيد = مجموع الدفتر، وقت الـCOMMIT. مؤجَّل عشان الخدمة بتكتب الصف
-- والرصيد ورا بعض في نفس الترانزاكشن، والمهم إن الاتنين يتفقوا في الآخر.
-- محفظة اتمسحت (كاسكيد من الحساب) مالهاش حاجة تتشيك.
CREATE OR REPLACE FUNCTION "app"."wallet_balance_matches_ledger"()
RETURNS TRIGGER AS $$
DECLARE
  uid    TEXT := COALESCE(NEW."user_id", OLD."user_id");
  cached INTEGER;
  ledger BIGINT;
BEGIN
  SELECT w."balance_cents" INTO cached FROM "app"."wallets" w WHERE w."user_id" = uid;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(SUM(t."amount_cents"), 0) INTO ledger
    FROM "app"."wallet_transactions" t WHERE t."user_id" = uid;
  IF cached <> ledger THEN
    RAISE EXCEPTION 'wallet balance (%) does not match its ledger (%)', cached, ledger
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "wallet_transactions_balance_matches_ledger"
  AFTER INSERT ON "app"."wallet_transactions"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "app"."wallet_balance_matches_ledger"();

CREATE CONSTRAINT TRIGGER "wallets_balance_matches_ledger"
  AFTER INSERT OR UPDATE ON "app"."wallets"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "app"."wallet_balance_matches_ledger"();
