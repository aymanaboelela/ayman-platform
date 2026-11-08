-- «حجز السناتر» — the door and the account.
--
--   · user_id: the platform account that claimed the reservation (signed up
--     and opened the page in the same browser). SET NULL if the account goes.
--   · checked_in_at: the first attendance — the session counts as fully paid
--     from then on.
--
-- Additive: two nullable columns and an index.
ALTER TABLE "app"."center_reservations"
  ADD COLUMN "user_id" TEXT,
  ADD COLUMN "checked_in_at" TIMESTAMP(3);
CREATE INDEX "center_reservations_user_id_idx" ON "app"."center_reservations"("user_id");
ALTER TABLE "app"."center_reservations" ADD CONSTRAINT "center_reservations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
