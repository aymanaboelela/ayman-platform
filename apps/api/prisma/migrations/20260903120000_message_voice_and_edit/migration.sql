-- ═══════════════════════════════════════════════════════════════════════════
-- الرسايل الصوتية، والتعديل — «شبه واتساب بالظبط، بس أنا كأدمن».
--
-- ## `attachment_duration_seconds`
--
-- A voice note is an ordinary attachment: it goes in `attachment_key` under the
-- same `msg/` prefix, comes back through the same two access-checked routes,
-- and needs no fourth column to say what it is — the stored extension does
-- that, exactly as it does for a PDF (see `attachment_key`'s own note).
--
-- What it DOES need is a length, and that cannot be read back off the bytes at
-- render time. `MediaRecorder` produces a WebM/Matroska stream with no duration
-- in its header — the browser is writing it live and does not know the total —
-- so `HTMLAudioElement.duration` on one of these is `Infinity` until the whole
-- file has been seeked through. A player that cannot draw a progress bar until
-- you have already listened to the clip is not a player.
--
-- The RECORDER knows, because it counted. It is the admin's own browser, this
-- is display-only, and a wrong number costs a slightly wrong progress bar — so
-- the number is taken from it rather than reconstructed on the server with
-- ffprobe, which this image does not carry.
--
-- INTEGER seconds and CHECKed against a ten-minute ceiling: a voice note is a
-- reply, and a value of 40,000 would stretch the bubble across the thread.
--
-- ## `edited_at`
--
-- «لو كتبت مسج أعدل عليها.» NULL means never edited, which is every existing
-- row. The bubble renders «معدّلة» from it — silently rewriting what somebody
-- was already shown is the one thing an edit must not do.
--
-- No `body_history` table. WhatsApp does not keep one either, the audit log
-- already records who edited what and when, and a second copy of every message
-- would double the most-written table on the platform for a feature nobody
-- asked for.
--
-- ## Why there is no `deleted_at`
--
-- Deleting is a real DELETE. A tombstone («تم حذف هذه الرسالة») is what a group
-- chat needs, because the other side has to be told the thread changed shape.
-- This conversation has two participants and only the instructor can delete,
-- and «أنا أقدر أمسحها» is a correction, not an announcement — leaving a marker
-- would broadcast the mistake it was meant to remove.
--
-- The attachment's BYTES are deliberately left on disk when a message with one
-- is deleted. They become unreachable the moment the row goes: both serve
-- routes resolve a key THROUGH its message and re-check the asker against the
-- thread, so an orphan is inert. Deleting the blob in the same breath would put
-- a storage call inside a transaction that must not be able to fail halfway.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "app"."conversation_messages"
  ADD COLUMN "attachment_duration_seconds" INTEGER,
  ADD COLUMN "edited_at" TIMESTAMPTZ;

ALTER TABLE "app"."conversation_messages"
  ADD CONSTRAINT "conversation_messages_duration_sane"
  CHECK (
    "attachment_duration_seconds" IS NULL
    OR ("attachment_duration_seconds" > 0 AND "attachment_duration_seconds" <= 600)
  );

-- A duration with no file is a number about nothing.
ALTER TABLE "app"."conversation_messages"
  ADD CONSTRAINT "conversation_messages_duration_needs_attachment"
  CHECK ("attachment_duration_seconds" IS NULL OR "attachment_key" IS NOT NULL);
