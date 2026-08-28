-- «المدينة» — shipping companies need a city in addition to the governorate.
-- No city/مدينة taxonomy exists for Egypt in this codebase, so this is a
-- plain required text column, same shape as `address_street`/`address_building`.
-- Safe as a hard NOT NULL: `book_orders` is brand new (PR #246) and empty in
-- every environment this migration will run against.

ALTER TABLE "app"."book_orders"
  ADD COLUMN "city" TEXT NOT NULL;
