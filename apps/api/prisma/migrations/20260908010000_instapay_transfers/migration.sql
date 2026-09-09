-- ═══════════════════════════════════════════════════════════════════════════
-- «التحويلات الواردة» — approving InstaPay payments without a payment gateway.
--
-- Approving a subscription means opening a phone, finding a transfer, and
-- deciding it is the one the student on screen is talking about. Nothing the
-- platform holds can make that decision:
--
--   * The bank's SMS — «تم اضافة مبلغ 250EGP الى حساب رقم xxx1734 فى
--     07-SEP-2026» — names no sender and carries no clock time. Two students
--     who each sent 250 that day are one row.
--   * The InstaPay push — «لقد استلمت 250.00 جنيه من moazkoritam@instapay» —
--     names a sender, but an InstaPay address is not an email, not a phone,
--     and for a bank-account sender is an IBAN the student has never typed
--     (`eg6300010002200000@instapay`). There is no column it equals.
--   * The student's own screenshot is an image the student supplied. It is
--     evidence of nothing.
--
-- So the platform LEARNS the address. `student_payment_addresses` is the join
-- that turns `moazkoritam@instapay` into a student, and it is filled by the
-- work an admin was doing anyway: the first payment from an unknown address is
-- reviewed by hand exactly as every payment used to be, and approving it
-- records the address. Every later payment from it approves itself — a course
-- subscription or a book order, since «الكتب» are bought over the same
-- InstaPay account and identified the same way.
--
-- The consequence worth stating plainly: this does not remove the manual queue
-- on day one, it DRAINS it. A new cohort's first month looks like today; by
-- the second most transfers never reach a human.
--
-- ── Why the receiver is an Android handset ────────────────────────────────
--
-- The InstaPay push is the only feed that names a sender, and iOS hands app
-- notifications to no automation — not a missing setting, a platform rule. So
-- on an iPhone that push can only be captured as a screenshot somebody takes.
-- Android lets an app read another app's notifications, which turns the same
-- push into an unattended webhook: a cheap handset on wifi with InstaPay
-- installed, never carried, never opened.
--
-- The bank SMS is still accepted (`incoming_transfer_source.sms`) because it
-- costs nothing to parse and corroborates amounts, but it can never identify
-- anyone by itself.
--
-- ── The double-grant guard is a UNIQUE index, not a code path ─────────────
--
-- `incoming_transfers.matched_submission_id` is UNIQUE. Ingesting the same
-- notification twice — a retried webhook, a re-pasted capture — cannot open
-- the same course twice, and it is the database that says so rather than a
-- check somebody could reorder.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "app"."incoming_transfer_source" AS ENUM ('notification', 'sms', 'manual');

CREATE TABLE "app"."student_payment_addresses" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    -- Lower-cased, exactly as `incoming_transfers.sender_handle` is: the join
    -- between the two is a string equality, and a stray capital would send a
    -- known payer silently back to the manual queue.
    "handle" TEXT NOT NULL,
    "learned_from_transfer_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_payment_addresses_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "app"."student_payment_addresses"
  ADD CONSTRAINT "student_payment_addresses_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- One student per address, several addresses per student — a student may pay
-- from their own account one month and a parent's the next, and both are
-- theirs. The reverse cannot be allowed: an address resolving to two students
-- is an address that can open the wrong course.
CREATE UNIQUE INDEX "student_payment_addresses_handle_key"
  ON "app"."student_payment_addresses"("handle");

CREATE INDEX "student_payment_addresses_user_id_idx"
  ON "app"."student_payment_addresses"("user_id");

CREATE TABLE "app"."incoming_transfers" (
    "id" UUID NOT NULL,
    "source" "app"."incoming_transfer_source" NOT NULL,
    -- Piastres, exactly as stated — 25000 for «250.00 جنيه».  NULL only on a
    -- line the parser could not read, which is kept rather than dropped: a
    -- transfer nobody was told about is the one outcome worth engineering
    -- against.
    "amount_cents" INTEGER,
    -- The identifier. NULL for an `sms` row, which names no sender at all.
    "sender_handle" TEXT,
    -- The line the parser read, verbatim. The evidence behind an automatic
    -- approval, and the only way to tell a parser bug from an odd transfer.
    "raw_line" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    -- What this money paid for. At most ONE of the two — see the CHECK below.
    "matched_submission_id" UUID,
    "matched_book_order_id" UUID,
    -- An admin saying "seen, no action needed" — a personal transfer, money
    -- coming back, a duplicate the parser kept. Not the same as matched:
    -- nothing was granted.
    "dismissed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incoming_transfers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "app"."incoming_transfers"
  ADD CONSTRAINT "incoming_transfers_amount_positive"
  CHECK ("amount_cents" IS NULL OR "amount_cents" > 0);

-- `SET NULL` on both targets: a submission and an order are money history and
-- are never deleted, but if one ever were, the transfer must survive it — this
-- row is the record that money arrived, independent of what it paid for.
ALTER TABLE "app"."incoming_transfers"
  ADD CONSTRAINT "incoming_transfers_matched_submission_id_fkey"
  FOREIGN KEY ("matched_submission_id") REFERENCES "app"."payment_submissions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."student_payment_addresses"
  ADD CONSTRAINT "student_payment_addresses_learned_from_transfer_id_fkey"
  FOREIGN KEY ("learned_from_transfer_id") REFERENCES "app"."incoming_transfers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."incoming_transfers"
  ADD CONSTRAINT "incoming_transfers_matched_book_order_id_fkey"
  FOREIGN KEY ("matched_book_order_id") REFERENCES "app"."book_orders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- One transfer pays for one thing. A row naming both a subscription and a
-- book order would be money counted twice on `/admin/finance`, which reads the
-- two as separate revenue streams.
ALTER TABLE "app"."incoming_transfers"
  ADD CONSTRAINT "incoming_transfers_one_target" CHECK (
    "matched_submission_id" IS NULL OR "matched_book_order_id" IS NULL
  );

-- The double-grant guard — see the header. One on each target, because the
-- two are settled by different services and neither may be paid twice.
CREATE UNIQUE INDEX "incoming_transfers_matched_submission_id_key"
  ON "app"."incoming_transfers"("matched_submission_id");
CREATE UNIQUE INDEX "incoming_transfers_matched_book_order_id_key"
  ON "app"."incoming_transfers"("matched_book_order_id");

-- The unmatched queue: what arrived that nothing explains, newest first.
CREATE INDEX "incoming_transfers_unmatched_idx"
  ON "app"."incoming_transfers"("matched_submission_id", "dismissed_at", "received_at");

-- The lookup every ingest runs — "have we already got this money" — and the
-- address join behind every automatic approval.
CREATE INDEX "incoming_transfers_amount_cents_sender_handle_idx"
  ON "app"."incoming_transfers"("amount_cents", "sender_handle");

-- No GRANT: `scripts/db-bootstrap.sql` sets ALTER DEFAULT PRIVILEGES FOR ROLE
-- ayman_owner on this schema, so `ayman_runtime` already holds these tables.
