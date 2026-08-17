-- ═══════════════════════════════════════════════════════════════════════════
-- «يبعت محاضرة» — the instructor attaching a PDF or a picture to a reply.
--
-- ## Why three columns and not a join table
--
-- A message carries at most one file. A join table would buy the ability to
-- carry several, which nobody asked for, and would cost a second read on every
-- thread render plus a delete path — while `AssistantService`'s own spec pins
-- the set of Prisma delegates that service may touch to
-- {conversation, conversationMessage, $transaction}, so a new table would have
-- to be reached from somewhere else anyway. Three nullable columns state «this
-- message has a file» completely.
--
-- ## Why there is no `attachment_mime`
--
-- The stored extension is chosen by US from the DETECTED type — sharp's output
-- for an image, `EXT_FOR_MIME` for a document — never echoed from the upload.
-- So the KEY is the only record of what the bytes are that an uploader could
-- not have forged, and `mimeForStorageKey()` reads it straight back off. A
-- mime column would be a second copy of that fact with nothing keeping the two
-- honest, and the first time they disagreed the wrong one would be the one
-- being served.
--
-- ## Why the body CHECK has to change, not merely gain a sibling
--
-- The original is `char_length(body) BETWEEN 1 AND 2000`, which makes a
-- caption-less attachment impossible to insert. A reply that is only a file is
-- an ordinary thing to send — «اتفضل المحاضرة» is a courtesy, not a
-- requirement — and forcing a caption is exactly the friction that ends with
-- the file going out over WhatsApp instead. The ceiling is unchanged; only the
-- floor moves, and it moves onto the ROW rather than off the table: a message
-- must still be either words or a file.
--
-- No FK to `media_assets`: these keys have no row there (same as documents),
-- and nothing in this schema references that table by key anyway.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "app"."conversation_messages"
  ADD COLUMN "attachment_key"   TEXT,
  -- Display only, and the same 200 the API truncates to. It is never used to
  -- build a path — the extension in `attachment_key` decides that.
  ADD COLUMN "attachment_name"  VARCHAR(200),
  -- INTEGER, not BIGINT: the ceiling is MAX_DOCUMENT_BYTES (95 MiB), which is
  -- three orders of magnitude below the 2 GiB an INTEGER holds.
  ADD COLUMN "attachment_bytes" INTEGER;

-- Words or a file — see the header. Dropped and re-added rather than added
-- beside, because two CHECKs are AND-ed and the old one alone would still
-- refuse every caption-less attachment.
ALTER TABLE "app"."conversation_messages"
  DROP CONSTRAINT "conversation_messages_body_length";

ALTER TABLE "app"."conversation_messages"
  ADD CONSTRAINT "conversation_messages_body_length"
  CHECK (
    char_length("body") <= 2000
    AND (char_length("body") >= 1 OR "attachment_key" IS NOT NULL)
  );

-- All three, or none of them. Without this a half-written row renders as a
-- file card with no name and no size — a bubble that cannot be read and cannot
-- be downloaded — and the only way to notice would be a student saying the
-- attachment does not work.
ALTER TABLE "app"."conversation_messages"
  ADD CONSTRAINT "conversation_messages_attachment_complete"
  CHECK (
    ("attachment_key" IS NULL) = ("attachment_name" IS NULL)
    AND ("attachment_key" IS NULL) = ("attachment_bytes" IS NULL)
  );

-- No index. The column is read only as part of a thread already being fetched
-- by `conversation_id`, and it is never a search key — the same reasoning the
-- `admin_reaction` migration recorded.

-- No GRANT: `scripts/db-bootstrap.sql` sets ALTER DEFAULT PRIVILEGES FOR ROLE
-- ayman_owner IN SCHEMA app, and this is an existing table besides.
