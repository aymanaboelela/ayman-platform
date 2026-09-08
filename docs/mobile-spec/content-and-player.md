# Content & Player — mobile spec

Area: **COURSES · LESSONS · VIDEO PLAYBACK · PROGRESS · HOMEWORK**

Everything below is read out of the repo, not remembered. Every non-obvious claim cites a
repo-relative path. A Flutter engineer should be able to build this area without opening
`apps/web`.

---

## 0. Transport, auth and error conventions

### 0.1 Base URL and prefix

- Every API route is under the global prefix `api` — `app.setGlobalPrefix('api', …)`
  (`apps/api/src/main.ts:32`).
- **One exception**: `GET /media/:prefix/:name` is excluded from the prefix and is
  `@Public()` (`apps/api/src/modules/media/media.controller.ts:160-161`). It is served from a
  **different origin** than the app (`MEDIA_BASE_URL`, asserted at boot to differ from
  `APP_URL` — `apps/api/.env.example:49-53`).
- No CORS is configured anywhere (`apps/api/src/main.ts:24-25` comment). The web app proxies
  `/api/*` from its own origin. **A native app talks to the API origin directly, so CORS is
  irrelevant for it — but see §0.3, the CSRF guard reads `Origin`/`Sec-Fetch-Site`.**

### 0.2 Session

- better-auth cookie session. There is no bearer-token flow in this area; every route reads
  `user.id` from the session (`@CurrentUser()`), never from the URL. Route params never carry
  a user id anywhere in this area.
- Anonymous → **401** on any authenticated route (see the authorization matrix,
  `apps/api/src/test/authorization-matrix.int-spec.ts:608, 618, 624, 646, 655, 696`).

### 0.3 CSRF (affects every POST from Flutter)

`apps/api/src/modules/security/csrf.guard.ts:77-107`, applied to state-changing methods
(`POST/PUT/PATCH/DELETE`):

1. If header `Origin` is present and `!== APP_URL` → **403 `CSRF: origin mismatch`**.
2. If header `Sec-Fetch-Site` is present and not in the allowed set → **403 `CSRF: cross-site request`**.
3. Header `x-csrf-token` must be present and non-empty → otherwise **403 `CSRF: missing x-csrf-token header`**.

The *value* is not validated today; presence is the control
(`apps/web/lib/csrf.ts:1-17`). Web clients echo the `__Host-csrf` cookie.

> **Mobile gap.** A Dart HTTP client sends no `Origin` and no `Sec-Fetch-Site`, so rules 1 and
> 2 pass vacuously, but rule 3 still fires. Flutter must send **`x-csrf-token: <anything non-empty>`**
> on every POST in this area (the web upload client literally falls back to the string
> `'browser-upload'` — `apps/web/lib/upload-client.ts`, `readCsrfToken() || 'browser-upload'`).

### 0.4 Rate limits (all return **429**)

Global default, keyed per **session** not per IP (`apps/api/src/app.module.ts:86-98`):

| bucket | ttl | limit |
|---|---|---|
| short | 1 s | 10 |
| medium | 60 s | 60 |
| long | 3600 s | 1000 |

Overrides in this area:

| route | short | medium | long | source |
|---|---|---|---|---|
| `GET /api/catalog/*` | 300 / 1 s | 3000 / 60 s | 30000 / 1 h | `catalog.controller.ts:31-35` |
| `POST /api/lessons/:id/heartbeat` | 2 / 1 s | 15 / 60 s | 500 / 1 h | `progress.controller.ts:29-33` |
| `POST /api/lessons/:id/dwell` | 2 / 1 s | 20 / 60 s | — | `progress.controller.ts:67` |

An honest player sends 6 heartbeats/minute, so the 15/min ceiling leaves room for a remount
plus a couple of retries.

### 0.5 The 404-not-403 rule

**Load-bearing across this whole area.** "No such lesson", "not your lesson", and "locked by
the progression gate" all return **404** with body `{"message":"lesson not found"}`.
A 403 would confirm that an id exists (`apps/api/src/modules/progress/lesson-access.service.ts:44-51,
78-84`). Do not build UI that distinguishes them from the status code.

The **one** 403 in this area is a *lapsed grant*: an expired / revoked / not-yet-valid
`AccessGrant` for a student already enrolled →
`ForbiddenException(reason)` with `reason ∈ {expired, revoked, not_yet_valid, needs_term_grant}`
(`lesson-access.service.ts:96-140`). The web app redirects to the public course page so the
subscribe flow can handle it (`apps/web/app/(app)/courses/[slug]/lessons/[lessonId]/page.tsx:55-62`).

### 0.6 Numbers on the wire

- Prisma `Decimal` columns are converted to `number` before serialization
  (`apps/api/src/modules/progress/progress.mapper.ts:34-45`,
  `apps/api/src/modules/homework/homework.service.ts` `decimalToNumber`). If you ever see a
  string where a number is declared, that is a bug on the server.
- Timestamps are **ISO 8601 strings** (`z.iso.datetime()`).
- Money is **EGP piastres/cents, integer** (`monthlyPriceCents`, `bookPriceCents`, …).
- Durations are **seconds, integer**.

---

## 1. Content hierarchy

```
Course  (courses)
 ├── CourseTerm       (course_terms)          الترم الأول / الترم الثاني — a grouping of sections
 └── CourseSection    (course_sections)       optionally belongs to one CourseTerm
      └── Lesson      (lessons)               kind ∈ video | quiz | attachment | text
           ├── LessonVideo     (lesson_videos)      1:1, YouTube id + mirror columns
           ├── LessonText      (lesson_texts)       1:1, sanitized HTML
           ├── LessonHomework  (lesson_homework)    1:1, الواجب
           ├── LessonResource  (lesson_resources)   0..n materials, any lesson kind
           └── Quiz            (quizzes)            0..1, any lesson kind

Enrollment (enrollments)        one per (user, course)
 ├── LessonProgress     (lesson_progress)       one per (enrollment, lesson) — lifetime totals
 └── LessonViewSession  (lesson_view_sessions)  one per SITTING
AccessGrant (access_grants)     entitlement — never a boolean on the course
HomeworkSubmission (homework_submissions) one per (lesson, user)
 └── HomeworkImage (homework_images)
```

Two structural facts that surprise people:

- **A quiz is a Lesson** (`kind: 'quiz'`), *and* a `Quiz` row can hang off **any** lesson kind
  via `Quiz.lessonId` (1:1). So a video lecture can carry a bonus quiz alongside its own
  completion rule (`apps/api/src/modules/player/player.service.ts` — `quiz: { select: { id, isPublished } }`).
- **A quiz is not a lecture.** Every count on the platform (`lessonCount`, `totalLessons`,
  `progressPercent`, the exam's prerequisite set) filters `kind != 'quiz'`
  (`catalog.service.ts` `isLecture`, `course-progress.service.ts` `reachable`,
  `gate-rule.ts` `isLecture`).

### 1.1 Publication is a THREE-level condition

A lesson is student-visible only when **course.status = 'published' AND
section.isPublished AND lesson.isPublished** (`catalog.service.ts:12-17` `PUBLISHED_LESSON`;
`player.service.ts` outline query; `course-progress.service.ts` `reachable`). Checking only the
course is how a half-finished chapter leaks.

---

## 2. Enums (exact values)

All from `apps/api/prisma/schema.prisma` and mirrored in `packages/contracts/src`.

```
CourseStatus         draft | published | archived                        (schema:580)
CourseEmphasis       required | recommended | optional                   (schema:600) — PRESENTATION ONLY
LessonKind           video | quiz | attachment | text                    (schema:608)
VideoProvider        youtube | upload | vimeo | bunny | vdocipher | ink | gumlet   (schema:620)
VideoMirrorStatus    pending | mirroring | ready | failed | disabled      (schema:635)
CompletionMode       none | manual | on_view | on_grade | on_pass         (schema:649)
LessonResourceKind   presentation | video | document | link              (schema:1387)
EnrollmentStatus     active | suspended | expired | revoked | completed   (schema:1464)
EnrollmentSource     free | manual | purchase | coupon | code             (schema:1478)
AccessScope          platform | course | subject_teacher | unassigned | term  (schema:1495)
GrantSource          auto_free | admin | access_code | purchase | coupon | scholarship (schema:1519)
CompletionSource     auto | manual | dwell                               (schema:2396)
LessonProgressState  not_started | in_progress | completed | passed | failed (schema:2405)
HomeworkStatus       submitted | accepted | needs_work                    (schema:1241)
```

Contract-only enums (no DB column):

```
GateState            cleared | available | locked                  (contracts/progress.ts:227)
CatalogStreamFilter  general | languages                           (contracts/catalog.ts:125)
StreamChoice         general | languages | both                    (contracts/content.ts:104)
VideoEmbedStatus     ok | blocked | unavailable | unknown           (contracts/video.ts:39)
HomeworkFilter       pending | accepted | needs_work | all          (contracts/homework.ts:157)
PublishSkipReason    noVideo | noText | noResources | quizNotPublished (contracts/content.ts:685)
ActivityKind         watched | completed | quiz                     (contracts/activity.ts:25)
```

### 2.1 Semantics that are not obvious from the name

- **`CourseEmphasis`** — the badge on the card and nothing else. *Not* visibility, *not*
  entitlement, *not* the gate. «A course marked `optional` is exactly as reachable as one
  marked `required`» (schema:588-599). It exists because **the catalog does not filter by the
  student's year** — every student sees every course; `year` is a label, not a gate.
- **`CompletionMode`** — lives on the **Lesson**, not on the video/quiz payload row
  (schema:645-648). ⚠️ See §7.5: v1 does **not** branch on it at runtime.
- **`VideoProvider`** — 7 values, but **v1 only ever writes `youtube`**. Any other value is
  rejected by `LessonVideoInputSchema` with «النسخة الحالية بتدعم فيديوهات يوتيوب بس»
  (`contracts/video.ts:179-186`).
- **`EnrollmentStatus.completed`** — still grants access.
  `ACTIVE_ENROLLMENT_STATUSES = ['active', 'completed']`
  (`apps/api/src/modules/enrollment/enrollment.service.ts:12`). Finishing a course must not
  revoke it, so `status` deliberately stays `active` and only `completedAt` is stamped
  (`course-progress.service.ts` `recalculate`).
- **`AccessScope.term`** — satisfies "does this student have SOME access to this course"
  but is **not** enough to open a lesson in a *different* term. See §5.3.

---

## 3. Models — every field

### 3.1 `Course` (`courses`) — schema.prisma:663-919

| field | type | notes |
|---|---|---|
| `id` | uuid v7 | |
| `slug` | citext, unique | Latin lowercase + digits + hyphens, 3..96, `^[a-z0-9]+(?:-[a-z0-9]+)*$`. Reserved: `new, edit, admin, api, dev, me, sitemap, robots` (`contracts/content.ts:44-51`). Arabic slugs percent-encode into unreadable share URLs. |
| `title` | string | 3..160 |
| `subtitle` | string? | ≤240 |
| `description` | string? | ≤4000, rich text |
| `systemId` | uuid | EducationSystem |
| `year` | int 1..3 | |
| `trackId` | uuid? | CHECK `courses_year1_has_no_track` — year 1 must have `trackId = null` |
| `subjectId` | uuid | |
| `status` | CourseStatus | default `draft` |
| `instructorId` | string | |
| `forGeneral` / `forLanguages` | bool, both default true | مدارس عام / مدارس لغات. CHECK `courses_serves_a_stream` forbids both false. Independent of system/track. |
| `coverKey` | string? | **storage KEY, never a URL** |
| `priceCents` | int, default 0 | **Reserved and dead.** Nothing reads it. |
| `requiresGrant` | bool default false | «مقفول». Selects which grant SCOPES satisfy the course: `false` → `platform \| course \| subject_teacher \| term`; `true` → `course \| subject_teacher \| term` (drops `platform`). ⚠️ Flipping to `true` does **not** evict students already enrolled. |
| `monthlyPriceCents` | int? | EGP cents; `null` = plan not for sale |
| `quarterlyPriceCents` | int? | |
| `yearlyPriceCents` | int? | 12 months, `scope: course` grant, real calendar expiry |
| `bookTitle` | string? | الكتاب الورقي. CHECK `courses_book_needs_price_and_title`: both set or both null |
| `bookPriceCents` | int? | |
| `position` | int default 0 | catalog ordering |
| `emphasis` | CourseEmphasis? | badge |
| `emphasisNote` | string? | ≤80 trimmed. CHECK `courses_note_needs_emphasis` — a note requires an emphasis |
| `comingSoonNote` | string? | ≤240. Custom «لسه هننزل قريبًا». `null` falls back to `copy.course.comingSoonDefaultNote`, never to silence |
| `scheduleNote` | string? | ≤120 (CHECK `courses_schedule_note_length`). **Free text, never parsed** — «السبت والتلات ٨ م». The ceiling is a layout ceiling (one row in the hero on a 390px phone) |
| `contentComplete` | bool default false | اكتمل نزول المحتوى. Set by the instructor, **never derived**. Gates the word «خلصت الكورس»: without it the UI must say «خلّصت اللي نزل» |
| `whatsappGroupUrl` | string? | ≤500, must start `https://` (CHECK + DTO). Cohort group. **Never** on the public catalog payload |
| `examLessonId` | uuid?, unique | the course's final exam lesson. Composite FK forces it to be a lesson of the same course. `onDelete: SetNull` |
| `publishedAt` | datetime? | non-null when published (CHECK `courses_published_has_timestamp`) |
| `createdAt` / `updatedAt` | datetime | |

CHECK `courses_priced_requires_grant`: any of the three prices set ⇒ `requiresGrant = true`.

### 3.2 `CourseSection` (`course_sections`) — schema.prisma:920-957

`id`, `courseId`, `termId` (uuid?, `SetNull`), `title` (2..160), `summary` (?≤1000),
`position` (int, `@@unique([courseId, position])`, **DEFERRABLE INITIALLY DEFERRED** in the real
migration), `isPublished` (bool default false), `createdAt`, `updatedAt`.

`termId = null` is normal: a course with no terms, or an always-reachable intro unit. **Only a
section WITH a term can be shut by closing that term.**

### 3.3 `CourseTerm` (`course_terms`) — schema.prisma:959-1032

`id`, `courseId`, `title` (2..160), `position` (`@@unique([courseId, position])`),
`isOpen` (bool default true), `priceCents` (int?), `createdAt`, `updatedAt`.

Key semantics (schema:983-1010):
- `isOpen` is **not** a publish flag. Sections/lessons keep their own `isPublished`.
- **`EntitlementService`/`LessonAccessService` never read `isOpen`.** Closing a term works by
  **bulk-stamping `revokedAt` on every live `scope: term` grant** for it (`TermService.setOpen`).
  The student then hits the ordinary `revoked` 403.
- Reopening only re-enables **new purchases**; revoked grants are never un-revoked.

### 3.4 `Lesson` (`lessons`) — schema.prisma:1034-1126

| field | type | notes |
|---|---|---|
| `id` | uuid v7 | |
| `courseId` | uuid | **denormalised** from `section.courseId`, written by the service, never accepted from a client; composite FK `lessons_section_matches_course` enforces the match |
| `sectionId` | uuid | |
| `title` | string | 2..200 |
| `kind` | LessonKind | |
| `position` | int | `@@unique([sectionId, position])`, DEFERRABLE |
| `isPublished` | bool default false | |
| `isFreePreview` | bool default false | ⚠️ **Marks the lesson that leads the outline. It is NOT a key to anything.** No content reaches an anonymous caller, free preview or not |
| `estimatedSeconds` | int default 0 | 0..86400 |
| `forGeneral` / `forLanguages` | bool default true | per-lesson stream. **Deliberately NOT intersected with the course's pair at read time** — it is a label, not entitlement. A lesson narrower than its course is surfaced as a warning, not a block |
| `completionMode` | CompletionMode default `manual` | |
| `completionMinViewSeconds` | int? | required when `completionMode = 'on_view'` |
| `completionPassGrade` | Decimal(6,3)? | required when `on_grade`/`on_pass`. 0..100 |
| `visibleFrom`, `visibleTo`, `unlocksAfterLessonId`, `viewLimit`, `contentGroupId` | reserved | **UNENFORCED in v1** (Global Constraint 17). Nothing reads them for access; the DTOs `.strict()`-reject them with a 400 so nobody believes they scheduled something |
| `createdAt`/`updatedAt` | | |

Refinement `completionRuleIsCoherent` (`contracts/content.ts:447-457`), error message
«قاعدة إتمام الدرس ناقصة قيمتها» at `path: ['completionMode']`.

### 3.5 `LessonVideo` (`lesson_videos`) — schema.prisma:1128-1172

| field | type | notes |
|---|---|---|
| `lessonId` | uuid, **PK** | 1:1 with a lesson |
| `provider` | VideoProvider | always `youtube` in practice |
| `externalId` | string | **exactly 11 chars, `^[A-Za-z0-9_-]{11}$`**, enforced by a DB CHECK too. Never a URL |
| `durationSeconds` | int | resolved server-side from YouTube unless explicitly stated |
| `posterKey` | string? | storage key of an uploaded poster |
| `captions` | Json? | unused |
| `mirrorStatus` | VideoMirrorStatus default `pending` | |
| `mirrorHeight` | int? | tallest rendition actually in the bucket; null until `ready` |
| `mirrorBytes` | BigInt? | total stored bytes |
| `mirrorError` | string? | last failure, truncated to 500 chars |
| `mirrorAttempts` | int default 0 | consecutive failures; a success zeroes it |
| `mirrorAt` | datetime? | when the status last changed; drives backoff + the stale-claim reaper |
| `createdAt`/`updatedAt` | | |

Partial index `lesson_videos_mirror_idx` on `(mirrorStatus, mirrorAt)`.

### 3.6 `LessonText` (`lesson_texts`) — schema.prisma:1174-1194

`lessonId` (PK), `bodyHtml` (**always sanitize-html output** — nothing writes it without
`sanitizeRichText()`), `createdAt`, `updatedAt`. Max 65_536 chars on write
(`MAX_RICH_TEXT_CHARS`, `contracts/content.ts:478`).

The web renders it a **second** time through DOMPurify on the server before it reaches the
client (`(app)/courses/[slug]/lessons/[lessonId]/page.tsx:110-125`).
**A Flutter client must not render this as raw HTML in a WebView without its own sanitizer
policy** — or, better, render a restricted subset (see §12.4).

### 3.7 `LessonResource` (`lesson_resources`) — schema.prisma:1400-1462

`id`, `lessonId`, `kind` (LessonResourceKind), `title`, `description` (plain text, never HTML),
`position` (int default 0 — **duplicates tolerated**, ordering is `(position, id)`, there is no
unique index and adding one would break `buildReorderSql`).

Payload columns, mutually exclusive by CHECK constraints per `kind`:

- file (`presentation` | `document`): `storageKey`, `filename`, `mime`, `sizeBytes`
- video: `videoProvider`, `videoExternalId` (11-char id)
- link: `linkUrl` (**must start `https://`** — CHECK + DTO)

`presentation` is limited to **at most one per lesson** by a partial unique index.
`MAX_RESOURCE_BYTES = MAX_DOCUMENT_BYTES = 95 MiB` (`contracts/admin/media.ts:275`).

**Any lesson kind may carry resources** — a video lecture with a deck and three PDFs is the
common case (schema:1400-1406).

### 3.8 `LessonHomework` (`lesson_homework`) — schema.prisma:1187-1234

`lessonId` (PK), `body` (**plain text with newlines, NOT HTML** — deliberately, so the one
screen a student also uploads files to has no HTML sink), `maxImages` (int default 4, CHECK
1..8), `isPublished` (bool default false — the editor autosaves, so existence must not mean
published), `createdAt`, `updatedAt`.

### 3.9 `Enrollment` (`enrollments`) — schema.prisma:2358-2388

`id`, `userId`, `courseId`, `source` (EnrollmentSource default `free`), `status`
(EnrollmentStatus default `active`), `enrolledAt`, `expiresAt?`, `completedAt?`,
`progressPercent` (Decimal(5,2), default 0), `lastLessonId?` (**written on every lesson open**
— this is the whole mechanism behind resume and continue-watching), `createdAt`, `updatedAt`.
`@@unique([userId, courseId])`.

### 3.10 `AccessGrant` (`access_grants`) — schema.prisma:1541-1613

`id`, `userId`, `scope` (AccessScope), `courseId?`, `subjectId?`, `instructorId?`, `termId?`,
`source` (GrantSource), `scholarshipKind?`, `validFrom` (default now), `validUntil?`
(**null = open-ended**; a `scope: term` grant **always** writes null and is cut off by
`revokedAt`, never by a date), `revokedAt?`, `grantedByUserId?`, `note?`, `cancelReason?`,
`cancelReasonVisibleToStudent` (bool default false), `createdAt`.

### 3.11 `LessonProgress` (`lesson_progress`) — schema.prisma:2426-2477

**Composite primary key `(enrollmentId, lessonId)` — there is no surrogate id.** That is
deliberate: the heartbeat's `SELECT … FOR UPDATE` path could not generate a uuid7 outside
Prisma's client.

| field | type | notes |
|---|---|---|
| `completion` | Decimal(5,4), default 0 | **0..1 fraction**, at most 4 decimals |
| `state` | LessonProgressState default `not_started` | |
| `watchedSeconds` | int default 0 | server-accumulated, never a client total |
| `maxPositionSeconds` | int default 0 | furthest second ever reached |
| `openCount` | int default 0 | |
| `firstOpenedAt` | datetime? | set **once**, on first open. The dwell rule measures against this |
| `lastHeartbeatAt` | datetime? | the wall-clock anchor. Separate from `updatedAt` because that is rewritten by unrelated writes |
| `completedAt` | datetime? | |
| `completedVia` | CompletionSource? | |
| `createdAt`/`updatedAt` | | |

DB CHECK `lesson_progress_completed_is_full`: `completedAt IS NOT NULL ⇒ completion = 1`,
**exempted when `state IN ('passed','failed')`** — an 80% pass legitimately has
`completedAt` set with `completion = 0.8`.

### 3.12 `LessonViewSession` (`lesson_view_sessions`) — schema.prisma:2479-2503

One row per **SITTING**, not per heartbeat.
`id` (uuid7), `enrollmentId`, `lessonId`, `startedAt`, `lastSeenAt` (**also the sessionisation
key**), `watchedSeconds` (**server-granted** seconds only). No `userId` column — ownership is
reached through the enrollment.

### 3.13 `HomeworkSubmission` / `HomeworkImage` — schema.prisma:1268-1385

`HomeworkSubmission`: `id`, `lessonId`, `userId`, `courseId` (denormalised, service-written),
`status` (HomeworkStatus default `submitted`), `attempt` (int default 1), `imageCount`
(int default 0 — **kept after the pictures are deleted**), `grade` (Decimal(5,2)?, 0..100 or
null for «مقبول من غير درجة»), `reviewNote` (text?, a frozen SNAPSHOT), `reviewedAt?`,
`reviewedById?`, `imagesPurgedAt?` (**the only thing distinguishing "handed in nothing"
(`imageCount = 0`) from "handed in four pages since cleaned up"**), `createdAt`,
`submittedAt` (**moves forward on resubmit**, while `createdAt` stays the first ever answer).
`@@unique([lessonId, userId])` — one row per (lesson, student), **rewritten in place**.

`HomeworkImage`: `id`, `submissionId`, `storageKey` (`hw/<2 hex>/<uuid>.webp` — always WebP,
sharp re-encode strips EXIF/GPS), `sizeBytes` (post-encode), `position` (int default 0,
duplicates tolerated), `createdAt`.

`hw/` is **three path segments**, so the public `GET /media/:prefix/:name` (which binds exactly
two) cannot address it. There is no `media_assets` row either, so it never appears in the media
library.

---

## 4. Catalog — the PUBLIC surface

`apps/api/src/modules/catalog/catalog.controller.ts` · `catalog.service.ts` ·
`packages/contracts/src/catalog.ts`

### 4.1 `GET /api/catalog/courses` — `@Public()`

Query: `?stream=general|languages`. Anything else — **including `both`** — is silently ignored
and returns everything (`catalog.controller.ts:47-51`). A typo'd query must be a full list, not
an empty page that looks like "no courses exist".

`stream` is a **membership test, not equality**: `general` → `where: { forGeneral: true }`,
which includes courses serving both.

**Ordering: `position ASC, publishedAt DESC, id ASC`** (`catalog.service.ts` list).

Response `CatalogList`:

```jsonc
{
  "courses": [ /* CatalogCourse */ ],
  "total": 12          // == courses.length; there is NO pagination on this route
}
```

`CatalogCourse` (`contracts/catalog.ts:56-117`) — this file is an **allowlist**; nothing not
declared here is on the wire:

| field | type |
|---|---|
| `contentComplete` | bool |
| `id` | uuid |
| `slug` | string |
| `title` | string |
| `subtitle` | string \| null |
| `systemSlug` | string |
| `systemNameAr` | string |
| `year` | int 1..3 |
| `trackLabelAr` | string \| null |
| `subjectNameAr` | string |
| `coverKey` | string \| null |
| `lessonCount` | int ≥0 — **LECTURES only** (`kind != 'quiz'`), published-3-levels |
| `totalSeconds` | int ≥0 — `Σ (video.durationSeconds ?? estimatedSeconds)` over **all** published lesson kinds |
| `forGeneral` | bool |
| `forLanguages` | bool |
| `emphasis` | `required\|recommended\|optional` \| null |
| `emphasisNote` | string \| null |
| `monthlyPriceCents` | int \| null |
| `quarterlyPriceCents` | int \| null |
| `yearlyPriceCents` | int \| null |
| `bookTitle` | string \| null |
| `bookPriceCents` | int \| null |
| `publishedAt` | ISO datetime |
| `updatedAt` | ISO datetime |

`bookTitle`/`bookPriceCents` are resolved through `courseBook(row)` — the shop's catalogue row
(`Book`) **supersedes** the legacy pair on `Course` when live
(`apps/api/src/modules/books/course-book.ts`).

### 4.2 `GET /api/catalog/courses/:slug` — `@Public()`

`slug` is the course slug. **A draft is 404, not 403** — compiled into the query
(`where: { slug, status: 'published' }`), so the catalog cannot be an oracle for unreleased
course names.

Response `CatalogCourseDetail` = `CatalogCourse` **plus**:

```jsonc
{
  "description": "string | null",
  "comingSoonNote": "string | null",
  "terms": [ { "id": "uuid", "title": "string", "priceCents": 1234 } ],
  "sections": [
    {
      "id": "uuid", "title": "string", "summary": "string | null",
      "lessons": [
        {
          "id": "uuid",
          "title": "string",
          "kind": "video|quiz|attachment|text",
          "estimatedSeconds": 0,
          "isFreePreview": false,
          "durationSeconds": 1234,        // or null
          "forGeneral": true,
          "forLanguages": true
        }
      ]
    }
  ]
}
```

- `terms` includes **only open, priced terms**: `where: { isOpen: true, priceCents: { not: null } }`,
  ordered `position ASC, id ASC`.
- `sections`: `where: { isPublished: true }`, ordered `position ASC, id ASC`.
- `lessons`: `where: { isPublished: true }`, ordered `position ASC, id ASC`.

> ### ⚠️ There is deliberately NO `videoExternalId` here.
> It used to be present "for free previews only", which put a playable YouTube id in an
> `@Public()` response — anyone could watch without an account. The field was removed from the
> **allowlist** (not filtered in the service) so re-adding it is a compile error.
> `contracts/catalog.ts:10-27`, `catalog.service.ts` serializer comment.
> **The id now lives only behind `GET /api/lessons/:lessonId/player`, which requires a session
> AND an active enrollment.**

### 4.3 `isComingSoon`

```ts
isComingSoon(realLectureCount: number): boolean  // === 0
```
(`contracts/catalog.ts:169-171`). Feed it `lessonCount` (already excludes quizzes). This is the
one place that turns the count into the display decision, so no screen invents its own
threshold.

---

## 5. Enrollment and entitlement

### 5.1 `POST /api/courses/:courseId/enroll`

Permission `enrollment:create`. Body: none (send `{}`).
`apps/api/src/modules/entitlement/enrollment.controller.ts:18-21`.

Server returns `{ enrollmentId, access, resumeLessonId }`; **the contract the client parses is
narrower** and Zod strips the rest (`EnrollResponseSchema`, `contracts/progress.ts:214-217`):

```jsonc
{ "enrollmentId": "uuid", "resumeLessonId": "uuid | null" }
```

`resumeLessonId` = `enrollment.lastLessonId ?? firstLessonId(courseId)`, where `firstLessonId`
is the first published lesson of the first published section ordered
`section.position ASC, section.id ASC, position ASC, id ASC`
(`entitlement.service.ts` `firstLessonId`).
**`null` only for a published course with no published lessons** → render the button disabled;
never navigate to `/lessons/null`.

Idempotent: `upsert` on `(userId, courseId)`, `update: { status: 'active' }`. Clicking again
re-enters the same enrollment.

Errors:
- **404** — course does not exist or is not published.
- **403** with the raw reason string as `message`, one of:
  `no_grant | not_yet_valid | expired | revoked | course_not_published | needs_course_grant`
  (`entitlement.service.ts:16-46`). The web maps `needs_course_grant` on a **priced** course to
  the subscribe sheet, and on an unpriced-but-closed course to
  `copy.course.lockedError` = «الكورس ده مقفول دلوقتي. رسالة للمهندس أيمن وهيفتحه.»
- **401** anonymous.

Side effect: `ensurePlatformGrant(userId)` runs for **every** student, closed course or not —
it is the row that records when this student started using the platform.

### 5.2 `GET /api/enrollments`

Permission `enrollment:read`. Returns `EnrollmentDto[]`
(`contracts/progress.ts:192-202`), filtered to `status ∈ {active, completed}`, ordered
`enrolledAt DESC, id DESC`:

```jsonc
{
  "id": "uuid",
  "courseId": "uuid",
  "courseSlug": "string",
  "status": "active|suspended|expired|revoked|completed",
  "progressPercent": 40,
  "lastLessonId": "uuid | null",
  "enrolledAt": "ISO",
  "completedAt": "ISO | null"
}
```

### 5.3 How access is actually decided (read this before designing any lock UI)

`EntitlementService.resolveCourseAccess(userId, courseId)`:

1. Course missing → 404. Course not published → `{allowed:false, reason:'course_not_published'}`.
2. Satisfying scopes:
   - `requiresGrant = false` → `platform`, `course(courseId)`, `subject_teacher(subjectId)`, `term(courseId)`
   - `requiresGrant = true` → the same minus `platform`
3. Grants read ordered `validFrom DESC, id DESC`. First one that is not revoked, whose
   `validFrom <= now`, and whose `validUntil` is null or `> now`, wins →
   `{allowed: true, grantId, scope, validUntil}`.
4. Otherwise the **most specific failure seen** in severity order is returned:
   `revoked` > `not_yet_valid` > `expired` > (`needs_course_grant` | `no_grant`).

`resolveTermAccess(userId, courseId, termId, courseAccess)` runs **only when the winning
course-level grant has `scope === 'term'`**. Any course-wide scope covers every term
regardless of open/closed. Failure reason: `needs_term_grant`, or `revoked` when an admin
closed the term.

**Per-request re-check on every lesson open** (`lesson-access.service.ts:96-140`):
- `LAPSED_GRANT_REASONS = {expired, revoked, not_yet_valid}` → **403** with that reason.
- `no_grant` / `needs_course_grant` are **deliberately excluded** — closing a course to new
  students must not evict the forty already inside.

---

## 6. The outline endpoint

### `GET /api/courses/:slug/outline`

Permission `course:read`. Requires a session **and** an active enrollment in that published
course; otherwise **404 `course not found`** (admins get no bypass —
`authorization-matrix.int-spec.ts:618-621`).

Response `CourseOutline` (`contracts/progress.ts:252-333`):

```jsonc
{
  "course": {
    "id": "uuid",
    "slug": "string",
    "title": "string",
    "bookTitle": "string | null",
    "bookPriceCents": 1234,          // or null
    "coverKey": "string | null",     // storage KEY, not a URL
    "subjectNameAr": "string",
    "contentComplete": true,
    "whatsappGroupUrl": "https://… | null"
  },
  "sections": [
    {
      "id": "uuid", "title": "string", "position": 0,
      "lessons": [
        {
          "id": "uuid",
          "title": "string",
          "kind": "video|quiz|attachment|text",
          "position": 0,
          "estimatedSeconds": 600,       // nullable in the schema
          "isFreePreview": false,
          "state": "not_started|in_progress|completed|passed|failed",
          "completion": 0.42,            // 0..1
          "gate": "cleared|available|locked",
          "isExam": false
        }
      ]
    }
  ],
  "enrollmentId": "uuid",
  "progressPercent": 66.67,       // 0..100, 2dp
  "lastLessonId": "uuid | null",
  "completedLessons": 2,          // counts EVERY kind whose state ∈ {completed, passed}
  "totalLessons": 3,              // counts EVERY published lesson row, quizzes included
  "totalEstimatedSeconds": 5400,  // Σ estimatedSeconds over kind != 'quiz'
  "examLessonId": "uuid | null"
}
```

⚠️ **`completedLessons`/`totalLessons` on the OUTLINE count every lesson kind**
(`player.service.ts` outline loop: `totalLessons += 1` for every lesson;
`totalEstimatedSeconds` alone skips quizzes). This is *different* from
`CatalogCourse.lessonCount` and from `Enrollment.progressPercent`, both of which count lectures
only. Do not derive one from the other.

Ordering: sections `position ASC, id ASC`; lessons `position ASC, id ASC`; both filtered
`isPublished: true`.

`whatsappGroupUrl` is on the **outline**, never on the catalog, because this endpoint is behind
an active enrolment — which is exactly the cohort.

---

## 7. The lesson player endpoint

### `GET /api/lessons/:lessonId/player`

Permission `course:read`. Full gate: **ownership → publication → live grant → term → progression**
(`LessonAccessService.require`). Any failure of the first, second or fifth is **404**; the third
and fourth are **403 <reason>**.

Response `LessonPlayer` (`contracts/progress.ts:395-434`):

```jsonc
{
  "lesson": {
    "id": "uuid",
    "courseId": "uuid",
    "courseSlug": "string",
    "courseTitle": "string",
    "sectionTitle": "string",
    "title": "string",
    "kind": "video|quiz|attachment|text",
    "estimatedSeconds": 600            // int | null
  },

  "video": {                            // null for every non-video lesson AND for a
                                        // video lesson with no lesson_videos row
    "youtubeId": "dQw4w9WgXcQ",         // exactly ^[A-Za-z0-9_-]{11}$
    "durationSeconds": 1234,            // 0 when unknown
    "posterUrl": "https://… | null",    // ABSOLUTE url (see §7.2)
    "mirror": {                         // null unless mirrorStatus === 'ready'
      "hlsUrl": "https://…/v/<youtubeId>/master.m3u8",
      "maxHeight": 720
    }
  },

  "text": { "bodyHtml": "…" },          // or null

  "homework": {                          // or null (most lectures)
    "body": "plain text with \n",
    "maxImages": 4,
    "submission": { /* MyHomeworkSubmission, §11.2 */ }   // or null
  },

  "quiz": { "id": "uuid" },             // or null; PUBLISHED quizzes only
  "resources": [ /* PlayerResource */ ],
  "progress": { /* LessonProgress, §9.1 */ },
  "previous": { "id": "uuid", "title": "…", "kind": "video" },   // or null
  "next":     { "id": "uuid", "title": "…", "kind": "quiz"  },   // or null
  "autoCompleteAvailable": true
}
```

### 7.1 Neighbours

`previous`/`next` are computed over **every published lesson of the course in reading order**:
`section.position ASC, position ASC, id ASC` (`player.service.ts` `orderedLessons`).
This is the **same ordering tuple** the gate uses — there is deliberately no second ordering.

### 7.2 `posterUrl`

- If `posterKey` is set → `MEDIA_BASE_URL + '/' + posterKey` (`EnvMediaUrlResolver`).
- Else → `https://i.ytimg.com/vi/<youtubeId>/hqdefault.jpg`
  (`youTubeThumbnailUrl`, `contracts/video.ts:136-147`; `maxres` variant exists but the player
  path passes the default `hq`).

Note this is one of the few **absolute** URLs on the payload. `coverKey` elsewhere is a KEY;
the client builds `<MEDIA_ORIGIN>/media/<key>` (`packages/ui/src/lib/branding.ts:214-217`).

### 7.3 `PlayerResource` (`contracts/progress.ts:335-365`)

```jsonc
{
  "id": "uuid",
  "kind": "presentation|video|document|link",
  "title": "string",
  "description": "string | null",

  "filename": "string | null",     // file kinds only
  "mime": "string | null",
  "sizeBytes": 12345,              // or null

  "youtubeId": "…11 chars… | null",  // video kind only
  "linkUrl": "https://… | null",      // link kind only

  "viewPath":     "/api/lessons/<lessonId>/resources/<resourceId>/view     | null",
  "downloadPath": "/api/lessons/<lessonId>/resources/<resourceId>/download | null"
}
```

Ordered `position ASC, id ASC`.
`viewPath`/`downloadPath` are **relative same-origin API paths, non-null only for
`presentation` and `document`**. They are *not* storage URLs, deliberately: `/media/*` is
`@Public()` and can never carry enrollment-gated content, so these routes re-derive access per
request before streaming a byte.

### 7.4 `autoCompleteAvailable`

```ts
lesson.kind === 'quiz' || (lesson.kind === 'video' && durationSeconds > 0)
```
(`player.service.ts`). It answers "will this lesson tick itself off?", and it is what the UI
uses to pick between three hint strings (§12.3) and to hide the manual-complete button on a
quiz.

### 7.5 ⚠️ `CompletionMode` is inert in v1

`Lesson.completionMode`, `completionMinViewSeconds` and `completionPassGrade` are written and
validated, but **no runtime path branches on them.** The actual rules are hard-coded per
`Lesson.kind`:

| kind | how it completes |
|---|---|
| `video` | auto when both video thresholds are met (§9.4), **or** the manual button |
| `text` | 5000 ms server-measured dwell, **or** the manual button |
| `attachment` | 5000 ms server-measured dwell, **or** the manual button |
| `quiz` | **only** by passing the quiz. `completeManually` throws 400 for a quiz lesson |

Evidence: `heartbeat.service.ts` (`context.kind !== 'video'` → 400),
`lesson-progress.service.ts` `DWELL_COMPLETABLE_KINDS = {text, attachment}`,
`lesson-progress.service.ts` `completeManually` (`kind === 'quiz'` → 400
`'A quiz lesson is completed by passing its quiz.'`). Nothing reads `completionMode`.

**Do not implement CompletionMode in the mobile client.** Implement the four rows above.

---

## 8. VIDEO — everything a Flutter player needs

### 8.1 Providers

`VideoProvider` has 7 members so that widening it later is not an `ALTER TYPE` + migration
across every row. **v1 writes only `youtube`.** `LessonVideoInputSchema` rejects the others at
the admin DTO with «النسخة الحالية بتدعم فيديوهات يوتيوب بس»
(`contracts/video.ts:179-186`). Same for `LessonResourceInputSchema`'s video branch
(`contracts/content.ts:589-596`).

So there are exactly **two** sources of playable bytes today:

| source | format | where the URL comes from |
|---|---|---|
| **Mirror** — «النسخة اللي عندنا» | **HLS** (`master.m3u8`, fMP4 segments, H.264 + AAC) | built server-side: `mirrorPlaylistUrl(VIDEO_MIRROR_PUBLIC_URL, youtubeId)` |
| **YouTube** | YouTube IFrame embed | rebuilt client-side from the 11-char id |

### 8.2 There are no signed URLs, no tokens, no TTL, no DRM

`PlayerController` (`apps/api/src/modules/player/player.controller.ts`) has exactly four routes:
`outline`, `player`, `resources/:id/view`, `resources/:id/download`. **There is no video
signing endpoint at all.**

- **Mirror URL**: `https://<VIDEO_MIRROR_PUBLIC_URL>/v/<youtubeId>/master.m3u8`.
  It is **built from the id and the configured public origin, never read back from a column**
  (`player.service.ts` mirror block; `mirrorPrefix`/`mirrorPlaylistUrl`, `contracts/video.ts:384-399`).
  Objects are uploaded with
  `Cache-Control: public, max-age=31536000, immutable` (`mirror-storage.ts` `CACHE_CONTROL`).
  → **The playlist and its segments are public, unauthenticated, permanently cacheable, and
  reusable. Not single-use. No DRM. No token. No expiry.** The gate is on *learning where the
  URL is* (the player payload), not on fetching it.
- **YouTube**: the client rebuilds the embed URL from the id. No URL is ever stored or echoed
  (spec §7 P3), which is what keeps the SSRF class structurally absent.

The **only** signed/authorized bytes in this area are lesson **resources** and **homework
images** — streamed through the API with the session re-checked per request (§10, §11.5).

### 8.3 The mirror pipeline (read fully — `apps/api/src/modules/video-mirror/**`)

**Why it exists**: ministry tablets block YouTube at the network. The player's whole fallback
chain (nocookie host → youtube.com host → an «افتحه على يوتيوب» link) is three doors into one
shut building. The bytes must come from an origin the tablet already allows.

**Configuration** (`mirror-config.ts`) — five env vars, **all-or-nothing, enforced at boot**:

```
VIDEO_MIRROR_ENDPOINT            credentialed S3 endpoint (R2), internal only
VIDEO_MIRROR_BUCKET
VIDEO_MIRROR_ACCESS_KEY_ID
VIDEO_MIRROR_SECRET_ACCESS_KEY
VIDEO_MIRROR_PUBLIC_URL          the PUBLIC origin students fetch from (trailing slash stripped)
VIDEO_MIRROR_CONCURRENCY         (separate, has a default)
```

Zero set → feature off, `publicUrl === null`, every `mirror` field is `null`, players fall back
to YouTube; this is a first-class state, not a misconfiguration. **Some but not all set → the
API throws at boot** with a message naming which are missing.

**Worker** (`video-mirror.service.ts`):

- `@Cron(EVERY_MINUTE)`.
- Cross-replica mutex: Redis `SET ayman:video-mirror:worker 1 PX 90000 NX`; renewed every
  15 s; released in `finally`. Redis unreachable → **fail closed**, skip the tick.
- In-process `this.running` guard on top of the Redis lock.
- Claim query, `orderBy: mirrorAt ASC NULLS FIRST`, `provider: 'youtube'`, matching any of:
  - `mirrorStatus: 'pending'`
  - `mirrorStatus: 'failed'` AND `mirrorAttempts < 3` AND `mirrorAt < now - 20 min`
  - `mirrorStatus: 'mirroring'` AND `mirrorAt < now - 45 min` (the **reaper**, for a worker
    killed mid-download)
- Claim → `mirrorStatus = 'mirroring'`, `mirrorAt = now`. One video per tick.
- On failure: `mirrorStatus='failed'`, `mirrorAttempts += 1`, `mirrorError = message.slice(0,500)`,
  `mirrorAt = now`. After `MIRROR_MAX_ATTEMPTS = 3` it sits until an admin presses retry.
- On success (`mirrorOne`): `deletePrefix` then `uploadLadder`, then **`updateMany` over EVERY
  row with that `externalId`** — the same video on two lessons is one copy in the bucket and
  both go `ready` together. Writes `mirrorStatus='ready'`, `mirrorHeight`, `mirrorBytes`,
  `mirrorError=null`, `mirrorAttempts=0`, `mirrorAt=now`.

**The encode** (`mirror-pipeline.ts`) — it is a **remux, not a transcode**:

- `yt-dlp --dump-single-json --no-playlist --no-warnings https://www.youtube.com/watch?v=<id>`
- `is_live === true` → throw «الفيديو بث مباشر — مش هينفع ننسخه»
- `chooseRenditions`: video-only formats whose `vcodec` starts `avc1` and whose
  `width * height <= MIRROR_MAX_PIXELS (1920×1080 = 2,073,600)`. **A pixel budget, not a
  height** — a 2:1 lecture's "480p" rung is 854×394 and exact-height matching rejected every
  one of them. Dedup by height keeping the fattest `tbr`; sort desc; take at most
  `MIRROR_MAX_RUNGS = 4`. Audio: the best `mp4a` audio-only stream.
  No usable H.264 → throw «يوتيوب مش بيوفّر نسخة H.264 للفيديو ده — مش هينفع ننسخه من غير إعادة ضغط»
- Download each rung + the audio with `yt-dlp -f <formatId>`
- `ffmpeg -c copy -f hls -hls_time 6 -hls_playlist_type vod -hls_segment_type fmp4
  -hls_flags independent_segments -master_pl_name master.m3u8 -var_stream_map "v:0,a:0 v:1,a:1 …"`
  — **each variant maps the audio stream separately**, or rungs 2+ come out silent.
- Ceiling is 1080p because that is the tallest H.264 YouTube publishes; above it they serve
  VP9/AV1 only, which **iOS Safari cannot play inside HLS**.
- Timeout per external process: `30 * 60_000` ms.
- Every call is `execFile` with an **argument array** — no shell, ever. The YouTube id is
  re-validated against `YOUTUBE_ID_RE` at the top of `mirrorVideo`.

**Upload** (`mirror-storage.ts`):

- Key prefix `v/<youtubeId>` (`mirrorPrefix`) — keyed by the **video id**, not the lesson id.
- `master.m3u8` is uploaded **LAST**, deliberately: until it exists the prefix is invisible, so
  a run that dies halfway leaves orphan segments rather than a playlist pointing at nothing.
- Content types: `.m3u8 → application/vnd.apple.mpegurl`, `.m4s → video/iso.segment`,
  `.mp4 → video/mp4`. These are not cosmetic — a playlist served as `application/octet-stream`
  is downloaded rather than played by Safari.
- `deletePrefix` runs before every re-mirror so a shrunk ladder leaves no orphan rung.

**Re-queuing** (`content/lesson.service.ts`):

- `PUT /api/admin/lessons/:id/video` with a **different** `externalId` resets
  `mirrorStatus='pending'` and clears height/bytes/error/attempts/at (`mirrorReset`).
  Same id → the mirror is left alone (and the stored duration is reused rather than re-asked
  of YouTube).
- `POST /api/admin/lessons/:id/video/mirror` (permission `lesson:write`) → `requeue`, returns
  `{ lessonId, mirrorStatus: 'pending' }`, or `{ …, mirrorStatus: 'disabled' }` when no bucket
  is configured.

### 8.4 What the mobile player must do

**Source order is MIRROR FIRST, YouTube second** — and the order is the entire point of the
feature. YouTube-first with the mirror as a fallback still leaves every ministry-tablet student
staring at a dead frame, because a fallback only runs after something *reports* a failure and a
blocked network reports nothing at all (`apps/web/components/player/video-lesson.tsx:292-301`).

```
if (video.mirror != null && !mirrorFailed) → play video.mirror.hlsUrl   // HLS
else                                        → YouTube path
```

**Mirror playback:**
- Plain HLS. Flutter: `video_player` (ExoPlayer on Android handles HLS natively; AVPlayer on
  iOS handles `.m3u8` natively) or `better_player`. No hls.js equivalent needed.
- Seek to the resume point **once**, on the first metadata event only — `loadedmetadata` fires
  again on every quality change on the native path, and re-seeking drags the student backwards
  every time their connection improves (`mirror-video.tsx` `onLoadedMetadata`).
- `poster` = `video.posterUrl`.
- On a **fatal** error: fall through to YouTube from the same second. Non-fatal network errors
  should retry the load, non-fatal media errors should attempt decoder recovery (that is what
  hls.js does on web; ExoPlayer's default `LoadErrorHandlingPolicy` already covers the first).
- `maxHeight` exists so the UI can say «جودة عالية» honestly — a mirror that only managed 480p
  because that is all YouTube had must not be announced as 1080p.

**YouTube fallback:** the id is all you get. On mobile use `youtube_player_iframe` /
`youtube_player_flutter`. The web builds:
`https://www.youtube-nocookie.com/embed/<id>?rel=0&modestbranding=1&playsinline=1&hl=ar&cc_lang_pref=ar&origin=…&fs=1&start=<seconds>`
(`youTubeEmbedUrl`, `contracts/video.ts:119-133`; player vars in `video-lesson.tsx:316-348`).
A last-ditch plain-iframe fallback uses the **ordinary** `youtube.com` host on purpose — when
the nocookie host is what failed, repeating it is a retry rather than a different attempt.

**Heartbeat adapter.** The heartbeat needs exactly three things from whatever is playing:
`getCurrentTime()`, `getPlayerState()` (PLAYING = 1, PAUSED = 2, ENDED = 0), `getDuration()`
(`apps/web/lib/youtube.ts` `YT_STATE`; `mirror-video.tsx` `adapt()`). Build one adapter over
your Flutter controller and reuse it for both sources — do **not** write a second heartbeat.

**YouTube error codes** the web maps (`video-lesson.tsx:51-57`), worth mirroring:

| code | meaning | copy key |
|---|---|---|
| 101, 150 | embedding disabled by the owner | `player.videoEmbedBlocked` |
| 100 | removed or private | `player.videoRemoved` |
| 2, 5 | malformed id / HTML5 player error | `player.videoUnavailable` |

---

## 9. PROGRESS — the exact protocol

`apps/api/src/modules/progress/**` · `packages/contracts/src/progress.ts`

### 9.1 `LessonProgress` DTO (every progress response carries this shape)

```jsonc
{
  "lessonId": "uuid",
  "state": "not_started|in_progress|completed|passed|failed",
  "completion": 0.42,              // 0..1
  "watchedSeconds": 900,           // int
  "maxPositionSeconds": 1180,      // int
  "openCount": 3,
  "completedAt": "ISO | null",
  "completedVia": "auto|manual|dwell|null"
}
```

`HeartbeatResponse` (returned by heartbeat, dwell **and** complete):

```jsonc
{
  "progress": { /* above */ },
  "justCompleted": false,          // SERVER-decided, this request only
  "courseProgressPercent": 66.67   // 0..100
}
```

> «Server-decided, this request only. The client mirrors it; it never computes it.»
> (`contracts/progress.ts:187-188`)

### 9.2 Constants (import these, do not retype them)

`packages/contracts/src/progress.ts:23-65`

```
VIDEO_POSITION_THRESHOLD        0.95
VIDEO_WATCHED_THRESHOLD         0.7
HEARTBEAT_INTERVAL_MS           10_000     one heartbeat per 10 s of playback
MAX_HEARTBEAT_DELTA_SECONDS     15         hard cap on one heartbeat's claim (15 > 10 so a
                                           throttled background tab can report ONE late tick)
HEARTBEAT_CLOCK_GRACE_SECONDS   2          slack added to the server-measured gap
DWELL_COMPLETE_MS               5_000      text/attachment dwell
VIEW_SESSION_GAP_SECONDS        1_800      30 min — where one sitting ends and the next begins
```

Client-side constants worth copying (`apps/web/components/player/`):

```
TICK_MS                      1_000    the local accumulator ticks once a second
TICKS_PER_FLUSH              10       = HEARTBEAT_INTERVAL_MS / TICK_MS
MAX_HONEST_TICK_ADVANCE      2        a jump > 2 s in one tick is a SEEK, not playback → not counted
RESUME_REWIND_SECONDS        5        resume BEFORE the furthest point
FRAME_READY_TIMEOUT_MS       15_000   YouTube frame silence budget (web only)
```

### 9.3 The four routes

All under `@Controller('lessons')`, permission `progress:write`
(`apps/api/src/modules/progress/progress.controller.ts`).

#### `POST /api/lessons/:lessonId/open`

Body **must be exactly `{}`** — `EmptyBodySchema` is `.strict()`, so `{completed:true}` etc. is
a **400**, not a stripped field. Returns `LessonProgressDto` (**not** a HeartbeatResponse).
Status **201**.

What it does (`lesson-progress.service.ts` `open`):
- Upsert `lesson_progress`: on create `state='in_progress'`, `openCount=1`,
  `firstOpenedAt=now`, `lastHeartbeatAt=now`. On update `openCount += 1`, `lastHeartbeatAt=now`
  — **`firstOpenedAt` is never rewritten** (it is the dwell rule's only anchor) and **`state`
  is never written on the update branch** so a completed lesson cannot be demoted.
- A `not_started` row is then promoted to `in_progress` in a second statement.
- **Writes `enrollment.lastLessonId = lessonId`.** This is the entire mechanism behind resume
  and the dashboard's continue-watching card.

Call it **once when the player mounts**, for **every** lesson kind.

#### `POST /api/lessons/:lessonId/heartbeat`

Body, `.strict()` (`HeartbeatRequestSchema`, `contracts/progress.ts:175-180`):

```jsonc
{ "position": 1234, "delta": 10 }
```
- `position`: int, `0 ≤ position ≤ 86400` — where the scrubber is
- `delta`: int, `0 ≤ delta ≤ 15` — seconds of *actual playback* since the last call

Any extra key → **400**. Returns `HeartbeatResponse`. Status **201**.

**Only video lessons.** A non-video lesson → **400
`'heartbeats are only accepted for video lessons'`** (`heartbeat.service.ts`).

#### `POST /api/lessons/:lessonId/dwell`

Body exactly `{}`. Returns `HeartbeatResponse`.
Only `kind ∈ {text, attachment}`; anything else → **400
`'this lesson kind is not completed by dwelling'`**.
**The elapsed time is measured server-side from `firstOpenedAt`** — there is nothing in the
request for a client to forge. Asking early is *not* an error; you get the unchanged truth back
and may retry.

#### `POST /api/lessons/:lessonId/complete`

Body exactly `{}`. Returns `HeartbeatResponse` with `justCompleted: true` on the first press.
**`kind === 'quiz'` → 400 `'A quiz lesson is completed by passing its quiz.'`**
Idempotent: a second press on an already-complete lesson returns the unchanged row,
`justCompleted: false`, does not rewrite `completedAt`, does not overwrite an `auto` completion
with `manual`, and does not re-fire the course-completed notification.

Writes `completion = 1`, `state = 'completed'`, `completedAt = now`, `completedVia = 'manual'`.
**`watchedSeconds`/`maxPositionSeconds` are untouched on purpose** — that is what keeps "earned"
and "claimed" permanently separable.

### 9.4 The completion rule (video)

`isVideoAutoComplete(snapshot)` — `contracts/progress.ts:78-89`. Called **by the server on
every heartbeat**; a client may call it only to mirror the expected outcome and **must reconcile
to whatever the server returned**.

```
durationSeconds <= 0                                          → false   (never auto-completes)
positionOk = maxPositionSeconds >= 0.95 * durationSeconds
watchedOk  = watchedSeconds     >= 0.70 * durationSeconds
result     = positionOk && watchedOk
```

**BOTH are required**, because either alone is trivially defeated:
position-only → drag the scrubber to the end (Open edX's
`COMPLETION_VIDEO_COMPLETE_PERCENTAGE = 0.95` has exactly this hole);
watch-time-only → leave it playing in a background tab.

`videoCompletionFraction(snapshot)`:
```
duration <= 0        → 0
autoComplete         → 1
otherwise            → round(clamp(watchedSeconds / durationSeconds, 0, 1) * 10_000) / 10_000
```
4 decimals exactly, matching the `numeric(5,4)` column so there is no silent rounding on read-back.

### 9.5 The anti-cheat (server side — understand it so the client reports honestly)

`heartbeat.service.ts` `record`, one interactive transaction:

1. `SELECT watched_seconds, max_position_seconds, state, completed_at,
   EXTRACT(EPOCH FROM ((now() AT TIME ZONE 'UTC') - COALESCE(last_heartbeat_at, first_opened_at, updated_at)))
   FROM app.lesson_progress WHERE … FOR UPDATE`
   — the `AT TIME ZONE 'UTC'` is load-bearing: the columns are naive `timestamp(3)` and a bare
   `now()` would silently inflate every gap by the session's UTC offset (Africa/Cairo, +3).
2. ```ts
   allowedHeartbeatSeconds(claimedDelta, elapsedSeconds):
     claimed   = clamp(floor(claimedDelta), 0, 15)
     wallClock = max(floor(elapsedSeconds), 0) + 2
     return min(claimed, wallClock)
   ```
   **The client's claim is intersected with the time the SERVER measured.** There is no path
   where `delta` is added raw. Ten heartbeats inside one second buy ten *grace windows*, not ten
   deltas — 15 requests/min × 2 s = 30 s of credit per minute, strictly worse than the 60 s an
   honest minute of playback yields.
3. `cap = durationSeconds > 0 ? durationSeconds : MAX_SAFE_INTEGER`
   `watchedSeconds = min(previous + granted, cap)`
   `maxPositionSeconds = max(previous, min(max(input.position, 0), cap))`
4. `justCompleted = !wasComplete && isVideoAutoComplete(snapshot)`;
   `completion = isComplete ? 1 : videoCompletionFraction(snapshot)`
   (**pinned at 1 for an already-complete lesson**, or a heartbeat on a manually-completed video
   would 500 against `lesson_progress_completed_is_full`).
5. `ViewSessionService.credit(tx, { … grantedSeconds: granted … })` — inside the same
   transaction, **after** the `FOR UPDATE` on `lesson_progress`, always in that order (lock
   ordering; two paths taking the two locks in opposite orders is how a deadlock is built).
6. Course aggregate recalculated **only on a transition** (`justCompleted`); otherwise the
   stored `progressPercent` is read back. A mid-lesson heartbeat costs exactly two statements.
7. After the commit: if the course just finished, `NotificationsService.announce(userId)`.
   Never inside the transaction — a live «مبروك» from a transaction that rolled back leaves a
   toast pointing at a notification id that 404s.

The body carries **no identity**: `user.id` comes from the session.
There is no field for a client-sent total or percentage, and even if one were forced through at
the type level the method only ever reads `input.position` and `input.delta`.

### 9.6 View sessions (the profile timeline)

`view-session.service.ts`. One `UPDATE … WHERE id = (SELECT id … FOR UPDATE)` extends the
newest sitting for `(enrollmentId, lessonId)` whose `lastSeenAt >= now - 1800 s`, adding
`grantedSeconds` and setting `lastSeenAt = now`. `$executeRaw` returns the affected-row count,
which **is** the "did an open sitting exist" answer. Zero rows → `create` a new sitting.

A **granted delta of 0 still writes** `lastSeenAt` — the student demonstrably still has the
lesson open, and skipping the write would let a rapid-fire client roll the gap over and split
one sitting into many.

30 minutes was chosen against both failure modes: too short and a tea break becomes four
entries each claiming its own start time; too long and a morning and an evening merge into one
row claiming 09:00→21:00, which is a *visibly false* statement.

### 9.7 Course progress

`course-progress.service.ts` `recalculate(tx, enrollmentId, courseId)`:

```
reachable = { courseId, isPublished: true, section: { isPublished: true }, kind: { not: 'quiz' } }
totalLessons     = count(lesson where reachable)
completedLessons = count(lessonProgress where enrollmentId AND state ∈ {completed, passed} AND lesson matches reachable)
percent  = totalLessons === 0 ? 0 : round(completed / total * 10_000) / 100     // 2 dp
finished = totalLessons > 0 && completed === total
```

- **`section.isPublished` is load-bearing on BOTH counts.** Without it a published lesson inside
  an unpublished section sat in the denominator while being unopenable, so a finished course
  stuck at "90-something %" forever and `completedAt` was never stamped.
- **`kind != 'quiz'`** on both sides, or a 3-lecture course reads «١ من ٥» and the headline
  percentage disagrees with the count beside it.
- `completedAt = finished ? (existing.completedAt ?? now) : null` — **the EDGE, not the value.**
  Re-stamping a fresh date on every recalculation silently moved «خلصته في مارس» to
  «خلصته امبارح». The un-finish branch is unchanged: publishing a new lesson into a finished
  course clears `completedAt` and re-arms the congratulation.
- `status` deliberately stays `active`. Finishing must not drop the enrollment out of the
  ownership filters.
- A `course_completed` notification row is written **inside** the transaction; the live
  announcement happens **after** the commit.

### 9.8 Quiz results become lesson progress

`recordQuizResultTx` (`lesson-progress.service.ts`) — has **no HTTP route** (exposing one would
let a student POST their own pass). Called by the quiz engine.

- `state` becomes `passed` or `failed`, **never `completed`**.
- `completion` = the scaled score clamped to 0..1 — *not* forced to 1.
- ⚠️ **A retake must never take a pass away.** Each field takes the better of the two
  independently: a lesson already `passed`/`completed` stays so on a later fail; `completion` is
  the max (matching `bestScore`); `completedAt`/`completedVia` are kept from the earlier pass.
  A first-ever fail does record `failed` with null completion stamps, so a later pass can set
  them.
- A quiz is excluded from the course aggregate, so recording a quiz result can never be the call
  that finishes a course.

### 9.9 The progression gate

`apps/api/src/modules/progress/gate-rule.ts` — a **pure function**, tested against a table.

```
CLEARED_STATES = ['completed', 'passed']
isLecture(lesson) = lesson.kind !== 'quiz'

resolveGate({ lessons /* published, in reading order */, examLessonId }):
  for each lesson:
    1. isCleared(state)              → 'cleared'
    2. id === examLessonId           → every OTHER published LECTURE cleared ? 'available' : 'locked'
    3. otherwise                     → 'available'
```

**There is no sequential chain any more.** Lecture N+1 does not require lecture N. Rationale in
the file: the chain read `LessonProgress.state`, which is a record of a *button*, not of a
person watching a video — so the student who had genuinely done the work and the one who had
not saw the identical padlock. «أي حد يقدر يشوف أي حلقة عادي من الكورس، مش شرط يبقى شاف اللي قبلها.»

**Quizzes are excluded from the exam's prerequisite set** because a quiz gets one sitting and
`failed` is not cleared — counting them meant one under-par score shut the final exam forever
with nothing the student could do. Measured on production 2026-08-17: three of the six students
who had sat the second lecture's quiz were stopped by exactly that.

A course whose exam is its only lesson has an empty prerequisite set, so `every` is vacuously
true and the exam opens.

`LessonGateService.isAvailable` returns true only for `available` or `cleared`; a lesson absent
from the map reads as **locked** (safe default, race guard against a concurrent unpublish).

---

## 10. Lesson resources — streaming

```
GET /api/lessons/:lessonId/resources/:resourceId/view       → inline
GET /api/lessons/:lessonId/resources/:resourceId/download   → attachment
```
Permission `course:read`, full `LessonAccessService.require` gate (so the **progression gate**
applies here too).

Response headers (`player.controller.ts` `serveResource`):

```
Content-Type: <our DETECTED mime, never the uploader's claim>
Content-Length: <bytes>
X-Content-Type-Options: nosniff
Content-Disposition: inline|attachment; filename*=UTF-8''<percent-encoded>
Cache-Control: private, no-store
Content-Security-Policy: default-src 'none'; sandbox
```

RFC 5987 encoding on the filename because these names are Arabic more often than not and a raw
non-ASCII byte in a header is a malformed response.

Bytes are **streamed** (`getStream().pipe(response)`), not buffered. The gate runs first and
storage is only touched after it returns.

Errors: 404 when the resource does not belong to `lessonId`, has no `storageKey`/`mime`/
`filename`, or is missing from the bucket. **`video` and `link` resources 404 here rather than
redirecting** — a redirect to a third-party URL from an authenticated route is an open redirect
wearing a download button.

> This replaced a 302 to the media origin. That redirect authorized once, to *mint* a URL, and
> the URL then worked forever, for anyone, with no session (`player.controller.ts:39-52`).

---

## 11. HOMEWORK — الواجب, full flow

`apps/api/src/modules/homework/**` · `packages/contracts/src/homework.ts` ·
`apps/web/components/player/lesson-homework.tsx`

### 11.1 Constants

```
MAX_HOMEWORK_IMAGES              8      the CHECK ceiling on maxImages and on one submission
DEFAULT_HOMEWORK_IMAGES          4      what a new exercise is created with
HOMEWORK_IMAGE_RETENTION_DAYS    30     un-accepted submissions' photographs are swept
MAX_UPLOAD_BYTES                 8 MiB  per image (contracts/admin/media.ts:23)
HOMEWORK_ENCODE                  { width: 1400, quality: 64 }   sharp re-encode, output WebP
HOMEWORK_PREFIX                  'hw'
```

The encode is deliberately below the platform default (1600 px @ q82): this is a picture of
handwriting, read once and then deleted. 1400 px still resolves pencil on squared paper; q64
lands at 120–200 KB against 400–700 KB.

### 11.2 `MyHomeworkSubmission` (student's own view)

```jsonc
{
  "id": "uuid",
  "status": "submitted|accepted|needs_work",
  "attempt": 1,                     // ≥1
  "imageCount": 3,                  // ≥0 — SURVIVES imagesPurged
  "imageIds": ["uuid", …],          // ids only; empty once purged
  "imagesPurged": false,
  "grade": 90,                      // number 0..100 | null
  "reviewNote": "string | null",
  "submittedAt": "ISO",
  "reviewedAt": "ISO | null"
}
```

`imageCount` + `imagesPurged` are the whole reason this is not just a status: «ما تبينوش إنها
اتمسحت». A student returning in November reads «سلّمت ٣ صور · مقبول» with the mark and note
intact, rather than an empty card that looks like the platform lost their work.

`StudentHomework` = `{ body: string, maxImages: int, submission: MyHomeworkSubmission | null }`.

### 11.3 Student endpoints — all permission `homework:submit` (self-scoped)

`@Controller('homework')`. **Route order matters** — the static `lessons/:lessonId/images` and
`lessons/:lessonId/submissions` are declared before anything that could capture them.

#### `POST /api/homework/lessons/:lessonId/images`

`multipart/form-data`, field name **`file`**, exactly one file, `limits.fileSize = 8 MiB`.
`lessonId` goes through `ParseUUIDPipe` → a non-UUID is a **400**.

Order of checks is **permission → enrolment → payload**, deliberately: the missing-file check
lives in the *service*, after the gate, so a caller with no business seeing the lecture gets the
404 rather than a 400 that tells them their request shape was fine.

Gate: `requireOpenHomework` = `access.require(userId, lessonId)` **plus** a published
`lesson_homework` row. **No published homework → 404** (not 403: an unpublished homework is one
the student has not been told about).

Returns `{ "storageKey": "hw/ab/<uuid>.webp", "sizeBytes": 148231 }`.

Failure classification the web performs on the response (mirror it):

| condition | reason | Arabic |
|---|---|---|
| HTTP 413, or message contains `too large` | `tooLarge` | `homework.tooLarge` |
| message contains `not allowed` / `unsupported` | `badType` | `homework.badType` |
| message contains `could not be processed` / `not an allowed document` | `unreadable` | `homework.badType` |
| anything else | `failed` | `homework.uploadFailed` |

#### `POST /api/homework/lessons/:lessonId/submissions`

Body, `.strict()`:

```jsonc
{ "images": [ { "storageKey": "hw/…", "sizeBytes": 148231 } ] }   // 1..8 entries
```
`storageKey` ≤255 chars; `sizeBytes` positive int. Returns `MyHomeworkSubmission`.

Server-side (`homework.service.ts` `submit`):
1. `requireOpenHomework` (404 as above).
2. `images.length > homework.maxImages` → **400 `'too many images for this homework'`**.
3. **Every key is re-`stat`'d against the bucket** — a key that is merely *shaped* right is not
   a key to anything → **400 `'image was not uploaded'`**.
4. Existing submission with `status === 'accepted'` → **400
   `'this homework has already been accepted'`**.
5. In one transaction: update-in-place (`attempt += 1`, `status='submitted'`,
   `imageCount = images.length`, `submittedAt = now`, and **`grade`, `reviewNote`, `reviewedAt`,
   `reviewedById`, `imagesPurgedAt` all cleared**, `images: { deleteMany: {} }`) or create;
   then `createMany` the new `homework_images` with `position = index`; then fan a
   `homework_submitted` notification out to everyone holding `homework:read`.
6. **After** the commit, the previous attempt's objects are deleted from the bucket.

#### `GET /api/homework/lessons/:lessonId`

Returns `StudentHomework` — **or a null body** for a lecture with no published homework
(most lectures). A Dart client must tolerate an empty 200 body here.
Gate: full `access.require` first (without it this route would hand the exercise text of any
published lecture to any signed-in account).

#### `GET /api/homework/images/:imageId`

Streams one page back to the student who uploaded it. Ownership is **in the WHERE**
(`where: { id: imageId, submission: { userId } }`) → a page belonging to someone else is a
**404**, never a 403.

Headers:
```
Content-Type: image/webp                     (always — the sharp re-encode is the only way in)
Content-Length, X-Content-Type-Options: nosniff
Cache-Control: private, no-store
Content-Security-Policy: default-src 'none'; sandbox
```

> The web deliberately uses a plain `<img src="/api/homework/images/<id>">` and **never**
> `next/image`, because the optimizer would cache a photograph of somebody's homework publicly.
> On mobile: fetch with the session, do **not** hand the URL to a CDN-backed image cache.

### 11.4 Instructor endpoints (`@Controller('admin/homework')`)

| route | permission | notes |
|---|---|---|
| `GET /api/admin/homework/pending-count` | `homework:read` | `{ "pending": 12 }` |
| `GET /api/admin/homework?filter=&courseId=&page=&perPage=` | `homework:read` | `filter ∈ pending\|accepted\|needs_work\|all`, default `pending`. `pending` maps to `status='submitted'`. Ordered `submittedAt DESC`. Returns `{ rows: AdminHomeworkRow[], rowCount }` |
| `GET /api/admin/homework/images/:imageId` | `homework:read` | no ownership filter — the permission **is** the authorization |
| `GET /api/admin/homework/:id` | `homework:read` | `AdminHomeworkDetail` |
| `POST /api/admin/homework/:id/review` | `homework:review` | **204 No Content** |

Review body (`HomeworkReviewSchema`, `.strict()`):

```jsonc
{
  "decision": "accepted" | "needs_work",
  "grade": 90,                 // number 0..100 | null (default null)
  "message": "…"               // REQUIRED, trimmed, 2..1000
}
```
Refinement: `decision !== 'accepted' ⇒ grade === null`, message
«الدرجة تتحط مع القبول بس» at `path: ['grade']`.
`message` is required because «a submission handed back with no words on it is «اعملها تاني»
with no reason, which is the one outcome that guarantees the second attempt is the same as the
first».

What `review` does, in one transaction: write the verdict; **if accepted, stamp
`imagesPurgedAt` and delete every `HomeworkImage` row**; append the message as an ordinary
`conversation_messages` row in the student's own thread (`origin: 'outreach'`, reusing the
newest non-closed one, creating one otherwise); mark the conversation
`status='answered', lastMessageAuthor='admin'`; emit a `homework_reviewed` notification.
**Then**, outside the transaction, delete the objects; then write an audit row
(`homework:accept` / `homework:return`, metadata `{decision, grade, imagesDeleted}` — the words
are deliberately not recorded); then announce.

`AdminHomeworkDetail.suggestions` = `{ accepted: string[], needsWork: string[] }`, composed
server-side from pools in `@ayman/contracts/copy/homework` **seeded on the submission id**, so
the same screen re-rendered shows the same three and the next submission shows different ones.

### 11.5 Retention sweep

`HomeworkPurgeService` — `@Cron(EVERY_DAY_AT_3AM)`, `pg_try_advisory_xact_lock` so one replica
does the work, `BATCH = 500` per run.
Deletes every `HomeworkImage` whose `submission.submittedAt < now - 30 days`, **regardless of
status** (accepted ones already have no rows), stamps `imagesPurgedAt` where null,
**never touches `imageCount`**, then deletes the objects.

Rows first, objects second, and **never inside the transaction** — a bucket delete cannot be
rolled back, so the ordering deliberately chooses "an orphaned object nobody references" over
"a permanently broken thumbnail on a student's screen".

⚠️ Backups do **not** protect these: the R2 dumps contain `homework_images` rows (keys and
sizes) but never the bytes, and the bucket is not versioned. A delete here is the last copy.

---

## 12. Screen-by-screen UI

### 12.1 Public catalog — `/courses`

Data: `GET /api/catalog/courses` (+ `?stream=`).

- **Header**: eyebrow `catalog.eyebrow` = «03 / الكورسات», h1 `catalog.title` = «الكورسات»,
  lead `catalog.subtitle` = «كل محاضرات البرمجة وعلوم الحاسب، مرتّبة بالصف والمسار»
- **Empty (`courses.length === 0`)**: `catalog.empty` = «لسه مفيش كورسات منشورة»
- **Stream filter**: options «الكل» / «عربي» / «لغات» (`stream.filterAll`, `stream.general`,
  `stream.languages`; label `stream.filterLabel` = «اعرض لـ»). ⚠️ The label for `forGeneral` is
  **«عربي», not «عام»** — «عام» is also the word for "no particular track", so a card carrying
  it beside «لغات» answered two different questions with one word.
- **Filtered to nothing**: `catalog.emptyForStream` = «مفيش كورسات للاختيار ده»
- **Card**: cover (`coverKey` → `<MEDIA_ORIGIN>/media/<key>`, fallback `YEAR <year>` mark),
  title, subtitle, `lessonCount` + `catalog.lessonCount` («محاضرة»), duration, emphasis badge,
  price rows, `catalog.free` = «مجاني».
- **Loading**: `apps/web/app/(site)/courses/loading.tsx` — skeleton grid.

### 12.2 Public course detail — `/courses/[slug]`

Data: `GET /api/catalog/courses/:slug` (404 → not-found screen, title `course.notFound` =
«الكورس ده مش موجود»).

Structure (`apps/web/app/(site)/courses/[slug]/page.tsx`):

1. **Hero**: back link `course.back` = «رجوع»; h1 = `title`; sub = `subtitle` or
   `«systemNameAr · subjectNameAr[ · trackLabelAr]»`.
2. **Aside** (0.8fr column): cover 16/10; price block or `course.freeBanner` =
   «الكورس ده مفتوح مجانًا»; subscribe button; book button; `course.lessonsLabel` = «الدروس:»
   with the section titles.
   Price rows, `{price}` already formatted EGP:
   - `course.priceMonthly` = «{price} ج / الشهر»
   - `course.priceQuarterly` = «{price} ج / ٣ شهور»
   - `course.priceYearly` = «{price} ج / السنة»
   - `course.priceTerm` = «{price} ج / {term}» — one row per open, priced term
3. **Coming-soon panel**, first in the main column, when `isComingSoon(lessonCount)`:
   title `course.comingSoonTitle` = «لسه هننزل قريبًا»; body = `course.comingSoonNote` **or**
   `course.comingSoonDefaultNote` = «إحنا لسه بنجهّز محاضرات الكورس ده. اشترك دلوقتي عشان تحجز
   مكانك، وهتلاقي كل حاجة هنا أول ما تتنزل.». Purely informational — the enroll button stays
   exactly as live as it was.
4. **Play panel**:
   - Free course → pressable cover, `course.playCta` = «تشغيل الكورس», disabled when there are
     no published lessons. Note under it: `course.startNote` = «دوسة على «تشغيل» — لو الحساب
     داخل، الفيديو بيشتغل على طول، ولو لسه هنسجّلك الأول.»
   - Priced course → **not** interactive; a padlock and `course.subscribeToWatch` =
     «اشترك في الكورس عشان تفتح المحاضرات»
   - Start/enroll button states: `course.start` = «نبدأ الكورس», `course.startPending` =
     «ثانية واحدة…», `course.startError` = «مقدرناش نفتح الكورس دلوقتي. نحاول تاني.»,
     `course.lockedError` = «الكورس ده مقفول دلوقتي. رسالة للمهندس أيمن وهيفتحه.»
   - 401 → navigate to `/login?next=…`. 403 on a **priced** course → subscribe sheet.
     403 on an unpriced closed course → `lockedError`. Any other failure → `startError`.
5. **About**: `course.about` = «عن الكورس», then `description` (rich text) or the subtitle.
6. **Outline**: `course.lessons` = «الدروس».
   - **Priced and not subscribed** → the whole list is replaced by
     `course.lessonsLockedNote` = «محتوى الدروس بيظهر بعد ما تشترك.» (listing titles
     pre-subscription also gave away that there is currently only the placeholder lecture).
   - Otherwise: one collapsible per section (first open), `«(n)»` count, then rows of
     `[kind icon] title [freePreview badge] [stream badge if narrower than the course] [duration] [action]`.
     Action verb: `course.watch` = «مشاهدة», or `course.takeQuiz` = «دخول الاختبار» for a quiz.
     ⚠️ **Duration is rendered only when non-zero** — a quiz has none, and «0 دقيقة» beside
     «دخول الاختبار» reads as a broken number.
   - `catalog.freePreview` = «معاينة مجانية».
   - Stream badge only when the lesson is **narrower** than its course; `stream.both` =
     «عربي ولغات».
   - `course.noLessons` = «لسه مفيش دروس منشورة في الكورس ده» is an **error line after a failed
     click**, not a standing state.
7. `course.lessonKind` map: `video` «فيديو», `quiz` «اختبار», `attachment` «مرفق», `text` «قراءة».

### 12.3 The lesson player — `/courses/[slug]/lessons/[lessonId]`

Data: **two parallel authenticated fetches** —
`GET /api/courses/:slug/outline` and `GET /api/lessons/:lessonId/player`
(`apps/web/app/(app)/courses/[slug]/lessons/[lessonId]/page.tsx:73-87`).

Routing decisions from the two results (do not collapse these):

| outline | player | action |
|---|---|---|
| 404 | — | **not-found screen.** Not enrolled, or no such course |
| 200 | 404 | **redirect to `/library/<slug>`** — enrolled, but the gate has not opened this lesson. That page renders the same outline with real gate states and can explain it |
| 200 | 403 | **redirect to `/courses/<slug>`** (public page) — the subscribe flow lives there and already owns this 403 |
| 200 | 200 | render |
| any other error | | the generic error boundary with a retry — **never** the not-found page. Flattening every failure into "not found" tells a student a course they are enrolled in does not exist |

**Layout** — `max-width: 1440px` (wider than the app's 1152px reading shell, on this page only,
because the main object is a 16/9 video); grid `1fr / 380px` above `lg`; column order follows
the writing mode (RTL: content starts at the inline start).

**Main column, in order:**

1. `<VideoLesson>` / text / attachment / quiz body (the video is **the first pixel of content**
   — the title used to sit above it with ~120 px of chrome, which on a phone is most of the
   first screen).
2. `<h1>` lesson title.
3. mono meta line: `«{courseTitle} · {sectionTitle}»`.
4. الواجب card (`<LessonHomework>`) when `payload.homework != null` — main column, full width,
   coloured band. «لو في واجب قولي واجب، يبقى أظهره بشكل كويس وكبير.»
5. Attached quiz card when `lesson.kind !== 'quiz' && payload.quiz != null`.
6. `<LessonMaterials>` when `kind !== 'attachment' && resources.length > 0` — **closed by
   default** (an embedded PDF viewer under every video is a page nobody asked for).
7. The completion hint paragraph (one of three, §12.3.4).
8. `saveFailed` line: `player.saveFailed` = «مقدرناش نسجّل تقدّمك دلوقتي».
9. `<LessonNav>`.

**Sidebar column:** `<CourseOutlineSidebar>`, then `<CourseGroupCard>` (renders nothing when
`whatsappGroupUrl` is null), then `<CourseHelpCard>`.
⚠️ There is deliberately **no course-details card** here any more: «أنا خلاص دخلت واشتركت في
الكورس، مش عايز المعلومات بتاعت الكورس — عايز الحاجات الخاصة بالمحاضرة بس».

#### 12.3.1 Video states

| state | UI |
|---|---|
| **poster (not activated)** | `bg-surface-2`; poster image at full opacity with a `bg-black/45` scrim over it (fading the artwork made both the picture *and* the contrast worse); an 80/96 px filled accent disc with a play glyph; the words `player.play` = «تشغيل الفيديو»; then **either** the resume row **or** the total duration |
| **resume offered** (`resumeSeconds > 0`) | `player.resumeFrom` = «أكمل من» + `formatDuration(resumeSeconds)` in a monospace tabular span, + a «من الأول» button (`player.restart`). The resume line **replaces** the duration; there is not room for both on a 360 px phone |
| **playing (mirror)** | native `<video>`/player with full controls, `playsInline`, `autoPlay`, poster |
| **playing (YouTube)** | IFrame API player; `playVideo()` is called from `onReady` — **constructing a player does not start one**, and without this the student presses one play button and is handed another |
| **plain-iframe fallback** | note under the player: `player.videoFallbackNote` = «النت عندك كان مانع المشغّل بتاعنا، فشغّلناه بطريقة تانية. الدرس مش هيتسجّل لوحده — دوس «خلاص · التالي» لما تخلّص.» + link `player.videoOpenOnYouTube` = «افتحه على يوتيوب» |
| **failed** | overlay `role="status"` with the mapped sentence + the YouTube link |
| **no `lesson_videos` row** | `player.videoMissing` = «المحاضرة دي لسه مافيهاش فيديو.» in a 16/9 box — the rest of the lesson (materials, completion control) stays working |

Failure copy:
- `player.videoUnavailable` = «الفيديو مش متاح دلوقتي»
- `player.videoEmbedBlocked` = «الفيديو ده مش مسموح يتشغّل جوه المنصة. افتحه على يوتيوب.»
- `player.videoRemoved` = «الفيديو ده مش موجود على يوتيوب دلوقتي. ولو فضلت المشكلة، كلمة للمدرّس.»

**Resume maths** (`video-lesson.tsx` `resumePoint`):
```
point = floor(maxPositionSeconds) - 5
point <= 0                                   → 0
durationSeconds > 0 && point >= duration     → 0     (stale: the instructor swapped in a shorter cut)
otherwise                                    → point
```
A **completed** lesson passes `resumeAt = 0` — reopening a lesson you already finished is
rewatching it, and dropping someone twenty seconds from the end is the opposite of helpful.
⚠️ Read the resume from the value the page was **rendered** with, not from the post-`open`
state: the `open` response replaces it, and reading the mutable state inside the play handler is
a race between a network round trip and a human finger.

#### 12.3.2 Outline sidebar

Header: `player.outline` = «محتوى الكورس»; a progress bar labelled `player.courseProgress` =
«تقدّمك في الكورس» (**amber, never green** — green/red are load-bearing for quiz correctness);
then `«{completedLessons} {player.lessonsCompleted} {totalLessons}»` where
`player.lessonsCompleted` = «درس خلص من». Then «اطلب الكتاب» when the course has a book.

Body: sections numbered `01, 02…` with the section title; inside each, lessons **grouped into
entries** — a non-exam quiz belongs to the **nearest lecture before it in the same section**
(adjacency, the same relationship `resolveGate` uses). An entry with quizzes collapses
(`<details>`, open when it contains the active lesson); an entry with none stays a plain row.

Row: kind icon, title, meta line, one chip. The **row itself is never a link** — exactly one
control per row, or every lesson lands twice in the tab order.

Meta line joins with ` · `: `library.lessonQuiz` («كويز المحاضرة») when nested,
`library.exam` («الامتحان النهائي») when `isExam`, the formatted `estimatedSeconds`, and the
state word.

State words (`lib/course-outline.ts` `lessonStateMark` / `lessonStateLabel`):

| mark | condition | copy |
|---|---|---|
| `done` | `isLessonFinished` | `library.lessonDone` = «خلصت» |
| `started` | `state === 'in_progress'` | `library.lessonStarted` = «لسه ما خلصتهاش» |
| `new` (non-quiz) | otherwise | `library.lessonNew` = «لسه ماشوفتهاش» |
| `new` (quiz) | otherwise | `library.lessonQuizNew` = «لسه ما امتحنتش» |

```ts
isLessonFinished(l) =
  l.gate === 'cleared' || l.state === 'completed' || l.state === 'passed'
  || (l.kind === 'quiz' && !l.isExam && l.state === 'failed')
```
The last clause is why a **failed lecture quiz ticks**: a lecture quiz allows exactly one
sitting, so once sat there is nothing left to do but read the result — «أنا امتحنت أصلاً ومعايا
الدرجة، يبقى عليها علامة صح». **The exam is excluded** because it can still offer an
improvement sitting. ⚠️ This is presentation only; `clearedLessons` and the progress bar still
count `cleared`.

Chip label: `library.review` = «مراجعة» when `gate === 'cleared'`; else `library.watch` =
«مشاهدة» for a non-quiz; else `library.quizDone` = «نتيجتك» when
`state ∈ {passed, failed}`; else `library.takeQuiz` = «دخول الامتحان».

**Locked row** (only ever the exam): a `lesson-row--locked` with a `<LockedExam>` control that
opens a dialog:
- title `library.lockedExamTitle` = «الامتحان النهائي لسه مقفول»
- body `library.lockedExamBody` = «بيفتح لما كل محاضرات الكورس تخلص — باقي {remaining} من {total}.»
  (fallback `library.lockedExamBodyPlain` = «بيفتح لما كل محاضرات الكورس تخلص.»)
- `library.lockedExamLeftTitle` = «المحاضرات اللي لسه فاضلة:» + the list, capped at 8 with
  `library.lockedExamLeftMore` = «و{n} محاضرة كمان في الفهرس تحت.»
- one dismiss, `library.lockedClose` = «تمام». ⚠️ The dialog's X must **not** also be named
  «تمام» — two controls with one accessible name in one dialog is ambiguous.
- `remaining = max(0, totalLessons - completedLessons)`; the named list is
  `remainingLectures(flat lessons)` which **skips quizzes before the counter** so an orphan quiz
  cannot shift every lecture number after it.

The panel scrolls itself to the current row on mount (`max-h-[60dvh]`, `lg:sticky top-6`).

Sidebar cards:
- `player.group` — title «جروب الدفعة», lead «جروب الواتساب الخاص بطلبة الكورس ده — الأسئلة
  والتنبيهات بينزلوا فيه.», cta «دخول الجروب». Renders nothing when null.
- `player.help` — title «تحتاج مساعدة؟», lead «لو عندك سؤال عن الكورس ده، ابعتله على واتساب.»,
  cta «واتساب». Renders nothing when the number is unset.

#### 12.3.3 Materials / resources

Disclosure button: `player.materials` = «مواد المحاضرة» + `«{n} {player.materialsCount}»`
where `materialsCount` = «حاجات مرفوعة».

`<ResourceList>` per resource:
- heading = `title`; `player.mainPresentation` = «البريزنتيشن الأساسي» chip on a `presentation`
- `description` under it when non-null
- **video** → YouTube frame rebuilt from `youtubeId`
- **link** → if the URL parses as YouTube → embed + `player.openInNewTab` = «فتح في تبويب جديد»;
  else if it parses as Google Drive (`extractDriveFileId` → `driveEmbedUrl`, `/preview`) →
  embed + the same link; else an external-link card showing the **hostname** so the destination
  is legible before the tap. Recognition happens at **render**, not at save, so it covers rows
  written before the feature shipped.
- **file** → `<DocumentViewer>`: a card with an icon, the title, and
  `player.openDocument` = «دوسة عشان يتفتح» / `player.closeDocument` = «دوسة عشان يتقفل»;
  a separate download control labelled `player.download` = «تحميل المحاضرة»
  (⚠️ it says «المحاضرة» deliberately — every document under a lesson *is* the lecture's
  material). Opening embeds `viewPath` in a frame of `min(42rem, 70dvh)`.
- empty → `player.noResources` = «مفيش مواد مرفوعة للدرس ده.»
- `player.viewerUnavailable` = «المتصفح مش قادر يعرض الملف — التحميل بيفتحه.»

⚠️ The storage **filename is never shown** — multer decodes the multipart filename as latin1, so
an Arabic upload renders as «Ø£Ø³Ø§Ø³ÙØ§Øª…». The instructor's `title` is what is displayed.

#### 12.3.4 Completion controls

The hint paragraph, exactly one of three:

```
lesson.kind === 'quiz'        → player.quizAutoCompleteHint
                                «الدرس ده بيتقفل لوحده مع النجاح في الاختبار.»
autoCompleteAvailable         → player.autoCompleteHint
                                «الدرس بيتقفل لوحده لما توصل لآخر الفيديو وتكون شُفت معظمه.»
otherwise                     → player.manualOnlyHint
                                «مدة الفيديو مش متسجّلة، فدوسة على «الدرس خلص» في الآخر.»
```

`<LessonNav>`:
- previous link `player.previous` = «الدرس السابق»; next link `player.next` = «الدرس التالي»
- finish button, **hidden entirely when `kind === 'quiz'`** (and the server refuses it too):
  - idle with a next lesson → `player.markComplete` = «خلاص · التالي»
  - idle on the last lesson → `player.markCompleteFinal` = «الدرس خلص»
  - in flight → `player.marking` = «بنسجّل…»
  - already complete → disabled, check glyph, `player.completed` = «تم»
- **On success it navigates to the next lesson immediately** — "finish · next" is one gesture.
- **On failure it must NOT navigate**, and must show `player.markFailed` =
  «ماتسجّلش إن الدرس خلص. تأكيد على النت ودوسة تانية.» directly under the button
  (`role="alert"`). Advancing after a failed write is what makes the gap invisible: the student
  ends up further along with a hole they only find weeks later when the course will not reach
  100 %.

Other progress words: `player.completed` «تم», `player.inProgress` «شغّال», `player.notStarted` «لسه».

#### 12.3.5 Quiz card (`<QuizLesson>`)

Reads `progress` off the player payload — no second request.
`sat = state ∈ {passed, failed}`; `percent = round(completion * 100)`.

| variant | not sat | sat |
|---|---|---|
| `exam` (`kind === 'quiz'`) | `player.quizIntro` «الدرس ده اختبار — نبدأه في أي وقت.» + cta `player.quizCta` «نبدأ الاختبار» | `player.quizYourScore` «درجتك في الاختبار» + the % + (pass verdict) + `player.quizPassedNote` «نجحت، والدرس اتقفل.» / `player.quizFailedNote` «مراجعة الإجابات والدخول تاني ممكنين طول ما الاختبار مفتوح.» + cta `player.quizOpenCta` «فتح الاختبار» |
| `attached` (a quiz on a non-quiz lesson) | `player.quizAttachedIntro` «في كويز قصير على المحاضرة دي.» + cta `player.quizAttachedCta` «حلّ الكويز» | … + `player.quizAttachedPassedNote` «نجحت في الكويز.» + cta `player.quizAttachedOpenCta` «فتح الكويز» |

`player.quizNotSatYet` = «لسه مدخلتش الاختبار.» exists for the not-sat case elsewhere.
Route: `/quizzes/<lessonId>` (`quizHref`).
Only the **pass** verdict is rendered — «محتاج تحاول تاني» in red is a label on the student
rather than information for them.

#### 12.3.6 Homework card

Three states in one component (`lesson-homework.tsx`):

- header band: icon + `homework.title` = «واجب المحاضرة» + a status chip when a submission
  exists
- `homework.lead` = «المطلوب في الواجب ده:» then `body` rendered with **preserved newlines,
  never as markup**
- **nothing handed in** → upload box: `homework.uploadTitle` = «رفع صور الحل»,
  `homework.uploadHint` = «صوّر ورقة الحل ودوس هنا — لحد {max} صورة.»,
  `homework.pick` = «اختيار الصور» (busy: `homework.uploading` = «بنرفع…»),
  `homework.submit` = «تسليم الواجب» (busy: `homework.submitting` = «بنسلّم…»),
  staged thumbnails with `homework.remove` = «شيل الصورة», counter `«{n} {homework.imageUnit}»`
  where `imageUnit` = «صورة»
- **submitted, waiting** → chip `homework.statusPending` = «الواجب اتسلّم — مستني مراجعة مهندس
  أيمن»; the pages; **no upload box** (a second upload would replace pages he may already be
  looking at)
- **accepted** → chip `homework.statusAccepted` = «الواجب اتقبل»; **no upload box** (the API
  refuses a resubmission); images are gone → `homework.imagesGone` = «الصور اتشالت بعد المراجعة،
  والتسليم متسجّل.»
- **needs_work** → chip `homework.statusNeedsWork` = «الواجب محتاج شغل تاني»; banner
  `homework.reopened` = «الواجب مفتوح تاني — رفع الحل الجديد من هنا.»; the upload box **open**,
  submit button relabelled `homework.resubmit` = «تسليم الحل من تاني»
- verdict block: `«{homework.submittedCount}»` = «اتسلّم {n} صورة» (+ `« · {homework.attempt} {n}»`
  = «المحاولة» from attempt 2 onward); the pages; then when `reviewNote` is set,
  `homework.note` = «رد مهندس أيمن» + the note (newlines preserved) + when `grade != null`,
  `homework.grade` = «الدرجة {grade} من ١٠٠»
- errors: `homework.tooMany` = «الحد الأقصى {max} صورة للواجب ده.»,
  `homework.tooLarge` = «الصورة كبيرة أوي — أقصى حجم ٨ ميجا للصورة.»,
  `homework.badType` = «ده مش ملف صورة. الصور بس (JPG أو PNG أو WebP).»,
  `homework.uploadFailed` = «مقدرناش نرفع الصورة. نجرّب تاني.»,
  `homework.submitFailed` = «مقدرناش نسلّم الواجب دلوقتي. نجرّب تاني.»,
  `homework.empty` = «لازم صورة واحدة على الأقل للحل.»
- `homework.badge` = «واجب» — the compact chip in an outline

> **Gender rule, non-negotiable.** The platform never asks whether the student is a boy or a
> girl, so every imperative is banned («ارفع» / «سلّمت» grow a ي in the feminine). Copy uses
> nominal sentences («رفع الصور»), the passive («الواجب اتسلّم»), the inclusive plural, and the
> ـك suffix on a **noun** («حلّك», «واجبك»). Same rule in
> `library.lessonNew`/`lessonQuizNew`/`quizDone`. Do not "fix" any of these strings into
> imperatives on mobile.

### 12.4 Text and attachment lessons

- **Text**: render `payload.text.bodyHtml`. It is sanitize-html output on write **and** a second
  DOMPurify pass server-side on read. Styling on web: `h2` → title-3 semibold, `h3` → title-4
  medium, `p` → muted, `ul`/`ol` → discs/decimals with `padding-inline-start: 1.25rem`,
  max width `--w-prose`. Dwell timer starts unless already complete.
- **Attachment**: `<ResourceList>` + the dwell timer. Every other kind renders materials
  **without** a timer — a video lesson completes by earning its thresholds, not by having slides
  underneath it.

Dwell client behaviour (`use-dwell-complete.ts`): wait 5000 ms → `POST …/dwell`; if the response
still has `completedAt === null`, wait another 5000 ms and ask again; failures are silent
(the manual button is always available). Firing early, or a hundred times, cannot complete a
lesson faster than five real seconds — the server measures from its own `firstOpenedAt`.

### 12.5 Learning path — `/path`

Data: `GET /api/me/path`, permission `enrollment:read`
(`apps/api/src/modules/dashboard/dashboard.controller.ts:29-30`, `path.service.ts`).

`LearningPath` (`contracts/path.ts`):

```jsonc
{
  "courses": [ {
      "id","slug","title","subjectNameAr",
      "coverKey": "string | null",
      "published": true,
      "progressPercent": 40,
      "clearedLessons": 2, "totalLessons": 5,     // LECTURES only
      "contentComplete": false,
      "whatsappGroupUrl": "https://… | null",
      "nextLessonId": "uuid | null",
      "nodes": [ { "id","lessonId","title","kind","state","gate","isExam" } ]
  } ],
  "currentCourseId": "uuid | null",
  "clearedLessons": 7, "totalLessons": 20,
  "percent": 35
}
```

- Courses ordered `enrolledAt ASC, id ASC`; nodes are the course flattened in reading order.
- **An attached quiz gets its own node** with its own `id` (the quiz id) but `lessonId` pointing
  at the **host lesson** — there is no separate page for it to open. Its `state` is computed
  from `QuizAttempt` rows, **not** from `lesson_progress`: a lecture watched in full and then
  failed on its attached quiz still reads `completed` in the progress row.
  `attachedQuizState`: any `passed === true` → `passed`; any `submittedAt != null` → `failed`;
  any `state === 'in_progress'` → `in_progress`; else `not_started`.
- `percent` is **cleared ÷ total across every enrolled course**, not the mean of the per-course
  percentages.
- `published: false` = the instructor has taken the course down (usually for minutes, to edit).
  `nextLessonId` is forced to `null` and the UI must **stop linking**:
  `path.closedBadge` = «مقفول مؤقتاً», dialog title `path.closedTitle` = «الكورس ده مقفول مؤقتاً»,
  body `path.closedBody` = «م. أيمن بيعدّل فيه دلوقتي، فمقفول للحظات. تقدمك ودرجاتك كلها محفوظة،
  وأول ما يخلص هيفتح لوحده — مش محتاج تعمل حاجة.», dismiss `path.closedClose` = «تمام».
  ⚠️ «مؤقتاً» is doing real work: a bare «مقفول» reads as the same thing a locked lesson says.

Copy: `path.eyebrow` «02 / مساري», `path.title` «مسارك التعليمي»,
`path.subtitle` «كل كورس مفتوح لك، بالترتيب اللي هتذاكر بيه.»,
`path.summary` «{cleared} من {total} محاضرة في {courses} كورس»,
`path.percentComplete` «خلصت {percent}%», `path.startHere` «نبدأ من هنا»,
`path.courses` «الكورسات», `path.courseIndex` «الكورس {n}»,
`path.empty` «لسه مافيش أي كورس في القايمة.», `path.emptyCta` «الكورسات المتاحة»,
`path.done` «خلصت», `path.locked` «مقفول», `path.exam` «الامتحان النهائي»,
`path.courseDone` «الكورس خلص», `path.courseUpToDate` «خلّصت اللي نزل»,
`path.nothingOpen` «مفيش حاجة مفتوحة دلوقتي».

⚠️ **`courseDone` vs `courseUpToDate`**: «خلصت الكورس» may only be said when
`contentComplete === true`. `totalLessons` counts what has been *published so far*, so a student
who watched the one lecture of a course still being recorded was being told they had graduated.
Same pair in `library.courseDone` / `library.courseUpToDate`.

### 12.6 Activity feed — `GET /api/me/activity`

Permission `progress:read`. Query `?cursor=<ISO>&limit=<1..50>` (default 20, max 50; a
non-numeric limit falls back to the default rather than 500-ing).

`ActivityFeed` = `{ entries: ActivityEntry[], nextCursor: string | null }`, a **discriminated
union on `kind`**:

```jsonc
// shared: id, occurredAt (ISO), lessonId, lessonTitle, courseTitle, courseSlug
{ "kind": "watched",   "secondsWatched": 720 }
{ "kind": "completed", "completedVia": "auto|manual|dwell|null" }
{ "kind": "quiz", "attemptId": "uuid", "attemptNo": 1, "scorePercent": 82, "passed": true|false|null }
```

Three bounded reads (`lesson_view_sessions`, `lesson_progress` where `completedAt != null`,
`quiz_attempts` where `submittedAt != null`), each `take = limit + 1`, merged in memory and
sorted `occurredAt DESC` with a tie-break on `` `${kind}:${id}` `` — **without the tie-break a
lesson completed by the same heartbeat that closed its sitting (the common case) can order
differently between two requests and a page boundary drops or repeats a row.**

`nextCursor` = the last returned row's `occurredAt`; the next page asks for strictly older rows.
An unparseable cursor is a **400 `'cursor is not a valid timestamp'`** — an `Invalid Date`
would silently render an empty feed that looks like "you have never done anything".

`id` is unique **within a kind**, not globally — `kind` must be part of the list key.
For a `completed` entry, `id` is the **lessonId** (`lesson_progress` has no surrogate id).

---

## 13. Downloads / offline — what exists today

**Nothing.** Stated explicitly in `apps/web/public/sw.js:26-30`:

> "That is a real cost: this app does not work offline. Opening it on the underground shows the
> offline page, not yesterday's lesson. Offline reading of course content is a genuine feature
> worth building, but it needs the content deliberately exported per signed-in student, not a
> cache that silently keeps whatever the last request happened to return."

The service worker exists only to satisfy Chrome's install criterion. It caches **content-
addressed static assets, one offline page and one icon**, and:

- **No HTML is ever written to the cache. Not one page.**
- **No `/api/*` response is ever written to the cache.**

Reason: the Cache API is not partitioned by cookie and does not expire when a session does, and
a phone gets handed around — caching `/dashboard` would let the next person read the previous
student's progress, offline, after a sign-out.

The only "download" in the product is `GET /api/lessons/:lessonId/resources/:resourceId/download`
— a `Content-Disposition: attachment` stream of a **document/presentation**, with
`Cache-Control: private, no-store`. **There is no video download of any kind.**

### What a mobile "download for offline" feature would need

1. **A server decision about video.** The mirror's HLS objects are public and immutable, so an
   app *could* download them today — but that also means anyone with the URL can. Offline video
   needs either (a) an accepted decision that mirrored HLS is public (it already is), or
   (b) signed/expiring URLs or DRM, which do not exist and would require a new endpoint.
2. **An entitlement re-check on open.** Access today is re-derived on **every request**
   (grant validity, term grants, the exam gate). An offline package is a snapshot; the app must
   re-validate on next connectivity and expire content when `AccessGrant.validUntil` passes or a
   grant is revoked. `EnrolledCourse.subscriptionValidUntil` (`contracts/progress.ts:517-523`)
   is the field that exists for this.
3. **A manifest endpoint.** There is nothing that enumerates "everything this lesson needs".
   The client would have to walk `player` + each `PlayerResource.downloadPath` + the HLS
   playlist.
4. **Offline progress queueing.** The heartbeat's anti-cheat clamps `delta` against the
   **server-measured gap since the last heartbeat on that row**
   (`allowedHeartbeatSeconds`). A batch of 240 queued heartbeats replayed on reconnect would be
   granted ~2 seconds each, not 10 — so **an offline watch would be almost entirely discarded**.
   Offline progress needs a new endpoint with its own trust model, not a replay of this one.
5. **Homework images** are `private, no-store` by design and must not be persisted offline.

---

## 14. Admin surface touching this area (for completeness)

`@Controller('admin')` — `apps/api/src/modules/content/lesson.controller.ts`. All under
`lesson:write` unless noted.

```
GET    /api/admin/lessons/video-duration
PATCH  /api/admin/sections/:sectionId/lessons/order      (lesson:reorder)
POST   /api/admin/sections/:sectionId/lessons
PATCH  /api/admin/lessons/:id
DELETE /api/admin/lessons/:id
PUT    /api/admin/lessons/:id/video
DELETE /api/admin/lessons/:id/video
POST   /api/admin/lessons/:id/video/mirror               → { lessonId, mirrorStatus }
PUT    /api/admin/lessons/:id/text
PUT    /api/admin/lessons/:id/homework
DELETE /api/admin/lessons/:id/homework
PATCH  /api/admin/lessons/:id/resources/order            (lesson:reorder)
POST   /api/admin/lessons/:id/resources
PATCH  /api/admin/resources/:id
DELETE /api/admin/resources/:id
```

`PUT …/video` body → `LessonVideoInputSchema`: `{ provider, url, durationSeconds?, posterKey? }`,
`.strict()`, transformed to `{ provider: 'youtube', externalId, durationSeconds|null, posterKey }`.
Duration resolution order: **stated → the stored duration when `externalId` is unchanged →
ask YouTube**. If all three fail → **422** with `copy.admin.lesson.durationUnavailable`
(«422, not 500: nothing is broken here — this particular video would not say»).

Reorder body: `{ orderedIds: uuid[] }`, 1..500, no duplicates
(«فيه عنصر متكرر في الترتيب») — **the whole ordered array in one request**, never a delta and
never one request per row.

---

## 15. Ordering & pagination — the complete list

| list | order | pagination |
|---|---|---|
| catalog courses | `position ASC, publishedAt DESC, id ASC` | **none** (`total === courses.length`) |
| catalog sections | `position ASC, id ASC` | none |
| catalog / outline lessons | `position ASC, id ASC` | none |
| catalog terms | `position ASC, id ASC` (only `isOpen && priceCents != null`) | none |
| outline sections | `position ASC, id ASC` | none |
| player neighbours (`orderedLessons`) | `section.position ASC, position ASC, id ASC` | n/a |
| gate lesson list | **identical tuple** to the above | n/a |
| enrollment's first lesson | `section.position ASC, section.id ASC, position ASC, id ASC` | n/a |
| `GET /api/enrollments` | `enrolledAt DESC, id DESC` | none |
| path courses | `enrolledAt ASC, id ASC` | none |
| player resources | `position ASC, id ASC` | none |
| homework images | `position ASC, id ASC` | none |
| activity feed | `occurredAt DESC`, tie-break `` `${kind}:${id}` `` DESC | **timestamp cursor**, `limit` 1..50 (default 20) |
| admin homework queue | `submittedAt DESC` | `page`/`perPage` offset |

**Every ordering is `<field>, id` — never index-based, never a CSV sequence column.** `id` is
`uuid(7)`, so it is chronological and a stable tie-break.

---

## 16. Error → UI mapping (one table)

| status / body | where | what the UI does |
|---|---|---|
| **401** | any authed route | send to login with a `next=` back to here |
| **404** `lesson not found` | player, open, dwell, complete, heartbeat, resources, homework | outline present → go to `/library/<slug>` (the gate can be explained there); outline absent → not-found screen |
| **404** `course not found` | outline | not-found screen |
| **404** (no published homework) | homework upload / submit | render no homework card at all |
| **403** `expired` / `revoked` / `not_yet_valid` / `needs_term_grant` | player, open, dwell, complete, heartbeat, resources, homework | send to the public course page; its subscribe flow owns this branch |
| **403** `no_grant` / `needs_course_grant` | **enroll only** | priced → subscribe sheet; unpriced → `course.lockedError` |
| **403** `CSRF: …` | any POST | a client bug — you did not send `x-csrf-token` |
| **400** `heartbeats are only accepted for video lessons` | heartbeat | do not start the heartbeat loop for non-video kinds |
| **400** `this lesson kind is not completed by dwelling` | dwell | do not start the dwell timer outside `text`/`attachment` |
| **400** `A quiz lesson is completed by passing its quiz.` | complete | hide the finish button when `kind === 'quiz'` |
| **400** `too many images for this homework` | homework submit | `homework.tooMany` |
| **400** `image was not uploaded` | homework submit | `homework.submitFailed`; re-upload |
| **400** `this homework has already been accepted` | homework submit | should be unreachable — hide the upload box on `accepted` |
| **400** (zod, `.strict()`) | any body | a client bug: you sent an extra key |
| **413** | homework image upload | `homework.tooLarge` |
| **422** | admin `PUT …/video` | «مدة الفيديو…» — admin-only |
| **429** | anything | back off; **never** show a not-found page (a 429 flattened into "not found" was a real bug — `page.tsx:14-27`) |
| **5xx / network** | player fetches | generic error screen **with a retry**; never the not-found screen |
| heartbeat POST rejects | client | keep the un-flushed delta (restore it, capped at 15), set `saveFailed`, show `player.saveFailed`, keep playing |
| complete POST rejects | client | **do not navigate**, show `player.markFailed` under the button |
| dwell POST rejects | client | silent; the manual button remains |
| `open` POST rejects | client | silent — the lesson is still watchable, progress just is not recorded yet |

---

## 17. Flutter implementation checklist

1. **HTTP**: cookie jar for the better-auth session; `x-csrf-token: <non-empty>` on every
   POST; do **not** send `Origin`.
2. **Two fetches per lesson page**, in parallel: outline + player. Apply the routing table in
   §12.3.
3. **`POST …/open` on mount, every kind.** It is what writes `lastLessonId`.
4. **Video**: mirror-first HLS, YouTube-second. One `PlayerAdapter` exposing
   `currentTime / state / duration`, shared by both.
5. **Heartbeat loop**: 1 s tick, accumulate `advance` only while PLAYING and only when
   `0 < advance <= 2`; flush every 10 ticks and on backgrounding
   (`WidgetsBindingObserver.didChangeAppLifecycleState → paused`); clear the accumulator
   optimistically and restore it (capped at 15) on failure; never send more than `delta = 15`.
6. **Never compute completion locally as truth.** Mirror `justCompleted` and
   `courseProgressPercent` from the response.
7. **Dwell** only for `text`/`attachment`, 5 s + retry-on-"not yet".
8. **Manual complete** hidden for `kind === 'quiz'`; navigate on success only.
9. **Resources**: `viewPath`/`downloadPath` are relative — prefix the API origin and send the
   session. Do not put them through a public image/file cache.
10. **Homework**: upload per page (multipart, field `file`) → collect `{storageKey, sizeBytes}`
    → one submit. Never post the bytes and the submission together.
11. **Copy**: pull every Arabic string from `@ayman/contracts/copy` (`packages/contracts/src/copy/ar.ts`)
    rather than retyping — and preserve the no-imperative rule.
12. **Numbers**: `formatDuration` is `H:MM:SS` above an hour, else `M:SS`, **Western digits**;
    `formatRemaining` rounds **up** to the next whole minute (61 s remaining reads «2:00»).
13. **Colour**: progress is **amber**, never green — green and red are reserved for quiz
    correctness (Global Constraint 10).

---

## 18. Mobile gaps — concrete backend/product work required

1. **CSRF is browser-shaped.** `CsrfGuard` demands `x-csrf-token` on every state-changing
   request. A native client can satisfy it with a dummy value, which means the control does
   nothing for mobile. Decide: exempt native clients, or issue a real token at sign-in and make
   the guard a genuine double-submit check.
2. **No token auth.** Everything is a cookie session (better-auth). Flutter must run a cookie
   jar and persist it across launches; there is no refresh-token endpoint in this area.
3. **No offline anything.** No download manifest, no offline progress endpoint, and the
   heartbeat's wall-clock clamp would discard almost all replayed offline watch time
   (§13.4). Offline needs a new, separately-trusted ingest route.
4. **Mirror URLs are unauthenticated and permanently cacheable.** Fine for the web player;
   it means an offline video feature ships public URLs unless signed URLs are added.
5. **YouTube fallback needs a WebView on mobile.** There is no mp4/HLS for a video whose
   `mirrorStatus != 'ready'`, so a lesson without a mirror can only be played through the
   YouTube IFrame in a WebView. Either accept that, or make the mirror a **hard requirement**
   before a video lesson may be published (today `pending`/`failed` are normal states).
6. **`durationSeconds` may be 0**, which disables auto-completion entirely
   (`autoCompleteAvailable = false`). Mobile must render the manual path, not a broken scrubber.
7. **`LessonText.bodyHtml` is HTML.** There is no markdown or structured alternative. Mobile
   needs either an HTML renderer with an allowlist matching `sanitizeRichText`, or a new
   server-side representation.
8. **`CompletionMode` is dead weight on the wire model** — it is stored and validated but never
   read. Either implement it or stop shipping it in admin DTOs; do not let a mobile client
   branch on it.
9. **The outline's `completedLessons`/`totalLessons` count quizzes**, while
   `progressPercent`, `CatalogCourse.lessonCount` and `PathCourse.totalLessons` do not. Three
   numbers on one screen that are computed over two different sets. Worth normalising server-
   side before a second client reproduces the inconsistency.
10. **No pagination on the catalog.** `GET /api/catalog/courses` returns every published course
    in one response. At ~86 courses the built page is already 326 KB. A mobile list should get a
    paginated variant before the catalog grows.
11. **`GET /api/homework/lessons/:id` returns a null body.** Some Dart HTTP/JSON layers treat an
    empty 200 body as a parse error. Consider `204` or `{"homework": null}`.
12. **Rate limits are per session**, and the heartbeat's 15/min leaves little room for a mobile
    client that remounts on every lifecycle change. Audit before shipping.
13. **`GET /api/admin/homework/:id/review` returns 204** — a client that parses the body
    throws *after* the student has already been marked and told.
14. **Push/notifications for `course_completed`, `homework_reviewed` and `homework_submitted`**
    are emitted server-side and delivered through the web push subscription. Mobile needs FCM/APNs
    wiring; nothing in this area does that today.
