-- ═══════════════════════════════════════════════════════════════════════════
-- «مين ضغط على لينك الواتساب» — so the invitation can stop.
--
-- «رسايل م. أيمن» invites students to the WhatsApp channel every few weeks,
-- and until now it had no way to tell the ones who had already gone from the
-- ones who never will. Everyone got asked again on the same schedule, forever
-- — including the student who subscribed the first time, who is then being
-- nagged by a teacher who is not paying attention.
--
-- One nullable timestamp answers it. Set the first time a student follows a
-- WhatsApp link from the platform — the dashboard channel card, or the link
-- inside a message — and read by exactly one query: the sweeper's candidate
-- list, which skips anyone who has one.
--
-- ## Why on `student_profiles` and not a table of its own
--
-- Because it is one fact per student with no history worth keeping. An events
-- table would let us count taps, and nothing wants to count taps: the question
-- is "has this person been sent there", which is a single bit with a date on
-- it. `phone_verified_at` and `onboarding_completed_at` are the same shape on
-- the same row and are read the same way.
--
-- ## Why it records the PRESS and not the JOIN
--
-- WhatsApp tells us nothing about who subscribed. The press is the strongest
-- signal that exists, and it is also the honest thing to gate on: what the
-- platform can stop doing is sending someone somewhere it has already sent
-- them. A student who tapped and changed their mind is not owed a reminder.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "app"."student_profiles"
  ADD COLUMN "whatsapp_opened_at" TIMESTAMP(3);

-- No index, deliberately. The one read is the invite sweep, which already
-- scans a bounded page of enrolled students and filters this in the same
-- WHERE; a partial index on a mostly-NULL column that is consulted once an
-- hour would cost every profile write and save nothing measurable.

-- No GRANT: `scripts/db-bootstrap.sql` sets ALTER DEFAULT PRIVILEGES FOR ROLE
-- ayman_owner IN SCHEMA app, and this is an existing table besides.
