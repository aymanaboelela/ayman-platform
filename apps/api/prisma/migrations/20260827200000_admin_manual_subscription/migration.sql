-- Admin-recorded subscriptions — Ayman confirming a payment that already
-- happened OUTSIDE the normal Vodafone Cash review flow (a transfer he
-- already received over WhatsApp), or comping a term for free. See
-- `PaymentsService.adminManualSubscribe` and the model note on
-- `PaymentSubmission.isFree` in schema.prisma.
--
-- `sender_phone` and `screenshot_key` become OPTIONAL: neither has a
-- meaningful value when an admin creates the row directly rather than a
-- student going through the Vodafone Cash flow — there is no transfer number
-- to reconcile, and a screenshot is evidence he MAY attach, not proof the
-- platform requires (unlike the student-facing flow, where it stays
-- required at the contract layer).
ALTER TABLE "app"."payment_submissions"
  ALTER COLUMN "sender_phone" DROP NOT NULL,
  ALTER COLUMN "screenshot_key" DROP NOT NULL;

-- Never counted in `/admin/finance`'s revenue total — see `finance-status.ts`
-- (`countsAsRevenue`) and `FinanceService.list`'s revenue aggregate, which
-- both key off this rather than `amount_cents = 0`. See the model note on
-- `PaymentSubmission.isFree` for why.
ALTER TABLE "app"."payment_submissions"
  ADD COLUMN "is_free" BOOLEAN NOT NULL DEFAULT false;
