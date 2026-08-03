# Student profile and activity — design

**Date:** 2026-08-03
**Status:** slice 3 of 4
**Builds on:** slices 1 (`student-shell-dashboard`) and 2 (`student-quiz-insights`)
**Scope:** the student's own profile — who they are, a photo they can change,
what they have earned, which devices their account is open on, and a timeline
of what they actually did and when.

## Why

Three separate gaps, one destination:

- **There is no profile page at all.** A student cannot see their own name,
  phone, school, or totals anywhere.
- **`User.image` exists and no student can ever set it.** The upload pipeline
  (`MediaService.upload` — extension allowlist, magic-byte sniff, sharp
  re-encode, UUID key) is complete and gated on `media:write`, which is an
  admin permission. A Google sign-up gets a photo; everyone else never can.
- **`LessonProgress` stores totals, not history.** `watchedSeconds`,
  `openCount`, `firstOpenedAt`, `completedAt` answer "how much in total" and
  cannot answer "when did they watch, and for how long that time". This is the
  one thing in the whole four-slice plan that genuinely needs a new table.

Devices are the exception: `SessionDevice` already records device name,
browser + OS, IP, first login and last-seen, and `/settings/devices` already
renders and revokes them. That screen is reused, not rebuilt.

## The new table

```prisma
model LessonViewSession {
  id             String   @id @default(uuid(7)) @db.Uuid
  enrollmentId   String   @map("enrollment_id") @db.Uuid
  lessonId       String   @map("lesson_id") @db.Uuid
  startedAt      DateTime @map("started_at")
  lastSeenAt     DateTime @map("last_seen_at")
  watchedSeconds Int      @default(0) @map("watched_seconds")

  @@index([enrollmentId, startedAt(sort: Desc)])
  @@index([lessonId])
}
```

**One row per sitting, not per heartbeat.** A heartbeat fires every 10s; a
40-minute lesson is 240 of them. Storing each would put millions of rows in
front of a screen that wants to say "شُفت الدرس ده الساعة ٩ ونص لمدة ١٢ دقيقة".
Sessionisation happens on write: a heartbeat extends the open session for its
`(enrollment, lesson)` pair if one was last seen within `VIEW_SESSION_GAP`
(30 minutes), and starts a new row otherwise.

**Where it is written.** Inside `HeartbeatService.record`'s existing
transaction, so a session row can never disagree with the `lesson_progress`
row it was derived from — and crucially, it credits the SAME server-granted
`granted` seconds, never `input.delta`. The anti-forgery control that makes
`watchedSeconds` trustworthy has to hold for the timeline too, or the timeline
becomes the softer number a client can inflate.

**Cost.** One `UPDATE … WHERE id = (SELECT … FOR UPDATE)` on the common path,
plus an `INSERT` only when a sitting begins. This is the highest-frequency
authenticated write in the product, so the extra statement is deliberate and
bounded: it is one indexed update, in a transaction that already holds a row
lock on `lesson_progress`.

**Ordering note.** The new lock is taken AFTER the existing
`lesson_progress` `FOR UPDATE`, always, and the two are always acquired in
that order — an inconsistent order between two code paths is how a deadlock is
built.

## The timeline

`GET /api/me/activity?cursor=&limit=` → newest first, three kinds merged:

| kind | source | says |
|---|---|---|
| `watched` | `lesson_view_sessions` | which lesson, when, for how long |
| `completed` | `lesson_progress.completedAt` | which lesson was finished, and how |
| `quiz` | `quiz_attempts.submittedAt` | which quiz, the score, pass/fail |

Merged in the service rather than in SQL. A `UNION ALL` across three tables
with different shapes needs every column widened to a common type and every
`ORDER BY … LIMIT` pushed through a subquery per branch; the merge is a sort
over three bounded, already-indexed reads and is far easier to prove correct.
Pagination is a `submittedAt`-style timestamp cursor, not an offset — an
offset paginator over a feed that grows at the head silently repeats rows.

Ownership is a `WHERE` on the enrollment's `userId` for the first two and on
`userId` for the third. No id parameter on the route.

## Avatar upload

`POST /api/profile/avatar`, `profile:write`, multipart single file.

`MediaService.uploadAvatar` reuses all four gates of `upload` — extension
allowlist, magic-byte sniff, sharp re-encode, UUID key — and adds two rules of
its own:

- `MAX_AVATAR_BYTES` (2 MB), well under the 10 MB general cap. A profile photo
  that needs more than 2 MB is a photo that will be resized to 512px anyway.
- `.resize(512, 512, { fit: 'cover' })` before the WebP encode, so what lands
  on disk is what gets served. Every consumer renders a circle; storing a
  4000×3000 original and letting six call sites crop it differently is how
  avatars end up framed differently on different screens.

The re-encode is what makes accepting uploads from students safe at all: it
destroys polyglots and strips EXIF — including GPS, which on a photo taken by
a school student is not a theoretical concern.

`User.image` is then set to the media URL. The old asset is archived, not
deleted: `media_assets` is referenced by admin screens and an
`onDelete`-shaped cleanup on a table other people's rows live in is a much
bigger blast radius than a soft flag.

## The page — `/profile`

Rail entry, so it is one edit in `STUDENT_NAV` (slice 1's table).

```
┌─ identity ────────────────────────────────────────────┐
│  avatar (click to change)  ·  name, email, phone      │
│  school, governorate, year                            │
└───────────────────────────────────────────────────────┘
┌─ what you have earned ────────────────────────────────┐
│  lessons done · watch time · quizzes passed · average │
└───────────────────────────────────────────────────────┘
┌─ devices ─────────────────┬─ activity ────────────────┐
│  reuses <DevicesList>     │  the merged timeline,     │
│  name · OS · IP · last    │  "load more" by cursor    │
└───────────────────────────┴───────────────────────────┘
```

Totals come from the two endpoints that already return them
(`/api/me/dashboard`, `/api/me/quizzes`) plus watch time from the activity
service — not a fourth summary endpoint restating figures two others own.

`/settings/devices` stays where it is and keeps working; the profile embeds
the same component rather than moving it, because the account menu links
straight to it and a redirect chain for a screen that already has a home is
churn without a benefit.

## Error handling

Each region degrades on its own, following slice 1's rule: identity, totals,
devices and activity are separate `<Suspense>` boundaries, so a slow activity
read cannot hold up the avatar. Upload failures surface as a toast on the form
and leave the previous photo in place — an avatar that vanishes on a failed
upload reads as data loss.

## Testing

- Sessionisation: a second heartbeat inside the gap extends the row; one
  outside it starts a new one; the row credits `granted`, never `input.delta`;
  two tabs cannot double-credit (the existing lock covers this and the test
  asserts it still does).
- Timeline: ownership, ordering across all three kinds, cursor pagination with
  no repeats and no gaps at a page boundary where two events share a timestamp.
- Avatar: oversize rejected, a renamed executable rejected, EXIF stripped, the
  output is 512×512 WebP, and `User.image` points at it.
- e2e: upload a photo and see it in the rail's account menu; the timeline shows
  a lesson just watched and a quiz just submitted.

## Out of scope

Notifications (slice 4). Editing profile fields other than the photo — name,
phone and school are onboarding's, and a second editor for the same columns is
a second validation path to keep in step.
