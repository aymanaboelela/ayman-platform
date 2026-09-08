# Notifications — mobile spec (in-app + push)

Everything a Flutter engineer needs to rebuild the notifications feature of
منصة أيمن أبو العلا, without reading the web code.

Every non-obvious claim cites a repo-relative path. Arabic strings are quoted
**verbatim** — they are the only copy the app may show; never invent, translate
or re-word them.

---

## 0. Ground rules that shape everything below

1. **The API never sends prose.** A notification row on the wire carries a
   `kind` discriminator plus ids/numbers, never a rendered Arabic sentence.
   The client composes the sentence from `kind` + a copy table.
   (`packages/contracts/src/notifications.ts` header; `apps/api/prisma/schema.prisma`
   model `Notification`: *"There is no `message` column, on purpose."*)
   → **Flutter must ship its own copy of the copy table** (section 3) and its own
   `describeNotification` (section 6).

2. **Titles are resolved at READ time**, not stored. A lesson/course/book renamed
   after the notification was written reads with its NEW name.
   (`apps/api/src/modules/notifications/notifications.service.ts` — `toEntry`,
   batched `lesson`/`course`/`bookOrderItem`/`user` lookups.)
   → The client must not cache a rendered string; re-render from the entry each time.

3. **Unknown kinds must not crash.** The API drops rows it cannot render; the
   client must skip a `kind` it does not know rather than throwing.
   (`toEntry` `default: return null`; `notification-stream.tsx` `if (!parsed.success) return;`)

4. **All text is Arabic, RTL.** OS notifications are raised with `lang: 'ar'`,
   `dir: 'rtl'` (`apps/web/public/sw.js`, `apps/web/components/notifications/notification-stream.tsx`).

5. **API base + auth.** Nest global prefix is `api`
   (`apps/api/src/main.ts:32` — `app.setGlobalPrefix('api')`), the controller is
   `@Controller('me')`, so every route below is `/api/me/…`.
   Auth is the better-auth **session cookie** (same-origin). All state-changing
   requests require the CSRF header `x-csrf-token`
   (`apps/web/lib/csrf.ts:17` — `export const CSRF_HEADER = 'x-csrf-token';`).

6. **Error envelope** for every failure
   (`apps/api/src/common/filters/all-exceptions.filter.ts:66-71`):
   ```json
   { "statusCode": 400, "message": "…", "requestId": "…", "timestamp": "2026-09-08T10:00:00.000Z" }
   ```

7. **Rate limits** (global, `apps/api/src/app.module.ts:86-118`), keyed on the
   session cookie hash, not IP:
   | name | window | limit |
   |---|---|---|
   | short | 1 s | 10 |
   | medium | 60 s | 60 |
   | long | 3600 s | 1000 |
   | ip | 60 s | 1200 |

   Exceeding any of them returns **429**. A mobile client that polls the unread
   count aggressively will burn the `medium` bucket — see section 8.

---

## 1. Data model

### 1.1 `Notification` (table `app.notifications`)

`apps/api/prisma/schema.prisma:3318-3339`

| Prisma field | column | type | notes |
|---|---|---|---|
| `id` | `id` | `uuid` (v7), PK | **uuid7 ⇒ time-ordered**; this is why it works as a pagination cursor |
| `userId` | `user_id` | `text`, FK → `app.users.id` `ON DELETE CASCADE` | the SUBJECT (who is told), never the actor |
| `kind` | `kind` | enum `app.notification_kind` | see 1.3 |
| `payload` | `payload` | `jsonb`, default `{}` | ids + numbers only, no prose |
| `readAt` | `read_at` | `timestamp(3)` **nullable** | `null` ⇒ unread. Nullable rather than a boolean so it records *when* |
| `createdAt` | `created_at` | `timestamp(3)` default `now()` | |

Indexes: `(user_id, created_at DESC)` for the list; `(user_id, read_at)` for the badge count.

> The model note is explicit that this table is **in-app only** — no delivery
> column, no provider, no retry state, no per-channel status. *"A row appearing
> here IS the notification."* Push is a separate, best-effort side effect.

> Also explicit: anything that **fans out to every student** ("a new course was
> published") is deliberately absent — write amplification + a mark-all-read
> problem. Do not assume broadcast notifications exist.

### 1.2 `PushSubscription` (table `app.push_subscriptions`)

`apps/api/prisma/schema.prisma:3348-3369`, DDL in
`apps/api/prisma/migrations/20260903170000_push_subscriptions/migration.sql`

| Prisma field | column | type | notes |
|---|---|---|---|
| `id` | `id` | `uuid` (v7), PK | |
| `userId` | `user_id` | `text` FK → `users.id` `ON DELETE CASCADE` | |
| `endpoint` | `endpoint` | `text` **UNIQUE** | the browser vendor's push-service URL. **The dedup key.** |
| `p256dh` | `p256dh` | `text` | base64url, from `PushSubscription.getKey('p256dh')` |
| `auth` | `auth` | `text` | base64url, from `PushSubscription.getKey('auth')` |
| `createdAt` | `created_at` | `timestamp(3)` default now | |

Index: `(user_id)`.

**One row per subscribed BROWSER, not per user** — the same admin on a phone
and a laptop holds two, and both get woken. There is **no `platform` column, no
`deviceId`, no `lastSeenAt`, no `userAgent`** — this is the single biggest gap
for mobile (section 9).

### 1.3 `NotificationKind` (Postgres enum `app.notification_kind`)

Declared in `apps/api/prisma/schema.prisma:3372-3450` and mirrored value-for-value
in `packages/contracts/src/notifications.ts` `NOTIFICATION_KINDS`.

**Enum order is the DB's own order** (`ALTER TYPE … ADD VALUE` appends), which
is why the student kind `course_completed` sits after four admin kinds:

```
quiz_graded
extra_attempt_granted
conversation_reply
instructor_message
payment_approved
payment_rejected
subscription_expiring_soon
subscription_cancelled
payment_submitted             ← ADMIN
book_order_placed             ← ADMIN
assistant_question_received   ← ADMIN
book_order_shipped
book_order_delivered
book_order_rejected
course_completed
homework_submitted            ← ADMIN
homework_reviewed
```

17 values. `NOTIFICATION_KINDS` in contracts is the same list in the same order.

---

## 2. Every kind, field by field

The wire type is a **zod discriminated union on `kind`**
(`packages/contracts/src/notifications.ts` → `NotificationSchema`). Every variant
carries the shared base:

```ts
{
  id: string,                        // uuid7, opaque
  createdAt: string,                 // ISO-8601 datetime (z.iso.datetime())
  readAt: string | null,             // ISO-8601 datetime, null while unread
  kind: <literal>,
  …per-kind fields
}
```

In Dart: model all ids as `String`; `createdAt`/`readAt` as `DateTime` parsed
from ISO-8601 (UTC, with `Z`).

Below, for each kind: **audience · payload fields · trigger (file:line) · title
copy · detail copy · subtitle · in-app deep link · push (or "no push")**.

---

### 2.1 `quiz_graded` — STUDENT

**Fields**
| field | zod | notes |
|---|---|---|
| `attemptId` | `z.string()` | |
| `lessonId` | `z.string()` | |
| `lessonTitle` | `z.string()` | resolved at read time from `lesson.title` |
| `scorePercent` | `z.number().min(0).max(100)` | server rounds & clamps: `Math.round(Math.min(Math.max(v,0),100))` |
| `passed` | `z.boolean().nullable()` | `null` should not occur but the column is nullable — render no verdict rather than guessing |

**Trigger** — `apps/api/src/modules/quiz/attempt.service.ts:1035`, inside the
grading transaction. Fires for auto-graded papers at submit **and** for a
`pending_review` paper when the instructor finishes marking it (the case that
otherwise has no signal at all).

**Copy** (`packages/contracts/src/copy/ar.ts`, `copy.notifications`):
- title: `'اتصحّحت ورقتك — الدرجة {score}%'` with `{score}` = `scorePercent`
- detail: `passed === null` → none; `true` → `'نجحت'`; `false` → `'محتاجة مراجعة'`
- subtitle: `lessonTitle`

**Deep link** → `/quizzes/{lessonId}/attempt/{attemptId}/review`
(`apps/web/lib/quiz-links.ts` `reviewHref`).

**Icon** `ClipboardCheck` (lucide). **Push:** none.

---

### 2.2 `extra_attempt_granted` — STUDENT

**Fields:** `lessonId: string`, `lessonTitle: string`.

**Trigger** — `apps/api/src/modules/quiz/attempt-admin.service.ts:185`, when an
admin unlocks a further sitting. `userId` is the STUDENT, deliberately not the
admin: *"an admin granting an attempt must not notify themselves."*

**Copy**
- title: `'المدرّس دّالك محاولة زيادة في الامتحان ده'` (`copy.notifications.extraAttempt`)
- detail: none
- subtitle: `lessonTitle`

**Deep link** → `/quizzes/{lessonId}` — the quiz **intro** page, never a fresh
attempt: *"starting a graded exam is never something a link does."*

**Icon** `BadgeCheck`. **Push:** none.

---

### 2.3 `conversation_reply` — STUDENT

**Fields:** `conversationId: z.uuid()`.

**Trigger** — `apps/api/src/modules/assistant/assistant.service.ts:838`, when
the instructor answers a thread the student opened. **Only for a signed-in
student** — a guest has no account to notify.

**Copy**
- title: `'مهندس أيمن ردّ على سؤالك'` (`copy.notifications.conversationReply`)
- detail: none
- subtitle: `'مساعد المنصة'` (`copy.assistant.title`, `ar.ts:3110`)

**Deep link (web)** → `/dashboard?assistant=1` — the thread lives inside the
assistant widget, not on a route of its own (`ASSISTANT_OPEN_PARAM = 'assistant'`,
`apps/web/lib/assistant-mount.ts:80`).
**Mobile:** route to the in-app assistant/chat screen for `conversationId`.

**Icon** `MessagesSquare`. **Push:** none.

---

### 2.4 `instructor_message` — STUDENT («رسايل م. أيمن»)

**Fields:** `conversationId: z.uuid()`, `outreachKind: z.string()`.

`outreachKind` is one of `OUTREACH_KINDS`
(`packages/contracts/src/outreach/kinds.ts`), typed as a bare `string` on the
wire because a jsonb row can outlive the build that wrote it:

```
quiz_result | quiz_nudge | lesson_praise | whatsapp_invite
```

**Trigger** — `apps/api/src/modules/outreach/outreach.service.ts:201`, when the
outreach composer sends a message the student did not ask for. **The only kind
not caused by something the student did.**

**Copy — lead-in chosen by `outreachKind`** (`apps/web/lib/notification-view.ts:293-298`):
| `outreachKind` | title |
|---|---|
| `quiz_result` | `'مهندس أيمن شاف نتيجتك'` |
| `quiz_nudge` | `'مهندس أيمن فاكرك بالكويز'` |
| `lesson_praise` | `'مهندس أيمن بعتلك كلمتين'` |
| `whatsapp_invite` | `'مهندس أيمن عازمك على جروب الواتساب'` |
| *anything else / empty* | `'مهندس أيمن بعتلك رسالة'` (fallback, never drop the row) |

- detail: none
- subtitle: `'محادثتك مع مهندس أيمن'` (`copy.assistant.thread.title`, `ar.ts:3667`)

**Deep link** → same as 2.3: `/dashboard?assistant=1` / the in-app thread.
The notification deliberately does **not** carry the message body — it lives in
the conversation where it can be answered.

**Icon** `Send` (deliberately not `MessagesSquare`). **Push:** none.

---

### 2.5 `payment_approved` — STUDENT

**Fields**
| field | zod |
|---|---|
| `courseId` | `z.uuid()` |
| `courseTitle` | `z.string()` (read-time) |
| `courseSlug` | `z.string()` (read-time) |
| `validUntil` | `z.iso.datetime().nullable()` — `null` for an approved TERM purchase (no date expiry) |

**Triggers** — three call sites, all identical payload:
- `apps/api/src/modules/payments/payments.service.ts:514` — admin approves a `PaymentSubmission`
- `:676` — admin subscribes a student by hand (`payment:admin-subscribe`)
- `:800` — auto-approval from a matched InstaPay/Vodafone transfer

**Copy**
- title: `'تم تفعيل اشتراكك في {course}'` with `{course}` = `courseTitle`
- detail: none (the web view shows no date for this kind, by design)
- subtitle: `courseTitle`

**Deep link** → `/courses/{courseSlug}`.

**Icon** `Wallet`. **Push:** none.

---

### 2.6 `payment_rejected` — STUDENT

**Fields:** `courseId: uuid`, `courseTitle: string`, `courseSlug: string`,
`reason: z.string()` — **the admin's own free text, shown VERBATIM.**

**Trigger** — `apps/api/src/modules/payments/payments.service.ts:970`.

**Copy**
- title: `'محتاجين نراجع اشتراكك في {course}'`
- detail: `reason` (verbatim — *"a reason paraphrased by the platform is a
  reason the student argues with instead of acting on"*)
- subtitle: `courseTitle`

**Deep link** → `/courses/{courseSlug}`.

**Icon** `CircleAlert`. **Push:** none.

---

### 2.7 `subscription_expiring_soon` — STUDENT

**Fields:** `courseId: uuid`, `courseTitle`, `courseSlug`,
`validUntil: z.iso.datetime()` (**not** nullable here).

**Trigger** — `apps/api/src/modules/payments/subscription-expiry-sweeper.service.ts`,
a **daily cron at 10:00** (`@Cron(CronExpression.EVERY_DAY_AT_10AM)`), one replica
only (`pg_try_advisory_xact_lock('ayman:payments:expiry-sweep')`).
- Candidates: `AccessGrant` with `source: 'purchase'`, `scope: 'course'`,
  `revokedAt: null`, and `validUntil` between now and now + **3 days**
  (`WARNING_WINDOW_MS = 3 * 24h`), capped at `MAX_CANDIDATES = 1000`.
- **Dedupe:** an existing `subscription_expiring_soon` row for the same
  `(userId, courseId, validUntil)` triple written in the last **14 days**
  (`DEDUPE_LOOKBACK_MS`) suppresses a new one. A renewal that pushes `validUntil`
  forward is a fresh triple and gets its own notice.
- **No `announce()` call** — the sweeper only `emit`s. So this kind arrives on
  the next feed read, never as a live event or a push.

**Copy**
- title: `'اشتراكك في {course} هيخلص قريب'`
- detail: the **absolute** formatted date of `validUntil` (see 6.1)
- subtitle: `courseTitle`

**Deep link** → `/courses/{courseSlug}` (renewing is opening the subscribe panel there).

**Icon** `Hourglass`. **Push:** none.

---

### 2.8 `subscription_cancelled` — STUDENT

**Fields:** `courseId: uuid`, `courseTitle`, `courseSlug`, `reason: z.string()`.

**Trigger** — `apps/api/src/modules/payments/finance.service.ts:364`, when an
admin cancels a `purchase` `AccessGrant` early **and ticked
`cancelReasonVisibleToStudent`**. The far more common silent cancellation
(toggle off) writes **no notification at all**.

**Copy**
- title: `'اشتراكك في {course} اتلغى'`
- detail: `reason` (verbatim)
- subtitle: `courseTitle`

**Deep link** → `/courses/{courseSlug}`.

**Icon** `CircleAlert` (same as a rejection — both are an admin decision the
student did not make). **Push:** none.

---

### 2.9 `payment_submitted` — **ADMIN**

**Fields:** `submissionId: uuid`, `courseId: uuid`, `courseTitle`, `courseSlug`,
`studentName: z.string()` (read-time; **empty string** if the account was deleted).

**Trigger** — `apps/api/src/modules/payments/payments.service.ts:131`, inside the
submission transaction, fanned out via `emitToPermission(tx, 'payment:read', …)`.

**Copy**
- title: `'اشتراك جديد مستني مراجعة — {name}'` with `{name}` = `studentName`
  (name at the END so the sentence still reads when it is empty)
- detail: none
- subtitle: `courseTitle`

**Deep link** → `/admin/payments` — the **queue**, not the one submission:
*"the decision is made in a list, beside the others waiting."*

**Icon** `Wallet`.

**Push: YES.** `pushPayloadFor` (`apps/api/src/modules/notifications/push-text.ts`):
```
title: 'اشتراك جديد مستني مراجعة — {studentName}'
body:  courseTitle
url:   '/admin/payments'
tag:   'ayman-payments'
```

---

### 2.10 `book_order_placed` — **ADMIN**

**Fields:** `orderId: uuid`, `studentName: z.string()` — resolved from
`BookOrder.fullName` (the name the **parcel** is addressed to), NOT the user's
account name, because an order can be placed by someone with no account.

**Triggers**
- `apps/api/src/modules/book-orders/book-orders.service.ts:1040` — student pays for an order
- `:2246` — an incoming transfer auto-settles an order

Both use `emitToPermission(tx, 'book-order:read', 'book_order_placed', { orderId })`.

**Copy**
- title: `'طلب كتاب جديد مدفوع — {name}'`
- detail: none
- subtitle: `'طلبات الكتب'` (`copy.notifications.bookOrderQueue`)

**Deep link** → `/admin/books`.

**Icon** `PackageOpen`.

**Push: YES.**
```
title: 'طلب كتاب جديد مدفوع — {studentName}'
body:  'طلبات الكتب'
url:   '/admin/books'
tag:   'ayman-book-orders'
```

---

### 2.11 `assistant_question_received` — **ADMIN**

**Fields:** `conversationId: uuid`, `preview: z.string()`, `studentName: z.string()`.

⚠️ **`preview` is the ONE field snapshotted at WRITE time**, not resolved on read
— a chat message does not get renamed, and the notification is a record of what
was asked at the moment it interrupted him. It is already truncated by
`summaryPreview()` to **`SUMMARY_PREVIEW_MAX = 240`** chars
(`packages/contracts/src/assistant/summary.ts:116`), with whitespace collapsed
and an `…` appended when cut
(`apps/api/src/modules/assistant/assistant.service.ts:1327-1332`).

`studentName` is read-time: `conversation.guestName ?? conversation.user?.name ?? ''`
(guest name first).

**Trigger** — `apps/api/src/modules/assistant/assistant.controller.ts:97`, via
`notifyPermission('conversation:read', …)`. **Fire-and-forget, outside the
assistant's own transaction** (`void … .catch(() => undefined)`) — a crash in the
gap loses the ALERT, never the question.

**Copy**
- title: `'سؤال جديد مستني رد — {name}'`
- detail: `preview` (or none when empty)
- subtitle: `'صندوق الوارد'` (`copy.notifications.assistantQuestionQueue`)

**Deep link** → `/admin/inbox/{conversationId}`.

**Icon** `MessageCircleQuestion`.

**Push: YES.**
```
title: 'سؤال جديد مستني رد — {studentName}'
body:  preview
url:   '/admin/inbox/{conversationId}'
tag:   'ayman-inbox'      ← SHARED, deliberately: 3 questions in a minute collapse to the newest
```

---

### 2.12 `book_order_shipped` — STUDENT

**Fields**
| field | zod | notes |
|---|---|---|
| `orderId` | `z.uuid()` | |
| `bookTitle` | `z.string()` | read-time, from the order's **first line** ordered by `titleAr ASC`. **Empty string** if all lines were removed — do NOT drop the row |
| `deliveryDays` | `z.number().int().min(1).max(14)` | read-time from the order's governorate. **3** for القاهرة (`01`) / الجيزة (`21`), **4** everywhere else; fallback **4** when the order is gone (`apps/api/src/modules/book-orders/delivery-days.ts`) |

**Triggers** — `apps/api/src/modules/book-orders/book-orders.service.ts:1456`
(single ship) and `:1555` (bulk ship). Only when the order resolves to a signed-in
student (`studentIdForOrder` may be `null` for a guest order → no notification).

**Copy**
- title: `'كتابك اتشحن — {book}'`
- detail: `'هيوصلك خلال {days} أيام عمل، والمندوب هيتصل بيك قبل ما يوصل.'`
- subtitle: `'كتبي'` (`copy.notifications.bookOrderMineQueue`)

**Deep link** → `/store/orders` (`MY_BOOK_ORDERS_HREF`, `apps/web/lib/book-order-view.ts:67`)
— a LIST, never `/store/orders/:id`.

**Icon** `Truck`.

**Push: YES.**
```
title: 'كتابك اتشحن — {bookTitle}'
body:  'هيوصلك خلال {deliveryDays} أيام عمل، والمندوب هيتصل بيك قبل ما يوصل.'
url:   '/store/orders'
tag:   'ayman-book-order-{orderId}'   ← PER ORDER
```

---

### 2.13 `book_order_delivered` — STUDENT

**Fields:** `orderId: uuid`, `bookTitle: string` (same read-time rules, may be empty).

**Trigger** — `apps/api/src/modules/book-orders/book-orders.service.ts:1730`.

**Copy**
- title: `'الكتاب وصلك — {book}'`
- detail: none (in-app); push body is `'كتبي'`
- subtitle: `'كتبي'`

**Deep link** → `/store/orders`.

**Icon** `PackageCheck`.

**Push: YES.**
```
title: 'الكتاب وصلك — {bookTitle}'
body:  'كتبي'
url:   '/store/orders'
tag:   'ayman-book-order-{orderId}'   ← same tag as `shipped`: the later one REPLACES it in the tray
```

---

### 2.14 `book_order_rejected` — STUDENT

**Fields:** `orderId: uuid`, `bookTitle: string`, `reason: z.string()` (**required**;
enforced at three layers plus a `book_orders_rejection_has_a_reason` CHECK).

**Trigger** — `apps/api/src/modules/book-orders/book-orders.service.ts:1800`.

**Copy**
- title: `'طلب الكتاب اترفض — {book}'`
- detail: `reason` (verbatim)
- subtitle: `'كتبي'`

**Deep link** → `/store/orders`. (The order card there prints the reason a
second time under «السبب:» — deliberate.)

**Icon** `PackageX`.

**Push: YES.**
```
title: 'طلب الكتاب اترفض — {bookTitle}'
body:  reason        ← verbatim in the tray, on purpose
url:   '/store/orders'
tag:   'ayman-book-order-{orderId}'
```

---

### 2.15 `course_completed` — STUDENT

**Fields:** `courseId: uuid`, `courseTitle: string`, `courseSlug: string`.
Deliberately **no percentage** (100 by construction) and **no date** (`createdAt` is it).

**Trigger** — `apps/api/src/modules/progress/course-progress.service.ts:187`,
**on the TRANSITION into finished only** (the enrolment's `completedAt` was null
and this recalculation made it non-null). Emitting on the *value* would
re-congratulate on every revision re-open.
`announce()` is called by the callers after commit:
`apps/api/src/modules/progress/lesson-progress.service.ts:227` and
`apps/api/src/modules/progress/heartbeat.service.ts:210`.

**Copy**
- title: `'مبروك! خلصت {course}'`
- detail: `'قفلته من أوله لآخره، ودي مش حاجة بسيطة. أنا فخور بالمجهود ده.'`
  (`copy.notifications.courseCompletedDetail`)
- subtitle: `courseTitle`

**Deep link** → `/courses/{courseSlug}` (the course just finished, open to revise —
**not** `/dashboard`).

**Icon** `Trophy` — the SAME trophy the dashboard's 100% card uses.

**Push: YES.**
```
title: 'مبروك! خلصت {courseTitle}'
body:  'قفلته من أوله لآخره، ودي مش حاجة بسيطة. أنا فخور بالمجهود ده.'
url:   '/courses/{courseSlug}'
tag:   'ayman-course-completed-{courseId}'
```

---

### 2.16 `homework_submitted` — **ADMIN**

**Fields:** `submissionId: uuid`, `lessonId: string`, `lessonTitle: string`,
`studentName: string` (read-time, empty if the account is gone).

**Trigger** — `apps/api/src/modules/homework/homework.service.ts:203`, inside the
submission transaction, `emitToPermission(tx, 'homework:read', …)`.

**Copy**
- title: `'واجب جديد من {name}'`
- detail: `'الحل مستني مراجعة'` (`copy.notifications.homeworkSubmittedDetail`)
- subtitle: `lessonTitle`

**Deep link** → `/admin/homework/{submissionId}` — the ONE submission, unlike
`payment_submitted`'s queue: *"a homework answer is a specific set of photographs
he has to look at."*

**Icon** `NotebookPen`.

**Push: YES.**
```
title: 'واجب جديد من {studentName}'
body:  lessonTitle
url:   '/admin/homework/{submissionId}'
tag:   'ayman-homework'   ← SHARED
```

---

### 2.17 `homework_reviewed` — STUDENT

**Fields**
| field | zod |
|---|---|
| `submissionId` | `z.uuid()` |
| `lessonId` | `z.string()` |
| `lessonTitle` | `z.string()` (read-time) |
| `courseSlug` | `z.string()` (read-time — the lecture's address needs both halves) |
| `homeworkStatus` | `z.enum(['accepted', 'needs_work'])` |
| `grade` | `z.number().min(0).max(100).nullable()` — `null` for «مقبول من غير درجة», **the ordinary case** |

A row whose `homeworkStatus` is neither literal is **dropped** by the API.

**Trigger** — `apps/api/src/modules/homework/homework.service.ts:432`, when the
instructor marks it; his actual words go into the student's conversation thread,
never onto this row.

**Copy**
- title — `accepted` → `'واجب {lesson} اتقبل ✅'`; `needs_work` → `'واجب {lesson} فيه ملاحظات'`
- detail — exactly one of, in this order:
  1. accepted **and** `grade != null` → `'الدرجة {grade} من 100'`
  2. accepted, `grade == null` → `'مهندس أيمن راجع الحل وكتب لك رد.'`
  3. `needs_work` → `'مهندس أيمن كتب لك رد، والواجب مفتوح تاني.'`
- subtitle: `lessonTitle`

**Deep link** → `/courses/{courseSlug}/lessons/{lessonId}` — the lecture, where
the homework card, the verdict, his note and (when returned) the re-upload box live.

**Icon** `NotebookPen` (same as `homework_submitted`; the verdict is carried by
the WORDS, not a second glyph — a warning icon would make an ordinary
«حلوة، بس فيه حتة» read as something going wrong).

**Push: YES.**
```
title: accepted ? 'واجب {lessonTitle} اتقبل ✅' : 'واجب {lessonTitle} فيه ملاحظات'
body:  same three-way detail rule above
url:   '/courses/{courseSlug}/lessons/{lessonId}'
tag:   'ayman-homework-{submissionId}'   ← PER SUBMISSION
```

---

### 2.18 Push coverage summary

Only **9 of 17** kinds produce a push payload; `pushPayloadFor` returns `null`
for the rest (`apps/api/src/modules/notifications/push-text.ts`, `default: return null`).

| kind | push? | tag |
|---|---|---|
| `quiz_graded` | ✗ | |
| `extra_attempt_granted` | ✗ | |
| `conversation_reply` | ✗ | |
| `instructor_message` | ✗ | |
| `payment_approved` | ✗ | |
| `payment_rejected` | ✗ | |
| `subscription_expiring_soon` | ✗ (and no `announce()` at all) | |
| `subscription_cancelled` | ✗ | |
| `payment_submitted` | ✓ | `ayman-payments` |
| `book_order_placed` | ✓ | `ayman-book-orders` |
| `assistant_question_received` | ✓ | `ayman-inbox` (shared) |
| `book_order_shipped` | ✓ | `ayman-book-order-{orderId}` |
| `book_order_delivered` | ✓ | `ayman-book-order-{orderId}` |
| `book_order_rejected` | ✓ | `ayman-book-order-{orderId}` |
| `course_completed` | ✓ | `ayman-course-completed-{courseId}` |
| `homework_submitted` | ✓ | `ayman-homework` (shared) |
| `homework_reviewed` | ✓ | `ayman-homework-{submissionId}` |

**Adding a tenth is one `case` in `push-text.ts`** plus whatever subscribes the
audience it is for.

---

## 3. The copy table (verbatim)

`packages/contracts/src/copy/ar.ts`, block `copy.notifications` (starts ~line 2932).
Port this whole map into Dart as constants. `{…}` placeholders are interpolated by
`formatCopy` (`packages/contracts/src/format.ts`): `template.replace(/\{(\w+)\}/g, …)`
— **an unknown placeholder is left literally in place**, never replaced with
"undefined", so a typo is visible in the UI.

```dart
// chrome
eyebrow:        '05 / الإشعارات'
title:          'الإشعارات'
subtitle:       'كل حاجة حصلت في حسابك وتستاهل المعرفة.'
bell:           'الإشعارات'                       // a11y label, no unread
bellWithUnread: 'الإشعارات — {n} جديدة'           // a11y label with unread
panelTitle:     'الإشعارات'
markAllRead:    'علّم الكل كمقروء'
markingAll:     'بنعلّم…'
seeAll:         'الكل'
empty:          'مفيش إشعارات لسه.'
emptyHint:      'أول ما تتصحّح لك ورقة أو يتردّ على تظلّم، هتلاقيه هنا.'
more:           'أقدم'                            // load-more button
loading:        'بنجيب…'
failed:         'مقدرناش نجيب الإشعارات. نحاول تاني.'
liveOpen:       'افتح'                            // the live toast's action label
ago:            'من {value}'                      // present but UNUSED — see 6.1

// per-kind
quizGraded:                    'اتصحّحت ورقتك — الدرجة {score}%'
quizGradedPassed:              'نجحت'
quizGradedFailed:              'محتاجة مراجعة'
extraAttempt:                  'المدرّس دّالك محاولة زيادة في الامتحان ده'
conversationReply:             'مهندس أيمن ردّ على سؤالك'
instructorMessage:             'مهندس أيمن بعتلك رسالة'
instructorMessageQuizResult:   'مهندس أيمن شاف نتيجتك'
instructorMessageQuizNudge:    'مهندس أيمن فاكرك بالكويز'
instructorMessageLessonPraise: 'مهندس أيمن بعتلك كلمتين'
instructorMessageWhatsappInvite:'مهندس أيمن عازمك على جروب الواتساب'
paymentApproved:               'تم تفعيل اشتراكك في {course}'
paymentRejected:               'محتاجين نراجع اشتراكك في {course}'
subscriptionExpiringSoon:      'اشتراكك في {course} هيخلص قريب'
subscriptionCancelled:         'اشتراكك في {course} اتلغى'
paymentSubmitted:              'اشتراك جديد مستني مراجعة — {name}'
bookOrderPlaced:               'طلب كتاب جديد مدفوع — {name}'
bookOrderQueue:                'طلبات الكتب'
assistantQuestionReceived:     'سؤال جديد مستني رد — {name}'
assistantQuestionQueue:        'صندوق الوارد'
bookOrderShipped:              'كتابك اتشحن — {book}'
bookOrderShippedDetail:        'هيوصلك خلال {days} أيام عمل، والمندوب هيتصل بيك قبل ما يوصل.'
bookOrderDelivered:            'الكتاب وصلك — {book}'
bookOrderRejected:             'طلب الكتاب اترفض — {book}'
bookOrderMineQueue:            'كتبي'
courseCompleted:               'مبروك! خلصت {course}'
courseCompletedDetail:         'قفلته من أوله لآخره، ودي مش حاجة بسيطة. أنا فخور بالمجهود ده.'
homeworkSubmitted:             'واجب جديد من {name}'
homeworkSubmittedDetail:       'الحل مستني مراجعة'
homeworkAccepted:              'واجب {lesson} اتقبل ✅'
homeworkAcceptedDetail:        'مهندس أيمن راجع الحل وكتب لك رد.'
homeworkAcceptedGrade:         'الدرجة {grade} من 100'
homeworkNeedsWork:             'واجب {lesson} فيه ملاحظات'
homeworkNeedsWorkDetail:       'مهندس أيمن كتب لك رد، والواجب مفتوح تاني.'
```

Borrowed from elsewhere in the copy table:
```
copy.assistant.title        = 'مساعد المنصة'            // ar.ts:3110
copy.assistant.thread.title = 'محادثتك مع مهندس أيمن'   // ar.ts:3667
```

**Copy rules that constrain any new string** (from the file's own comments):
- Never a gendered address to a student. `homeworkNeedsWork` says «فيه ملاحظات»
  rather than an imperative «ابعت» precisely because an imperative would address
  a boy.
- No person-noun («طالب»/«طالبة») in the admin sentences — the name alone carries identity.
- Names/book titles go at the **end** of the sentence so the sentence still reads
  when the value is the empty string.

---

## 4. In-app endpoints

All under `/api/me`. All require a valid session; anonymous → **401**.

### 4.1 `GET /api/me/notifications` — the feed

Permission: `profile:read` (every signed-in student has it).
`apps/api/src/modules/notifications/notifications.controller.ts`

**Query params**
| param | type | rules |
|---|---|---|
| `cursor` | string, optional | a notification **row id** (uuid). Must match `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` or the API answers **400** `"cursor is not a valid notification id"` |
| `limit` | string, optional | parsed with `Number.parseInt`; **default 20**, **max 50**. Anything non-numeric or ≤ 0 falls back to 20 (`clampLimit`) |

**Response 200** — `NotificationFeedSchema`:
```json
{
  "entries": [ /* NotificationSchema[] */ ],
  "nextCursor": "0199…-…" | null
}
```

**Ordering** — `ORDER BY createdAt DESC, id DESC` (composite).
**Pagination** — `nextCursor` is the id of the **last row of the raw page**, and
the next request resumes with Prisma `cursor: { id }` + `skip: 1`.

> ⚠️ Two subtleties a naive client will get wrong:
> 1. The cursor is a **row id, not a timestamp and not an offset**. Several
>    notifications routinely share a millisecond (three quiz results graded in
>    one submit); a `createdAt <` window cannot advance past them and repeats a
>    page. The service's own spec caught five rows paging out as six.
> 2. `nextCursor` is derived from the raw page **before** unrenderable rows are
>    filtered out — so `entries.length` can be **less** than `limit` while
>    `nextCursor` is non-null. **Never** use `entries.last.id` as your own cursor
>    and never treat a short page as the end. Stop only when `nextCursor == null`.

**Rows that get dropped by the server** (they still advance the cursor):
- a `kind` this API build does not know (rolling release)
- an incomplete `payload` (missing a required id/reason)
- a `quiz_graded` / `extra_attempt_granted` / `homework_*` whose **lesson was deleted**
- any course-carrying kind whose **course was deleted**
- a `homework_reviewed` whose `homeworkStatus` is neither `accepted` nor `needs_work`

A **book order** whose lines were all removed is NOT dropped — `bookTitle`
falls back to `''`.

**Errors**
| status | when | UI |
|---|---|---|
| 400 | malformed `cursor` | treat as a load failure |
| 401 | no/expired session | route to sign-in |
| 429 | rate limit | keep what is on screen; retry later |
| 5xx | anything else | show `failed` copy, keep existing rows |

---

### 4.2 `GET /api/me/notifications/unread-count` — the badge

Permission: `profile:read`. **Its own route, deliberately not a field on the
feed** — the topbar renders it on every page and must not fetch 20 rows for one number.

**Response 200** — `UnreadCountSchema`:
```json
{ "unread": 7 }
```
`z.number().int().min(0)`. Backed by `COUNT(*) WHERE user_id = ? AND read_at IS NULL`
over the `(user_id, read_at)` index.

---

### 4.3 `POST /api/me/notifications/:id/read` — mark one read

Permission: `profile:write`. Requires the CSRF header.
**Response: 204 No Content, always.** No body.

- Implemented as `updateMany({ where: { id, userId, readAt: null }, data: { readAt: now } })`.
- A **guessed / foreign / non-existent id updates zero rows and still returns 204**
  — by design, so the endpoint is not an existence oracle over another student's
  ids (asserted in `apps/api/src/test/authorization-matrix.int-spec.ts:754`).
- **Idempotent:** `readAt: null` in the filter means marking an already-read row
  does not move its timestamp.
- The id is URL-encoded into the path segment; it is **not** validated as a UUID
  client-side or in the web Server Action.

---

### 4.4 `POST /api/me/notifications/read-all` — mark everything read

Permission: `profile:write`. CSRF header. Empty body.
**Response: 204.** `updateMany({ where: { userId, readAt: null }, data: { readAt: now } })`.
Safe to run twice.

---

### 4.5 `GET /api/me/notifications/stream` — live SSE (web only today)

Permission: `profile:read`.

**Response headers**
```
Content-Type: text/event-stream; charset=utf-8
Cache-Control: private, no-store, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```
First bytes written: `retry: 5000\n\n` (the browser's reconnect delay).
Then frames of `data: <json>\n\n`.

**Frame shapes** — `NotificationEventSchema`, a discriminated union on `type`:
```json
{ "type": "notification", "notification": { /* NotificationSchema */ }, "unread": 7 }
{ "type": "ping" }
```
- A heartbeat `ping` every **25 000 ms** (`HEARTBEAT_MS`), chosen to sit under
  Traefik's read timeout, Cloudflare's 100 s and the ~60 s a mobile radio holds
  an idle socket.
- `unread` rides along and is **absolute, not a delta** — a client that missed
  frames converges on the first one it sees.
- The stream **never decides anything**: every frame is a copy of what
  `GET /api/me/notifications` would return anyway.
- Fan-out is Redis pub/sub, channel `notif:{userId}`
  (`apps/api/src/modules/notifications/notifications-realtime.service.ts`), because
  the API runs multiple containers. It **fails OPEN**: if Redis is unreachable
  the publish is logged and dropped, the notification row is still written.

Note for mobile: `EventSource` cannot set headers, which is exactly why this
endpoint is cookie-authenticated. A Flutter client holding an SSE connection is
possible but **not recommended** (section 9.6).

---

### 4.6 Web Push endpoints (existing, browser-shaped)

All three are `profile:read`/`profile:write` — *"a self-service toggle on the
CALLER'S OWN browser, not a kind-specific authority."*

| method | path | permission | body | response |
|---|---|---|---|---|
| `GET` | `/api/me/push/public-key` | `profile:read` | — | `200 { "publicKey": string \| null }` |
| `POST` | `/api/me/push/subscribe` | `profile:write` | `PushSubscribeSchema` | `204` |
| `POST` | `/api/me/push/unsubscribe` | `profile:write` | `PushUnsubscribeSchema` | `204` |

`packages/contracts/src/notifications/push.ts`:

```ts
PushSubscribeSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
}).strict()

PushUnsubscribeSchema = z.object({ endpoint: z.url() }).strict()

PushPublicKeySchema = z.object({ publicKey: z.string().nullable() })
```

⚠️ **`.strict()`** — this closes mass assignment. Posting the browser's raw
`subscription.toJSON()` **400s**, because that object also carries
`expirationTime` (`apps/web/lib/push-subscribe.ts:73-85` handles this by picking
the three fields by hand).

`publicKey` is `null` when `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` /
`VAPID_SUBJECT` are not all configured — the client must then **stay silent**,
not subscribe.

---

### 4.7 Authorization matrix rows (the CI gate)

`apps/api/src/test/authorization-matrix.int-spec.ts:732-793`. Every new route in
this repo needs a row here or CI fails.

| label | method | path | actor | status |
|---|---|---|---|---|
| notifications feed | GET | `/api/me/notifications` | anonymous / student | 401 / 200 |
| notifications stream | GET | `/api/me/notifications/stream` | anonymous | 401 (no authed row — the 200 never ends) |
| unread count | GET | `/api/me/notifications/unread-count` | anonymous / student | 401 / 200 |
| read-all | POST | `/api/me/notifications/read-all` | anonymous / student | 401 / 204 |
| read one | POST | `/api/me/notifications/{randomUUID}/read` | anonymous / student | 401 / **204** |
| push public key | GET | `/api/me/push/public-key` | anonymous / student | 401 / 200 |
| push subscribe | POST | `/api/me/push/subscribe` | anonymous / student | 401 / 204 |
| push unsubscribe | POST | `/api/me/push/unsubscribe` | anonymous / student | 401 / 204 |

---

## 5. Server-side write path (what an emitter does)

`apps/api/src/modules/notifications/notifications.service.ts`

Three public writers, all exported from `NotificationsModule`:

```ts
emit(tx, input: EmitInput): Promise<void>
  // ONE row, INSIDE the caller's transaction. Never the root client:
  // "a notification about a grade that was rolled back is worse than none."

emitToPermission(tx, permission, kind, payload): Promise<string[]>
  // ONE row per user holding `permission`, via a single `createMany`.
  // Recipients = users whose `role` is in `rolesWithPermission(permission)`
  // (apps/api/src/auth/permissions.ts). Returns the recipient ids so the caller
  // can announce after commit.
  // Addressed by PERMISSION, never `role: 'admin'` — so a narrower staff role
  // added later is told about work it was just given, with no code change.

notifyPermission(permission, kind, payload): Promise<void>
  // emitToPermission + announceAll in its OWN transaction. One caller:
  // AssistantController, which cannot offer its own transaction.
```

Then, **after the commit**:

```ts
announce(userId)      // re-reads feed(userId, 1) + unreadCount(userId),
                      // publishes { type:'notification', notification, unread }
                      // to Redis, and calls pushPayloadFor(entry) → push.notifyUser
announceAll(userIds)  // Promise.all of the above
```

`announce()` **never throws** — the whole body is wrapped in `try {} catch {}`
and the caller has already committed. A failed announcement degrades to "arrives
on the next poll".

It **re-reads** rather than being handed the row, so what is streamed/pushed is
byte-identical to what `GET /api/me/notifications` returns, including read-time
title resolution.

**Fan-out permissions in use today**
| kind | permission | roles holding it today |
|---|---|---|
| `payment_submitted` | `payment:read` | `admin` only (`admin: '*'`) |
| `book_order_placed` | `book-order:read` | `admin` only |
| `assistant_question_received` | `conversation:read` | `admin` only |
| `homework_submitted` | `homework:read` | `admin` only |

`student` holds: `profile:read`, `profile:write`, `course:read`, `enrollment:read`,
`enrollment:create`, `progress:read`, `progress:write`, `quiz:read`, `quiz:attempt`,
`payment:submit`, `book-order:submit`, `homework:submit`
(`apps/api/src/auth/permissions.ts:243-268`).

**A staff member hired later does NOT retroactively receive past alerts** — the
queue screens are the durable record; the notification is the interruption.

---

## 6. Client rendering rules

### 6.1 `NotificationView` — row → sentence + destination

`apps/web/lib/notification-view.ts` — port this exactly.

```dart
class NotificationView {
  final String title;      // the sentence
  final String? detail;    // a short qualifier under the title; null when the title says it all
  final String subtitle;   // WHAT this is about (lesson / course / queue name)
  final String href;       // where tapping goes
}
```

Per kind, `title` / `detail` / `subtitle` / `href` are exactly as tabulated in
section 2.

**Timestamps are ABSOLUTE, never relative.** The web uses:

```js
new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' })
```

i.e. **Arabic (Egypt) locale with WESTERN (latn) digits**, medium date + short time.
`copy.notifications.ago` (`'من {value}'`) exists in the table but is **not used**;
relative time was tried and rejected — it needs the clock during render (impure,
rejected by the React Compiler) and goes stale the moment it is painted.
Flutter: `DateFormat.yMMMd('ar_EG').add_jm()` with Latin digits, or a hand-rolled
formatter that matches; be consistent with the rest of the app.

`subscription_expiring_soon`'s `detail` uses the **same formatter** on `validUntil`.

### 6.2 Icons (lucide → Material/Cupertino equivalents)

`apps/web/components/notifications/notification-list.tsx:33-108`

| kind | lucide icon |
|---|---|
| `quiz_graded` | `ClipboardCheck` |
| `extra_attempt_granted` | `BadgeCheck` |
| `conversation_reply` | `MessagesSquare` |
| `instructor_message` | `Send` |
| `payment_approved` | `Wallet` |
| `payment_rejected` | `CircleAlert` |
| `subscription_expiring_soon` | `Hourglass` |
| `subscription_cancelled` | `CircleAlert` |
| `course_completed` | `Trophy` |
| `payment_submitted` | `Wallet` |
| `book_order_placed` | `PackageOpen` |
| `book_order_shipped` | `Truck` |
| `book_order_delivered` | `PackageCheck` |
| `book_order_rejected` | `PackageX` |
| `assistant_question_received` | `MessageCircleQuestion` |
| `homework_submitted` | `NotebookPen` |
| `homework_reviewed` | `NotebookPen` |

Design intent worth preserving: the three book-order kinds get three *different*
parcel glyphs because «خرج / وصل / اترفض» is the whole content and the glyph
carries it at a glance; `course_completed` reuses the dashboard's `Trophy` so
one event looks the same in two places.

---

## 7. Screen-by-screen UI

### 7.1 Full history — route `/notifications`

`apps/web/app/(app)/notifications/page.tsx` + `components/notifications/notification-list.tsx`

**Layout** — centred column, `max-width: var(--w-prose)`, padding `16px` (`24px` ≥ md),
vertical `32px` (`40px` ≥ md).

**Header** (margin-bottom 24px)
1. eyebrow, muted, uppercase-ish small: `'05 / الإشعارات'`
2. `<h1>`: `'الإشعارات'` — `var(--fs-title-1)`, semibold
3. subtitle, muted, margin-top 8px: `'كل حاجة حصلت في حسابك وتستاهل المعرفة.'`

**States**

*Loading* (`loading.tsx`) — same width/padding so nothing shifts:
- header skeletons: 3 bars (h-3 narrow, h-8 wide, h-4 narrow)
- a rounded bordered card containing **5** skeleton rows: a `32×32` rounded square
  + two bars (`h-4` alternating wide/narrow, `h-3` narrow), separated by hairlines.

*Empty* (`entries.length == 0`) — a dashed-border card, centred, padding `24px/48px`:
- `'مفيش إشعارات لسه.'` at `var(--fs-title-4)`, medium weight
- `'أول ما تتصحّح لك ورقة أو يتردّ على تظلّم، هتلاقيه هنا.'` — muted, small, max-width 34rem

*Success* — a bordered rounded list on `surface-2`, rows separated by hairlines.
Above it, **only when at least one loaded row is unread**, a right-aligned text
button: `'علّم الكل كمقروء'` → `'بنعلّم…'` while pending, `disabled` + 60 % opacity
while pending. Hit target `min-height 44px` below `md`, released above.

**Row** (a real link, not a button — middle-click / open-in-new-tab / status bar):
```
[ 32×32 rounded icon tile, surface-3, muted fg ]  title (small, medium weight)
                                                  detail (small, muted)   ← only if non-null
                                                  subtitle (small, muted, truncated 1 line)
                                                                          time (mono, tiny, END-aligned)
```
- Unread row background: `color-mix(in oklch, var(--a-9), var(--n-2) 95%)` — a
  faint amber tint.
- Timestamp colour: read → `--fg-faint`; **unread → full `--fg`**. This is a
  contrast fix, not a preference: on the tinted background `--fg-faint` measured
  3.83:1 and `--fg-muted` measured *worse* (3.39:1). Use the primary text colour
  on unread rows.
- Padding `16px`, gap `12px`, hover `surface-3`.

**Tapping a row**: navigate immediately; if `readAt == null`, optimistically set
`readAt = now` locally and fire `POST /notifications/{id}/read` in the background.
Never block navigation on the write.

*Load more* — when `nextCursor != null`, a bordered button below the list:
`'أقدم'`, or `'بنجيب…'` while loading and disabled. Height 40px below `md`, 36px above.
On success: **append** `next.entries` and replace the cursor with `next.nextCursor`.

*Partial failure* — if page N fails, **keep the rows already on screen** and show
an alert line above the button: `'مقدرناش نجيب الإشعارات. نحاول تاني.'` in `var(--err)`,
`role="alert"`. Replacing a loaded history with an error loses more than it explains.

### 7.2 The bell + dropdown panel (topbar)

`apps/web/components/notifications/notification-bell.tsx` + `notification-bell-client.tsx`

**Bell button** — 36×36, muted, hover `surface-3`.
- a11y label: `'الإشعارات'`, or `'الإشعارات — {n} جديدة'` when `n > 0`.
- Badge: only when `count > 0` — **never a `0` badge** (*"a permanent zero trains
  a student to ignore the bell"*). Amber pill, min-width 18px, top-end corner,
  mono, 10px, semibold, text `#1A1206`. Shows `'9+'` when `count > 9`.

**Data**
- The **count** is fetched server-side on first paint (`/unread-count`), so the
  number is right before any interaction.
- The **rows** are fetched **on open**, `limit=8` (`PANEL_SIZE = 8`), and **re-read
  on every open** — a list fetched three navigations ago is the one answer the
  panel must not give. Existing rows stay on screen during the refetch, so only
  the first open of a session shows a placeholder.

**Panel** — width `min(22rem, 100vw - 2rem)`, aligned to the end.
1. **Header** row: `'الإشعارات'` (small, medium) on one side; when `count > 0`,
   `'علّم الكل كمقروء'` / `'بنعلّم…'` on the other.
2. **Placeholder** (only when nothing has ever loaded): an sr-only
   `role="status"` line reading `'بنجيب…'`, plus **3** (not 8) shimmering skeleton rows.
3. **Empty**: centred, padding 16/32 — `'مفيش إشعارات لسه.'` then
   `'أول ما تتصحّح لك ورقة أو يتردّ على تظلّم، هتلاقيه هنا.'`
4. **Rows**: scrollable, `max-height: 60vh`. Each row is
   `[unread dot 8px, amber or transparent] title / subtitle (truncated) / timestamp (mono, faint)`.
   **No `detail` line and no icon tile in the panel** — that is the full page only.
5. **Failure**: a `role="alert"` line in `--err` reading
   `'مقدرناش نجيب الإشعارات. نحاول تاني.'`; padded 32px when it is the only content,
   or with a top hairline and 12px padding when it sits under existing rows.
6. **Footer**: a link `'الكل'` → `/notifications`.

Tapping a row: close the panel, navigate, optimistically drop the dot, fire the
mark-read write.

### 7.3 Live toast (SSE, web today)

`apps/web/components/notifications/notification-stream.tsx`

On a `{ type: 'notification' }` frame, three separate things happen:
1. the badge number is replaced with `event.unread` (absolute);
2. a toast: `title = view.title`, `description = view.subtitle`, action label
   `'افتح'` (`copy.notifications.liveOpen`) → navigates to `view.href`;
3. an **OS notification** *only if* `Notification.permission === 'granted'`:
   `title = view.title`, `body = view.subtitle`,
   `tag = 'ayman-notification-{kind}'`, `lang: 'ar'`, `dir: 'rtl'`.

It deliberately does **not** refresh the page/route — the payload is already in hand.
Errors on the EventSource are swallowed (it reconnects on its own with backoff).

Mounted by both shells: `apps/web/components/app/student-shell.tsx:122` and
`apps/web/app/(admin)/layout.tsx:95`.

---

## 8. The current push implementation (Web Push / VAPID), end to end

### 8.1 Configuration

`apps/api/src/config/env.ts:295-326, 385-396`

| var | validation |
|---|---|
| `VAPID_PUBLIC_KEY` | optional secret (empty string ⇒ treated as unset) |
| `VAPID_PRIVATE_KEY` | optional secret |
| `VAPID_SUBJECT` | optional; **must start with `mailto:` or `https://`** (RFC 8292), otherwise boot fails with `'must be a mailto: address or an https:// URL (RFC 8292)'` |

A `.refine()` enforces **all three or none**:
`'VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT must all be set together, or all omitted'`.

With none set: `PushService.publicKey()` → `null`, `notifyUser()` is a silent
no-op that does not even query subscriptions, and the client toggle stays quiet.
This is the state of every local checkout and CI.

Library: `web-push@^3.6.7` (`apps/api/package.json:47`), typed via `@types/web-push`.

### 8.2 Subscribe (browser → API)

1. The **only caller today** is `InboxAlertsToggle`
   (`apps/web/components/admin/inbox-alerts.tsx:209-229`) — an **admin-only**
   topbar button. So in production **only admins have push subscriptions**; every
   student-facing push kind is currently a harmless no-op.
2. The button exists because `Notification.requestPermission()` may only be called
   from a user gesture. It renders only when permission is `default` or `denied`;
   it **disappears once `granted`**. When `denied` it is disabled with the title
   `'المتصفح مانع التنبيهات — فعّلها من إعدادات الموقع'`; otherwise
   `'تفعيل تنبيهات الرسايل'`.
3. On `granted`, it lazily imports `subscribeToPush()` (`apps/web/lib/push-subscribe.ts`),
   which:
   - bails silently if `serviceWorker`/`PushManager` are absent (old browser,
     locked-down webview, **iOS Safari outside a Home-Screen install**);
   - `GET /api/me/push/public-key`; bails if `publicKey == null`;
   - `await navigator.serviceWorker.ready`;
   - reuses `pushManager.getSubscription()` if present, else
     `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })`;
   - picks **only** `endpoint`, `keys.p256dh`, `keys.auth` by hand (because the
     schema is `.strict()` and `toJSON()` also carries `expirationTime`);
   - `POST /api/me/push/subscribe`.
   - **Every failure is swallowed** — the caller is a click handler and the
     feature degrades to "arrives on next tab open".
4. `urlBase64ToUint8Array` — base64url → base64 (`-`→`+`, `_`→`/`), re-add the
   `=` padding `atob` requires, then byte-copy.

### 8.3 Store

`PushService.subscribe(userId, { endpoint, keys })` →
`prisma.pushSubscription.upsert({ where: { endpoint }, create: {...}, update: { userId, p256dh, auth } })`.

**Ownership is overwritten on every upsert**, deliberately: a browser that
subscribed as one admin and is now used by another sends to whoever asked LAST.

`unsubscribe(userId, endpoint)` → `deleteMany({ where: { endpoint, userId } })` —
scoped by both, so a guessed endpoint deletes zero rows rather than confirming it exists.

### 8.4 Send

`NotificationsService.announce(userId)`
→ `pushPayloadFor(entry)` (`push-text.ts`) → `null` or a `PushPayload`
→ `PushService.notifyUser(userId, payload)`.

```ts
interface PushPayload { title: string; body: string; url: string; tag: string }
```
`url` is **always app-relative** — the service worker resolves it against its own origin.

`notifyUser`:
- returns immediately if VAPID is unconfigured;
- `findMany({ where: { userId } })`; returns if none;
- `Promise.all` of `webpush.sendNotification({ endpoint, keys }, JSON.stringify(payload))`.
- **Never throws.**

### 8.5 Expire / prune

In `PushService.send`'s catch:
- `statusCode === 404 || statusCode === 410` → **delete that subscription row**
  (`delete({ where: { id } }).catch(() => {})` so a race with another tab's prune
  is harmless). These mean the push service itself says the endpoint is gone:
  an uninstall, a permission reset, a wiped profile.
- Any other error → `logger.warn('push send failed for subscription {id}: {message}')`
  and the row is kept.

There is **no TTL sweeper, no `lastSeenAt`, no periodic re-validation**. A row is
pruned only by a 404/410 on an actual send, or by the user cascade on account delete.

### 8.6 Deliver (service worker)

`apps/web/public/sw.js:329-417`

`push` handler:
- `event.data.json()`, wrapped in try/catch (a non-JSON payload must still show
  *something*);
- `title = data.title || 'إشعار جديد'`;
- `url = data.url || '/admin'`;
- `showNotification(title, { body: data.body ?? '', icon: '/icons/icon-192.png',
  badge: '/icons/icon-192.png', tag: data.tag || 'ayman-push', lang: 'ar',
  dir: 'rtl', data: { url } })`.
- Icon/badge are **constants**, not carried on the payload — Web Push caps the
  payload at ~4 KB and the mark is identical every time.

`notificationclick` handler:
- `notification.close()`, `url = notification.data.url || '/admin'`;
- `clients.matchAll({ type: 'window', includeUncontrolled: true })`;
- if an open window's `new URL(client.url).pathname === url` → `client.focus()`;
- else if any window exists → `focus()` then `navigate(url)`;
- else `clients.openWindow(url)`.

The worker is registered by `ServiceWorkerRegister`
(`apps/web/components/pwa/service-worker-register.tsx`) on the `load` event, not
during hydration. It calls `skipWaiting()` + `clients.claim()`, which is only safe
because **nothing personal is ever cached**.

### 8.7 Payload size

Web Push caps the encrypted payload at ~4 KB. The four fields are the whole
budget; `preview` (≤ 240 chars) and a book-rejection `reason` are the only
variable-length ones. FCM's data-message limit is 4 KB too, so the same payload
fits unchanged.

---

## 9. What must be ADDED for FCM (Android) and APNs-via-FCM (iOS)

**A Firebase project already exists and is wired into `apps/mobile`:**
- `apps/mobile/android/app/google-services.json` — project `aymanaboelela-b89c0`,
  project number `419591641559`, Android package `com.aymanaboelela.app`,
  app id `1:419591641559:android:ed2b96b9c187f30d801392`
- `apps/mobile/ios/Runner/GoogleService-Info.plist` — bundle id `com.aymanaboelela.app`,
  `GCM_SENDER_ID 419591641559`, iOS app id `1:419591641559:ios:a0aca3c03bca00b2801392`

`apps/mobile/pubspec.yaml` currently has **no** `firebase_core` /
`firebase_messaging` dependency — the configs are staged, the code is not.

Nothing FCM-shaped exists on the server: `rg -in 'firebase|fcm|apns'` over
`apps/api`, `packages/contracts` and `apps/web` returns **nothing**.

### 9.1 Database — the platform column (or a second table)

`app.push_subscriptions` today is Web-Push-shaped: `endpoint` (a URL, unique),
`p256dh`, `auth`. An FCM registration token has none of those.

**Recommended (smallest diff, one fan-out):** widen the existing table.

```sql
-- new migration, e.g. apps/api/prisma/migrations/2026…_push_transport/migration.sql
CREATE TYPE "app"."push_transport" AS ENUM ('web_push', 'fcm');

ALTER TABLE "app"."push_subscriptions"
  ADD COLUMN "transport"    "app"."push_transport" NOT NULL DEFAULT 'web_push',
  ADD COLUMN "platform"     TEXT,          -- 'android' | 'ios' | NULL for web
  ADD COLUMN "device_id"    TEXT,          -- stable install id, for replace-on-refresh
  ADD COLUMN "app_version"  TEXT,
  ADD COLUMN "last_seen_at" TIMESTAMP(3);

-- The Web Push keys stop being universally required.
ALTER TABLE "app"."push_subscriptions" ALTER COLUMN "p256dh" DROP NOT NULL;
ALTER TABLE "app"."push_subscriptions" ALTER COLUMN "auth"   DROP NOT NULL;

-- Keep the invariant the columns used to carry:
ALTER TABLE "app"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_transport_shape"
  CHECK (
    (transport = 'web_push' AND p256dh IS NOT NULL AND auth IS NOT NULL)
 OR (transport = 'fcm'      AND platform IN ('android','ios'))
  );

CREATE INDEX "push_subscriptions_user_id_transport_idx"
  ON "app"."push_subscriptions" ("user_id", "transport");
```

`endpoint` stays the unique dedup key and holds the **FCM registration token**
for `transport = 'fcm'` — the token has exactly the property `endpoint` was chosen
for (stable per install, re-issued identically on re-subscribe). ⚠️ But
`PushSubscribeSchema` types it as `z.url()`, which an FCM token is not — see 9.3.

If a mixed-shape row is unacceptable, the alternative is a **separate
`app.device_push_tokens` table** with `(userId, token UNIQUE, platform, deviceId,
appVersion, lastSeenAt, createdAt)` and a second read inside `notifyUser`. Both
work; the single-table version keeps `notifyUser` to one query.

⚠️ Migration mechanics on this repo: an `ALTER TYPE … ADD VALUE` must be **alone
in its migration** and its value must not be used in the same transaction
(documented in `20260903170000_push_subscriptions/migration.sql`). A brand-new
enum type created and used in the same migration is fine.

### 9.2 New endpoints

Add to `apps/api/src/modules/notifications/notifications.controller.ts`, same
`profile:read` / `profile:write` reasoning as the existing three:

```
POST /api/me/push/device        → 204   register/refresh an FCM token
POST /api/me/push/device/remove → 204   deregister (sign-out, permission revoked)
```

Body contracts, new leaf module
`packages/contracts/src/notifications/device.ts` (a **leaf**, not a root-barrel
re-export — the root barrel breaks the API at runtime, and `client-barrel.test.ts`
fails the build for a barrel import from a layout-mounted component):

```ts
export const PUSH_PLATFORMS = ['android', 'ios'] as const;

export const DeviceTokenSchema = z.object({
  token: z.string().min(64).max(4096),          // FCM registration token
  platform: z.enum(PUSH_PLATFORMS),
  deviceId: z.string().min(1).max(200),         // stable install id
  appVersion: z.string().max(50).optional(),
}).strict();

export const DeviceTokenRemoveSchema = z.object({
  token: z.string().min(64).max(4096),
}).strict();
```

`.strict()` is mandatory here — it is the mass-assignment closure every DTO in
this repo relies on (`apps/api/src/modules/notifications/push.dto.ts`).

Then `apps/api/src/modules/notifications/push.dto.ts` gains
`export class DeviceTokenDto extends createZodDto(DeviceTokenSchema) {}` etc.

**Add the four authorization-matrix rows** (anonymous → 401, student → 204) in
`apps/api/src/test/authorization-matrix.int-spec.ts` — that spec is a coverage
gate and it only fails on the PR.

### 9.3 Why the existing `/push/subscribe` cannot be reused as-is

`PushSubscribeSchema.endpoint` is `z.url()`. An FCM registration token
(`dQw4w9Wg…:APA91b…`) is not a URL, so it **400s**. Either add the new endpoint
above (recommended — the shapes genuinely differ), or relax `endpoint` to
`z.string()` and lose the validation for web too. Do not relax it.

### 9.4 The sender — where the second transport plugs in

Exactly one function needs a branch:

**`PushService.notifyUser(userId, payload)`** —
`apps/api/src/modules/notifications/push.service.ts:120-127`.

```ts
async notifyUser(userId: string, payload: PushPayload): Promise<void> {
  const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;
  await Promise.all(subs.map((s) =>
    s.transport === 'fcm' ? this.sendFcm(s, payload) : this.send(s, payload),
  ));
}
```

- The current early return `if (!this.vapidPublicKey) return;` **must move inside
  the web-push branch**, or a deployment with FCM configured and VAPID not
  configured silently sends nothing.
- `sendFcm` mirrors `send`'s error handling: on FCM
  `UNREGISTERED` / `INVALID_ARGUMENT` (HTTP 404 / 400 `registration-token-not-registered`),
  **delete the row** — the exact analogue of the 404/410 prune.
  Everything else → `logger.warn`, keep the row.
- `sendFcm` must **never throw** (the class contract).

Everything upstream is already transport-agnostic:
- `NotificationsService.announce()` (`notifications.service.ts:520-553`) —
  `pushPayloadFor(notification)` then `this.push?.notifyUser(...)`. **No change.**
- `pushPayloadFor()` (`push-text.ts`) — **no change**, except that adding a kind
  to the push set is one `case`.
- `NotificationsModule` — add whatever provider/config the FCM sender needs.

### 9.5 FCM message shape

Send a **data-only** message (not `notification:`) so the Flutter app renders the
tray entry itself and keeps full control of RTL, the icon, the tag/collapse
behaviour and the tap target — the same reason the service worker does it today.

```jsonc
{
  "message": {
    "token": "<registration token>",
    "data": {
      "title": "<PushPayload.title>",
      "body":  "<PushPayload.body>",
      "url":   "<PushPayload.url>",     // app-relative, e.g. "/store/orders"
      "tag":   "<PushPayload.tag>"
    },
    "android": {
      "priority": "high",
      "collapse_key": "<PushPayload.tag>",     // ← this is how `tag` survives to Android
      "ttl": "86400s"
    },
    "apns": {
      "headers": {
        "apns-priority": "10",
        "apns-collapse-id": "<PushPayload.tag>",  // ← ≤ 64 bytes; hash longer tags
        "apns-push-type": "alert"
      },
      "payload": {
        "aps": { "alert": { "title": "…", "body": "…" }, "sound": "default" }
      }
    }
  }
}
```

⚠️ **iOS needs the `aps.alert` block.** A data-only APNs push is silent
(`content-available`) and iOS throttles it; the four tags that are shared or
per-object still need a visible alert, so `sendFcm` must build `apns.payload.aps`
from the same `title`/`body`.

⚠️ **`apns-collapse-id` is capped at 64 bytes.** `ayman-book-order-{uuid}` is
`17 + 36 = 53` — fine. `ayman-course-completed-{uuid}` is `23 + 36 = 59` — fine.
`ayman-homework-{uuid}` is 51 — fine. Everything shorter is fine. Still, hash
defensively if a future tag grows.

On the Flutter side, `tag` maps to:
- Android: the **notification id** you pass to `flutter_local_notifications`
  (a stable hash of the tag string), so a repeat replaces the previous one — plus
  `collapse_key` on the wire so FCM collapses undelivered ones too.
- iOS: `apns-collapse-id`, plus `threadIdentifier` if you want grouping.

### 9.6 Delivery + tap handling in Flutter

- **Foreground**: FCM does not show a tray entry on Android. Render the in-app
  toast instead — mirror `notification-stream.tsx`: title = `view.title`,
  description = `view.subtitle`, action label `'افتح'`, and update the badge.
- **Background / terminated**: show a local notification from the data message,
  RTL, with `/icons/icon-192.png`'s equivalent as the small icon.
- **Tap** → route to `data.url`. `url` is a **web path**; the app needs a
  path → route resolver. The nine push-producing URLs are:
  ```
  /admin/payments
  /admin/books
  /admin/inbox/{conversationId}
  /store/orders
  /courses/{courseSlug}
  /courses/{courseSlug}/lessons/{lessonId}
  /admin/homework/{submissionId}
  ```
  Plus, for in-app rows (never pushed): `/quizzes/{lessonId}`,
  `/quizzes/{lessonId}/attempt/{attemptId}/review`, `/dashboard?assistant=1`,
  `/notifications`.
- **Token refresh**: `FirebaseMessaging.instance.onTokenRefresh` →
  `POST /api/me/push/device` again. The upsert on `token` makes this idempotent.
- **Sign-out**: `POST /api/me/push/device/remove` **before** clearing the session,
  then `deleteToken()`. Otherwise the row keeps pointing at the previous account
  (the current upsert semantics reassign ownership only on the *next* register).
- **Permissions**: Android 13+ needs `POST_NOTIFICATIONS` at runtime; iOS needs
  `requestPermission()` and an APNs auth key uploaded to Firebase. Mirror the
  web toggle's states — never prompt on launch, prompt from a deliberate action,
  and when permanently denied show a settings hint (the web's equivalent line is
  `'المتصفح مانع التنبيهات — فعّلها من إعدادات الموقع'`; write a mobile-appropriate
  Arabic string and add it to `copy.notifications`, not to the widget).

### 9.7 Live updates without SSE

`GET /api/me/notifications/stream` is cookie-authenticated SSE that pings every
25 s. A Flutter client *can* hold it (`http.Client().send` on a streamed request),
but on mobile it burns the radio and dies on every backgrounding. Recommended
instead:

- foreground: **poll `GET /api/me/notifications/unread-count`** on an interval and
  on app-resume. The admin inbox poller already uses **30 s + refetch on
  `visibilitychange`** (`apps/web/components/admin/inbox-alerts.tsx:27, 132-151`),
  which spends 2 of the 60/minute budget — copy that number.
- background: FCM is the transport. It replaces SSE, it does not supplement it.

If you *do* want SSE on mobile, note it needs the session cookie in the request
and that `announce()` fires the SSE publish and the push send **in the same call**
— so a device holding both an SSE stream and an FCM token gets the event twice
and must dedupe on `notification.id`.

### 9.8 Extending push coverage to students

Today only admins hold subscriptions, so `course_completed` and the three
book-order pushes are written but never delivered
(`push-text.ts`: *"until a student-side UI subscribes a phone those three stay a
harmless no-op"*). Once the mobile app registers student devices, **eight kinds
start firing at students with no further server change** — verify that is intended
before shipping, especially `course_completed` (fires on the completion edge, so
it is once per course) and `homework_reviewed` (per submission).

The eight kinds with **no** push payload (`quiz_graded`, `extra_attempt_granted`,
`conversation_reply`, `instructor_message`, `payment_approved`, `payment_rejected`,
`subscription_expiring_soon`, `subscription_cancelled`) are a **product decision**,
not an omission. Adding any of them is one `case` in `push-text.ts` — and
`subscription_expiring_soon` additionally needs an `announce()` call added to
`SubscriptionExpirySweeper` (it currently only `emit`s).

### 9.9 Checklist of files to touch

| file | change |
|---|---|
| `apps/api/prisma/schema.prisma` | `PushSubscription`: `transport`, `platform`, `deviceId`, `appVersion`, `lastSeenAt`; `p256dh`/`auth` nullable; new `PushTransport` enum |
| `apps/api/prisma/migrations/<new>/migration.sql` | the DDL above + CHECK + index |
| `packages/contracts/src/notifications/device.ts` | **new leaf**: `DeviceTokenSchema`, `DeviceTokenRemoveSchema`, `PUSH_PLATFORMS` |
| `apps/api/src/modules/notifications/push.dto.ts` | `DeviceTokenDto`, `DeviceTokenRemoveDto` |
| `apps/api/src/modules/notifications/notifications.controller.ts` | `POST push/device`, `POST push/device/remove` |
| `apps/api/src/modules/notifications/push.service.ts` | `registerDevice()`, `unregisterDevice()`, `sendFcm()`, branch in `notifyUser()`, move the VAPID early-return into the web branch |
| `apps/api/src/modules/notifications/notifications.module.ts` | providers/config for the FCM sender |
| `apps/api/src/config/env.ts` | `FCM_PROJECT_ID` / `FCM_SERVICE_ACCOUNT_JSON` (or `GOOGLE_APPLICATION_CREDENTIALS`), **all-or-nothing `.refine()`** matching the VAPID one, and `optionalSecret` so an empty compose var is "unset" not "invalid" |
| `apps/api/.env.example` | the new vars |
| `apps/api/src/test/authorization-matrix.int-spec.ts` | 4 new rows |
| `apps/api/src/modules/notifications/push.service.spec.ts` | FCM branch: sends per token, prunes on `UNREGISTERED`, no-op unconfigured |
| `apps/mobile/pubspec.yaml` | `firebase_core`, `firebase_messaging`, `flutter_local_notifications` |
| `packages/contracts/src/copy/ar.ts` | any new mobile-specific permission strings, in `copy.notifications` |

⚠️ Import runtime values from the **subpath** (`@ayman/contracts/notifications`,
`@ayman/contracts/notifications/device`), never the root barrel — the root barrel
type-checks and then the API will not boot.

---

## 10. Quiet hours, batching, dedupe, per-kind preferences

Searched `apps/api/src`, `packages/contracts/src`, `apps/web` and
`apps/api/prisma/schema.prisma` for `quiet hour`, `notification preference`,
`mute`, `do not disturb`, `digest`. **Nothing exists.**

**What exists today:**

| mechanism | where | what it does |
|---|---|---|
| **Per-kind preferences** | — | **None.** There is no opt-out of any kind, no per-kind channel, no user-level notification settings row. A student who is subscribed gets everything that produces a payload. |
| **Quiet hours** | — | **None.** `homework_submitted` is explicitly designed to fire at eleven at night (*"which, for homework handed in at eleven at night, is every time"*). Nothing suppresses by clock. |
| **The only clock in the system** | `SubscriptionExpirySweeper` | `@Cron(CronExpression.EVERY_DAY_AT_10AM)` — a sweep time, not a quiet-hours policy. |
| **Batching** | — | **None on write.** `emitToPermission` uses one `createMany` for one event across N recipients, which is a query optimisation, not batching. `announceAll` is `Promise.all` of independent `announce` calls — N SSE publishes and N push sends. |
| **Dedupe: `subscription_expiring_soon`** | `subscription-expiry-sweeper.service.ts` + `subscription-expiry-dedupe.ts` | Application-level, on the triple `(userId, courseId, validUntil)`, over a **14-day** lookback (`DEDUPE_LOOKBACK_MS`). Not a DB unique index. A renewal that moves `validUntil` is a fresh triple. |
| **Dedupe: `course_completed`** | `CourseProgressService.recalculate` | Emitted on the **transition edge** into finished (`completedAt` was null and is now not), never on the recomputed value. `LessonProgressService` also short-circuits when `completedAt != null`, so a double-tap on «خلّصت الدرس» cannot double-congratulate. |
| **Dedupe: `instructor_message`** | `OutreachService` | A DB unique index `outreach_messages_dedupe_key`; a duplicate insert returns `'duplicate'` instead of throwing. |
| **Dedupe / collapse in the TRAY** | `push-text.ts` `tag` | The only per-delivery collapse. Shared tags (`ayman-inbox`, `ayman-homework`, `ayman-payments`, `ayman-book-orders`) mean the newest replaces the previous; per-object tags (`ayman-book-order-{orderId}`, `ayman-homework-{submissionId}`, `ayman-course-completed-{courseId}`) mean two different objects never collapse into one. The SSE toast's OS notification uses `ayman-notification-{kind}` — coarser, per kind. |
| **Idempotency on read** | `markRead` | `readAt: null` in the WHERE means a re-mark does not move the timestamp. |
| **First-count suppression** | `InboxAlertsProvider` | The admin inbox poller only alerts on a **rise from a known number** — `previous` starts `null`, so a page load never announces the whole backlog as new. **Mobile should copy this rule** for any count-driven alert. |
| **Sweeper single-flight** | `pg_try_advisory_xact_lock('ayman:payments:expiry-sweep')` | One replica runs the daily sweep; the rest no-op rather than double-emitting. |

**Implication for mobile:** if per-kind preferences or quiet hours are wanted,
they are net-new — a `notification_preferences` table keyed `(userId, kind)` plus
a filter inside `NotificationsService.announce` (before `pushPayloadFor`) or
inside `PushService.notifyUser`. Putting the filter in `emit` would be wrong: the
in-app row must still be written, because the row **is** the notification.

---

## 11. Quick reference — endpoint table

| method | path | permission | body | 2xx | notes |
|---|---|---|---|---|---|
| GET | `/api/me/notifications` | `profile:read` | — | 200 `NotificationFeedSchema` | `?cursor=<uuid>&limit=<1..50, default 20>` |
| GET | `/api/me/notifications/unread-count` | `profile:read` | — | 200 `{ unread: int }` | |
| GET | `/api/me/notifications/stream` | `profile:read` | — | 200 `text/event-stream` | `retry: 5000`, ping every 25 s |
| POST | `/api/me/notifications/:id/read` | `profile:write` | — | 204 | idempotent; 204 even for a foreign id |
| POST | `/api/me/notifications/read-all` | `profile:write` | — | 204 | |
| GET | `/api/me/push/public-key` | `profile:read` | — | 200 `{ publicKey: string\|null }` | `null` ⇒ VAPID unconfigured |
| POST | `/api/me/push/subscribe` | `profile:write` | `PushSubscribeSchema` (strict) | 204 | upsert on `endpoint` |
| POST | `/api/me/push/unsubscribe` | `profile:write` | `PushUnsubscribeSchema` (strict) | 204 | scoped `{ endpoint, userId }` |
| **POST** | **`/api/me/push/device`** | `profile:write` | `DeviceTokenSchema` | 204 | **TO BE ADDED** — FCM |
| **POST** | **`/api/me/push/device/remove`** | `profile:write` | `DeviceTokenRemoveSchema` | 204 | **TO BE ADDED** |

Anonymous on any of them: **401**. Over the rate limit: **429**. Malformed cursor: **400**.
