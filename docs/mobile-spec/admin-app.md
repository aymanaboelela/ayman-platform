# Admin app — full screen-by-screen spec for a Flutter client

Source of truth: `apps/web/app/(admin)/**` (UI), `apps/api/src/modules/**` (endpoints),
`packages/contracts/src/**` (wire shapes), `packages/contracts/src/copy/admin.ts` (every Arabic
string quoted below).

Everything in this document is Arabic + RTL. Every screen is `dir="rtl"`. Dates are formatted with
`Intl.DateTimeFormat('ar-EG-u-nu-latn', …)` on most admin screens — **Arabic locale with Latin
digits** (`-u-nu-latn`) — except `/admin/courses`, `/admin/attempts`, `/admin/news`,
`/admin/errors` and `/admin/students` (list column) which use plain `'ar-EG'` (Arabic-Indic
digits ١٢٣). Reproduce that split exactly; it is a real inconsistency in the web app, not a typo.

---

## 1. Authentication, roles and permissions

### 1.1 Roles

`apps/api/src/auth/permissions.ts`:

```ts
const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission> | '*'> = {
  admin: '*',
  student: new Set([...]),   // profile:read/write, course:read, enrollment:*, progress:*,
                             // quiz:read, quiz:attempt, payment:submit, book-order:submit,
                             // homework:submit
};
```

**`admin` holds `'*'` — every permission in `PERMISSIONS`.** So although every screen and nav item
declares a permission, in production there are exactly two outcomes: an `admin` sees the whole
admin app, a `student` sees none of it. A Flutter client can therefore gate the entire admin
surface on one check (`permissions.contains('admin:access')`) and still render every per-item
permission check faithfully — they will all pass. Do **not** hard-code that assumption into the
API calls, though: the server re-checks on every route.

The full permission list (`PERMISSIONS`, 74 entries) is in `apps/api/src/auth/permissions.ts`.
The ones the admin UI reads:

`admin:access`, `course:read-admin`, `course:create`, `course:update`, `course:publish`,
`course:delete`, `section:write`, `section:reorder`, `lesson:write`, `lesson:reorder`,
`student:read`, `student:write`, `student:role-change`, `student:ban`, `student:delete`,
`student:set-password`, `payment:read`, `payment:review`, `book-order:read`, `book-order:ship`,
`book-order:create`, `book-order:write`, `book:read`, `book:write`, `expense:read`,
`expense:write`, `homework:read`, `homework:review`, `attempt:read`, `attempt:unlock`,
`analytics:read`, `conversation:read`, `conversation:reply`, `conversation:close`,
`outreach:read`, `taxonomy:read`, `taxonomy:write`, `marketing:read`, `marketing:write`,
`marketing:send`, `marketing:device`, `home:read`, `home:write`, `nav:read`, `nav:write`,
`media:read`, `media:write`, `media:delete`, `settings:read`, `settings:write`, `news:read`,
`news:write`, `news:publish`, `flags:read`, `flags:write`, `diagnostics:read`,
`diagnostics:resolve`, `audit:read`, `question:write`, `quiz:write`.

### 1.2 Gate order

`apps/web/app/(admin)/layout.tsx`:

1. Middleware (`proxy.ts`, `PROTECTED_PREFIXES` includes `/admin`) blocks anonymous visitors.
2. Layout: `if (!session) redirect('/login')`.
3. Layout: `if (!can(session, 'admin:access')) notFound()` — **404, never 403.** A student poking
   at `/admin` must learn nothing about the admin area existing. Reproduce this on mobile: an
   unauthorised user gets "not found", not "forbidden".
4. NestJS guard re-checks `@RequirePermission(...)` per route. Deny-by-default.

### 1.3 Session / transport

- Session is a cookie (better-auth). The web client forwards `cookie` on every server-side fetch.
- **CSRF**: every mutating call (`POST/PATCH/PUT/DELETE`) sends the CSRF header read from the
  `CSRF_COOKIE`. See `apps/web/lib/admin-api.ts` (`csrfFromCookie`, `CSRF_HEADER`). A Flutter
  client must read the CSRF cookie and echo it in the header on every write, or every write 403s.
- **Every admin read is `cache: 'no-store'`** (`adminGet`). Comment repeated across the codebase:
  "a cached admin read is indistinguishable from a lost write." Mobile must not cache admin GETs.
- **User ids are better-auth nanoids** (e.g. `9vrJB5pO088EPb4hDZnMajJtPy48GIjL`), *not* UUIDs.
  `AdminStudentRowSchema.id` is `z.string()` deliberately. Do not validate userId as UUID.
  Everything else (course, lesson, quiz, order, submission, transfer, expense, book, media) **is**
  a UUID.

### 1.4 Error handling contract

`apps/web/lib/admin-api.ts`:

- `adminGet` throws on any non-2xx → the route's `error.tsx` renders.
- `adminGetOrNotFound` → 404 becomes the "not found" screen.
- `adminGetOrNull` → 404 becomes `null`, caller renders a fallback panel.
- `adminSend` / `adminSendVoid` throw `AdminApiError { message, status, payload }`.
  `adminSendVoid` is used where the route answers **204** (inbox reply, inbox status, homework
  review) — reading a body there would throw.

Status codes the UI maps to specific Arabic copy:

| Status | Where | Copy |
|---|---|---|
| 409 | approve/reject payment | `«الطلب ده اتراجع قبل كده»` |
| 409 | `PATCH /api/admin/students/:id` | `«الرقم أو الإيميل ده متسجّل بحساب تاني بالفعل»` |
| 409 | `DELETE /api/admin/students/:id` | `«الحساب ده مؤلف محتوى على المنصة ({items}) …»` (see 6.10) |
| 409 | course slug conflict | `«الرابط ده مستخدم في كورس تاني. غيّره وجرّب تاني.»` |
| 409 | delete subject | `«المادة مرتبطة بمقرر دراسي — المقرر يتحذف الأول»` |
| 400 | delete student, identity mismatch | `«الإيميل اللي كتبته مش مطابق للحساب ده»` |
| 400 | course save, offering missing | `«التركيبة دي (نظام + صف + مسار + مادة) مش موجودة في المناهج…»` |
| 403 (`…yourself`) | ban/delete self | `«مينفعش توقف حسابك إنت»` / `«مينفعش تمسح حسابك إنت»` |
| 403 (`…last remaining admin`) | ban/delete last admin | `«ده آخر مسؤول نشط في المنصة — مينفعش توقفه»` / `«ده آخر مسؤول في المنصة — مينفعش تمسحه»` |
| 500 (presentation exists) | add lesson resource | `«المحاضرة دي فيها بريزنتيشن أساسي واحد خلاص…»` |

The 403 discrimination is done by **substring match on the API's English message** inside the
`payload.message` (`explain()` in `apps/web/app/(admin)/admin/students/actions.ts`). Needles:
`'yourself'`, `'your own account'`, `'last remaining admin'`.

### 1.5 List envelope

`packages/contracts/src/admin/list.ts`:

```ts
PAGE_SIZES = [10, 20, 50, 100]
ListQuerySchema = { page: int ≥1 = 1, perPage: one of PAGE_SIZES = 20, q: string ≤120 = '',
                    dir: 'asc'|'desc' = 'desc' }
listResponse(row) = { rows: row[], rowCount: int ≥0 }   // rowCount = TOTAL matching, not page size
```

Exceptions: `/api/admin/errors` returns `{ rows, total, summary }`; `/api/admin/attempts` returns a
bare array (paged via `take`/`skip`); `/api/admin/transfers` returns `{ rows, rowCount }` with no
paging params; `/api/admin/courses`, `/api/admin/news`, `/api/admin/books`,
`/api/admin/marketing/campaigns`, `/api/admin/taxonomy/*` return bare arrays.

---

## 2. The shell

### 2.1 Layout

`apps/web/app/(admin)/layout.tsx` — CSS grid `[var(--admin-sidebar-w)_1fr]` at `md+`:

- Sidebar: **260px** (`--admin-sidebar-w`, `packages/ui/src/tokens/space.css:43`), hidden below
  `md`, replaced by a sheet from the header's ☰ button.
- Header: sticky, **60px** (`--admin-header-h`, same file line 52), `z-40`.
- Main: `p-4 md:p-6` (16 / 24 px). Most pages then wrap content in
  `mx-auto w-full max-w-[76rem]`.
- The whole subtree is wrapped in four count-poller providers, each mounted only if the session
  holds the permission (otherwise `Fragment`): `InboxAlertsProvider` (`conversation:read`),
  `PaymentsAlertsProvider` (`payment:read`), `BookOrdersAlertsProvider` (`book-order:read`),
  `HomeworkAlertsProvider` (`homework:read`), then `NotificationStreamProvider` (SSE).
- Root class on the grid: `product-type` (bumps the whole type ramp for signed-in surfaces).

### 2.2 Sidebar navigation — the full table

`apps/web/components/admin/nav-items.ts`. Groups render in this order
(`ADMIN_NAV_GROUPS`), items in array order inside each group. An item renders only if
`permissions.includes(item.permission)`.

| # | Group (heading) | href | Arabic label | Icon (lucide) | Permission |
|---|---|---|---|---|---|
| 1 | `overview` (no heading) | `/admin` | نظرة عامة | LayoutDashboard | `admin:access` |
| 2 | `teaching` — **التدريس** | `/admin/courses` | الكورسات | BookMarked | `course:read-admin` |
| 3 | | `/admin/students` | الطلبة | Users | `student:read` |
| 4 | | `/admin/payments` | المدفوعات | Wallet | `payment:read` |
| 5 | | `/admin/transfers` | التحويلات الواردة | ArrowDownLeft | `payment:read` |
| 6 | | `/admin/finance` | الاشتراكات والإيرادات | Coins | `payment:read` |
| 7 | | `/admin/books` | طلبات الكتب | PackageOpen | `book-order:read` |
| 8 | | `/admin/homework` | الواجبات | NotebookPen | `homework:read` |
| 9 | | `/admin/attempts` | المحاولات | ClipboardList | `attempt:read` |
| 10 | | `/admin/analytics` | التحليلات | ChartColumn | `analytics:read` |
| 11 | | `/admin/inbox` | صندوق الوارد | Inbox | `conversation:read` |
| 12 | | `/admin/outreach` | رسايلي للطلبة | Send | `outreach:read` |
| 13 | | `/admin/taxonomy` | الهيكل الدراسي | GraduationCap | `taxonomy:read` |
| 14 | `marketing` — **التسويق** | `/admin/marketing/campaigns` | التسويق | Megaphone | `marketing:read` |
| 15 | `site` — **الموقع** | `/admin/home` | الصفحة الرئيسية | Home | `home:read` |
| 16 | | `/admin/navigation` | القوائم | ListTree | `nav:read` |
| 17 | | `/admin/media` | مكتبة الوسائط | FileImage | `media:read` |
| 18 | | `/admin/news` | نيوز | Newspaper | `news:read` |
| 19 | `system` — **النظام** | `/admin/settings/branding` | الإعدادات | Settings | `settings:read` |
| 20 | | `/admin/flags` | خصائص التشغيل | Flag | `flags:read` |
| 21 | | `/admin/errors` | الأعطال | AlertTriangle | `diagnostics:read` |
| 22 | | `/admin/audit` | سجل النشاط | ScrollText | `audit:read` |

⚠️ Note the array order vs the group render order: `/admin/settings/branding` is declared between
`/admin/media` and `/admin/news` but sits in group `system`, and `/admin/news` sits in `site` — so
the rendered order inside **الموقع** is: الصفحة الرئيسية، القوائم، مكتبة الوسائط، نيوز; and inside
**النظام**: الإعدادات، خصائص التشغيل، الأعطال، سجل النشاط.

At the bottom of the sidebar, outside the nav: a link to `/` labelled `copy.nav.home` with an
`ArrowUpLeft` icon.

**Active item rule** (`activeNavItem`): longest matching `href` wins; `/admin` matches only on
exact equality, everything else on `pathname.startsWith(href)`. Sidebar, breadcrumb and mobile
sheet must all use this one function or two things look "current".

### 2.3 Sidebar badges (live counts)

`apps/web/components/admin/admin-nav-list.tsx` + the four alert providers. All poll every
**30 000 ms** while the tab is visible; they pause when hidden and refetch immediately on
`visibilitychange` back to visible.

| Badge on | Endpoint | Count read from | `sr-only` label |
|---|---|---|---|
| `/admin/inbox` | `GET /api/admin/conversations/unread-count` | `{ unread }` | `copy.assistant.inbox.badgeLabel` |
| `/admin/payments` | `GET /api/admin/payments/submissions?status=pending&perPage=10` | `{ rowCount }` | `«{n} طلب قيد المراجعة»` |
| `/admin/books` | `GET /api/admin/book-orders?status=paid&perPage=10` | `{ rowCount }` | `«{n} طلب كتاب متشحنش لسه»` |
| `/admin/homework` | `GET /api/admin/homework/pending-count` | `{ pending }` | `«{n} حل مستني مراجعة»` |

Rules:
- `null` = not asked yet / no permission. `0` = asked, nothing waiting. **Both render no badge.**
- The badge renders only when `count > 0` — never a permanent «٠».
- The first count **never** raises a notification; only a rise from a previously-known number does
  (otherwise every page load announces the whole backlog).
- The number itself is `aria-hidden`; the sentence beside it is announced.
- After approving/rejecting a payment the client calls `refreshPendingCount()` immediately so the
  badge does not lag up to 30 s behind the admin's own action.

### 2.4 Header

`apps/web/components/admin/admin-header.tsx`, left→right in RTL terms (inline-start first):

1. ☰ (`aria-label` `«فتح القائمة»`) — `md:hidden`, opens a Sheet containing `<BrandLockup/>` +
   the same `AdminNavList`.
2. Breadcrumb `<ol>`: `«لوحة التحكم»` → `/` → the active nav item's `labelAr` (only when
   `pathname !== '/admin'`).
3. (inline-end cluster) Command-palette trigger: `«البحث السريع»` + `⌘` `K` kbd chips
   (`hidden sm:flex`).
4. Inbox alerts toggle (only with `conversation:read`) — requests OS notification permission and
   subscribes this browser to Web Push.
5. Notification bell (server-rendered, own `<Suspense>` with `NotificationBellFallback`).
6. Theme toggle.
7. `«داخل باسم» {identity}` — identity is the account email if any, else the phone
   (`accountIdentityLabel`). `hidden lg:inline`, `max-w-[14rem] truncate`.
8. Sign-out button.

Header background is `color-mix(in oklch, var(--n-1), transparent 20%)` +
`backdrop-blur-[var(--header-blur)]`. **This is the only element in the whole product allowed to
use backdrop-blur** (spec §4.7).

### 2.5 Command palette & keyboard shortcuts

`apps/web/components/admin/shortcuts.ts`, `use-global-shortcuts.ts`, `command-palette.tsx`.

- `⌘K` / `Ctrl+K` toggles the palette. Placeholder: `«دور على أمر أو صفحة...»`,
  `aria-label` `«لوحة الأوامر»`. Groups: `«التنقل»` / `«إجراءات»`.
- Registry (`mod` = ⌘ or Ctrl; comparison is on `event.key` lowercased, never `event.code`, so
  Arabic keyboard layouts work):

| Combo | Label | Target |
|---|---|---|
| ⌘⇧S | الطلبة | `/admin/students` |
| ⌘⇧A | المحاولات | `/admin/attempts` |
| ⌘⇧T | الهيكل الدراسي | `/admin/taxonomy` |
| ⌘⇧H | الصفحة الرئيسية | `/admin/home` |
| ⌘⇧M | مكتبة الوسائط | `/admin/media` |
| ⌘⇧F | خصائص التشغيل | `/admin/flags` |
| ⌘⇧L | سجل النشاط | `/admin/audit` |
| ⌘⇧N | عنصر قائمة جديد | `/admin/navigation` |
| ⌘⇧U | رفع صورة | `/admin/media` |

There is exactly ONE `keydown` listener for the whole admin tree.

### 2.6 Error boundary — `apps/web/app/(admin)/error.tsx`

No `<main>` and no page padding (the layout supplies both). Inside `.panel p-5 sm:p-6`:

- `h1`: `«الصفحة وقعت»`
- body: `«حصل خطأ على السيرفر والصفحة مااتعرضتش. ولو كان فيه حفظ في نصه، مش مضمون إنه عدّى — تحميل الصفحة تاني وتأكيد من آخر تغيير قبل الكمالة.»`
- Buttons: `copy.common.retry` (solid amber; calls `useErrorRetry`, which clears the router cache
  first) and a **plain `<a href="/admin">`** labelled `«نظرة عامة»` (a soft nav can be answered
  from cache and do nothing).
- If `error.digest`: `«{copy.errors.digestLabel}: {digest}»` in `dir="ltr" font-mono`, then
  `«الكود ده موجود جنب تفاصيل الخطأ في لوج السيرفر»`.

### 2.7 Not-found — `apps/web/app/(admin)/not-found.tsx`

`404` in mono/ltr, then `copy.notFound.admin.title` / `.body` / `.cta` (a `<Link href="/admin">`).
Same `.panel` + `max-w-[76rem]` frame. No retry, no digest.

### 2.8 Overview loading skeleton — `apps/web/app/(admin)/admin/loading.tsx`

Heading bar → lead bar → 4 stat-card placeholders (`grid-cols-2 lg:grid-cols-4`) → 6 card
placeholders (`sm:grid-cols-2 lg:grid-cols-3`). Widths alternate 100/85/60 % so it reads as
loading rather than broken.

---

## 3. Admin design language (and how it differs from the student side)

From `apps/web/app/(admin)/admin.css`, `apps/web/app/study.css`, `apps/web/app/globals.css`.

### 3.1 The colour rule (identical on both surfaces, different weighting)

```
ember  (--e-*)  STRUCTURE  — sections, wells, the exam gate
amber  (--a-*)  ACTION     — anything you press
--ok / --err               — quiz correctness; --err also = destructive STATUS
```

Green (`oklch(0.62 0.15 150)`) is reserved for quiz correctness and is used decoratively in exactly
two admin places: the payment **approve** button and the "subscribed to course" badge on an inbox
thread. Never elsewhere.

### 3.2 What the admin **shares** with the student

- `study.css` is imported by the admin layout, so `.unit`, `.lesson-row`, `.chip`, `.group-head`,
  `.stage` are the **same objects**. An instructor building a section looks at the same container
  a student will study in. Only the verbs on the row differ
  (تعديل/مواد/نشر/حذف here vs «مشاهدة» there).
- `.nav-pill` is shared by the student rail and the admin sidebar: 3.25rem min height, a 2.25rem
  icon **well** (bordered, filled `--n-3`) rather than a bare glyph, label at `--fs-text-lg`
  (≈19px inside `product-type`), active state = amber tint + `--a-11` text + a 3px amber marker
  bar on the inline-start edge at `inset-inline-start: -0.75rem`.
- `.panel` — the raised surface. Dark mode: warm-tinted border + `inset 0 1px 0 rgb(255 255 255 /
  .045)` top-edge highlight (no drop shadow — shadows are transparent in dark mode by design).
  Light mode: real two-layer shadows, no inset. Hover in both: border warms toward
  `color-mix(in oklch, var(--a-9), transparent 62%)`. **The card never moves on hover.**

### 3.3 What is admin-only

| Object | What it is |
|---|---|
| `.row-actions` | The 4-verb cluster ending a section/lesson row. The destructive verb sits past a `--hairline` separator (`.row-actions__sep`, 1.25rem tall, `margin-inline: var(--s-4)`) and is colourless (`--n-11`) until hover, when it goes `--err` on a 8 %-err tint. |
| `.chip--danger` | transparent border + transparent bg at rest; err-tinted on hover. |
| `.inline-edit` | A title that *becomes* its own input. Button has `cursor: text` (not pointer) and `font: inherit` on the input so a section title and a lesson title do not become the same size while editing. Avoids ~40 single-field forms on a 12-section course. |
| `.editor-bar` | The course editor's own sticky sub-header at `inset-block-start: var(--admin-header-h)`. **Opaque** (`background: var(--n-1)`), never blurred — a blurred bar over a dense input column reads as a rendering artefact. |
| `.exam-gate` | The course final exam drawn as a threshold, built on `.stage`'s deeper ember rather than `.unit`'s, and it states the live rule: `«هيتفتح للطالب بعد ما يخلّص ٢٤ محاضرة»` with the number computed from the course's own published lessons. |
| `.stat-tile` | 2.75rem ember well + `--fs-title-1` tabular value + `--fs-text-sm` label. Variant `.stat-tile--waiting` = amber tint, rendered **only when count > 0**. |
| `.section-tile` | An admin section as a destination: 2.25rem ember well, title, one-sentence blurb, and a chevron that appears **only on hover** (20 permanent arrows is 20 pieces of furniture). |
| `.field-count` | Character counter under a capped field. Mono, `tabular-nums`, `--n-10`, turns `--warn` (`.field-count--near`) near the cap. |
| `.form-card` | Section-with-heading-and-note wrapper used by the course form (`FormSection`). |

### 3.4 Structural differences from the student surface

1. **Density.** Student screens are one column of prose at `--w-prose`. Admin screens are
   `max-w-[76rem]` with tables, dropdown filter rows and multi-column grids.
2. **Never cached.** Student surfaces use `'use cache'` loaders; every admin read is `no-store`.
3. **Dropdown filters, not chips.** Standardised on `<ListControl>`
   (`apps/web/components/admin/list-controls.tsx`): a `<label>` with a `--fs-text-xs` muted caption
   above a 36 px `<select>`. Choosing a value pushes a new URL (`scroll: false`), **deletes `page`**,
   and removes the param entirely when the value is `''` (so an unfiltered list has a bare URL).
   The select **dims to `opacity-60` while pending but is never `disabled`** — a control that goes
   dead mid-navigation steals focus. Exceptions that still use pill-tab rows:
   `/admin/homework`, `/admin/books` (tabs), `/admin/errors`, `/admin/outreach`, `/admin/finance`
   (tabs), `/admin/inbox` (tabs).
4. **Pagination** (`<ListPager>`): «السابق» ‹ `{page} من {pageCount}` › «التالي». Renders nothing
   when `pageCount <= 1`. Disabled buttons go to `opacity-40`.
5. **RTL is logical-only.** `ayman/no-physical-direction` lint bans `left`/`right`; use
   `inset-inline-start`, `border-e`, `margin-inline`. Forward chevrons point **left**
   (`ChevronLeft`) because forward is left in RTL.
6. **Numbers.** `tabular-nums`/`.tabular` on every count, score and money figure so strips do not
   jitter between renders. Phone numbers, emails, routes, digests, hashes and storage keys always
   carry `dir="ltr"` and usually `font-mono`.
7. **Destructive confirmation ladder.** Three levels, deliberately different:
   `window.confirm` (nav archive, ship one order) < a Dialog with a required textarea (reject a
   payment, reject/delete a book order, cancel a subscription) < a Dialog that requires **retyping
   the account's own identifier** (delete one student) or **typing the literal word «مسح»** (bulk
   delete students).

---

## 4. Screens

53 routes. Listed in sidebar order, with sub-routes nested under their parent.

---

### 4.1 `/admin` — نظرة عامة (overview)

**File** `apps/web/app/(admin)/admin/page.tsx` · **Permission** `admin:access`

**Purpose.** A directory + the queues that are holding work. Deliberately *not* a dashboard of
graphs; those live at `/admin/analytics`.

**Endpoints**
- `getAdminOverviewStats()` (`apps/web/lib/admin-overview.ts`) → `{ students, published, drafts }`.
  **Never throws** — returns `null` on failure.
- No fetch for the queue band: it reads the three sidebar poller contexts
  (`usePaymentsPendingCount`, `useBookOrdersUnshippedCount`, `useInboxCount`). One poller, three
  consumers.

**Layout, top to bottom**

1. **Header row** (`flex-wrap items-end justify-between`)
   - `h1` `«لوحة التحكم»` (`--fs-title-2`, semibold) + lead `«كل حاجة بتظهر للطالب بتتظبط من هنا.»`
   - **Quick actions**, filtered by permission, first one solid amber and the rest outlined:
     | Label | Href | Icon | Permission |
     |---|---|---|---|
     | كورس جديد | `/admin/courses/new` | Plus | `course:create` |
     | أقسام الصفحة الرئيسية | `/admin/home` | Home | `home:read` |
     | رفع صورة | `/admin/media` | FileImage | `media:read` |
2. **`«محتاج تصرّف»`** (`OverviewQueues`) — heading + up to 3 `.stat-tile.stat-tile--waiting`
   links. **Renders nothing at all when every queue is 0 or `null`.** Presence means "there is
   work"; absence means "there is none".
   | Tile label | Count source | Href | Icon |
   |---|---|---|---|
   | دفعة مستنية مراجعة | payments pending | `/admin/payments` | Wallet |
   | كتاب لسه ما اتشحنش | book orders unshipped | `/admin/books` | PackageOpen |
   | رسالة مستنية رد | inbox unread | `/admin/inbox` | Inbox |
3. **Stat strip** — 3 `.stat-tile`s, `sm:grid-cols-2 lg:grid-cols-3`:
   `{students}` `«طالب مسجّل»` (Users) · `{published}` `«كورس منشور»` (BookMarked) ·
   `{drafts}` `«كورس مسودة»` (FileText).
   **Failure state**: if `stats === null`, render instead a dashed-border box with
   `«الأرقام مش متاحة دلوقتي — تحديث الصفحة»`.
4. **`«أقسام اللوحة»`** — `.group-head` with `«كل قسم بيتحكّم في حتة من اللي الطالب بيشوفه.»`, then
   one block per nav group *that has a heading* (so `overview` is excluded), each rendering the
   permitted items of that group as `.panel.section-tile` cards in
   `grid auto-rows-fr grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`.
   Each tile = ember well + icon, title = `item.labelAr`, note = `copy.admin.navBlurb[item.href]`,
   hover chevron.

**`navBlurb` — the exact one-liner per section** (`copy/admin.ts:788`):

| href | blurb |
|---|---|
| `/admin/courses` | اعمل كورس، رتّب محاضراته، وانشره. |
| `/admin/students` | دوّر على طالب، افتح سجله، أو اقفل حسابه. |
| `/admin/payments` | راجع تحويلات إنستاباي واقبلها أو ارفضها. |
| `/admin/transfers` | الفلوس اللي وصلت فعلاً على إنستاباي. |
| `/admin/finance` | الإيرادات والمصروفات وصافي الربح. |
| `/admin/books` | طلبات الكتاب المدفوعة اللي لسه ما اتشحنتش. |
| `/admin/attempts` | محاولات الامتحانات ودرجاتها. |
| `/admin/analytics` | أداء الطلبة وأصعب الأسئلة. |
| `/admin/inbox` | رسايل الطلبة والرد عليها. |
| `/admin/outreach` | سجل الرسايل اللي اتبعتت باسمك. |
| `/admin/assistant` | الأسئلة اللي الطلبة بيسألوها للمساعد. |
| `/admin/taxonomy` | الأنظمة والصفوف والمسارات والمواد. |
| `/admin/marketing/campaigns` | حملات واتساب للي لسه بره المنصة. |
| `/admin/home` | أقسام الصفحة الرئيسية وترتيبها. |
| `/admin/navigation` | روابط الهيدر والفوتر. |
| `/admin/media` | الصور المرفوعة وروابطها. |
| `/admin/news` | الأخبار والإعلانات. |
| `/admin/settings/branding` | الهوية والسيو وبيانات التواصل. |
| `/admin/flags` | تشغيل وإطفاء مميزات المنصة. |
| `/admin/errors` | الأخطاء اللي حصلت في المنصة. |
| `/admin/audit` | مين عمل إيه وإمتى. |

(Nothing is keyed for `/admin/homework` — that tile renders with no blurb.)

---

### 4.2 `/admin/courses` — الكورسات

**File** `apps/web/app/(admin)/admin/courses/page.tsx` · **Permission** `course:read-admin`

**Endpoint** `GET /api/admin/courses` → bare array. Fields the list parses:
`id(uuid) slug title subtitle|null coverKey|null status('draft'|'published'|'archived')
year(int) requiresGrant(bool) updatedAt(iso) system{nameAr} track{labelAr}|null subject{nameAr}
_count{lessons}`. **No filters, no sort, no paging on this screen.**

**Layout.** Header (`h1` `«الكورسات»` + lead
`«كل الكورسات — المنشور والمسودة. اللي مالوش صورة بياخد شكل تلقائي من لون المادة.»`) with a solid
amber `«كورس جديد»` button → `/admin/courses/new`.

Grid of `.panel` cards, `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`. Each card:

- **Art on top**, full card width. `CourseArt` — the *same* component the student library card
  uses. When `coverKey === null` the container gets `aspect-[16/9]` (the generated scene has no
  intrinsic height) and a scene is generated from `subject.nameAr` + `seed: slug`. Nothing crops.
- Badge plate over the art at `top-3 end-3` (the *inline-end* corner; the generated scene puts its
  subject glyph at the inline-start corner): status badge + `«مقفول»` badge with a Lock icon when
  `requiresGrant`.
  Status labels: `«مسودة»` / `«منشور»` / `«مؤرشف»`. Tones: draft `neutral`, published `accent`,
  archived `neutral` — **archived deliberately does not get `warn`**, because `--warn` and `--a-9`
  are 13° apart in oklch and would read as the same pill.
- Title (links to `/admin/courses/{id}`), `line-clamp-2` subtitle.
- Meta line: year label (`copy.years.year1|2|3`) · `system.nameAr` · `track.labelAr` ·
  `subject.nameAr`, plus `Layers` + `{_count.lessons}` and `CalendarClock` + `«آخر تعديل» {date}`.
- Per-card actions: `«افتح»` → `/admin/courses/{id}` and — **only when published** — `«معاينة»` →
  the public course page (a draft's public page is a 404).

**Empty** `«مفيش كورسات لسه»` (plain muted paragraph, no illustration).

---

### 4.3 `/admin/courses/new` — كورس جديد

**File** `.../courses/new/page.tsx` · **Permission** `course:create` (route is under
`course:read-admin` nav)

Loads taxonomy via `getTaxonomyOrNull() ?? getTaxonomyLiveOrNull()` and **throws** if both fail
(`GET /api/taxonomy is unavailable`) — unlike `/admin/students`, taxonomy is load-bearing here.

Renders `<CourseForm taxonomy action={createCourseAction}/>`.
`createCourseAction` → `POST /api/admin/courses`, then also creates a first section
(`POST /api/admin/courses/:id/sections`) and a first lesson, so the instructor lands on something
to fill in:
- first section title `«المقدمة»`
- first lesson title `«المحاضرة الأولى»`

Then redirects to `/admin/courses/{id}`.

---

### 4.4 `/admin/courses/[id]` — the course editor

**File** `.../courses/[id]/page.tsx` + `apps/web/components/admin/course/*` ·
**Permissions** read `course:read-admin`; writes `course:update`, `course:publish`,
`course:delete`, `section:write`, `section:reorder`, `lesson:write`, `lesson:reorder`

**Endpoint** `GET /api/admin/courses/:id` (via `apiGetAuthedOrNotFound`). Response shape parsed by
the page:

```
id slug title subtitle|null description|null systemId year trackId|null subjectId
coverKey|null requiresGrant emphasis|null emphasisNote|null comingSoonNote|null
scheduleNote|null whatsappGroupUrl|null contentComplete
monthlyPriceCents|null quarterlyPriceCents|null yearlyPriceCents|null
bookTitle|null bookPriceCents|null forGeneral forLanguages
status('draft'|'published'|'archived') examLessonId|null publishedAt|null
terms[]   { id title position isOpen priceCents|null }
sections[]{ id title summary|null position isPublished termId|null
            lessons[]{ id title kind position isPublished isFreePreview
                       forGeneral forLanguages estimatedSeconds
                       completionMode completionMinViewSeconds|null completionPassGrade|null
                       video{ externalId durationSeconds posterKey|null }|null
                       text{ bodyHtml }|null
                       _count{ progress, homeworkSubmissions }
                       homework{ body maxImages isPublished }|null
                       quiz{ id isPublished _count{slots} }|null
                       resources[] … } }
```

**Autosave, not a save button.** The status read-out (`aria-label` `«حالة حفظ الكورس»`) says:
idle `«كل حاجة بتتحفظ لوحدها كمسودة»` · saving `«بيحفظ…»` · saved `«اتحفظ»` ·
error `«مااتحفظش»` + `«نجرّب تاني»`.

**`.editor-bar`** (sticky under the header) holds: publish state, `«انشر الكورس كله»`, `«معاينة»`,
and a `«⋯»` («إجراءات تانية») menu with archive / delete / video check.

#### 4.4.1 The course form — six `FormSection` blocks, exact labels

| Block heading | Note under it | Fields |
|---|---|---|
| المعلومات الأساسية | الاسم والرابط والوصف — ده اللي بيظهر في قوايم الكورسات وفي نتايج البحث. | `title` **اسم الكورس** · `slug` **المُعرّف في الرابط** (hint `«حروف إنجليزي صغيرة وأرقام وشرطات — ده اللي بيظهر في العنوان»`) · `subtitle` **وصف مختصر** · `description` **الوصف** |
| التصنيف والمنهج | النظام والصف والمسار والمادة، ومين شايف الكورس من الشُّعَب. | `systemId` **النظام الدراسي** · `year` **الصف الدراسي** · `trackId` **المسار** (year 1 shows `«الصف الأول مالوش مسار»`) · `subjectId` **المادة** (empty list ⇒ `«مفيش مواد متاحة للاختيار ده — نظام أو صف أو مسار تاني»`; a subject the taxonomy no longer offers is held by an option labelled `«المادة الحالية (تفضل زي ما هي)»`) · stream radios (عربي / لغات / الاتنين) |
| صورة الكورس | بتظهر على كارت الكورس وفي لوحة الطالب. | `coverKey` via `<MediaKeyField>`, label **صورة الكورس**, hint `«بتظهر في صفحة الكورسات وفي لوحة الطالب. أحسن مقاس ١٦:٩.»` |
| الاشتراك والتسعير | أسعار الاشتراك بالجنيه. أي سعر بتحطه بيقفل الكورس تلقائيًا. | **اشتراك شهري (جنيه)** / **اشتراك ٣ شهور (جنيه)** / **اشتراك سنة كاملة (جنيه)**, all with placeholder `«مش للبيع»`; hint `«سيبهم فاضيين لو الكورس مجاني. أول ما تحط سعر لأي باقة، الكورس بيتقفل أوتوماتيك على أي حد جديد لحد ما يدفع ويتعمله موافقة — بالظبط زي «قفل الكورس ده» فوق.»` · switch **قفل الكورس ده** with hint `«الكورس هيبقى مقفول على أي حد جديد لحد ما تفتحه له بنفسك. الطلبة المشتركين قبل كده هيكمّلوا عادي، والمحاضرات اللي عليها «معاينة مجانية» هتفضل مفتوحة للكل.»` |
| الكتاب الورقي | كتاب المادة اللي الطالب يطلبه ويتشحنله. مالوش علاقة خالص بسعر الاشتراك. | **اسم الكتاب** / **سعر الكتاب (جنيه)** (legacy pair, now read-only and superseded by `/admin/books/catalog`); heading chip reads the PAIR: `«الكتاب متاح للطلب»` when both set, `«مفيش كتاب»` otherwise |
| الشارة والملاحظات | سطور بتظهر على الكارت وصفحة الكورس — مش بتتحكم في وصول حد. | switch **المنهج نزل كله** (hint `«سيبها فاضية طول ما لسه فيه محاضرات جاية. لغاية ما تعلّمها، الطالب اللي خلّص اللي نازل هيقرا «خلّصت اللي نزل» مش «خلصت الكورس».»`) · **شارة الكورس** (`emphasis`, empty option `«من غير شارة»`) · **سطر تحت الشارة** (placeholder `«أساسي لأولى بكالوريا · اختياري لتانية»`) · **رسالة «لسه هننزل قريبًا»** (placeholder `«المحاضرات بتتصور دلوقتي، هتتنزل الأسبوع الجاي»`) · **ميعاد المحاضرة** (free text, placeholder `«السبت الساعة ٨ مساءً»`) · **جروب الواتساب بتاع الكورس** (placeholder `https://chat.whatsapp.com/…`) |

`emphasisHint`: `«بتظهر على كارت الكورس للطالب. دي بتقوله الكورس ده مهم قد إيه بالنسباله — مابتقفلش ولا بتفتح حاجة، الكورس يفضل مفتوح زي ما هو.»`

#### 4.4.2 Terms — الترمين

Panel heading `«الترمين»`, lead
`«قسّم محتوى الكورس لترمين — كل قسم تقدر تحطه جوه ترم، والسويتش هنا بيفتح أو يقفل البيع والوصول للترم ده بس.»`,
empty `«الكورس ده لسه من غير ترمين.»`, add `«ترم جديد»`.
Fields per term: **اسم الترم**, **سعر الترم**, toggle (`aria-label` `«فتح/قفل الترم»`) showing
`«مفتوح»` / `«مقفول»`.

Endpoints: `GET/POST /api/admin/courses/:courseId/terms`, `PATCH /api/admin/terms/:id`,
`PATCH /api/admin/terms/:id/open` (all `section:write`).

Closing a term **cascades**: the toast reports it —
`«اتقفل الترم، وسحبنا الوصول من {n} طالب كان مشترك فيه.»` or `«اتقفل الترم — محدش كان مشترك فيه لسه.»`
Reopening: `«اتفتح الترم تاني للاشتراك.»` Failure: `«حصل خطأ، حاول تاني»`.

#### 4.4.3 Sections and lessons

Sections use `.unit` (the student's own container). Per section: drag handle, inline-editable
title, `{done}/{total} محاضرة` + status, expand/collapse (`«فتح القسم»` / `«اطوِ القسم»`), and a
`.row-actions` cluster: تعديل · نشر · **حذف القسم**.

- New: `«قسم جديد»`; fields **اسم القسم**, **نبذة**; term picker **الترم** with
  `«بدون ترم»`.
- Empty: `«مفيش أقسام لسه»`.
- Delete confirm: `«هيتمسح القسم وكل المحاضرات اللي جواه. الإجراء ده مش هيترجع.»`
- Delete blocked (has attempts):
  `«القسم ده فيه محاضرة عليها محاولات امتحان لطلبة، فمينفعش يتمسح خالص — رجّعه مسودة عشان يختفي من الطلبة ودرجاتهم تفضل محفوظة»`
- Endpoints: `POST /api/admin/courses/:courseId/sections`, `PATCH /api/admin/sections/:id`,
  `DELETE /api/admin/sections/:id`, `PATCH /api/admin/courses/:courseId/sections/order`.

Lessons use `.lesson-row`. New: `«محاضرة جديدة»`. Empty: `«مفيش محاضرات في القسم ده»`.

**Lesson panel fields**: **عنوان المحاضرة** · **النوع** · **معاينة مجانية** ·
**المدة التقديرية بالثواني** · **رابط يوتيوب** (hint
`«بناخد كود الفيديو (11 حرف) بس — الباقي بيتشال ومحدش بيفتح الرابط»`, invalid ⇒
`«الرابط ده مش رابط يوتيوب صالح»`) · **صورة المحاضرة** (`«بتظهر قبل ما الفيديو يشتغل. لو سيبتها فاضية هتظهر صورة يوتيوب.»`) ·
**محتوى الدرس**.

Endpoints: `POST /api/admin/sections/:sectionId/lessons`, `PATCH /api/admin/lessons/:id`,
`DELETE /api/admin/lessons/:id`, `PUT|DELETE /api/admin/lessons/:id/video`,
`POST /api/admin/lessons/:id/video/mirror`, `PUT /api/admin/lessons/:id/text`,
`PATCH /api/admin/sections/:sectionId/lessons/order`,
`GET /api/admin/lessons/video-duration`.

**Video duration probe** — server probes YouTube, browser probes the player; a manual
**مدة الفيديو بالثواني** field appears only if both come back empty.
- probing: `«بنجيب المدة من يوتيوب…»` · at rest: `«بتتجاب من يوتيوب»`
- both failed: `«يوتيوب مارضيش يقول مدة الفيديو ده — اكتبها بالثواني.»` + `«نجرّب تاني»`
- API refusal: `«يوتيوب مارضيش يقول مدة الفيديو للسيرفر دلوقتي — ده بيحصل أحياناً ومالوش علاقة بالفيديو. المدة تتكتب بالثواني، أو نجرّب تاني بعد شوية.»`

**Embed check** (separate from duration — a video with embedding off still has a watch page):
- checking `«بنتأكد إن الفيديو هيشتغل جوه المنصة…»`
- ok `«الفيديو هيشتغل جوه المنصة»`
- blocked `«الفيديو ده متقفول عليه التضمين، يعني هيشتغل على يوتيوب بس ومش هيشتغل جوه المنصة. افتحه في YouTube Studio ← تفاصيل ← اختيارات أخرى، وفعّل «السماح بالتضمين».»`
- unavailable `«يوتيوب بيقول إن الفيديو ده مش متاح — يا إما private، يا إما اتمسح، يا إما عليه قيد سن أو بلد. الطلبة مش هيعرفوا يشوفوه.»`
- unknown `«مقدرناش نتأكد إن الفيديو هيشتغل — راجعه بنفسك قبل ما تنشر.»`

**In-admin preview** (the student player is enrolment-gated and would 404 for the instructor):
`«معاينة المحاضرة»` / `«تشغيل الفيديو»` / `«قفل المعاينة»` / `«افتحه على يوتيوب»`.

**Remove video**: `«شيل الفيديو»`, confirm
`«هيتشال الفيديو من المحاضرة. المحاضرة نفسها هتفضل موجودة.»`, done `«الفيديو اتشال»`.

**Delete lesson** confirm: `«هتتمسح المحاضرة وكل اللي جواها — الفيديو والمواد. الإجراء ده مش هيترجع.»`
plus, when `_count.progress > 0`, `«تقدّم الطلبة دول في المحاضرة هيتمسح معاها: {n}»`.
Blocked by attempts: `«المحاضرة دي عليها محاولات امتحان لطلبة، فمينفعش تتمسح خالص — رجّعها مسودة عشان تختفي من الطلبة ودرجاتهم تفضل محفوظة»`.

**Lesson settings** (`«إعدادات المحاضرة»`): **قاعدة الإتمام** with options
`«من غير قاعدة»` / `«الطالب بيعلّمها خلصت»` / `«بعد مشاهدة مدة معيّنة»` / `«بعد ما ياخد درجة»` /
`«بعد ما ينجح»`, then **أقل مدة مشاهدة بالثواني** and **درجة النجاح ٪**.

#### 4.4.4 Lesson resources — مواد الدرس

Heading `«مواد الدرس»`, hint `«المواد بتتعلّق على أي نوع محاضرة — فيديو، نص، أو مرفقات.»`,
add `«أضف مادة»`, empty `«لسه مفيش مواد. نبدأ بالبريزنتيشن الأساسي.»`.

Kinds: **بريزنتيشن أساسي** · **فيديو شرح** · **ملف** · **رابط**.
Fields: **الاسم**, **وصف مختصر**, **الملف** (hint `«PDF أو PowerPoint أو Word أو Excel — ٩٥ ميجا كحد أقصى»`,
drop hint `«سحب الملف هنا، أو دوسة للاختيار»`), **رابط يوتيوب**, **الرابط** (`«لازم يبدأ بـ https»`).

Upload states: `«بنرفع…»` → `«الملف اترفع»`. Failures:
`«مقدرناش نرفع الملف»` (fallback) · `«الملف كبير أوي — الحد الأقصى ٩٥ ميجا.»` ·
`«النوع ده مش مدعوم. المسموح: PDF أو PowerPoint أو Word أو Excel.»` ·
`«الملف ده مش سليم أو نوعه الحقيقي مش زي امتداده.»` · `«النت قطع في نص الرفع. نجرّب تاني.»`

Only **one** «بريزنتيشن أساسي» per lecture (partial unique index). Violation ⇒
`«المحضرة دي فيها بريزنتيشن أساسي واحد خلاص. القديم يتمسح الأول، أو ده يتضاف كـ«ملف».»`
(exact string in `copy/admin.ts:678`: `«المحاضرة دي فيها بريزنتيشن أساسي واحد خلاص. القديم يتمسح الأول، أو ده يتضاف كـ«ملف».»`)
plus the standing note `«فيه بريزنتيشن أساسي واحد بس لكل محاضرة.»` Other refusals ⇒
`«مقدرناش نضيف المادة دي. نجرّب تاني.»` Disabled-add reason: `«الملف الأول»`.

Endpoints: `POST /api/admin/lessons/:id/resources`, `PATCH /api/admin/resources/:id`,
`DELETE /api/admin/resources/:id`, `PATCH /api/admin/lessons/:id/resources/order`.

#### 4.4.5 Homework block inside a lesson — واجب المحاضرة

Heading `«واجب المحاضرة»`, hint
`«اكتب المطلوب زي ما بتقوله في الحصة. الطالب هيقراه هنا ويرفع صور الحل بتاعه، وهتلاقيها في «الواجبات».»`,
add `«أضف واجب على المحاضرة دي»`.
Fields: **المطلوب** (multiline; placeholder is literally
`"١- حل تمرين ٣ صفحة ٤٠\n٢- ارسم المنحنى\n٣- اكتب الخلاصة في سطرين"`), **أقصى عدد صور للحل**,
switch **اظهر الواجب للطلبة** with `«وهو مقفول محدش بيشوفه — تقدر تكتب وتسيبه لبعدين.»`,
and `«شيل الواجب»` (confirm `«أشيل الواجب من المحاضرة دي؟ الحلول اللي اتسلّمت هتفضل موجودة.»`).
When submissions are waiting: `«فيه {n} حل مستني مراجعة»` + `«شوف الحلول»` → `/admin/homework`.

Validation (`HomeworkWriteSchema`): `body` trimmed 3–4000, `maxImages` int 1–8 (default 4),
`isPublished` bool default `false`.
Endpoints: `PUT /api/admin/lessons/:id/homework`, `DELETE /api/admin/lessons/:id/homework`
(`lesson:write`).

#### 4.4.6 The exam gate — امتحان الكورس

Heading `«امتحان الكورس»`, hint
`«محاضرة من نوع «اختبار» تبقى امتحان الكورس النهائي. مش بتتفتح للطالب غير لما كل المحاضرات التانية تخلص، ولازم النجاح فيها عشان الكورس يتحسب خلص.»`
Controls: `«من غير امتحان»`, `«الامتحان الحالي»`, `«أضف امتحان الكورس»`, `«فتح الامتحان»`,
`«اختيارات متقدمة»`; blocked when no quiz lesson exists: `«لازم تعمل محاضرة من نوع «اختبار» الأول.»`;
scaffold failure `«مقدرناش نعمل الامتحان — نجرّب تاني»`.
Gate line: `«هيتفتح للطالب بعد ما يخلّص {n} محاضرة»`, or
`«مفيش محاضرات منشورة لسه، فالامتحان هيتفتح للطالب على طول»`. Also `«{n} سؤال»`,
`«لسه من غير أسئلة»`, `«لسه مسودة»`.
Endpoints: `PUT /api/admin/courses/:id/exam`, `POST /api/admin/courses/:id/exam/scaffold`.

#### 4.4.7 Publish-all and destructive actions

- **`«انشر الكورس كله»`** → `POST /api/admin/courses/:id/publish-all` (`course:publish`).
  Hint `«هينشر الكورس وكل محاضرة جاهزة جواه. اللي لسه ناقص هيفضل مسودة.»`
  Confirm `«الكورس وكل المحاضرات الجاهزة هيبقوا ظاهرين للطلبة. تمام؟»`
  Result: `«اتنشرت {n} محاضرة»` plus, when anything was skipped,
  `«ما اتنشرتش عشان لسه ناقصة:»` with per-lesson reasons:
  `«مافيهاش فيديو»` / `«مافيهاش محتوى»` / `«مافيهاش مواد مرفوعة»` / `«الاختبار بتاعها لسه مش منشور»`.
- **Publish / unpublish** → `PATCH /api/admin/courses/:id/status`. Labels `«نشر»` /
  `«رجّعه مسودة»`. Blocked: `«لازم يكون فيه محاضرة منشورة واحدة على الأقل»`.
- **Archive** confirm `«نأرشف الكورس ده؟ هيتشال من واجهة الطلبة.»`; restore
  `«نرجّع الكورس ده مسودة؟»`.
- **Delete** → `DELETE /api/admin/courses/:id` (`course:delete`), confirm
  `«نمسح الكورس ده؟ الإجراء ده مش هيترجع.»`; blocked when any attempt exists:
  `«الكورس ده فيه محاولات امتحانات لطلبة، فمينفعش يتمسح خالص — أرشفه بدل ما تمسحه»`.
- **Video check** → `GET /api/admin/courses/:id/video-check` (`course:read-admin`).
  `«افحص فيديوهات الكورس»`, hint `«بيسأل يوتيوب عن كل فيديو في الكورس ويقول لك المكسور منهم.»`,
  running `«بنسأل يوتيوب…»`, all-good `«كل الفيديوهات شغالة ({n})»`, otherwise
  `«الفيديوهات دي فيها مشكلة:»` with per-lesson reason from
  `«مافيهاش فيديو أصلاً»` / `«التضمين مقفول — شغّال على يوتيوب بس»` /
  `«يوتيوب بيقول مش متاح (private أو متمسوح)»` / `«مقدرناش نتأكد منه»`; failure
  `«الفحص مانجحش — نجرّب تاني»`.

**Reorder announcements** (drag & drop, keyboard: space + arrows):
hint `«سحب لإعادة الترتيب، أو زر المسافة والأسهم من الكيبورد»`, handle `«مقبض السحب»`,
`«اتمسكت المحاضرة في الترتيب رقم»` / `«اتمسك القسم في الترتيب رقم»` /
`«اتمسكت المادة في الترتيب رقم»` / `«بقت في الترتيب رقم»` / `«اتسابت في الترتيب رقم»` /
`«اتلغى السحب والترتيب رجع زي ما كان»`.
⚠️ Known defect worth reproducing or fixing: `pickedUp` says «المحاضرة» and is read by four
sortable lists — home blocks, nav items and quiz slots included.

---

### 4.5 `/admin/students` — الطلبة

**File** `.../students/page.tsx`, `students-table.tsx`, `columns.tsx`, `search-params.ts` ·
**Permissions** `student:read` (list), `student:delete` (bulk bar)

**Endpoint** `GET /api/admin/students` + `getTaxonomyOrNull()` (for the filter labels only —
`null` costs an empty dropdown, never the screen; see the 2026-09-04 outage note in the file).

**Query params** (`StudentListQuerySchema`, `packages/contracts/src/admin/students.ts`):

| Param | Type | Default | Notes |
|---|---|---|---|
| `page` | int ≥1 | 1 | |
| `perPage` | int 1–100 | 20 | UI offers `PAGE_SIZES` = 10/20/50/100 |
| `q` | string ≤120 | `''` | free text, throttled 400 ms in the URL |
| `governorate` | repeated, each exactly 2 chars | `[]` | Express collapses a single repeat to a scalar — the schema `z.preprocess(toArray, …)` handles it |
| `year` | repeated int | `[]` | |
| `track` | repeated string | `[]` | |
| `sort` | `createdAt` \| `fullName` \| `governorate` | `createdAt` | maps to columns `createdAt` / `fullName` / `governorateCode` |
| `dir` | `asc` \| `desc` | `desc` | |
| `access` | `hand_opened` \| `comped` \| `paid` \| null | null | see below |

`access` semantics (scoped to `scope: 'course'` grants only — the automatic `platform` grant is
excluded or all 500 accounts land in the "free" bucket):
- `hand_opened` — holds a live `source:'admin'` grant. **Shows on neither money screen.**
- `comped` — live `purchase` grant whose approved submission is `isFree`.
- `paid` — live `purchase` grant actually paid for.

Filter labels: **المحافظة** / **الصف** / **المسار** / **طريقة الدخول**, with
`hand_opened` = `«اتفتح بالإيد»`, `comped` = `«اتسجّل مجاني»`, `paid` = `«مدفوع»`.

**Response row** `AdminStudentRowSchema`:
```
id(string, nanoid) fullName email|null phone(E.164) gender('male'|'female')
governorateCode(len 2) governorateNameAr systemSlug|null year|null trackLabelAr|null
onboardingCompleted(bool) createdAt(string) bannedAt(string|null)
```
`email` is `null` for phone-only accounts — the API strips the synthesised
`…@phone.invalid` placeholder rather than sending it.

**Table columns** (TanStack table, `columns.tsx`):

| id | Header | Sortable | Cell |
|---|---|---|---|
| `select` | checkbox, `aria-label` `«حدد الكل»` | no | row checkbox `«حدد الصف»` |
| `fullName` | **الاسم** | yes | link to `/admin/students/{id}`; if `bannedAt` an `err`-tone badge `«موقوف»` sits beside the name (deliberately not its own column) |
| `email` | **البريد الإلكتروني** | no | `null` ⇒ faint `«مادّاش إيميل»` |
| `phone` | **رقم الهاتف** | no | |
| `governorate` | **المحافظة** | yes | `governorateNameAr` |
| `year` | **الصف** | no | `year ?? '—'` |
| `track` | **المسار** | no | `trackLabelAr ?? '—'` |
| `onboardingCompleted` | **حالة التسجيل** | no | Badge `accent` `«اكتمل التسجيل»` / `neutral` `«لسه ما كملش»` |
| `createdAt` | **تاريخ الانضمام** | yes | `toLocaleDateString('ar-EG')` |

**Toolbar**: search box (`«دور...»`), `<FacetedFilter>` × 4 (governorate, year, track, access),
`«مسح الفلاتر»`. **Pagination**: `«صفحة» {n} «من» {m}`, `«عدد الصفوف»`,
`«الأولى» «السابقة» «التالية» «الأخيرة»`. Empty: `«مفيش نتائج مطابقة»`.
Selection: `«{n} متحدد»`, `«إلغاء التحديد»`.

**Bulk bar** (`DataTableBulkBar`) — sticky at `top: var(--admin-header-h)`, amber-tinted
(`bg-[color-mix(in_oklch,var(--a-9),var(--n-2)_88%)]`, `border-accent/40`). Only control:
`«مسح المحدد»` (needs `student:delete`).

**Bulk delete dialog** (`bulk-delete-dialog.tsx`):
- Title `«مسح {n} حساب نهائيًا»`
- Body `«الحسابات دي هتتمسح خالص ومش هينفع ترجع. هيتمسح معاها: تسجيل الدخول، الاشتراكات في الكورسات، كل محاولات الامتحانات وإجاباتها، والإشعارات. ولو المطلوب إيقافهم بس، من صفحة الحساب فيه «إيقاف الحساب» — وده بيترجع.»`
- List `«الحسابات اللي هتتمسح»` (names + emails), overflow `«و{n} حساب كمان»`
- Field `«كلمة «مسح» للتأكيد»` — must equal exactly `«مسح»`
- Field `«سبب المسح»` placeholder `«وضّح سبب المسح — هيتسجل في سجل النشاط لكل حساب»`
- Confirm `«امسحهم نهائيًا»`
- **Endpoint** `DELETE /api/admin/students` (collection-level; declared **before**
  `DELETE /:userId` in the controller). Body `AdminStudentBulkDeleteSchema`:
  `{ userIds: string[1..100] (each 1–64 chars), reason: string 8–500 }`.
- **Response** `{ deleted: string[], failed: [{ userId, name, reason }] }` where reason ∈
  `self` | `last-admin` | `authored-content` | `not-found`. **Partial success is the normal
  outcome.** UI keeps exactly the failed rows selected.
- Toasts: `«اتمسح {n} حساب»` + `«{n} حساب ما اتمسحوش — اتساب متحددين»`;
  none deleted ⇒ `«مفيش حساب اتمسح»`; request failed ⇒ `«مقدرناش نمسح — نحاول تاني»`.
  Per-row reasons rendered as `«حسابك إنت»` / `«آخر مسؤول»` / `«مؤلف محتوى»` / `«اتمسح قبل كده»`.

---

### 4.6 `/admin/students/[userId]` — بيانات الطالب

**File** `.../students/[userId]/page.tsx` + 7 section components ·
**Permissions** `student:read` + the write permissions per section

**Six parallel reads** (`Promise.all`):
1. `GET /api/admin/students/:userId` → `AdminStudentDetailSchema`
2. `getTaxonomyOrNull()` (governorate options only)
3. `GET /api/admin/students/:userId/grants` → `AdminGrantRow[]`
4. `GET /api/admin/courses` (narrow parse: `id title status requiresGrant
   monthly/quarterly/yearlyPriceCents terms[{id,title,isOpen,priceCents}]`)
5. `GET /api/admin/students/:userId/subscriptions` → `AdminSubscriptionRow[]`
6. `GET /api/admin/students/:userId/history` → `StudentHistoryEntry[]`

Plus a **seventh, streamed behind its own `<Suspense>`**:
`GET /api/admin/analytics/students/:userId` → `StudentAnalyticsDetail`. It is the slow read
(8 queries incl. a cohort comparison) and the only one **allowed to fail**: that route 404s for
any account whose `role !== 'student'`, and this page legitimately opens admins. On failure it
renders, in place, `«مافيش سجل للحساب ده»` + `«السجل بيتبني للحسابات الطلابية بس. ولو ده حساب طالب فعلًا، تحديث الصفحة بيجيبه.»`
The skeleton is 2 rows × 4 tiles then a wide card.

**`AdminStudentDetailSchema`** = row + `role, schoolName|null, schoolStream('general'|'languages')|null,
fatherPhone|null, motherPhone|null, electiveSubjectNameAr|null, bannedReason|null, bannedByName|null`.

**Page chrome**: back link `«< رجوع لقائمة الطلبة»`; then a header row with the name
(`--fs-title-2` semibold), the phone in mono, and a WhatsApp button `«مراسلته على واتساب»`
(`wa.me` only — there is no `tel:` anywhere in this product).

**Grid**: `lg:grid-cols-[2fr_1fr]`. Left = the profile form. Right column, in this order (the
destructive panel is second-to-last on purpose):

#### a) `<StudentDetailForm>` — البيانات الشخصية / البيانات الدراسية

`PATCH /api/admin/students/:userId` (`student:write`), body `AdminStudentPatchSchema` (`.strict()`,
must have ≥1 key; **no `role`, no `password`** — both have their own endpoints so a role escalation
can never ride inside a profile edit):

| Field | Label | Rule |
|---|---|---|
| `fullName` | الاسم بالكامل | 2–120 |
| `schoolName` | اسم المدرسة | ≤160, nullable |
| `governorateCode` | المحافظة | exactly 2 chars |
| `year` | الصف | int 1–3, nullable |
| `schoolStream` | المدرسة | `general`\|`languages`, nullable; unset renders `«مش متسجّل»` |
| `phone` | رقم الهاتف | `egyptianPhone('رقم الموبايل مطلوب')`, **never nullable** — same parser the register form uses, so `01012345678` normalises to the exact E.164 string login matches |
| `email` | البريد الإلكتروني | `z.email('أدخل بريدًا إلكترونيًا صحيحًا')`, nullable, refuses `…@phone.invalid` |

Read-only facts also shown: **رقم هاتف ولي الأمر** (+ `«واتساب ولي الأمر»`),
**رقم هاتف الأم** (+ `«واتساب الأم»`), **المادة الاختيارية**, **عضو من**.
Toasts: `«اتحفظت بيانات الطالب»` / `«مقدرناش نحفظ — نحاول تاني»` / 409 ⇒
`«الرقم أو الإيميل ده متسجّل بحساب تاني بالفعل»`.

#### b) `<RoleChangeSection>` — الدور الحالي

`POST /api/admin/students/:userId/role` (`student:role-change`), body
`{ role: 'admin'|'student', reason: string 8–500 }`.
Labels: **الدور الحالي** (`«مسؤول»` / `«طالب»`), button **تغيير الدور**, dialog
**تغيير دور المستخدم** with **الدور الجديد** and **سبب التغيير**
(placeholder `«وضّح سبب تغيير الدور — هيتسجل في سجل النشاط»`), confirm **تأكيد التغيير**.
Success `«اتغيّر الدور»`; failure `«مقدرناش نغيّر الدور — نحاول تاني»`;
`«مينفعش تغيّر دورك إنت»`; `«ده آخر مسؤول في المنصة — مينفعش تلغي صلاحياته»`.

#### c) `<SetPasswordSection>` — كلمة السر

`POST /api/admin/students/:userId/set-password` (`student:set-password`), body
`{ newPassword: string 8–128 }` → `{ status: true }`.
Lead: `«كلمة السر متشفّرة ومفيش طريقة نشوفها. لو الطالب نسيها، تقدر تحط له واحدة جديدة من هنا.»`
Button **تعيين كلمة سر جديدة**; dialog same title; fields **كلمة السر الجديدة** +
**تأكيد كلمة السر الجديدة**; confirm **تعيين كلمة السر**.
The mismatch check `«كلمتا المرور مش متطابقتين»` runs **server-side in the action too**, not only
in client state. Success `«اتغيّرت كلمة السر»`, failure `«مقدرناش نغيّر كلمة السر — نحاول تاني»`.
There is **never** a "show password" — passwords are Argon2id hashes.

#### d) `<CourseAccessSection>` — الكورسات المقفولة

Only courses with `requiresGrant: true` are offered (a grant on an open course is a no-op).
- `POST /api/admin/students/:userId/grants` (`student:write`), body `AdminGrantCreateSchema`
  `{ courseId: uuid, validUntil: iso|null = null, note: string ≤500|null = null }` →
  `AdminGrantRow[]`. **This form always sends `validUntil: null, note: null`.**
- `DELETE /api/admin/students/:userId/grants/:grantId` → stamps `revokedAt`, never deletes.
- `AdminGrantRowSchema`: `id courseId courseTitle source validFrom validUntil|null revokedAt|null note|null`.

Copy: title **الكورسات المقفولة**, lead `«الكورسات اللي قافلها بتتفتح للطالب من هنا.»`,
empty `«الطالب ده مافتحتلوش أي كورس مقفول.»`, add **فتح كورس** / **فتح**, states
`«مفتوح»` / `«اتقفل»`, revoke **اقفله**, `«مفيش كورسات مقفولة أصلاً.»`,
`«كل الكورسات المقفولة مفتوحة للطالب ده.»`

#### e) `<SubscriptionSection>` — اشتراكات الكورسات المدفوعة

A **different mechanism** from (d): this creates a real plan-scoped subscription through
`PaymentsService.adminManualSubscribe`, producing the same `AccessGrant`/`Enrollment` state a
genuine approval does.

- `POST /api/admin/students/:userId/subscriptions` (`payment:review`), body
  `AdminManualSubscribeSchema` (`.strict()`):
  ```
  courseId: uuid
  plan: 'monthly'|'quarterly'|'yearly'|'term'
  termId: uuid|null = null      // required iff plan === 'term', forbidden otherwise
                                //   refine message: «لازم تختار الترم»
  isFree: boolean               // true = comped, never counted as revenue
  screenshotKey: string 1..255|null = null   // OPTIONAL, unlike the student flow
  ```
  **No `amountCents`** — the price is always derived from the course's own plan price.
- `DELETE /api/admin/students/:userId/subscriptions/:grantId` (`payment:review`).
- Rows `AdminSubscriptionRowSchema`: `id courseId courseTitle plan|null termId|null termTitle|null
  amountCents|null isFree|null validUntil|null revokedAt|null createdAt`.
  `validUntil` is **always `null` for a term-scoped grant** — it expires only when an admin closes
  the term.
- The screenshot is uploaded client-side first (two-step, same as the student `SubscribePanel`);
  the action never sees the file.

Copy: title **اشتراكات الكورسات المدفوعة**, lead
`«اشترك الطالب في كورس مدفوع من هنا — بنفس الباقات والأسعار اللي شايفها في صفحة الكورس، وبيتفعّل على طول زي ما لو دفع إنستاباي وتمت الموافقة عليه.»`,
empty `«الطالب ده مالوش أي اشتراك مدفوع لسه.»`, `«مفيش كورسات مدفوعة أصلاً.»`,
button **اشتراك جديد**, dialog **اشتراك جديد** with **الكورس**, **الباقة**,
radio option label **ترم** + picker **الترم** (a closed term is still offered, badged `«مقفول»`
— this is the deliberate admin override), radios **مجاني (منحة/تعويض)** (hint
`«هيتفعّل بنفس مدة الباقة، بس مش هيتحسب ضمن الإيرادات في صفحة «الاشتراكات والإيرادات».»`) /
**مدفوع**, `«المبلغ: {amount} ج»`, checkbox `«أأكد إن مبلغ {amount} ج اتحول للكورس ده»`,
**صورة التحويل (اختياري)** (`«لو معاك صورة التحويل من واتساب ممكن ترفعها هنا — مش شرط.»`),
submit **تسجيل الاشتراك** / **بيتسجّل…**.
Warnings: `«الطالب مشترك في الكورس ده لحد {date} بالفعل — الاشتراك ده هيتضاف فوق المتبقي.»` /
`«الطالب مشترك في الترم ده بالفعل.»`
Errors: `«مقدرناش نرفع الصورة — نحاول تاني»` / `«مقدرناش نسجل الاشتراك — نحاول تاني»`.
Row states `«شغّال»` / `«اتلغى»` / `«خلص»` + badge `«مجاني»`.
Cancel: button **إلغاء الاشتراك**, dialog same title, body
`«الطالب مش هيقدر يفتح الكورس ده تاني لحد ما يشترك من جديد. الفلوس اللي اتدفعت مش بترجع من هنا — ده بس بيقفل الوصول.»`,
confirm **إلغاء الاشتراك**, failure `«مقدرناش نلغي الاشتراك — نحاول تاني»`.

#### f) `<AccountAccessSection>` — حالة الحساب

States `«نشط»` / `«موقوف»`, with `«موقوف من {date}»`, `«بواسطة {name}»`, `«سبب الإيقاف»`.

**Ban** — `POST /api/admin/students/:userId/ban` (`student:ban`), body
`{ reason: string 8–500 }` (required: the student is shown it on the sign-in screen).
Button **إيقاف الحساب**, dialog **إيقاف حساب الطالب**, body
`«الطالب مش هيقدر يدخل على حسابه تاني، وكل الأجهزة المفتوحة هتتقفل على طول. بياناته وتقدّمه كلهم زي ما هم، وتقدر ترجّعه في أي وقت.»`,
field **سبب الإيقاف** placeholder `«الطالب هيشوف السبب ده لما يحاول يدخل — اكتبه بوضوح»`,
confirm **أوقف الحساب**. Success `«الحساب اتوقف»`.

**Unban** — `POST /api/admin/students/:userId/unban`. Dialog **رفع الإيقاف عن الحساب**, body
`«الطالب هيقدر يدخل تاني عادي. مش هنرجّع الأجهزة اللي كانت مفتوحة — هيسجّل دخول من الأول.»`,
confirm **رفع الإيقاف**, success `«اترفع الإيقاف»`.

**Delete** — `DELETE /api/admin/students/:userId` (`student:delete`), body
`AdminStudentDeleteSchema` `{ confirmIdentity: string 3–320, reason: string 8–500 }`.
Button **مسح الحساب نهائيًا**; body
`«الحساب ده هيتمسح خالص ومش هينفع يترجع. هيتمسح معاه: تسجيل الدخول، الاشتراكات في الكورسات، كل محاولات الامتحانات وإجاباتها، والإشعارات. ولو المطلوب إيقافه بس، فيه «إيقاف الحساب» — وده بيترجع.»`;
field **رقم الحساب أو إيميله للتأكيد** with hint `«المطلوب: {identity}»`;
field **سبب المسح** placeholder `«وضّح سبب المسح — هيتسجل في سجل النشاط قبل ما الحساب يروح»`;
confirm **مسح نهائي**; success `«الحساب اتمسح»`, then **redirect to `/admin/students`** (the page
being viewed no longer exists).

⚠️ **`confirmIdentity` matching is not a string compare.** `deleteIdentityMatches()` in
`packages/contracts/src/admin/students.ts` is shared by the dialog and the service:
- expected identity = `phone ?? email ?? null`; `null` ⇒ always false (fail closed).
- trimmed, case-insensitive equality first.
- then, **only if the expected value is itself a valid Egyptian number**, both sides are folded to
  the 10 national digits: `+201223334567`, `00201223334567`, `201223334567`, `01223334567`,
  `+01223334567`, with spaces/dashes/brackets, all reduce to `1223334567`.
- the typed value must LOOK like a bare number (`/^\+?[\d\s()-]+$/`) before its digits are read,
  otherwise `01223334567@example.test` would parse as a phone and the check would degrade to a
  substring match.

Blocked delete (409) → `«الحساب ده مؤلف محتوى على المنصة ({items})، فمينفعش يتمسح. انقل المحتوى لحساب تاني أو امسحه الأول، أو أوقف الحساب بدل ما تمسحه.»`
where `{items}` is built from `AdminStudentDeleteBlockerSchema`
`{ courses, questionBankEntries, questionVersions, newsPosts }` joined with `« و»` using
`«{n} كورس»`, `«{n} سؤال»` (bank entries + versions **summed**), `«{n} مقال»`.

#### g) `<HistorySection>` — سجل الحساب

`GET /api/admin/students/:userId/history` → `StudentHistoryEntry[]`, one flat **newest-first** list
(never per-source sections — the answer is usually in the order).

```
key(string, `<kind>:<row id>`)  kind  at(iso)
courseId|null courseTitle|null  actorName|null  source|null
amountCents|null isFree|null plan|null validUntil|null detail|null
```

`STUDENT_HISTORY_KINDS` → label:

| kind | Arabic |
|---|---|
| `account_created` | سجّل في المنصة |
| `grant_created` | اتفتح له كورس |
| `grant_revoked` | اتقفل عنه الكورس |
| `payment_submitted` | بعت تحويل اشتراك |
| `payment_approved` | الاشتراك اتقبل |
| `payment_rejected` | الاشتراك اترفض |
| `book_order_placed` | طلب كتاب |
| `book_order_paid` | دفع الكتاب |
| `book_order_shipped` | الكتاب اتشحن |
| `book_order_delivered` | الكتاب اتسلّم |
| `book_order_rejected` | طلب الكتاب اترفض |
| `banned` | الحساب اتحظر |
| `unbanned` | الحظر اترفع |

Title **سجل الحساب**, lead `«كل اللي حصل في الحساب ده بالترتيب، ومين اللي عمله.»`,
empty `«مافيش حاجة اتسجلت على الحساب ده لسه.»`, actor `«بواسطة {name}»` or `«الطالب بنفسه»`.
`source` → `«اتفتح بالإيد»` / `«اشتراك مدفوع»` / `«تلقائي (كورسات مفتوحة)»`.
A grant with no `validUntil` prints `«مبينتهيش»` — **never a blank cell**, because blank reads as
"unknown" and this means "forever". Dated: `«لحد {date}»`. Comped: `«مجاني»`.

#### h) The analytics record — سجل الطالب (full width, below the columns)

Heading **سجل الطالب**, lead `«كل حاجة عملها: شاف إيه، قعد قد إيه، ودخل أنهي امتحانات.»`
Rendered by `apps/web/components/admin/students/student-record.tsx` from
`StudentAnalyticsDetail` (see §4.13.4 for the shape and the labels).

---

### 4.7 `/admin/payments` — المدفوعات (InstaPay review queue)

**File** `.../payments/page.tsx`, `actions.ts`, `review-actions.tsx`, `screenshot-thumbnail.tsx` ·
**Permissions** `payment:read` (list), `payment:review` (approve/reject)

**Endpoint** `GET /api/admin/payments/submissions?perPage=50&page={n}&sort={s}[&status={st}]`
→ `listResponse(AdminPaymentRowSchema)`.

**Query** (`AdminPaymentQuerySchema` = `ListQuerySchema` minus `dir`/`q`, plus):
- `status` — `pending` | `approved` | `rejected`, **optional**. `'all'` is a screen-only value:
  omitting the key entirely is how it means every status.
- `sort` — `oldest` (**default**) | `newest` | `amount_desc` | `amount_asc`.
- `perPage` fixed at **50** by the page; `page` from the URL, min 1.
- Unrecognised `status` falls back to `pending` (the queue's whole point).

**Row** `AdminPaymentRowSchema`:
```
id(uuid) userId(string) studentName studentEmail|null studentPhone|null
courseId(uuid) courseTitle
plan('monthly'|'quarterly'|'yearly'|'term') termId|null termTitle|null
amountCents(int) senderPhone|null status rejectionReason|null
approvedBefore(int ≥0) createdAt(iso) reviewedAt|null isFree(bool) hasScreenshot(bool)
```

**Header**: eyebrow `«إنستاباي»` (mono, uppercase, `text-accent-text`), `h1` `«المدفوعات»`,
subtitle `«طلبات اشتراك الطلبة في الكورسات المدفوعة، بانتظار المراجعة.»`

**Two `<ListControl>` dropdowns**:
- name `status`, label **الحالة** — `«قيد المراجعة»` (value `pending`) · `«اتوافق عليها»`
  (`approved`) · `«اترفضت»` (`rejected`) · `«الكل»` (value `''`).
- name `sort`, label **الترتيب** — `«الأقدم الأول»` / `«الأحدث الأول»` / `«الأغلى الأول»` /
  `«الأرخص الأول»`.

**Empty state** (dashed border, centred, `py-12`): `«مفيش طلبات دلوقتي»` +
`«أول ما طالب يبعت طلب اشتراك، هيظهر هنا.»`

**Row card** (`rounded-xl border border-line bg-surface-2 p-4`, `sm:flex-row`):

*Left block*
- Student name → `/admin/students/{userId}`, dotted underline at rest.
- Plan pill: `«شهر»` / `«٣ شهور»` / `«سنة»` / `«ترم — {termTitle}»`.
- History pill: `«دفع قبل كده {n} مرة»` or `«أول اشتراك ليه»`.
- If `isFree`: accent badge `«مجاني»`.
- Course title.
- Facts line (mono/ltr where relevant): `{formatEGP(amountCents)} ج` ·
  **`«حوّل من»: {senderPhone}`** or, when `senderPhone === null`,
  `«اشتراك مسجّل يدويًا»` (an `adminManualSubscribe` row has no transfer to reconcile) ·
  `studentPhone` · `studentEmail` · timestamp.
- If `status === 'rejected'` and a reason exists: the reason in `text-err`.

*Right block*
- **Screenshot thumbnail** — only when `hasScreenshot`. 64×64 `object-cover`, a plain `<img>` (not
  `next/image`) pointing at `GET /api/admin/payments/submissions/{id}/screenshot`
  (`payment:read`, re-checks the session per request). Clicking opens a **lightbox**, never a new
  tab: `role="dialog" aria-modal="true"`, `aria-label` = `«صورة تحويل {studentName}»`, black/85
  backdrop, ✕ at `end-4 top-4` with `aria-label` = `copy.admin.common.close`, Escape closes,
  backdrop click closes, image click `stopPropagation`. The lightbox requests the **same URL** so
  the browser cache makes it instant.
- WhatsApp button `«واتساب»` on `studentPhone` (renders nothing if the phone is unusable).
- **Approve/reject**, only when `status === 'pending'`.

**Approve** — `POST /api/admin/payments/submissions/{id}/approve` (`payment:review`), empty body,
response `{ id, status: 'approved', validUntil: iso|null }` (`null` for a term grant).
Button is solid **green** `!bg-[oklch(0.62_0.15_150)]`, label `«موافقة»` → `«بتوافق…»`.
On success: toast `«اتحفظ»` **and** `refreshPendingCount()`.

**Reject** — `POST /api/admin/payments/submissions/{id}/reject` (`payment:review`), body
`{ reason: string trimmed 1–400 }` → `{ ok: true }`.
Danger button `«رفض»` opens a Dialog: title **سبب الرفض**, textarea (3 rows) labelled
`«السبب — هيتبعت للطالب زي ما هو»` with placeholder `«مثلاً: المبلغ في الصورة مش مطابق للباقة»`,
footer `«إلغاء»` + danger `«تأكيد الرفض»` (disabled while the reason is empty) → `«بترفض…»`.

**409 on either** ⇒ toast `«الطلب ده اتراجع قبل كده»`. Any other error ⇒ `«حصل خطأ، حاول تاني»`.

**Pager** at the bottom, borrowing the books screen's words (`«السابق»` / `«التالي»` / `«من»`) —
one vocabulary for every paged admin list.

---

### 4.8 `/admin/transfers` — التحويلات الواردة

**File** `.../transfers/page.tsx`, `actions.ts`, `transfer-actions.tsx` ·
**Permissions** `payment:read` (list), `payment:review` (dismiss, ingest)

The ledger of money that actually landed, read off the Android handset that receives the InstaPay
notifications. `/admin/payments` answers "who is asking"; this answers "what arrived".

**Endpoint** `GET /api/admin/transfers?filter={f}` → `{ rows, rowCount }`. **No paging.**
`filter` ∈ `unmatched` (**default**, and the only slice that needs a decision) | `matched` |
`dismissed` | `all`. Junk falls back to `unmatched` (`.catch('unmatched')`).

**Row** `AdminTransferRowSchema`:
```
id(uuid) source('notification'|'sms'|'manual') amountCents|null senderHandle|null
senderStudentName|null rawLine receivedAt(iso)
matchedSubmissionId|null matchedBookOrderId|null   // at most ONE is ever set
matchedStudentName|null matchedCourseTitle|null    // course is null for a book order
dismissedAt|null
```

**Header**: eyebrow `«الفلوس»`, `h1` `«التحويلات الواردة»`,
subtitle `«اللي وصل فعلاً على إنستاباي، ومين اتفتحله كورس بيه.»`
One `<ListControl name="filter" label="اعرض">`: `«محتاجة مراجعة»` / `«اتطابقت»` / `«اتقفلت»` /
`«الكل»`.

**Empty**: `«مفيش تحويلات هنا»` + `«التحويلات بتوصل هنا لوحدها من تليفون الأندرويد. لو لسه مش متظبط، الصق نص الإشعار في الخانة تحت.»`

**Row card**
- Amount, `--fs-title-4` semibold mono, printed with **`formatEGPExact`** (never rounded — the
  amount IS the identity here). `amountCents === null` ⇒ `«مش مقروء»`.
- Source pill: `«إشعار إنستاباي»` / `«رسالة البنك»` / `«مكتوبة بالإيد»`.
- If matched: accent badge `«اتطابقت»`. If dismissed: plain badge `«اتقفلت»`.
- **One explanatory sentence**, chosen in this exact priority order (`explain()`):
  1. `amountCents === null` → `«وصل إشعار بس مقدرناش نقرا المبلغ منه — راجعه بنفسك.»`
  2. `matchedSubmissionId !== null` → `«فتح {matchedCourseTitle} لـ{matchedStudentName}»`
  3. `matchedBookOrderId !== null` → `«دفع طلب كتاب لـ{matchedStudentName}»`, or
     `«دفع طلب كتاب»` when `matchedStudentName === null` (guest checkout)
  4. `senderHandle === null` → `«رسالة البنك مبتقولش مين حوّل — للتأكيد بس.»` (an SMS names
     nobody, so it can never approve anything)
  5. `senderStudentName !== null` → `«التحويل من {name}، بس مفيش عنده طلب مستني.»`
  6. otherwise → `«أول مرة نشوف العنوان ده. وافق على طلب الطالب وهنربطه بيه لوحدنا.»`
- `senderHandle` shown in full, `dir="ltr"` (an admin recognising an address by eye is how the
  platform learns its first one), then the timestamp.
- `rawLine`, `dir="auto"`, `break-words`, `--fs-text-xs` faint.
- Action: matched ⇒ a link to `/admin/books` (book order) or `/admin/payments?status=approved`
  (subscription), labelled with that screen's title; otherwise, if not dismissed, a secondary
  button **اقفلها** → `POST /api/admin/transfers/{id}/dismiss` → `{ ok: true }`.
  Success toast `«اتحفظ»`, failure `«مقدرناش نعمل ده دلوقتي، جرّب تاني.»`

**Paste box** (bottom of the page, always visible)
- `h2` **الصق نص الإشعارات**, hint
  `«لو تليفون الأندرويد مش شغّال، الصق نص إشعار إنستاباي هنا — أو النص كله مرة واحدة، وكل اللي فيه هيتقرا.»`
- Textarea `dir="auto"` 5 rows, placeholder `«لقد استلمت 250.00 جنيه من someone@instapay»`
- Button **اقرا التحويلات** (disabled while empty/busy).
- `POST /api/admin/transfers/ingest` (`payment:review`), body `IngestTransfersSchema`
  `{ text: string 1–20 000, capturedAt?: iso }`. The 20 000 ceiling is a whole screenshot of Live
  Text with room to spare.
- Response `IngestTransfersResultSchema` `{ read, created, duplicates, matched, unreadable }`.
- Success toast: `«اتقرا {read} · جديد {created} · فتح كورسات {matched} · متكرر {duplicates} · مش مقروء {unreadable}»`,
  and the textarea **clears itself** (a repeated paste would dedupe and report "read 5, created 0",
  which reads like a failure).
- The action revalidates **both** `/admin/transfers` and `/admin/payments` — an ingest can approve
  a pending claim outright.
- There is also a `@Public()` ingest route `POST /api/ingest/transfers` used by the phone's
  Shortcut (token-authenticated, not session-authenticated).

---

### 4.9 `/admin/finance` — الاشتراكات والإيرادات

Three tabs (`FinanceTabs`, a Server Component — the caller knows which tab it is):
`/admin/finance` **النظرة العامة** · `/admin/finance/subscriptions` **المشتركين** ·
`/admin/finance/expenses` **المصروفات**. **Permission** `payment:read` for the first two,
`expense:read`/`expense:write` for the third.

#### 4.9.1 `/admin/finance` — النظرة العامة

**Endpoint** `GET /api/admin/expenses/overview` (`expense:read`) → `AdminFinanceOverviewSchema`.
**One fetch; the screen adds up nothing itself** — two surfaces subtracting their own way is how
«صافي الربح» ends up with two values.

```
subscriptionRevenueCents bookRevenueCents revenueTotalCents
subscriptionRefundsCents bookRefundsCents refundsTotalCents
subscriptionNetRevenueCents bookNetRevenueCents netRevenueTotalCents
expensesTotalCents  expensesByCategory[{ category, amountCents }]
bookCostOfSalesCents bookCostUnknownCount bookProfitCents
bookItemsNetCents bookShippingCents netCents
months[{ month('YYYY-MM'), subscriptionRevenueCents, bookRevenueCents, expensesCents,
         subscriptionRefundsCents, bookRefundsCents, netCents }]
```

All money is printed with **`formatEGPExact`** and a real minus sign `−` for negatives (a losing
month must not read as a winning one). Month labels: `YYYY-MM` → `Intl` `{month:'long',
year:'numeric'}` on `ar-EG-u-nu-latn` (e.g. «أكتوبر ٢٠٢٦» with Latin digits).

**Top tile row** (`sm:grid-cols-3`, or `sm:grid-cols-2 lg:grid-cols-4` when refunds > 0):
- **إجمالي الإيرادات** (accent)
- **فلوس رجعت** — rendered as `− {amount}`, **only when `refundsTotalCents > 0`**
- **إجمالي المصروفات** → links to `/admin/finance/expenses`
- **صافي الربح**, context line `«كل اللي دخل − اللي رجع − المصروفات»`. Deliberately not accent:
  amber is the "press this" colour and this is the one number nobody clicks.

**Second row** (`sm:grid-cols-3`):
- **صافي الاشتراكات** → `/admin/finance/subscriptions`, context `«بعد خصم {refunds} رجعت»`
  when there were refunds
- **صافي الكتب** → `/admin/books?status=paid`, same context rule
- **مكسب الكتب**, with `«مبيعات الكتب {items} − تكلفة النسخ {cost} = {profit}»`,
  `«الشحن {amount} — بيتجمع من الطالب ويروح للمندوب، مش محسوب مكسب»`, and when
  `bookCostUnknownCount > 0`: `«{n} سطر مالوش تكلفة نسخة — المكسب محسوب من غيرهم»` plus a link
  **حدّد تكلفة النسخة** → the catalogue.

Standing note under the profit block:
`«ملحوظة: مكسب الكتب بيحسب تكلفة النسخة، والمطبعة أصلاً متسجّلة في المصروفات — عشان كده الرقمين مش بيتجمعوا على بعض.»`

**المصروفات راحت فين** — per-category breakdown using `copy.admin.expenseCategory`.

**شهر بشهر** table — columns **الشهر** / **اشتراكات** / **كتب** / **مصروفات** / **رجعت** /
**الصافي**. Months with all-zero activity are filtered out client-side.
Empty: `«لسه مفيش حركة»`.

#### 4.9.2 `/admin/finance/subscriptions` — المشتركين

**Endpoints**
- `GET /api/admin/finance?perPage=200&sort={s}[&status=][&plan=][&year=][&stream=]`
  (`payment:read`) → `AdminFinanceListSchema` = `listResponse(row) & { summary }`
- `GET /api/admin/book-orders/summary` (`book-order:read`) →
  `{ revenueTotalCents, paidCount }` — a **separate fetch to a different controller**, never
  merged into the subscription totals.

**Query** (`AdminFinanceQuerySchema`, `ListQuerySchema` minus `dir`/`q`):
`status` ∈ `active|expiring_soon|expired` · `plan` ∈ `monthly|quarterly|yearly|term|free` ·
`year` int ≥1 · `stream` ∈ `general|languages` · `sort` ∈ `paid_desc` (default) | `paid_asc` ·
`perPage` int 1–**2000** default 20 (the page sends 200).

**Row** `AdminFinanceRowSchema`:
```
id(uuid, the AccessGrant id) userId studentName courseId courseTitle
plan|null termId|null termTitle|null amountCents|null paidAt|null isFree|null
validUntil|null validFrom scope('course'|'term') status
renewalCount(int ≥0) cancelReason|null cancelReasonVisibleToStudent(bool) refundedCents(int ≥0)
```
**Summary** `{ revenueTotalCents, refundsTotalCents, netRevenueTotalCents, activeCount,
expiringSoonCount, filterCounts { plan{monthly,quarterly,yearly,term,free},
year: Record<string,int>, stream{general,languages} } }`.

**Filters** — four `<ListControl>`s with the counts appended (`«{label} ({n})»` from
`summary.filterCounts`, so the size of a bucket is visible before clicking into it):
- **الحالة** — `«الكل»` / `«فعّال»` / `«هيخلص قريب»` / `«خلص»`
- **الباقة** — `«كل الباقات»` / `«شهري»` / `«٣ شهور»` / `«سنوي»` / `«ترم»` / `«مجاني»`
  (`free` is orthogonal to the four plans, hence its own value)
- **عربي / لغات** — `«كل المدارس»` / `copy.stream.general` / `copy.stream.languages`
- **الترتيب** — `«الأحدث أولاً»` / `«الأقدم أولاً»`
- plus a year filter: `«كل السنين»` / `«سنة {year}»`

**Tiles**: **إجمالي الإيرادات** · **اشتراكات فعالة** · **هتخلص خلال أسبوع**, and a separate
section **الكتاب الورقي — منفصل عن الاشتراكات** with **إجمالي إيرادات الكتب** and **كتب مدفوعة**.

**Columns**: **الطالب** · **الكورس** · **الباقة** · **آخر دفعة** · **اتدفعت في** · **هتخلص في** ·
**التجديدات** · **الحالة** · **إجراءات**.
- status dot colours: active `oklch(0.62 0.15 150)`, expiring soon `--a-9` (accent), expired
  `--fg-faint`; labels `«فعّال»` / `«هيخلص قريب»` / `«خلص»`.
- `plan === 'term'` ⇒ under the course title, `«اشتراك ترم: {termTitle}»`.
- `«هتخلص في»` for a term row prints `«طول ما الترم مفتوح»`; for a course grant an admin reopened
  open-ended (`validUntil: null`) it prints `«مفتوح — من غير تاريخ انتهاء»`. A missing payment
  join prints `«—»`.
- `isFree` ⇒ badge `«مجاني»` in the amount column (never summed into revenue).
- `renewalCount === 0` ⇒ `«—»`; else `«اتجدد {n} مرة»`.
- refunds against a row ⇒ `«رجع منها {amount}»` under the amount.
- an already-cancelled row shows `«سبب الإلغاء: {reason}»` (admin-eyes, regardless of
  `cancelReasonVisibleToStudent`).

**Row actions** (`FinanceRowActions`, all `payment:review`):

1. **تعديل** → dialog **تعديل الاشتراك**, two independently-saved sections.
   - **المبلغ المحصّل**: field **المبلغ (جنيه)** + checkbox **مجاني — متحصلش فلوس**, save
     **حفظ المبلغ** / **بيتحفظ…**.
     `PATCH /api/admin/finance/{grantId}/amount`, body `{ amountCents: int ≥0, isFree: bool }`.
   - **تواريخ الاشتراك**: **يبدأ في** + **ينتهي في** + checkbox **من غير تاريخ انتهاء**, save
     **حفظ التواريخ** / **بيتحفظ…**.
     `PATCH /api/admin/finance/{grantId}/dates`, body `{ validFrom: iso, validUntil: iso|null }`.
     For a `scope: 'term'` row the dates form is replaced by
     `«اشتراك الترم مالوش تاريخ انتهاء يتغير — بيتقفل لما الترم يتقفل بس.»`
   - Close **قفل**; failure **مقدرناش نحفظ — حاول تاني**.
2. **إلغاء** → dialog **إلغاء الاشتراك بدري**.
   `POST /api/admin/finance/{grantId}/cancel`, body `AdminFinanceCancelSchema`:
   `{ reason: string trimmed 1–400, showToStudent: bool = false, refundCents: int ≥1|null = null }`.
   - **السبب**, placeholder `«مثلاً: الطالب طلب إلغاء الاشتراك»`
   - checkbox **يظهر السبب ده للطالب في إشعاراته** (off by default)
   - switch **رجعتله فلوسه؟** with hint
     `«سيبه مقفول لو الفلوس فضلت معاك. اللي بيتقفل عشان غش مثلاً، فلوسه ما بترجعش وما بتتخصمش من الحسابات.»`
   - **رجعتله كام؟ (بالجنيه)** with the live cap `«أقصى مبلغ {max} ج»`
   - **رجوع** / **تأكيد الإلغاء** / **بيتلغي…**; failure **مقدرناش نلغي — حاول تاني**.

**Empty**: `«مفيش اشتراكات مدفوعة لسه»` + `«أول ما طلب اشتراك يتوافق عليه، هيظهر هنا.»`

#### 4.9.3 `/admin/finance/expenses` — المصروفات

**Endpoints** `GET /api/admin/expenses?perPage=100[&category=][&month=]` (`expense:read`) and
`GET /api/admin/books` (`book:read`, feeds the dialog's book picker — fetched server-side so the
dialog never shows a spinner for a list of five).

**Query** `AdminExpenseQuerySchema`: `category` ∈ the 7 below; `month` matching
`/^\d{4}-(0[1-9]|1[0-2])$/` (else `«الشهر لازم يكون بالشكل YYYY-MM»`).

**Row** `{ id(uuid) occurredOn('YYYY-MM-DD') category amountCents titleAr noteAr|null
bookId|null bookTitleAr|null quantity|null createdAt }`.

**Categories** (`ExpenseCategorySchema` → `copy.admin.expenseCategory`):
`filming` **تصوير** · `printing` **مطبعة** · `equipment` **أدوات ومعدات** ·
`marketing` **إعلانات** · `staff` **أجور** · `services` **خدمات واشتراكات** ·
`other` **حاجات تانية**.

**Header**: eyebrow `«الحسابات»`, `h1` `«المصروفات»`,
subtitle `«كل حاجة اتدفعت — تصوير، مطبعة، أدوات، وأي حاجة تانية.»`

**Table columns**: **التاريخ** (`«٣ أكتوبر ٢٠٢٦»`, Latin digits) · **النوع** · **الوصف** (with
`noteAr` on a second line) · **الكتاب** (`«{title} ×{quantity}»` — the count never renders
separately) · **المبلغ** (end-aligned) · actions.

**Empty**: `«مفيش مصروفات مسجّلة»` + `«أول ما تسجّل حاجة اتدفعت، هتظهر هنا وتتحسب في الصافي.»`

**Add / edit dialog** (`«أضف مصروف»` → **مصروف جديد** / **تعديل المصروف**):

| Field | Label / hint | Rule |
|---|---|---|
| `occurredOn` | **اتدفع في**, hint `«الشهر اللي الفلوس خرجت فيه، مش النهاردة.»` | `z.iso.date()` |
| `category` | **النوع** | one of the 7 |
| `amountCents` | **المبلغ بالجنيه** | int 1 – 1 000 000 000 |
| `titleAr` | **الوصف**, placeholder `«يوم تصوير استوديو»` | trimmed 2–160 |
| `noteAr` | **ملاحظات (اختياري)** | trimmed ≤2000, nullable |
| `bookId` | **الكتاب (اختياري)**, empty option `«مش مربوط بكتاب»`, hint `«لو ده طبعة كتاب، اختاره واكتب اشتريت كام نسخة.»` | uuid, nullable |
| `quantity` | **عدد النسخ** | int 1–100 000, nullable — **required whenever `bookId` is set**, refine message `«لازم تكتب اشتريت كام نسخة»` on path `quantity` |

Filters: **الشهر** (`«كل الشهور»`) and category (`«كل الأنواع»`).
Endpoints: `POST /api/admin/expenses`, `PATCH /api/admin/expenses/:id`,
`DELETE /api/admin/expenses/:id` (all `expense:write`).
Delete confirm `«تمسح المصروف ده؟ مش هيرجع تاني.»`; failures `«المصروف ماتسجّلش»` /
`«الحذف مانفعش»`.

---

### 4.10 `/admin/books` — طلبات الكتب (shipping queue)

**File** `.../books/page.tsx` + `order-actions.tsx`, `ship-action.tsx`, `bulk-ship.tsx`,
`export-range.tsx`, `create-book-order-dialog.tsx`, `edit-order-dialog.tsx`,
`reason-dialog.tsx`, `screenshot-thumbnail.tsx`, `books-tabs.tsx` ·
**Permissions** `book-order:read` (list), `book-order:ship`, `book-order:write`,
`book-order:create`, plus `book:read` for the catalogue used by two dialogs.

**Three parallel reads**: `GET /api/admin/book-orders?{q}` , `getTaxonomyOrNull()` (governorate
options for the create dialog), `GET /api/admin/books` (the catalogue).

**Query** (`AdminBookOrderQuerySchema` = `ListQuerySchema` minus `dir`):
- `status` — `address_only` | `paid` | `shipped` | `delivered` | `rejected` | **`deleted`**.
  ⚠️ `deleted` is a **view**, not a status: a soft-deleted order keeps whatever status it was
  hidden in. `'all'` is screen-only (the param is omitted).
- `q` — string ≤120; matches **name OR phone OR address**.
- `sort` — `oldest` (default) | `newest` | `amount_desc` | `amount_asc` | `name_asc` |
  `governorate`.
- `stream` — `general` | `languages`.
- `year` — int 1–3 (matched against the BOOK's own year, falling back to the course's).
- `page`, `perPage` (page sends **50**).

**Tab strip**, in work-flow order, *not* enum order (`TABS`):
`paid` **مدفوعة** → `shipped` **اتشحنت** → `delivered` **وصلت** → `address_only`
**بدأت ومكملتش** → `rejected` **مرفوضة** → `all` **الكل** → `deleted` **المحذوفة**.
The `deleted` tab renders `border-dashed` when it is not the active one. **`paid` is the
default.** The search `q` survives a tab change (the reason to switch tabs mid-search is that the
order was not in this one).

Above the tabs: `BooksTabs` (**الطلبات** `/admin/books` · **الكتب** `/admin/books/catalog`).

**Search form** — a plain GET form so the result *is* the URL: input `aria-label`
`«دوّر بالاسم أو الموبايل أو العنوان»`, placeholder `«اسم، رقم موبايل، محافظة أو شارع…»`, submit
`«دوّر»`, and `«امسح البحث»` when a query is active. A hidden `status` field rides along
(submitting a form replaces the whole query string).

**Toolbar dropdowns**: **الترتيب** (6 options above), **عربي / لغات**
(`«الكل»`/`«عربي»`/`«لغات»`), **الصف** (`«كل الصفوف»`, then `«{أولى|تانية|تالتة} بكالوريا»`),
plus **أضف طلب كتاب** and the export control.

**Result count line** (only when searching and `rowCount > 0`), `role="status"`:
`«{n} طلب مطابق للبحث»`, or when the page is capped,
`«أول {shown} من {n} طلب مطابق — ضيّق البحث شوية»`.

**Empty states**
- no search: `«مفيش طلبات دلوقتي»` + `«أول ما طالب يطلب كتاب، هيظهر هنا.»`
- searching: `«مفيش طلب مطابق لـ «{q}»»` + `«جرّب تدوّر في «الكل» — الطلب ممكن يكون في تبويب تاني، أو جرّب جزء من الاسم أو آخر أرقام الموبايل.»`
  plus a button **دوّر في الكل** → `?status=all&q={q}` (only when the current tab is not `all`).

**Row** `AdminBookOrderRowSchema` (abridged):
```
id(uuid) userId|null studentName|null studentEmail|null studentPhone|null
courseId|null courseTitle|null courseYear|null courseForGeneral|null courseForLanguages|null
bookTitle items[BookOrderLine] amountCents itemsCents shippingCents discountCents
adminNote|null fullName phone altPhone
governorateCode governorateNameAr city addressStreet addressBuilding|null addressNote|null
senderPhone|null hasScreenshot status createdAt paidAt|null shippedAt|null deliveredAt|null
rejectedAt|null rejectionReason|null deletedAt|null deletionReason|null
previousOrdersFromPhone(int ≥0)
```

**Row card.** A soft-deleted row is drawn `border-dashed` with an err-tinted border and
`bg-surface-2/60` plus a badge `«محذوف»`.

- Name: **the order's own `fullName`** is the shipping truth, always. A linked account only adds a
  link to `/admin/students/{userId}`; a guest (`userId === null`) gets plain text plus a pill
  `«زائر (بدون حساب)»`.
- Pill `«{n} كتاب — {copies} نسخة»` (`items.length` and the summed quantities — the two differ the
  moment somebody orders two of anything).
- Status chip (row-level wording, longer than the tab): `«بدأ ومكملش الدفع»` / `«مدفوعة، لسه ماتشحنتش»` /
  `«اتشحنت»` / `«وصلت للطالب»` / `«مرفوضة»`.
- `previousOrdersFromPhone > 0` ⇒ accent pill `«طلب قبل كده {n} مرة»` — counted on the **phone**,
  because guest checkout means one person is several unlinked rows.
- Item lines: `«{title} ×{quantity} — {amount} ج»`, each with a `StreamBadge`.
- Address: `«{name} — {governorate}، {city}، {street}»`, plus `«، عمارة {building}»` when set.
- Money: `«الكتب {items} ج · الشحن {shipping} ج · الإجمالي {total} ج»`, or with a discount
  `«الكتب {items} ج · الشحن {shipping} ج · خصم {discount} ج · الإجمالي {total} ج»`.
- `«ملاحظة داخلية: {adminNote}»` (hint elsewhere: `«الطالب مش بيشوف الملاحظة دي.»`).
- `«سبب الرفض: …»`, `«سبب الحذف: …»`, `«موبايل تاني: …»`, `«حوّل من: …»`.
- Screenshot thumbnail + lightbox, same component shape as payments, at
  `GET /api/admin/book-orders/{id}/screenshot` (`book-order:read`). `alt` =
  `«صورة تحويل {student}»`.
- WhatsApp button `«واتساب»`.

**Per-row actions**

| Button | Endpoint | Confirmation |
|---|---|---|
| **اتشحن** (`«بتسجّل…»`) | `POST /api/admin/book-orders/{id}/ship` (`book-order:ship`) → `{id,status:'shipped',shippedAt}` | `window.confirm` `«نسجّل إن الطلب ده اتشحن؟»` |
| **وصل** (`«بتسجّل…»`) | `POST /api/admin/book-orders/{id}/deliver` | `«نسجّل إن الكتاب وصل للطالب؟ الطالب هيوصله إشعار إن الطلب اتسلّم.»` |
| **ارفض الطلب** | `POST /api/admin/book-orders/{id}/reject` (`book-order:write`), body `{reason: trimmed 3–300}` | Dialog **رفض الطلب**, hint `«الطالب هيشوف السبب ده بنصه، فاكتبه بلغة يفهمها.»`, field **سبب الرفض** placeholder `«مثلاً: التحويل ما وصلش، أو العنوان مش واضح»`, submit **ارفض** / **بيترفض…** |
| **احذف الطلب** | `DELETE /api/admin/book-orders/{id}`, body `{reason: trimmed 3–300}` | Dialog **حذف الطلب**, hint `«الطلب هيختفي من اللستة ومن الحسابات ومن ملف الشحن، بس مش هيتمسح من الداتابيز — تقدر ترجّعه من تبويب «المحذوفة».»`, field **سبب الحذف** placeholder `«مثلاً: طلب مكرر، أو اتلغى في التليفون»`, submit **احذف** / **بيتحذف…** |
| **رجّعه** (`«بيترجّع…»`) | `POST /api/admin/book-orders/{id}/restore` | `«نرجّع الطلب ده للّستة؟»` — no reason required |
| **تعديل** | `PATCH /api/admin/book-orders/{id}` (`book-order:write`) | see below |

Errors: `«حصل خطأ، حاول تاني»`; already-done ⇒ `«الطلب ده اتشحن قبل كده»` /
`«الطلب ده اتسجّل إنه وصل قبل كده»`; per-action failures `«مقدرناش نرفض الطلب — نحاول تاني»` /
`«مقدرناش نحذف الطلب — نحاول تاني»` / `«مقدرناش نرجّع الطلب — نحاول تاني»`.

**رفض vs حذف is a real product distinction**: rejection is a decision the student sees (the order
stays in the list as «مرفوضة» and the reason reaches them); deletion is administrative (the row
disappears from every screen, from the accounts and from the packing file, and the reason is for
the admin alone). Both require a written reason and both use a Dialog with a textarea — never
`window.confirm`, which cannot take text.

**Edit dialog** (**تعديل الطلب**) — the basket, the fee, the discount, the address and the note in
one form: **الكتب** with **ضيف كتاب** (picker headed **اختار من الكتب**) / **ضيف سطر من غير كتالوج**
(**سطر جديد**) / **شيل السطر**, per-line **اسم الكتاب**, **سعر النسخة (ج)**, **العدد**;
**الشحن (ج)** (hint `«مرة واحدة على الطلب كله. اكتب صفر لو الشحن مجاني.»`); **خصم (ج)**;
**الإجمالي**; **ملاحظة داخلية**. Submit **احفظ التعديل** / **بيتحفظ…**.
Validation: at least one line, else `«لازم يفضل كتاب واحد على الأقل في الطلب»`.
Failure `«مقدرناش نحفظ التعديل — نحاول تاني»`.

**Bulk shipping** (`BulkShipProvider`) — a bar that appears only once something is selected.
Checkboxes render **only on `paid` and `shipped` rows**; each has `aria-label`
`«حدّد طلب {name}»`.
- `«حدّد اللي في المدى ({n})»` with hint
  `«بيحدّد نفس الطلبات اللي في ملف التصدير بالتواريخ دي — عشان تشحنهم مرة واحدة.»`
- `«محدّد {count}»`, `«إلغاء التحديد»`, `«بيتنفّذ…»`
- **اشحن المحدد** → `POST /api/admin/book-orders/ship` (**declared before `:id/ship`** in the
  controller so it is not swallowed by the param route). Body `BulkBookOrderActionSchema`
  `{ ids: uuid[1..100], whatsapp: bool = false }`.
- **اتسلّم** → `POST /api/admin/book-orders/deliver`, same body.
- Checkbox **ابعت واتساب كمان** — **off by default** (the platform notification IS the notice;
  this is a second copy).
- Confirms: `«هيتشحن {count} طلب، وكل طالب فيهم هتوصله رسالة على المنصة إن كتابه اتشحن. تمام؟»`
  or, with WhatsApp on,
  `«هيتشحن {count} طلب، وكل طالب فيهم هتوصله رسالة على المنصة **وعلى واتساب**. تمام؟»`;
  deliver: `«هتعلّم {count} طلب إنهم اتسلّموا. تمام؟»`
- Response `BulkBookOrderResultSchema` `{ rows: [{ id, outcome, fullName, reason|null }],
  succeeded, noticeFailed, skipped }`, outcome ∈ `shipped|delivered|notice_failed|skipped`.
- Toasts: `«اتشحن {count}»` and, for anything skipped, **names not a count**:
  `«اتخطّينا: {names}»`.

**Export** (`ExportRange`) — `GET /api/admin/book-orders/export?status={s}&from=&to=`
(`book-order:read`), `ExportBookOrdersQuerySchema` `{ status: filter, from: date|null,
to: date|null }`. Range fields **من** / **لـ** (both optional; empty = the whole tab).
Button label is dynamic: `«تصدير: {tabLabel}»`; hint
`«بيصدّر كل الطلبات في التبويب المفتوح دلوقتي — جاهز يتبعت لشركة الشحن والمطبعة.»`
**Hidden entirely on the `all` tab** — `all` has no meaning for a spreadsheet handed to a courier.

**Create dialog** (**أضف طلب كتاب** → **طلب كتاب جديد**) —
`POST /api/admin/book-orders` (`book-order:create`), body `AdminCreateBookOrderSchema`:
```
courseId?: uuid   XOR   items?: AdminBookOrderLines      // exactly one; else
                                 «الطلب لازم يبقى إما كتاب كورس واحد أو سلة كتب — مش الاتنين»
shippingCents?: int 0..10_000_000     // 0 waives delivery; omitted = current fee
discountCents?: int 0..10_000_000
adminNote: string ≤1000|null = null
fullName: trimmed 2..120        «الاسم الكامل مطلوب»
phone: egyptianPhone            «رقم الموبايل مطلوب»
altPhone: egyptianPhone         «رقم موبايل تاني مطلوب للتواصل»   (REQUIRED)
governorateCode: len 2          «لازم نحدد المحافظة»
city: trimmed 1..100            «المدينة مطلوبة»
addressStreet: trimmed 1..200   «اسم الشارع مطلوب»
addressBuilding: trimmed ≤60|null = null
addressNote: trimmed ≤300|null = null
paid: boolean
senderPhone: egyptianPhone|null = null   «رقم المحوّل منه غير صالح»
screenshotKey: string 1..255|null = null
```
Field labels are **aliased from the student flow** (`copy.student.bookOrder.*`) so one field has
one wording on both surfaces. Admin-only additions: **الكورس**, `«سعر الكتاب: {amount} ج»`
(read-only), radios **مدفوع بالفعل** (hint
`«العميل حوّل بالفعل — الطلب هيتسجل «مدفوعة» على طول، من غير الخطوتين.»`) / **لسه مادفعش**,
**حوّل من (اختياري)**, **صورة التحويل (اختياري)** (hint `«لو معاك صورة التحويل ممكن ترفعها هنا — مش شرط.»`),
submit **حفظ الطلب** / **بيتسجّل…**. Only `isActive` catalogue titles are offered.
If none: `«مفيش كورسات ليها كتاب مسعّر دلوقتي»`.
Failures `«مقدرناش نسجل الطلب — نحاول تاني»` / `«مقدرناش نرفع الصورة — نحاول تاني»`.

---

### 4.11 `/admin/books/catalog` — الكتب (the shop's shelf)

**File** `.../books/catalog/page.tsx`, `book-row-actions.tsx`, `shipping-fee-form.tsx` ·
**Permissions** `book:read` / `book:write`, plus `settings:write` for the shipping fee

**Four parallel reads**: `GET /api/admin/books`, `GET /api/admin/settings`,
`GET /api/admin/taxonomy/subjects`, `GET /api/admin/courses`.

Header: `h1` **الكتب**, subtitle `«اللي معروض في قسم الكتب — الأسعار والأغلفة والمخزون.»`
Empty: `«مفيش كتب في الكتالوج»` + `«ضيف أول كتاب، وهيظهر على طول في /books.»`
New: **كتاب جديد** → dialog **كتاب جديد** / **تعديل الكتاب**.

**Columns**: **الكتاب** · **المادة** · **الترم** · **السعر** · **المخزون** · **اتطلب**
(`«{n} نسخة»`) · **المدارس** · **يظهر فين**.
Stock cells: `stock === null` ⇒ `«مش بنعد»` (which is *not* zero); `0` ⇒ `«خلص»`.
Visibility chip: `«معروض»` / `«مخفي»`. Placement chip: `«الرئيسية»` / `«الكورس»` /
`«قسم الكتب بس»`. Terms: `«الترم الأول»` / `«الترم التاني»` / `«السنة كاملة»`.

**Row** `AdminBookRowSchema`:
```
id slug titleAr subtitleAr|null subjectId|null subjectNameAr|null year|null term
courseId|null courseTitle|null forGeneral forLanguages showOnLanding showOnCourse
priceCents unitCostCents|null comparePriceCents|null coverKey|null descriptionAr|null
pageCount|null isActive stock|null sortOrder orderedCount updatedAt
```

**Form fields** (`AdminBookCreateSchema` / `AdminBookPatchSchema`):

| Field | Label / hint | Rule |
|---|---|---|
| `slug` | **الرابط**, hint `«بيظهر في /books. من غير مسافات ولا نقط ولا شرطة مائلة.»` | trimmed 2–80, no `/ . whitespace` — else `«الرابط ما ينفعش يحتوي على مسافة أو نقطة أو شرطة مائلة»` |
| `titleAr` | **اسم الكتاب** | trimmed 2–160, `«اسم الكتاب مطلوب»` |
| `subtitleAr` | **سطر تحت الاسم (اختياري)** | ≤200, nullable |
| `subjectId` | **المادة**, empty `«من غير مادة — يتحط في «كتب عامة»»` | uuid nullable |
| `year` | **الصف**, empty `«من غير صف»` | int 1–3 nullable |
| `term` | **الترم** | `first|second|full`, default `full` |
| `courseId` | **الكورس المرتبط (اختياري)**, empty `«من غير كورس»`, hint `«لو الكتاب ده هو كتاب كورس، اربطه بيه — الكورس الواحد ليه كتاب واحد بس.»` | uuid nullable |
| `priceCents` | **السعر (ج)** | int 0 – 10 000 000 |
| `comparePriceCents` | **السعر قبل الخصم (ج، اختياري)**, hint `«لازم يكون أعلى من السعر الحالي، وإلا الخصم يبقى كذب.»` | must be `> priceCents`, else `«السعر قبل الخصم لازم يكون أعلى من السعر الحالي»` |
| `unitCostCents` | **تكلفة النسخة (ج، اختياري)**, hint `«النسخة الواحدة بتكلّفك كام. منها بيتحسب «مكسب الكتب» في الحسابات — سيبها فاضية لو مش عارف.»` | nullable |
| `coverKey` | **الغلاف** | media key nullable |
| `descriptionAr` | **وصف (اختياري)** | ≤2000 |
| `pageCount` | **عدد الصفحات (اختياري)** | int 1–5000 |
| `stock` | **المخزون (اختياري)**, hint `«سيبه فاضي لو مش بتعد. صفر معناه خلص، والكتاب يفضل ظاهر ومش قابل للطلب.»` | int 0–100 000 nullable |
| `sortOrder` | **الترتيب** | int 0–9999, default 0 |
| `isActive` | **معروض في قسم الكتب** | bool default true |
| `forGeneral`/`forLanguages` | stream radios, hint `«الكتاب ده لمدارس عربي ولا لغات ولا الاتنين — بيظهر جنب اسمه في الطلبات وفي ملف الشحن.»` | at least one true, else `«لازم تحدد الكتاب لمدارس عام ولا لغات ولا الاتنين»` |
| `showOnLanding`/`showOnCourse` | **يظهر فين** → **في الصفحة الرئيسية** / **في صفحة الكورس**, hint `«دي أماكن الإعلان بس. الكتاب بيفضل معروض وقابل للطلب في /books في كل الحالات — «معروض في قسم الكتب» فوق هو اللي بيقفله خالص.»`; with no course linked, the second checkbox is replaced by `«اربط الكتاب بكورس الأول عشان يظهر في صفحته.»` | bool |

Buttons **احفظ** / **بيتحفظ…**; failure `«مقدرناش نحفظ الكتاب — نحاول تاني»`.
**امسح** with confirm `«نمسح الكتاب ده؟ الطلبات اللي اشترته هتفضل زي ما هي.»`, failure
`«مقدرناش نمسح الكتاب — نحاول تاني»`. Toggle **اخفيه** / **اعرضه**.
Endpoints `POST /api/admin/books`, `PATCH /api/admin/books/:id`, `DELETE /api/admin/books/:id`
(all `book:write`).

**Shipping fee panel** — **سعر الشحن**, hint `«بينضاف مرة واحدة على كل طلب، مهما كان عدد الكتب.»`,
field **الشحن (ج)**, save **احفظ**, failure `«مقدرناش نحفظ سعر الشحن — نحاول تاني»`.
`PATCH /api/admin/settings/store` (`settings:write`), body `StoreSettingsSchema`
`{ shippingCents: int 0–50 000, default 6 500 }`.

---

### 4.12 `/admin/homework` — الواجبات

**File** `.../homework/page.tsx`, `create-homework-dialog.tsx`, `actions.ts` ·
**Permissions** `homework:read` (list), `homework:review` (verdict), `lesson:write` (create)

**Two parallel reads**: `GET /api/admin/homework?filter={f}` → `listResponse(AdminHomeworkRow)`,
and `GET /api/admin/courses` (narrow parse `{id, title}` only — parsing the full admin shape here
would let an unrelated field's change break this screen).

`filter` ∈ `pending` (**default**) | `accepted` | `needs_work` | `all`, parsed through the schema
so junk reads as the default rather than a 400.

Header: `h1` **الواجبات**, lead `«الحلول اللي الطلبة رفعوها. افتح أي واحد، شوف الصور، وابعت رد بضغطة.»`
Filter is a **pill-tab row** (4 options, and which one is active is the most useful thing the
header can say): **مستني مراجعة** / **مقبول** / **رجع للطالب** / **الكل**.

Empty: `«مفيش حلول مستنية دلوقتي.»` + `«أول ما طالب يرفع حل واجب، هتلاقيه هنا.»`

**Row** `AdminHomeworkRowSchema`:
```
id(uuid) status('submitted'|'accepted'|'needs_work') attempt(int) imageCount(int)
imagesPurged(bool) grade(number|null) submittedAt(iso)
studentId studentName lessonId lessonTitle courseId courseTitle
```

Card: a status well (icons `Clock3` / `CheckCircle2` / `RotateCcw`; tones accent / ok / warn),
student name → `/admin/students/{studentId}` (`relative z-10`), `«المحاولة {attempt}»` when > 1,
lesson title, course title, `Images` + `{imageCount} صورة`, timestamp
(`dd/MM HH:mm`, Latin digits), `{grade} / 100` in `--ok` when graded.
The whole card is a **stretched link** to `/admin/homework/{id}` via
`after:absolute after:inset-0` on the trailing chip, whose label is the status:
`«مستني مراجعة»` / `«اتقبل»` / `«رجع للطالب»`. `submitted` rows get `border-accent/40`.

**«أضف واجب» dialog** — the one thing this screen could not do before (setting an exercise was
four clicks deep in the course editor).
- Trigger **أضف واجب** → dialog **واجب جديد**
- **الكورس** (placeholder `«اختار الكورس»`) → on change, `loadCourseLessonsAction` calls
  `GET /api/admin/courses/:id` **once** and flattens the outline (never one request per lesson).
  States: `«بنجيب المحاضرات…»` / `«الكورس ده لسه مفيهوش محاضرات»` /
  `«مقدرناش نجيب محاضرات الكورس ده»`.
- **المحاضرة** (placeholder `«اختار المحاضرة»`)
- Warnings, both shown after picking a lecture:
  - already has one: `«المحاضرة دي عليها واجب بالفعل — اللي مكتوب تحت هو نصّه، وأي تعديل هيستبدله.»`
    (the write is an upsert, and the field opens pre-filled)
  - unpublished lecture: `«المحاضرة دي لسه مش منشورة — الواجب مش هيوصل لحد غير لما تنشرها.»`
- The `HomeworkWriteSchema` fields (body / maxImages / isPublished, §4.4.5)
- Buttons **أضف الواجب** / **حدّث الواجب** / **بنحفظ…** / **إلغاء**
- `PUT /api/admin/lessons/{lessonId}/homework` → `{ lessonId }`
- Toasts `«الواجب اتنشر للطلبة»` / `«الواجب اتحفظ — لسه مقفول عن الطلبة»` /
  `«مقدرناش نحفظ الواجب»`

---

### 4.13 `/admin/homework/[id]` — one submission

**File** `.../homework/[id]/page.tsx`, `review-form.tsx` · **Permission** `homework:review`

`GET /api/admin/homework/{id}` via `adminGetOrNotFound` (a stale id, or one whose student deleted
their account, must read as "not found", not "an error").

**Detail** `AdminHomeworkDetailSchema` = row + `prompt, imageIds[uuid], reviewNote|null,
reviewedAt|null, studentPhone|null, courseSlug, suggestions{accepted[], needsWork[]}`.

Back link **الواجبات**. Header card: student name (`--fs-title-3`), lesson title, course title,
`«اتسلّم {date}»` (dd/MM/yyyy HH:mm), `«المحاولة {n}»` when > 1, `«{n} صورة»`.

**Four ways out, as buttons and never behind a «⋯» menu** — every one asked for by name:
1. **ملف الطالب** → `/admin/students/{studentId}`
2. the lecture → `/admin/courses/{courseId}` (**the admin editor**, not the student player —
   that route is enrolment-gated and would redirect the instructor to `/library`)
3. **افتح المحادثة** (hint `«لو عايز تبعتله صوت أو تكمّل كلام»`) → the inbox thread
4. WhatsApp on `studentPhone`

**The exercise**: heading **المطلوب في الواجب** rendering `prompt`; when the homework was removed
from the lecture, `«الواجب اتشال من المحاضرة، والحل ده فضل.»`

**The images**: fetched one at a time from `GET /api/admin/homework/images/{imageId}`
(`homework:read`). When gone:
`«الصور اتمسحت بعد المراجعة — التسليم نفسه لسه متسجّل.»` or, after the 30-day retention
(`HOMEWORK_IMAGE_RETENTION_DAYS = 30`), `«الصور اتمسحت بعد ٣٠ يوم — التسليم نفسه لسه متسجّل.»`

**The review form**
- Two big targets, not a `<select>`: **مقبول** and **يفكّر تاني ويبعته**. Default `accepted`.
- **اختار من دول** — a pool of canned notes, `suggestions.accepted` or `suggestions.needsWork`
  depending on the current decision; clicking one fills the message.
- **الرد اللي هيوصله** — textarea. **Submit is disabled while `message.trim().length < 2`.**
- **الدرجة من ١٠٠** — rendered **only when the decision is «مقبول»**, hint
  `«اختياري — سيبها فاضية لو مش بتدّي درجة على الواجب ده.»`
- Send **ابعت الرد** / **بنبعت…**; failure `«مقدرناش نبعت الرد. نجرّب تاني.»`
- Standing warning under an accept: `«أول ما تقبله، صور الحل بتتمسح خالص وبيفضل إنه سلّم والدرجة والرد.»`
- `POST /api/admin/homework/{id}/review` — **answers 204**, so the client must not parse a body.
  Body `HomeworkReviewSchema`:
  ```
  decision: 'accepted' | 'needs_work'
  grade: number 0..100 | null = null      // refine: «الدرجة تتحط مع القبول بس»
  message: string trimmed 2..1000
  ```
- Previously-sent note renders under **اللي بعتّه**.

---

### 4.14 `/admin/attempts` — المحاولات

**File** `.../attempts/page.tsx`, `attempts-table.tsx`, `columns.tsx`, `search-params.ts` ·
**Permissions** `attempt:read`, `attempt:unlock`

**Endpoint** `GET /api/admin/attempts?take={perPage+1}&skip={(page-1)*perPage}[&q=][&state=][&quizId=]`
→ **a bare array**, not `{rows,rowCount}`. The page asks for `perPage + 1` rows so the client can
tell whether a next page exists without the API computing a total.

Filters mirror `AttemptAdminService.listAttempts` exactly — `quizId`, `userId`, `state`, `q`,
`take`/`skip`. **There is no sort**: the service has a fixed `orderBy: { startedAt: 'desc' }`, and
therefore no column declares `enableSorting` (a sortable header over data that never re-sorts is
worse than none).

URL state: `page` (1), `perPage` (20), `q` (throttled 400 ms), `state` (one of `ATTEMPT_STATES`),
`quizId`.

**Columns**

| id | Header | Cell |
|---|---|---|
| `studentName` | **الطالب** | |
| `quizTitle` | **الامتحان** | title + `copy.quiz.attemptNo` (`«المحاولة {n}»`) in mono under it |
| `state` | **الحالة** | Badge — see table below |
| `score` | **الدرجة** | `null` ⇒ `«—»`, else tabular |
| `startedAt` | **وقت البدء** | `toLocaleString('ar-EG')` |
| `deadlineAt` | **الموعد النهائي** | `null` ⇒ `«—»` |
| `actions` | **إجراءات** | `AttemptActions` |

| state | Label | Badge tone |
|---|---|---|
| `in_progress` | شغال | accent |
| `overdue` | اتأخر | warn |
| `submitted` | اتسلّم | neutral |
| `pending_review` | محتاج تصحيح | accent |
| `abandoned` | اتلغى | neutral |

**Actions** (`attempt:unlock`), each `POST`:
- **ارجّع المحاولة للطالب** → `POST /api/admin/attempts/{id}/reopen`. Enabled only for
  `submitted` / `pending_review`. Confirm `«نرجّع المحاولة دي للطالب؟»`
- **امنح وقت إضافي** → `POST /api/admin/attempts/{id}/extra-time`, field
  **ثواني إضافية** (also labelled **دقايق إضافية** in the quiz-scoped variant)
- **امنح محاولة إضافية** → `POST /api/admin/quizzes/{quizId}/students/{userId}/extra-attempt`.
  Confirm `«امنح الطالب ده محاولة إضافية؟»`

Toasts `«اتنفّذ»` / `«مقدرناش ننفّذ الإجراء — نحاول تاني»`.
Search placeholder `«دور بالاسم...»`; also `«الكل»` and `«محتاج تصحيح بس»` in the quiz-scoped
attempts screen.

---

### 4.15 `/admin/analytics` — التحليلات

Three sub-nav tabs (`AnalyticsNav`, underline style, `border-b border-line`):
**نظرة عامة** `/admin/analytics` (exact match) · **تحليل الدروس** `/admin/analytics/lessons` ·
**تحليل الطلبة** `/admin/analytics/students`. **Permission** `analytics:read` throughout.

Shared filter bar (`filter-bar.tsx`):
- **الفترة** — `«آخر أسبوع»` (7) / `«آخر شهر»` (30, **default**) / `«آخر ٣ شهور»` (90) /
  `«آخر سنة»` (365). Anything else in the URL is **snapped to 30** by `safeWindow()` rather than
  sent to an API that would reject the whole request.
- **الكورس** — `«كل الكورسات»` + the list from `GET /api/admin/courses`.
- **تنزيل CSV**, hint `«ملف UTF-8 بيفتح في إكسل وفي pandas على طول.»`

#### 4.15.1 `/admin/analytics` — overview

`GET /api/admin/analytics/overview?days={7|30|90|365}[&courseId=]` → `AnalyticsOverviewSchema`:

```
students { total, enrolled, activeLast7, activeLast30, newLast30 }
video    { watchers, eligible, watchRate|null, watchHours, lessonsOpened, lessonsCompleted,
           avgCompletion|null }
quiz     { quizzes, attempts, participants, participationRate|null, meanScore|null,
           medianScore|null, passRate|null, meanDurationSeconds|null, medianDurationSeconds|null }
scoreBuckets[{ bucket 1..10, n }]        completionBuckets[{ bucket 1..10, n }]
gradeBands[{ band 'a'|'b'|'c'|'d'|'f', n }]
durationBuckets[{ upperSeconds|null, n }]    // DURATION_BUCKETS_SECONDS = 60,180,300,600,900,1800,3600
engagement[{ segment 'both'|'videoOnly'|'quizOnly'|'neither', n }]
daily[{ date, watchMinutes, attempts, activeStudents }]
byYear[{ year, students, avgCompletion|null, meanScore|null }]
byGovernorate[{ code, nameAr, students, meanScore|null }]
```

**Four bands**, each with a heading, a lead, and a "go there" link worded as the destination
(never «اعرف أكتر») because every number here counts rows that live on another screen:

| Band | Heading / lead | Link |
|---|---|---|
| Who | **مين موجود** — `«الطلبة المشتركين، ومين منهم لسه بيذاكر فعلًا.»` | **تحليل الطلبة** |
| Watch | **شافوا الفيديوهات؟** — `«كل رقم هنا مقسوم على عدد المشتركين النشطين، والمقام مكتوب جنبه.»` | **تحليل الدروس** |
| Quiz | **حلّوا الامتحانات؟** — `«الدرجات كلها نسبة من مجموع كل امتحان لوحده — عشان المقارنة تبقى ممكنة.»` | **المحاولات** (`/admin/attempts`) |
| Breakdown | **التفاصيل** — `«نفس الأرقام مقسّمة — بالصف، بالمحافظة، وعلى مدار الوقت.»` | **بيانات الطلبة** (`/admin/students`) |

**Metric labels** (all from `copy.analytics`): إجمالي الطلبة · مشتركين في كورس · نشطين آخر أسبوع ·
نشطين آخر شهر · جداد آخر شهر · مشتركين في الكورس (the denominator, stated out loud) ·
المشاهدة · اللي فتحوا فيديو · نسبة اللي شافوا · ساعات المشاهدة · دروس اتفتحت · دروس اتخلصت ·
متوسط نسبة المشاهدة · الطلبة حسب نسبة اللي شافوه من الدرس · الامتحانات ·
امتحانات فيها محاولات · المحاولات · اللي حلّوا · نسبة اللي حلّوا · متوسط الدرجة · وسيط الدرجة ·
أعلى درجة · نسبة النجاح · متوسط زمن الحل · وسيط زمن الحل · توزيع الدرجات · النشاط على مدار الوقت ·
دقايق مشاهدة · محاولات امتحان · طلبة نشطين · حسب الصف · حسب المحافظة.

**Grade bands** — fixed cuts so exams are comparable
(`GRADE_BAND_FLOOR` a .85 / b .75 / c .65 / d .50 / f 0):
`«امتياز · ٨٥٪ فأكتر»` / `«جيد جدًا · ٧٥–٨٥٪»` / `«جيد · ٦٥–٧٥٪»` / `«مقبول · ٥٠–٦٥٪»` /
`«راسب · أقل من ٥٠٪»`. Short forms: امتياز / جيد جدًا / جيد / مقبول / راسب.
Hint: `«الحدود ثابتة (٨٥ / ٧٥ / ٦٥ / ٥٠) عشان المقارنة بين امتحان وامتحان تبقى ممكنة — النجاح والرسوب بيتحسبوا بنسبة نجاح كل امتحان لوحدها.»`

**Engagement** — `«الطلبة عملوا إيه»`, hint
`«الأربع شرايح دي بتجمع على عدد المشتركين بالظبط — مفيش طالب في اتنين.»`
Segments: `«شاف الفيديو وحلّ الامتحان»` / `«شاف الفيديو بس»` / `«حلّ الامتحان بس»` /
`«مافتحش حاجة»`.

**Chart chrome**: every chart has a table fallback toggled by **اعرض الأرقام** / **اخفي الأرقام**
(`aria-label` `«أرقام الرسم»`), columns **البند** / **العدد** / **النسبة**.
Empty: `«مفيش بيانات في الفترة دي»`.

**Number conventions — reproduce these exactly**
- A rate with **no denominator** prints `«—»`, **never «٠٪»** (that is a claim we cannot make).
- A real rate that rounds to nothing prints `«أقل من ١٪»`.
- Its twin at the top prints `«أكتر من ٩٩٪»` (not-quite-everyone must not read as everyone).
- `«من {n}»` states the denominator inline.
- Duration shorthands: `«د»` (minutes), `«س»` (hours), `«ث»` (seconds), `«أقل من دقيقة»`,
  `«أكتر من {n}»`, `«{from}–{to}»`.

#### 4.15.2 `/admin/analytics/lessons` — تحليل الدروس

`GET /api/admin/analytics/lessons[?courseId=]` → `LessonAnalyticsRow[]`, plus
`GET /api/admin/courses`. URL state: `courseId`, `q` (throttled 400 ms).
CSV: `GET /api/admin/analytics/export/lessons.csv`.

Heading **كل درس بالأرقام**. Columns: **الدرس** · **الكورس** · **الوحدة** · **فتحوه** ·
**نسبة الفتح** · **خلّصوه** · **متوسط المشاهدة** · **ساعات** · **حلّوا الامتحان** ·
**متوسط الدرجة** · **نسبة النجاح** · **وسيط الزمن**. A lesson with no quiz shows `«مفيش امتحان»`.
Row action **فتح التحليل**.

Row shape adds `lessonId title courseId courseTitle sectionTitle position kind hasVideo
videoDurationSeconds|null eligible opened openRate|null completed completionRate|null
avgCompletion|null watchHours avgWatchSeconds|null quizId|null quizTitle|null quizAttempts
quizParticipants quizParticipationRate|null quizMeanScore|null quizMedianScore|null
quizPassRate|null quizMedianDurationSeconds|null`.

#### 4.15.3 `/admin/analytics/lessons/[lessonId]`

`GET /api/admin/analytics/lessons/{lessonId}` (`adminGetOrNotFound`) →
`{ summary: LessonAnalyticsRow, completionBuckets, scoreBuckets, gradeBands, durationBuckets,
engagement, students: LessonStudentRow[] }`.
Roster heading **الطلبة في الدرس ده**, hint
`«كل المشتركين في الكورس هنا — حتى اللي مافتحوش الدرس خالص.»`
Columns: **الطالب** · **الصف** · **المحافظة** · **مشاهدة** · **نسبة المشاهدة** · **محاولات** ·
**أعلى درجة** · **آخر درجة** · **زمن الحل** · **آخر مرة**. Never-seen ⇒ `«ولا مرة»`;
not-opened ⇒ `«مافتحوش»`.
Roster CSV: `GET /api/admin/analytics/lessons/{lessonId}/roster.csv`.
Links out: **فتح الكورس** / **فتح الدرس** / **تحليل أسئلة الامتحان** / **محاولات الامتحان ده**.

#### 4.15.4 `/admin/analytics/students` and `/admin/analytics/students/[userId]`

List: `GET /api/admin/analytics/students?{params}` → `listResponse(StudentAnalyticsRow)`, plus
`GET /api/admin/courses`. URL state: `page` (1), `perPage` (**25**), `q` (throttled), `year[]`,
`courseId`, `sort` (default `lastActiveAt`), `dir` (default `desc`).
`STUDENT_ANALYTICS_SORTS` = `fullName | lessonsCompleted | watchHours | avgCompletion | attempts |
meanScore | passRate | lastActiveAt`.
CSV: `GET /api/admin/analytics/export/students.csv`.
Heading **كل طالب بالأرقام**, search `«دور بالاسم...»`, pager **الصفحة اللي قبلها** /
**الصفحة اللي بعدها**.
Columns: **الطالب** · **الصف** · **المحافظة** · **كورسات** · **دروس خلّها** (`columnLessonsCompleted`
= **دروس خلّصها**) · **متوسط درجاته** · **آخر نشاط**, row action **فتح الملف**.

Detail: `GET /api/admin/analytics/students/{userId}` (`adminGetOrNull` here — on `null` it falls
back to `GET /api/admin/students/{userId}` just to render a name and
**فتح صفحة الحساب**) → `StudentAnalyticsDetailSchema`:
```
summary: StudentAnalyticsRow
cohort: { avgCompletion|null, meanScore|null, passRate|null, medianQuizSeconds|null }
courses[]  { courseId, title, lessons, opened, completed, avgCompletion|null, watchHours }
lessons[]  { lessonId, lessonTitle, courseId, courseTitle, state, completion|null,
             watchedSeconds, openCount, lastSeenAt|null, completedAt|null, completedVia|null }
attempts[] { attemptId, quizId, quizTitle, lessonTitle|null, attemptNo, state, score|null,
             passed|null, seconds|null, submittedAt|null }
devices: { logins, distinctDevices, byType[{type,logins,devices}], lastLoginAt|null,
           recent[{id, deviceName, deviceType, loggedInAt, lastActiveAt|null, revoked}],
           clearedByBan }
scoreBuckets, gradeBands, daily
```

Labels: **ملف الطالب التحليلي** · **مقارنة بالمتوسط العام** / **المتوسط العام** /
`«فوق المتوسط بـ {n}»` / `«تحت المتوسط بـ {n}»` / `«زي المتوسط»` · **الكورسات** ·
**كل محاولاته** (columns **الامتحان** / **المحاولة** / **الحالة** / **الدرجة** / **اتسلّمت**).

Attempt states: `in_progress` **شغّال عليها**, `overdue` **اتأخر**, `submitted` **اتسلّمت**,
`pending_review` **محتاجة تصحيح**, `abandoned` **اتلغت**.
Progress states: `not_started` **مافتحوش**, `in_progress` **لسه بيتفرّج**, `completed` **خلّصه**,
`passed` **نجح**, `failed` **رسب**.
Completed via: `auto` **تلقائيًا**, `manual` **بنفسه**, `dwell` **بعد قراية الدرس**.

**The lesson record**: **الدروس اللي فتحها**, hint
`«مرتّبة بالأحدث. الدرس اللي مافتحوش خالص مش موجود هنا.»`, column **فتحه** + unit `«مرة»`.

**Devices** — ⚠️ a **wording rule enforced by the copy table**: these rows are per-LOGIN and
nothing joins them to a lesson, so every string says «بيدخل من», **never** «اتفرّج من».
Heading **بيدخل من أنهي أجهزة**, hint `«ده جهاز الدخول للحساب. مابنعرفش الدرس نفسه اتشاف من أنهي جهاز.»`
Empty `«مافيش أجهزة متسجلة»` — and when `clearedByBan`, the different fact
`«الأجهزة اتمسحت لما الحساب اتحظر»` (banning DELETES device rows).
Counts are always two numbers, never one: `«{n} جهاز مختلف»` and `«دخل {n} مرة»`, plus
`«{n} جهاز»` under a type's bar. Also **آخر مرات الدخول**, **آخر دخول**, `«اتقفل»`,
columns **الجهاز** / **دخل**. Types: **كمبيوتر** / **موبايل** / **تابلت** / **جهاز غير معروف**.

---

### 4.16 `/admin/inbox` — صندوق الوارد

**File** `.../inbox/page.tsx`, `inbox-tabs.tsx`, `status-chip.tsx` ·
**Permissions** `conversation:read`, `conversation:reply`, `conversation:close`

Two tabs (`InboxTabs`, `aria-label` `«أقسام صندوق الوارد»`):
**المحادثات** `/admin/inbox` · **أسئلة الطلبة** `/admin/inbox/questions`.

**Endpoint** `GET /api/admin/conversations?filter={f}&sort={s}` →
`listResponse(AdminConversationRowSchema)`.

- `filter` ∈ `unread` (**default**) | `open` | `answered` | `closed` | `all`. Parsed through
  `InboxFilterSchema`, so junk reads as the default.
  ⚠️ `«غير مقروءة»` is **not** a synonym for `«محتاجة رد»` — opening a thread marks it read, only
  writing an answer marks it answered.
- `sort` ∈ `newest` (default, `.catch('newest')`) | `oldest`.
- There is **no `scope` parameter any more** — automated outreach lives at `/admin/outreach`. The
  exception baked into `INBOX_WHERE`: an outreach thread a student **answered** is a conversation
  and appears here like any other.

Header: eyebrow `«الوارد»`, `h1` `«صندوق الوارد»`,
subtitle `«أسئلة الطلبة والزوار — بس اللي حد كتبها بإيده.»`, then a one-line pointer
`«الرسايل اللي المنصة بتبعتها أوتوماتيك مش هنا —»` + link **رسايلي للطلبة**.

Two `<ListControl>`s: **اعرض** (`«غير مقروءة»` / `«محتاجة رد»` / `«اتردّ عليها»` / `«مقفولة»` /
`«الكل»`) and **الترتيب** (`«الأحدث حركة»` / `«الأقدم حركة»`).

Empty: `«مفيش رسايل جديدة.»` + `«كل الرسايل مقروءة. تاب «الكل» فيه المحادثات القديمة.»`

**Row card** — a plain container with a **stretched link** (the «المحادثة» button carries
`after:absolute after:inset-0`) so the whole card opens the thread while the name stays its own
link on `relative z-10`. `unreadForAdmin` ⇒ `border-accent/40`.
- Avatar well, 3 glyphs / 3 tints: `origin === 'outreach'` → `Send` on accent/20;
  `isGuest` → `UserRound` on the ember tint; otherwise `MessageSquareText` on accent/12.
- Name → `/admin/students/{userId}` when `userId !== null`, with a **dotted underline at rest**
  (half the names are links and half are not, and hover cannot tell them apart on a phone).
  A guest is plain text.
- Status chip (`InboxStatusChip`): `open` amber `bg-accent text-[#1A1206]` labelled
  `«محتاجة رد»` when unread else `«محتاجة رد»`/`«اتردّ عليها»`; `answered` green tint labelled
  `«اتردّ عليها»`; `closed` bordered neutral labelled `«مقفولة»`. **`unread` outranks `answered`.**
- Badges: `«رسالة منك»` when `origin === 'outreach'`; `«وصل رد»` when that thread has a visitor
  reply (the rows worth looking at first); `«زائر»` / `«طالب»`.
- `«وصل لهنا من:» {crumbs joined with ' ← '}` when `entryPath` is non-empty — the trail of
  assistant node ids, resolved to Arabic by `assistantPathLabels`.
- Preview, `line-clamp-2`, prefixed with `«إنت:»` when `previewAuthor === 'admin'`.
- Guest phone with a `Phone` icon, mono.
- Timestamp (`dateStyle:'short', timeStyle:'short'`, Latin digits) + the amber **المحادثة** button.

---

### 4.17 `/admin/inbox/[id]` — the thread

**File** `.../inbox/[id]/page.tsx`, `thread-actions.tsx`, `message-bubble.tsx`,
`assistant-transcript.tsx`

`GET /api/admin/conversations/{id}` via `adminGetOrNotFound`. **The GET itself marks the thread
read server-side** — there is no separate "mark read" call for the client to forget.

**Header card**
- avatar well (guest tint vs student tint), name (link to the record when `userId`), status chip,
  `«زائر»`/`«طالب»`
- **one badge per course** the student holds — never a single «مشترك»:
  `{courseTitle}` in green, `title` = `«لحد {date}»` or `«مبينتهيش»`, and
  ` · «بالإيد»` appended when `source === 'admin'` so a hand-issued course is never mistaken for a
  paid one on the screen where the answer is decided. `courses === null` (a guest) renders neither
  badge; `courses === []` renders `«مش مشترك»`.
- `<dl>`: **وسيلة التواصل** (a guest's typed number or a student's account phone; `«مفيش رقم»`
  when absent) and the entry path.
- WhatsApp button `«مراسلته على واتساب»` (`waMeHref` returns `null` with no number and the button
  is then not rendered at all — never a bare `https://wa.me/`). Name link title
  `«فتح الملف الكامل»`.

**The assistant transcript card** — the chat that happened before a human was asked for, carried
into the thread as one ordinary message authored `visitor`.
- Title **نص المحادثة مع المساعد الآلي**, note `«ده اللي اتقال قبل ما السؤال يتحوّل — مش كلام مكتوب لك.»`
- Turn labels **الطالب** / **المساعد**; when older turns were dropped,
  `«أول المحادثة اتشال عشان الطول — ده آخر جزء منها.»`
- ⚠️ **The wire format is marks, not Arabic**, precisely so re-wording the labels cannot make
  stored rows unparseable: first line is `🤖💬`, turn prefixes are `🙋 ` (user) and `🤖 ` (assistant),
  and `⋯` stands where older turns were dropped. Every turn is collapsed to ONE line.
  A body that does not parse renders as the plain text it is.
- Limits: `TRANSCRIPT_TURNS_MAX = 12`, `TRANSCRIPT_TURN_MAX = 300` (stored),
  `TRANSCRIPT_TURN_WIRE_MAX = 1000` (validation), `TRANSCRIPT_BODY_MAX = MESSAGE_MAX = 2000` —
  the last one is a **database CHECK** (`conversation_messages_body_length`), so exceeding it
  aborts the transaction that was opening the thread.

**Messages** — `MESSAGE_MAX = 2000`, min 2; `«السؤال الأول لسه فاضي»` /
`«الرسالة طويلة أوي — الحد 2000 حرف»`. Body is plain text, always rendered into a text node;
there is **no rich-text path here at all**.

**Reply box**: label **ردّك**, placeholder `«الرد على الطالب…»`, button **إرسال الرد** /
**بنبعت…**, failure `«مقدرناش نبعت الرد. نحاول تاني.»`
`POST /api/admin/conversations/{id}/reply` (`conversation:reply`) — **204**, use `adminSendVoid`.
Attachments (one button for images and documents) upload via
`POST /api/admin/conversations/attachments` (`conversation:reply`) and are read back at
`GET /api/admin/conversations/{id}/messages/{messageId}/attachment` (`conversation:read`).
Voice notes are recorded here (the `Permissions-Policy` header must allow the microphone).

**Per-message actions** (`conversation:reply`):
- reaction — `PUT /api/admin/conversations/{id}/messages/{messageId}/reaction`.
  Long-press on the bubble, plus a visible button; accessible names `«ردّ بإيموجي»` /
  `«قفل الإيموجي»` (never seen — a row of six emoji beside «اختار إيموجي» would be labelling the
  obvious).
- edit — `PATCH /api/admin/conversations/{id}/messages/{messageId}`
- delete — `DELETE /api/admin/conversations/{id}/messages/{messageId}`

**Status** — `PATCH /api/admin/conversations/{id}/status` (`conversation:close`), **204**.

⚠️ `guestPhone` appears on `AdminConversationDetail` and **nowhere else** — a thread read back
through the guest cookie must never echo it.

---

### 4.18 `/admin/inbox/questions` — أسئلة الطلبة

**File** `.../inbox/questions/page.tsx`, `question-row.tsx`, `actions.ts` ·
**Permission** `conversation:read`

Every question typed into the assistant, and the answer it got. The rows flagged
«محتاج أيمن» are the product's to-do list: each is a gap in `copy.assistant.knowledge` with a
student's own wording already attached.

**Endpoint** `GET /api/admin/assistant/questions?perPage=50[&escalatedOnly=true][&q=]` →
`listResponse(AssistantQuestionSchema)`.
`escalatedOnly` is driven by the URL param `escalated=1`.
Detail: `GET /api/admin/assistant/questions/{id}/context` → `AssistantQuestionContext`.

**Header**: eyebrow `«المساعد»`, `h1` `«أسئلة الطلبة»`, lead
`«كل سؤال اتكتب في الشات، والرد اللي راح عليه. اللي عليه علامة معناه إن المساعد وقف قدامه — ودي أهم صف في الصفحة.»`,
then, quietly, `«الأسئلة بتتشال لوحدها بعد ٩٠ يوم.»`, then the `InboxTabs`.

**Controls**: a GET form with **دوّر في الأسئلة** (placeholder `«دوّر في الأسئلة…»`, submit
`«دوّر»`) — new UI over a capability the API always had — plus a hidden `escalated` field so
submitting a search does not clear the filter; and a `<ListControl name="escalated" label="اعرض">`
with `«كل الأسئلة»` (value `''`) / `«اللي وقف قدامه»` (value `'1'`). The `rowCount` is printed at
the inline-end of that row.

**Empty**: `«لسه محدش سأل حاجة.»` filtered ⇒ `«مفيش سؤال وقف قدام المساعد في الفترة دي.»`

**Row**: columns/labels **السؤال** · **الرد** · **الطالب** · **إمتى**; the answer bubble is
labelled **رد المساعد** (المساعد is not him, and an unlabelled answer bubble reads as something he
wrote). A visitor with no account is `«زائر من غير حساب»` — not «مجهول».
Badges: `«محتاج أيمن»` (escalated); `«رد بالذكاء الاصطناعي»` vs `«من الكلام المكتوب»` (a page of
the latter means the API keys ran out — a different problem from "the answers are bad");
`«لسه محدش كلّمه»` (escalated, signed-in, no conversation ever opened — the row that prevents a
question being lost); `«اتحول لمحادثة»`; `«زائر — مفيش طريقة نلاقيه تاني»`.
Action **افتح المحادثة**.
Detail dialog: **السؤال ده**, **باقي اللي سأله في نفس الوقت تقريبًا**, empty
`«ده السؤال الوحيد منه في الفترة دي.»`, guest note
`«زائر من غير حساب — مينفعش نربط أسئلته ببعض.»`

### 4.18b `/admin/assistant` — permanent redirect

`redirect('/admin/inbox/questions')`. Kept rather than deleted: the URL is in history and in the
sidebar of every tab that was open when the deploy landed, and a 404 would teach the instructor a
screen was removed when it only moved.

---

### 4.19 `/admin/outreach` — رسايلي للطلبة

**File** `.../outreach/page.tsx`, `outreach-settings-form.tsx` · **Permissions** `outreach:read`,
`settings:write` (for the switches)

**Four parallel reads**:
- `GET /api/admin/outreach?filter={f}` → `listResponse(OutreachLogRow)`
- `GET /api/admin/outreach/stats` → `OutreachStats`
- `GET /api/admin/outreach/preview` → `OutreachPreview`
- `GET /api/admin/settings` → `SiteSettings` (for the outreach section)

The screen answers three questions **in this order, and the order is the design**: what went out
under my name (the log), does it read like me (the preview), do I want it to keep happening (the
switches). A settings page that led with the switches would be asking him to configure something
he has never seen.

Header: eyebrow `«رسايلك»`, `h1` `«رسايلي للطلبة»`, lead
`«المنصة بتبعت للطالب رسالة باسمك بعد كل امتحان، ولو كويز اتساب من غير حل، ولو درس خلص. كل رسالة بصيغة مختلفة — مفيش تكرار.»`

**Stat strip**: **رسايل اتبعتت** · **آخر ٣٠ يوم** · **الطالب فتحها** · **وصل رد** (accent, hint
`«أقوى إشارة إن الرسالة وصلت فعلاً»`). Then
`«المنصة بتكتب عن اللي حصل بعد {date} بس — اللي قبل كده مش هيتبعت عنه حاجة.»`

**Log** (`h2` **اللي اتبعت**): pill filters `«الكل»` + the four kinds
(`quiz_result` **بعد الامتحان** · `quiz_nudge` **كويز ما اتحلّش** · `lesson_praise` **درس خلص** ·
`whatsapp_invite` **دعوة الجروب**).
Empty: `«لسه مفيش رسايل اتبعتت.»` + `«أول ما طالب يخلّص كويز، هتلاقي الرسالة اللي راحتله هنا بالنص بتاعها.»`
Each row shows flags **اتقرت** / **لسه ما اتقرتش** / **وصل رد**, a link **فتح المحادثة** →
`/admin/inbox/{conversationId}`, and a **«اتبعتت عشان»** line built from the message's own facts:
- `«امتحان «{quiz}» بدرجة {score}٪»`, optionally ` — «ركّزت على: {topics}»`
- `«درس «{lesson}» من غير حل الكويز»`
- `«درس «{lesson}» اللي مالوش كويز»`
- `«دعوة لجروب الواتساب»`

**Preview** (**شكل الرسايل**, lead
`«دي رسايل حقيقية من نفس المولّد اللي بيبعت للطلبة — بأسماء ودرجات متخيّلة. لاحظ إن كل واحدة مكتوبة بشكل مختلف.»`),
samples labelled `«نموذج {n}»`.

**Switches** (`PATCH /api/admin/settings/outreach`, `OutreachSettingsSchema`):

| Field | Label / hint | Rule |
|---|---|---|
| `quizResult` | **رسالة بعد كل امتحان** — `«بتقوله درجته وتسمّي الأسئلة اللي غلط فيها بالموضوع بتاعها»` | bool, default true |
| `quizNudge` | **تنبيه على الكويز اللي ما اتحلّش** — `«لو الدرس خلص والكويز اتساب»` | bool, default true |
| `lessonPraise` | **كلمة بعد الدرس** — `«للدروس اللي مالهاش كويز — الرسالة الوحيدة اللي مش بتطلب حاجة»` | bool, default true |
| `whatsappInvite` | **دعوة قناة الواتساب** — `«بتتبعت للطلبة اللي لسه مضغطوش على اللينك — ومحتاجة لينك القناة في وسائل التواصل»` | bool, default true |
| `nudgeAfterHours` | **يستنى قد إيه قبل التنبيه** — `«بالساعات، من ساعة ما يخلّص الدرس»` | int 1–720, default 24 |
| `groupInviteEveryDays` | **كل قد إيه يفكّره بالقناة** — `«بالأيام — وبنعدّ كمان المرات اللي القناة اتذكرت فيها جوه رسالة تانية»` | int 3–365, default 21 |
| `maxInvitesPerStudent` | **أقصى عدد مرات نفكّره** — `«على طول عمره في المنصة. وأول ما يضغط على اللينك بنبطّل نفكّره خالص.»` | int 1–20, default 4 |
| `maxPerStudentPerDay` | **أقصى عدد رسايل للطالب في اليوم** — `«رسايل النتايج مستثناة — الطالب اللي امتحن تلات مرات يستاهل تلات ردود»` | int 1–10, default 2 |

Section heading **إمتى المنصة تتكلم باسمك**, lead
`«كل نوع ليه مفتاح لوحده. لو قفلت نوع، الرسايل اللي اتبعتت قبل كده بتفضل مكانها.»`, and a
standing note underneath:
`«مفيش زرار «إرسال للكل» هنا، وده مقصود: كل رسالة سببها حاجة عملها الطالب نفسه.»`
