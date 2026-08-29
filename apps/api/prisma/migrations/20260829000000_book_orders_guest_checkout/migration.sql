-- Guest checkout for الكتاب الورقي — ordering the physical textbook no
-- longer requires a signed-in account. Per Ayman: buying a book is "a
-- different service" from the platform's login-gated course content, and the
-- course landing page is already public. `user_id` becomes nullable; a guest
-- order carries no account at all, only the name/phone/address the form
-- itself collected, which stay the source of truth for shipping regardless
-- of whether an account exists. The FK (`ON DELETE CASCADE`) is untouched —
-- it simply never fires for a NULL `user_id`.
ALTER TABLE "app"."book_orders"
  ALTER COLUMN "user_id" DROP NOT NULL;
