-- Four expense categories, read off what Ayman actually typed in «الوصف».
--
-- The ledger had «شركه شحن» filed under أجور, «صدقه» / «أوبر» / «جوايز»
-- under حاجات تانية — the closed set had no honest home for them, so the
-- breakdown «المصروفات راحت فين» could not answer the question it exists for.
--
-- ADD VALUE is append-only and cannot be used in the same transaction that
-- adds it, which is why this migration adds the values and does nothing else.
-- Re-filing the existing rows is a data edit done from the screen.
ALTER TYPE "app"."expense_category" ADD VALUE IF NOT EXISTS 'shipping';
ALTER TYPE "app"."expense_category" ADD VALUE IF NOT EXISTS 'transport';
ALTER TYPE "app"."expense_category" ADD VALUE IF NOT EXISTS 'prizes';
ALTER TYPE "app"."expense_category" ADD VALUE IF NOT EXISTS 'charity';
