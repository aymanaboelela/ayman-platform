# Recipes: content through the live API

Only do any of this against production when the owner explicitly asks. Every
write reaches real students.

## Auth for every write

1. `POST /api/auth/sign-in/email` with admin credentials the owner gives you. Take
   `__Host-session_token` from `Set-Cookie`.
2. On every write, send `x-csrf-token: <any value>` and
   `origin: https://<the stack's domain>`. Send a browser `User-Agent`;
   Cloudflare 403s script UAs with `error code: 1010`.
3. Bulk POSTs get 429 after about 20. Sleep about 1.5 s between calls, then verify counts
   and look for duplicates.

## Publish a lecture

1. `PUT …/video` with your own `durationSeconds` (the VPS can't resolve YouTube
   durations).
2. Poster: `POST /api/media`.
3. Deck PDF: `POST /api/media/documents`, then `POST /api/admin/lessons/:id/resources` with
   `kind:'presentation'`.
4. Questions:
   - Create a category with `POST /api/admin/questions/categories` (`{name}`).
   - Send the questions in Aiken-style text to `POST /api/admin/questions/bulk`.
   - Never use `و` as an option letter. Write essays as `TYPE: essay`.
   - Bulk returns only a count. Re-fetch with `GET /api/admin/questions?categoryId=`
     (newest first) and match on the stem.
5. Quiz:
   - Create it with `PUT /api/admin/quizzes/lesson/:lessonId`.
   - Add slots one at a time and assert the count.
   - Publish with `POST …/:quizId/publish`.
   - Marks come from `QuizSlot.maxMark` (`PATCH …/slots/:slotId`).
6. Put the quiz on its own `kind:'quiz'` lesson right after the lecture.
7. Flush the public page. Curl writes don't revalidate Next, so make a no-op edit and
   restore in the admin UI (for example, the course's «وصف مختصر»).

## Edit a published question

`PATCH /api/admin/questions/:entryId` with the full input creates a **draft**. Then
`POST /api/admin/questions/:versionId/publish`. Verify with `GET /api/admin/quizzes/:id`.

## Monthly exam

1. Create the questions as above.
2. `POST /api/admin/exams` with
   `{courseId,title,coveredLessonIds,opensAt,closesAt,durationMinutes,gradeOutOf,passPercent}`.
   Send timestamps as explicit UTC (`…Z`).
3. `GET /api/admin/quizzes/lesson/:id`, then add the slots.
4. `PUT /api/admin/exams/:lessonId/published`.
5. Put essay model answers in `settings.graderInfo`, never in `generalFeedbackHtml`.

## Homework

`PUT /api/admin/lessons/:id/homework`. The body is plain text (≤ 4000 characters) and
`maxImages` is 1–8. Copy the shape from `lessons[].homework` in
`GET /api/admin/courses/:id`.

## Course months

`POST /api/admin/courses/:id/months/fill` creates the missing months, up to N (default
10), as closed. It is idempotent. It returns 409 on a course with no months, on purpose.
Never auto-fill: a deleted month must stay deleted.

## News article

1. `POST /api/admin/news` (always creates a draft).
2. `PATCH /api/admin/news/:id/published`.

Limits:
- slug 2–80 characters, no `/`, `.` or spaces
- title 4–120 characters
- excerpt 20–160 characters

The markdown is a subset: no tables, no images, no `#`. Unsafe links silently become
plain text. Covers are 1200×630. Edits can take up to an hour to show; new URLs appear
immediately.

## Honor-board photo

1. `POST /api/media`.
2. `PATCH /api/admin/students/:userId` with `{"honorPhotoKey":"<key>"}`.

## Landing copy

Use a migration, not `ar.ts`. See "Content and copy" in [`pitfalls.md`](pitfalls.md).
