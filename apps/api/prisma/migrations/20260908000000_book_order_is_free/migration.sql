-- ═══════════════════════════════════════════════════════════════════════════
-- «أقدر أضيفه مجاني» — a book order deliberately given away.
--
-- He hands a book to a student without charging: a prize, a hardship case, a
-- replacement for one that arrived damaged. Before this the only way to record
-- that was to type the prices as zero, which produced a row indistinguishable
-- from a data-entry mistake — nothing on any screen said «مجاني», and
-- «إجمالي إيرادات الكتب» counted it among the PAID orders at zero pounds.
--
-- ## A flag, not `amount_cents = 0`
--
-- Exactly the argument `payment_submissions.is_free` already records for
-- subscriptions. A real book always has a price, so `amount_cents = 0` happens
-- to identify a comped order today — which makes the revenue query correct by
-- COINCIDENCE rather than by contract. The day a genuinely free title exists,
-- or a full-discount promotion, that coincidence breaks silently and nothing
-- fails loudly enough to notice.
--
-- ## The money it is NOT excluded from
--
-- ⚠️ Revenue only. The copies still cost him to print, and the parcel still
-- cost him to send — «أنا لما أعمله مجاني يبقى أنا دفعت حق الشحن والتصوير».
-- So `book_order_items.unit_cost_cents` is untouched by this flag and cost of
-- sales keeps counting a free order in full. That is the whole point: a comped
-- book is not neutral, it is a real negative, and «مكسب الكتب» should show it
-- as one.
--
-- This is why the predicate in `book-revenue.ts` had to split in two. One
-- constant fed both revenue and cost of sales; adding `is_free` to it would
-- have removed the cost as well as the income and made a giveaway look free to
-- the business, which is the opposite of what it is.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "app"."book_orders"
  ADD COLUMN "is_free" BOOLEAN NOT NULL DEFAULT false;

-- A comped order collects nothing, by construction rather than by convention.
-- The four money columns still have to agree with each other
-- (`book_orders_amount_is_the_sum`), so a free order is normally recorded with
-- its real prices and a discount that cancels them — the row keeps saying what
-- the book was WORTH while saying that nothing was taken for it.
ALTER TABLE "app"."book_orders"
  ADD CONSTRAINT "book_orders_free_collects_nothing"
  CHECK (NOT "is_free" OR "amount_cents" = 0);
