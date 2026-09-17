-- ═══════════════════════════════════════════════════════════════════════════
-- الكتاب: عام ولا لغات، وهيظهر فين. والطلب: وصل، اترفض، أو اتشال.
--
-- Runs after `20260904120000_book_order_lifecycle_enums` because the CHECKs
-- below NAME the labels that migration added, and Postgres will not let a
-- transaction use a value it created — see that file's header.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ## `books.for_general` / `books.for_languages`
--
-- «بشوف في الكتب الناس اللي طالبة ما بيبقاش مكتوب ده عام ولا لغات.»
--
-- The shipping spreadsheet has carried a «عام / لغات» column since it was
-- written, and it has been BLANK on nearly every row — it reads
-- `order.course.forGeneral/forLanguages`, and `book_orders.course_id` became
-- nullable in `20260902120000_book_catalog` when the shop learned to sell a
-- basket. A cart order has no course, so the column had nothing to say, on
-- exactly the orders that now make up most of the list.
--
-- The fix is to put the stream where the fact actually belongs. A book is for
-- عام, for لغات, or for both — that is a property of the PRINTED OBJECT, not
-- of the course somebody happened to reach it through, and «كتاب أولى بكالوريا
-- لغات» is a different physical book from its عام twin. Storing it on `books`
-- is what lets a shop order say لغات at all, and it is what lets a standalone
-- title (no `course_id`) say it too.
--
-- Same pair of booleans and the same CHECK as `courses`, deliberately: one
-- `StreamBadge` renders both, `streamChoiceOf()` reads both, and a book that
-- copied its course's shape cannot drift from it. NOT a third enum.
--
-- Backfilled FROM the linked course where there is one, because that is the
-- answer the admin already gave once and should not be asked for twice. Books
-- with no course default to both, which is what the catalogue showed before
-- this column existed — a book everybody could see stays visible to everybody.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ## `books.show_on_landing` / `books.show_on_course`
--
-- «فيه option الكتاب أضيفه في الـlanding page ولا هنا ولا الاتنين.»
--
-- Two independent booleans, not a three-way enum, because "neither" is a real
-- and useful fourth answer: a title that is on sale at `/books` but is not
-- worth a slot on the front door or a button on a course page. An enum of
-- three would make that state unrepresentable and the admin would reach for
-- `is_active` instead — which unpublishes the book from the shop as well, i.e.
-- answers a placement question by removing the product.
--
-- These are PLACEMENT, never permission. `is_active` remains the only switch
-- that decides whether a book can be bought at all; both flags are read as
-- `is_active AND show_on_*`, so unpublishing still removes every surface.
--
-- Defaults preserve today's behaviour exactly: `<BooksStrip>` currently takes
-- the first three books of the whole catalogue, so every existing book was on
-- the landing → `show_on_landing` defaults true. The course CTA only ever
-- appeared where a course exists → `show_on_course` is backfilled from
-- `course_id IS NOT NULL`.
--
-- No CHECK tying `show_on_course` to `course_id`. The admin PATCH is partial;
-- a constraint spanning two columns that arrive in different requests turns
-- «شيلت الكتاب من الكورس» into a 500 with a constraint name in it. The service
-- clears the flag when the link goes — an effect, which a test can assert,
-- rather than a guard that only fires as a crash.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ## `book_orders`: delivered / rejected / deleted
--
-- Three different things that all end an order, kept apart on purpose:
--
--   · `delivered_at` — it ARRIVED. Set by the admin, fires the student's
--     «الكتاب وصلك» notification. Paired with `delivered_by_user_id` for the
--     same reason `shipped_by_user_id` exists: «مين قال إنه وصل» is the first
--     question when it turns out it did not.
--   · `rejected_at` + `rejection_reason` — the admin turned the order DOWN and
--     the student is owed the reason. The row stays in the list and stays
--     visible to the student. The reason is NOT NULL whenever the timestamp is,
--     because a rejection nobody explained is a support call.
--   · `deleted_at` + `deletion_reason` — the admin wants the row GONE from the
--     working list. It is not a status: an order can be deleted from any state,
--     and folding it into `status` would lose the state it was deleted FROM.
--
-- Deleting is soft, decided explicitly: «واحد دفع فلوس» — the row is money that
-- was received, it is counted in «إيرادات الكتب», and a DELETE would silently
-- restate a month's revenue with nothing left to explain the difference. It
-- also could not be undone by a person who clicked the wrong row. Every read
-- path filters `deleted_at IS NULL`; the admin sees them again under one
-- filter, and can put one back.
--
-- The partial index is the one the list actually runs: every screen except the
-- «المحذوفة» tab is `WHERE deleted_at IS NULL` plus a status and a date sort.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── books: which school the printed book is for ──────────────────────────
ALTER TABLE "app"."books"
  ADD COLUMN "for_general"   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "for_languages" BOOLEAN NOT NULL DEFAULT true;

UPDATE "app"."books" b
   SET "for_general"   = c."for_general",
       "for_languages" = c."for_languages"
  FROM "app"."courses" c
 WHERE b."course_id" = c."id";

ALTER TABLE "app"."books"
  ADD CONSTRAINT "books_serves_a_stream"
  CHECK ("for_general" OR "for_languages");

-- ── books: where the book is advertised ──────────────────────────────────
ALTER TABLE "app"."books"
  ADD COLUMN "show_on_landing" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "show_on_course"  BOOLEAN NOT NULL DEFAULT true;

UPDATE "app"."books" SET "show_on_course" = ("course_id" IS NOT NULL);

-- ── book_orders: it arrived ──────────────────────────────────────────────
ALTER TABLE "app"."book_orders"
  ADD COLUMN "delivered_at"          TIMESTAMP(3),
  ADD COLUMN "delivered_by_user_id"  TEXT,
  ADD CONSTRAINT "book_orders_delivered_by_user_id_fkey"
    FOREIGN KEY ("delivered_by_user_id") REFERENCES "app"."users"("id")
    ON UPDATE CASCADE ON DELETE SET NULL;

-- ── book_orders: it was turned down ──────────────────────────────────────
ALTER TABLE "app"."book_orders"
  ADD COLUMN "rejected_at"         TIMESTAMP(3),
  ADD COLUMN "rejected_by_user_id" TEXT,
  ADD COLUMN "rejection_reason"    TEXT,
  ADD CONSTRAINT "book_orders_rejected_by_user_id_fkey"
    FOREIGN KEY ("rejected_by_user_id") REFERENCES "app"."users"("id")
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "app"."book_orders"
  ADD CONSTRAINT "book_orders_rejection_has_a_reason"
  CHECK ("rejected_at" IS NULL OR "rejection_reason" IS NOT NULL);

-- A rejected order and a `rejected_at` are the same fact written twice; they
-- must not be able to disagree, or the list filters one way and the student's
-- own screen reads the other.
ALTER TABLE "app"."book_orders"
  ADD CONSTRAINT "book_orders_rejected_status_matches"
  CHECK (("status" = 'rejected') = ("rejected_at" IS NOT NULL));

-- ── book_orders: hidden from the working list ────────────────────────────
ALTER TABLE "app"."book_orders"
  ADD COLUMN "deleted_at"         TIMESTAMP(3),
  ADD COLUMN "deleted_by_user_id" TEXT,
  ADD COLUMN "deletion_reason"    TEXT,
  ADD CONSTRAINT "book_orders_deleted_by_user_id_fkey"
    FOREIGN KEY ("deleted_by_user_id") REFERENCES "app"."users"("id")
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "app"."book_orders"
  ADD CONSTRAINT "book_orders_deletion_has_a_reason"
  CHECK ("deleted_at" IS NULL OR "deletion_reason" IS NOT NULL);

CREATE INDEX "book_orders_live_status_created_at_idx"
  ON "app"."book_orders" ("status", "created_at")
  WHERE "deleted_at" IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- ## اللي طلبوا قبل ما يسجّلوا — ليه مفيش backfill هنا
--
-- «فيه ناس اشترت فعلاً، شوف هل دول متسجلين — لو متسجلين يبقى الكتاب موجود
-- عنده إنه خلاص اشتراه.»
--
-- The obvious implementation is one UPDATE:
--
--     UPDATE app.book_orders o SET user_id = u.id FROM app.users u
--      WHERE o.user_id IS NULL AND u.phone_number = o.phone;
--
-- It was written, and then deleted, because it BREAKS the guest it is trying
-- to help. `BookOrdersService.getById` treats the order id as the bearer
-- token: an anonymous browser may read an order whose `user_id` is NULL, which
-- is how the confirmation panel resumes from `localStorage` without a session.
-- Filling in `user_id` turns that read into a 404 — so a student who ordered
-- signed-out, and is registered, would lose the confirmation screen they were
-- looking at, and get it back only by signing in and finding it somewhere else.
-- Fixing history is not worth taking something away from somebody mid-order.
--
-- So the link is made at READ time instead, and the column is never written:
--
--   · `listMine` matches `user_id = :me OR (user_id IS NULL AND phone = :my
--     phone)`, so the order shows up on «كتبي» without the row changing.
--   · the shipped/delivered/rejected notifications resolve their recipient the
--     same way, so a guest order still reaches its owner's bell.
--   · the admin's «طلب قبل كده» counts on `phone` for the same reason — guest
--     checkout means one person is several unlinked rows and the number is the
--     only thing all of them share.
--
-- The match is exact, not fuzzy: `users.phone_number` is UNIQUE and stored in
-- E.164 (`+201012345678`), and `book_orders.phone` goes through
-- `egyptianPhone()`, which normalises to the same form before it is written.
-- One number matches at most one account, and a number written any other way
-- never reached the column.
--
-- Only `phone`, never `alt_phone`: the second number is routinely a parent's,
-- and matching on it would hand one family's order to a sibling's account.
-- ═══════════════════════════════════════════════════════════════════════════
