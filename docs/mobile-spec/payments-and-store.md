# Payments, Subscriptions, Books/Store & Finance — Flutter build spec

Everything a native client needs to reproduce the money side of the platform exactly.
Written against the repo at `feat/video-mirror`, 2026-09-08. Every claim cites a file.

> **Reading rule.** Where this document quotes an Arabic string it is *verbatim* from
> `packages/contracts/src/copy/ar.ts` (student) or `packages/contracts/src/copy/admin.ts`
> (admin). Do not paraphrase, do not re-translate, do not "improve" it. The copy files are
> the product.

---

## 0. Conventions that apply to every endpoint here

### 0.1 Base URL and prefix

The NestJS app sets a global prefix of `api` (`apps/api/src/main.ts:32`). Every path in this
document is written as it appears on the wire: `/api/payments/submissions`, etc. The web app
reaches it same-origin through a Next rewrite; a Flutter client points at
`https://<api-host>/api/...` directly.

### 0.2 Auth

- Session is a **better-auth cookie**, `httpOnly` (`apps/web/lib/csrf.ts` header note,
  `apps/api/src/auth/auth.config.ts`). There is **no bearer-token API** in this repo today.
  A Flutter client must run a cookie jar and persist cookies across launches, or the backend
  must grow a token flow (see §11 Mobile gaps).
- **CSRF**: every state-changing request (POST/PATCH/DELETE) on routes decorated
  `@RequireCsrf()` must carry header `x-csrf-token` with a non-empty value; the value is
  echoed from the `__Host-csrf` cookie. The API's `CsrfGuard` today only checks the header is
  **present and non-empty**, plus `Origin`/`Sec-Fetch-Site`
  (`apps/web/lib/csrf.ts:1-18`). Send it on every write anyway — the server may tighten it to
  a real double-submit equality check with no client change intended.
- Permissions relevant here (`apps/api/src/auth/permissions.ts:139-205, 250-269`):
  - student role holds `payment:submit`, `book-order:submit`, `homework:submit`, `progress:*`, …
  - admin holds `'*'`.
  - `payment:read` (see the queue), `payment:review` (decide money), `book-order:read`,
    `book-order:ship`, `book-order:create`, `book-order:write`, `book:read`, `book:write`,
    `expense:read`, `expense:write`.

### 0.3 Money

**Every monetary value on every wire shape in this area is an integer number of piastres
(EGP cents).** 250.00 EGP = `25000`. There are no floats anywhere. `Book.priceCents`,
`PaymentSubmission.amountCents`, `BookOrder.amountCents`, `Expense.amountCents`,
`Refund.amountCents`, `IncomingTransfer.amountCents` — all piastres, all `Int`.

Formatting rules the web uses (`apps/web/lib/price.ts`):

```
formatEGP(cents)      → Intl.NumberFormat('ar-EG-u-nu-latn', { maximumFractionDigits: 0 })
                        on cents/100.   → «250»           (student-facing surfaces)
formatEGPExact(cents) → same locale, maximumFractionDigits: 2
                        → «1,200» or «250.13»             (ACCOUNTS screens only)
```

`ar-EG-u-nu-latn` = Arabic locale with **Western/Latin digits**. This is a platform-wide rule:
every number, price, date and clock renders in Latin numerals even in Arabic copy. In Dart:
`NumberFormat.decimalPattern('ar_EG')` will give you Arabic-Indic digits — you must force
Latin digits (e.g. `NumberFormat('#,##0', 'en')` with an `ar` layout, or post-process).

`formatEGP` is deliberately lossy (rounds piastres away) — correct for a course price card,
**wrong on `/admin/finance`**, where three tiles are meant to add up and independent rounding
makes the visible arithmetic disagree. Use the exact formatter on every accounts screen.

Shipping has its own helper, because 0 is a real configured value and «0» reads as a broken
number: `formatShipping(cents, freeLabel)` returns `copy.books.shippingFree` (`'مجانًا'`) when
`cents === 0` (`apps/web/lib/price.ts`).

### 0.4 Dates

- Wire format for timestamps: **ISO-8601 datetime string** (`z.iso.datetime()`).
- Wire format for pure dates (`Expense.occurredOn`, `Refund.occurredOn`, export `from`/`to`):
  **`YYYY-MM-DD`** (`z.iso.date()`). The API converts with `new Date(\`${x}T00:00:00.000Z\`)`
  and reads back with UTC parts, never `toISOString().slice(0,10)` on a local date
  (`apps/api/src/modules/expenses/expenses.service.ts` `isoDate`).
- Student-facing dates: `Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium' })`,
  **no time component** on order cards (`apps/web/lib/book-order-view.ts`).
- Admin lists: `{ dateStyle: 'medium', timeStyle: 'short' }`, same locale.

### 0.5 Pagination

`ListQuerySchema` (`packages/contracts/src/admin/list.ts`):

```ts
page:    coerce int >= 1, default 1
perPage: coerce int, MUST be one of PAGE_SIZES = [10, 20, 50, 100], default 20
q:       string, max 120, default ''
dir:     'asc' | 'desc', default 'desc'
```

Every list response is `{ rows: T[], rowCount: number }` where **`rowCount` is the total
matching the filter, not the page length**.

⚠️ `/admin/finance` **overrides** `perPage` to `int min 1 max 2000, default 20`
(`packages/contracts/src/admin/finance.ts` `AdminFinanceQuerySchema`) because that service
fetches unpaginated and paginates in memory; the web page sends `perPage=200`. Inheriting the
closed `PAGE_SIZES` set made every request 400 in production. Do not send a value outside the
closed set to any *other* admin list.

### 0.6 Rate limits

Global throttler (`apps/api/src/app.module.ts:86-106`), keyed on session cookie hash with an
IP-keyed abuse ceiling:

| name   | window | limit |
| ------ | ------ | ----- |
| short  | 1 s    | 10    |
| medium | 60 s   | 60    |
| long   | 3600 s | 1000  |
| (ip)   | 60 s   | 1200  |

Route overrides in this area:

- `GET /api/books` — `{ short: 300/1s, medium: 3000/60s, long: 30000/3600s }`
  (`apps/api/src/modules/books/books.controller.ts` `BOOKS_THROTTLE`).
- `POST /api/book-orders` and `POST /api/book-orders/screenshot` —
  `{ short: 1/10s, medium: 3/600s, long: 10/3600s }` (`CREATE_THROTTLE`).
- `POST /api/book-orders/:id/payment` — `{ short: 1/5s, medium: 5/600s }` (`PAYMENT_THROTTLE`).

**A mobile client must not fan out.** The admin surfaces 429 after ~60 GETs/minute; the book
create route allows **one order per 10 seconds** and **three per 10 minutes** per caller.

### 0.7 Uploads

Screenshots are a **two-step** upload, deliberately (`packages/contracts/src/payments.ts`
header doc): a multipart POST returns a storage key, then a plain JSON POST carries that key.
Rationale: a JSON body is trivially Zod-validatable, and a failed submission (wrong number, a
duplicate pending claim) never has to re-upload the picture.

- Field name: `file`. Single file (`limits: { files: 1 }`).
- Max size: `MAX_UPLOAD_BYTES = 8 * 1024 * 1024` (8 MB)
  (`packages/contracts/src/admin/media.ts:23`).
- Server-accepted MIME: `image/png`, `image/jpeg`, `image/webp`, `image/avif`, `image/gif`;
  extensions `png jpg jpeg webp avif gif` (`media.ts:13-20`). Magic-byte sniffed, re-encoded
  by sharp to WebP, EXIF/GPS stripped.
- **The web deliberately opens the picker as `accept="image/*"`, not the allowlist** — iOS
  hands back HEIC which is *not* on the allowlist, and a narrow picker greys out real
  screenshots with no explanation. The client **compresses/re-encodes to JPEG before
  uploading** (`compressImage`, `apps/web/lib/upload-client.ts`). Flutter must do the same:
  accept anything from the gallery, transcode to JPEG (or WebP/PNG) client-side, then upload.
- Error mapping the web performs on the upload response (`upload-client.ts` `classify`):
  - HTTP 413 → `tooLarge`
  - body message contains `too large` → `tooLarge`
  - `not allowed` / `unsupported` → `badType`
  - `could not be processed` / `not an allowed document` → `unreadable`
  - anything else → `failed`
  All of these surface to the student as one string: `copy.subscribe.uploadError` /
  `copy.bookOrder.uploadError` = `'مقدرناش نرفع الصورة. جرب صورة تانية أو اتأكد من الاتصال بالنت.'`
- Screenshot key **prefixes** are enforced server-side:
  - `payment-proof/…` for `POST /api/payments/screenshot`
    (`PaymentsService.SCREENSHOT_PREFIX`)
  - `book-order-proof/…` for `POST /api/book-orders/screenshot`
    (`BookOrdersService.SCREENSHOT_PREFIX`)
  Submitting a key that does not start with the right prefix is a **400**
  (`'screenshotKey was not issued by POST /payments/screenshot'`). This is not an authz
  check — it stops a caller attaching an unrelated image (a course cover, a chat attachment)
  as "proof".
- Screenshots are **never** served through the public `/media/:prefix/:name` route. They are
  admin-only, streamed from `GET /api/admin/payments/submissions/:id/screenshot` /
  `GET /api/admin/book-orders/:id/screenshot`, `Content-Type: image/webp`,
  `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`,
  `Content-Security-Policy: default-src 'none'; sandbox`.

### 0.8 Phone numbers

Every phone field in this area goes through `egyptianPhone(requiredMessage)`
(`packages/contracts/src/phone.ts:125`):

1. trim
2. empty → the field's own required message
3. `normalizeEgyptianPhone` → `libphonenumber-js` `parsePhoneNumberWithError(value, 'EG')`;
   must be `isValid()` **and** `country === 'EG'`; returns E.164 (`+201012345678`)
4. failure → issue with the shared invalid message

Arabic-Indic digits (`٠١٢…`) and Extended Arabic-Indic (`۰۱۲…`) are converted to ASCII first
by `toAsciiDigits`. `01012345678`, `+201012345678`, `٠١٠١٢٣٤٥٦٧٨` all normalise to
`+201012345678`. **Always send E.164** — the client normalises before POSTing
(`subscribe-panel.tsx`, `book-order-panel.tsx` both call `normalizeEgyptianPhone` first and
show their own error string if it returns `null`).

For display, the panel renders the InstaPay number in local form:
`e164.replace(/^\+20/, '0')` → `01021196367` (`localEgyptianDigits`).

---

## 1. Enums (exact values)

All from `apps/api/prisma/schema.prisma` and mirrored 1:1 in the contracts.

```
PaymentPlan             : 'monthly' | 'quarterly' | 'term' | 'yearly'
PaymentSubmissionStatus : 'pending' | 'approved' | 'rejected'
IncomingTransferSource  : 'notification' | 'sms' | 'manual'
BookOrderStatus         : 'address_only' | 'paid' | 'shipped' | 'delivered' | 'rejected'
BookTerm                : 'first' | 'second' | 'full'
AccessScope             : 'platform' | 'course' | 'subject_teacher' | 'unassigned' | 'term'
GrantSource             : 'auto_free' | 'admin' | 'access_code' | 'purchase' | 'coupon' | 'scholarship'
ScholarshipKind         : 'orphans' | 'financial' | 'twinz'          (reserved, unused in v1)
EnrollmentStatus        : 'active' | 'suspended' | 'expired' | 'revoked' | 'completed'
EnrollmentSource        : 'free' | 'manual' | 'purchase' | 'coupon' | 'code'
ExpenseCategory         : 'filming' | 'printing' | 'equipment' | 'marketing' | 'staff' | 'services' | 'other'
FinanceStatus           : 'active' | 'expiring_soon' | 'expired'
FinancePlanFilter       : 'monthly' | 'quarterly' | 'yearly' | 'term' | 'free'
FinanceStreamFilter     : 'general' | 'languages'
FinanceSort             : 'paid_desc' | 'paid_asc'
AdminPaymentSort        : 'oldest' | 'newest' | 'amount_desc' | 'amount_asc'
AdminBookOrderSort      : 'oldest' | 'newest' | 'amount_desc' | 'amount_asc' | 'name_asc' | 'governorate'
AdminBookOrderFilter    : BookOrderStatus | 'deleted'   ← 'deleted' is a VIEW, never a status
AdminBookOrderStream    : 'general' | 'languages'
AdminTransferFilter     : 'unmatched' | 'matched' | 'dismissed' | 'all'
BulkBookOrderOutcome    : 'shipped' | 'delivered' | 'notice_failed' | 'skipped'
```

Meaning notes that matter:

- **`term` is a fourth, independent plan**, not "quarterly renamed". `monthly`/`quarterly`/
  `yearly` produce a `scope: 'course'` grant with a real calendar `validUntil`
  (1 / 3 / 12 months). `term` produces a `scope: 'term'` grant whose `validUntil` is
  **always `null`** — it never expires by date; it ends when an admin closes the term, which
  bulk-stamps `revokedAt` on every live term grant (`AccessGrant.validUntil` model doc,
  `TermService.setOpen`).
- **`deleted` is not a `BookOrderStatus`.** An order can be soft-deleted from any state and
  keeps the status it was deleted *from*. `BookOrderStatusSchema`'s own doc warns against
  ever adding a `deleted` member.

---

## 2. Subscription purchase — the student's journey, screen by screen

Entry point: the public course page for a **priced** course. Prices come from the catalog
read (`GET /api/catalog/courses/:slug`, `CatalogCourseDetailSchema`,
`packages/contracts/src/catalog.ts:96-146`):

```ts
monthlyPriceCents  : number | null   // null = that plan is not for sale
quarterlyPriceCents: number | null
yearlyPriceCents   : number | null
terms: Array<{ id: uuid, title: string, priceCents: number }>   // ONLY open, priced terms
bookTitle          : string | null   // الكتاب الورقي, independent of the plans above
bookPriceCents     : number | null
```

The InstaPay destination number comes from `GET /api/settings/public` →
`contact.instapay` (E.164 or `null`) (`packages/contracts/src/admin/settings.ts:178`).
⚠️ There is **no fallback to `contact.vodafoneCash`**, deliberately: the panel is labelled
«إنستاباي» and falling back would print a wallet number under an InstaPay heading.

### 2.0 Pre-flight banner on the course page (before the panel opens)

`apps/web/components/site/course-subscribe-state.tsx`. On mount, if there is a session:

- `GET /api/enrollments` → if this course is in the list → **redirect straight into the
  resumed lesson** `/courses/{slug}/lessons/{lastLessonId}`.
- `GET /api/payments/submissions/me` → `find()` (list is newest-first) the first row with
  `courseId === thisCourse`. If its `status === 'pending'`, render the pending banner
  **plus a WhatsApp button**, without needing to open the modal:

  - banner: `copy.subscribe.pendingStatus` =
    `'طلب اشتراكك في مراجعة دلوقتي، وهيوصلك إشعار أول ما يتم تفعيله.'`
  - button: `copy.subscribe.pendingWhatsapp` = `'اسأل عن حالة الطلب على واتساب'`
    (href from `contact.whatsapp`)

If either read fails, render nothing — the click-driven flow is the complete fallback.

### 2.1 `SubscribePanel` — state machine

`apps/web/components/site/subscribe-panel.tsx`. States:

```
'checking' → 'pending' | 'choose'
'choose'   → 'chooseTerm' (plan==='term' && terms.length > 1)
           | 'form'       (plan!=='term', or exactly one term)
'chooseTerm' → 'form'
'form'     → 'submitting' → 'success' | back to 'form' with an error
```

**Guard before anything renders**: if `instapay === null`, render only
`copy.subscribe.noNumber` = `'الاشتراك مش متاح دلوقتي. تواصل معانا على واتساب.'` and stop.

#### State `checking` (loading)

Fires `GET /api/payments/submissions/me` immediately. Renders
`copy.subscribe.checking` = `'لحظة واحدة…'`.

The newest submission for **this course** decides:

| latest.status                                | next state | side effect |
| -------------------------------------------- | ---------- | ----------- |
| `pending`                                    | `pending`  | — |
| `rejected`                                   | `choose`   | show rejection banner with `latest.rejectionReason` |
| `approved` && `validUntil !== null` && past  | `choose`   | show "lapsed" banner |
| anything else / none                         | `choose`   | — |
| **request threw**                            | `choose`   | swallow; the submit will 409 if there really is a pending one |

⚠️ `find()` on the newest-first list, never `filter` — an older rejection sitting *behind* a
later approval must not resurface.

#### State `pending`

Replaces the whole panel with `copy.subscribe.pendingStatus` (string above).

#### State `choose` — the plan picker

Header: `copy.subscribe.choosePlan` = `'اختار الباقة'`.

Optional banners **above** the header:

- rejection: `copy.subscribe.rejectedStatus` = `'اتراجع طلب اشتراكك الأخير'`, then `': '`,
  then the admin's `rejectionReason` **verbatim**.
- lapsed: `copy.subscribe.previouslySubscribedLapsed` =
  `'كنت مشترك في الكورس ده قبل كده وخلصت مدة اشتراكك — اشترك تاني عشان ترجع تكمل.'`
  Shown only when the newest approved submission's `validUntil` is in the past. Never for a
  `term` row (its `validUntil` is always `null`).

Then a **responsive grid of plan CARDS** (`.course-subscribe__plans`), each an icon + a name
+ a price. Accessible name is `"{name} — {price}"`, built from the same visible strings.

| condition                            | icon (lucide)   | name string                                                | price string |
| ------------------------------------ | --------------- | ---------------------------------------------------------- | ------------ |
| `monthlyPriceCents !== null`         | `CalendarClock` | `copy.subscribe.planMonthlyLabel` = `'شهر'`                | `priceLine`  |
| `quarterlyPriceCents !== null`       | `Layers3`       | `copy.subscribe.planQuarterlyLabel` = `'٣ شهور'`           | `priceLine`  |
| `terms.length === 1`                 | `BookOpen`      | `copy.subscribe.planTermLabel` = `'ترم'`                   | `priceLine` of `terms[0].priceCents` |
| `terms.length > 1`                   | `BookOpen`      | `copy.subscribe.planTermLabel` = `'ترم'`                   | `copy.subscribe.planTermFromPrice` = `'من {price} جنيه'` with the **cheapest** open term |
| `yearlyPriceCents !== null`          | `CalendarRange` | `copy.subscribe.planYearlyLabel` = `'سنة كاملة'`           | `priceLine`  |

`copy.subscribe.priceLine` = `'{price} جنيه'`, `{price}` already formatted by `formatEGP`.

Order on screen is exactly: monthly, quarterly, term, yearly.

Footer button: `copy.subscribe.back` = `'رجوع'` → closes the panel.

#### State `chooseTerm` (only when the course sells more than one open term)

Header: `copy.subscribe.chooseTermTitle` = `'اختار الترم'`.
One card per term: name = `term.title` (e.g. «الترم الأول»), price = `priceLine`.
Footer `'رجوع'` → back to `choose`.

#### State `form` — the transfer instructions + the two inputs

Rendered top to bottom:

1. **The amount, large**, restated because the student may have tapped past the card:
   `priceLine` with the plan's price (`monthly`/`quarterly`/`yearly` price, or the chosen
   term's `priceCents`). Skipped if it cannot be resolved.
2. **Instructions**: `copy.subscribe.instructions` =
   `'حوّل المبلغ على رقم إنستاباي {number}، وبعدين اكتب رقم الموبايل اللي حوّلت منه وارفع صورة سكرين شوت من التحويل.'`
   `{number}` is the **local-digit** form (`01…`).
3. `<PaymentBrand>` — the InstaPay brand mark.
4. **The number row**: the number rendered `dir="ltr"`, plus a copy button.
   `copy.subscribe.copyNumber` = `'نسخ الرقم'`; after a successful copy it shows
   `copy.subscribe.copied` = `'اتنسخ'` for **2000 ms**, then reverts.
   (Web has a `navigator.clipboard` → `execCommand('copy')` fallback; on Flutter just use
   `Clipboard.setData`.)
5. **Sender phone field.** Label `copy.subscribe.senderPhoneLabel` =
   `'رقم الموبايل اللي حوّلت منه'`. `type=tel`, `inputMode=tel`, `dir="ltr"`,
   placeholder `01xxxxxxxxx`.
6. **Screenshot picker.** Label `copy.subscribe.screenshotLabel` = `'صورة إثبات التحويل'`.
   Empty state text `copy.subscribe.screenshotPlaceholder` = `'اضغط هنا وارفع صورة السكرين شوت'`
   with an `ImagePlus` glyph; once a file is chosen the tile shows a **local preview** of the
   image, the file name, and `copy.subscribe.screenshotChange` = `'تغيير الصورة'`.
   Hint under it: `copy.subscribe.screenshotHint` =
   `'سكرين شوت واضح من تطبيق إنستاباي بيوضّح المبلغ والتاريخ.'`
7. Error line (`role="alert"`), if any.
8. Actions: primary `copy.subscribe.submit` = `'إرسال الطلب'` (while submitting:
   `copy.subscribe.submitting` = `'بنبعت الطلب…'`), and `'رجوع'` which goes back to
   `chooseTerm` when `plan==='term' && terms.length > 1`, else to `choose`.

#### Client-side validation, in this exact order (`submit()`)

```
if senderPhone.trim() === ''            → copy.subscribe.senderPhoneRequired
                                          'اكتب رقم الموبايل اللي حوّلت منه'
if normalizeEgyptianPhone(...) === null → copy.subscribe.senderPhoneInvalid
                                          'الرقم ده مش رقم مصري صحيح'
if no file                              → copy.subscribe.screenshotRequired
                                          'ارفع صورة إثبات التحويل'
```

#### Submit sequence

```
setStep('submitting')
1. POST /api/payments/screenshot        (multipart, field `file`)
   → on failure: copy.subscribe.uploadError, back to 'form'
2. POST /api/payments/submissions       (JSON)
   body: { courseId, plan, termId, senderPhone: <E.164>, screenshotKey }
   → 409: copy.subscribe.alreadyPending
           'عندك طلب اشتراك في مراجعة بالفعل لنفس الكورس — استنى الرد عليه الأول.'
   → any other error: copy.subscribe.genericError = 'حصل خطأ، حاول تاني.'
   → success: setStep('success')
```

`copy.subscribe.uploading` = `'بنرفع الصورة…'` exists in the copy file but the panel currently
shows `submitting` for the whole sequence.

#### State `success`

Replaces the whole panel with `copy.subscribe.success` =
`'تم استلام طلبك! هنراجعه ونفعّل اشتراكك، وهيوصلك إشعار أول ما يتم.'`

⚠️ **No turnaround time is ever promised.** The review is manual and a stated window becomes a
complaint the moment it slips. Do not add one.

### 2.2 What the server does on `POST /api/payments/submissions`

`PaymentsService.submit` (`apps/api/src/modules/payments/payments.service.ts:53-168`):

1. `screenshotKey` must start with `payment-proof/` → else **400**.
2. Course must exist and be `status === 'published'` → else **404**.
3. If `plan === 'term'`: the `termId` must be one of *this course's* terms **and**
   `term.isOpen` → else **400** `'this term is not open for subscription'`.
4. `resolvePlanPriceCents(course, plan, term?.priceCents ?? null)`
   (`apps/api/src/modules/payments/plan-price.ts`) — monthly→`monthlyPriceCents`,
   quarterly→`quarterlyPriceCents`, yearly→`yearlyPriceCents`, term→the term's own
   `priceCents`. `null` → **400** `'this course does not sell that plan'`.
5. **One outstanding claim per COURSE.** `findFirst({ userId, courseId, status: 'pending' })`
   → if found, **409** `'a submission for this course is already under review'`.
   Scoped to the course, not the term: a pending term-A claim blocks a term-B claim too.
6. In **one transaction**: create the submission, and emit a `payment_submitted` notification
   to everyone holding `payment:read`. (A row nobody is told about is a queue nobody knows
   has grown.)
7. After commit: announce to those admins; write audit `payment:submit`.

⚠️ `amountCents` is **derived server-side** from the course's own pricing. The student never
types an amount. The client must not send one — `SubmitPaymentSchema` is `.strict()`.

---

## 3. Payment endpoints — exact shapes

### 3.1 `POST /api/payments/screenshot`

- Permission: `payment:submit` (student). Multipart, field `file`, ≤ 8 MB, one file.
- 200 → `{ "screenshotKey": string }` (`SubmitPaymentScreenshotResultSchema`).
- 400 `'no file uploaded'` when the part is missing.
- Storage key looks like `payment-proof/<shard>/<name>.webp`.

### 3.2 `POST /api/payments/submissions`

Permission `payment:submit`. Body — `SubmitPaymentSchema`, **`.strict()`**
(`packages/contracts/src/payments.ts:56-72`):

```ts
{
  courseId:      string  // z.uuid()
  plan:          'monthly' | 'quarterly' | 'term' | 'yearly'
  termId:        string | null      // z.uuid().nullable().default(null)
  senderPhone:   string             // egyptianPhone('اكتب رقم الموبايل اللي حوّلت منه') → E.164
  screenshotKey: string             // min 1, max 255
}
```

Cross-field refinement:
`(plan === 'term') === (termId !== null)` — required exactly when `plan==='term'`, forbidden
otherwise. Violation message: **`'لازم تختار الترم اللي هتشترك فيه'`**, path `['termId']`.

200/201 → `PaymentSubmissionSchema`:

```ts
{
  id:              uuid
  courseId:        uuid
  courseTitle:     string
  plan:            PaymentPlan
  termId:          uuid | null      // null unless plan==='term'
  termTitle:       string | null
  amountCents:     int              // derived server-side, NEVER student input
  senderPhone:     string | null    // null for an admin-created row
  status:          'pending' | 'approved' | 'rejected'
  rejectionReason: string | null    // null unless status==='rejected'; shown verbatim
  validUntil:      iso datetime | null   // null while pending; the grant's CURRENT expiry once approved
  createdAt:       iso datetime
}
```

Errors: 400 (bad key / closed term / plan not sold), 404 (course missing or unpublished),
**409** (a pending claim already exists for this course), 401 (no session), 403 (no permission).

### 3.3 `GET /api/payments/submissions/me`

Permission `payment:submit`. Returns a **bare array** `PaymentSubmission[]` (not `{rows}`).
Ordering: `createdAt DESC, id DESC` — newest first
(`PaymentsService.listMine`, `payments.service.ts:171-209`).

⚠️ `validUntil` on each row is the **grant's current** `validUntil`, not a value frozen at
approval. A student who renewed before expiry extends *one* grant, so every approved
submission for that course reads the same, up-to-date date. Always `null` for a `term` row.

### 3.4 Admin: `GET /api/admin/payments/submissions`

Permission `payment:read`. Query — `AdminPaymentQuerySchema` = `ListQuerySchema` extended,
with `dir` and `q` **omitted**:

```
page, perPage (10|20|50|100), status?: 'pending'|'approved'|'rejected',
sort: 'oldest'|'newest'|'amount_desc'|'amount_asc'   (default 'oldest')
```

Omitting `status` entirely means "every status" (the web's «الكل» tab sends no key).

Ordering (`orderByForPayments`, `payments.service.ts:1001-1015`) — **every branch ends on
`id`**, because Postgres does not order ties stably and an unstable order under pagination
duplicates rows onto page two while dropping others:

```
oldest      → createdAt ASC,  id ASC     (default)
newest      → createdAt DESC, id DESC
amount_desc → amountCents DESC, id DESC
amount_asc  → amountCents ASC,  id ASC
```

Response `{ rows: AdminPaymentRow[], rowCount }`, `AdminPaymentRow`:

```ts
{
  id, userId, studentName,
  studentEmail: string | null, studentPhone: string | null,
  courseId, courseTitle,
  plan, termId: uuid|null, termTitle: string|null,
  amountCents: int,
  senderPhone: string | null,      // 'حوّل من' — reconciled against the real log
  status, rejectionReason: string | null,
  approvedBefore: int >= 0,        // approved submissions this student had BEFORE this one
  createdAt, reviewedAt: iso|null,
  isFree: boolean,                 // admin-comped — never counted as revenue
  hasScreenshot: boolean           // check this before requesting the screenshot route
}
```

`approvedBefore` is computed in **bulk for the whole page** (one query with `userId IN (...)`,
then filtered by `entry.createdAt < row.createdAt`), never per row.

### 3.5 Admin: `GET /api/admin/payments/submissions/:id/screenshot`

Permission `payment:read`. Streams the image. **404 when the submission has no screenshot at
all** (the normal state for an `adminManualSubscribe` row) — check `hasScreenshot` first.
Headers as in §0.7.

### 3.6 Admin: `POST /api/admin/payments/submissions/:id/approve`

Permission `payment:review`. No body.

200/201 → `ApprovePaymentResultSchema`:
```ts
{ id: uuid, status: 'approved', validUntil: iso datetime | null }
```
`validUntil` is `null` for an approved `term` submission.

Errors: 404 (no such submission), **409** `'this submission was already reviewed'`
(status ≠ `pending`).

Server behaviour (`PaymentsService.approve`, `payments.service.ts:458-561`), **all in one
transaction** so a submission is never `approved` with no grant behind it:

- For `monthly`/`quarterly`/`yearly`:
  - read the ONE live grant: `AccessGrant where { userId, courseId, scope:'course',
    source:'purchase', revokedAt: null }`
  - `validUntil = computeApprovalValidUntil(plan, now, existing?.validUntil ?? null)`
  - create or **extend** that grant (never stack a second one)
- For `term`: `writeTermGrant` — reuse a still-live grant for the SAME term, else create a
  new `scope:'term'` grant with `validUntil: null`. A previously **revoked** grant is left
  alone and a fresh row is created (`revokedAt` is permanent everywhere in this schema).
- `Enrollment.upsert({ create: { source:'purchase' }, update: { status:'active',
  source:'purchase' } })` — this reactivates a lapsed enrollment.
- Stamp the submission `status:'approved'`, `reviewedByUserId`, `reviewedAt`, `grantId`.
- Emit `payment_approved` notification to the student inside the transaction; `announce`
  after commit.
- Audit `payment:approve` (with `validUntil` as `.toISOString()`, never a raw `Date` — a raw
  `Date` hashes as `{}` and silently breaks the audit chain).

The controller then calls `TransfersService.learnFromApproval(id)` **best-effort**
(`.catch(() => undefined)`) — see §5.4.

#### The expiry arithmetic — reproduce it exactly

`apps/api/src/modules/payments/payment-expiry.ts`:

```ts
PLAN_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 }   // 'term' never reaches here

addMonthsClamped(date, months):
  // UTC throughout. Clamp to the LAST DAY of the target month rather than rolling over.
  day = date.getUTCDate()
  set date-of-month to 1, add `months` to the month
  daysInTarget = new Date(Date.UTC(y, m+1, 0)).getUTCDate()
  set date-of-month to min(day, daysInTarget)

computeApprovalValidUntil(plan, now, existingValidUntil):
  baseline = (existingValidUntil && existingValidUntil > now) ? existingValidUntil : now
  return addMonthsClamped(baseline, PLAN_MONTHS[plan])
```

So: 31 Jan + 1 month = **28/29 Feb**, not 3 Mar. Renewing **before** expiry extends from the
current expiry (the remainder is kept); renewing **after** it lapsed extends from `now`.

### 3.7 Admin: `POST /api/admin/payments/submissions/:id/reject`

Permission `payment:review`. Body — `RejectPaymentSchema`, `.strict()`:

```ts
{ reason: string }   // trim, min 1, max 400
```

201 → `{ ok: true }`. Errors: 404, **409** `'this submission was already reviewed'`.

Writes `status:'rejected'`, `rejectionReason`, `reviewedByUserId`, `reviewedAt`; emits
`payment_rejected` with the admin's own `reason` **verbatim** (never paraphrased). Audit
`payment:reject`.

### 3.8 Admin: student subscriptions

Controller `admin/students/:userId/subscriptions`
(`apps/api/src/modules/payments/admin-student-subscriptions.controller.ts`).

- `GET /api/admin/students/:userId/subscriptions` — permission `payment:read`.
  → `AdminSubscriptionRow[]` (bare array).
- `POST /api/admin/students/:userId/subscriptions` — permission `payment:review`.
  Body `AdminManualSubscribeSchema`, `.strict()`:
  ```ts
  {
    courseId: uuid,
    plan: PaymentPlan,
    termId: uuid | null,      // default null; refine: (plan==='term') === (termId !== null)
                              // violation message: 'لازم تختار الترم'
    isFree: boolean,          // true = comped; same access, never counted as revenue
    screenshotKey: string | null   // OPTIONAL here (unlike the student flow), max 255
  }
  ```
  → `AdminSubscriptionRow[]` (the student's full refreshed list).
- `DELETE /api/admin/students/:userId/subscriptions/:grantId` — permission `payment:review`.
  → `AdminSubscriptionRow[]`.

`AdminSubscriptionRow`:
```ts
{ id (grant id), courseId, courseTitle,
  plan: PaymentPlan | null, termId: string|null, termTitle: string|null,
  amountCents: int | null, isFree: boolean | null,
  validUntil: iso|null, revokedAt: iso|null, createdAt: iso }
```
Ordering: `revokedAt ASC, validUntil ASC, id DESC` — live ones first, soonest-expiring first
within each group. Revoked rows **stay in the list** (the answer to "why can't this student
open the course any more" must remain visible).

`adminManualSubscribe` (`payments.service.ts:580-707`) reaches the **exact same** grant /
enrollment state a genuine `approve()` produces (same `resolvePurchaseExpiry` /
`writePurchaseGrant` / `writeTermGrant`), and creates a `PaymentSubmission` already
`status:'approved'` with `senderPhone: null`. Differences from the student path:

- **not** gated on `term.isOpen` (this is the admin override)
- `amountCents = amountCollectedCents(planPriceCents, isFree)` → `isFree ? 0 : planPriceCents`
- emits the same `payment_approved` notification

`adminCancelSubscription` stamps `revokedAt` (never deletes), scoped
`{ id: grantId, userId, scope IN ('course','term'), source:'purchase' }` so a grant id from
another student cannot be cancelled through this student's URL. It deliberately does **not**
touch `Enrollment.status` — the door that closes is `resolveCourseAccess` reporting `revoked`.
Idempotent: re-cancelling does not move `revokedAt`. Audit `payment:admin-cancel-subscription`
with `alreadyRevoked`.

---

## 4. Incoming InstaPay transfers (التحويلات الواردة)

Runbook: `docs/runbooks/instapay-transfers.md`.
**Status at time of writing: code complete, nothing configured, nothing deployed.** With
`INSTAPAY_INGEST_TOKEN` unset the ingest route rejects every request and every payment is
approved by hand.

> ⚠️ Historical note for anyone who remembers a "piastre code" variant (an amount like
> `250.13` reserving a code per student): it was tried and **removed**. The runbook lists it
> under "the obvious automations that fail" — InstaPay transfers arrive as round pounds and a
> student's own bank app may refuse a fraction. There is no `payment-code.ts` in the tree.
> Do not build a mobile UI around it.

### 4.1 The mechanism the platform actually uses

An InstaPay push carries **an amount and a sender address** (`moazkoritam@instapay`, or an
IBAN-shaped `eg6300010002200000@instapay`). That address matches nothing the platform holds,
so the platform **learns** it:

1. The first payment from an unknown address is reviewed by hand.
2. Approving that student's claim records the address against that student
   (`student_payment_addresses`, `handle` UNIQUE, `userId` not unique).
3. Every later payment from that address is matched and approved with nobody looking —
   a course subscription **or** a book order.

Plus a weaker day-one route: an unknown address whose amount matches **exactly one**
outstanding thing in the entire platform is settled anyway, and the address is learned from
it. Two candidates → it refuses, every time.

The receiver is an **Android handset** running MacroDroid, because Android lets an app read
another app's notifications; iOS hands app notifications to no automation.

### 4.2 `POST /api/ingest/transfers` — the unattended webhook

`apps/api/src/modules/payments/transfers-ingest.controller.ts`. `@Public()` (no session).

- Header `x-instapay-token` must equal `INSTAPAY_INGEST_TOKEN` **in full**. Unset/empty env
  ⇒ the route rejects everything → **401**. This is checked *before* anything is parsed.
- Accepts **`text/plain`** (the body IS the notification text) as well as
  `application/json`. The plain-text path is a bespoke middleware
  (`transfers-ingest.body.ts`) that rewrites the body into `{ text }`. Rationale: asking a
  MacroDroid macro to build JSON means interpolating a notification with no escaping, and the
  day one contains a quotation mark the request 400s and it looks exactly like the money
  never arriving. Cap **64 KB**; over it, the body is left `undefined` (never truncated) and
  the DTO's `min(1)` turns it into a 400.

Body — `IngestTransfersSchema`, `.strict()`:
```ts
{ text: string,               // min 1, max 20_000
  capturedAt?: iso datetime } // omitted means "now"
```

Response — `IngestTransfersResultSchema`:
```ts
{ read: int,        // transfers the parser found
  created: int,     // new ledger rows written
  duplicates: int,  // already held and skipped
  matched: int,     // rows that settled something by themselves
  unreadable: int } // recognisably a transfer but did not parse
```

### 4.3 The parser (`transfer-parse.ts`)

Reproduce exactly if a mobile admin ever pastes a capture.

- `normalizeDigits`: Arabic-Indic `٠-٩` and Extended `۰-۹` → ASCII, `٫` → `.`.
  Character-for-character, so indices into the normalised string still index the original
  and `rawLine` can be sliced from the text the phone actually sent. Thousands separators are
  **not** removed here.
- `toCents("1,250.13")` → `125013`. Strips `,`, `٬`, whitespace; must match
  `^\d{1,9}(?:\.\d{1,2})?$`; must be a safe integer `> 0`; else `null`.
- `normalizeHandle` = `trim().toLowerCase()`. The join between
  `IncomingTransfer.senderHandle` and `StudentPaymentAddress.handle` is a **plain string
  equality**; a stray capital silently sends a known payer back to the manual queue.
- Notification regex (global):
  `استلمت\s+(AMOUNT)\s*(?:جنيه|EGP)\s+من\s+([^\s]+@[^\s]+)` where
  `AMOUNT = \d[\d,٬]*(?:\.\d{1,2})?`.
  Real text: «لقد استلمت 250.00 جنيه من moazkoritam@instapay».
- SMS regex (global): `تم\s+[إأا]ضافة\s+مبلغ\s+(AMOUNT)\s*(?:EGP|جنيه)`.
  Real text: «تم اضافة مبلغ 250EGP الى حساب رقم xxx1734 فى 07-SEP-2026».
  **An SMS names no sender and carries no clock time.**
- Markers for lines that are recognisably transfers but did not parse: `/استلمت/` →
  `notification`, `/[إأا]ضافة\s+مبلغ/` → `sms`. These produce a row with
  `amountCents: null, senderHandle: null` and `rawLine` = 20 chars before the marker through
  90 chars after (`UNREADABLE_CONTEXT = 90`). **Silence about money that arrived is the one
  outcome worth engineering against.**
- Dedupe *within one blob*: key `source|amountCents|senderHandle`. Unreadable rows are never
  deduped against each other.

### 4.4 Ingest, dedupe, settle (`TransfersService`)

`apps/api/src/modules/payments/transfers.service.ts`.

- `receivedAt = capturedAt ?? now`; `since = receivedAt − DEDUPE_DAYS(30) days`.
- For each parsed transfer:
  - `amountCents === null` → store it, `created++`, `unreadable++`, continue.
  - Look for a **held** row: `incomingTransfer.findFirst({ amountCents, createdAt >= since },
    orderBy createdAt DESC)`. If found → `duplicates++`. Then:
    - nothing to add (`transfer.senderHandle === null`) or the held row already has a handle →
      skip.
    - held row already matched → skip.
    - otherwise **upgrade** it: write `senderHandle`, `source: 'notification'`, `rawLine`,
      and *then* try to settle it. (A row first seen over SMS gains a sender when the push
      arrives, and only then can it identify anybody.)
  - Not held → store, `created++`, try to settle.
- Audit `transfer:ingest` with `{ read, created, duplicates, matched, unreadable }`,
  **`actorUserId: null`** (posted by a handset holding a token, with no session).

`settle(transferId, amountCents, senderHandle)`:

```
if senderHandle === null            → false        (an SMS settles nothing, ever)
known = studentPaymentAddress.findUnique({ handle: senderHandle })
owner = known ? { userId: known.userId } : {}       // an unknown address searches EVERYONE

claims = paymentSubmission.findMany({ status:'pending', amountCents, ...owner },
                                    orderBy createdAt ASC)
orders = bookOrder.findMany({ status:'address_only', deletedAt: null, amountCents, ...owner },
                            orderBy createdAt ASC)

if claims.length + orders.length !== 1  → false     // two candidates = a question, not an answer
if a claim:  PaymentsService.approveFromTransfer(claim.id, transferId)
             if it returned null → false (lost a race)
             if !known → learn(claim.userId, senderHandle, transferId)
else:        BookOrdersService.markPaidFromTransfer(order.id, transferId)
             if false → false
             if !known && order.userId !== null → learn(order.userId, ...)   // guest teaches nothing
```

`learn` creates a `StudentPaymentAddress`; a `P2002` unique violation is a **no-op**, not an
error (two transfers from one new address landing together resolve to whichever wrote first).
Audit `transfer:learn-address`, `actorUserId: null`.

### 4.5 Learning from an admin's own approval

`TransfersService.learnFromApproval(submissionId)`, called by
`AdminPaymentsController.approve` after `PaymentsService.approve` succeeds, best-effort:

- Look for unmatched, undismissed `notification` rows with the **same amount** received within
  `LEARN_WINDOW_DAYS = 3` days *before* the submission's `createdAt`.
- **Exactly one candidate or nothing happens.** Two identical amounts means the admin approved
  one of two and this cannot tell which; binding the wrong address would make *future*
  approvals wrong.
- If that handle is already known → return.
- Otherwise `learn(...)`, then `updateMany({ id: candidate.id, matchedSubmissionId: null },
  { matchedSubmissionId: submissionId })` so the money stops sitting under «محتاجة مراجعة»
  for a payment already settled.

### 4.6 Double-settle protection (the money invariant)

`incoming_transfers.matched_submission_id` and `matched_book_order_id` are both **UNIQUE**,
and every settle is a conditional `updateMany`:

```
PaymentsService.approveFromTransfer (payments.service.ts:742-834)
  tx: updateMany incomingTransfer WHERE id=? AND matchedSubmissionId IS NULL
      → count 0 ⇒ throw AlreadySettled (rolls the whole tx back, returns null)
  tx: updateMany paymentSubmission WHERE id=? AND status='pending'
      → count 0 ⇒ AlreadySettled
  then the same writePurchaseGrant / writeTermGrant as a manual approval, with adminId: null
  note on the grant: `instapay: matched transfer ${transferId}`
  reviewedByUserId stays NULL — no admin reviewed this
  emit payment_approved; announce after commit
  audit 'payment:auto-approve', actorUserId: null, metadata carries transferId
```

```
BookOrdersService.markPaidFromTransfer (book-orders.service.ts:2228-2281)
  tx: updateMany incomingTransfer WHERE id=? AND matchedSubmissionId IS NULL
                                        AND matchedBookOrderId IS NULL → matchedBookOrderId
  tx: updateMany bookOrder WHERE id=? AND status='address_only' AND deletedAt IS NULL
                           SET paidAt=now, status='paid'
      → count 0 ⇒ TransferSettleAborted (rolls back, reports "nothing settled")
  NO screenshotKey and NO senderPhone are written — nobody uploaded anything;
  the IncomingTransfer row IS the evidence and it points back here.
  emit 'book_order_placed' to holders of book-order:read; announce after commit
  audit 'book-order:auto-pay', actorUserId: null
```

**A retried webhook is a no-op, not a second course.**

### 4.7 Admin transfers screen

`GET /api/admin/transfers?filter=...` — permission `payment:read`.
`filter` is parsed with `AdminTransferFilterSchema.catch('unmatched')` — an unrecognised value
falls back to `unmatched`. Page size is a fixed **100** (`PAGE_SIZE`, no paging control).

| filter      | where |
| ----------- | ----- |
| `unmatched` | `matchedSubmissionId: null, dismissedAt: null` |
| `matched`   | `matchedSubmissionId: { not: null }` |
| `dismissed` | `dismissedAt: { not: null }` |
| `all`       | `{}` |

Ordering: `receivedAt DESC, id DESC`.

Response `AdminTransferListSchema` = `{ rows: AdminTransferRow[], rowCount }`:

```ts
{
  id: uuid,
  source: 'notification' | 'sms' | 'manual',
  amountCents: int | null,          // null on a line the parser could not read
  senderHandle: string | null,      // lower-cased; null for SMS
  senderStudentName: string | null, // whose address it is, when learned
  rawLine: string,                  // verbatim evidence
  receivedAt: iso,
  matchedSubmissionId: uuid | null, // at most one of the two is ever set
  matchedBookOrderId: uuid | null,
  matchedStudentName: string | null,// null for a guest book order
  matchedCourseTitle: string | null,// null for a book order
  dismissedAt: iso | null
}
```

Screen (`apps/web/app/(admin)/admin/transfers/page.tsx`), copy from `copy.admin.transfers`:

- eyebrow `'الفلوس'`, title `'التحويلات الواردة'`,
  subtitle `'اللي وصل فعلاً على إنستاباي، ومين اتفتحله كورس بيه.'`
- filter select labelled `'اعرض'` with options
  `'محتاجة مراجعة'` (unmatched, default) / `'اتطابقت'` (matched) / `'اتقفلت'` (dismissed) / `'الكل'` (all)
- **empty**: `'مفيش تحويلات هنا'` +
  `'التحويلات بتوصل هنا لوحدها من تليفون الأندرويد. لو لسه مش متظبط، الصق نص الإشعار في الخانة تحت.'`
- **one row**: the amount is the identity, rendered `formatEGPExact(cents) + ' ج'` and **never
  rounded**; `'مش مقروء'` when `amountCents === null`. Source pill:
  `'إشعار إنستاباي'` / `'رسالة البنك'` / `'مكتوبة بالإيد'`. Badges `'اتطابقت'` and `'اتقفلت'`.
  Then the sender handle (`dir="ltr"`), the timestamp, and the raw line.
- **the one explanatory sentence** — `explain(row)`, in this exact order:

  1. `amountCents === null` → `'وصل إشعار بس مقدرناش نقرا المبلغ منه — راجعه بنفسك.'`
  2. `matchedSubmissionId !== null` → `'فتح {course} لـ{student}'`
  3. `matchedBookOrderId !== null` → `'دفع طلب كتاب لـ{student}'`, or `'دفع طلب كتاب'` when
     `matchedStudentName === null` (guest)
  4. `senderHandle === null` → `'رسالة البنك مبتقولش مين حوّل — للتأكيد بس.'`
  5. `senderStudentName !== null` → `'التحويل من {student}، بس مفيش عنده طلب مستني.'`
  6. else → `'أول مرة نشوف العنوان ده. وافق على طلب الطالب وهنربطه بيه لوحدنا.'`

- action: a matched row links to `/admin/books` (book) or `/admin/payments?status=approved`
  (subscription); an unmatched, undismissed row shows the dismiss button `'اقفلها'`.
  Failure toast: `'مقدرناش نعمل ده دلوقتي، جرّب تاني.'`
- **paste box** at the bottom: title `'الصق نص الإشعارات'`, hint
  `'لو تليفون الأندرويد مش شغّال، الصق نص إشعار إنستاباي هنا — أو النص كله مرة واحدة، وكل اللي فيه هيتقرا.'`,
  placeholder `'لقد استلمت 250.00 جنيه من someone@instapay'`, submit `'اقرا التحويلات'`,
  result line `'اتقرا {read} · جديد {created} · فتح كورسات {matched} · متكرر {duplicates} · مش مقروء {unreadable}'`.

Other endpoints:

- `POST /api/admin/transfers/ingest` — permission `payment:review`, same
  `IngestTransfersSchema` body, same result. Session-authenticated (no token header).
- `POST /api/admin/transfers/:id/dismiss` — permission `payment:review`, no body →
  `{ ok: true }` (201). Stamps `dismissedAt` **only when it is still null**; never deletes.
  Audit `transfer:dismiss` with the admin as actor.

Audit actions to search for: `payment:auto-approve`, `book-order:auto-pay`, `transfer:ingest`,
`transfer:learn-address`, `transfer:dismiss`. **Every automatic one carries a null actor** —
that is how you tell "nobody decided this" from "an admin decided this".

---

## 5. The book store (قسم الكتب)

### 5.1 Public catalog — `GET /api/books`

`@Public()`, no session needed. Returns the **whole shop in one payload**
(`BookCatalogSchema`, `packages/contracts/src/books.ts`):

```ts
{
  shelves: BookShelf[],
  shippingCents: int >= 0,   // the LIVE fee, read from settings on every call
  total: int >= 0            // count of active books
}
```

`BookShelf`:
```ts
{ subjectId: uuid | null,      // null = the «كتب عامة» shelf
  subjectNameAr: string,
  subjectSlug: string | null,
  first: BookCard[], second: BookCard[], full: BookCard[] }
```

`BookCard`:
```ts
{ id: uuid, slug: string, titleAr: string,
  subtitleAr: string | null,          // «شرح + أسئلة + نماذج امتحانات»
  coverKey: string | null,            // a STORAGE KEY, never a URL — resolve via mediaUrl()
  descriptionAr: string | null,
  priceCents: int >= 0,
  comparePriceCents: int | null,      // struck-through "before"; DB CHECK forces > priceCents
  pageCount: int >= 1 | null,
  term: 'first'|'second'|'full',
  year: 1..3 | null,                  // a LABEL, never a filter
  inStock: boolean,                   // false only when stock === 0
  forGeneral: boolean, forLanguages: boolean,
  showOnLanding: boolean }            // the landing strip filters on this; the shop ignores it
```

Server rules (`BooksService.catalog`, `apps/api/src/modules/books/books.service.ts`):

- `where: { isActive: true }` only. **No year filter, no stream filter.** Every visitor sees
  every subject and every year; the year chip on the card is what tells them apart. A
  first-year student buying next year's book early is a sale, not a mistake to prevent.
- SQL order: `sortOrder ASC, year ASC, titleAr ASC`.
- Shelves are built **from the books**, so a subject with no books can never appear.
- Shelf order: subjects `localeCompare(a, b, 'ar')` (Arabic collation — the default sorts by
  code point and puts «إحصاء» after «رياضيات»), with the `subjectId === null` shelf **always
  last**.
- `inStock` is written `row.stock !== 0` — **`null` stock means «مش بنعد»** and is in stock;
  only a literal `0` is out of stock.
- `shippingCents` comes from `SiteSettings.store.shippingCents ?? BOOK_SHIPPING_CENTS (6500)`,
  read on **every call, never cached** — a cached fee is a fee that keeps being charged for
  minutes after it was changed.

Constants the client must honour (`packages/contracts/src/books.ts`):

```
BOOK_SHIPPING_CENTS = 6_500    // 65 EGP — the DEFAULT only; settings is the law
MAX_BOOK_QUANTITY   = 20       // per book, per order
MAX_CART_LINES      = 20       // distinct titles per cart
```

### 5.2 The cart — client-side, and the totals function

There is **no server-side cart**. The basket lives in component state on the shop page and is
deliberately **not** persisted (`books-shop.tsx` docblock): the whole flow is one screen, the
checkout opens as a dialog over it, and a persisted basket goes stale against a repriced
catalogue — a basket quietly showing yesterday's price is worse than an empty one. What *is*
persisted is an order already created but not yet paid for (see §5.5).

Totals are computed by the **shared contract function**, and the API uses the same one to
write the order — so the number on screen and the number in the database cannot drift
(`bookOrderTotals`, `packages/contracts/src/books.ts`):

```ts
bookOrderTotals(lines, shippingCents, discountCents = 0):
  itemsCents = Σ line.unitPriceCents * line.quantity
  shipping   = lines.length === 0 ? 0 : shippingCents      // charged ONCE, per ORDER
  discount   = clamp(discountCents, 0, itemsCents + shipping)
  return { itemsCents, shippingCents: shipping, discountCents: discount,
           totalCents: itemsCents + shipping - discount }
```

An empty cart totals **0**, not 65 — quoting a delivery fee for nothing is how a cart that
failed to load starts asking for money.

DB CHECK `book_orders_amount_is_the_sum`:
`amount_cents = items_cents + shipping_cents - discount_cents`. And
`book_orders_discount_within_total`: `discount_cents <= items_cents + shipping_cents`.

### 5.3 Shop screen (`/books` public, `/store` in-app)

Two URLs, **one component** (`BooksShop`), one stylesheet. `/books` is the marketing shop
(public, indexed, site chrome); `/store` is the same shop inside the student shell and is the
rail's «الكتب» destination. Two route groups may not resolve to one path, which is why the
history page is `/store/orders` rather than `/books/mine`.

Copy from `copy.books`:

- badge `'كتب المنهج'`, page title `'الكتب'`,
  lead `'اختار الكتب اللي محتاجها، حدد العدد، وابعت طلبك — والباقي علينا.'`
- meta title `'كتب أيمن أبو العلا — اطلبها وتوصلك البيت'`
- **shipping chip on the shelf, not only at checkout**:
  - `shippingCents > 0` → `'الشحن {price} مرة واحدة على الطلب كله — مهما كان عدد الكتب'`
  - `shippingCents === 0` → a *different sentence*, never the template with «٠»:
    `'التوصيل مجانًا — السعر شامل الشحن لحد باب البيت'`
- shelf heading = the subject name (or `'كتب عامة'`), with a count chip
  `'{n} كتاب'` (`shelfCount`)
- inside a shelf, three bands in this order, each rendered **only if non-empty**:
  `'الترم الأول'` (first) / `'الترم التاني'` (second) / `'السنة كاملة'` (full)
- card: cover (or generated art in the subject's hue), title, subtitle, then a meta row in
  **this order**: stream badge (عام / لغات) **first**, then `'الصف {n}'` (`yearChip`), then
  `'{n} صفحة'` (`pages`). The stream chip is first because it decides whether the book is for
  you at all — the شرح book and the لغات edition are near-identical rows.
- price row: `formatEGP(priceCents)`, plus a struck-through `formatEGP(comparePriceCents)`
  when set.
- the add control, replaced **in place** by a stepper (no reflow):
  - out of stock → disabled button `'خلص دلوقتي'` (`outOfStock`)
  - quantity 0 → `'ضيفه للطلب'` (`add`) with a `Plus`
  - quantity ≥ 1 → `[−] {qty} [+]`; the `−` button's a11y label is `'شيله'` (`remove`),
    the `+`'s is `'ضيفه للطلب'`; `+` disabled at `MAX_BOOK_QUANTITY`
  - setting quantity to 0 **removes the key** from the map — a `{id: 0}` line is a line the
    contract rejects
- basket panel (`aria-label` = `'طلبك'`):
  - title `'طلبك'`, empty `'لسه مختارتش أي كتاب'`
  - line: title, `formatEGP(price*qty)`, and a sub-line `'{quantity} × {price}'`
    (`lineQuantity`) with a `'شيله'` button
  - totals block: `'الكتب'` (subtotal) / `'الشحن'` (shipping, via `formatShipping`) /
    `'الإجمالي'` (total)
  - CTA `'كمّل الطلب'` (`checkout`), note under it
    `'هتكتب العنوان، وبعدين تحوّل وتبعت صورة التحويل.'`
- a **sticky bar** appears above the shelves once the basket is non-empty (phone), showing
  the total and the same CTA. Announcement string (`role=status`, `aria-live=polite`):
  `'الطلب فيه {n} كتاب — الإجمالي {price}'` (`cartAnnounce`)
- checkout dialog title `'طلبك'`; the summary lists `'{title} ×{quantity}'`
  (`lineTitleQuantity`) then the same totals block, then the order panel
- catalog empty → `'لسه مفيش كتب متاحة دلوقتي'` + `'أول ما ينزل كتاب هتلاقيه هنا.'`
- if a book was withdrawn between browsing and ordering:
  `'في كتاب في طلبك مبقاش متاح — حدّث الصفحة وجرب تاني'` (`staleCart`)

Deep link: the landing strip and the dashboard link `/books#book-{slug}`; the shop scrolls the
matching card into view on mount.

### 5.4 Ordering — two steps, two endpoints

`packages/contracts/src/book-orders.ts`. The address form is saved to the database **before
any payment exists**, so a student who abandons still leaves an admin something to see.

⚠️ **Ordering a book needs no account.** `create`, `payment`, `screenshot` and `getOne` are all
`@Public()`; only `GET /book-orders/mine` requires a session
(`apps/api/src/modules/book-orders/book-orders.controller.ts`). A signed-in caller still gets
`userId` attached; a guest gets `null`. All writes still require `@RequireCsrf()`.

#### `POST /api/book-orders/screenshot`

Public + CSRF + `CREATE_THROTTLE`. Multipart `file`, ≤ 8 MB →
`{ screenshotKey }` under prefix `book-order-proof/`.

#### `POST /api/book-orders` — step one, the address

Public + CSRF + `CREATE_THROTTLE`. Body — `CreateBookOrderSchema`, `.strict()`:

```ts
{
  courseId?: uuid,          // the course-page «اطلب الكتاب» flow
  items?: BookCart,         // the shop's basket
  fullName: string,         // trim, min 2 'الاسم الكامل مطلوب', max 120
  phone: E.164,             // egyptianPhone('رقم الموبايل مطلوب')
  altPhone: E.164,          // egyptianPhone('رقم موبايل تاني مطلوب للتواصل')
  governorateCode: string,  // EXACTLY 2 chars, 'لازم نحدد المحافظة'
  city: string,             // trim, min 1 'المدينة مطلوبة', max 100
  addressStreet: string,    // trim, min 1 'اسم الشارع مطلوب', max 200
  addressBuilding: string | null,  // trim, max 60, default null ('' → null)
  addressNote: string | null       // trim, max 300, default null
}
```

Refinement: **exactly one** of `courseId` / `items`, never both, never neither.
Message: `'الطلب لازم يبقى إما كتاب كورس واحد أو سلة كتب — مش الاتنين'`, path `['items']`.

`BookCart` = array of `{ bookId: uuid, quantity: int 1..20 }`, min 1
(`'لازم تختار كتاب واحد على الأقل'`), max 20 lines, **no duplicate `bookId`**
(`'الكتاب الواحد يتكتب مرة واحدة بالعدد المطلوب'`).
**There is no price field on a cart line, on purpose** — a price a browser can name is a price
a browser can set to 1.

Server (`BookOrdersService.create`, `book-orders.service.ts:438-523`):

- `governorateCode` must resolve to a real `Governorate` → else **400**
  `'governorateCode does not match a known governorate'`.
- Cart path (`priceCart`): `book.findMany({ id IN ids, isActive: true })`.
  - a book missing **or** inactive → **400**
    `'في كتاب في السلة مش متاح دلوقتي — حدّث الصفحة'`
  - `book.stock !== null && book.stock < quantity` → **400**
    `` `«${book.titleAr}» مفيش منه العدد ده دلوقتي` ``
    (a **refusal**, never a silent quantity reduction)
  - lines are written with `unitPriceCents` = `books.price_cents` and `unitCostCents` frozen
    from `books.unit_cost_cents`
- Course path (`priceCourseBook`): course must be `published` → else 404. The book is resolved
  by `courseBook()` (`apps/api/src/modules/books/course-book.ts`) — the **single** answer to
  «الكتاب بتاع الكورس ده»:
  1. a LIVE catalogue row with `showOnCourse: true` → that book (id, title, price, unit cost)
  2. a LIVE catalogue row with `showOnCourse: false` → **nothing** («الكتاب ده يتباع من قسم
     الكتب بس») ⇒ **400** `'this course has no book to order'`
  3. no row, or `isActive: false` → the legacy `courses.book_title` / `book_price_cents`
     pair, with `bookId: null` and `bookUnitCostCents: null`
  Stock is checked when there is a catalogue row.
- `totals = bookOrderTotals(lines, await books.shippingCents())` — the **live** fee, frozen
  onto the row.
- `userId` = the session's id **or null**. ⚠️ A guest order is **never** claimed by phone
  lookup at write time; the guest↔account link is made at **read** time
  (`listMine` unions on `phone`, `studentIdForOrder` resolves the notification recipient).
  Stamping the account here would turn the placing browser's next read into a 404.
- Audit `book-order:submit` with `{ userId, courseId, amountCents, lineCount, guest }`.

201 → `BookOrderSchema` (full shape below).

#### `POST /api/book-orders/:id/payment` — step two

Public + CSRF + `PAYMENT_THROTTLE`. Body — `SubmitBookOrderPaymentSchema`, `.strict()`:

```ts
{ senderPhone: E.164,      // egyptianPhone('اكتب رقم الموبايل اللي حوّلت منه')
  screenshotKey: string }  // min 1, max 255; must start with 'book-order-proof/'
```

Ownership (`ownershipWhere(userId)` + `deletedAt: null`,
`book-orders.service.ts:208-240`) — this is a **security-critical rule**:

- **Signed in** → `WHERE userId = <session id>`. Another account's order, or a guest order
  nobody owns, is a **404** through this session.
- **Anonymous** → `WHERE userId IS NULL`. The order id (a UUIDv7) is the credential. This is
  what makes guest checkout work at all, *and* what keeps an account-placed order (carrying a
  full name, two phone numbers and a home address) behind its account.
- ⚠️ **Never widen this to "match on the id alone."**

Then: `status` must be `address_only` → else **400** `'this order was already paid'`.

In one transaction: write `senderPhone`, `screenshotKey`, `paidAt: now`, `status: 'paid'`, and
emit `book_order_placed` to holders of `book-order:read`. Announce after commit.
Audit `book-order:pay`.

⚠️ **There is no pending→approved gate for a book order.** Submitting the screenshot *is*
"paid" — a book order grants no platform access, so the worst case of a bad screenshot is a
book shipped to the wrong story, which is a shipping-desk problem. The admin actually looks at
the screenshot at `markShipped`, before doing something irreversible
(`BookOrder` model doc, schema.prisma).

#### `GET /api/book-orders/:id`

Public, no CSRF (a GET changes nothing). Same ownership rule + `deletedAt: null`.
404 for anything else. This is what lets a guest browser turn a remembered id back into
"still `address_only`, or already `paid`?".

#### `GET /api/book-orders/mine`

Permission `book-order:submit` (session required). Returns a **bare array** `BookOrder[]`,
`orderBy createdAt DESC, id DESC`, `deletedAt: null`.

The where clause is a union (`book-orders.service.ts:1090-1117`):
```
{ deletedAt: null, OR: [ { userId },
                         { userId: null, phone: <this user's users.phone_number> } ] }
```
That second arm is «اللي اشتروا قبل ما يسجّلوا» — guest checkout leaves `userId` NULL forever,
so a student who ordered signed-out owns rows the first arm would never see. It matches on
`phone` **only, never `altPhone`** (the alternate number is routinely a parent's, and matching
on it would put one sibling's order in another's history), and only on rows still unclaimed
(`userId: null`). Both sides are canonical E.164 strings, so it is an equality, not a fuzzy
match. If the account has no phone the arm is dropped entirely.

#### `BookOrderSchema` — the student-facing order shape

```ts
{
  id: uuid,
  courseId: uuid | null,        // null for a CART order
  courseTitle: string | null,
  bookTitle: string,            // course's book, else the first line's title, else ''
  items: BookOrderLine[],
  amountCents: int,             // frozen at submit time
  itemsCents: int, shippingCents: int, discountCents: int,
  status: BookOrderStatus,
  fullName: string, phone: string, altPhone: string,
  governorateCode: string, city: string,
  addressStreet: string, addressBuilding: string | null, addressNote: string | null,
  senderPhone: string | null,   // null until step two
  paidAt: iso | null, shippedAt: iso | null, deliveredAt: iso | null,
  rejectedAt: iso | null,
  rejectionReason: string | null,  // non-null EXACTLY when rejectedAt is (DB CHECK)
  createdAt: iso
}
```

`BookOrderLine`:
```ts
{ bookId: uuid | null,          // null once the book row was deleted; the title survives
  titleAr: string,              // SNAPSHOT — a rename never rewrites a placed order
  unitPriceCents: int,          // SNAPSHOT — a reprice never rewrites a placed order
  quantity: int >= 1,
  forGeneral: boolean | null,   // read LIVE off the linked book, NOT snapshotted
  forLanguages: boolean | null, // both null together when there is no book
  year: int | null }            // live too; on a cart order this is the ONLY source of a year
```

⚠️ The stream/year pair is deliberately **live** while title and price are **frozen**: the
title and price are what the customer agreed to; which school the printed book is for is a
fact about the object, and the person packing the box should read the correction.

Lines are always ordered `titleAr ASC` (`ORDER_ITEM_SELECT`), so a receipt's lines never
shuffle between two loads.

### 5.5 `BookOrderPanel` — the order flow screen by screen

`apps/web/components/site/book-order-panel.tsx`. States:
`'checking' | 'address' | 'payment' | 'submitting' | 'success' | 'alreadyOrdered'`.

Guard: `instapay === null` → render only `copy.bookOrder.noNumber` =
`'طلب الكتاب مش متاح دلوقتي. تواصل معانا على واتساب.'`

#### `checking`

Reads the remembered order id from local storage, key
`ayman:book-order:{scope}` where scope is the `courseId` for the course flow and the literal
`'cart'` (`CART_ORDER_KEY`) for the shop (`apps/web/lib/book-order-storage.ts`). A course id is
a UUID so the two can never collide. Stored value is the opaque order id only — **never a
name, phone or address**. Every read/write is `try/catch`ed and no-ops when storage is blocked.

- no stored id → `address`
- `GET /api/book-orders/{id}` succeeds and `status === 'address_only'` → **prefill every
  address field from the fetched order** and go to `address` (⚠️ *not* straight to payment:
  landing on a transfer number with nothing saying where the parcel is going reads as broken;
  «المفروض لما أضغط على طلب الكتاب الأول أكتب العنوان بتاعي»)
- fetched but any other status → clear storage, go to `alreadyOrdered`
- fetch throws (stale id, 404) → clear storage, go to `address`

Loading text: `copy.common.loading`.

Also fires `GET /api/taxonomy` (`TaxonomySchema`) once for the governorate list. On failure
the select simply stays empty.

#### `address`

- amount line: `copy.bookOrder.priceLine` = `'{price} جنيه'` with the order **total**
  (delivery included) — ⚠️ since the shop shipped this is the *total*, not the book's own
  price; the breakdown that explains it sits in the basket summary above.
- section title `copy.bookOrder.addressTitle` = `'بيانات الاستلام'`
- fields, in this exact order, with these exact labels:

  | field | label | notes |
  | ----- | ----- | ----- |
  | fullName | `'الاسم بالكامل'` | |
  | phone | `'رقم الموبايل'` | tel, `dir=ltr`, placeholder `01xxxxxxxxx` |
  | altPhone | `'رقم موبايل تاني للتواصل'` | tel, `dir=ltr`, same placeholder |
  | governorateCode | `'المحافظة'` | select; placeholder option `'اختار المحافظة'`; **pinned governorates first**, then the rest (`taxonomy.pinnedGovernorateCodes`) |
  | city | `'المدينة'` | plain text — **no city taxonomy exists** in this codebase |
  | addressStreet | `'الشارع'` | |
  | addressBuilding | `'رقم العمارة (اختياري)'` | |
  | addressNote | `'تفاصيل إضافية (اختياري)'` | textarea, 2 rows, placeholder `'رقم الدور، الشقة، أو أي علامة مميزة'` |

- validation order and messages (`submitAddress`):
  ```
  fullName empty            → 'الاسم الكامل مطلوب'
  phone empty               → 'رقم الموبايل مطلوب'
  phone unparseable         → 'الرقم ده مش رقم مصري صحيح'
  altPhone empty            → 'رقم الموبايل التاني مطلوب'
  altPhone unparseable      → 'الرقم ده مش رقم مصري صحيح'
  governorateCode empty     → 'لازم تحدد المحافظة'
  city empty                → 'المدينة مطلوبة'
  addressStreet empty       → 'اسم الشارع مطلوب'
  ```
  (`copy.bookOrder.addressBuildingRequired` = `'رقم العمارة مطلوب'` exists but is unused —
  the building number is optional.)
- **Reuse rule.** If the panel is holding a resumed order that is still `address_only` and
  every normalised field matches it, `submitAddress` **skips the POST** and goes straight to
  `payment`. There is no PATCH on `/api/book-orders`, so an edit genuinely is a new row —
  reusing keeps that cost at "only when the student actually changed something".
  Comparison is on the *normalised, trimmed* values (`normalizeEgyptianPhone` on both phones),
  and `'' ` vs `null` are treated as equal for the two optional fields.
- buttons: `copy.bookOrder.addressSubmit` = `'التالي — الدفع'` (busy:
  `copy.bookOrder.addressSubmitting` = `'بنحفظ بياناتك…'`), and `'رجوع'` (`back`) → `onCancel`.
- POST failure → `copy.bookOrder.genericError` = `'حصل خطأ، حاول تاني.'`
  (There is **no 401 branch** — the endpoint is public.)
- On success: save the id to storage, go to `payment`.

#### `payment` / `submitting`

Identical UI to `SubscribePanel`'s payment step, priced from the **order's own**
`amountCents`:

- amount line `'{price} جنيه'`
- the order's line titles joined by `copy.bookOrder.itemSeparator` = `'، '` — read off the
  **order**, not the current cart, so a tab reopened days later shows what was actually bought
- instructions: `copy.bookOrder.instructions`, **identical text** to
  `copy.subscribe.instructions`
- `<PaymentBrand>`, the number row + `'نسخ الرقم'` / `'اتنسخ'`
- sender phone field, label reused from `copy.subscribe.senderPhoneLabel`
- screenshot picker, labels reused from `copy.subscribe.*`
- validation: `'اكتب رقم الموبايل اللي حوّلت منه'` → `'الرقم ده مش رقم مصري صحيح'` →
  `'ارفع صورة إثبات التحويل'` (all under `copy.bookOrder.*`, same strings)
- submit `copy.bookOrder.submit` = `'إرسال الطلب'` / `copy.bookOrder.submitting` = `'بنبعت الطلب…'`
- `'رجوع'` goes back to `address`
- upload failure → `copy.bookOrder.uploadError`; payment POST failure → `genericError`
- success: clear storage, go to `success`

#### `success`

`copy.bookOrder.success` =
`'تم استلام طلبك! بنتأكد من الدفع الأول، وأول ما الكتاب يتشحن هتوصلك رسالة هنا على المنصة بموعد الوصول.'`

⚠️ **It promises nothing about delivery timing, deliberately.** It used to say «هيوصلك خلال
٢-٣ أيام» at the moment the screenshot was uploaded — before anyone had looked at the transfer
— so a perfectly normal order was already "late" by the time it reached the courier. The day
count now lives in exactly one place: the `book_order_shipped` notification, counted from the
day the courier actually took it.

#### `alreadyOrdered`

`copy.bookOrder.alreadyOrdered` =
`'الطلب ده اتبعت وخلص قبل كده. لو محتاج حاجة تانية كلّمنا على واتساب.'`

### 5.6 The student's order history — `/store/orders`

`apps/web/app/(app)/store/orders/page.tsx`, card in
`apps/web/components/dashboard/my-book-orders-section.tsx`, status mapping in
`apps/web/lib/book-order-view.ts` (`MY_BOOK_ORDERS_HREF = '/store/orders'`).

Page copy (`copy.books.mine`): title `'طلبات الكتب'`, lead `'كل كتاب طلبته، وهو فين دلوقتي.'`
Dashboard section title `'كتبي'` with a link `'كل طلباتي'`.

Empty state: `'لسه ما طلبتش أي كتاب'` + `'كتب المنهج بتتشحن لحد باب البيت.'` + CTA
`'شوف الكتب'` → `/books`. Below a populated list: `'اطلب كتاب تاني'`.

⚠️ The fetch **swallows its own error and returns `[]`** (`fetchMyBookOrders`), so an
unreachable API renders the empty state rather than an error page. This is a deliberate trade
and it is why the dashboard card must never be the only place a student learns an order
exists. Reproduce the same behaviour: an empty list is not an error message.

Ordering: newest first, sorted **client-side** on `createdAt` (`newestFirst`) — the endpoint's
ordering is not part of the schema and must not be trusted to stay.

The `status → view` mapping is an **exhaustive switch with no default**
(`describeBookOrderStatus`):

| status | chip label | reassurance note | tone token | closed |
| ------ | ---------- | ---------------- | ---------- | ------ |
| `address_only` | `'مكمّلتش'` | `'الطلب اتسجّل بس لسه ماتدفعش. كمّل الدفع وهنجهّزه على طول.'` | `var(--warn)` | false |
| `paid` | `'بنجهّزه'` | `'استلمنا طلبك وبنجهّزه للشحن. ما تقلقش — أول ما يتشحن هتلاقي هنا إنه في الطريق.'` | `var(--info)` | false |
| `shipped` | `'في الطريق'` | `'الكتاب خرج ليك وفي الطريق. ساعات بيتأخر يوم أو اتنين، وده عادي — أول ما يوصلك هتلاقي هنا إنه اتسلّم.'` | `var(--e-ink)` | false |
| `delivered` | `'وصلك'` | `'الكتاب وصلك. لو في أي مشكلة فيه كلّم الدعم وإحنا نظبّطها.'` | `var(--ok)` | true |
| `rejected` | `'اترفض'` | `'الطلب ده اترفض.'` (lead-in only) | `var(--err)` | true |

`address_only` is the only state whose next move is the student's — hence the only one wearing
the warn colour. **Amber is the product's action colour and is deliberately not used for a
status a student cannot act on.**

For `rejected`, the admin's `rejectionReason` follows the note **verbatim**, prefixed with
`copy.books.mine.rejectionReason` = `'السبب:'`.

`closed: true` is when the support link `'كلّم الدعم'` is offered (a `wa.me` link built from
`contact.whatsapp`) — an order still moving has nothing a support chat could add.

Card body: the chip + `'اتطلب {date}'` (`placedOn`) on the header row; then one row per line
with the title, `'×{quantity}'` (`lineQuantity`, only when `quantity > 1`), a stream badge
**only when `forGeneral !== null && forLanguages !== null`**, and `formatEGP(unit*qty)`; then
the four-number breakdown `'الكتب'` / `'الشحن'` / `'الإجمالي'` (reusing `copy.books.*`).
Other date strings: `'اتشحن {date}'` (`shippedOn`), `'وصل {date}'` (`deliveredOn`).

### 5.7 Notifications the student receives

`packages/contracts/src/notifications.ts` + `copy.notifications`:

| kind | payload (beyond `base`) | title copy |
| ---- | ----------------------- | ---------- |
| `payment_approved` | `courseId, courseTitle, courseSlug, validUntil: iso\|null` | `'تم تفعيل اشتراكك في {course}'` |
| `payment_rejected` | `courseId, courseTitle, courseSlug, reason` | `'محتاجين نراجع اشتراكك في {course}'` (reason shown verbatim underneath) |
| `subscription_expiring_soon` | `courseId, courseTitle, courseSlug, validUntil` | `'اشتراكك في {course} هيخلص قريب'` |
| `subscription_cancelled` | `courseId, courseTitle, courseSlug, reason` | `'اشتراكك في {course} اتلغى'` |
| `book_order_shipped` | `orderId, bookTitle, deliveryDays: 1..14` | `'كتابك اتشحن — {book}'`, detail `'هيوصلك خلال {days} أيام عمل، والمندوب هيتصل بيك قبل ما يوصل.'` |
| `book_order_delivered` | `orderId, bookTitle` | `'الكتاب وصلك — {book}'` |
| `book_order_rejected` | `orderId, bookTitle, reason` | `'طلب الكتاب اترفض — {book}'` |

Admin-side kinds: `payment_submitted` (`'اشتراك جديد مستني مراجعة — {name}'`) and
`book_order_placed` (`'طلب كتاب جديد مدفوع — {name}'`, subtitle `'طلبات الكتب'`).

All three book kinds link to `MY_BOOK_ORDERS_HREF` (`/store/orders`), subtitle
`copy.notifications.bookOrderMineQueue` = `'كتبي'`.

⚠️ `courseTitle` / `courseSlug` / `bookTitle` / `deliveryDays` are all **resolved at read
time**, never stored on the payload — a renamed course must read as its new name and a stored
slug would 404.

`deliveryDays` (`apps/api/src/modules/book-orders/delivery-days.ts`):

```
NEXT_DAY_GOVERNORATES = { '01' (القاهرة), '21' (الجيزة) } → 3 working days
everything else                                          → 4 working days
```
Keyed on the **code**, never on `governorates.region` — the official classification puts
الجيزة in `upper` and الإسكندرية in `urban`, which is backwards for the two cities the courier
reaches soonest. When a governorate cannot be resolved, **promise the longer number**.

### 5.8 Subscription expiry sweeper

`apps/api/src/modules/payments/subscription-expiry-sweeper.service.ts`. Daily cron at 10:00,
guarded by `pg_try_advisory_xact_lock('ayman:payments:expiry-sweep')` so one replica runs it.

- window: `validUntil ∈ [now, now + 3 days]` (`WARNING_WINDOW_MS`), on
  `source:'purchase', scope:'course', revokedAt: null`, capped at 1000 candidates.
  **`scope:'term'` grants are never swept** — they have no calendar expiry.
- dedupe: look back **14 days** (`DEDUPE_LOOKBACK_MS`) for an existing
  `subscription_expiring_soon` notification with the same `userId + courseId + validUntil`.
  Wider than the warning window on purpose, so a grant sitting unrenewed inside the window is
  not re-notified every morning.
- one bad candidate is logged and skipped; it must not stop the batch.

⚠️ This is a **different window** from `/admin/finance`'s `expiring_soon` badge, which is
**7 days** (`EXPIRING_SOON_WINDOW_MS`, `finance-status.ts`). Deliberately different numbers
for different jobs: the badge only colours a page an admin opens by choice; the sweeper
interrupts a student.

---

## 6. Admin fulfilment — book orders

Controller `apps/api/src/modules/book-orders/admin-book-orders.controller.ts`,
service `book-orders.service.ts`. Screen `apps/web/app/(admin)/admin/books/page.tsx`.

Permission split, and it matters:
- `book-order:read` — see the list, the summary, the screenshot, the export
- `book-order:ship` — «اتشحن» and «وصل» (moving a parcel along is fulfilment)
- `book-order:create` — «أضف طلب كتاب»
- `book-order:write` — «ارفض» / «احذف» / «رجّعه» / edit the basket (deciding an order should
  not happen changes what an already-quoted customer gets; a shipping clerk should plausibly
  hold the first and never the second)

### 6.1 `GET /api/admin/book-orders`

Query — `AdminBookOrderQuerySchema` (= `ListQuerySchema` minus `dir`):

```
page, perPage (10|20|50|100), q (max 120),
status?: 'address_only'|'paid'|'shipped'|'delivered'|'rejected'|'deleted',
sort: 'oldest'(default)|'newest'|'amount_desc'|'amount_asc'|'name_asc'|'governorate',
stream?: 'general'|'languages',
year?: int 1..3
```

**The soft-delete rule, stated once** (`liveOrDeletedWhere`):
```
status === 'deleted' → { deletedAt: { not: null } }        // status filter DROPPED; the row
                                                            // keeps the status it was deleted from
otherwise            → { deletedAt: null, ...(status ? { status } : {}) }
```
Every other read on the platform is `deletedAt: null` too — including the sidebar badge, which
polls this same route with `status=paid`.

Ordering (`orderByFor`), **every branch ends on `id`**:
```
oldest      → createdAt ASC, id ASC        (default; the desk works first-come-first-served)
newest      → createdAt DESC, id DESC
amount_desc → amountCents DESC, id DESC
amount_asc  → amountCents ASC, id ASC
name_asc    → fullName ASC, id ASC
governorate → governorate.nameAr ASC, createdAt ASC, id ASC   (by NAME, not code — a courier route)
```

Search `q` spans (`adminSearchWhere`), all OR'd, `mode: 'insensitive'` on the **text** legs
only:
`fullName`, `city`, `addressStreet`, `addressBuilding`, `addressNote`,
`governorate.nameAr`, `items.some.titleAr`, `course.title`, `user.name`, `user.email`;
plus, when `phoneSearchDigits(q)` yields ≥ 3 digits, `contains` on `phone`, `altPhone`,
`senderPhone`.

`phoneSearchDigits`: `toAsciiDigits` → strip non-digits → drop a leading `20` or leading
zeros → require length ≥ 3. So `01015186`, `+201015186` and `201015186` all become `1015186`,
a substring of the stored `+201015186…` in all three cases. Fewer than 3 digits returns
`null` and the phone leg is dropped (one or two digits appear inside every number in the
table).

`stream` / `year` filters (`streamAndYearWhere`) are **two AND'd clauses, each an OR across
two sources**:
```
stream → OR[ items.some.book.{forGeneral|forLanguages} = true , course.{same flag} = true ]
year   → OR[ items.some.book.year = year                       , course.year = year ]
```
⚠️ Not one combined OR: «لغات أولى» must mean "a languages book AND a first-year book", and on
a mixed basket those can legitimately be two different lines.

`AdminBookOrderRow` adds to the student shape: `userId|studentName|studentEmail|studentPhone`
(all nullable — guest), `courseYear`, `courseForGeneral`, `courseForLanguages`,
`governorateNameAr`, `adminNote`, `hasScreenshot`, `deletedAt`, `deletionReason`, and
`previousOrdersFromPhone`.

`previousOrdersFromPhone` is one grouped COUNT for the whole page keyed on **`phone`, not
`userId`** — guest checkout means one person is several unlinked rows and the number is the
only thing they share. Soft-deleted orders are excluded from the count, and the row itself is
subtracted only when it is not itself deleted:
`max((countByPhone ?? 0) − (deletedAt === null ? 1 : 0), 0)`.

### 6.2 The admin books screen structure

Tabs (each a link that preserves `q`): `paid` (`'مدفوعة'`, the default — the list checked
daily), `shipped`, `delivered`, `address_only`, `rejected`, `all` (`'الكل'`),
`deleted` (`'المحذوفة'`, rendered with a dashed border when it is not the open tab, because it
is the one list whose contents are hidden from every other screen). Labels come from
`copy.admin.books.filter*` via a `Record<Tab, string>` so a sixth filter added to the contract
is a compile error rather than a tab nobody rendered.

Page size **50**, with a pager (`'السابق'` / `'التالي'` / «من» via `copy.admin.books.pager*`).
Plus two `ListControl` selects (sort, stream/year).

### 6.3 Transitions

| route | permission | body | result | refusals |
| ----- | ---------- | ---- | ------ | -------- |
| `POST /api/admin/book-orders/:id/ship` | `book-order:ship` | — | `{ id, status:'shipped', shippedAt }` | 400 `'this order already shipped'` / `'this order has not been paid yet'` / `'this order was deleted — restore it first'` |
| `POST /api/admin/book-orders/:id/deliver` | `book-order:ship` | — | `{ id, status:'delivered', deliveredAt }` | 400 `'this order was already marked delivered'` / `'this order was rejected — restore it to a live status first'` / `'this order has not been paid yet'` / deleted |
| `POST /api/admin/book-orders/:id/reject` | `book-order:write` | `{ reason }` | `{ id, status:'rejected', rejectedAt, rejectionReason }` | 400 `'this order was already rejected'` / deleted |
| `DELETE /api/admin/book-orders/:id` | `book-order:write` | `{ reason }` **(a DELETE with a body, deliberately — a reason in a query string prints in every proxy log)** | `{ id, deletedAt, deletionReason }` | 400 `'this order was already deleted'` |
| `POST /api/admin/book-orders/:id/restore` | `book-order:write` | — | `{ id, status }` | 400 `'this order is not deleted'` |
| `POST /api/admin/book-orders/ship` | `book-order:ship` | `{ ids: uuid[1..100], whatsapp?: boolean }` | `BulkBookOrderResult` | per-row |
| `POST /api/admin/book-orders/deliver` | `book-order:ship` | same | `BulkBookOrderResult` | per-row |
| `POST /api/admin/book-orders` | `book-order:create` | `AdminCreateBookOrderSchema` | `BookOrder` | 400 governorate / pricing |
| `PATCH /api/admin/book-orders/:id` | `book-order:write` | `AdminBookOrderPatchSchema` | `BookOrder` | see below |
| `GET /api/admin/book-orders/summary` | `book-order:read` | — | `{ revenueTotalCents, paidCount }` | |
| `GET /api/admin/book-orders/export` | `book-order:read` | query `{ status (required), from?, to? }` | XLSX stream | |

⚠️ The literal routes `ship` / `deliver` / `summary` / `export` are declared **before**
`:id/...` — Nest matches within a method in declaration order.

`markDelivered` is reachable from **`paid` OR `shipped`**, deliberately: Ayman hands books over
himself at the centre, and forcing «اتشحن» first would put a lie in the audit trail.
`shippedAt` is **not** back-filled on that path — a delivered order with `shippedAt: null`
correctly reads as «اتسلّم باليد».

`reject` is allowed from **every live status**, including `shipped` and `delivered` (a parcel
that came back, a transfer that turned out to be someone else's). Only an already-rejected or
a deleted order refuses.

`softDelete` **never touches `status`** (that would erase the state it was deleted from) and
**sends no notification** — deleting is administrative tidy-up of a list; the decision about
the customer is `reject`, and that one does notify. `restore` clears all three deletion
columns together and asks for no reason.

### 6.4 Bulk shipping — the WhatsApp / platform-message rule

`markShippedMany` (`book-orders.service.ts:1509-1651`). **One row at a time, not one
transaction** — sending is I/O to a device that can be offline and an outbound WhatsApp
message is not rollback-able.

Per row:
1. missing or `deletedAt !== null` → `skipped`, reason `'الطلب مش موجود'`
2. `status !== 'paid'` → `skipped`, reason `'اتشحن قبل كده'` (if shipped) else `'لسه مادفعش'`
3. ship it in a transaction (status, `shippedAt`, `shippedByUserId`, + `book_order_shipped`
   notification when there is an account), announce, audit `book-order:ship` with `bulk: true`
4. if `shipNoticeSentAt !== null` → `shipped`, no message (**the double-send guard**, checked
   *after* the ship so a retry of a row whose notice failed still gets its message)
5. build the notice text from `copy.bookShipNotice`:

   ```
   'يا {name}، كتابك سلّمناه لشركة الشحن النهاردة 📦\n\nهيوصلك خلال {days} أيام عمل بإذن الله، والمندوب هيتصل بيك على نفس الرقم ده قبل ما يوصل.\n\nأي حاجة، رد على الرسالة دي.'
   ```
   `{name}` is the **order's** `fullName` (guest orders have no account), `{days}` is
   `deliveryDaysFor(governorateCode)`.
   ⚠️ It says «سلّمناه لشركة الشحن», not «اتشحن»: «اتشحن» reads as "it is on your street" and
   makes day two a complaint.
6. **the platform message is the notice** — `outreach.postAdminMessage(studentId, text)` into
   the student's own thread, whenever there is an account. It cannot fail for a reason outside
   our control.
7. WhatsApp is a **second copy and opt-in** (`whatsapp: false` by default) — it leaves the
   platform through a personal, ban-able socket. **Exception**: a guest order has no thread,
   so WhatsApp runs regardless of the flag.
   - `NotOnWhatsAppError` → `shipNoticeError = 'الرقم ده مش على واتساب'`
   - anything else → `'الواتساب مش متوصّل — جرّب تبعت تاني'`
8. `reached = studentId !== null || noticeError === null`. Stamp `shipNoticeSentAt` only when
   reached; always write `shipNoticeError`. Outcome `shipped` when reached, else
   `notice_failed` — **the parcel is genuinely gone either way; the ship is never undone.**

`BulkBookOrderResult`:
```ts
{ rows: [{ id, outcome: 'shipped'|'delivered'|'notice_failed'|'skipped',
           fullName: string, reason: string | null }],
  succeeded: int, noticeFailed: int, skipped: int }
```
`markDeliveredMany` sends **no message** (the student is holding the book) and reports
`delivered` / `skipped`; a `BadRequestException` message becomes the row's reason, anything
else becomes `'مقدرناش نسجّله'`.

### 6.5 Admin create / edit an order

`AdminCreateBookOrderSchema` = the public address shape **plus**: `items` carrying its own
`unitPriceCents` (this route records what a human agreed to on the phone; forcing it back
through `books.price_cents` would mean changing the shop for everyone to discount one
customer), `shippingCents?`, `discountCents?`, `adminNote`, `paid: boolean`,
`senderPhone` (nullable), `screenshotKey` (nullable). `userId` is **always null** on an
admin-created order. `paid: true` stamps `paidAt: now` and `status: 'paid'` in the same write.

`AdminBookOrderPatchSchema` — every field optional; `items` **replaces** the lines
(`deleteMany` + `createMany` in one transaction); totals are **always recomputed** by
`bookOrderTotals` and never accepted from the client. Refusals:

- a **deleted** order → 400 `'الطلب ده متشال — رجّعه الأول لو عايز تعدّله'`
- touching money (`items` / `shippingCents` / `discountCents`) on a **delivered** order →
  400 `'الطلب ده وصل خلاص — لو الفلوس اتغيّرت سجّل مرتجع بدل ما تعدّل قيمة الطلب'`
- unknown governorate → 400

Deliberately **not** editable here: `status`, `paidAt`, `shippedAt`, the screenshot and the
phone numbers.

Admin line input (`AdminBookOrderLineInputSchema`): `{ bookId: uuid|null (default null),
titleAr: string trim 2..160 'اسم الكتاب مطلوب', unitPriceCents: int 0..10_000_000,
quantity: int 1..20 }`. Array 1..20 with **no duplicate non-null `bookId`**
(`'الكتاب الواحد يتكتب مرة واحدة بالعدد المطلوب'`) — `book_order_items` has a UNIQUE index on
`(order_id, book_id)` and Postgres treats NULLs as distinct, so several hand-typed «كتاب خاص»
lines are legitimate. `unitCostCents` for admin-typed lines is **looked up and frozen** from
the catalogue (`withFrozenCost`); the price stays the admin's, the cost is not part of the
negotiation.

### 6.6 The XLSX export — a packing list, not an invoice

`GET /api/admin/book-orders/export?status=<filter>&from=YYYY-MM-DD&to=YYYY-MM-DD`.
`status` is **required and never defaulted**; it is the *list's* filter (so «المحذوفة» is
exportable, which is the one case where seeing what was removed is the point). Every other
value excludes deleted rows.

Date widening: `from` → that date at 00:00Z with `gte`; `to` → the **day after** at 00:00Z
with `lt`. An inclusive `lte` on a bare date silently drops every order placed after midnight
on the last day, which is most of them.

⚠️ **No money columns.** The three price columns were removed: the file goes to a print shop
and a courier, neither is owed what a student paid, and a packing list that quotes prices is
one that gets quoted back. Rows are grouped عام / لغات with a real bordered rule between them
and counts at the top.

Response headers:
```
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="book-orders-<status>.xlsx"
Cache-Control: private, no-store
```

### 6.7 Admin book catalogue (`/api/admin/books`)

`apps/api/src/modules/books/admin-books.controller.ts`:

- `GET /api/admin/books` — `book:read` → `AdminBookRow[]` (bare array, **not paginated** — a
  shop with more titles than one screen is a different product). Order
  `sortOrder ASC, titleAr ASC`. Adds `unitCostCents` (admin-only; never on `BookCard`),
  `showOnCourse`, `courseId/courseTitle`, `isActive`, `stock`, `sortOrder`,
  `orderedCount` (one grouped SUM over `book_order_items.quantity`), `updatedAt`.
- `POST /api/admin/books` — `book:write`, `AdminBookCreateSchema`
- `PATCH /api/admin/books/:id` — `book:write`, `AdminBookPatchSchema`
  (⚠️ built with `partialWithoutDefaults`, never `.partial()` — a plain `.partial()` keeps
  each field's `.default()` and a `{ titleAr }` patch would arrive carrying `isActive: true`,
  `stock: null`, `sortOrder: 0` and write all of them)
- `DELETE /api/admin/books/:id` — `book:write`

Validation and conflicts:
- `slug`: trim, 2..80, must not contain `/`, `.` or whitespace →
  `'الرابط ما ينفعش يحتوي على مسافة أو نقطة أو شرطة مائلة'`. Citext-unique →
  409 `'في كتاب تاني بنفس الرابط'`
- `courseId` is UNIQUE across books → 409 `'الكورس ده مربوط بكتاب تاني بالفعل'`
- `comparePriceCents` must be `null` or `> priceCents`, re-checked on PATCH against the row as
  it *will be* → 409 `'السعر قبل الخصم لازم يكون أعلى من السعر الحالي'`
- at least one of `forGeneral` / `forLanguages` →
  `'لازم تحدد الكتاب لمدارس عام ولا لغات ولا الاتنين'`
- unknown subject → 404 `'المادة دي مش موجودة'`; unknown course → 404 `'الكورس ده مش موجود'`
- `priceCents` / `unitCostCents` / `comparePriceCents`: int, 0..10_000_000 (100,000 EGP cap —
  the ceiling is about the extra zero, not about what a book could cost)
- **placement normalisation**: `courseId === null` ⇒ the service forces `showOnCourse: false`.
  It only ever *clears* — re-linking a book does not re-tick the box.
- deleting a book does **not** delete orders (`book_order_items.book_id` is `ON DELETE SET
  NULL` and the line keeps its own title and price). The admin UI still leads with «اخفيه»
  (`isActive: false`).

---

## 7. Entitlement — what a student can actually open

This is the part a mobile client must not reimplement from intuition.

### 7.1 The two objects

- **`AccessGrant`** — the entitlement. Scope + source + validity window + `revokedAt`.
- **`Enrollment`** — one row per (user, course), UNIQUE. `status`, `source`, `lastLessonId`,
  `progressPercent`. It is the **key every lesson read is gated on**, which is why entitlement
  is checked *before* one is minted.

They are **not** interchangeable. An enrollment with a lapsed grant still exists and still
reads `status: 'active'`; the door is closed by the grant, not the enrollment.

### 7.2 `resolveCourseAccess(userId, courseId)` — the exact resolution order

`apps/api/src/modules/entitlement/entitlement.service.ts:87-176`.

```
1. Load course { id, status, subjectId, requiresGrant }.
   not found                → 404 (throws)
   status !== 'published'   → { allowed:false, reason:'course_not_published' }

2. Which scopes can satisfy this course:
     requiresGrant === true  → [ {scope:'course', courseId},
                                 {scope:'subject_teacher', subjectId: course.subjectId},
                                 {scope:'term', courseId} ]
     requiresGrant === false → the same THREE, plus {scope:'platform'}

   ⚠️ `term` is matched on courseId ALONE here (never termId). This method answers
      "does this student have SOME access to this course at all" — the enroll-time
      question — not "which term".

3. grants = accessGrant.findMany({ userId, OR: scopes })
            orderBy [ validFrom DESC, id DESC ]

4. grants.length === 0 → { allowed:false,
                           reason: requiresGrant ? 'needs_course_grant' : 'no_grant' }

5. Walk the grants in that order, keeping a `fallback` that records the most
   specific failure seen so far. For each grant:
       revokedAt !== null                       → fallback = 'revoked';        continue
       validFrom  >  now                        → fallback = 'not_yet_valid';  continue
       validUntil !== null && validUntil <= now  → fallback = 'expired';        continue
       otherwise → RETURN { allowed:true, grantId, scope, validUntil }

6. If nothing was allowed → return the fallback.
```

The **first live grant in `validFrom DESC, id DESC` order wins**, and the returned `scope` is
what the term check below keys on.

Return type is always an object, never a boolean:
```ts
{ allowed: true, grantId, scope, validUntil: Date | null }
| { allowed: false, reason:
     'no_grant' | 'not_yet_valid' | 'expired' | 'revoked'
   | 'course_not_published' | 'needs_course_grant' | 'needs_term_grant' }
```

### 7.3 `resolveTermAccess(userId, courseId, termId, courseAccess)`

Called **only** by `LessonAccessService.require`, and only when the lesson's section belongs
to a term.

```
if (!courseAccess.allowed || courseAccess.scope !== 'term') return courseAccess;   // unchanged
```
⇒ A course-wide grant (`platform`, `course`, `subject_teacher`) **covers every term
regardless of open/closed state**. Only `scope: 'term'` is term-specific.

Otherwise: load `accessGrant.findMany({ userId, scope:'term', courseId, termId })`, same
`validFrom DESC, id DESC` order, same walk, fallback `'needs_term_grant'`.
A term closed by an admin surfaces here as `'revoked'`.

### 7.4 `LessonAccessService.require(userId, lessonId)`

`apps/api/src/modules/progress/lesson-access.service.ts:92-146`. In order:

1. `resolve()` — ownership + publication. The `where` contains
   `enrollments: { some: { userId } }`, so an unenrolled caller gets **no row**. Both "no such
   lesson" and "not your lesson" → **404** (a 403 would confirm the lesson exists to anyone
   iterating ids).
2. **Live grant re-check**: `resolveCourseAccess`. If not allowed **and** the reason is in
   `LAPSED_GRANT_REASONS = { 'expired', 'revoked', 'not_yet_valid' }` → **403** with that
   reason as the message.
   ⚠️ `no_grant` and `needs_course_grant` are deliberately **excluded**: those describe the
   course's *current* `requiresGrant` policy, which is an enrollment-time gate only. A course
   closed to new students after this one joined must not evict them.
3. **Term re-check** when `context.termId !== null` → `resolveTermAccess`; not allowed →
   **403** with that reason.
4. Progression gate `LessonGateService.isAvailable` → not available → **404**.

So a Flutter player must handle **403 with a body message of `expired` / `revoked` /
`not_yet_valid` / `needs_term_grant`** as "your access lapsed — here is the way back to
renewing", and **404** as "this lesson is locked or does not exist" (never disclose which).

### 7.5 `enroll(userId, courseId)`

1. Course must be `published` → 404.
2. `ensurePlatformGrant(userId)` — the "v1 is free for every registered student" row, created
   lazily on first enrollment, `scope:'platform'`, `source:'auto_free'`. Created for **every**
   student even on a closed course: it is the row that records when they started using the
   platform, and skipping it would shut every free course too. A `P2002` race re-reads the
   winner's row.
3. `resolveCourseAccess` — **before** any enrollment row exists. Not allowed → **403 with
   `access.reason` as the message**. A row created first and judged after is a door already
   open.
4. `enrollment.upsert({ create: {}, update: { status: 'active' } })` — idempotent.
5. Returns `{ enrollmentId, access, resumeLessonId }` where `resumeLessonId` is
   `enrollment.lastLessonId ?? firstLessonId(courseId)`; `firstLessonId` is the first published
   lesson of the first published section ordered
   `section.position ASC, section.id ASC, lesson.position ASC, lesson.id ASC`, and may be
   `null` for a published course with no published lessons (render a disabled button, do not
   navigate to `/lessons/null`).

### 7.6 What a paid approval writes

`writePurchaseGrant` (course-wide):
```
existing live purchase grant?  → UPDATE validUntil
otherwise                      → CREATE { scope:'course', source:'purchase',
                                          grantedByUserId: adminId | null,
                                          validFrom: now, validUntil, note }
then Enrollment.upsert({ create: { source:'purchase' },
                         update: { status:'active', source:'purchase' } })
```
`writeTermGrant` (term):
```
live grant for the SAME term?  → reuse it (no-op)
otherwise                      → CREATE { scope:'term', termId, source:'purchase',
                                          validFrom: now, validUntil: NULL, note }
                                 (a previously REVOKED one is left alone — revokedAt is
                                  permanent everywhere in this schema)
then the same Enrollment.upsert
```
`note` values: `purchase: submission {id}` (manual approve),
`manual: recorded by admin {adminId}` (adminManualSubscribe),
`instapay: matched transfer {transferId}` (auto-approve).
`grantedByUserId` is `null` for anything nobody issued by hand.

**Never more than one live `scope:'course'` `purchase` grant per (user, course).**
Two would make revoking a course a two-step operation and force
`resolveCourseAccess` to reason about which of several overlapping windows is authoritative.
The submissions table is already the append-only payment history; the grant only ever says
"valid until when".

Term grants are the exception: several live ones for one course at once is legitimate, one per
term.

DB constraint `courses_priced_requires_grant`:
```
(monthly_price_cents IS NULL AND quarterly_price_cents IS NULL AND yearly_price_cents IS NULL)
OR requires_grant
```
⇒ **Every priced course has `requiresGrant = true`**, so the platform grant never opens one.

---

## 8. Admin finance — the exact computations

Three tabs: «النظرة العامة» (`/admin/finance`), «المشتركين» (`/admin/finance/subscriptions`),
«المصروفات» (`/admin/finance/expenses`) — `copy.admin.finance.tabOverview/tabSubscriptions/tabExpenses`.
Eyebrow `'الحسابات'`, title `'الاشتراكات والإيرادات'`,
subtitle `'مين دفع، قد إيه، واشتراكه هيخلص إمتى.'`

**A mobile admin view must agree with the web to the piastre. Use the API's numbers; add
nothing up yourself.** The overview endpoint exists precisely because two surfaces subtracting
their own way is how «صافي الربح» ends up with two values — and that has already happened once
in this repo (see `book-revenue.ts`'s docblock).

### 8.1 `GET /api/admin/expenses/overview` — «النظرة العامة»

⚠️ Permission is **`expense:read`, not `payment:read`** — this is the whole P&L, and holding it
should not be implied by being allowed to review one screenshot.

`AdminFinanceOverviewSchema` (`packages/contracts/src/admin/expenses.ts`), all piastres,
**all all-time unless the name says otherwise**:

```ts
{
  subscriptionRevenueCents, bookRevenueCents, revenueTotalCents,
  subscriptionRefundsCents, bookRefundsCents, refundsTotalCents,
  subscriptionNetRevenueCents, bookNetRevenueCents, netRevenueTotalCents,
  expensesTotalCents,
  expensesByCategory: [{ category: ExpenseCategory, amountCents }],   // >0 only, desc
  bookCostOfSalesCents, bookCostUnknownCount,
  bookProfitCents, bookItemsNetCents, bookShippingCents,
  netCents,
  months: FinanceMonth[]      // newest first, 18 of them
}
```

Computations (`apps/api/src/modules/expenses/finance-overview.service.ts`):

```
subscriptionRevenueCents = SUM(payment_submissions.amount_cents)
                           WHERE status='approved' AND is_free = false
                           -- all time, NO reviewed_at bound

bookRevenueCents         = SUM(book_orders.amount_cents) WHERE BOOK_REVENUE_WHERE
BOOK_REVENUE_WHERE       = { status IN ('paid','shipped','delivered'), deletedAt: null }

revenueTotalCents        = subscriptionRevenueCents + bookRevenueCents

subscriptionRefundsCents = SUM(refunds.amount_cents) WHERE submission_id IS NOT NULL
bookRefundsCents         = SUM(refunds.amount_cents) WHERE book_order_id IS NOT NULL
refundsTotalCents        = the two summed

subscriptionNetRevenueCents = subscriptionRevenueCents - subscriptionRefundsCents
bookNetRevenueCents         = bookRevenueCents         - bookRefundsCents
netRevenueTotalCents        = revenueTotalCents        - refundsTotalCents

expensesTotalCents  = Σ over groupBy(category) of SUM(amount_cents), zero buckets dropped

bookCostOfSalesCents = Σ over book_order_items JOIN book_orders (BOOK_REVENUE_WHERE)
                         of  quantity * unit_cost_cents        -- the LINE's frozen snapshot
bookCostUnknownCount = COUNT(*) FILTER (WHERE unit_cost_cents IS NULL) over the same set
bookItemsCents       = Σ quantity * unit_price_cents            over the same set
bookShippingCents    = (SELECT SUM(shipping_cents) FROM book_orders WHERE BOOK_REVENUE_WHERE)
                       -- a SUBQUERY, not summed alongside the items, or it multiplies by
                       -- the number of lines in each basket

bookItemsNetCents  = bookItemsCents - bookRefundsCents
bookProfitCents    = bookItemsNetCents - bookCostOfSalesCents

netCents           = netRevenueTotalCents - expensesTotalCents
```

Three things that are easy to get wrong and have been:

1. **`delivered` is not a different kind of sale.** It is `shipped` one step later. Leaving it
   out made revenue *fall* every time an arrival was confirmed.
2. **`deletedAt: null` is the filter most easily forgotten and most consequential.** Deletion
   is soft precisely because «واحد دفع فلوس»; a read that omits it keeps a hidden order in a
   total nothing on screen can be traced back to.
3. **Book profit is built from `itemsCents`, never from the order total.** The order total
   carries the shipping fee, which is collected from the student and handed to the courier
   unchanged. Counting it as margin credited the owner with the courier's money on every
   single order.

Also: **nothing here reads `revokedAt`.** Cancelling access is not a refund — cutting off a
student who cheated keeps the money. Only an explicitly recorded `Refund` row moves money.

`months` (18, newest first) — one raw query over a `generate_series` axis so a month with
expenses and no revenue is a real row with a real negative net rather than a gap. **Which date
each source is bucketed by, and none of them is `created_at`:**

| source | bucket column |
| ------ | ------------- |
| subscription | `payment_submissions.reviewed_at` (when the money became ours) |
| books | `book_orders.paid_at` |
| expenses | `expenses.occurred_on` (the month the money left) |
| refunds | `refunds.occurred_on` (its **own** date — a September refund of a July payment reduces September) |

`FinanceMonth`:
```ts
{ month: 'YYYY-MM', subscriptionRevenueCents, bookRevenueCents, expensesCents,
  subscriptionRefundsCents, bookRefundsCents,
  netCents }   // = subs + books − subRefunds − bookRefunds − expenses; MAY BE NEGATIVE
```
Do not clamp `netCents` at zero. A month that bought a print run and sold nothing really did
lose money.

Overview screen copy (`copy.admin.finance`):

- title `'النظرة العامة'`, subtitle `'دخل كام، صرف كام، وفضل كام.'`
- top row tiles: `'إجمالي الإيرادات'` (accent), `'فلوس رجعت'` (rendered as `− <amount>`,
  **shown only when `refundsTotalCents > 0`** — a permanent «٠ ج» beside the revenue is noise
  on the row read first), `'إجمالي المصروفات'` (links to the expenses tab),
  `'صافي الربح'` with the one-liner `'كل اللي دخل − اللي رجع − المصروفات'` (`netExplained`).
  ⚠️ The net tile is **not** an accent tile — amber is the "press this" colour and the net is
  the one number nobody clicks.
- second row: `'صافي الاشتراكات'`, `'صافي الكتب'`, `'مكسب الكتب'`, each showing the
  subtraction that produced it rather than asserting a result:
  - `netAfterRefunds` = `'بعد خصم {refunds} رجعت'`
  - `bookProfitBreakdown` = `'مبيعات الكتب {items} − تكلفة النسخ {cost} = {profit}'`
  - `shippingPassThrough` =
    `'الشحن {amount} — بيتجمع من الطالب ويروح للمندوب، مش محسوب مكسب'`
  - `bookCostUnknown` = `'{n} سطر مالوش تكلفة نسخة — المكسب محسوب من غيرهم'`, with the way out
    `bookCostFix` = `'حدّد تكلفة النسخة'`
  - `bookProfitNote` =
    `'ملحوظة: مكسب الكتب بيحسب تكلفة النسخة، والمطبعة أصلاً متسجّلة في المصروفات — عشان كده الرقمين مش بيتجمعوا على بعض.'`
    (⚠️ `bookProfitCents` is **not** an addend of `netCents`; subtracting both would count
    every print run twice.)
- `'المصروفات راحت فين'` (`expensesByCategory`) breakdown
- `'شهر بشهر'` table, columns `'الشهر'` / `'اشتراكات'` / `'كتب'` / `'مصروفات'` / `'رجعت'` /
  `'الصافي'`; empty `'لسه مفيش حركة'`. The page filters out months where every figure is zero.
- money is rendered with `formatEGPExact` and an explicit `−` for negatives:
  `` `${cents < 0 ? '−' : ''}${formatEGPExact(Math.abs(cents))} ج` ``

### 8.2 `GET /api/admin/finance` — «المشتركين»

Permission `payment:read`. Query — `AdminFinanceQuerySchema`
(= `ListQuerySchema` minus `dir`/`q`, with the widened `perPage`):

```
page, perPage (int 1..2000, default 20; the web sends 200),
status?: 'active'|'expiring_soon'|'expired',
plan?:   'monthly'|'quarterly'|'yearly'|'term'|'free',
year?:   coerce int >= 1,
stream?: 'general'|'languages',
sort:    'paid_desc' (default) | 'paid_asc'
```

⚠️ `free` is **orthogonal** to the four plan values, not a fifth plan — a row may match both
`free` and `monthly`.

Server (`FinanceService.list`): the base is
```
AccessGrant WHERE source='purchase' AND scope IN ('course','term') AND revokedAt IS NULL
```
plus the `status` clause:
```
expired       → { scope:'course', validUntil: { lt: now } }
expiring_soon → { scope:'course', validUntil: { gte: now, lte: now + 7 days } }
active        → { OR: [ {scope:'course', validUntil: { gt: now+7d }}, {scope:'term'} ] }
none          → {}
```
Everything else — `plan`, `year`, `stream`, the sort and the pagination — is done **in
application code** over the unpaginated result, because `plan` depends on the grant's *latest
approved submission* (a renewal can change plan between payments) and `year`/`stream` are
joined `Course` columns.

Sort: by `paymentSubmissions[0].reviewedAt`; a **`null` `paidAt` always sorts last, in either
direction** (neither "newest" nor "oldest" describes a payment that never happened).

`AdminFinanceRow`:
```ts
{ id (grant id), userId, studentName, courseId, courseTitle,
  plan: PaymentPlan | null,          // from the LATEST approved submission behind the grant
  termId: uuid|null, termTitle: string|null,
  amountCents: int | null,
  paidAt: iso | null,                // that submission's reviewedAt
  isFree: boolean | null,
  validUntil: iso | null,            // null for a term row, and for a course row reopened open-ended
  validFrom: iso,
  scope: 'course' | 'term',
  status: 'active' | 'expiring_soon' | 'expired',
  renewalCount: int >= 0,            // max(0, approvedSubmissionCount − 1)
  cancelReason: string | null,
  cancelReasonVisibleToStudent: boolean,
  refundedCents: int >= 0 }          // all refunds against every approved submission behind
                                     // this grant — not just the latest
```

`status` (`statusForGrant` + `financeStatusFor`):
```
scope === 'term'      → 'active'   (always, unconditionally — it is only on this screen at all
                                    because revokedAt is null, and it has no countdown)
validUntil === null   → 'active'   (a course grant an admin reopened open-ended)
validUntil <  now     → 'expired'
validUntil − now <= 7 days (inclusive) → 'expiring_soon'
otherwise             → 'active'
```

`summary` (`AdminFinanceSummarySchema`):
```ts
{ revenueTotalCents,        // SUM(amount_cents) WHERE status='approved' AND is_free=false, ALL TIME
  refundsTotalCents,        // SUM(refunds.amount_cents) WHERE submission_id IS NOT NULL
  netRevenueTotalCents,     // revenue − refunds, computed by the API
  activeCount,              // grants: base + OR[ {scope:'course', validUntil > now}, {scope:'term'} ]
  expiringSoonCount,        // grants: base + scope:'course' + validUntil ∈ [now, now+7d]
  filterCounts }
```
⚠️ `activeCount` / `expiringSoonCount` are **GLOBAL** — deliberately unaffected by
`status`/`plan`/`year`/`stream`.
⚠️ `revenueTotalCents` is a **running total, not month-to-date**. A fresh month starting the
tile back at zero read as money vanishing.

`filterCounts` is computed over the `status`-filtered set but **independent of the
plan/year/stream selections themselves**, so choosing one option does not hide how many rows
the others hold. Shape:
```ts
{ plan: { monthly, quarterly, yearly, term, free },   // `free` counts isFree, cross-cutting
  year: Record<string, number>,                       // keyed by Course.year AS A STRING
  stream: { general, languages } }                    // a course serving both counts in BOTH
```

Screen: tiles `'إجمالي الإيرادات'` / `'اشتراكات فعالة'` / `'هتخلص خلال أسبوع'`, plus the
separately-fetched book tiles under the heading
`'الكتاب الورقي — منفصل عن الاشتراكات'`: `'إجمالي إيرادات الكتب'` and `'كتب مدفوعة'` from
`GET /api/admin/book-orders/summary` (two fetches, two tiles, **never one merged number**).
Filter selects labelled `'الحالة'` / `'الباقة'` / `'عربي / لغات'` / `'الترتيب'`, options
`'الكل'` / `'فعّال'` / `'هيخلص قريب'` / `'خلص'`, `'كل الباقات'` / `'شهري'` / `'٣ شهور'` /
`'سنوي'` / `'ترم'` / `'مجاني'`, `'كل السنين'` / `'سنة {year}'`, `'كل المدارس'`,
`'الأحدث أولاً'` / `'الأقدم أولاً'`. Chip counts render as `'{label} ({n})'` (`filterCount`).
Columns `'الطالب'` / `'الكورس'` / `'الباقة'` / `'آخر دفعة'` / `'اتدفعت في'` / `'هتخلص في'` /
`'الحالة'` / `'التجديدات'` / `'إجراءات'`. Empty: `'مفيش اشتراكات مدفوعة لسه'` +
`'أول ما طلب اشتراك يتوافق عليه، هيظهر هنا.'`

Special cells:
- no submission behind the grant → `'—'` (`noPayment`)
- `isFree` → `'مجاني'` badge in the amount column instead of a price
- `scope: 'term'` → `'طول ما الترم مفتوح'` in the expiry column, and the course title carries
  `'اشتراك ترم: {term}'`
- a course grant with `validUntil: null` → `'مفتوح — من غير تاريخ انتهاء'`
- `renewalCount === 0` → `'—'`; else `'اتجدد {n} مرة'`
- refunds present → `'رجع منها {amount}'` under the amount

### 8.3 The three finance mutations

All on `payment:review`.

#### `PATCH /api/admin/finance/:grantId/amount`

Body `AdminFinanceEditAmountSchema`, `.strict()`:
```ts
{ amountCents: int >= 0, isFree: boolean }
```
Edits the **latest approved `PaymentSubmission` behind the grant** directly — the exact row
`AdminFinanceRow.amountCents`/`isFree` read from. 404 `'no approved payment behind this grant'`
when there is none. Returns the refreshed `AdminFinanceRow`. Audit
`payment:finance-edit-amount` with before/after.

`isFree` travels with the amount because "he actually never paid" and "he paid a different
amount" are the same correction at opposite ends.

Dialog copy: `'تعديل الاشتراك'`, section `'المبلغ المحصّل'`, label `'المبلغ (جنيه)'`,
checkbox `'مجاني — متحصلش فلوس'`, save `'حفظ المبلغ'` / `'بيتحفظ…'`, close `'قفل'`,
failure `'مقدرناش نحفظ — حاول تاني'`.

#### `PATCH /api/admin/finance/:grantId/dates`

Body `AdminFinanceEditDatesSchema`, `.strict()`:
```ts
{ validFrom: iso datetime, validUntil: iso datetime | null }
```
Direct, unguarded override of a `scope:'course'` grant's window. `validUntil: null` reopens it
open-ended. A past date takes effect **on the very next lesson open** (the live re-check in
`LessonAccessService.require` reads this column, not a cache).

⚠️ **Rejected for a `scope:'term'` row** — 400
`'a term grant has no calendar expiry — its cutoff is revokedAt, stamped when the term closes'`.
The UI shows `editDatesTermNotice` =
`'اشتراك الترم مالوش تاريخ انتهاء يتغير — بيتقفل لما الترم يتقفل بس.'` instead of the form.

Copy: section `'تواريخ الاشتراك'`, `'يبدأ في'`, `'ينتهي في'`,
`'من غير تاريخ انتهاء'`, `'حفظ التواريخ'` / `'بيتحفظ…'`.

#### `POST /api/admin/finance/:grantId/cancel`

Body `AdminFinanceCancelSchema`, `.strict()`:
```ts
{ reason: string,            // trim, min 1, max 400
  showToStudent: boolean,    // default false
  refundCents: int >= 1 | null }   // default null
```

Behaviour (`FinanceService.cancel`, `finance.service.ts:317-394`):

- `alreadyRevoked = grant.revokedAt !== null`. Stamps `revokedAt: now` **only when it was
  null** (idempotent), but always writes `cancelReason` and `cancelReasonVisibleToStudent` —
  so an admin can attach or correct a reason after the fact.
- `showToStudent: true` is the **only** path that emits a `subscription_cancelled`
  notification. Left off (the default), the reason is admin-eyes-only.
- `refundCents` is resolved **before** the transaction, so a refund that cannot be attributed
  fails the whole request rather than half-cancelling. The check is `input.refundCents == null`
  (catching `undefined` as well as `null`).
- When set, writes a `Refund` row against the **latest approved submission** behind the grant,
  `occurredOn: new Date()` — **today, not the sale's date** — with `reasonAr = input.reason`
  (the cancellation reason *is* the refund reason; a second required field is how one ends up
  blank).
- Audit `payment:finance-cancel` carrying `refundCents` and `refundSubmissionId`, because that
  trail must answer «رجعتله كام وامتى» after the grant, the submission or the course has been
  deleted.

**The refund cap** (`resolveRefund`), and it is load-bearing:
```
submissions = approved submissions behind this grant, newest first (with their refunds)
if none                → 400 'مفيش دفعة متسجلة على الاشتراك ده ترجّع منها'
collected       = Σ amountCents over submissions WHERE isFree === false
alreadyRefunded = Σ every refund on every one of those submissions
refundable      = collected − alreadyRefunded
if refundable <= 0     → 400 'الاشتراك ده مفيهوش فلوس تترجّع'
if amount > refundable → 400 `أكبر مبلغ ممكن يترجّع هو ${Math.floor(refundable/100)} جنيه`
→ { submissionId: submissions[0].id, amountCents }
```
A comped (`isFree`) submission contributes **nothing** to the cap — it was never counted as
revenue, so refunding against it would subtract money that was never added.

Dialog copy: title `'إلغاء الاشتراك بدري'`, `'السبب'` with placeholder
`'مثلاً: الطالب طلب إلغاء الاشتراك'`, checkbox
`'يظهر السبب ده للطالب في إشعاراته'`, the refund switch `'رجعتله فلوسه؟'` with hint
`'سيبه مقفول لو الفلوس فضلت معاك. اللي بيتقفل عشان غش مثلاً، فلوسه ما بترجعش وما بتتخصمش من الحسابات.'`,
amount label `'رجعتله كام؟ (بالجنيه)'` with `'أقصى مبلغ {max} ج'` shown **while he types**,
confirm `'تأكيد الإلغاء'`, `'رجوع'`, busy `'بيتلغي…'`, failure `'مقدرناش نلغي — حاول تاني'`,
and on an already-cancelled row `'سبب الإلغاء: {reason}'`.

### 8.4 Expenses — `/api/admin/expenses`

`apps/api/src/modules/expenses/expenses.controller.ts`. **`expense:read` / `expense:write`,
never `payment:*`** — a payment is money a student sent and an admin approves; an expense is
money Ayman spent and only he records. Opposite directions, opposite trust models.

- `GET /api/admin/expenses` — `expense:read`. Query `AdminExpenseQuerySchema` = `ListQuerySchema`
  minus `dir`, plus `category?` and `month?` (`^\d{4}-(0[1-9]|1[0-2])$`, message
  `'الشهر لازم يكون بالشكل YYYY-MM'`). `q` matches `titleAr` case-insensitively.
  Month filter is a **half-open** `[first of month, first of next month)` range — never
  `BETWEEN`, which would need the last day of February.
  Order `occurredOn DESC, id DESC` (the id tiebreak matters: `occurredOn` is a DATE, so a day
  with three receipts has no order of its own and would shuffle between requests).
  Count and page are in one transaction. → `{ rows: AdminExpenseRow[], rowCount }`.
- `POST /api/admin/expenses` — `expense:write` + CSRF, `AdminExpenseCreateSchema`
- `PATCH /api/admin/expenses/:id` — `expense:write` + CSRF, `AdminExpensePatchSchema`
- `DELETE /api/admin/expenses/:id` — `expense:write` + CSRF → `{ ok: true }`

`AdminExpenseRow`:
```ts
{ id, occurredOn: 'YYYY-MM-DD', category, amountCents: int,
  titleAr, noteAr: string|null,
  bookId: uuid|null, bookTitleAr: string|null, quantity: int|null,
  createdAt: iso }
```

Write shape:
```ts
{ occurredOn: 'YYYY-MM-DD',
  category: ExpenseCategory,
  amountCents: int 1..1_000_000_000,   // positive; capped at 10,000,000 EGP so an extra
                                        // three zeroes is a field error, not a catastrophic month
  titleAr: string trim 2..160,          // REQUIRED — an unlabelled number is unauditable
  noteAr: string trim 0..2000 | null,
  bookId: uuid | null,
  quantity: int 1..100_000 | null }
```
Refinement `bookId == null || quantity != null`, message `'لازم تكتب اشتريت كام نسخة'`,
path `['quantity']`. The PATCH re-checks the pair **against the row it is landing on**, so
`{ quantity: null }` alone on a row that names a book is refused rather than hitting the
`expenses_book_needs_quantity` CHECK as a 500. Unknown `bookId` → 404 `'book not found'`.

`AdminExpensePatchSchema` is hand-written with `.optional()` on every field — **not
`.partial()`**, for the same `.default()` trap as everywhere else.

Screen copy (`copy.admin.expenses`): eyebrow `'الحسابات'`, title `'المصروفات'`,
subtitle `'كل حاجة اتدفعت — تصوير، مطبعة، أدوات، وأي حاجة تانية.'`, `'أضف مصروف'`,
`'تعديل'`, `'حذف'`, confirm `'تمسح المصروف ده؟ مش هيرجع تاني.'`,
empty `'مفيش مصروفات مسجّلة'` + `'أول ما تسجّل حاجة اتدفعت، هتظهر هنا وتتحسب في الصافي.'`.
Category labels live in `copy.admin.expenseCategory`.

---

## 9. Money invariants — what the mobile app must never get wrong

1. **Piastres, integers, everywhere.** Never a float, never a string, never "EGP". Parse
   `amountCents` as `int`. A rounding function that returns a double will drift the totals.
2. **Never send a price.** Not on a payment claim (`amountCents` is derived from the course's
   own pricing), not on a cart line (`BookCartLineSchema` has **no** price field), not on an
   order total. Every schema here is `.strict()`, so an extra key is a 400 — which is the
   design working.
3. **Totals are `bookOrderTotals`, not your arithmetic.** Shipping is added **once, per
   order**, and **zero when the cart is empty**. The DB CHECK
   `amount_cents = items_cents + shipping_cents − discount_cents` will reject anything else as
   a 500 nobody can act on.
4. **`shippingCents` comes from the catalog response**, live, on every load. Do not cache it,
   do not hardcode 6500. The amount actually charged is frozen onto the order; a later fee
   change never rewrites an old order.
5. **One pending payment claim per course.** Check `GET /api/payments/submissions/me` before
   opening the picker; handle **409** as `copy.subscribe.alreadyPending`.
6. **Approval extends one grant; it never stacks.** Do not model a subscription as a list of
   purchases with the latest winning — model it as one `validUntil` that moves. Renewing early
   keeps the remainder (`computeApprovalValidUntil`).
7. **A `term` subscription has no expiry date.** `validUntil` is `null` by construction.
   Rendering "expires —" or a null date as "expired" is a bug. Show
   `'طول ما الترم مفتوح'`.
8. **`isFree` is the only thing that says "no money changed hands".** `amountCents` on a comped
   row is what the plan is *worth*, not what was collected (except on
   `adminManualSubscribe`, which writes `0`). Never infer "free" from `amountCents === 0`;
   every priced plan is `> 0` today, and relying on that coincidence is exactly what
   `countsAsRevenue` exists to prevent.
9. **Cancelling ≠ refunding.** Stamping `revokedAt` moves access, not money. Only a `Refund`
   row reduces revenue, it is dated **today** (not the sale's month), it is capped at
   *collected − already refunded*, and it can happen more than once (partial refunds are real).
   Never make a cancel imply a refund.
10. **A refund is never negative and never stored with a sign.** `refunds_amount_positive`
    (`amount_cents > 0`) plus `refunds_one_target` (exactly one of `submission_id` /
    `book_order_id`). The sign lives in how the table is *used* — always subtracted.
11. **Expenses are always positive too.** A refund is not a negative expense. Never flip a SUM
    with a sign.
12. **Soft-deleted book orders are excluded from every money figure** (`deletedAt: null`), and
    from the sidebar badge, and from the courier export. They keep the `status` they were
    deleted from.
13. **`delivered` counts as revenue.** `rejected` and `address_only` never do.
    `BOOK_REVENUE_WHERE = { status IN ('paid','shipped','delivered'), deletedAt: null }` is the
    one definition; both surfaces import the same constant because they once disagreed and
    showed different EGP under the identical Arabic label.
14. **Cost of sales reads the LINE's frozen `unit_cost_cents`, never a live join to `books`.**
    A live join let a deleted title erase the cost of every copy ever sold under it, and a
    reprice restate the profit of every past sale.
15. **Shipping is a pass-through.** It is in revenue and it is *not* in book profit. Showing it
    as margin credits the owner with the courier's money on every order.
16. **`bookProfitCents` is not an addend of `netCents`.** Print runs are already inside
    `expensesTotalCents` in the month the printer was paid; the per-copy cost is a different
    view of the same paper. Say so on screen (`bookProfitNote`).
17. **Nothing settles twice.** `matched_submission_id` and `matched_book_order_id` are UNIQUE,
    and every automatic settle is a conditional `updateMany`. A retried ingest is a no-op.
18. **Two candidates ⇒ no decision, always.** Two pending claims at the same amount, or a claim
    and a book order at the same amount, go to a human. An SMS settles nothing, ever.
19. **A known address is not a blank cheque.** The amount must equal the amount claimed. The
    address says *who*, never *what for*.
20. **Guest orders are never claimed at write time.** Linking is a read-time union on
    `phone` (never `altPhone`, never `userId`). Writing `userId` onto a guest row locks the
    placing browser out of paying for the order it is halfway through.
21. **Ownership on a book order is `userId` equality — including `userId: null` for a guest.**
    Never widen it to "match on the id alone"; that hands an account-placed order's home
    address to anybody holding a UUID.
22. **A screenshot key is prefix-checked.** `payment-proof/` for a payment, `book-order-proof/`
    for an order. Do not reuse a key across the two.
23. **The rejection reason is shown verbatim.** Both `payment_rejected` and
    `book_order_rejected`. A reason the platform paraphrases is a reason the student argues
    with instead of acting on.
24. **Never promise a delivery date at payment time.** The only place a day count is allowed is
    the `book_order_shipped` notification, counted from the day the courier took it, and it is
    3 days for governorate codes `01`/`21` and 4 everywhere else — **promise the longer number
    when in doubt.**
25. **Never re-send a ship notice.** `shipNoticeSentAt` is the guard, and it is checked *after*
    the ship so a row whose notice failed can still be retried.
26. **Pagination must be stable.** Every list here tiebreaks on `id` (uuid v7, so also
    chronological). If a mobile client re-sorts a page client-side it will duplicate and drop
    rows on a queue where each item must be decided exactly once.
27. **`rowCount` is the filter total, not the page length.** Compute page count from it.
28. **Do not fan out.** 10 req/s, 60 req/min per session; book-order create is 1 per 10 s.

---

## 10. Endpoint index

| method | path | permission | body / query | response |
| ------ | ---- | ---------- | ------------ | -------- |
| POST | `/api/payments/screenshot` | `payment:submit` | multipart `file` ≤ 8 MB | `{ screenshotKey }` |
| POST | `/api/payments/submissions` | `payment:submit` | `SubmitPaymentSchema` | `PaymentSubmission` |
| GET | `/api/payments/submissions/me` | `payment:submit` | — | `PaymentSubmission[]` |
| GET | `/api/admin/payments/submissions` | `payment:read` | `AdminPaymentQuerySchema` | `{ rows: AdminPaymentRow[], rowCount }` |
| GET | `/api/admin/payments/submissions/:id/screenshot` | `payment:read` | — | image/webp stream |
| POST | `/api/admin/payments/submissions/:id/approve` | `payment:review` | — | `{ id, status:'approved', validUntil }` |
| POST | `/api/admin/payments/submissions/:id/reject` | `payment:review` | `{ reason }` | `{ ok: true }` |
| GET | `/api/admin/students/:userId/subscriptions` | `payment:read` | — | `AdminSubscriptionRow[]` |
| POST | `/api/admin/students/:userId/subscriptions` | `payment:review` | `AdminManualSubscribeSchema` | `AdminSubscriptionRow[]` |
| DELETE | `/api/admin/students/:userId/subscriptions/:grantId` | `payment:review` | — | `AdminSubscriptionRow[]` |
| POST | `/api/ingest/transfers` | *public* + `x-instapay-token` | `IngestTransfersSchema` (json **or** text/plain) | `IngestTransfersResult` |
| GET | `/api/admin/transfers` | `payment:read` | `?filter=` | `{ rows: AdminTransferRow[], rowCount }` |
| POST | `/api/admin/transfers/ingest` | `payment:review` | `IngestTransfersSchema` | `IngestTransfersResult` |
| POST | `/api/admin/transfers/:id/dismiss` | `payment:review` | — | `{ ok: true }` |
| GET | `/api/admin/finance` | `payment:read` | `AdminFinanceQuerySchema` | `{ rows, rowCount, summary }` |
| PATCH | `/api/admin/finance/:grantId/amount` | `payment:review` | `{ amountCents, isFree }` | `AdminFinanceRow` |
| PATCH | `/api/admin/finance/:grantId/dates` | `payment:review` | `{ validFrom, validUntil }` | `AdminFinanceRow` |
| POST | `/api/admin/finance/:grantId/cancel` | `payment:review` | `{ reason, showToStudent, refundCents }` | `AdminFinanceRow` |
| GET | `/api/books` | *public* | — | `BookCatalog` |
| POST | `/api/book-orders/screenshot` | *public* + CSRF | multipart `file` | `{ screenshotKey }` |
| POST | `/api/book-orders` | *public* + CSRF | `CreateBookOrderSchema` | `BookOrder` |
| POST | `/api/book-orders/:id/payment` | *public* + CSRF | `SubmitBookOrderPaymentSchema` | `BookOrder` |
| GET | `/api/book-orders/mine` | `book-order:submit` | — | `BookOrder[]` |
| GET | `/api/book-orders/:id` | *public* | — | `BookOrder` |
| GET | `/api/admin/book-orders` | `book-order:read` | `AdminBookOrderQuerySchema` | `{ rows, rowCount }` |
| GET | `/api/admin/book-orders/summary` | `book-order:read` | — | `{ revenueTotalCents, paidCount }` |
| GET | `/api/admin/book-orders/export` | `book-order:read` | `ExportBookOrdersQuerySchema` | xlsx |
| GET | `/api/admin/book-orders/:id/screenshot` | `book-order:read` | — | image/webp stream |
| POST | `/api/admin/book-orders` | `book-order:create` + CSRF | `AdminCreateBookOrderSchema` | `BookOrder` |
| PATCH | `/api/admin/book-orders/:id` | `book-order:write` + CSRF | `AdminBookOrderPatchSchema` | `BookOrder` |
| POST | `/api/admin/book-orders/ship` | `book-order:ship` + CSRF | `{ ids, whatsapp }` | `BulkBookOrderResult` |
| POST | `/api/admin/book-orders/deliver` | `book-order:ship` + CSRF | `{ ids }` | `BulkBookOrderResult` |
| POST | `/api/admin/book-orders/:id/ship` | `book-order:ship` + CSRF | — | `MarkBookOrderShippedResult` |
| POST | `/api/admin/book-orders/:id/deliver` | `book-order:ship` + CSRF | — | `MarkBookOrderDeliveredResult` |
| POST | `/api/admin/book-orders/:id/reject` | `book-order:write` + CSRF | `{ reason }` | `RejectBookOrderResult` |
| DELETE | `/api/admin/book-orders/:id` | `book-order:write` + CSRF | `{ reason }` | `DeleteBookOrderResult` |
| POST | `/api/admin/book-orders/:id/restore` | `book-order:write` + CSRF | — | `RestoreBookOrderResult` |
| GET | `/api/admin/books` | `book:read` | — | `AdminBookRow[]` |
| POST | `/api/admin/books` | `book:write` | `AdminBookCreateSchema` | `AdminBookRow` |
| PATCH | `/api/admin/books/:id` | `book:write` | `AdminBookPatchSchema` | `AdminBookRow` |
| DELETE | `/api/admin/books/:id` | `book:write` | — | — |
| GET | `/api/admin/expenses/overview` | `expense:read` | — | `AdminFinanceOverview` |
| GET | `/api/admin/expenses` | `expense:read` | `AdminExpenseQuerySchema` | `{ rows, rowCount }` |
| POST | `/api/admin/expenses` | `expense:write` + CSRF | `AdminExpenseCreateSchema` | `AdminExpenseRow` |
| PATCH | `/api/admin/expenses/:id` | `expense:write` + CSRF | `AdminExpensePatchSchema` | `AdminExpenseRow` |
| DELETE | `/api/admin/expenses/:id` | `expense:write` + CSRF | — | `{ ok: true }` |
| GET | `/api/settings/public` | *public* | — | `{ seo, contact }` — `contact.instapay` is the payment number |
| GET | `/api/catalog/courses/:slug` | *public* | — | `CatalogCourseDetail` — plan prices + open terms |
| GET | `/api/taxonomy` | *public* | — | governorates + `pinnedGovernorateCodes` |

---

## 11. Mobile gaps — what has to change before a Flutter client can do this

Ordered by how much it blocks.

1. **There is no token auth.** Every route in this document authenticates with an `httpOnly`
   better-auth session cookie and a `x-csrf-token` double-submit header
   (`apps/api/src/auth/auth.config.ts`, `apps/web/lib/csrf.ts`). A Flutter client either has to
   run a persistent cookie jar against the same origin — with `__Host-` cookie semantics, which
   are browser concepts — or the API needs a bearer-token/refresh flow. This is the single
   biggest backend change.
2. **CSRF has no mobile story.** `CsrfGuard` also inspects `Origin` / `Sec-Fetch-Site`, headers
   a native HTTP client does not send. Either the guard must exempt token-authenticated
   requests, or the mobile client must be given a supported header contract.
3. **Screenshot uploads are browser-shaped.** Multipart + `XMLHttpRequest` progress, with the
   client expected to transcode HEIC→JPEG before sending (the server allowlist is
   png/jpeg/webp/avif/gif; iOS gives HEIC). Flutter must transcode locally
   (`flutter_image_compress` or equivalent) and implement its own progress reporting. Confirm
   the 8 MB ceiling is also enforced at the reverse proxy for the mobile path.
4. **There is no book-order PATCH for students.** Editing an address means creating a new order
   (`book-order-panel.tsx` says so explicitly). A mobile flow that lets a student correct a
   typo will silently create duplicate `address_only` rows unless the client replicates the
   exact `addressMatches` normalised comparison — or the backend grows
   `PATCH /api/book-orders/:id` restricted to `address_only`.
5. **Guest-order resume depends on browser `localStorage`.** The order id is the only
   credential for an unclaimed order. Mobile needs an equivalent secure local store, and a
   decision about what happens on reinstall (today: the order is unreachable forever). A
   "look up my order by phone + order number" endpoint would be the honest fix.
6. **`GET /api/books` returns the entire catalogue in one payload** with no pagination and no
   filtering. Fine for a dozen titles; a mobile client on a phone connection needs either a
   paged/filterable variant or an explicit cache policy + ETag. The current throttle
   (300/s) suggests it is being prerendered, not fetched per user.
7. **Cover images are storage KEYS, not URLs** (`BookCard.coverKey`, `Course.coverKey`). The
   web resolves them through a `mediaUrl()` helper. Mobile needs that base URL published — as
   part of the payload or as a documented constant — or the API should return absolute URLs.
8. **No refund write path for book orders.** `Refund.bookOrderId` exists, is CHECK-constrained,
   and is READ by `/admin/expenses/overview` (`bookRefundsCents`, `bookNetRevenueCents`,
   `bookProfitCents`), but the only endpoint that *creates* a refund is
   `POST /api/admin/finance/:grantId/cancel`, which always writes `submissionId`. A mobile admin
   cannot record a book refund because the web cannot either. Backend work required before any
   UI is built for it.
9. **No API to unbind a learned InstaPay address.** The runbook's own "Not done" list says so:
   fixing a mis-learned address means deleting a `student_payment_addresses` row by hand in the
   database. A mobile admin surface for «التحويلات الواردة» needs a
   `DELETE /api/admin/students/:userId/payment-addresses/:id` (and a read for the list).
10. **`/admin/transfers` has no pagination.** Fixed 100 rows, no `page` param, no cursor. Fine
    on a desktop screen an admin glances at; a mobile list will need paging once the ledger
    grows.
11. **`/admin/finance` fetches unpaginated and sorts/filters in memory**, and the web sends
    `perPage=200`. It is explicitly documented as sized for "a few dozen live subscribers". A
    mobile admin view must send the same `perPage` and must not assume server-side paging is
    real. This will need a proper paginated implementation before the cohort grows.
12. **The XLSX export is a binary download.** `GET .../export` streams a spreadsheet with a
    `Content-Disposition` attachment header. Mobile needs either a share-sheet handoff
    (download to a temp file, `share_plus`) or a JSON variant of the same query.
13. **The InstaPay ingest is unusable from mobile as designed.** `POST /api/ingest/transfers`
    is token-authenticated for an Android *notification listener*, not for the admin app. The
    admin paste box (`POST /api/admin/transfers/ingest`) is the mobile-reachable one. If the
    intent is to fold the notification listener into the Flutter admin app, that app needs
    Android `NotificationListenerService` access and a decision about iOS (which cannot do it
    at all).
14. **WhatsApp ship notices go through a paired personal device** (`WhatsappDeviceService`),
    outside the API. A mobile admin pressing bulk-ship will get `notice_failed` rows it cannot
    diagnose; surface `shipNoticeError` verbatim and do not retry automatically.
15. **The Arabic number rule is not free on Flutter.** Every surface uses
    `ar-EG-u-nu-latn` — Arabic locale, **Latin digits**. Dart's `intl` with locale `ar` yields
    Arabic-Indic digits by default. Pick one formatting helper, mirror `formatEGP` /
    `formatEGPExact` / `formatShipping` exactly, and unit-test them against
    `apps/web/lib/price.test.ts`.
16. **RTL layout with LTR islands.** Phone numbers, the InstaPay number and the raw transfer
    line are all rendered `dir="ltr"` inside RTL text. Flutter needs explicit
    `Directionality`/`textDirection: TextDirection.ltr` on those specific widgets.
17. **No push for money events.** The platform emits in-app notifications and has
    `PushSubscription` (Web Push). A native client needs FCM/APNs wiring for
    `payment_approved`, `payment_rejected`, `subscription_expiring_soon`, `book_order_shipped`,
    `book_order_delivered`, `book_order_rejected` — the six a student actually waits on.
18. **`/api/enrollments` is used as a cheap "do I have access" probe** by the course page. A
    mobile client should not poll it per course; either batch it or cache per session, given
    the 10 req/s ceiling.
