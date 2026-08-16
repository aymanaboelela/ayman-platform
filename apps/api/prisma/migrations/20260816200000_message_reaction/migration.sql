-- ═══════════════════════════════════════════════════════════════════════════
-- «ردّ بإيموجي» — the instructor reacting to a message the way WhatsApp does.
--
-- ## Why a column and not a reactions table
--
-- A reactions table is the right shape for a GROUP chat, where "who reacted"
-- is a list that grows. This conversation has exactly two participants — one
-- student and the instructor — so a reaction is at most one emoji per side,
-- and a column each states that completely: no join on the thread read, no
-- `(message, actor)` unique index, no separate delete path for "take it back"
-- (it is `SET NULL`).
--
-- Only the instructor's column exists, because only his side was asked for.
-- `visitor_reaction` beside it later is one more nullable column and no
-- migration of any existing row.
--
-- ## Why VARCHAR(16) and not an enum, or TEXT
--
-- The offered set is a UI decision — it lives in `MESSAGE_REACTIONS` in the
-- contract and changes with taste — so a Postgres enum would make «add 🔥 to
-- the picker» a schema migration. TEXT would let a bug write a paragraph into
-- a field the UI draws in a 20px circle.
--
-- 16 bytes rather than 4: one emoji is not one character. A flag is two
-- code points, and a ZWJ sequence like 👨‍👩‍👧 is five plus joiners — this
-- column stores CHARACTERS in Postgres, but the ceiling is set with room for
-- a composed glyph rather than for the shortest possible one. The API
-- validates against the offered list regardless, so the cap is a backstop and
-- not the rule.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "app"."conversation_messages"
  ADD COLUMN "admin_reaction" VARCHAR(16);

-- No index. It is read only as part of a thread that is already being fetched
-- by `conversation_id`, and it is never a search key.

-- No GRANT: `scripts/db-bootstrap.sql` sets ALTER DEFAULT PRIVILEGES FOR ROLE
-- ayman_owner IN SCHEMA app, and this is an existing table besides.
