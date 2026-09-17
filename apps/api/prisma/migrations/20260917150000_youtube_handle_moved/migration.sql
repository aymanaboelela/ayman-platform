-- قناة اليوتيوب اتنقلت — `@2ayman6` بقى 404.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY A MIGRATION AND NOT JUST THE CONSTANT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `OFFICIAL_PROFILES.youtube` in `@ayman/contracts` is only the BACKSTOP. The
-- footer, `/links` and the JSON-LD `sameAs` all read
-- `site_settings.contact.youtube` first and fall back to the constant only when
-- the stored value is empty — and production's is not empty, it is the OLD URL,
-- seeded there the day the row was first written:
--
--   GET https://aymanaboelela.com/api/settings/public
--   → "youtube":"https://www.youtube.com/@2ayman6"
--
-- The seed is deliberately fill-if-empty (an admin's typed value must win over
-- a file), so it will never correct a stored value that is simply wrong. Ship
-- the constant alone and every live surface keeps pointing at the dead channel.
--
-- This also matters more than a dead icon: `sameAs` asserts to a crawler that
-- this site and that URL are ONE entity, and asserting it about a page that
-- returns 404 is the claim being WRONG rather than missing.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY IT IS GUARDED ON THE OLD VALUE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `WHERE … = <the old URL>` and not a blanket write, for the same reason
-- `20260902220000_programming_y2_books` guards on `title_ar = book_title`: this
-- file ships days after it was written, and an admin who fixes the link from
-- `/admin/settings` in the meantime must WIN. A row holding anything else — the
-- new URL already, a third URL, or NULL — is left exactly as it is.
--
-- That also makes it idempotent and safe on every other tenant's database: a
-- stack whose `contact.youtube` is its own channel matches nothing and is not
-- touched. Ayman's accounts must never be written onto somebody else's site.
--
-- `create_missing => false`: if `contact` has no `youtube` key at all there is
-- nothing to correct, and inventing one here would put Ayman's channel on a
-- deployment that never asked for it. The WHERE clause already excludes that
-- case; this states it where it cannot be lost in a later edit.

UPDATE "app"."site_settings"
SET "data" = jsonb_set(
      "data",
      '{contact,youtube}',
      '"https://www.youtube.com/@aymanaboelela1"'::jsonb,
      false
    ),
    "updated_at" = now()
WHERE "data" #>> '{contact,youtube}' = 'https://www.youtube.com/@2ayman6';
