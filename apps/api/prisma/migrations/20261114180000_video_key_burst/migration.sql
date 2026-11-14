-- ADMIN alert: one account took the keys of many distinct lectures in a day.
-- See VideoKeyWatchService. ADD VALUE cannot run inside a transaction block
-- that also uses the value; nothing here does.
ALTER TYPE "app"."notification_kind" ADD VALUE IF NOT EXISTS 'video_key_burst';
