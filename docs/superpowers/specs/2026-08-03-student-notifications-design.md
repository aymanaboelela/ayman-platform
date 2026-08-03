# Student notifications — design

**Date:** 2026-08-03
**Status:** slice 4 of 4 (final)
**Builds on:** slices 1–3
**Scope:** in-app notifications for students — a bell with an unread count, a
panel, a full list, and read state. **In-app only**, confirmed: no email, no
SMS, no push, and therefore no third-party provider, no credentials and no
per-message cost.

## Why

Slice 1 deliberately left the bell out of the topbar rather than shipping
chrome that opened onto nothing. This is the slice that earns it.

Three things already happen to a student that nobody tells them about:

- **A quiz gets graded.** For an auto-graded paper the score is on screen at
  submit — but an attempt containing an essay sits `pending_review` until an
  instructor marks it, and the student has no way to learn that it landed
  except by going back and looking.
- **A grade appeal is decided.** `GradeAppeal` is a real, resolved workflow
  (`AppealsService.resolve`) and its outcome is currently silent.
- **An admin grants an extra attempt or extra time.** `AttemptAdminService`
  does this deliberately, for a student who asked — and the student is never
  told it was done.

All three are per-student events on existing code paths. None is a broadcast.

## What is deliberately NOT notified

**Anything that fans out.** "A new course was published" means one row per
enrolled student, and at a few thousand students that is a write amplification
problem, a delivery-ordering problem and a "mark all read" problem all at once.
It is a real feature and it belongs in its own slice with its own design, not
smuggled into this one.

## The model

```prisma
model Notification {
  id        String           @id @default(uuid(7)) @db.Uuid
  userId    String           @map("user_id")
  kind      NotificationKind
  /// Rendered from `kind` + `payload` on the CLIENT, never stored as prose.
  payload   Json             @default("{}")
  readAt    DateTime?        @map("read_at")
  createdAt DateTime         @default(now()) @map("created_at")

  @@index([userId, createdAt(sort: Desc)])
  @@index([userId, readAt])
}

enum NotificationKind {
  quiz_graded
  appeal_resolved
  extra_attempt_granted
}
```

**No message column, on purpose.** Storing rendered Arabic prose in the
database means every wording fix is a data migration, and it puts user-facing
copy outside `@ayman/contracts/copy` where Global Constraint 4 requires it to
live. `payload` carries the ids and numbers; the client composes the sentence
from the copy table.

**`readAt` nullable rather than a boolean**, matching every other soft-state
column in this schema (`archivedAt`, `revokedAt`, `completedAt`): it records
*when*, which a boolean throws away for no saving.

**The unread index is `[userId, readAt]`**, which serves the badge count — the
single most frequent query this table will take, once per page load.

## Writing them

One `NotificationService.emit(tx, {...})`, taking a transaction client, called
from inside the transaction that causes the event — exactly the discipline
`ViewSessionService` follows. A notification about a grade that was rolled back
is worse than no notification.

| kind | emitted from | payload |
|---|---|---|
| `quiz_graded` | `AttemptService` grading path | `attemptId`, `lessonId`, `scorePercent`, `passed` |
| `appeal_resolved` | `AppealsService.resolve` | `attemptId`, `lessonId`, `accepted` |
| `extra_attempt_granted` | `AttemptAdminService.grantExtraAttempt` | `quizId`, `lessonId` |

`quiz_graded` fires only when grading actually completes — an auto-graded
attempt at submit, a `pending_review` one when the instructor finishes. A
student who watched their score appear on submit still gets the row, and that
is correct: the notification list is a record of what happened, not a push.

## Reading them

| route | does |
|---|---|
| `GET /api/me/notifications?cursor=&limit=` | the list, newest first, cursor-paged |
| `GET /api/me/notifications/unread-count` | just the badge number |
| `POST /api/me/notifications/:id/read` | mark one |
| `POST /api/me/notifications/read-all` | mark every unread one |

Same `@Controller('me')` prefix and the same identity discipline as slices 2
and 3: the list routes take no id parameter, and `:id/read` is scoped by
`{ id, userId }` in the WHERE clause so a guessed id belonging to someone else
updates zero rows rather than theirs.

`unread-count` is its own endpoint rather than a field on the list because the
topbar needs it on every page and must not pay for twenty rows to render one
number.

## The UI

- **Bell in the topbar** (the slot slice 1 left empty), with an unread count.
  The count is a Server Component in its own `<Suspense>`, following the same
  rule as the account menu — the shell must not `await` it.
- **Panel** on click: the ten newest, each linking to what it is about, and
  "علّم الكل كمقروء".
- **`/notifications`** for the full history, cursor-paged, reusing the feed
  pattern from `<ActivityFeed>`.
- Opening a notification marks it read and navigates. Marking read is a
  Server Action that revalidates the layout, so the badge in the topbar
  updates with it rather than going stale until a reload.

**Zero unread means no badge**, not a badge showing `0`. A permanent `0` on a
bell trains a student to ignore the bell.

## Error handling

The bell degrades to no badge if the count read fails — a shell that fails to
render because a counter timed out is a much worse outcome than a missing
number. `emit` failures inside a transaction roll the whole event back, which
is the intended coupling: the notification and the thing it describes are one
fact.

## Testing

- `emit` writes inside the caller's transaction and is rolled back with it.
- Ownership: another user's notification is never listed, and `:id/read`
  against it updates nothing.
- Unread count excludes read rows; `read-all` is idempotent.
- Cursor paging with no repeats, the same tie-break rule slice 3 established.
- e2e: submit a quiz, see the badge appear, open the panel, follow the entry
  to the review screen, and watch the badge clear.

## Out of scope

Broadcasts (new course, new lesson), digest emails, per-kind preferences, and
any delivery channel outside the app.
