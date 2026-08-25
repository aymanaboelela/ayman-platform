-- `payment_submissions.amount_cents` stops being student input and becomes a
-- derived value (the chosen plan's price at submission time); this migration
-- only adds the column that replaces the one the student actually supplies —
-- the Vodafone Cash number the transfer was sent FROM. See the model note on
-- `PaymentSubmission.senderPhone` in schema.prisma.
--
-- NOT NULL with no backfill step: `payment_submissions` shipped with a
-- storage-key bug that made every screenshot upload fail (see
-- 20260826_payment_proof_storage_key), so no submission has ever been
-- created in production. The table is guaranteed empty.
ALTER TABLE "app"."payment_submissions"
  ADD COLUMN "sender_phone" TEXT NOT NULL;
