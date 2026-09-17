-- Put «لوحة الشرف» on the live landing page.
--
-- ⚠️ THIS MIGRATION IS THE ONLY REASON THE SECTION APPEARS AT ALL, and adding
-- the block to `DEFAULT_HOME_BLOCKS` is not a substitute for it.
--
-- `apps/web/lib/home-blocks.ts` falls back to `DEFAULT_HOME_BLOCKS` when the
-- API is unreachable OR when `home_blocks` comes back EMPTY. Production's table
-- is not empty — it was seeded long ago and the admin has been editing it since
-- — so the fallback never runs there. A section added only to the defaults
-- would render on a fresh install, render in the fallback, and be invisible on
-- the one site anybody looks at. The row below is what puts it on the page.
--
-- It is still ALSO in `DEFAULT_HOME_BLOCKS`, and that is not redundancy: those
-- two lists answer different questions. This row is the live page; the default
-- is the page a cold cache or a restarting API serves in its place, and the
-- owner's deliverable of the week must survive both.
--
-- WHERE IT SITS
--
-- Immediately BEFORE the FAQ, i.e. as the page's last content section. The FAQ
-- is the closing band on every composition of this page, so "just above the
-- questions" is a rule that holds without hard-coding a number: the block is
-- given the FAQ's position and everything from there down is pushed one step
-- along. With no FAQ block the COALESCE appends instead, which is the only
-- other sensible answer. An admin can drag it anywhere from /admin/home.
--
-- The shift is needed rather than optional: `HomeBlocksService.list*` orders by
-- `position ASC, id ASC`, so two rows sharing a position are separated by their
-- ids — and `gen_random_uuid()` is v4, i.e. random. Sharing the FAQ's slot
-- would put the honour board above or below the questions depending on which
-- uuid the database happened to draw.
--
-- ⚠️ `updated_at` IS `TIMESTAMP(3) NOT NULL` WITH NO DEFAULT. `created_at`
-- defaults to CURRENT_TIMESTAMP and `updated_at` does not — Prisma maintains it
-- from the client side via `@updatedAt`, which no SQL migration goes through.
-- Both are supplied explicitly below; omitting `updated_at` is a NOT NULL
-- violation, not a silently-null column.
--
-- RE-RUNNABLE. Both statements are guarded on the absence of the `honor-board`
-- key, so applying this twice neither shifts the page twice nor trips the
-- unique index on `key`. An archived honour board also counts as present: an
-- admin who took the section down should not have it reinstated by a redeploy.

UPDATE app.home_blocks
   SET position = position + 1,
       updated_at = CURRENT_TIMESTAMP
 WHERE archived_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM app.home_blocks AS existing WHERE existing.key = 'honor-board')
   -- NULL when the page has no FAQ block, which makes the comparison NULL and
   -- shifts nothing — the INSERT below then appends instead of splicing.
   AND position >= (
     SELECT MIN(faq.position)
       FROM app.home_blocks AS faq
      WHERE faq.type = 'faq'
        AND faq.archived_at IS NULL
   );

INSERT INTO app.home_blocks ("id", "key", "type", "props", "position", "is_published", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  'honor-board',
  'honorBoard'::app.home_block_type,
  -- The whole of a placement-only block's props: a discriminant and nothing
  -- else. `HomeBlocksService.toDto` re-parses this against
  -- `HomeBlockPropsSchema` on every read, so it has to be exactly the shape
  -- `HonorBoardPropsSchema` accepts.
  '{"type": "honorBoard"}'::jsonb,
  -- The FAQ has already moved one step along, so its old slot is free.
  COALESCE(
    (
      SELECT MIN(faq.position) - 1
        FROM app.home_blocks AS faq
       WHERE faq.type = 'faq'
         AND faq.archived_at IS NULL
    ),
    (
      SELECT COALESCE(MAX(block.position), -1) + 1
        FROM app.home_blocks AS block
       WHERE block.archived_at IS NULL
    )
  ),
  -- Published. The owner asked for the section to be VISIBLE this week; a
  -- draft row would ship the migration and none of the point of it.
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
 WHERE NOT EXISTS (SELECT 1 FROM app.home_blocks WHERE "key" = 'honor-board')
   -- ⚠️ AND THE PAGE ALREADY HAS BLOCKS. This clause is the whole reason this
   -- migration was reverted once (PR #338, 2026-09-09) — without it, the file
   -- DELETES THE LANDING PAGE on every fresh database.
   --
   -- `apps/web/lib/home-blocks.ts` ends its read with
   --     return blocks.length > 0 ? blocks : FALLBACK;
   -- so `DEFAULT_HOME_BLOCKS` is served ONLY while this table is completely
   -- empty. One row is enough to switch the fallback off for good.
   --
   -- On production the table is seeded, so the UPDATE above splices this block
   -- in above the FAQ and everything else stays. On CI's fresh e2e database the
   -- UPDATE matched nothing, this INSERT added ONE row, and the landing page
   -- became that row and nothing else: no hero, no h1, no WebGL scene. What CI
   -- reported was five `hero-headline-fit` timeouts, a 404 page with no way
   -- home, and «a lost context turns the landing page white» — none of which
   -- names the home blocks, and all of which passes under `next dev`.
   --
   -- With this clause an empty table is left empty, and the fallback (which
   -- carries the honor-board entry too) renders the full page including this
   -- section. Both paths now agree.
   AND EXISTS (SELECT 1 FROM app.home_blocks WHERE archived_at IS NULL);
