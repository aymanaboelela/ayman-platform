# Admin app — full screen-by-screen spec for a Flutter client

Source of truth: `apps/web/app/(admin)/**` (UI), `apps/api/src/modules/**` (endpoints),
`packages/contracts/src/**` (wire shapes), `packages/contracts/src/copy/admin.ts` (every Arabic
string quoted here).

Everything is Arabic + RTL; every screen is `dir="rtl"`. Dates use
`Intl.DateTimeFormat('ar-EG-u-nu-latn', …)` on most admin screens — **Arabic locale, Latin
digits** — except `/admin/courses`, `/admin/attempts`, `/admin/news`, `/admin/errors` and the
`createdAt` column of `/admin/students`, which use plain `'ar-EG'` (Arabic-Indic digits ١٢٣).
That split is real in the web app; reproduce it or fix it deliberately.

---

## 1. Auth, roles, permissions

### 1.1 Roles — `apps/api/src/auth/permissions.ts`

```ts
const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission> | '*'> = {
  admin: '*',
  student: new Set(['profile:read','profile:write','course:read','enrollment:read',
                    'enrollment:create','progress:read','progress:write','quiz:read',
                    'quiz:attempt','payment:submit','book-order:submit','homework:submit']),
};
```

**`admin` holds `'*'` — every one of the 74 permissions.** So although every screen and nav row
declares a permission, in production there are exactly two outcomes: an `admin` sees the whole
admin app, a `student` sees none of it. Render the per-item permission checks faithfully (they all
pass for an admin) but never assume them client-side — the server re-checks per route.

Permissions the admin UI reads: `admin:access`, `course:read-admin`, `course:create`,
`course:update`, `course:publish`, `course:delete`, `section:write`, `section:reorder`,
`lesson:write`, `lesson:reorder`, `student:read`, `student:write`, `student:role-change`,
`student:ban`, `student:delete`, `student:set-password`, `payment:read`, `payment:review`,
`book-order:read`, `book-order:ship`, `book-order:create`, `book-order:write`, `book:read`,
`book:write`, `expense:read`, `expense:write`, `homework:read`, `homework:review`, `attempt:read`,
`attempt:unlock`, `analytics:read`, `conversation:read`, `conversation:reply`,
`conversation:close`, `outreach:read`, `taxonomy:read`, `taxonomy:write`, `marketing:read`,
`marketing:write`, `marketing:send`, `marketing:device`, `home:read`, `home:write`, `nav:read`,
`nav:write`, `media:read`, `media:write`, `media:delete`, `settings:read`, `settings:write`,
`news:read`, `news:write`, `news:publish`, `flags:read`, `flags:write`, `diagnostics:read`,
`diagnostics:resolve`, `audit:read`, `question:write`, `quiz:write`.

### 1.2 Gate order — `apps/web/app/(admin)/layout.tsx`

1. Middleware (`proxy.ts`, `PROTECTED_PREFIXES` includes `/admin`) blocks anonymous visitors.
2. `if (!session) redirect('/login')`.
3. `if (!can(session, 'admin:access')) notFound()` — **404, never 403.** A student poking at
   `/admin` must learn nothing about the admin area existing. Mobile must do the same.
4. NestJS guard re-checks `@RequirePermission(...)`. Deny-by-default.

### 1.3 Transport

- Session is a cookie (better-auth); the web client forwards `cookie` on every server-side fetch.
- **CSRF**: every `POST/PATCH/PUT/DELETE` sends the CSRF header read from `CSRF_COOKIE`
  (`apps/web/lib/admin-api.ts`, `csrfFromCookie` / `CSRF_HEADER`). Without it every write 403s.
- **Every admin read is `cache: 'no-store'`.** The comment repeats across the codebase: "a cached
  admin read is indistinguishable from a lost write." Mobile must not cache admin GETs.
- **User ids are better-auth nanoids** (`9vrJB5pO088EPb4hDZnMajJtPy48GIjL`), *not* UUIDs —
  `AdminStudentRowSchema.id` is `z.string()` on purpose. Everything else (course, lesson, quiz,
  order, submission, transfer, expense, book, media asset) **is** a UUID.

### 1.4 Errors

`adminGet` throws on non-2xx → route `error.tsx`. `adminGetOrNotFound` → 404 becomes the not-found
screen. `adminGetOrNull` → 404 becomes `null` and the caller renders a fallback panel.
`adminSend`/`adminSendVoid` throw `AdminApiError { message, status, payload }`. `adminSendVoid` is
required where the route answers **204** (inbox reply, inbox status, homework review).

| Status | Where | Copy shown |
|---|---|---|
| 409 | approve / reject payment | «الطلب ده اتراجع قبل كده» |
| 409 | `PATCH /api/admin/students/:id` | «الرقم أو الإيميل ده متسجّل بحساب تاني بالفعل» |
| 409 | `DELETE /api/admin/students/:id` | «الحساب ده مؤلف محتوى على المنصة ({items})، فمينفعش يتمسح. انقل المحتوى لحساب تاني أو امسحه الأول، أو أوقف الحساب بدل ما تمسحه.» |
| 409 | course slug taken | «الرابط ده مستخدم في كورس تاني. غيّره وجرّب تاني.» |
| 409 | delete subject in use | «المادة مرتبطة بمقرر دراسي — المقرر يتحذف الأول» |
| 400 | delete student, identity mismatch | «الإيميل اللي كتبته مش مطابق للحساب ده» |
| 400 | course save, no subject offering | «التركيبة دي (نظام + صف + مسار + مادة) مش موجودة في المناهج، فمينفعش الكورس يتحفظ بيها. لازم واحد منهم يتغيّر.» |
| 403 + `'yourself'` / `'your own account'` | ban / delete self | «مينفعش توقف حسابك إنت» / «مينفعش تمسح حسابك إنت» |
| 403 + `'last remaining admin'` | ban / delete last admin | «ده آخر مسؤول نشط في المنصة — مينفعش توقفه» / «ده آخر مسؤول في المنصة — مينفعش تمسحه» |
| 500 | second «بريزنتيشن أساسي» on a lesson | «المحاضرة دي فيها بريزنتيشن أساسي واحد خلاص. القديم يتمسح الأول، أو ده يتضاف كـ«ملف».» |

The 403 discrimination is a **substring match on the API's English message** inside
`payload.message` (`explain()` in `.../students/actions.ts`).

### 1.5 List envelope — `packages/contracts/src/admin/list.ts`

```
PAGE_SIZES   = [10, 20, 50, 100]
ListQuerySchema = { page: int≥1 = 1, perPage ∈ PAGE_SIZES = 20, q: string ≤120 = '',
                    dir: 'asc'|'desc' = 'desc' }
listResponse(row) = { rows: row[], rowCount: int≥0 }   // rowCount = TOTAL matching the filter
```

Exceptions: `/api/admin/errors` → `{ rows, total, summary }`; `/api/admin/attempts` → a bare array
paged with `take`/`skip`; `/api/admin/transfers` → `{ rows, rowCount }` with **no** paging params;
`/api/admin/courses`, `/api/admin/news`, `/api/admin/books`, `/api/admin/marketing/campaigns`,
`/api/admin/taxonomy/*` → bare arrays.

---

## 2. The shell

### 2.1 Layout

CSS grid `[var(--admin-sidebar-w)_1fr]` at `md+`.
Sidebar **260 px** (`--admin-sidebar-w`, `packages/ui/src/tokens/space.css:43`), hidden below `md`
and replaced by a sheet. Header sticky, **60 px** (`--admin-header-h`, line 52), `z-40`.
Main `p-4 md:p-6`; most pages then wrap in `mx-auto w-full max-w-[76rem]`.
Root class `product-type`.

The subtree is wrapped in four count-poller providers, each mounted only when the session holds the
permission (otherwise `Fragment` — a role without it would poll a 403 every 30 s forever):
`InboxAlertsProvider` (`conversation:read`), `PaymentsAlertsProvider` (`payment:read`),
`BookOrdersAlertsProvider` (`book-order:read`), `HomeworkAlertsProvider` (`homework:read`), then
`NotificationStreamProvider` (SSE: `payment_submitted`, `book_order_placed`, … arrive as toasts +
OS notifications).

### 2.2 Sidebar navigation

`apps/web/components/admin/nav-items.ts`. Groups render in `ADMIN_NAV_GROUPS` order; items in array
order within a group; an item renders only if `permissions.includes(item.permission)`.

| # | Group | href | Arabic label | lucide icon | Permission |
|---|---|---|---|---|---|
| 1 | `overview` (no heading) | `/admin` | نظرة عامة | LayoutDashboard | `admin:access` |
| 2 | `teaching` = **التدريس** | `/admin/courses` | الكورسات | BookMarked | `course:read-admin` |
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
| 14 | `marketing` = **التسويق** | `/admin/marketing/campaigns` | التسويق | Megaphone | `marketing:read` |
| 15 | `site` = **الموقع** | `/admin/home` | الصفحة الرئيسية | Home | `home:read` |
| 16 | | `/admin/navigation` | القوائم | ListTree | `nav:read` |
| 17 | | `/admin/media` | مكتبة الوسائط | FileImage | `media:read` |
| 18 | | `/admin/news` | نيوز | Newspaper | `news:read` |
| 19 | `system` = **النظام** | `/admin/settings/branding` | الإعدادات | Settings | `settings:read` |
| 20 | | `/admin/flags` | خصائص التشغيل | Flag | `flags:read` |
| 21 | | `/admin/errors` | الأعطال | AlertTriangle | `diagnostics:read` |
| 22 | | `/admin/audit` | سجل النشاط | ScrollText | `audit:read` |

⚠️ `/admin/settings/branding` is declared in the array between `/admin/media` and `/admin/news`
but belongs to group `system`, so the rendered order is: **الموقع** = الصفحة الرئيسية، القوائم،
مكتبة الوسائط، نيوز; **النظام** = الإعدادات، خصائص التشغيل، الأعطال، سجل النشاط.

Below the nav, outside it: a link to `/` labelled `copy.nav.home` with an `ArrowUpLeft` icon.

**Active rule** (`activeNavItem`): longest matching `href` wins; `/admin` matches only on exact
equality, every other item on `pathname.startsWith(href)`. Sidebar, breadcrumb and mobile sheet
must all use this one function.

### 2.3 Live badges

All four poll every **30 000 ms** while the tab is visible, pause when hidden, and refetch
immediately on `visibilitychange` back to visible.

| Badge on | Endpoint | Count field | `sr-only` sentence |
|---|---|---|---|
| `/admin/inbox` | `GET /api/admin/conversations/unread-count` | `unread` | `copy.assistant.inbox.badgeLabel` |
| `/admin/payments` | `GET /api/admin/payments/submissions?status=pending&perPage=10` | `rowCount` | «{n} طلب قيد المراجعة» |
| `/admin/books` | `GET /api/admin/book-orders?status=paid&perPage=10` | `rowCount` | «{n} طلب كتاب متشحنش لسه» |
| `/admin/homework` | `GET /api/admin/homework/pending-count` | `pending` | «{n} حل مستني مراجعة» |

Rules: `null` = not asked yet / no permission; `0` = asked, nothing waiting; **both render no
badge**. Only `count > 0` shows one — never a permanent «٠». The **first** count never raises a
notification (only a rise from a known number does), otherwise every page load announces the whole
backlog. The number is `aria-hidden`; the sentence is announced. Approving or rejecting a payment
calls `refreshPendingCount()` at once so the badge does not lag behind the admin's own action.

### 2.4 Header, inline-start → inline-end

1. ☰, `aria-label` «فتح القائمة», `md:hidden`, opens a Sheet with `<BrandLockup/>` + the same nav.
2. Breadcrumb `<ol>`: «لوحة التحكم» → `/` → active item's `labelAr` (omitted on `/admin`).
3. Command palette trigger «البحث السريع» + `⌘` `K` chips (`hidden sm:flex`).
4. Inbox alerts toggle (only with `conversation:read`) — the same click requests OS notification
   permission and subscribes this browser to Web Push.
5. Notification bell (server-rendered, own `<Suspense>` fallback).
6. Theme toggle. 7. «داخل باسم» {identity} (email if any, else phone; `hidden lg:inline`,
   `max-w-[14rem] truncate`). 8. Sign-out.

Header background `color-mix(in oklch, var(--n-1), transparent 20%)` + `backdrop-blur`. **The only
element in the entire product allowed to use backdrop-blur.**

### 2.5 Command palette + shortcuts

`⌘K` / `Ctrl+K` toggles. Placeholder «دور على أمر أو صفحة...», `aria-label` «لوحة الأوامر»,
groups «التنقل» / «إجراءات». `mod` matches ⌘ **or** Ctrl; comparison is on `event.key` lowercased,
never `event.code`, so Arabic keyboard layouts work. **One** `keydown` listener for the whole tree.

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

### 2.6 Error boundary (`(admin)/error.tsx`)

No `<main>` and no padding of its own (the layout supplies both — two `<main>`s would be an a11y
defect). Inside `.panel p-5 sm:p-6`:
- h1 «الصفحة وقعت»
- body «حصل خطأ على السيرفر والصفحة مااتعرضتش. ولو كان فيه حفظ في نصه، مش مضمون إنه عدّى — تحميل الصفحة تاني وتأكيد من آخر تغيير قبل الكمالة.»
- solid amber `copy.common.retry` (uses `useErrorRetry`, which clears the router cache first) and a
  **plain `<a href="/admin">`** labelled «نظرة عامة» (a soft nav can be answered from cache and do
  nothing).
- with a digest: «{copy.errors.digestLabel}: {digest}» in `dir="ltr" font-mono`, then
  «الكود ده موجود جنب تفاصيل الخطأ في لوج السيرفر».

### 2.7 Not-found (`(admin)/not-found.tsx`)

`404` in mono/ltr, then `copy.notFound.admin.title` / `.body` / `.cta` (a `<Link href="/admin">`).
Same `.panel` + `max-w-[76rem]`. No retry, no digest. Written for the real case: an admin followed
a link from a list rendered before someone else deleted the row.

### 2.8 Overview skeleton (`admin/loading.tsx`)

Heading bar → lead bar → 4 stat placeholders (`grid-cols-2 lg:grid-cols-4`) → 6 card placeholders
(`sm:grid-cols-2 lg:grid-cols-3`). Widths alternate 100/85/60 % so it reads as loading, not broken.

---

## 3. Admin design language, and how it differs from the student side

### 3.1 The colour rule (same on both surfaces)

```
ember (--e-*)   STRUCTURE — sections, wells, the exam gate
amber (--a-*)   ACTION    — anything you press
--ok / --err              — quiz correctness; --err also = destructive STATUS, never decoration
```

Green `oklch(0.62 0.15 150)` is used decoratively in exactly two admin places: the payment
**approve** button and the per-course "subscribed" badge on an inbox thread.

### 3.2 Shared with the student surface

- `study.css` is imported by the admin layout, so `.unit`, `.lesson-row`, `.chip`, `.group-head`,
  `.stage` are the **same objects** an enrolled student sees. Only the verbs on a row differ
  (تعديل / مواد / نشر / حذف here vs «مشاهدة» there).
- `.nav-pill` is shared by the student rail and the admin sidebar: min-height 3.25rem, a 2.25rem
  bordered icon **well** (`--n-3`) rather than a bare glyph, label at `--fs-text-lg` (≈19 px inside
  `product-type`), active = amber tint + `--a-11` text + a 3 px amber marker at
  `inset-inline-start: -0.75rem`. Badge (`.nav-pill__badge`) is pushed to the far end and keeps its
  amber fill in every state, `font-variant-numeric: tabular-nums`.
- `.panel`: dark mode = warm-tinted border + `inset 0 1px 0 rgb(255 255 255 / .045)` top-edge
  highlight and **no drop shadow** (shadows are transparent in dark mode by design); light mode =
  real two-layer shadows and no inset. Hover in both warms the border toward
  `color-mix(in oklch, var(--a-9), transparent 62%)`. **The card never moves on hover.**

### 3.3 Admin-only objects (`app/(admin)/admin.css`)

| Class | What it is |
|---|---|
| `.row-actions` | the 4-verb cluster ending a section/lesson row; the destructive verb sits past a `--hairline` separator (`.row-actions__sep`, 1.25 rem tall) and stays colourless (`--n-11`) until hover |
| `.chip--danger` | transparent at rest; err-tinted border + 8 % err background on hover |
| `.inline-edit` | a title that *becomes* its own input — `cursor: text` (not pointer), `font: inherit` so a section title and a lesson title do not become the same size while editing. Avoids ~40 single-field forms on a 12-section course |
| `.editor-bar` | the course editor's sticky sub-header at `inset-block-start: var(--admin-header-h)`; **opaque** `var(--n-1)`, never blurred |
| `.exam-gate` | the final exam as a threshold, built on `.stage`'s deeper ember, stating the live rule «هيتفتح للطالب بعد ما يخلّص ٢٤ محاضرة» with the course's own number |
| `.stat-tile` | 2.75 rem ember well + `--fs-title-1` tabular value + `--fs-text-sm` label; `.stat-tile--waiting` is the amber variant, rendered **only when count > 0** |
| `.section-tile` | an admin section as a destination: 2.25 rem ember well, title, one-sentence blurb, chevron that appears **only on hover** |
| `.field-count` | mono, tabular character counter; turns `--warn` near the cap |
| `.form-card` | heading + note + body wrapper (`FormSection`) used by the course form |

At `max-width: 640px`, `.row-actions`, `.unit__head` and `.lesson-row` all wrap
(`flex-basis: 100%`, never `inline-size: 100%` — the latter resolves against the containing block,
ignores the gap and pushed the delete button 58 px off the inline edge).

### 3.4 Structural differences

1. **Density.** Student pages are one `--w-prose` column; admin pages are `max-w-[76rem]` with
   tables, dropdown filter rows and multi-column grids.
2. **Never cached.** Student surfaces use `'use cache'` loaders; every admin read is `no-store`.
3. **Dropdown filters, not chips.** `<ListControl>`: a `--fs-text-xs` muted caption over a 36 px
   `<select>`. Choosing pushes a URL (`scroll:false`), **deletes `page`**, and removes the param
   entirely for `''` so an unfiltered list has a bare path. The select **dims to `opacity-60`
   while pending but is never `disabled`** — a control that goes dead mid-navigation steals focus.
   Screens that still use pill-tab rows: `/admin/homework`, `/admin/books`, `/admin/errors`,
   `/admin/outreach`, `/admin/finance` (tabs), `/admin/inbox` (tabs), `/admin/marketing`.
4. **Pagination** (`<ListPager>`): «السابق» ‹ `{page} من {pageCount}` › «التالي»; renders nothing
   when `pageCount <= 1`; disabled buttons go to `opacity-40`.
5. **RTL is logical-only.** `ayman/no-physical-direction` bans `left`/`right`. Forward chevrons
   point **left** (`ChevronLeft`).
6. **Numbers.** `tabular-nums` on every count, score and money figure. Phone numbers, emails,
   routes, digests, hashes and storage keys always carry `dir="ltr"`, usually `font-mono`.
7. **Destructive confirmation ladder**, three deliberately different levels:
   `window.confirm` (archive a nav item, ship one order) <
   a Dialog with a required textarea (reject a payment, reject/delete a book order, cancel a
   subscription) <
   a Dialog requiring the account's own identifier retyped (delete one student) or the literal word
   «مسح» typed (bulk delete).

---

## 4. Screens (53 routes, in sidebar order)

### 4.1 `/admin` — نظرة عامة

`apps/web/app/(admin)/admin/page.tsx` · `admin:access`

Reads `getAdminOverviewStats()` (`apps/web/lib/admin-overview.ts`) → `{ students, published,
drafts }`; it **never throws**, returning `null` on failure. The queue band fetches nothing — it
reads the three sidebar poller contexts. One poller, three consumers.

1. **Header row.** h1 «لوحة التحكم», lead «كل حاجة بتظهر للطالب بتتظبط من هنا.», then the quick
   actions (first solid amber, the rest outlined), permission-filtered:

   | Label | Href | Icon | Permission |
   |---|---|---|---|
   | كورس جديد | `/admin/courses/new` | Plus | `course:create` |
   | أقسام الصفحة الرئيسية | `/admin/home` | Home | `home:read` |
   | رفع صورة | `/admin/media` | FileImage | `media:read` |

2. **«محتاج تصرّف»** — up to 3 `.stat-tile--waiting` links. **Renders nothing at all when every
   queue is 0 or `null`**: presence means there is work, absence means there is none.

   | Label | Count | Href | Icon |
   |---|---|---|---|
   | دفعة مستنية مراجعة | payments pending | `/admin/payments` | Wallet |
   | كتاب لسه ما اتشحنش | unshipped books | `/admin/books` | PackageOpen |
   | رسالة مستنية رد | unread inbox | `/admin/inbox` | Inbox |

3. **Stat strip** (`sm:grid-cols-2 lg:grid-cols-3`): `{students}` «طالب مسجّل» (Users) ·
   `{published}` «كورس منشور» (BookMarked) · `{drafts}` «كورس مسودة» (FileText).
   `stats === null` ⇒ a dashed box reading «الأرقام مش متاحة دلوقتي — تحديث الصفحة».

4. **«أقسام اللوحة»** — `.group-head` with «كل قسم بيتحكّم في حتة من اللي الطالب بيشوفه.», then
   one block per *headed* nav group, each a grid (`auto-rows-fr`, `1 / sm:2 / xl:3`) of
   `.panel.section-tile` cards: ember well + icon, `item.labelAr`, and
   `copy.admin.navBlurb[item.href]`:

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

`/admin/homework` has **no** blurb entry — that tile renders without one.

---

### 4.2 `/admin/courses` — الكورسات

`course:read-admin` · `GET /api/admin/courses` → bare array, **no filters, no sort, no paging**.
Parsed fields: `id slug title subtitle|null coverKey|null status year requiresGrant updatedAt
system{nameAr} track{labelAr}|null subject{nameAr} _count{lessons}`.

h1 «الكورسات», lead «كل الكورسات — المنشور والمسودة. اللي مالوش صورة بياخد شكل تلقائي من لون المادة.»,
button **كورس جديد**. Empty: «مفيش كورسات لسه».

Grid `1 / sm:2 / xl:3` of `.panel` cards:
- Art on top, full width, using **`CourseArt` — the same component the student library card uses**.
  With `coverKey === null` the container gets `aspect-[16/9]` (a generated scene has no intrinsic
  height) and the scene is seeded from `subject.nameAr` + `slug`. Nothing crops.
- Badge plate at `top-3 end-3` (the *inline-end* corner; the generated scene puts its subject glyph
  at inline-start): status badge, plus a `warn`-tone `«مقفول»` badge with a Lock icon when
  `requiresGrant`.
  Status: «مسودة» (neutral) / «منشور» (accent) / «مؤرشف» (**neutral, deliberately not warn** —
  `--warn` and `--a-9` are 13° apart in oklch and would read as one pill).
- Title (link to `/admin/courses/{id}`), `line-clamp-2` subtitle.
- Meta: year label · `system.nameAr` · `track.labelAr` · `subject.nameAr`, then `Layers`
  + `_count.lessons` and `CalendarClock` + «آخر تعديل» {date}.
- Card actions: **افتح**, and **معاينة** only when published (a draft's public page 404s).

---

### 4.3 `/admin/courses/new` — كورس جديد

Taxonomy via `getTaxonomyOrNull() ?? getTaxonomyLiveOrNull()`, and **throws** if both fail — unlike
`/admin/students`, taxonomy is load-bearing here.
`createCourseAction` → `POST /api/admin/courses`, then creates a first section
(`POST /api/admin/courses/:id/sections`) titled **المقدمة** and a first lesson titled
**المحاضرة الأولى**, so the instructor lands on something to fill in. Then redirects to
`/admin/courses/{id}`.

---

### 4.4 `/admin/courses/[id]` — the course editor

`GET /api/admin/courses/:id` (`adminGetOrNotFound` equivalent). Shape:

```
id slug title subtitle|null description|null systemId year trackId|null subjectId
coverKey|null requiresGrant emphasis|null emphasisNote|null comingSoonNote|null
scheduleNote|null whatsappGroupUrl|null contentComplete
monthlyPriceCents|null quarterlyPriceCents|null yearlyPriceCents|null
bookTitle|null bookPriceCents|null forGeneral forLanguages
status('draft'|'published'|'archived') examLessonId|null publishedAt|null
terms[]   { id title position isOpen priceCents|null }
sections[]{ id title summary|null position isPublished termId|null
  lessons[]{ id title kind position isPublished isFreePreview forGeneral forLanguages
             estimatedSeconds completionMode completionMinViewSeconds|null
             completionPassGrade|null
             video{ externalId durationSeconds posterKey|null }|null
             text{ bodyHtml }|null
             _count{ progress, homeworkSubmissions }
             homework{ body maxImages isPublished }|null
             quiz{ id isPublished _count{slots} }|null
             resources[] } }
```
Note what is **absent**: a resource's `storageKey`. A key not in a payload is a key that cannot
leak from one.

**Autosave, no save button.** Status read-out (`aria-label` «حالة حفظ الكورس»):
idle «كل حاجة بتتحفظ لوحدها كمسودة» · «بيحفظ…» · «اتحفظ» · «مااتحفظش» + «نجرّب تاني».

#### The form — six `FormSection` blocks

| Heading | Note | Fields |
|---|---|---|
| المعلومات الأساسية | الاسم والرابط والوصف — ده اللي بيظهر في قوايم الكورسات وفي نتايج البحث. | **اسم الكورس** · **المُعرّف في الرابط** (hint «حروف إنجليزي صغيرة وأرقام وشرطات — ده اللي بيظهر في العنوان») · **وصف مختصر** · **الوصف** |
| التصنيف والمنهج | النظام والصف والمسار والمادة، ومين شايف الكورس من الشُّعَب. | **النظام الدراسي** · **الصف الدراسي** · **المسار** (year 1 ⇒ «الصف الأول مالوش مسار») · **المادة** (empty ⇒ «مفيش مواد متاحة للاختيار ده — نظام أو صف أو مسار تاني»; a subject the taxonomy no longer offers is held by an option labelled «المادة الحالية (تفضل زي ما هي)») · stream radios عربي/لغات/الاتنين |
| صورة الكورس | بتظهر على كارت الكورس وفي لوحة الطالب. | **صورة الكورس** via `<MediaKeyField>`, hint «بتظهر في صفحة الكورسات وفي لوحة الطالب. أحسن مقاس ١٦:٩.» |
| الاشتراك والتسعير | أسعار الاشتراك بالجنيه. أي سعر بتحطه بيقفل الكورس تلقائيًا. | **اشتراك شهري (جنيه)** / **اشتراك ٣ شهور (جنيه)** / **اشتراك سنة كاملة (جنيه)**, placeholder «مش للبيع» · switch **قفل الكورس ده** |
| الكتاب الورقي | كتاب المادة اللي الطالب يطلبه ويتشحنله. مالوش علاقة خالص بسعر الاشتراك. | **اسم الكتاب** / **سعر الكتاب (جنيه)** (legacy pair, now read-only; superseded by `/admin/books/catalog`). Heading chip reads the PAIR: «الكتاب متاح للطلب» when both set, else «مفيش كتاب» |
| الشارة والملاحظات | سطور بتظهر على الكارت وصفحة الكورس — مش بتتحكم في وصول حد. | switch **المنهج نزل كله** · **شارة الكورس** (empty «من غير شارة») · **سطر تحت الشارة** (placeholder «أساسي لأولى بكالوريا · اختياري لتانية») · **رسالة «لسه هننزل قريبًا»** (placeholder «المحاضرات بتتصور دلوقتي، هتتنزل الأسبوع الجاي») · **ميعاد المحاضرة** (free text, placeholder «السبت الساعة ٨ مساءً») · **جروب الواتساب بتاع الكورس** (placeholder `https://chat.whatsapp.com/…`) |

Long hints, verbatim:
- `priceHint` «سيبهم فاضيين لو الكورس مجاني. أول ما تحط سعر لأي باقة، الكورس بيتقفل أوتوماتيك على أي حد جديد لحد ما يدفع ويتعمله موافقة — بالظبط زي «قفل الكورس ده» فوق.»
- `requiresGrantHint` «الكورس هيبقى مقفول على أي حد جديد لحد ما تفتحه له بنفسك. الطلبة المشتركين قبل كده هيكمّلوا عادي، والمحاضرات اللي عليها «معاينة مجانية» هتفضل مفتوحة للكل.»
- `contentCompleteHint` «سيبها فاضية طول ما لسه فيه محاضرات جاية. لغاية ما تعلّمها، الطالب اللي خلّص اللي نازل هيقرا «خلّصت اللي نزل» مش «خلصت الكورس».»
- `emphasisHint` «بتظهر على كارت الكورس للطالب. دي بتقوله الكورس ده مهم قد إيه بالنسباله — مابتقفلش ولا بتفتح حاجة، الكورس يفضل مفتوح زي ما هو.»
- `comingSoonNoteHint` «بتظهر بدل الدروس لو الكورس لسه مفيهوش محاضرة حقيقية منشورة، وميمنعش الاشتراك خالص. سيبها فاضية عشان تستخدم الجملة الافتراضية.»
- `scheduleHint` «بتظهر للطالب في أول صفحته، فوق خالص جنب اسمه، عشان يعرف محاضرته إمتى من غير ما يسأل. اكتبها زي ما بتقولها — «السبت الساعة ٨ مساءً» أو «السبت والتلات ٨ م». سيبها فاضية لو الكورس ده لسه مالوش ميعاد معلن.»
- `whatsappGroupHint` «ده جروب الدفعة بتاعة الكورس ده لوحده — غير الجروب الرسمي الكبير اللي في الإعدادات. الطالب المشترك بس هو اللي بيشوفه، وبيلاقيه وهو بيتفرج على المحاضرة. سيبه فاضي لو الكورس ده مالوش جروب.»
- `bookHint` «سيبهم فاضيين لو الكورس ده مالوش كتاب ورقي. أول ما تحط اسم وسعر، هيظهر «اطلب الكتاب» في صفحة الكورس.»

#### Terms — الترمين

Panel «الترمين», lead «قسّم محتوى الكورس لترمين — كل قسم تقدر تحطه جوه ترم، والسويتش هنا بيفتح أو يقفل البيع والوصول للترم ده بس.»,
empty «الكورس ده لسه من غير ترمين.», add **ترم جديد**, fields **اسم الترم** / **سعر الترم**,
toggle `aria-label` «فتح/قفل الترم» showing «مفتوح» / «مقفول».
Endpoints `GET|POST /api/admin/courses/:courseId/terms`, `PATCH /api/admin/terms/:id`,
`PATCH /api/admin/terms/:id/open` (all `section:write`).
Closing **cascades** and the toast says so: «اتقفل الترم، وسحبنا الوصول من {n} طالب كان مشترك فيه.»
or «اتقفل الترم — محدش كان مشترك فيه لسه.»; reopening «اتفتح الترم تاني للاشتراك.»;
failure «حصل خطأ، حاول تاني».

#### Sections

`.unit` container. Header: drag handle, inline-editable title, `{done}/{total} محاضرة` + status,
disclosure («فتح القسم» / «اطوِ القسم»), `.row-actions` = تعديل · نشر · **حذف القسم**.
New **قسم جديد**; fields **اسم القسم**, **نبذة**; term picker **الترم** with **بدون ترم**.
Empty «مفيش أقسام لسه». Delete confirm «هيتمسح القسم وكل المحاضرات اللي جواه. الإجراء ده مش هيترجع.»;
blocked «القسم ده فيه محاضرة عليها محاولات امتحان لطلبة، فمينفعش يتمسح خالص — رجّعه مسودة عشان يختفي من الطلبة ودرجاتهم تفضل محفوظة».
`POST /api/admin/courses/:courseId/sections`, `PATCH|DELETE /api/admin/sections/:id`,
`PATCH /api/admin/courses/:courseId/sections/order`.

#### Lessons

`.lesson-row`. New **محاضرة جديدة**; empty «مفيش محاضرات في القسم ده».
Fields: **عنوان المحاضرة** · **النوع** · **معاينة مجانية** · **المدة التقديرية بالثواني** ·
**رابط يوتيوب** (hint «بناخد كود الفيديو (11 حرف) بس — الباقي بيتشال ومحدش بيفتح الرابط»; invalid
«الرابط ده مش رابط يوتيوب صالح») · **صورة المحاضرة** (hint «بتظهر قبل ما الفيديو يشتغل. لو سيبتها فاضية هتظهر صورة يوتيوب.») ·
**محتوى الدرس**.
Settings: **قاعدة الإتمام** ∈ «من غير قاعدة» / «الطالب بيعلّمها خلصت» / «بعد مشاهدة مدة معيّنة» /
«بعد ما ياخد درجة» / «بعد ما ينجح»; then **أقل مدة مشاهدة بالثواني** and **درجة النجاح ٪**.
Quiz link: **إضافة اختبار للمحاضرة** (no longer gated on `kind === 'quiz'`).

Endpoints: `POST /api/admin/sections/:sectionId/lessons`, `PATCH|DELETE /api/admin/lessons/:id`,
`PUT|DELETE /api/admin/lessons/:id/video`, `POST /api/admin/lessons/:id/video/mirror`,
`PUT /api/admin/lessons/:id/text`, `PATCH /api/admin/sections/:sectionId/lessons/order`,
`GET /api/admin/lessons/video-duration`.

**Duration probe** — server probes YouTube's watch page, browser probes the player; the manual
field **مدة الفيديو بالثواني** appears **only after both come back empty**.
probing «بنجيب المدة من يوتيوب…» · at rest «بتتجاب من يوتيوب» · label **مدة الفيديو** ·
both failed «يوتيوب مارضيش يقول مدة الفيديو ده — اكتبها بالثواني.» + «نجرّب تاني» ·
API refusal «يوتيوب مارضيش يقول مدة الفيديو للسيرفر دلوقتي — ده بيحصل أحياناً ومالوش علاقة بالفيديو. المدة تتكتب بالثواني، أو نجرّب تاني بعد شوية.»
(⚠️ it deliberately no longer blames the video — the commonest cause is YouTube serving our server
a bot challenge.)

**Embed check** (a video with embedding off still has a watch page, so duration alone can never
answer this):
«بنتأكد إن الفيديو هيشتغل جوه المنصة…» · «الفيديو هيشتغل جوه المنصة» ·
«الفيديو ده متقفول عليه التضمين، يعني هيشتغل على يوتيوب بس ومش هيشتغل جوه المنصة. افتحه في YouTube Studio ← تفاصيل ← اختيارات أخرى، وفعّل «السماح بالتضمين».» ·
«يوتيوب بيقول إن الفيديو ده مش متاح — يا إما private، يا إما اتمسح، يا إما عليه قيد سن أو بلد. الطلبة مش هيعرفوا يشوفوه.» ·
«مقدرناش نتأكد إن الفيديو هيشتغل — راجعه بنفسك قبل ما تنشر.»

**In-admin preview** (the student player is enrolment-gated and would 404 for the instructor):
**معاينة المحاضرة** / **تشغيل الفيديو** / **قفل المعاينة** / **افتحه على يوتيوب**.
**شيل الفيديو** confirm «هيتشال الفيديو من المحاضرة. المحاضرة نفسها هتفضل موجودة.», done
«الفيديو اتشال».

**Delete lesson** confirm «هتتمسح المحاضرة وكل اللي جواها — الفيديو والمواد. الإجراء ده مش هيترجع.»
plus, when `_count.progress > 0`, «تقدّم الطلبة دول في المحاضرة هيتمسح معاها: {n}»; blocked
«المحاضرة دي عليها محاولات امتحان لطلبة، فمينفعش تتمسح خالص — رجّعها مسودة عشان تختفي من الطلبة ودرجاتهم تفضل محفوظة».

#### Resources — مواد الدرس

Hint «المواد بتتعلّق على أي نوع محاضرة — فيديو، نص، أو مرفقات.», add **أضف مادة**, empty
«لسه مفيش مواد. نبدأ بالبريزنتيشن الأساسي.»
Kinds **بريزنتيشن أساسي** / **فيديو شرح** / **ملف** / **رابط**.
Fields **الاسم**, **وصف مختصر**, **الملف** (hint «PDF أو PowerPoint أو Word أو Excel — ٩٥ ميجا كحد أقصى»,
drop «سحب الملف هنا، أو دوسة للاختيار»), **رابط يوتيوب**, **الرابط** («لازم يبدأ بـ https»).
Upload «بنرفع…» → «الملف اترفع»; failures «مقدرناش نرفع الملف» / «الملف كبير أوي — الحد الأقصى ٩٥ ميجا.» /
«النوع ده مش مدعوم. المسموح: PDF أو PowerPoint أو Word أو Excel.» /
«الملف ده مش سليم أو نوعه الحقيقي مش زي امتداده.» / «النت قطع في نص الرفع. نجرّب تاني.»
One «بريزنتيشن أساسي» per lecture (partial unique index) — violation surfaces as
«المحاضرة دي فيها بريزنتيشن أساسي واحد خلاص. القديم يتمسح الأول، أو ده يتضاف كـ«ملف».», with the
standing note «فيه بريزنتيشن أساسي واحد بس لكل محاضرة.» Other refusals ⇒ «مقدرناش نضيف المادة دي. نجرّب تاني.»
Disabled-add reason «الملف الأول». Edit/save/cancel/delete = تعديل / حفظ / إلغاء / حذف.
`POST /api/admin/lessons/:id/resources`, `PATCH|DELETE /api/admin/resources/:id`,
`PATCH /api/admin/lessons/:id/resources/order`.

#### Homework block — واجب المحاضرة

Hint «اكتب المطلوب زي ما بتقوله في الحصة. الطالب هيقراه هنا ويرفع صور الحل بتاعه، وهتلاقيها في «الواجبات».»,
add **أضف واجب على المحاضرة دي**.
Fields **المطلوب** (multiline; placeholder literally `١- حل تمرين ٣ صفحة ٤٠\n٢- ارسم المنحنى\n٣- اكتب الخلاصة في سطرين`),
**أقصى عدد صور للحل**, switch **اظهر الواجب للطلبة** («وهو مقفول محدش بيشوفه — تقدر تكتب وتسيبه لبعدين.»),
**شيل الواجب** (confirm «أشيل الواجب من المحاضرة دي؟ الحلول اللي اتسلّمت هتفضل موجودة.»).
Waiting work: «فيه {n} حل مستني مراجعة» + **شوف الحلول** → `/admin/homework`.
`HomeworkWriteSchema`: `body` trimmed 3–4000 · `maxImages` int 1–8 (default 4) ·
`isPublished` bool default **false**.
`PUT|DELETE /api/admin/lessons/:id/homework` (`lesson:write`).

#### Exam gate — امتحان الكورس

Hint «محاضرة من نوع «اختبار» تبقى امتحان الكورس النهائي. مش بتتفتح للطالب غير لما كل المحاضرات التانية تخلص، ولازم النجاح فيها عشان الكورس يتحسب خلص.»
Controls **من غير امتحان** / **الامتحان الحالي** / **أضف امتحان الكورس** / **فتح الامتحان** /
**اختيارات متقدمة**; no quiz lesson ⇒ «لازم تعمل محاضرة من نوع «اختبار» الأول.»; scaffold failure
«مقدرناش نعمل الامتحان — نجرّب تاني».
Gate line «هيتفتح للطالب بعد ما يخلّص {n} محاضرة», or
«مفيش محاضرات منشورة لسه، فالامتحان هيتفتح للطالب على طول». Also «{n} سؤال», «لسه من غير أسئلة»,
«لسه مسودة».
`PUT /api/admin/courses/:id/exam`, `POST /api/admin/courses/:id/exam/scaffold`.

#### Publish-all and destructive actions

- **انشر الكورس كله** → `POST /api/admin/courses/:id/publish-all` (`course:publish`).
  Hint «هينشر الكورس وكل محاضرة جاهزة جواه. اللي لسه ناقص هيفضل مسودة.»; confirm
  «الكورس وكل المحاضرات الجاهزة هيبقوا ظاهرين للطلبة. تمام؟»; result «اتنشرت {n} محاضرة»; skipped
  list headed «ما اتنشرتش عشان لسه ناقصة:» with reasons «مافيهاش فيديو» / «مافيهاش محتوى» /
  «مافيهاش مواد مرفوعة» / «الاختبار بتاعها لسه مش منشور».
- **نشر / رجّعه مسودة** → `PATCH /api/admin/courses/:id/status`; blocked
  «لازم يكون فيه محاضرة منشورة واحدة على الأقل».
- **أرشفة** confirm «نأرشف الكورس ده؟ هيتشال من واجهة الطلبة.»; **استرجاع** «نرجّع الكورس ده مسودة؟».
- **حذف** → `DELETE /api/admin/courses/:id` (`course:delete`), confirm
  «نمسح الكورس ده؟ الإجراء ده مش هيترجع.»; blocked whenever any attempt exists (attempt history is
  append-only at the database level, forever): «الكورس ده فيه محاولات امتحانات لطلبة، فمينفعش يتمسح خالص — أرشفه بدل ما تمسحه».
- **افحص فيديوهات الكورس** → `GET /api/admin/courses/:id/video-check`. Hint «بيسأل يوتيوب عن كل فيديو في الكورس ويقول لك المكسور منهم.»;
  running «بنسأل يوتيوب…»; all good «كل الفيديوهات شغالة ({n})»; else «الفيديوهات دي فيها مشكلة:»
  with «مافيهاش فيديو أصلاً» / «التضمين مقفول — شغّال على يوتيوب بس» /
  «يوتيوب بيقول مش متاح (private أو متمسوح)» / «مقدرناش نتأكد منه»; failure «الفحص مانجحش — نجرّب تاني».
- **إجراءات تانية** is the «⋯» trigger holding archive, delete and the video check.

**Drag-and-drop announcements**: hint «سحب لإعادة الترتيب، أو زر المسافة والأسهم من الكيبورد»,
handle «مقبض السحب», «اتمسكت المحاضرة في الترتيب رقم» / «اتمسك القسم في الترتيب رقم» /
«اتمسكت المادة في الترتيب رقم» / «بقت في الترتيب رقم» / «اتسابت في الترتيب رقم» /
«اتلغى السحب والترتيب رجع زي ما كان».
⚠️ Known defect: `pickedUp` says «المحاضرة» and is read by four sortable lists — home blocks, nav
items and quiz slots announce themselves as "the lecture".

---

### 4.5 `/admin/students` — الطلبة

`student:read` (list) + `student:delete` (bulk bar). Reads `GET /api/admin/students?{params}` and
`getTaxonomyOrNull()` — the latter only labels filter dropdowns, so `null` costs an empty dropdown
rather than the screen (the 2026-09-04 outage note in the file explains why the throwing uncached
read was removed).

**Query** (`StudentListQuerySchema`):

| Param | Type | Default | Notes |
|---|---|---|---|
| `page` | int ≥1 | 1 | |
| `perPage` | int 1–100 | 20 | UI offers 10/20/50/100 |
| `q` | ≤120 | `''` | throttled 400 ms in the URL |
| `governorate` | repeated, exactly 2 chars each | `[]` | `z.preprocess(toArray, …)` — Express collapses a single repeat to a scalar |
| `year` | repeated int | `[]` | |
| `track` | repeated string | `[]` | |
| `sort` | `createdAt` \| `fullName` \| `governorate` | `createdAt` | maps to `createdAt` / `fullName` / `governorateCode` |
| `dir` | `asc` \| `desc` | `desc` | |
| `access` | `hand_opened` \| `comped` \| `paid` \| null | null | |

`access` (scoped to `scope:'course'` grants only — including the automatic `platform` grant would
put every account in the "free" bucket):
`hand_opened` = a live `source:'admin'` grant, **shows on neither money screen**;
`comped` = a live `purchase` grant whose approved submission is `isFree`;
`paid` = a live `purchase` grant actually paid for.
Filter labels **المحافظة** / **الصف** / **المسار** / **طريقة الدخول**, values
«اتفتح بالإيد» / «اتسجّل مجاني» / «مدفوع».

**Row** `AdminStudentRowSchema`:
```
id(string, nanoid) fullName email|null phone(E.164) gender('male'|'female')
governorateCode(len 2) governorateNameAr systemSlug|null year|null trackLabelAr|null
onboardingCompleted createdAt bannedAt|null
```

**Columns**

| id | Header | Sortable | Cell |
|---|---|---|---|
| `select` | checkbox «حدد الكل» | no | row checkbox «حدد الصف» |
| `fullName` | **الاسم** | yes | link to the record; an `err`-tone badge **موقوف** beside the name when `bannedAt` (deliberately not its own column — it would be empty on every normal row and cost width) |
| `email` | **البريد الإلكتروني** | no | `null` ⇒ faint «مادّاش إيميل» |
| `phone` | **رقم الهاتف** | no | |
| `governorate` | **المحافظة** | yes | `governorateNameAr` |
| `year` | **الصف** | no | `?? '—'` |
| `track` | **المسار** | no | `?? '—'` |
| `onboardingCompleted` | **حالة التسجيل** | no | Badge accent «اكتمل التسجيل» / neutral «لسه ما كملش» |
| `createdAt` | **تاريخ الانضمام** | yes | `toLocaleDateString('ar-EG')` |

Toolbar: search «دور...», four faceted filters, «مسح الفلاتر».
Pagination: «صفحة» {n} «من» {m}, «عدد الصفوف», «الأولى» «السابقة» «التالية» «الأخيرة».
Empty «مفيش نتائج مطابقة». Selection «{n} متحدد», «إلغاء التحديد».

**Bulk bar** — sticky at `top: var(--admin-header-h)`, amber-tinted
(`bg-[color-mix(in_oklch,var(--a-9),var(--n-2)_88%)]`, `border-accent/40`). One control:
**مسح المحدد**.

**Bulk delete dialog**
- Title «مسح {n} حساب نهائيًا»
- Body «الحسابات دي هتتمسح خالص ومش هينفع ترجع. هيتمسح معاها: تسجيل الدخول، الاشتراكات في الكورسات، كل محاولات الامتحانات وإجاباتها، والإشعارات. ولو المطلوب إيقافهم بس، من صفحة الحساب فيه «إيقاف الحساب» — وده بيترجع.»
- List **الحسابات اللي هتتمسح** (name + email each), overflow «و{n} حساب كمان»
- Field **كلمة «مسح» للتأكيد** — must equal exactly «مسح» (a yes/no dialog is the one an admin
  dismisses on autopilot)
- Field **سبب المسح**, placeholder «وضّح سبب المسح — هيتسجل في سجل النشاط لكل حساب»
- Confirm **امسحهم نهائيًا**
- `DELETE /api/admin/students` (declared **before** `DELETE /:userId` in the controller), body
  `{ userIds: string[1..100] each 1–64 chars, reason: string 8–500 }`
- Response `{ deleted: string[], failed: [{ userId, name, reason }] }`,
  reason ∈ `self` | `last-admin` | `authored-content` | `not-found`. **Partial success is the
  normal outcome** and the UI keeps exactly the failed rows selected.
- Toasts «اتمسح {n} حساب» + «{n} حساب ما اتمسحوش — اتساب متحددين»; none ⇒ «مفيش حساب اتمسح»;
  request failure ⇒ «مقدرناش نمسح — نحاول تاني». Per-row reasons «حسابك إنت» / «آخر مسؤول» /
  «مؤلف محتوى» / «اتمسح قبل كده».

---

### 4.6 `/admin/students/[userId]` — بيانات الطالب

**Six parallel reads**: `GET /api/admin/students/:userId`; `getTaxonomyOrNull()`;
`GET /api/admin/students/:userId/grants`; `GET /api/admin/courses` (narrow parse: `id title status
requiresGrant monthly/quarterly/yearlyPriceCents terms[{id,title,isOpen,priceCents}]`);
`GET /api/admin/students/:userId/subscriptions`; `GET /api/admin/students/:userId/history`.

A **seventh, streamed behind `<Suspense>`**: `GET /api/admin/analytics/students/:userId`. It is the
slow read (8 queries incl. a cohort comparison) and the **only one allowed to fail** — that route
404s for any account whose `role !== 'student'`, and this page legitimately opens admins. Failure
renders, in place: «مافيش سجل للحساب ده» + «السجل بيتبني للحسابات الطلابية بس. ولو ده حساب طالب فعلًا، تحديث الصفحة بيجيبه.»
Skeleton: 2 rows × 4 tiles, then a wide card.

Detail = row + `role, schoolName|null, schoolStream|null, fatherPhone|null, motherPhone|null,
electiveSubjectNameAr|null, bannedReason|null, bannedByName|null`.

Chrome: back link «< رجوع لقائمة الطلبة»; header row with the name (`--fs-title-2` semibold), the
phone in mono, and **مراسلته على واتساب** (`wa.me` only — there is no `tel:` anywhere in this
product). Grid `lg:grid-cols-[2fr_1fr]`; right column order below, with the destructive panel
second-to-last on purpose.

#### a) Profile form
`PATCH /api/admin/students/:userId` (`student:write`), `AdminStudentPatchSchema` `.strict()`, must
carry ≥1 key. **No `role`, no `password`** — both have their own endpoints, so a role escalation
can never ride inside a routine profile correction.

| Field | Label | Rule |
|---|---|---|
| `fullName` | الاسم بالكامل | 2–120 |
| `schoolName` | اسم المدرسة | ≤160 nullable |
| `governorateCode` | المحافظة | exactly 2 |
| `year` | الصف | int 1–3 nullable |
| `schoolStream` | المدرسة | `general`\|`languages` nullable; unset renders «مش متسجّل» |
| `phone` | رقم الهاتف | `egyptianPhone('رقم الموبايل مطلوب')`, **never nullable** — same parser the register form uses so `01012345678` normalises to the E.164 login lookup matches |
| `email` | البريد الإلكتروني | `z.email('أدخل بريدًا إلكترونيًا صحيحًا')`, nullable, refuses `…@phone.invalid` |

Also displayed: **رقم هاتف ولي الأمر** (+ **واتساب ولي الأمر**), **رقم هاتف الأم**
(+ **واتساب الأم**), **المادة الاختيارية**, **عضو من**. Section headings **البيانات الشخصية** /
**البيانات الدراسية**.
Toasts «اتحفظت بيانات الطالب» / «مقدرناش نحفظ — نحاول تاني» / 409 «الرقم أو الإيميل ده متسجّل بحساب تاني بالفعل».

#### b) Role — `POST /api/admin/students/:userId/role` (`student:role-change`)
Body `{ role: 'admin'|'student', reason: string 8–500 }`.
**الدور الحالي** («مسؤول» / «طالب») · **تغيير الدور** · dialog **تغيير دور المستخدم** ·
**الدور الجديد** · **سبب التغيير** (placeholder «وضّح سبب التغيير — هيتسجل في سجل النشاط» —
exact string: «وضّح سبب تغيير الدور — هيتسجل في سجل النشاط») · **تأكيد التغيير**.
«اتغيّر الدور» / «مقدرناش نغيّر الدور — نحاول تاني» / «مينفعش تغيّر دورك إنت» /
«ده آخر مسؤول في المنصة — مينفعش تلغي صلاحياته».

#### c) Password — `POST /api/admin/students/:userId/set-password` (`student:set-password`)
Body `{ newPassword: string 8–128 }` → `{ status: true }`.
**كلمة السر**, lead «كلمة السر متشفّرة ومفيش طريقة نشوفها. لو الطالب نسيها، تقدر تحط له واحدة جديدة من هنا.»,
**تعيين كلمة سر جديدة** → dialog of the same name, **كلمة السر الجديدة** +
**تأكيد كلمة السر الجديدة**, confirm **تعيين كلمة السر**.
The mismatch check «كلمتا المرور مش متطابقتين» runs **server-side in the action too**, not only in
client state. «اتغيّرت كلمة السر» / «مقدرناش نغيّر كلمة السر — نحاول تاني».
There is never a "show password" — these are Argon2id hashes.

#### d) Closed-course grants — الكورسات المقفولة
Only `requiresGrant` courses are offered.
`POST /api/admin/students/:userId/grants` (`student:write`), `AdminGrantCreateSchema`
`{ courseId: uuid, validUntil: iso|null = null, note: string ≤500|null = null }` →
`AdminGrantRow[]`. **This form always sends `validUntil: null, note: null`** (a date picker plus a
note field on a two-control panel would bury the one thing it is for behind paperwork).
`DELETE /api/admin/students/:userId/grants/:grantId` stamps `revokedAt`, never deletes.
Row `{ id courseId courseTitle source validFrom validUntil|null revokedAt|null note|null }`.
Copy: lead «الكورسات اللي قافلها بتتفتح للطالب من هنا.», empty «الطالب ده مافتحتلوش أي كورس مقفول.»,
**فتح كورس** / **فتح**, states «مفتوح» / «اتقفل», **اقفله**, «مفيش كورسات مقفولة أصلاً.»,
«كل الكورسات المقفولة مفتوحة للطالب ده.»

#### e) Paid subscriptions — اشتراكات الكورسات المدفوعة
A **different mechanism** from (d): this goes through `PaymentsService.adminManualSubscribe` and
produces the same `AccessGrant`/`Enrollment` state a genuine approval does.
`POST /api/admin/students/:userId/subscriptions` (`payment:review`), `AdminManualSubscribeSchema`:
```
courseId: uuid
plan: 'monthly'|'quarterly'|'yearly'|'term'
termId: uuid|null = null       // required iff plan === 'term', forbidden otherwise;
                               //   refine message «لازم تختار الترم» on path termId
isFree: boolean                // true = comped: same plan-length expiry, never revenue
screenshotKey: string 1..255|null = null   // OPTIONAL, unlike the student flow
```
**No `amountCents`** — the price is always derived from the course's own plan price.
`DELETE /api/admin/students/:userId/subscriptions/:grantId` cancels.
Row `AdminSubscriptionRowSchema` `{ id courseId courseTitle plan|null termId|null termTitle|null
amountCents|null isFree|null validUntil|null revokedAt|null createdAt }`; `validUntil` is
**always null for a term grant** — it ends only when an admin closes the term.
The screenshot uploads client-side first (two-step, same as the student `SubscribePanel`).

Copy: lead «اشترك الطالب في كورس مدفوع من هنا — بنفس الباقات والأسعار اللي شايفها في صفحة الكورس، وبيتفعّل على طول زي ما لو دفع إنستاباي وتمت الموافقة عليه.»,
empty «الطالب ده مالوش أي اشتراك مدفوع لسه.», «مفيش كورسات مدفوعة أصلاً.»,
**اشتراك جديد** → dialog **اشتراك جديد** with **الكورس**, **الباقة**, radio **ترم** + picker
**الترم** (a **closed** term is still offered, badged «مقفول» — the deliberate admin override),
radios **مجاني (منحة/تعويض)** («هيتفعّل بنفس مدة الباقة، بس مش هيتحسب ضمن الإيرادات في صفحة «الاشتراكات والإيرادات».»)
/ **مدفوع**, «المبلغ: {amount} ج», checkbox «أأكد إن مبلغ {amount} ج اتحول للكورس ده»,
**صورة التحويل (اختياري)** («لو معاك صورة التحويل من واتساب ممكن ترفعها هنا — مش شرط.»),
submit **تسجيل الاشتراك** / **بيتسجّل…**.
Warnings «الطالب مشترك في الكورس ده لحد {date} بالفعل — الاشتراك ده هيتضاف فوق المتبقي.» /
«الطالب مشترك في الترم ده بالفعل.»
Errors «مقدرناش نرفع الصورة — نحاول تاني» / «مقدرناش نسجل الاشتراك — نحاول تاني».
Row states «شغّال» / «اتلغى» / «خلص», badge «مجاني».
Cancel: **إلغاء الاشتراك** → dialog of the same name, body
«الطالب مش هيقدر يفتح الكورس ده تاني لحد ما يشترك من جديد. الفلوس اللي اتدفعت مش بترجع من هنا — ده بس بيقفل الوصول.»,
confirm **إلغاء الاشتراك**, failure «مقدرناش نلغي الاشتراك — نحاول تاني».

#### f) Account state — حالة الحساب
States «نشط» / «موقوف», with «موقوف من {date}», «بواسطة {name}», **سبب الإيقاف**.

**Ban** `POST /api/admin/students/:userId/ban` (`student:ban`), `{ reason: string 8–500 }` — the
reason is required because the student sees it on the sign-in screen.
**إيقاف الحساب** → dialog **إيقاف حساب الطالب**, body
«الطالب مش هيقدر يدخل على حسابه تاني، وكل الأجهزة المفتوحة هتتقفل على طول. بياناته وتقدّمه كلهم زي ما هم، وتقدر ترجّعه في أي وقت.»,
field **سبب الإيقاف** placeholder «الطالب هيشوف السبب ده لما يحاول يدخل — اكتبه بوضوح»,
confirm **أوقف الحساب**, success «الحساب اتوقف».

**Unban** `POST …/unban` → dialog **رفع الإيقاف عن الحساب**, body
«الطالب هيقدر يدخل تاني عادي. مش هنرجّع الأجهزة اللي كانت مفتوحة — هيسجّل دخول من الأول.»,
confirm **رفع الإيقاف**, success «اترفع الإيقاف».

**Delete** `DELETE /api/admin/students/:userId` (`student:delete`), `AdminStudentDeleteSchema`
`{ confirmIdentity: string 3–320, reason: string 8–500 }`.
**مسح الحساب نهائيًا**, body
«الحساب ده هيتمسح خالص ومش هينفع يترجع. هيتمسح معاه: تسجيل الدخول، الاشتراكات في الكورسات، كل محاولات الامتحانات وإجاباتها، والإشعارات. ولو المطلوب إيقافه بس، فيه «إيقاف الحساب» — وده بيترجع.»,
field **رقم الحساب أو إيميله للتأكيد** with hint «المطلوب: {identity}», field **سبب المسح**
placeholder «وضّح سبب المسح — هيتسجل في سجل النشاط قبل ما الحساب يروح», confirm **مسح نهائي**,
success «الحساب اتمسح», then **redirect to `/admin/students`** (the page describes a row that no
longer exists; revalidating would drop the admin on a bare 404).

⚠️ **`confirmIdentity` is not a plain string compare** — `deleteIdentityMatches()` is shared by the
dialog and the service:
- expected = `phone ?? email ?? null`; `null` ⇒ always false (fail closed)
- trimmed, case-insensitive equality first
- then, **only when the expected value is itself a valid Egyptian number**, both sides fold to the
  10 national digits: `+201223334567`, `00201223334567`, `201223334567`, `01223334567`,
  `+01223334567`, with spaces/dashes/brackets, all → `1223334567`
- the typed value must LOOK like a bare number (`/^\+?[\d\s()-]+$/`) before digits are read, or
  `01223334567@example.test` would parse as a phone and the check would degrade to a substring
  match. `users.phone_number` is UNIQUE, so folding does not weaken the confirmation.

409 ⇒ «الحساب ده مؤلف محتوى على المنصة ({items})، فمينفعش يتمسح. انقل المحتوى لحساب تاني أو امسحه الأول، أو أوقف الحساب بدل ما تمسحه.»
`{items}` is built from `{ courses, questionBankEntries, questionVersions, newsPosts }` joined with
` و` using «{n} كورس», «{n} سؤال» (**entries + versions summed** — the schema distinction means
nothing to the reader), «{n} مقال».

#### g) History — سجل الحساب
`GET /api/admin/students/:userId/history` → one flat **newest-first** list (never per-source
sections; the answer is usually in the order — a grant dated eleven days before the book order
beside it settles what did not cause what).
```
key(`<kind>:<row id>`) kind at(iso) courseId|null courseTitle|null actorName|null
source|null amountCents|null isFree|null plan|null validUntil|null detail|null
```

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

Title **سجل الحساب**, lead «كل اللي حصل في الحساب ده بالترتيب، ومين اللي عمله.», empty
«مافيش حاجة اتسجلت على الحساب ده لسه.», actor «بواسطة {name}» or «الطالب بنفسه».
`source` → «اتفتح بالإيد» / «اشتراك مدفوع» / «تلقائي (كورسات مفتوحة)».
A grant with no `validUntil` prints **«مبينتهيش»** — never a blank cell (blank reads as "unknown";
this means "forever"). Dated: «لحد {date}». Comped: «مجاني».
⚠️ This panel exists because both money panels filter `source: 'purchase'`, so a hand-issued grant
appears on **neither** — «مافيش اشتراكات» never meant «مادفعش», it meant «مادفعش من خلال الموقع».

#### h) The analytics record (full width, below the columns)
Heading **سجل الطالب**, lead «كل حاجة عملها: شاف إيه، قعد قد إيه، ودخل أنهي امتحانات.» — see §4.15.4
for the shape and every label.

---

### 4.7 `/admin/payments` — المدفوعات (InstaPay review queue)

`payment:read` (list), `payment:review` (approve / reject).
`GET /api/admin/payments/submissions?perPage=50&page={n}&sort={s}[&status={st}]` →
`listResponse(AdminPaymentRowSchema)`.

**Query** (`AdminPaymentQuerySchema` = `ListQuerySchema` minus `dir`/`q`):
- `status` ∈ `pending` | `approved` | `rejected`, **optional**. `'all'` is screen-only — omitting
  the key entirely is how the API means "every status". Junk falls back to `pending`.
- `sort` ∈ `oldest` (**default**, first-come-first-served) | `newest` | `amount_desc` |
  `amount_asc`. Before this the order was hard-coded oldest-first with no paging at all, so on a
  busy day the newest claims were unreachable.
- `perPage` fixed at **50** by the page.

**Row**
```
id(uuid) userId studentName studentEmail|null studentPhone|null
courseId courseTitle plan termId|null termTitle|null amountCents
senderPhone|null status rejectionReason|null approvedBefore(int≥0)
createdAt reviewedAt|null isFree hasScreenshot
```

Header: eyebrow «إنستاباي», h1 «المدفوعات», subtitle
«طلبات اشتراك الطلبة في الكورسات المدفوعة، بانتظار المراجعة.»

Two `<ListControl>`s: **الحالة** (`«قيد المراجعة»` `pending` / `«اتوافق عليها»` `approved` /
`«اترفضت»` `rejected` / `«الكل»` value `''`) and **الترتيب** («الأقدم الأول» / «الأحدث الأول» /
«الأغلى الأول» / «الأرخص الأول»).

Empty (dashed, centred, `py-12`): «مفيش طلبات دلوقتي» + «أول ما طالب يبعت طلب اشتراك، هيظهر هنا.»

**Row card**, left block: student name → the record (dotted underline at rest); plan pill
«شهر» / «٣ شهور» / «سنة» / «ترم — {termTitle}»; history pill «دفع قبل كده {n} مرة» or
«أول اشتراك ليه»; accent badge «مجاني» when `isFree`; course title; then a facts line —
`{formatEGP(amountCents)} ج` · **«حوّل من: {senderPhone}»** or, when `senderPhone === null`,
«اشتراك مسجّل يدويًا» (an `adminManualSubscribe` row has no transfer to reconcile) ·
`studentPhone` · `studentEmail` · timestamp. A rejected row shows its reason in `text-err`.

Right block:
- **Screenshot thumbnail**, only when `hasScreenshot`. 64×64 `object-cover`, a plain `<img>`
  (never `next/image` — its optimizer fetches through a publicly cacheable `/_next/image` route and
  would hand a private payment proof to it) at
  `GET /api/admin/payments/submissions/{id}/screenshot`. Clicking opens a **lightbox, never a new
  tab** (a tab loses the queue's scroll position and filter): `role="dialog" aria-modal="true"`,
  `aria-label` «صورة تحويل {studentName}», black/85 backdrop, ✕ at `end-4 top-4` labelled
  `copy.admin.common.close`, Escape closes (listener mounted only while open), backdrop click
  closes, image click `stopPropagation`. **Same URL** for thumb and lightbox so the browser cache
  makes the second paint instant.
- WhatsApp **واتساب** on `studentPhone` (renders nothing when the phone is unusable).
- Approve / reject, only when `status === 'pending'`.

**Approve** `POST /api/admin/payments/submissions/{id}/approve`, empty body →
`{ id, status: 'approved', validUntil: iso|null }` (`null` for a term grant).
Solid **green** button `!bg-[oklch(0.62_0.15_150)]`, **موافقة** → **بتوافق…**. On success: toast
«اتحفظ» **and** `refreshPendingCount()`.

**Reject** `POST /api/admin/payments/submissions/{id}/reject`, body
`{ reason: string trimmed 1–400 }` → `{ ok: true }`. Danger button **رفض** opens a dialog: title
**سبب الرفض**, 3-row textarea labelled «السبب — هيتبعت للطالب زي ما هو», placeholder
«مثلاً: المبلغ في الصورة مش مطابق للباقة», footer **إلغاء** + danger **تأكيد الرفض** (disabled
while empty) → **بترفض…**.

409 on either ⇒ «الطلب ده اتراجع قبل كده». Any other error ⇒ «حصل خطأ، حاول تاني».
Pager at the bottom using the books screen's words («السابق» / «التالي» / «من»).

---

### 4.8 `/admin/transfers` — التحويلات الواردة

`payment:read` (list), `payment:review` (dismiss, ingest).
`GET /api/admin/transfers?filter={f}` → `{ rows, rowCount }`. **No paging.**
`filter` ∈ `unmatched` (**default**, the only slice needing a decision) | `matched` | `dismissed` |
`all`; junk falls back via `.catch('unmatched')`.

The ledger of money that actually landed, read off the Android handset that receives the InstaPay
notifications. `/admin/payments` answers "who is asking"; this answers "what arrived". Most of the
time the two are joined by the sender's InstaPay address with nobody reading either; what is left
for a human is the residue.

**Row**
```
id(uuid) source('notification'|'sms'|'manual') amountCents|null senderHandle|null
senderStudentName|null rawLine receivedAt
matchedSubmissionId|null matchedBookOrderId|null   // at most ONE is ever set
matchedStudentName|null matchedCourseTitle|null    // course is null for a book order
dismissedAt|null
```

Header: eyebrow «الفلوس», h1 «التحويلات الواردة», subtitle
«اللي وصل فعلاً على إنستاباي، ومين اتفتحله كورس بيه.»
One `<ListControl name="filter" label="اعرض">`: «محتاجة مراجعة» / «اتطابقت» / «اتقفلت» / «الكل».
Empty: «مفيش تحويلات هنا» + «التحويلات بتوصل هنا لوحدها من تليفون الأندرويد. لو لسه مش متظبط، الصق نص الإشعار في الخانة تحت.»

**Row card**
- Amount at `--fs-title-4` semibold mono, printed with **`formatEGPExact`** — never rounded,
  because the amount IS the identity here. `amountCents === null` ⇒ «مش مقروء».
- Source pill «إشعار إنستاباي» / «رسالة البنك» / «مكتوبة بالإيد».
- Accent badge «اتطابقت» when matched; plain badge «اتقفلت» when dismissed.
- **One sentence**, chosen in this exact order (`explain()`):
  1. `amountCents === null` → «وصل إشعار بس مقدرناش نقرا المبلغ منه — راجعه بنفسك.»
  2. `matchedSubmissionId` → «فتح {matchedCourseTitle} لـ{matchedStudentName}»
  3. `matchedBookOrderId` → «دفع طلب كتاب لـ{matchedStudentName}», or «دفع طلب كتاب» when
     `matchedStudentName === null` (guest checkout)
  4. `senderHandle === null` → «رسالة البنك مبتقولش مين حوّل — للتأكيد بس.» (an SMS names nobody
     and can therefore never approve anything)
  5. `senderStudentName !== null` → «التحويل من {name}، بس مفيش عنده طلب مستني.»
  6. else → «أول مرة نشوف العنوان ده. وافق على طلب الطالب وهنربطه بيه لوحدنا.»
- `senderHandle` shown in full, `dir="ltr"` (an admin recognising an address by eye is how the
  platform learns its first one), then the timestamp, then `rawLine` (`dir="auto"`, `break-words`).
- Action: matched ⇒ a link to `/admin/books` or `/admin/payments?status=approved` labelled with
  that screen's title; else, if not dismissed, secondary **اقفلها** →
  `POST /api/admin/transfers/{id}/dismiss` → `{ ok: true }`. Success «اتحفظ», failure
  «مقدرناش نعمل ده دلوقتي، جرّب تاني.»

**Paste box** (always visible, bottom of page)
- h2 **الصق نص الإشعارات**, hint «لو تليفون الأندرويد مش شغّال، الصق نص إشعار إنستاباي هنا — أو النص كله مرة واحدة، وكل اللي فيه هيتقرا.»
- Textarea `dir="auto"` 5 rows, placeholder «لقد استلمت 250.00 جنيه من someone@instapay»
- Button **اقرا التحويلات** (disabled while empty or busy)
- `POST /api/admin/transfers/ingest`, body `{ text: string 1–20 000, capturedAt?: iso }`.
  The 20 000-char ceiling is a whole screenshot of Live Text with room to spare, and exists so a
  misconfigured Shortcut posting a photo library's worth of text is refused rather than parsed.
- Response `{ read, created, duplicates, matched, unreadable }` → toast
  «اتقرا {read} · جديد {created} · فتح كورسات {matched} · متكرر {duplicates} · مش مقروء {unreadable}»
- The textarea **clears on success** (a repeated paste dedupes and reports "read 5, created 0",
  which reads like a failure).
- The action revalidates **both** `/admin/transfers` and `/admin/payments` — an ingest can approve
  a pending claim outright.
- The phone's own Shortcut posts to the `@Public()` `POST /api/ingest/transfers` instead.

---

### 4.9 `/admin/finance` — الاشتراكات والإيرادات

Three tabs (`FinanceTabs`, a Server Component — the caller knows which tab it is, so shipping
`usePathname` for a border colour would be the whole client runtime for a highlight):
`/admin/finance` **النظرة العامة** · `/admin/finance/subscriptions` **المشتركين** ·
`/admin/finance/expenses` **المصروفات**.

#### 4.9.1 النظرة العامة — `payment:read` / `expense:read`

`GET /api/admin/expenses/overview` → `AdminFinanceOverviewSchema`. **One fetch; the screen adds up
nothing itself** — two surfaces subtracting their own way is how «صافي الربح» ends up with two
values.

```
subscriptionRevenueCents bookRevenueCents revenueTotalCents
subscriptionRefundsCents bookRefundsCents refundsTotalCents
subscriptionNetRevenueCents bookNetRevenueCents netRevenueTotalCents
expensesTotalCents expensesByCategory[{category, amountCents}]
bookCostOfSalesCents bookCostUnknownCount bookProfitCents
bookItemsNetCents bookShippingCents netCents
months[{month('YYYY-MM'), subscriptionRevenueCents, bookRevenueCents, expensesCents,
        subscriptionRefundsCents, bookRefundsCents, netCents}]
```

Money uses **`formatEGPExact`** with a real `−` for negatives. Months are `Intl`
`{month:'long', year:'numeric'}` on `ar-EG-u-nu-latn` («أكتوبر ٢٠٢٦», Latin digits).
Zero-activity months are filtered out client-side; empty ⇒ «لسه مفيش حركة».

Header: eyebrow «الحسابات», h1 «النظرة العامة», subtitle «دخل كام، صرف كام، وفضل كام.»

**Top row** (`sm:grid-cols-3`, or `sm:grid-cols-2 lg:grid-cols-4` when refunds > 0):
**إجمالي الإيرادات** (accent) · **فلوس رجعت** rendered `− {amount}` and shown **only when
`refundsTotalCents > 0`** (a permanent «٠ ج» beside the revenue is a column of noise on the row
he reads first) · **إجمالي المصروفات** → `/admin/finance/expenses` · **صافي الربح** with context
«كل اللي دخل − اللي رجع − المصروفات». The net is deliberately **not** an accent tile: amber is the
"press this" colour and this is the one number nobody clicks.

**Second row** (`sm:grid-cols-3`): **صافي الاشتراكات** → `/admin/finance/subscriptions` ·
**صافي الكتب** → `/admin/books?status=paid` — each with context «بعد خصم {refunds} رجعت» when
that stream had refunds — and **مكسب الكتب** with
«مبيعات الكتب {items} − تكلفة النسخ {cost} = {profit}»,
«الشحن {amount} — بيتجمع من الطالب ويروح للمندوب، مش محسوب مكسب», and, when
`bookCostUnknownCount > 0`, «{n} سطر مالوش تكلفة نسخة — المكسب محسوب من غيرهم» + a link
**حدّد تكلفة النسخة**.

Standing note: «ملحوظة: مكسب الكتب بيحسب تكلفة النسخة، والمطبعة أصلاً متسجّلة في المصروفات — عشان كده الرقمين مش بيتجمعوا على بعض.»
(A print run is money that left the month the printer was paid; the cost of a *sale* is what the
copies that shipped cost to make. Subtracting invoices would show a catastrophic loss in any month
with a run and no sales.)

**المصروفات راحت فين** — per-category breakdown.
**شهر بشهر** — columns **الشهر** / **اشتراكات** / **كتب** / **مصروفات** / **رجعت** / **الصافي**.

#### 4.9.2 المشتركين — `payment:read` / `payment:review`

`GET /api/admin/finance?perPage=200&sort={s}[&status=][&plan=][&year=][&stream=]` →
`listResponse(row) & { summary }`, plus a **separate** `GET /api/admin/book-orders/summary` →
`{ revenueTotalCents, paidCount }` — a genuinely independent failure mode, never merged into the
subscription totals.

Query (`AdminFinanceQuerySchema`): `status` ∈ `active|expiring_soon|expired`; `plan` ∈
`monthly|quarterly|yearly|term|free`; `year` int ≥1; `stream` ∈ `general|languages`;
`sort` ∈ `paid_desc` (default) | `paid_asc`; `perPage` int 1–**2000** default 20 (page sends 200).

Row:
```
id(uuid, the AccessGrant id) userId studentName courseId courseTitle
plan|null termId|null termTitle|null amountCents|null paidAt|null isFree|null
validUntil|null validFrom scope('course'|'term') status renewalCount
cancelReason|null cancelReasonVisibleToStudent refundedCents
```
Summary: `{ revenueTotalCents, refundsTotalCents, netRevenueTotalCents, activeCount,
expiringSoonCount, filterCounts { plan{…}, year: Record<string,int>, stream{general,languages} } }`.

Filters, each `<ListControl>` with the bucket size appended as «{label} ({n})»:
**الحالة** («الكل» / «فعّال» / «هيخلص قريب» / «خلص») · **الباقة** («كل الباقات» / «شهري» /
«٣ شهور» / «سنوي» / «ترم» / «مجاني») · **عربي / لغات** («كل المدارس» / عام / لغات) ·
year («كل السنين» / «سنة {year}») · **الترتيب** («الأحدث أولاً» / «الأقدم أولاً»).

Tiles **إجمالي الإيرادات** · **اشتراكات فعالة** · **هتخلص خلال أسبوع**; separate section
**الكتاب الورقي — منفصل عن الاشتراكات** with **إجمالي إيرادات الكتب** and **كتب مدفوعة**.

Columns **الطالب** · **الكورس** · **الباقة** · **آخر دفعة** · **اتدفعت في** · **هتخلص في** ·
**التجديدات** · **الحالة** · **إجراءات**.
Status dots: active `oklch(0.62 0.15 150)`, expiring `--a-9`, expired `--fg-faint`; labels
«فعّال» / «هيخلص قريب» / «خلص».
A term row shows «اشتراك ترم: {termTitle}» under the course title and «طول ما الترم مفتوح» in the
expiry column; a course grant reopened open-ended shows «مفتوح — من غير تاريخ انتهاء»; a missing
payment join prints «—»; `isFree` shows the badge «مجاني» in the amount column (never summed);
`renewalCount === 0` ⇒ «—» else «اتجدد {n} مرة»; refunds ⇒ «رجع منها {amount}»; a cancelled row
shows «سبب الإلغاء: {reason}» regardless of `cancelReasonVisibleToStudent`.
Empty: «مفيش اشتراكات مدفوعة لسه» + «أول ما طلب اشتراك يتوافق عليه، هيظهر هنا.»

**Row actions** (`payment:review`)
1. **تعديل** → dialog **تعديل الاشتراك**, two independently-saved sections:
   - **المبلغ المحصّل**: **المبلغ (جنيه)** + checkbox **مجاني — متحصلش فلوس**, save **حفظ المبلغ**
     / **بيتحفظ…**. `PATCH /api/admin/finance/{grantId}/amount`, body
     `{ amountCents: int ≥0, isFree: bool }`.
   - **تواريخ الاشتراك**: **يبدأ في** + **ينتهي في** + checkbox **من غير تاريخ انتهاء**, save
     **حفظ التواريخ** / **بيتحفظ…**. `PATCH /api/admin/finance/{grantId}/dates`, body
     `{ validFrom: iso, validUntil: iso|null }`. For a `scope:'term'` row the dates form is
     replaced by «اشتراك الترم مالوش تاريخ انتهاء يتغير — بيتقفل لما الترم يتقفل بس.»
   - Close **قفل**; failure **مقدرناش نحفظ — حاول تاني**.
2. **إلغاء** → dialog **إلغاء الاشتراك بدري**. `POST /api/admin/finance/{grantId}/cancel`, body
   `{ reason: string trimmed 1–400, showToStudent: bool = false, refundCents: int ≥1|null = null }`.
   **السبب** (placeholder «مثلاً: الطالب طلب إلغاء الاشتراك») · checkbox
   **يظهر السبب ده للطالب في إشعاراته** (off by default) · switch **رجعتله فلوسه؟** with
   «سيبه مقفول لو الفلوس فضلت معاك. اللي بيتقفل عشان غش مثلاً، فلوسه ما بترجعش وما بتتخصمش من الحسابات.»
   · **رجعتله كام؟ (بالجنيه)** with the live cap «أقصى مبلغ {max} ج» · **رجوع** /
   **تأكيد الإلغاء** / **بيتلغي…** / failure **مقدرناش نلغي — حاول تاني**.
   ⚠️ Cancelling is access; only a refund moves money. The two are separate switches on purpose.

#### 4.9.3 المصروفات — `expense:read` / `expense:write`

`GET /api/admin/expenses?perPage=100[&category=][&month=]` and `GET /api/admin/books` (the book
picker, fetched server-side so the dialog never spins for a list of five).
Query: `category` ∈ the 7 below; `month` matching `/^\d{4}-(0[1-9]|1[0-2])$/`, else
«الشهر لازم يكون بالشكل YYYY-MM».
Row `{ id occurredOn('YYYY-MM-DD') category amountCents titleAr noteAr|null bookId|null
bookTitleAr|null quantity|null createdAt }`.

Categories: `filming` **تصوير** · `printing` **مطبعة** · `equipment` **أدوات ومعدات** ·
`marketing` **إعلانات** · `staff` **أجور** · `services` **خدمات واشتراكات** · `other` **حاجات تانية**.

Header eyebrow «الحسابات», h1 «المصروفات», subtitle «كل حاجة اتدفعت — تصوير، مطبعة، أدوات، وأي حاجة تانية.»
Columns **التاريخ** («٣ أكتوبر ٢٠٢٦», Latin digits) · **النوع** · **الوصف** (note on a second
line) · **الكتاب** («{title} ×{quantity}» — the count never renders separately) · **المبلغ**
(end-aligned) · actions.
Empty «مفيش مصروفات مسجّلة» + «أول ما تسجّل حاجة اتدفعت، هتظهر هنا وتتحسب في الصافي.»

Dialog **أضف مصروف** → **مصروف جديد** / **تعديل المصروف**:

| Field | Label / hint | Rule |
|---|---|---|
| `occurredOn` | **اتدفع في**, hint «الشهر اللي الفلوس خرجت فيه، مش النهاردة.» | `z.iso.date()` |
| `category` | **النوع** | one of 7 |
| `amountCents` | **المبلغ بالجنيه** | int 1 – 1 000 000 000 |
| `titleAr` | **الوصف**, placeholder «يوم تصوير استوديو» | trimmed 2–160 |
| `noteAr` | **ملاحظات (اختياري)** | trimmed ≤2000, nullable |
| `bookId` | **الكتاب (اختياري)**, empty «مش مربوط بكتاب», hint «لو ده طبعة كتاب، اختاره واكتب اشتريت كام نسخة.» | uuid nullable |
| `quantity` | **عدد النسخ** | int 1–100 000, nullable, **required whenever `bookId` is set** → «لازم تكتب اشتريت كام نسخة» on path `quantity` |

Filters **الشهر** («كل الشهور») and category («كل الأنواع»).
`POST /api/admin/expenses`, `PATCH|DELETE /api/admin/expenses/:id`.
Delete confirm «تمسح المصروف ده؟ مش هيرجع تاني.»; failures «المصروف ماتسجّلش» / «الحذف مانفعش».

---

### 4.10 `/admin/books` — طلبات الكتب (shipping queue)

`book-order:read` (list) · `book-order:ship` · `book-order:write` · `book-order:create` ·
`book:read` (the catalogue two dialogs need).
Three parallel reads: `GET /api/admin/book-orders?{q}`, `getTaxonomyOrNull()` (governorate options
for the create dialog), `GET /api/admin/books` (catalogue).

**Query** (`AdminBookOrderQuerySchema` = `ListQuerySchema` minus `dir`):
- `status` ∈ `address_only|paid|shipped|delivered|rejected|`**`deleted`**.
  ⚠️ `deleted` is a **view**, never a status: a soft-deleted order keeps whatever status it was
  hidden in (usually «مدفوعة»), which is the one thing the admin looking at that tab needs to see.
  `'all'` is screen-only (the param is omitted).
- `q` ≤120 — matches **name OR phone OR address**.
- `sort` ∈ `oldest` (default) | `newest` | `amount_desc` | `amount_asc` | `name_asc` |
  `governorate` (the courier route).
- `stream` ∈ `general|languages`; `year` int 1–3 (matched against the **book's** own year, falling
  back to the course's); `page`; `perPage` (page sends **50**).

**Tabs**, in work-flow order not enum order:
`paid` **مدفوعة** (default — the daily queue) → `shipped` **اتشحنت** → `delivered` **وصلت** →
`address_only` **بدأت ومكملتش** (a list to chase, not a list to pack) → `rejected` **مرفوضة** →
`all` **الكل** → `deleted` **المحذوفة** (rendered `border-dashed` when inactive — it is the one
list whose rows are invisible everywhere else).
The search `q` survives a tab change. Above the tabs, `BooksTabs`: **الطلبات** `/admin/books` ·
**الكتب** `/admin/books/catalog`.

**Search** — a plain GET form so the result IS the URL (shareable, and the back button walks
searches the way it walks tabs): `aria-label` «دوّر بالاسم أو الموبايل أو العنوان», placeholder
«اسم، رقم موبايل، محافظة أو شارع…», submit **دوّر**, and **امسح البحث** when a query is active.
A hidden `status` field rides along because submitting a form replaces the whole query string.

**Toolbar dropdowns** **الترتيب** / **عربي / لغات** («الكل»/«عربي»/«لغات») / **الصف**
(«كل الصفوف», then «{أولى|تانية|تالتة} بكالوريا»), plus **أضف طلب كتاب** and the export control.

**Result line** (searching, `rowCount > 0`, `role="status"`): «{n} طلب مطابق للبحث», or when the
page is capped «أول {shown} من {n} طلب مطابق — ضيّق البحث شوية».

**Empty**: no search ⇒ «مفيش طلبات دلوقتي» + «أول ما طالب يطلب كتاب، هيظهر هنا.»;
searching ⇒ «مفيش طلب مطابق لـ «{q}»» + «جرّب تدوّر في «الكل» — الطلب ممكن يكون في تبويب تاني، أو جرّب جزء من الاسم أو آخر أرقام الموبايل.»
plus a button **دوّر في الكل** → `?status=all&q={q}` (only when the tab is not already `all`).

**Row**
```
id userId|null studentName|null studentEmail|null studentPhone|null
courseId|null courseTitle|null courseYear|null courseForGeneral|null courseForLanguages|null
bookTitle items[BookOrderLine] amountCents itemsCents shippingCents discountCents
adminNote|null fullName phone altPhone
governorateCode governorateNameAr city addressStreet addressBuilding|null addressNote|null
senderPhone|null hasScreenshot status createdAt paidAt|null shippedAt|null deliveredAt|null
rejectedAt|null rejectionReason|null deletedAt|null deletionReason|null previousOrdersFromPhone
```

**Row card.** A soft-deleted row is `border-dashed`, err-tinted border, `bg-surface-2/60`, badge
**محذوف**.
- **The order's own `fullName` is the shipping truth**, always; a linked account only adds a link.
  A guest (`userId === null`) gets plain text + pill **زائر (بدون حساب)**.
- Pill «{n} كتاب — {copies} نسخة» (`items.length` and the summed quantities — they differ the
  moment somebody orders two of anything).
- Status chip, longer than the tab: «بدأ ومكملش الدفع» / «مدفوعة، لسه ماتشحنتش» / «اتشحنت» /
  «وصلت للطالب» / «مرفوضة».
- `previousOrdersFromPhone > 0` ⇒ **accent** pill «طلب قبل كده {n} مرة» — counted on the **phone**,
  because guest checkout means one person is several unlinked rows and the number is all they share.
  It is coloured rather than another grey pill: it is the one chip that changes how you take the call.
- Item lines «{title} ×{quantity} — {amount} ج», each with a `StreamBadge`.
- Address «{name} — {governorate}، {city}، {street}» + «، عمارة {building}» when present.
- Money «الكتب {items} ج · الشحن {shipping} ج · الإجمالي {total} ج», or with a discount
  «الكتب {items} ج · الشحن {shipping} ج · خصم {discount} ج · الإجمالي {total} ج».
- «ملاحظة داخلية: …» (its field hint elsewhere: «الطالب مش بيشوف الملاحظة دي.»),
  «سبب الرفض: …», «سبب الحذف: …», «موبايل تاني: …», «حوّل من: …».
- Screenshot thumbnail + lightbox at `GET /api/admin/book-orders/{id}/screenshot`, `alt`
  «صورة تحويل {student}». WhatsApp **واتساب**.

**Per-row actions**

| Button | Endpoint | Confirmation |
|---|---|---|
| **اتشحن** («بتسجّل…») | `POST /api/admin/book-orders/{id}/ship` → `{id,status:'shipped',shippedAt}` | `window.confirm` «نسجّل إن الطلب ده اتشحن؟» |
| **وصل** («بتسجّل…») | `POST /api/admin/book-orders/{id}/deliver` → `{id,status:'delivered',deliveredAt}` | «نسجّل إن الكتاب وصل للطالب؟ الطالب هيوصله إشعار إن الطلب اتسلّم.» |
| **ارفض الطلب** | `POST /api/admin/book-orders/{id}/reject`, `{reason: trimmed 3–300}` | Dialog **رفض الطلب**, hint «الطالب هيشوف السبب ده بنصه، فاكتبه بلغة يفهمها.», field **سبب الرفض** placeholder «مثلاً: التحويل ما وصلش، أو العنوان مش واضح», **ارفض** / «بيترفض…» |
| **احذف الطلب** | `DELETE /api/admin/book-orders/{id}`, `{reason: trimmed 3–300}` | Dialog **حذف الطلب**, hint «الطلب هيختفي من اللستة ومن الحسابات ومن ملف الشحن، بس مش هيتمسح من الداتابيز — تقدر ترجّعه من تبويب «المحذوفة».», field **سبب الحذف** placeholder «مثلاً: طلب مكرر، أو اتلغى في التليفون», **احذف** / «بيتحذف…» |
| **رجّعه** («بيترجّع…») | `POST /api/admin/book-orders/{id}/restore` | «نرجّع الطلب ده للّستة؟» — no reason (putting something back is not a decision that needs one) |
| **تعديل** | `PATCH /api/admin/book-orders/{id}` | see below |

Errors «حصل خطأ، حاول تاني»; already-done «الطلب ده اتشحن قبل كده» / «الطلب ده اتسجّل إنه وصل قبل كده»;
per-action «مقدرناش نرفض الطلب — نحاول تاني» / «مقدرناش نحذف الطلب — نحاول تاني» /
«مقدرناش نرجّع الطلب — نحاول تاني».

**رفض vs حذف are different things.** Rejection is a decision the student sees (the order stays in
the list as «مرفوضة» and the reason reaches them). Deletion is administrative (the row disappears
from every screen, from the accounts and from the packing file; the reason is for the admin alone).
Both need a written reason, and both use a Dialog with a textarea — never `window.confirm`, which
cannot take text.

**Edit dialog** (**تعديل الطلب**): **الكتب** with **ضيف كتاب** (picker headed **اختار من الكتب**)
/ **ضيف سطر من غير كتالوج** (**سطر جديد**) / **شيل السطر**; per line **اسم الكتاب**,
**سعر النسخة (ج)**, **العدد**; **الشحن (ج)** (hint «مرة واحدة على الطلب كله. اكتب صفر لو الشحن مجاني.»);
**خصم (ج)**; **الإجمالي**; **ملاحظة داخلية**. Submit **احفظ التعديل** / «بيتحفظ…».
At least one line, else «لازم يفضل كتاب واحد على الأقل في الطلب». Failure
«مقدرناش نحفظ التعديل — نحاول تاني».

**Bulk shipping.** Checkboxes render **only on `paid` and `shipped` rows** (anything else the batch
could only skip); each `aria-label` «حدّد طلب {name}». The bar only appears once something is
selected.
- **حدّد اللي في المدى ({n})** with hint «بيحدّد نفس الطلبات اللي في ملف التصدير بالتواريخ دي — عشان تشحنهم مرة واحدة.»
  — the `{n}` is in the label, not a tooltip, because it is the number the admin checks against the
  sheet in his hand *before* pressing ship.
- **محدّد {count}**, **إلغاء التحديد**, «بيتنفّذ…», **حدّد**
- **اشحن المحدد** → `POST /api/admin/book-orders/ship` (**declared before `:id/ship`** so the param
  route does not swallow it). Body `{ ids: uuid[1..100], whatsapp: bool = false }`.
- **اتسلّم** → `POST /api/admin/book-orders/deliver`, same body.
- Checkbox **ابعت واتساب كمان** — **off by default**; the platform message is the notice, this is
  a second copy that leaves the platform.
- Confirms: «هيتشحن {count} طلب، وكل طالب فيهم هتوصله رسالة على المنصة إن كتابه اتشحن. تمام؟» /
  «هيتشحن {count} طلب، وكل طالب فيهم هتوصله رسالة على المنصة **وعلى واتساب**. تمام؟» /
  «هتعلّم {count} طلب إنهم اتسلّموا. تمام؟»
- Response `{ rows: [{ id, outcome, fullName, reason|null }], succeeded, noticeFailed, skipped }`,
  `outcome ∈ shipped|delivered|notice_failed|skipped`.
- Toasts «اتشحن {count}» and, for skips, **names not a count**: «اتخطّينا: {names}».

**Export** `GET /api/admin/book-orders/export?status={s}&from=&to=`, schema
`{ status: filter, from: date|null, to: date|null }`. Range fields **من** / **لـ** (both optional;
empty = the whole tab). Button label is dynamic **تصدير: {tabLabel}**, hint
«بيصدّر كل الطلبات في التبويب المفتوح دلوقتي — جاهز يتبعت لشركة الشحن والمطبعة.»
**Hidden entirely on the `all` tab** — `all` has no meaning for a spreadsheet handed to a courier.

**Create dialog** **أضف طلب كتاب** → **طلب كتاب جديد**, `POST /api/admin/book-orders`
(`book-order:create`), `AdminCreateBookOrderSchema`:
```
courseId?: uuid  XOR  items?: AdminBookOrderLines
     // exactly one, else «الطلب لازم يبقى إما كتاب كورس واحد أو سلة كتب — مش الاتنين»
shippingCents?: int 0..10_000_000     // 0 waives delivery; omitted = charge the current fee
discountCents?:  int 0..10_000_000
adminNote: trimmed ≤1000 | null = null
fullName: trimmed 2..120          «الاسم الكامل مطلوب»
phone:    egyptianPhone           «رقم الموبايل مطلوب»
altPhone: egyptianPhone           «رقم موبايل تاني مطلوب للتواصل»   (REQUIRED)
governorateCode: len 2            «لازم نحدد المحافظة»
city:            trimmed 1..100   «المدينة مطلوبة»
addressStreet:   trimmed 1..200   «اسم الشارع مطلوب»
addressBuilding: trimmed ≤60 | null = null
addressNote:     trimmed ≤300 | null = null
paid: boolean
senderPhone: egyptianPhone | null = null   «رقم المحوّل منه غير صالح»
screenshotKey: string 1..255 | null = null
```
Field labels are **aliased from the student flow** (`copy.student.bookOrder.*`) so one field has
one wording on both surfaces. Admin-only additions: **الكورس**, read-only «سعر الكتاب: {amount} ج»,
radios **مدفوع بالفعل** (hint «العميل حوّل بالفعل — الطلب هيتسجل «مدفوعة» على طول، من غير الخطوتين.»)
/ **لسه مادفعش**, **حوّل من (اختياري)**, **صورة التحويل (اختياري)** (hint
«لو معاك صورة التحويل ممكن ترفعها هنا — مش شرط.»), submit **حفظ الطلب** / «بيتسجّل…».
Only `isActive` catalogue titles are offered; none ⇒ «مفيش كورسات ليها كتاب مسعّر دلوقتي».
Failures «مقدرناش نسجل الطلب — نحاول تاني» / «مقدرناش نرفع الصورة — نحاول تاني».

---

### 4.11 `/admin/books/catalog` — الكتب

`book:read` / `book:write`, plus `settings:write` for the delivery fee.
Four parallel reads: `GET /api/admin/books`, `GET /api/admin/settings`,
`GET /api/admin/taxonomy/subjects`, `GET /api/admin/courses`.

h1 **الكتب**, subtitle «اللي معروض في قسم الكتب — الأسعار والأغلفة والمخزون.»
Empty «مفيش كتب في الكتالوج» + «ضيف أول كتاب، وهيظهر على طول في /books.»
**كتاب جديد** → dialog **كتاب جديد** / **تعديل الكتاب**.

Columns **الكتاب** · **المادة** · **الترم** · **السعر** · **المخزون** · **اتطلب** («{n} نسخة») ·
**المدارس** · **يظهر فين**.
`stock === null` ⇒ **مش بنعد** (not the same as zero); `0` ⇒ **خلص**.
Visibility chip **معروض** / **مخفي**; placement chip **الرئيسية** / **الكورس** / **قسم الكتب بس**;
terms **الترم الأول** / **الترم التاني** / **السنة كاملة**.

Row:
```
id slug titleAr subtitleAr|null subjectId|null subjectNameAr|null year|null term
courseId|null courseTitle|null forGeneral forLanguages showOnLanding showOnCourse
priceCents unitCostCents|null comparePriceCents|null coverKey|null descriptionAr|null
pageCount|null isActive stock|null sortOrder orderedCount updatedAt
```

**Form**

| Field | Label / hint | Rule |
|---|---|---|
| `slug` | **الرابط**, hint «بيظهر في /books. من غير مسافات ولا نقط ولا شرطة مائلة.» | trimmed 2–80, no `/ . whitespace` → «الرابط ما ينفعش يحتوي على مسافة أو نقطة أو شرطة مائلة» |
| `titleAr` | **اسم الكتاب** | trimmed 2–160, «اسم الكتاب مطلوب» |
| `subtitleAr` | **سطر تحت الاسم (اختياري)** | ≤200 nullable |
| `subjectId` | **المادة**, empty «من غير مادة — يتحط في «كتب عامة»» | uuid nullable |
| `year` | **الصف**, empty «من غير صف» | int 1–3 nullable |
| `term` | **الترم** | `first|second|full`, default `full` |
| `courseId` | **الكورس المرتبط (اختياري)**, empty «من غير كورس», hint «لو الكتاب ده هو كتاب كورس، اربطه بيه — الكورس الواحد ليه كتاب واحد بس.» | uuid nullable |
| `priceCents` | **السعر (ج)** | int 0 – 10 000 000 |
| `comparePriceCents` | **السعر قبل الخصم (ج، اختياري)**, hint «لازم يكون أعلى من السعر الحالي، وإلا الخصم يبقى كذب.» | `> priceCents` else «السعر قبل الخصم لازم يكون أعلى من السعر الحالي» |
| `unitCostCents` | **تكلفة النسخة (ج، اختياري)**, hint «النسخة الواحدة بتكلّفك كام. منها بيتحسب «مكسب الكتب» في الحسابات — سيبها فاضية لو مش عارف.» | nullable |
| `coverKey` | **الغلاف** | media key nullable |
| `descriptionAr` | **وصف (اختياري)** | ≤2000 |
| `pageCount` | **عدد الصفحات (اختياري)** | int 1–5000 |
| `stock` | **المخزون (اختياري)**, hint «سيبه فاضي لو مش بتعد. صفر معناه خلص، والكتاب يفضل ظاهر ومش قابل للطلب.» | int 0–100 000 nullable |
| `sortOrder` | **الترتيب** | int 0–9999 default 0 |
| `isActive` | **معروض في قسم الكتب** | bool default true |
| `forGeneral` / `forLanguages` | stream radios, hint «الكتاب ده لمدارس عربي ولا لغات ولا الاتنين — بيظهر جنب اسمه في الطلبات وفي ملف الشحن.» | at least one true → «لازم تحدد الكتاب لمدارس عام ولا لغات ولا الاتنين» |
| `showOnLanding` / `showOnCourse` | **يظهر فين** → **في الصفحة الرئيسية** / **في صفحة الكورس**, hint «دي أماكن الإعلان بس. الكتاب بيفضل معروض وقابل للطلب في /books في كل الحالات — «معروض في قسم الكتب» فوق هو اللي بيقفله خالص.»; with no course linked the second checkbox is replaced by «اربط الكتاب بكورس الأول عشان يظهر في صفحته.» | bool |

**احفظ** / «بيتحفظ…» / «مقدرناش نحفظ الكتاب — نحاول تاني»; **امسح** with confirm
«نمسح الكتاب ده؟ الطلبات اللي اشترته هتفضل زي ما هي.» and failure «مقدرناش نمسح الكتاب — نحاول تاني»;
toggle **اخفيه** / **اعرضه**.
`POST /api/admin/books`, `PATCH|DELETE /api/admin/books/:id`.

**Shipping fee panel**: **سعر الشحن**, hint «بينضاف مرة واحدة على كل طلب، مهما كان عدد الكتب.»,
field **الشحن (ج)**, **احفظ**, failure «مقدرناش نحفظ سعر الشحن — نحاول تاني».
`PATCH /api/admin/settings/store`, body `{ shippingCents: int 0–50 000, default 6 500 }`.

---

### 4.12 `/admin/homework` — الواجبات

`homework:read` (list) · `homework:review` (verdict) · `lesson:write` (create).
Two parallel reads: `GET /api/admin/homework?filter={f}` → `listResponse(AdminHomeworkRow)`, and
`GET /api/admin/courses` parsed narrowly as `{id, title}` only (parsing the full admin shape would
let an unrelated field's change break this screen).
`filter` ∈ `pending` (**default**) | `accepted` | `needs_work` | `all`, parsed through the schema.

h1 **الواجبات**, lead «الحلول اللي الطلبة رفعوها. افتح أي واحد، شوف الصور، وابعت رد بضغطة.»
Filter is a **pill-tab row**: **مستني مراجعة** / **مقبول** / **رجع للطالب** / **الكل**.
Empty «مفيش حلول مستنية دلوقتي.» + «أول ما طالب يرفع حل واجب، هتلاقيه هنا.»

Row `{ id status('submitted'|'accepted'|'needs_work') attempt imageCount imagesPurged
grade|null submittedAt studentId studentName lessonId lessonTitle courseId courseTitle }`.

Card: a status well (Clock3 / CheckCircle2 / RotateCcw; tones accent / ok / warn), student name →
the record (`relative z-10`), «المحاولة {attempt}» when > 1, lesson title, course title,
`Images` + «{imageCount} صورة», timestamp `dd/MM HH:mm` (Latin digits), «{grade} / 100» in `--ok`
when graded. The whole card is a **stretched link** to `/admin/homework/{id}` via
`after:absolute after:inset-0` on the trailing chip, whose label is the status:
**مستني مراجعة** / **اتقبل** / **رجع للطالب**. `submitted` rows get `border-accent/40`.

**«أضف واجب» dialog** — the one thing this screen could not do before (setting an exercise was four
clicks deep in the course editor).
Trigger **أضف واجب** → **واجب جديد**; **الكورس** (placeholder «اختار الكورس») → on change,
`GET /api/admin/courses/:id` **once**, flattened into a lesson list (never one request per lesson).
States «بنجيب المحاضرات…» / «الكورس ده لسه مفيهوش محاضرات» / «مقدرناش نجيب محاضرات الكورس ده».
**المحاضرة** (placeholder «اختار المحاضرة»). Two warnings after picking:
- «المحاضرة دي عليها واجب بالفعل — اللي مكتوب تحت هو نصّه، وأي تعديل هيستبدله.» (the write is an
  upsert and the field opens pre-filled)
- «المحاضرة دي لسه مش منشورة — الواجب مش هيوصل لحد غير لما تنشرها.» (a published homework on an
  unpublished lecture reaches nobody, and nothing else on the screen would say so)
Then the `HomeworkWriteSchema` fields. Buttons **أضف الواجب** / **حدّث الواجب** / «بنحفظ…» /
**إلغاء**. `PUT /api/admin/lessons/{lessonId}/homework` → `{ lessonId }`.
Toasts «الواجب اتنشر للطلبة» / «الواجب اتحفظ — لسه مقفول عن الطلبة» / «مقدرناش نحفظ الواجب».

---

### 4.13 `/admin/homework/[id]` — one submission

`homework:review`. `GET /api/admin/homework/{id}` via `adminGetOrNotFound` (a stale id must read as
«مش موجود», not «حصل خطأ»).
Detail = row + `prompt, imageIds[uuid], reviewNote|null, reviewedAt|null, studentPhone|null,
courseSlug, suggestions{accepted[], needsWork[]}`.

Back link **الواجبات**. Header card: student name (`--fs-title-3`), lesson, course,
«اتسلّم {date}» (dd/MM/yyyy HH:mm), «المحاولة {n}» when > 1, «{n} صورة».

**Four ways out, as buttons and never behind a «⋯»** (a queue whose next action is behind a menu is
worked at half speed):
1. **ملف الطالب** → `/admin/students/{studentId}`
2. the lecture → `/admin/courses/{courseId}` — **the admin editor**, not the student player, which
   is enrolment-gated and would redirect the instructor to `/library`
3. **افتح المحادثة** (hint «لو عايز تبعتله صوت أو تكمّل كلام») → the inbox thread. The voice
   recorder lives there, not here; a second implementation of the hardest thing on that screen, on
   a page whose job is a verdict, would be wrong.
4. WhatsApp on `studentPhone`

**المطلوب في الواجب** renders `prompt`; when the homework was removed from the lecture,
«الواجب اتشال من المحاضرة، والحل ده فضل.»

**Images** — `GET /api/admin/homework/images/{imageId}` per image. Gone ⇒
«الصور اتمسحت بعد المراجعة — التسليم نفسه لسه متسجّل.» or, past the 30-day retention
(`HOMEWORK_IMAGE_RETENTION_DAYS = 30`), «الصور اتمسحت بعد ٣٠ يوم — التسليم نفسه لسه متسجّل.»

**Review form**
- Two big targets, not a `<select>`: **مقبول** and **يفكّر تاني ويبعته**. Default `accepted`.
- **اختار من دول** — canned notes from `suggestions.accepted` / `.needsWork`; clicking one fills
  the message.
- **الرد اللي هيوصله** — textarea. **Submit is disabled while `message.trim().length < 2`.**
- **الدرجة من ١٠٠** — rendered **only when the decision is «مقبول»**, hint
  «اختياري — سيبها فاضية لو مش بتدّي درجة على الواجب ده.»
- **ابعت الرد** / «بنبعت…»; failure «مقدرناش نبعت الرد. نجرّب تاني.»
- Standing warning under accept: «أول ما تقبله، صور الحل بتتمسح خالص وبيفضل إنه سلّم والدرجة والرد.»
- `POST /api/admin/homework/{id}/review` — **answers 204**, do not parse a body. Body:
  ```
  decision: 'accepted' | 'needs_work'
  grade: number 0..100 | null = null    // refine «الدرجة تتحط مع القبول بس» when decision ≠ accepted
  message: string trimmed 2..1000
  ```
- A previous note renders under **اللي بعتّه**. Verdicts elsewhere read **اتقبل** / **رجع للطالب**
  / **مستني مراجعة**.

---

### 4.14 `/admin/attempts` — المحاولات

`attempt:read` / `attempt:unlock`.
`GET /api/admin/attempts?take={perPage+1}&skip={(page-1)*perPage}[&q=][&state=][&quizId=]` →
**a bare array**. The page asks for `perPage + 1` so the client knows whether a next page exists
without the API computing a total.

Filters mirror `AttemptAdminService.listAttempts` exactly (`quizId`, `userId`, `state`, `q`,
`take`/`skip`). **There is no sort** — the service has a fixed `orderBy: { startedAt: 'desc' }`, so
no column declares `enableSorting` (a sortable header over data that never re-sorts is worse than
none). URL state: `page` (1), `perPage` (20), `q` (throttled 400 ms), `state`, `quizId`.

| id | Header | Cell |
|---|---|---|
| `studentName` | **الطالب** | |
| `quizTitle` | **الامتحان** | title + «المحاولة {n}» in mono underneath |
| `state` | **الحالة** | Badge (below) |
| `score` | **الدرجة** | `null` ⇒ «—», else tabular |
| `startedAt` | **وقت البدء** | `toLocaleString('ar-EG')` |
| `deadlineAt` | **الموعد النهائي** | `null` ⇒ «—» |
| `actions` | **إجراءات** | `AttemptActions` |

| state | Label | Tone |
|---|---|---|
| `in_progress` | شغال | accent |
| `overdue` | اتأخر | warn |
| `submitted` | اتسلّم | neutral |
| `pending_review` | محتاج تصحيح | accent |
| `abandoned` | اتلغى | neutral |

Actions (`attempt:unlock`): **ارجّع المحاولة للطالب** →
`POST /api/admin/attempts/{id}/reopen`, enabled only for `submitted` / `pending_review`, confirm
«نرجّع المحاولة دي للطالب؟»; **امنح وقت إضافي** → `POST /api/admin/attempts/{id}/extra-time` with
**ثواني إضافية** (the quiz-scoped variant labels it **دقايق إضافية**); **امنح محاولة إضافية** →
`POST /api/admin/quizzes/{quizId}/students/{userId}/extra-attempt`, confirm
«امنح الطالب ده محاولة إضافية؟». Also **فتح المحاولة**.
Toasts «اتنفّذ» / «مقدرناش ننفّذ الإجراء — نحاول تاني». Search «دور بالاسم...»; the quiz-scoped
screen adds «الكل» and **محتاج تصحيح بس**.

---

### 4.15 `/admin/analytics` — التحليلات

`analytics:read` throughout. Sub-nav (underline style, `border-b border-line`):
**نظرة عامة** `/admin/analytics` (exact) · **تحليل الدروس** `/admin/analytics/lessons` ·
**تحليل الطلبة** `/admin/analytics/students`.

Shared filter bar: **الفترة** — «آخر أسبوع» (7) / «آخر شهر» (30, **default**) / «آخر ٣ شهور» (90) /
«آخر سنة» (365); anything else in the URL is **snapped to 30** by `safeWindow()` rather than sent
to an API that would reject the whole request. **الكورس** — «كل الكورسات» + `GET /api/admin/courses`.
**تنزيل CSV**, hint «ملف UTF-8 بيفتح في إكسل وفي pandas على طول.»

#### 4.15.1 Overview

`GET /api/admin/analytics/overview?days={7|30|90|365}[&courseId=]`:
```
students { total, enrolled, activeLast7, activeLast30, newLast30 }
video    { watchers, eligible, watchRate|null, watchHours, lessonsOpened, lessonsCompleted,
           avgCompletion|null }
quiz     { quizzes, attempts, participants, participationRate|null, meanScore|null,
           medianScore|null, passRate|null, meanDurationSeconds|null, medianDurationSeconds|null }
scoreBuckets[{bucket 1..10, n}]  completionBuckets[{bucket 1..10, n}]
gradeBands[{band 'a'|'b'|'c'|'d'|'f', n}]
durationBuckets[{upperSeconds|null, n}]  // DURATION_BUCKETS_SECONDS 60,180,300,600,900,1800,3600
engagement[{segment 'both'|'videoOnly'|'quizOnly'|'neither', n}]
daily[{date, watchMinutes, attempts, activeStudents}]
byYear[{year, students, avgCompletion|null, meanScore|null}]
byGovernorate[{code, nameAr, students, meanScore|null}]
```

**Four bands**, each with a heading, a lead and a "go there" link worded **as the destination**
(never «اعرف أكتر») because every number here counts rows living on another screen:

| Band | Heading — lead | Link |
|---|---|---|
| Who | **مين موجود** — «الطلبة المشتركين، ومين منهم لسه بيذاكر فعلًا.» | **تحليل الطلبة** |
| Watch | **شافوا الفيديوهات؟** — «كل رقم هنا مقسوم على عدد المشتركين النشطين، والمقام مكتوب جنبه.» | **تحليل الدروس** |
| Quiz | **حلّوا الامتحانات؟** — «الدرجات كلها نسبة من مجموع كل امتحان لوحده — عشان المقارنة تبقى ممكنة.» | **المحاولات** |
| Breakdown | **التفاصيل** — «نفس الأرقام مقسّمة — بالصف، بالمحافظة، وعلى مدار الوقت.» | **بيانات الطلبة** |

Metric labels: إجمالي الطلبة · مشتركين في كورس · نشطين آخر أسبوع · نشطين آخر شهر · جداد آخر شهر ·
مشتركين في الكورس (the denominator, stated out loud) · المشاهدة · اللي فتحوا فيديو · نسبة اللي شافوا ·
ساعات المشاهدة · دروس اتفتحت · دروس اتخلصت · متوسط نسبة المشاهدة ·
الطلبة حسب نسبة اللي شافوه من الدرس · الامتحانات · امتحانات فيها محاولات · المحاولات · اللي حلّوا ·
نسبة اللي حلّوا · متوسط الدرجة · وسيط الدرجة · أعلى درجة · نسبة النجاح · متوسط زمن الحل ·
وسيط زمن الحل · توزيع الدرجات · النشاط على مدار الوقت · دقايق مشاهدة · محاولات امتحان ·
طلبة نشطين · حسب الصف · حسب المحافظة · الصف {n}.

Chart hints: «كل عمود = الطلبة اللي درجتهم في الشريحة دي من ١٠٠٪.» and
«المحاولات اللي في آخر عمود اتساب فيها الامتحان مفتوح — درجتها أقل حاجة يعتمد عليها.»

**Grade bands** (`GRADE_BAND_FLOOR` a .85 / b .75 / c .65 / d .50 / f 0):
«امتياز · ٨٥٪ فأكتر» / «جيد جدًا · ٧٥–٨٥٪» / «جيد · ٦٥–٧٥٪» / «مقبول · ٥٠–٦٥٪» /
«راسب · أقل من ٥٠٪»; short: امتياز / جيد جدًا / جيد / مقبول / راسب.
Hint: «الحدود ثابتة (٨٥ / ٧٥ / ٦٥ / ٥٠) عشان المقارنة بين امتحان وامتحان تبقى ممكنة — النجاح والرسوب بيتحسبوا بنسبة نجاح كل امتحان لوحدها.»

**Engagement** — **الطلبة عملوا إيه**, hint «الأربع شرايح دي بتجمع على عدد المشتركين بالظبط — مفيش طالب في اتنين.»
Segments «شاف الفيديو وحلّ الامتحان» / «شاف الفيديو بس» / «حلّ الامتحان بس» / «مافتحش حاجة».

Chart chrome: **اعرض الأرقام** / **اخفي الأرقام**, table `aria-label` **أرقام الرسم**, columns
**البند** / **العدد** / **النسبة**, empty «مفيش بيانات في الفترة دي».

**Number conventions — reproduce exactly**
- A rate with **no denominator** prints «—», **never «٠٪»** (that is a claim we cannot make).
- A real rate that rounds to nothing prints «أقل من ١٪».
- Its twin at the top prints «أكتر من ٩٩٪» — not-quite-everyone must not read as everyone.
- «من {n}» states the denominator inline.
- Duration shorthands «د» / «س» / «ث», «أقل من دقيقة», «أكتر من {n}», «{from}–{to}».

#### 4.15.2 `/admin/analytics/lessons`

`GET /api/admin/analytics/lessons[?courseId=]` → `LessonAnalyticsRow[]`, plus
`GET /api/admin/courses`. URL state `courseId`, `q` (throttled 400 ms).
CSV `GET /api/admin/analytics/export/lessons.csv`.
Heading **كل درس بالأرقام**. Columns **الدرس** · **الكورس** · **الوحدة** · **فتحوه** ·
**نسبة الفتح** · **خلّصوه** · **متوسط المشاهدة** · **ساعات** · **حلّوا الامتحان** ·
**متوسط الدرجة** · **نسبة النجاح** · **وسيط الزمن**; no quiz ⇒ «مفيش امتحان»; row action
**فتح التحليل**.
Row adds `lessonId title courseId courseTitle sectionTitle position kind hasVideo
videoDurationSeconds|null eligible opened openRate|null completed completionRate|null
avgCompletion|null watchHours avgWatchSeconds|null quizId|null quizTitle|null quizAttempts
quizParticipants quizParticipationRate|null quizMeanScore|null quizMedianScore|null
quizPassRate|null quizMedianDurationSeconds|null`.

#### 4.15.3 `/admin/analytics/lessons/[lessonId]`

`GET /api/admin/analytics/lessons/{lessonId}` (`adminGetOrNotFound`) →
`{ summary, completionBuckets, scoreBuckets, gradeBands, durationBuckets, engagement,
students: LessonStudentRow[] }`.
Roster **الطلبة في الدرس ده**, hint «كل المشتركين في الكورس هنا — حتى اللي مافتحوش الدرس خالص.»
Columns **الطالب** · **الصف** · **المحافظة** · **مشاهدة** · **نسبة المشاهدة** · **محاولات** ·
**أعلى درجة** · **آخر درجة** · **زمن الحل** · **آخر مرة**; never ⇒ «ولا مرة»; not started ⇒
«مافتحوش».
Roster CSV `GET /api/admin/analytics/lessons/{lessonId}/roster.csv`.
Links **فتح الكورس** / **فتح الدرس** / **تحليل أسئلة الامتحان** / **محاولات الامتحان ده**.
Row `{ userId fullName year|null governorateNameAr|null watchedSeconds completion state openCount
lastSeenAt|null attempts bestScore|null lastScore|null passed|null quizSeconds|null }`.

#### 4.15.4 `/admin/analytics/students` and `[userId]`

List: `GET /api/admin/analytics/students?{params}` → `listResponse(StudentAnalyticsRow)`, plus
`GET /api/admin/courses`. URL state `page` (1), `perPage` (**25**), `q` (throttled), `year[]`,
`courseId`, `sort` (default `lastActiveAt`), `dir` (default `desc`).
`STUDENT_ANALYTICS_SORTS` = `fullName | lessonsCompleted | watchHours | avgCompletion | attempts |
meanScore | passRate | lastActiveAt`. CSV `GET /api/admin/analytics/export/students.csv`.
Heading **كل طالب بالأرقام**, search «دور بالاسم...», pager **الصفحة اللي قبلها** /
**الصفحة اللي بعدها**, columns **الطالب** · **الصف** · **المحافظة** · **كورسات** ·
**دروس خلّصها** · **متوسط درجاته** · **آخر نشاط**, row action **فتح الملف**.
Row `{ userId fullName year|null governorateNameAr|null enrollments lessonsOpened lessonsCompleted
avgCompletion|null watchHours quizzesTaken attempts meanScore|null bestScore|null passRate|null
medianQuizSeconds|null lastActiveAt|null }`.

Detail: `GET /api/admin/analytics/students/{userId}` (**`adminGetOrNull`** here — on `null` the
page falls back to `GET /api/admin/students/{userId}` just to render a name and
**فتح صفحة الحساب**):
```
summary: StudentAnalyticsRow
cohort: { avgCompletion|null, meanScore|null, passRate|null, medianQuizSeconds|null }
courses[]  { courseId title lessons opened completed avgCompletion|null watchHours }
lessons[]  { lessonId lessonTitle courseId courseTitle state completion|null watchedSeconds
             openCount lastSeenAt|null completedAt|null completedVia|null }
attempts[] { attemptId quizId quizTitle lessonTitle|null attemptNo state score|null passed|null
             seconds|null submittedAt|null }
devices    { logins distinctDevices byType[{type,logins,devices}] lastLoginAt|null
             recent[{id deviceName deviceType loggedInAt lastActiveAt|null revoked}]
             clearedByBan }
scoreBuckets, gradeBands, daily
```
Labels **ملف الطالب التحليلي** · **مقارنة بالمتوسط العام** / **المتوسط العام** /
«فوق المتوسط بـ {n}» / «تحت المتوسط بـ {n}» / «زي المتوسط» · **الكورسات** · **كل محاولاته**
(columns **الامتحان** / **المحاولة** / **الحالة** / **الدرجة** / **اتسلّمت**).
Attempt states: `in_progress` **شغّال عليها** · `overdue` **اتأخر** · `submitted` **اتسلّمت** ·
`pending_review` **محتاجة تصحيح** · `abandoned` **اتلغت**.
Progress states: `not_started` **مافتحوش** · `in_progress` **لسه بيتفرّج** · `completed` **خلّصه** ·
`passed` **نجح** · `failed` **رسب**.
Completed via: `auto` **تلقائيًا** · `manual` **بنفسه** · `dwell` **بعد قراية الدرس**.
Record: **سجل الطالب** / «كل حاجة عملها: شاف إيه، قعد قد إيه، ودخل أنهي امتحانات.» ·
**الدروس اللي فتحها** / «مرتّبة بالأحدث. الدرس اللي مافتحوش خالص مش موجود هنا.» · column **فتحه**
+ unit «مرة».

**Devices** — ⚠️ a wording rule the copy table enforces: these rows are **per-LOGIN** and nothing
joins them to a lesson, so every string says «بيدخل من», **never** «اتفرّج من».
Heading **بيدخل من أنهي أجهزة**, hint «ده جهاز الدخول للحساب. مابنعرفش الدرس نفسه اتشاف من أنهي جهاز.»
Empty **مافيش أجهزة متسجلة** — and, when `clearedByBan`, the *different* fact
**الأجهزة اتمسحت لما الحساب اتحظر** (banning DELETES device rows, so an empty list on a banned
account means we erased them, not that he never signed in).
Two counts, never one: «{n} جهاز مختلف» and «دخل {n} مرة», plus «{n} جهاز» under a type's bar.
Also **آخر مرات الدخول**, **آخر دخول**, «اتقفل», columns **الجهاز** / **دخل**; types
**كمبيوتر** / **موبايل** / **تابلت** / **جهاز غير معروف**.

---

### 4.16 `/admin/inbox` — صندوق الوارد

`conversation:read` / `conversation:reply` / `conversation:close`.
Tabs (`aria-label` «أقسام صندوق الوارد»): **المحادثات** `/admin/inbox` · **أسئلة الطلبة**
`/admin/inbox/questions`.

`GET /api/admin/conversations?filter={f}&sort={s}` → `listResponse(AdminConversationRowSchema)`.
- `filter` ∈ `unread` (**default**) | `open` | `answered` | `closed` | `all`. ⚠️ «غير مقروءة» is
  **not** «محتاجة رد»: opening a thread marks it read; only writing an answer marks it answered.
  A question he read and decided needs no reply leaves the first tab and stays on the second.
- `sort` ∈ `newest` (default) | `oldest` — «مين مستني من زمان» is the thread a newest-first list
  buries at the bottom.
- **No `scope` param any more**: automated outreach moved to `/admin/outreach`. The exception baked
  into `INBOX_WHERE` is that an outreach thread a student **answered** is a conversation and
  appears here like any other.

Header: eyebrow «الوارد», h1 «صندوق الوارد», subtitle «أسئلة الطلبة والزوار — بس اللي حد كتبها بإيده.»,
then one line «الرسايل اللي المنصة بتبعتها أوتوماتيك مش هنا —» + link **رسايلي للطلبة**.
Two `<ListControl>`s: **اعرض** («غير مقروءة» / «محتاجة رد» / «اتردّ عليها» / «مقفولة» / «الكل») and
**الترتيب** («الأحدث حركة» / «الأقدم حركة»).
Empty «مفيش رسايل جديدة.» + «كل الرسايل مقروءة. تاب «الكل» فيه المحادثات القديمة.»

**Row card** — a plain container with a **stretched link** (the «المحادثة» button carries
`after:absolute after:inset-0`) so the whole card opens the thread while the name stays its own
link on `relative z-10`; an `<a>` inside an `<a>` is invalid HTML browsers resolve by dropping one.
`unreadForAdmin` ⇒ `border-accent/40`.
- Avatar well, three glyphs / three tints: `origin === 'outreach'` → `Send` on accent/20;
  `isGuest` → `UserRound` on the ember tint; otherwise `MessageSquareText` on accent/12.
- Name → the record when `userId !== null`, with a **dotted underline at rest** (half the names are
  links and half are not, and hover cannot tell them apart on a phone). A guest is plain text.
- Status chip: `open` amber `bg-accent text-[#1A1206]`, `answered` green tint, `closed` bordered
  neutral. Labels **محتاجة رد** / **اتردّ عليها** / **مقفولة**; **unread outranks answered** (a
  thread he replied to and the student then wrote back on is open again).
- Badges **رسالة منك** (outreach), **وصل رد** (an outreach thread the student answered — the ONLY
  reason an automated thread is on this screen), **زائر** / **طالب**.
- «وصل لهنا من:» + `entryPath` crumbs joined with ` ← ` (assistant node ids resolved to Arabic).
- Preview, `line-clamp-2`, prefixed **إنت:** when `previewAuthor === 'admin'` (otherwise a row he
  already replied to reads as a student saying something unanswered).
- Guest phone with a `Phone` icon, mono.
- Timestamp (`dateStyle:'short', timeStyle:'short'`, Latin digits) + the amber **المحادثة** button.

Column names, where the list is rendered as a table: **مين** / **السؤال** / **إمتى** / **الحالة**.

---

### 4.17 `/admin/inbox/[id]` — the thread

`GET /api/admin/conversations/{id}` (`adminGetOrNotFound`). **The GET itself marks the thread read
server-side** — there is no separate "mark read" call for a client to forget.

**Header card**: avatar well, name (link when `userId`), status chip, **زائر** / **طالب**, then
**one badge per course** the student holds — never a single «مشترك», because he is answering about
a *specific* course and two students both reading «مشترك» can need opposite answers. Badge text is
the course title, `title` attribute «لحد {date}» or «مبينتهيش», and ` · «بالإيد»` is appended when
`source === 'admin'` so a hand-issued course is never mistaken for a paid one on the screen where
the answer is decided. `courses === null` (a guest) renders neither badge; `courses === []` renders
**مش مشترك**.
`<dl>`: **وسيلة التواصل** (guest's typed number or student's account phone; «مفيش رقم» when absent)
and the entry path. Button **مراسلته على واتساب** (`waMeHref` returns `null` with no number and the
button is then not rendered at all — never a bare `https://wa.me/`). Name link title
**فتح الملف الكامل**.

**Assistant transcript card**: **نص المحادثة مع المساعد الآلي**, note
«ده اللي اتقال قبل ما السؤال يتحوّل — مش كلام مكتوب لك.», turn labels **الطالب** / **المساعد**,
and, when older turns were dropped, «أول المحادثة اتشال عشان الطول — ده آخر جزء منها.»
⚠️ **The wire format is marks, not Arabic**, exactly so re-wording a label cannot make stored rows
unparseable: first line `🤖💬`, turn prefixes `🙋 ` (user) / `🤖 ` (assistant), `⋯` where turns were
dropped, every turn collapsed to ONE line. A body that does not parse renders as plain text.
Limits: `TRANSCRIPT_TURNS_MAX = 12`, `TRANSCRIPT_TURN_MAX = 300` (stored),
`TRANSCRIPT_TURN_WIRE_MAX = 1000` (validation), `TRANSCRIPT_BODY_MAX = MESSAGE_MAX = 2000` — the
last is a **database CHECK** (`conversation_messages_body_length`), so exceeding it aborts the
transaction that was opening the thread.

**Messages**: `MESSAGE_MAX = 2000`, min 2; «السؤال الأول لسه فاضي» /
«الرسالة طويلة أوي — الحد 2000 حرف». Body is plain text rendered into a text node; **there is no
rich-text path here at all**.

**Reply**: label **ردّك**, placeholder «الرد على الطالب…», **إرسال الرد** / «بنبعت…», failure
«مقدرناش نبعت الرد. نحاول تاني.» `POST /api/admin/conversations/{id}/reply` — **204**.
Attachments upload via `POST /api/admin/conversations/attachments` and are read back at
`GET /api/admin/conversations/{id}/messages/{messageId}/attachment`. One button covers images and
documents (a picture and a PDF are the same gesture). Voice notes are recorded here — the
`Permissions-Policy` header must allow the microphone.

**Per-message**: reaction `PUT /api/admin/conversations/{id}/messages/{messageId}/reaction`
(gesture is a long press, plus a visible button; accessible names **ردّ بإيموجي** /
**قفل الإيموجي**, never seen); edit `PATCH …/messages/{messageId}`; delete `DELETE …/messages/{messageId}`.
**Status**: `PATCH /api/admin/conversations/{id}/status` — **204** (`conversation:close`).

⚠️ `guestPhone` appears on `AdminConversationDetail` and **nowhere else** — a thread read back
through the guest cookie must never echo it, or a stolen cookie becomes a phone-number disclosure.

---

### 4.18 `/admin/inbox/questions` — أسئلة الطلبة

`conversation:read`. `GET /api/admin/assistant/questions?perPage=50[&escalatedOnly=true][&q=]` →
`listResponse(AssistantQuestionSchema)`; detail
`GET /api/admin/assistant/questions/{id}/context`. URL param `escalated=1` drives `escalatedOnly`.

Header: eyebrow «المساعد», h1 «أسئلة الطلبة», lead
«كل سؤال اتكتب في الشات، والرد اللي راح عليه. اللي عليه علامة معناه إن المساعد وقف قدامه — ودي أهم صف في الصفحة.»,
then quietly «الأسئلة بتتشال لوحدها بعد ٩٠ يوم.», then the tabs.

Controls: a GET form with **دوّر في الأسئلة** (placeholder «دوّر في الأسئلة…», submit **دوّر**) —
new UI over a capability the API always had; the page read `q` from the URL and nothing on screen
could set it — plus a hidden `escalated` field so submitting a search does not clear the filter;
and `<ListControl name="escalated" label="اعرض">` with **كل الأسئلة** (`''`) /
**اللي وقف قدامه** (`'1'`). `rowCount` is printed at the inline-end of that row.

Empty «لسه محدش سأل حاجة.»; filtered «مفيش سؤال وقف قدام المساعد في الفترة دي.»

Row labels **السؤال** / **الرد** / **الطالب** / **إمتى**; the answer bubble is labelled
**رد المساعد** (المساعد is not him, and an unlabelled answer bubble reads as something he wrote —
on the exact screen whose job is deciding whether to step in). A visitor with no account is
**زائر من غير حساب** — not «مجهول»; the honest word is that there was no account, not that we lost
one.
Badges: **محتاج أيمن** (escalated) · **رد بالذكاء الاصطناعي** vs **من الكلام المكتوب** (a page of
the latter means the API keys ran out — a different problem from "the answers are bad", and the
only column that tells them apart) · **لسه محدش كلّمه** (escalated, signed-in, no conversation ever
opened — the badge that stops a question being lost) · **اتحول لمحادثة** ·
**زائر — مفيش طريقة نلاقيه تاني**. Action **افتح المحادثة**.
Detail dialog **السؤال ده**, **باقي اللي سأله في نفس الوقت تقريبًا**, empty
«ده السؤال الوحيد منه في الفترة دي.», guest note «زائر من غير حساب — مينفعش نربط أسئلته ببعض.»

**`/admin/assistant`** is a permanent `redirect('/admin/inbox/questions')` — the URL is in history
and in every already-open tab's sidebar, and a 404 would teach the instructor a screen was removed
when it only moved.

---

### 4.19 `/admin/outreach` — رسايلي للطلبة

`outreach:read` + `settings:write` for the switches.
Four parallel reads: `GET /api/admin/outreach?filter={f}` → `listResponse(OutreachLogRow)`;
`GET /api/admin/outreach/stats`; `GET /api/admin/outreach/preview`; `GET /api/admin/settings`.

The screen answers three questions **in this order, and the order is the design**: what went out
under my name (the log), does it read like me (the preview), do I want it to keep happening (the
switches). Leading with the switches would ask him to configure something he has never seen.

Header: eyebrow «رسايلك», h1 «رسايلي للطلبة», lead
«المنصة بتبعت للطالب رسالة باسمك بعد كل امتحان، ولو كويز اتساب من غير حل، ولو درس خلص. كل رسالة بصيغة مختلفة — مفيش تكرار.»

Stat strip **رسايل اتبعتت** · **آخر ٣٠ يوم** · **الطالب فتحها** · **وصل رد** (accent, hint
«أقوى إشارة إن الرسالة وصلت فعلاً»), then
«المنصة بتكتب عن اللي حصل بعد {date} بس — اللي قبل كده مش هيتبعت عنه حاجة.»

Log (**اللي اتبعت**): pill filters **الكل** + the four kinds — `quiz_result` **بعد الامتحان** ·
`quiz_nudge` **كويز ما اتحلّش** · `lesson_praise` **درس خلص** · `whatsapp_invite` **دعوة الجروب**.
Empty «لسه مفيش رسايل اتبعتت.» + «أول ما طالب يخلّص كويز، هتلاقي الرسالة اللي راحتله هنا بالنص بتاعها.»
Row flags **اتقرت** / **لسه ما اتقرتش** / **وصل رد**; link **فتح المحادثة** →
`/admin/inbox/{conversationId}`; and a **«اتبعتت عشان»** line built from the message's own facts:
- «امتحان «{quiz}» بدرجة {score}٪», optionally « — ركّزت على: {topics}»
- «درس «{lesson}» من غير حل الكويز»
- «درس «{lesson}» اللي مالوش كويز»
- «دعوة لجروب الواتساب»

Preview **شكل الرسايل**, lead
«دي رسايل حقيقية من نفس المولّد اللي بيبعت للطلبة — بأسماء ودرجات متخيّلة. لاحظ إن كل واحدة مكتوبة بشكل مختلف.»,
samples **نموذج {n}**.

Switches — `PATCH /api/admin/settings/outreach`, `OutreachSettingsSchema`:

| Field | Label — hint | Rule |
|---|---|---|
| `quizResult` | **رسالة بعد كل امتحان** — «بتقوله درجته وتسمّي الأسئلة اللي غلط فيها بالموضوع بتاعها» | bool, default true |
| `quizNudge` | **تنبيه على الكويز اللي ما اتحلّش** — «لو الدرس خلص والكويز اتساب» | bool, default true |
| `lessonPraise` | **كلمة بعد الدرس** — «للدروس اللي مالهاش كويز — الرسالة الوحيدة اللي مش بتطلب حاجة» | bool, default true |
| `whatsappInvite` | **دعوة قناة الواتساب** — «بتتبعت للطلبة اللي لسه مضغطوش على اللينك — ومحتاجة لينك القناة في وسائل التواصل» | bool, default true |
| `nudgeAfterHours` | **يستنى قد إيه قبل التنبيه** — «بالساعات، من ساعة ما يخلّص الدرس» | int 1–720, default 24 |
| `groupInviteEveryDays` | **كل قد إيه يفكّره بالقناة** — «بالأيام — وبنعدّ كمان المرات اللي القناة اتذكرت فيها جوه رسالة تانية» | int 3–365, default 21 |
| `maxInvitesPerStudent` | **أقصى عدد مرات نفكّره** — «على طول عمره في المنصة. وأول ما يضغط على اللينك بنبطّل نفكّره خالص.» | int 1–20, default 4 |
| `maxPerStudentPerDay` | **أقصى عدد رسايل للطالب في اليوم** — «رسايل النتايج مستثناة — الطالب اللي امتحن تلات مرات يستاهل تلات ردود» | int 1–10, default 2 |

Section heading **إمتى المنصة تتكلم باسمك**, lead
«كل نوع ليه مفتاح لوحده. لو قفلت نوع، الرسايل اللي اتبعتت قبل كده بتفضل مكانها.», and the standing
note: «مفيش زرار «إرسال للكل» هنا، وده مقصود: كل رسالة سببها حاجة عملها الطالب نفسه.»

---

### 4.20 `/admin/taxonomy` — الهيكل الدراسي

⚠️ The controller is `@Controller('admin/taxonomy') @RequirePermission('taxonomy:write')` — the
class-level default is **write**, and each `@Get` re-declares `taxonomy:read`. Every
`POST`/`PATCH`/`DELETE` therefore needs `taxonomy:write`.

Index: h1 **الهيكل الدراسي**, lead
«الأنظمة الدراسية والمحافظات والمسارات والمواد — بما فيها الأسماء بالعربي.», four cards →
**المحافظات** · **الأنظمة الدراسية** · **المسارات** · **المواد**.

Shared labels: **الاسم** · **المُعرّف** · **المنطقة** · **مفعّلة** · **الترتيب** ·
**الدرجة الكلية** · **نسبة النجاح %** · **بيسمح بإعادة السنة** · **النظام** · **أقل صف** ·
**أسماء بديلة**; states «مفعّلة» / «غير مفعّلة»; action **تعديل**; slug hint
«حروف إنجليزي صغيرة وأرقام وشرطات — ثابت بعد الإنشاء»; immutability note
«المُعرّف ثابت ومينفعش يتغيّر بعد الإنشاء»; toasts «اتحفظ» / «مقدرناش نحفظ — نحاول تاني».

**`/admin/taxonomy/governorates`** — `GET /api/admin/taxonomy/governorates` →
`{ code, nameAr, slug, region, sortOrder, isActive }[]`;
`PATCH /api/admin/taxonomy/governorates/{code}`.
`region` ∈ `urban` **حضر** | `lower` **وجه بحري** | `upper` **وجه قبلي** | `frontier` **حدودي**.
**No delete** — `Governorate` is the FK target of every student profile, so `isActive: false`
(toggled inline) is the whole answer to "remove one".

**`/admin/taxonomy/systems`** — `GET /api/admin/taxonomy/systems` →
`{ id, slug, nameAr, totalMarks, passPercent (number|string, coerced), allowsRetakes, sortOrder,
years[{id, year, labelAr, badgeAr, sortOrder}] }[]`;
`PATCH /api/admin/taxonomy/systems/{id}`, `PATCH /api/admin/taxonomy/academic-years/{id}`.
`slug` renders read-only and `SystemPatchSchema` has **no `slug` key at all**, so no path from this
screen can change one. Sub-heading **الصفوف الدراسية**.

**`/admin/taxonomy/tracks`** — `GET /api/admin/taxonomy/tracks` + `GET /api/admin/taxonomy/systems`
→ `{ id, systemId, slug, labelAr, aliases[], minYear, sortOrder }[]`;
`POST /api/admin/taxonomy/tracks`, `PATCH /api/admin/taxonomy/tracks/{id}`.
New **مسار جديد**. `slug` and `systemId` are identity — neither has a patch-schema key.

**`/admin/taxonomy/subjects`** — `GET /api/admin/taxonomy/subjects` →
`{ id, slug, nameAr, aliases[] }[]`; `POST`, `PATCH`, `DELETE /api/admin/taxonomy/subjects/{id}`.
New **مادة جديدة**; delete confirm «نحذف المادة دي؟»; **409** ⇒
«المادة مرتبطة بمقرر دراسي — المقرر يتحذف الأول».

Also on the controller with no dedicated screen:
`GET|POST /api/admin/taxonomy/subject-offerings`, `PATCH /api/admin/taxonomy/subject-offerings/{id}`.
An offering is the `(system, year, track, subject)` tuple; its absence is what produces the course
editor's «التركيبة دي … مش موجودة في المناهج» 400.

---

### 4.21 `/admin/marketing/*` — التسويق (WhatsApp)

Tabs: **التسويق** `/admin/marketing/campaigns` · **رقم الواتساب** `/admin/marketing/device` ·
**طلبوا الإيقاف** `/admin/marketing/opt-outs`.
Permissions `marketing:read` / `marketing:write` / `marketing:send` / `marketing:device`.
Outbound WhatsApp to people who may not be on the platform at all — deliberately its own nav group,
because «رسايلي للطلبة» is an *in-platform* message triggered by something a student did.

#### Campaign list
`GET /api/admin/marketing/campaigns` → `CampaignRow[]`
`{ id, name, status, counts{total,pending,sent,failed,skipped}, createdAt, startedAt|null,
finishedAt|null, nextSendAt|null }`.
h1 **التسويق**, lead
«ابعت رسالة واتساب لكل الطلبة أو لمجموعة منهم — من رقمك، بالتدريج، من غير ما ينحظر.»,
button **حملة جديدة**. Empty «لسه مفيش حملات. ابدأ بواحدة.»
Columns **الاسم** / **الحالة** / **التقدّم** («{sent} من {total}») / **اتعملت**.
Statuses `draft` **مسودة** · `running` **شغالة** · `paused` **واقفة** · `done` **خلصت** ·
`cancelled` **اتلغت**.

#### `/admin/marketing/campaigns/new`
Loads `GET /api/catalog/courses` for the course picker.
`POST /api/admin/marketing/campaigns` (`marketing:write`), `CampaignCreateSchema`.
Audience preview `POST /api/admin/marketing/audience-preview` →
`{ recipients, unreachable, optedOut, estimateMinutes }`.

**Audience** (`AudienceSchema`; `EMPTY_AUDIENCE` = students on, parents off, everything else empty):

| Field | Label — hint |
|---|---|
| `students: bool` | **الطلبة** — «رقم الطالب اللي مسجّل بيه في المنصة» |
| `parents: bool` | **أرقام أولياء الأمور** — «محتاجة تفكير قبل ما تفتحها — الأهل ما وافقوش على المنصة، وافقوا على رقمهم بس» |
| `years: int[1..3]` | **السنة الدراسية** / «كل السنين» |
| `schoolStreams` | **المدرسة** / «كل المدارس» |
| `courseIds: uuid[]` | **مسجّلين في كورس** / «بغضّ النظر عن الكورس» |
| `notSubscribedOnly` | **بس اللي لسه مش مشتركين** — «بيستبعد اللي عنده اشتراك سارٍ في الكورس ده دلوقتي — يفضل بس اللي مسجّل ومحاولش يشترك، أو اشتراكه خلص»; with no course chosen «اختار كورس واحد على الأقل الأول عشان الفلتر ده يشتغل» |
| `bookOrderStatuses` | **حالة طلب الكتاب** / «بغضّ النظر عن طلب الكتاب», hint «بيختار الطلبة اللي عندهم طلب كتاب في الحالة دي. الطلبات المحذوفة مش محسوبة، واللي طلبوا من غير ما يعملوا حساب مش هيوصلهم من هنا.» |
| `extraPhones: string[≤500]` | **أرقام تانية** — «رقم في كل سطر. للناس اللي لسه مش مسجّلين في المنصة.» |

Book-order state labels are written **from the recipient's side**, deliberately not reusing
`copy.admin.books.status*` (which describes an ORDER):
`address_only` **طلبوا ومدفعوش** · `paid` **دفعوا ولسه ماتشحنش ليهم** · `shipped` **اتشحن ليهم** ·
`delivered` **وصلهم الكتاب** · `rejected` **طلبهم اترفض**. `campaign.spec.ts` fails if these ever
stop covering `BookOrderStatusSchema`.

One-press narrowing **ابعت للأرقام دي بس**, hint
«هيشيل الطلبة وأولياء الأمور من الحملة، ويبعت للأرقام اللي فوق بس.» — it simply unticks `students`
and `parents`; no new mode, no new state. When active the summary reads
«الحملة دي للأرقام اللي كتبتها بس — {n} رقم.»
Preview: «بنحسب العدد…» → «هيوصله {n} رقم» or «مفيش حد هيوصله بالفلاتر دي», plus
«{n} رقم متجاهَل — مش رقم مصري صحيح», «{n} رقم طلب إيقاف قبل كده»,
«هياخد حوالي {duration} عشان يوصل للكل».

**Message** (**الرسالة**): `name` **اسم الحملة** (hint «للأدمن بس — الطالب ما يشوفهوش», trimmed
2–120) · `body` **النص** (hint «اكتب {{الاسم}} في أي مكان وهيتحول لاسم كل واحد. الأرقام اللي من غير اسم هتتبعتلها الجملة من غيره.»,
trimmed 4–**900**; tokens `NAME_TOKEN = {{الاسم}}`, `LINK_TOKEN = {{اللينك}}`) ·
`imageAssetId` **صورة (اختياري)** with **اختار من المكتبة** / **شيل الصورة** ·
`linkUrl` **لينك (اختياري)** (hint «هيتضاف آخر الرسالة، إلا لو كتبت {{اللينك}} في مكان تاني بنفسك»;
must start `http://` or `https://` else «اللينك لازم يبدأ بـ http:// أو https://») ·
live preview **شكل الرسالة**.

**Pacing** (**السرعة والأمان**, lead
«دي أرقام أمان عشان رقمك ميتحظرش. متتعداش الافتراضي إلا لو عارف بتعمل إيه.»):

| Field | Label | Range |
|---|---|---|
| `minDelaySeconds` | **أقل مدة بين رسالتين (ثانية)** | 5–3600 |
| `maxDelaySeconds` | **أكتر مدة بين رسالتين (ثانية)** | 5–3600, `≥ min` else «أقصى مدة بين الرسايل لازم تكون أكبر من أقلها أو تساويها» |
| `batchSize` | **كام رسالة قبل الراحة** | 0–500 |
| `batchPauseMinutes` | **الراحة قد إيه (دقيقة)** | 0–720 |
| `dailyCap` | **أقصى عدد رسايل في اليوم** | 1–1000 |
| `windowStartHour` | **من الساعة** | 0–23 |
| `windowEndHour` | **لحد الساعة** | 1–24, `> start` else «ساعة الإقفال لازم تكون بعد ساعة الفتح» |

Hint «بتوقيت القاهرة. برّه المواعيد دي الحملة بتستنى.»
Create: **جهّز الحملة** → dialog **متأكد؟** with
«الحملة هتتبعت لـ {n} رقم، وهتاخد حوالي {duration}. مينفعش تتراجع بعد ما تبدأ غير بالإلغاء.» and
**أيوه، جهّزها**.

#### `/admin/marketing/campaigns/[id]`
`GET /api/admin/marketing/campaigns/{id}` → `CampaignDetail` (= row + `body, imageAssetId|null,
imageUrl|null, linkUrl|null, audience, pacing, sentToday, estimateMinutes, preview`) and
`GET …/{id}/recipients?status={s}` → `RecipientRow[]`
`{ id, phone, name|null, userId|null, status, attempts, sentAt|null, error|null }`.
Back **كل الحملات**. Controls **ابدأ** (`POST …/start`) · **كمّل** · **وقّف** (`POST …/pause`) ·
**إلغاء الحملة** (`POST …/cancel`, confirm «تلغي الحملة دي؟ اللي لسه ما وصلهمش مش هيوصلهم حاجة، بس السجل بيفضل.»)
— all `marketing:send`; **تعديل** (`PATCH …`) and **حذف** (`DELETE …`, confirm
«تحذف المسودة دي نهائي؟») are `marketing:write`.
Read-outs «{sent} من {total}», «فاضل {n}», «{n} فشل», «{n} اتجاهل»,
«الرسالة الجاية الساعة {time}», «مستنية الشباك يفتح», «مستنية بكرة — وصل السقف اليومي».
Recipients **المستلمين**, filters **الكل** / **لسه** / **اتبعت** / **فشل** / **اتجاهل**, columns
**الرقم** / **الحالة** / **وقت الإرسال** / **السبب**; no name ⇒ «من غير اسم».

#### `/admin/marketing/device`
`GET /api/admin/marketing/device` → `{ state, phone|null, qr|null, detail|null }`,
`state ∈ disabled|unreachable|disconnected|linking|connected`.

| State | Copy |
|---|---|
| `disabled` | «الخدمة لسه مش متظبطة على السيرفر.» + «المطوّر لازم يضيف WA_SERVICE_URL وWA_SERVICE_TOKEN الأول.» |
| `unreachable` | «مقدرناش نوصل لخدمة الواتساب» |
| `disconnected` | «مفيش رقم متربط» |
| `linking` | «امسح الكود ده من واتساب على موبايلك» + «واتساب ← الإعدادات ← الأجهزة المرتبطة ← ربط جهاز» (render `qr`) |
| `connected` | «متربط» / «متربط برقم {phone}» |

Lead «الرقم اللي الحملات هتتبعت منه. رقمك الشخصي، من غير أي API رسمي — زي ما تفتح واتساب ويب.»
Buttons **اربط رقم جديد** (`POST …/device/link`, `marketing:device`; pending «بنجهّز الكود…»),
**افصل الرقم** (`POST …/device/unlink`, confirm «تفصل الرقم ده؟ الحملات الشغالة هتوقف.»), and
**امسح البيانات وابدأ من الأول** (confirm
«هنمسح بيانات الربط المحفوظة ونبدأ من الصفر. مش هيتفصل أي رقم شغّال.») — the escape hatch when
pairing data was written half-way and WhatsApp keeps trying to resume a dead session instead of
issuing a new code. Plus «آخر سبب:» under the badge and
«لو دوست وما ظهرش كود خلال شوية ثواني، امسح البيانات وابدأ من الأول.»

#### `/admin/marketing/opt-outs`
`GET /api/admin/marketing/opt-outs` → `{ phone, reason|null, createdAt }[]`;
`POST /api/admin/marketing/opt-outs`; `DELETE /api/admin/marketing/opt-outs/{phone}`.
h1 **طلبوا الإيقاف**, lead «الأرقام دي معملهاش أي حملة تانية. بتتضاف تلقائي لما حد يرد بـ«قف».»,
empty «محدش طلب إيقاف لسه.», **إضافة رقم بإيدك**, **إلغاء الإيقاف**, columns **الرقم** /
**السبب** / **التاريخ**. Inbound replies land on the public `POST /api/marketing/wa/inbound`.

---

### 4.22 `/admin/home` — الصفحة الرئيسية

`home:read` / `home:write`. `GET /api/admin/home-blocks` → `HomeBlockList`.
h1 **الصفحة الرئيسية**, lead «ترتيب أقسام الصفحة الرئيسية — اسحب لإعادة الترتيب.»,
**أضف قسم**, **معاينة**.

**First-run state** (no blocks yet): «الصفحة الرئيسية لسه شغّالة بالترتيب الافتراضي» +
«الزوار بيشوفوا الصفحة كاملة عادي. دوسة هنا بتحوّل أقسامها لصفوف بتتربّت وبتتعدّل نصوصها وبيتخبّى منها اللي ملوش لزوم.»
+ **نبدأ من الصفحة الحالية** → «جارٍ التجهيز…» → «الأقسام اتجهّزت». The action POSTs the default
blocks one at a time.

| `type` | Label | Editable |
|---|---|---|
| `hero` | قسم البداية | yes |
| `whyRail` | ليه تتعلم هنا | yes |
| `courseGrid` | شبكة كورسات | yes |
| `books` | قسم الكتب | yes |
| `instructor` | كارت المحاضر | **placement only** |
| `yearTracks` | مسارات الصفوف | **placement only** |
| `about` | نبذة عن المحاضر | yes |
| `stats` | إحصائيات | yes |
| `testimonials` | آراء الطلبة | yes |
| `faq` | أسئلة شائعة | yes |
| `cta` | دعوة لإجراء | yes |

Placement-only blocks render, instead of a form:
«القسم ده بيبني نفسه من الكورسات والهيكل الدراسي، فمفيش نصوص تتعدّل فيه. اللي بيتحكم فيه هنا هو مكانه في الصفحة، ونشره من عدمه.»

Field labels: **مُعرّف القسم** (hint «حروف إنجليزي صغيرة وأرقام وشرطات — ثابت بعد الإنشاء») ·
**العنوان الرئيسي** · **العنوان الفرعي** · **نص الزرار** · **رابط الزرار** · **عنوان القسم** ·
**التسمية** / **القيمة** + **أضف إحصائية** · **الاسم** / **الرأي** + **أضف رأي** · **السؤال** /
**الإجابة** + **أضف سؤال** · **حذف** · **عدد الكتب** · **أقصى عدد كورسات معروضة** ·
**السطر الصغير فوق العنوان** · **الفقرة التعريفية** · **فقرة تانية (اختيارية)** ·
**الجزء الملوّن من العنوان** · **الأسطر المتبدّلة** + **أضف سطر** (hint
«السطر التاني في العنوان بيلف على دول. وتفضل فاضية لو المطلوب عنوان ثابت.») ·
**نص الزرار التاني** / **رابط الزرار التاني** · **الأرقام تحت الأزرار** + **أضف رقم** ·
**عنوان الميزة** / **شرح الميزة** + **أضف ميزة** · **الفقرة الأولى** / **الفقرة التانية** /
**الصفة تحت الاسم** / **الوسوم** + **أضف وسم**.
(⚠️ `admin.home.lead` is the SCREEN's description; the field label inside a block form is
`admin.home.blockLead` — two different strings, two different keys.)

Constraints: `hero.headlineAr` 4–120 · `subheadlineAr` ≤240 · `rotatingAr` ≤6 items, ≤120 each ·
`ctaHref`/`secondaryCtaHref` must match `/^\/[^\s]*$/` (defaults `/register`, `/courses`) ·
`hero.stats` ≤4 `{value ≤20, labelAr ≤40}` · `whyRail.items` **2–12** `{titleAr 2–60, bodyAr 4–240}` ·
`courseGrid.courseIds` ≤12, `limit` 1–12 default 6 · `books.limit` 1–12 default 3 ·
`about.body1Ar/body2Ar` ≤600, `chipsAr` ≤4 · `stats.items` 1–4 · eyebrow ≤60 · lead ≤400.

Actions: `POST /api/admin/home-blocks` · `PATCH /api/admin/home-blocks/{id}` ·
`PATCH /api/admin/home-blocks/{id}/published` (body `{ isPublished }`) with **انشر** /
**إلغاء النشر** and states **منشور** / **مسودة** · `DELETE /api/admin/home-blocks/{id}` (archive;
confirm «نأرشف القسم ده؟», toast «اتأرشف القسم») · `POST /api/admin/home-blocks/{id}/restore`
(«اترجع القسم») · `POST /api/admin/home-blocks/order`.
Toasts «اتحفظ» / «مقدرناش نحفظ — نحاول تاني».

---

### 4.23 `/admin/navigation` — القوائم

`nav:read` / `nav:write`. `GET /api/admin/navigation` → `NavigationTreeSchema` (items each with
`children[]`); the session is also read so the "visible to" picker can offer the caller's own
permissions.
h1 **القوائم**, lead «عناصر القائمة — اسحب لإعادة الترتيب على مستويين.»
Item `{ id, parentId|null, labelAr, href, icon|null, position, visibleTo[], isPublished }`.

| Field | Label — hint | Rule |
|---|---|---|
| `labelAr` | **النص الظاهر** | 1–60 |
| `href` | **الرابط** — «رابط داخلي بيبدأ بـ / زي /courses» | 1–200 matching `/^\/[A-Za-z0-9\-._~/?#[\]@!$&'()*+,;=%]*$/` — site-relative only |
| `icon` | **الأيقونة (اختياري)** | ≤40 nullable |
| `parentId` | **العنصر الأب**, empty **بدون — مستوى أول** | uuid nullable |
| `visibleTo` | **يظهر لمين** — «من غير أي صلاحية محددة، العنصر يظهر للجميع» | ≤10 strings matching `/^[a-z-]+:[a-z-]+$/` |
| `isPublished` | **منشور** | bool, default **true** |

Buttons **عنصر جديد** / **عنصر فرعي** / **تعديل العنصر**; empty children **مفيش عناصر فرعية**.
`POST /api/admin/navigation` · `PATCH /api/admin/navigation/{id}` ·
`DELETE /api/admin/navigation/{id}` (archive) · `POST /api/admin/navigation/{id}/restore` ·
`POST /api/admin/navigation/order` (body `{ parentId: uuid|null, ids: uuid[1..200] }`, ids unique).
Archive uses `window.confirm` «نأرشف العنصر ده؟», then a toast «اتأرشف العنصر» **with an undo
action labelled «تراجع»** that calls restore; restored ⇒ «اترجع العنصر».
Save toasts «اتحفظ» / «مقدرناش نحفظ — نحاول تاني».

---

### 4.24 `/admin/media` — مكتبة الوسائط

`media:read` / `media:write` / `media:delete`.
`GET /api/admin/media?page=1&perPage=60&includeArchived={bool}` →
`listResponse(MediaAssetSchema)`; URL param `?archived=1` sets `includeArchived`.
h1 **مكتبة الوسائط**, lead
«الصور بتتحول لـ WebP تلقائيًا وبتتحفظ باسم عشوائي — الاسم الأصلي والبيانات المخفية بتتشال.»
Empty **مفيش صور لسه**; toggle **اعرض المؤرشف**.
Asset `{ id, storageKey, filename, mime: 'image/webp', sizeBytes, width|null, height|null,
altAr|null, archivedAt|null, createdAt }`.

**Upload** `POST /api/media` (multipart, browser→API directly).
Accepted MIME `image/png`, `image/jpeg`, `image/webp`, `image/avif`, `image/gif`; extensions
`png jpg jpeg webp avif gif`. `MAX_UPLOAD_BYTES = 8 MiB`, `MAX_INPUT_PIXELS = 50 000 000`; output
is always `image/webp`.
Drop hint «سحب صورة هنا، أو دوسة لاختيار ملف»; pre-pick hint «PNG أو JPG أو WEBP أو GIF — ٨ ميجا كحد أقصى»;
in flight «جارٍ الرفع… {n}%»; done «اترفعت الصورة».
Failures: «الصورة كبيرة أوي — الحد الأقصى ٨ ميجا. صغّرها وحاول تاني.» ·
«نوع الملف ده مش مدعوم. المدعوم PNG أو JPG أو WEBP. صور الآيفون (HEIC) لازم تتحوّل الأول.» ·
«مقدرناش نقرا الملف ده كصورة. يمكن يكون مش صورة سليمة.» ·
«النت قطع في نص الرفع. نجرّب تاني بنفس الصورة.» (a dropped connection, so it sends you back to the
*same* file) · fallback
«مقدرناش نرفع الصورة — تأكد إنها PNG أو JPEG أو WebP أو AVIF أو GIF وأصغر من 8 ميجا».

**Cropper** — **optional by design**: «من غير قص» is a peer of «تمام، استخدمها», not a link hidden
under it. **اقصّ الصورة** · «اسحب الصورة عشان تحرّكها، والشريط اللي تحت بيكبّرها. اللي جوّه الإطار هو اللي هيتحفظ.» ·
**تكبير** · **إلغاء** · failure «مقدرناش نفتح الصورة عشان نقصّها. تنفع ترفع زي ما هي.»
Aspects **مربّع** / **عريض (صورة المشاركة)** / **زي ما هي** (a favicon is square everywhere a
browser paints one, a share card is 1.91:1 by Facebook's spec, and a logo has no one shape).

Per asset: «{width}×{height}», «{kb} ك.ب», alt field **وصف الصورة** (placeholder
«وصف مختصر للصورة») saved with `PATCH /api/admin/media/{id}`, and **اعرضها بحجمها**.
Archive/restore `POST /api/admin/media/{id}/archive|restore` — **أرشفة** / **استرجاع**, badge
**مؤرشفة**.
Re-crop `POST /api/admin/media/{id}/replace`: **تعديل القص** → **تعديل قص الصورة**, hint
«التعديل هيتطبّق في كل مكان الصورة دي مستخدمة فيه.», loading «بنجيب الصورة الأصلية…», success
«اتعدّلت الصورة», failure «مقدرناش نجيب الصورة عشان نعدّلها — نحاول تاني».

**Permanent delete** — the word is **«مسح خالص»**, deliberately not «حذف», because «أرشفة» sits
beside it and an admin skimming two destructive-looking words must be able to tell which one is
undoable.
Dialog **تمسح الصورة خالص؟**, body
«الصورة هتتشال من الداتا بيز ومن السيرفر نهائيًا، ومش هتترجع تاني. ولو المطلوب تخبيتها بس من غير مسح، فيه «أرشفة».»
Usage check «بنشوف الصورة دي مستخدمة فين…» → `GET /api/admin/media/{id}/usage`. When non-empty, a
**second, louder paragraph** (not different wording in the first — an unused image and one the site
is rendering are different risks): «دي مستخدمة دلوقتي في:» + the list +
«لو مسحتها، الأماكن دي هتفضل من غير صورة.»
Usage kinds → `brandingLogoLight` **شعار الموقع (الوضع الفاتح)** · `brandingLogoDark`
**شعار الموقع (الوضع الغامق)** · `brandingFavicon` **أيقونة الموقع** · `seoOgImage`
**صورة المشاركة** · `homeBlock` **الصفحة الرئيسية**.
Confirm **أيوه، امسحها خالص** → `DELETE /api/admin/media/{id}`; success «اتمسحت خالص», failure
«مقدرناش نمسح الصورة — نحاول تاني».

`<MediaKeyField>` (used from other forms): **مفيش صورة** / **اختيار صورة** / **تغيير الصورة** /
**شيل الصورة**.
Public read `GET /api/media/{prefix}/{name}`. Storage-key shapes (`isValidStorageKey`):
`^[0-9a-f]{2}/[0-9a-f-]{36}\.webp$` (library) · `doc/…\.(pdf|pptx|docx|xlsx)` ·
`msg/…\.(webp|pdf|pptx|docx|xlsx)` · `payment-proof/…\.webp` · `book-order-proof/…\.webp` ·
`hw/…\.webp`. `MAX_DOCUMENT_BYTES` = 95 MiB; `MAX_AVATAR_BYTES` = 2 MiB, avatar 512 px.

---

### 4.25 `/admin/news` — نيوز

`news:read` / `news:write` / `news:publish`.
List `GET /api/admin/news` → `AdminNewsRow[]`. h1 **نيوز**, lead
«المقالات اللي بتظهر في قسم نيوز على الموقع. المقالة ما بتظهرش لحد لما تنشرها.», button
**مقالة جديدة**. Empty **مفيش مقالات لسه. نبدأ بواحدة.**
Row: title, a **Badge** (never colour alone — WCAG 1.4.1) `published` tone `ok` **منشورة** else
`neutral` **مسودة**, and `updatedAt` via `toLocaleDateString('ar-EG')`.
Column names **العنوان** / **الحالة** / **آخر تعديل**.

Editor (`/admin/news/new`, `/admin/news/[id]` → `GET /api/admin/news/{id}`):

| Field | Label — hint |
|---|---|
| `title` | **العنوان** — «خلّيه سؤال زي ما الطالب هيكتبه في البحث — «إيه هي الحلقة التكرارية؟» بتتبحث، «الحلقات» لأ.» |
| `slug` | **الرابط** — «بالعربي عادي. من غير مسافات ولا نقط ولا شرطة مائلة.» |
| `excerpt` | **الملخّص** — «دي نفسها اللي بتظهر تحت العنوان في نتايج جوجل. ١٦٠ حرف بالكتير.» |
| `body` | **المقالة** — «Markdown: ## للعنوان، - للنقط، ``` للكود. الـ HTML بيتعرض كنص مش بيتنفّذ.» |
| `courseId` | **الكورس المرتبط**, empty **من غير كورس** — «المقالة بتقفل بزرار على الكورس ده. سيبه فاضي وهتقفل على صفحة الكورسات.» |

Live preview **شكلها هيبقى إزاي**; back link **كل المقالات**.
Buttons **حفظ** / «بيحفظ…» / «اتحفظ»; **انشر المقالة** / **شيلها من النشر** / «بينفّذ…» — worded as
the ACT, never as the current state (a toggle labelled with its own state is the commonest way an
admin clicks the opposite of what they meant); **حذف** with confirm
«تحذف المقالة دي نهائي؟ مفيش رجوع.»
Errors «مقدرناش نحفظ. نحاول تاني.» and «الرابط ده مستخدم في مقالة تانية.»
`POST /api/admin/news` · `PATCH /api/admin/news/{id}` ·
`PATCH /api/admin/news/{id}/published` (`news:publish`) · `DELETE /api/admin/news/{id}`.
Public reads `GET /api/news`, `GET /api/news/{slug}`.

---

### 4.26 `/admin/settings/branding` — إعدادات المنصة

`settings:read` / `settings:write`. Two parallel reads: `GET /api/admin/settings` →
`SiteSettingsSchema`, and `GET /api/admin/media?page=1&perPage=100&includeArchived=false` — fetched
**once** here and handed to all four asset pickers (logo × 2, favicon, OG image), one round trip
instead of four.

h1 **إعدادات المنصة**. Three cards, each saved **independently**:
**الهوية البصرية** · **بيانات محركات البحث** · **وسائل التواصل**.
Endpoints `PATCH /api/admin/settings/{section}` where `section ∈ branding | seo | contact |
outreach | store` (`SETTINGS_SECTIONS`); response is the whole `SiteSettings`.

**`branding`** (`BrandingSchema`, `.strict()`)
- `accent` ∈ `amber | cyan | blue | violet | magenta | slate`, default `amber`. Label
  **اللون الأساسي**; option labels **كهرماني** / **سماوي** / **أزرق** / **بنفسجي** / **أرجواني** /
  **رمادي**; preview label **معاينة اللون**. Colours are chosen from a fixed set — **no free-text
  colour entry** («الألوان بتتختار من مجموعة جاهزة — مفيش كتابة ألوان بإيدك.»).
- `radius` ∈ `sharp | default | soft`, default `default`. Label **حدة الحواف**; options
  **حواف حادة** / **الافتراضي** / **حواف ناعمة**.
- `logoLightAssetId` **الشعار — الوضع الفاتح** (hint «بيظهر في الوضع الفاتح»),
  `logoDarkAssetId` **الشعار — الوضع الداكن** (hint «بيظهر في الوضع الداكن»),
  `faviconAssetId` **أيقونة الموقع** — each `uuid|null`, default `null`.
- The read shape (`BrandingReadSchema`) adds resolved `logoLightKey`, `logoDarkKey`, `faviconKey`.

**`seo`** (`SeoSchema`): `titleAr` **عنوان الموقع** ≤70 (hint
«حتى 70 حرف — بيظهر في تبويب المتصفح ونتائج البحث») · `descriptionAr` **وصف الموقع** ≤160 (hint
«حتى 160 حرف — الوصف اللي بيظهر تحت العنوان في نتائج البحث») · `ogImageAssetId` **صورة المشاركة**.
Read shape adds `ogImageKey`.

**`contact`** (`ContactSchema`) — every URL must be `https://` (`«لازم يبدأ بـ https://»`), every
phone must match `/^\+[1-9]\d{7,14}$/` (hint «بصيغة دولية، يعني +20 وبعدها الرقم»):

| Field | Label / hint |
|---|---|
| `email` | **البريد الإلكتروني** |
| `phone` | **رقم الهاتف** |
| `whatsapp` | **واتساب** |
| `facebook` | **فيسبوك** |
| `youtube` | **يوتيوب** |
| `telegram` | **تليجرام** |
| `instagram` | **إنستجرام** |
| `tiktok` | **تيك توك** |
| `whatsappChannel` | **قناة واتساب** — «لينك القناة نفسها، مش رقم» |
| `whatsappGroup` | **جروب واتساب للطلبة** — «لينك الجروب — ده اللي بيتبعت للطلبة في رسايلك. سيبه فاضي والدعوة مش هتتبعت أصلاً.» |
| `facebookGroup` | **جروب فيسبوك** — «لينك الجروب اللي الطلبة بيتجمعوا فيه» |
| `instapay` | **رقم إنستاباي** — «الرقم اللي الطلبة هيحوّلوا عليه — اشتراكات الكورسات المدفوعة وطلبات الكتب، الاتنين. بصيغة دولية زي رقم الهاتف فوق.» |
| `vodafoneCash` | ⚠️ **dead key** — no field renders for it; kept only so the stored settings row still parses |

⚠️ Three different WhatsApp fields, genuinely three things: a **number**, a read-only
**broadcast channel**, and a **group students can talk in**. `whatsappGroup` does **not** fall back
to the channel — a message promising «جروب الواتساب مستنيك» over a read-only channel is a promise
the link cannot keep.

**`outreach`** — see §4.19. **`store`** — see §4.11 (`shippingCents` int 0–50 000, default 6 500).

`<AssetPicker>`: **من المكتبة** / **رفع صورة جديدة** / **بدون**, preview `alt`
**معاينة الصورة المختارة**, and, when the stored id no longer resolves,
«الصورة المختارة مش موجودة — يمكن اتمسحت».

Public reads used by the site: `GET /api/settings/branding`, `GET /api/settings/public` (both
`@Public()`).

---

### 4.27 `/admin/flags` — خصائص التشغيل

`flags:read` / `flags:write`. `GET /api/admin/flags` → `FeatureFlagList`
`{ key, descriptionAr, enabled, updatedAt }[]`. Toggle
`PATCH /api/admin/flags/{key}`, body `{ enabled: boolean }` (`.strict()`).
Public read `GET /api/flags`.

h1 **خصائص التشغيل**, lead «تشغيل أو إيقاف خصائص المنصة من غير أي نشر جديد للكود.»
One Card, rows divided by `divide-line-subtle`; each row is the flag's `descriptionAr` + a switch.
Toasts «اتحفظت الخاصية» / «مقدرناش نغيّر الخاصية — نحاول تاني».

`FLAG_DECLARATIONS` — key, Arabic description, default:

| key | descriptionAr | default |
|---|---|---|
| `catalog.showComingSoon` | إظهار الكورسات اللي لسه مش متاحة | `false` |
| `quiz.practiceMode` | تفعيل وضع التدريب في الاختبارات | `true` |
| `quiz.showReviewAfterSubmit` | عرض المراجعة بعد تسليم الاختبار | `true` |
| `player.trackProgress` | تسجيل تقدم مشاهدة الدروس | `true` |
| `onboarding.askParentPhones` | السؤال عن أرقام ولي الأمر | `true` |
| `home.showTestimonials` | إظهار آراء الطلبة في الصفحة الرئيسية | `false` |
| `sessions.enforceDeviceLimit` | تطبيق حد الأجهزة المسموح بها | `false` |

`isEnabled(flags, key)` falls back to the declaration's `defaultValue` when the row is absent.

---

### 4.28 `/admin/errors` — الأعطال

`diagnostics:read` / `diagnostics:resolve`. `GET /api/admin/errors?filter={f}` →
`{ rows, total, summary }`. `filter` ∈ `open` (**default**) | `resolved` | `all`, parsed through
the schema so junk reads as the default — on the error page.

**One row per DISTINCT failure**, grouped in the database on a fingerprint. That is what makes the
page openable during an incident: an API outage takes out every page view in its window, and a
row-per-occurrence log would answer "is anything broken" by being unreadable.

Header: eyebrow «المراقبة», h1 «الأعطال», subtitle
«كل مشكلة ظهرت لطالب — إيه هي، في أنهي صفحة، وحصلت كام مرة.»

**Two summary numbers** above the filter, computed server-side over the whole table (the difference
between a fact and a coincidence of pagination): `summary.open` **مشاكل مفتوحة**, and
`summary.last24h` **عطل ظهر في آخر ٢٤ ساعة** (distinct faults in the window, not occurrences of
them). The second tile goes `border-accent/40 bg-accent/8` when > 0.

Pill-tab filters **المفتوحة** / **المتقفلة** / **الكل**.
Empty: `open`/`all` ⇒ «مفيش أي عطل» + «مفيش مشكلة اتسجّلت لحد دلوقتي. الصفحة دي بتتملى لوحدها أول ما حاجة تقع عند أي حد.»;
`resolved` ⇒ «مفيش حاجة متقفلة» with no hint.

**Row** `{ id, kind, route, message, digest|null, stack|null, userAgent|null, userId|null,
occurrences (int > 0), firstSeenAt, lastSeenAt, resolvedAt|null }`.
`kind` ∈ `server` **عطل في السيرفر** (ServerCrash) · `client` **عطل في الصفحة نفسها**
(MonitorSmartphone) · `timeout` **السيرفر اتأخر ومردّش** (Clock). «server» and «client» are
deliberately not words the instructor has to learn.
A resolved row is `opacity-70` with a neutral well; an open one is `border-accent/40`.

Card contents: kind label · a mono pill «{occurrences} مرة» · badge «اتقفلت» when resolved ·
**the route in mono `dir="ltr"`** (a path in an RTL paragraph gets reordered by the bidi algorithm)
· `message` (`line-clamp-2`) · for a timeout only,
«الطلب عدّى ١٥ ثانية من غير رد، فالصفحة بطّلت استنيان. غالبًا الـ API كان واقع أو بطيء وقتها.» ·
a `<dl>` with **آخر مرة** / **أول مرة** / **كود العطل** (`dir="ltr" mono`) / **الطالب**
(`userId` in mono ltr, or «زائر مش مسجّل») · the user agent in mono ltr · and, when a stack exists,
a `<details>` labelled `stack` holding a `max-h-64` scrolling `<pre dir="ltr">`.
(Open by default it would make every row a screenful and the list unusable during exactly the
incident it exists for; a modal for static text would be furniture.)

Action button: **اعتبرها اتحلّت** → `PATCH /api/admin/errors/{id}/resolve`, or **رجّعها مفتوحة** →
`PATCH /api/admin/errors/{id}/reopen` (both `diagnostics:resolve`, both 204-ish).

Client reports arrive on the `@Public()` `POST /api/errors`, body
`{ kind, route (starts '/', ≤512), message (1–1000), digest? ≤200, stack? ≤4000 }`.

---

### 4.29 `/admin/audit` — سجل النشاط

`audit:read`. `GET /api/admin/audit?{params}` → `listResponse(AuditEntrySchema)`, and
`GET /api/admin/audit/verify` behind a button.
URL state (`auditCache`): `page`, `perPage`, `action[]` (repeated), `resourceType`, `actorUserId`,
`outcome`.

h1 **سجل النشاط**, lead
«كل تغيير في لوحة التحكم بيتسجل هنا، ومتسلسل بحيث أي تعديل عليه بعد كده بيتكشف.»

**Verify banner** — the chain check is **not** run on page load: «السجل كبير — دوسة على الزرار بتتحقق من السلسلة».
Button **تحقق من السلسلة** / «جارٍ التحقق…» → «سلسلة السجل سليمة» + «{n} صف», or
«سلسلة السجل اتكسرت» + «أول صف مكسور: {id}».

**Entry**
```
id occurredAt actorUserId|null actorEmail|null actorIp|null
action(AuditAction) resourceType(string) resourceId|null
outcome('success'|'failure'|'denied') metadata(unknown|null) prevHash|null hash
```
Columns **الوقت** · **المستخدم** (`null` ⇒ **النظام**) · **الإجراء** · **العنصر** · **النتيجة** ·
**تفاصيل** (**اعرض التفاصيل**) · **البصمة**.
Outcomes **نجح** / **فشل** / **اتمنع**.
Filters **الإجراء** / **نوع العنصر** / **المستخدم** / **النتيجة**, each with **الكل**.

`AUDIT_ACTIONS` (99 values) — the full closed list, because the filter is only usable if the client
knows it:
`course:create|update|publish|unpublish|delete`, `section:update|reorder`, `term:update|close`,
`lesson:create|update|reorder|delete`, `enrollment:override`, `question:publish`,
`quiz:publish|answer-edit|move`, `settings:update`, `branding:update`, `flag:update`,
`nav:create|update|archive|restore|reorder`,
`home-block:create|update|archive|restore|reorder|publish|unpublish`,
`media:upload|archive|restore|delete|replace`, `profile:avatar-upload`,
`taxonomy:create|update|archive`,
`student:update|role-change|ban|unban|delete|set-password|grant-course|revoke-course`,
`attempt:unlock`, `news:create|update|publish|unpublish|delete`,
`campaign:create|update|start|pause|cancel|delete`, `whatsapp:link|unlink`,
`payment:submit|approve|reject|auto-approve`,
`transfer:ingest|dismiss|learn-address`, `book-order:auto-pay`,
`payment:admin-subscribe|admin-cancel-subscription|finance-edit-amount|finance-edit-dates|finance-cancel`,
`book-order:submit|pay|ship|deliver|reject|delete|restore|admin-create|update`,
`book:create|update|delete`, `expense:create|update|delete`,
`lesson:set-homework|remove-homework`, `homework:accept|return`.

`resourceType` values (`AUDIT_RESOURCES`, free text in the column so a new resource needs no
migration, closed here so the filter and every writer agree on spelling):
`site_settings`, `feature_flags`, `navigation_items`, `home_blocks`, `news_posts`, `media_assets`,
`lesson_resources`, `users`, `courses`, `course_sections`, `course_terms`, `lessons`,
`enrollments`, `question_versions`, `quizzes`, `quiz_attempts`, `taxonomy`, `payment_submissions`,
`incoming_transfers`, `book_orders`, `expenses`, `books`, `homework_submissions`.

⚠️ `audit_log` is **INSERT-only** at the database level (a row-level `42501` on any UPDATE or
DELETE). Anything on mobile that "tidies up" an audit row will fail.

---

### 4.30 The quiz / question-bank screens

These five routes are reached from the course editor, not from the sidebar.

#### `/admin/questions` — بنك الأسئلة (`question:write`)
`GET /api/admin/questions` and `GET /api/admin/questions/categories` in parallel.
h1 **بنك الأسئلة**, button **سؤال جديد**, empty **مفيش أسئلة في البنك لسه**,
search **دور بالنص...** (and **دور على سؤال...** in the picker dialogs).
Each row: the stem stripped of HTML, then `{category.name} · {type label}`, and a badge —
«نسخة {n}» when published, else **مسودة**. Category tools: **فئة جديدة**, placeholder
«اسم الفئة», empty **مفيش فئات لسه — أضف واحدة**; `GET|POST /api/admin/questions/categories`.

Question types (`copy.quizAdmin.types`):
`mcq_single` **اختيار من متعدد — إجابة واحدة** · `mcq_multi` **اختيار من متعدد — أكتر من إجابة** ·
`true_false` **صح أو خطأ** · `short_answer` **إجابة قصيرة** · `ordering` **ترتيب** ·
`essay` **سؤال مقالي**.

#### `/admin/questions/new` and `/admin/questions/[bankEntryId]`
`GET /api/admin/questions/{bankEntryId}` (`adminGetOrNotFound`) + the category list.
h1 **سؤال جديد** / **تعديل السؤال**.
Fields: **التصنيف** · **نص السؤال** · **الشرح بعد الإجابة** · **ملاحظات للمصحح** ·
**نوع السؤال** · **الاختيارات** (+ **أضف اختيار** / **حذف الاختيار** / **الإجابة الصحيحة** /
**تعليق على الاختيار** / **وزن الاختيار** — the last behind **وزن الاختيار (متقدم)**) ·
**نموذج الإجابة** + **أضف نموذج إجابة** + **يفرّق بين الحروف الكبيرة والصغيرة** (hint
«علامة * بتنوب عن أي جزء من الإجابة») · **درجة السؤال** · **أقل عدد كلمات** / **أكبر عدد كلمات**.
For `ordering`: **العناصر بالترتيب الصحيح — ده هو المفتاح. الطالب بيشوفها متبعثرة ويرتبها.**
Keyboard hint: «Ctrl/⌘+Enter للحفظ — Escape للإغلاق — Enter في آخر اختيار يضيف اختيار جديد».
Buttons **حفظ**, **انشر السؤال** (`POST /api/admin/questions/{versionId}/publish`), and after
publishing «السؤال اتنشر — أي تعديل بعد كده هيعمل نسخة جديدة»; **نسخة من السؤال**
(`POST /api/admin/questions/{bankEntryId}/duplicate`) appends the suffix «(نسخة)».
Bulk: **استيراد سريع** → `POST /api/admin/questions/bulk`, hint
«الصق الأسئلة، كل سؤال في فقرة، وحدد الإجابة بسطر ANSWER أو الإجابة», preview
«معاينة {n} سؤال», commit **أضف الأسئلة للبنك**. The example pasted into the dialog is:
```
سؤال ١: عاصمة مصر إيه؟
A. القاهرة
B. الإسكندرية
C. أسوان
ANSWER: A

سؤال ٢: النيل بيجري من الجنوب للشمال
TYPE: true
A. صح
B. خطأ
ANSWER: A

سؤال ٣: رتّب من الأسرع للأبطأ
النوع: ترتيب
A. CPU
B. Cache
C. RAM
D. Storage
```
(the ordering block has no ANSWER line on purpose — the items ARE the answer, in written order).

#### `/admin/quizzes/lesson/[lessonId]`
A **redirector**: `GET /api/admin/quizzes/lesson/{lessonId}`; if a quiz exists it redirects to
`/admin/quizzes/{id}`, otherwise it `PUT`s the default `QuizSettingsSchema`
(with `DEFAULT_REVIEW_OPTIONS`) to create one and then redirects.

#### `/admin/quizzes/[quizId]` — إعدادات الامتحان (`quiz:write`)
`GET /api/admin/quizzes/{quizId}` + `GET /api/admin/questions/categories`, in parallel (the
categories feed the embedded "write a new question" dialog; fetching them from inside the dialog
would leave an empty select on a form already being typed into).
```
id lessonId isCourseExam isPublished sumMarks improvementSumMarks settings
slots[{ id, paper 'original'|'improvement', position, maxMark, kind 'question'|'pool',
        bankEntryId|null, type: QuestionType|null, stemHtml|null,
        poolName|null, poolPickCount|null }]
```
⚠️ `type` is parsed with **`QuestionTypeSchema`**, not a hand-written literal list — the list this
replaced silently lacked `ordering`, so the first exam containing one would have failed the parse
and the builder page for that quiz would throw rather than render.

h1 **إعدادات الامتحان**, `copy.quiz.totalMarks` under it, **انشر الامتحان** at the end of the row.
Settings labels: **مدة الامتحان بالدقايق** · **يفتح من** · **يقفل في** · **نسبة النجاح** ·
**الامتحان من كام درجة** · **رتّب الأسئلة عشوائيًا** · **رتّب الاختيارات عشوائيًا** ·
**التنقل بين الأسئلة** (**حر** / **بالترتيب**) · **لما الوقت يخلص** (**يتسلّم تلقائيًا** /
**مهلة إضافية للتسليم** / **المحاولة تتلغي**) · **مهلة التسليم بالثواني** ·
**إيه اللي الطالب يشوفه** (the review matrix) with **رجوع للإعداد الافتراضي**.
Review windows: **أثناء المحاولة** / **بعد التسليم مباشرة** / **بعد كده والامتحان مفتوح** /
**بعد ما الامتحان يقفل**. Flags: **إجابته** / **صح ولا غلط** / **الدرجات** /
**تعليق كل اختيار** / **الشرح العام** / **الإجابة الصحيحة** / **تعليق النتيجة**.
Note «كل كويز ليه محاولة واحدة. مفيش إعادة.»

**Two papers.** **اسمح بامتحان تحسين** (hint
«الطالب ياخد محاولة واحدة زيادة على ورقة تانية، وأعلى درجة هي اللي بتتحسب.») is rendered **only on
a course final exam** — elsewhere «التحسين متاح للامتحان النهائي بس».
Paper switch **الورقة اللي بتحرّرها** with **الورقة الأصلية** / **ورقة التحسين**; per-paper
«{n} سؤال · {marks} درجة»; empty paper «الورقة دي لسه فاضية — محتاجة أسئلة قبل النشر.»
Publish guards: «مينفعش تنشر امتحان بتحسين وورقة التحسين فاضية.» and
«ورقة التحسين فيها {n} سؤال موجود في الورقة الأصلية. غيّرهم عشان التحسين يبقى امتحان حقيقي.»

**Slots**: **أسئلة الامتحان**, empty **مفيش أسئلة في الامتحان لسه**, reorder hint
«اسحب السؤال عشان تغيّر ترتيبه», **أضف سؤال من البنك**, **أضف مجموعة عشوائية**
(**اسم المجموعة**, **عدد الأسئلة المسحوبة**, **درجة كل سؤال في المجموعة**),
**حذف السؤال من الامتحان**, and an in-place editor per slot: **فتح السؤال** / **قفل السؤال** /
«بنجيب السؤال…» / «مقدرناش نجيب السؤال» / «نجرّب تاني» / **الدرجة في الامتحان ده**
(«الدرجة مااتحفظتش» on failure).
Two warnings that must appear **before** typing, not after saving:
«السؤال ده مستخدم في {n} امتحان — أي تعديل هنا بيتغيّر فيهم كلهم.» and
«التعديل اتحفظ كمسودة — الطالب لسه شايف النسخة القديمة لحد ما تنشره.»
New-question-here flow: **سؤال جديد** → «السؤال اتضاف للامتحان»; partial failures
«السؤال اتحفظ في البنك بس مانشرش. افتحه من بنك الأسئلة واضغط «انشر السؤال».» and
«السؤال اتحفظ واتنشر بس ماتضافش للامتحان. ضيفه من «أضف سؤال من البنك».»
Endpoints: `POST|DELETE /api/admin/quizzes/{quizId}/slots[/{slotId}]`,
`PATCH /api/admin/quizzes/{quizId}/slots/order`,
`PATCH /api/admin/quizzes/{quizId}/slots/{slotId}`,
`POST /api/admin/quizzes/{quizId}/pools`, `PUT /api/admin/quizzes/lesson/{lessonId}`,
`PATCH /api/admin/quizzes/{quizId}/lesson` (move a quiz to another lesson).
Footer links: **محاولات الطلاب**, **تحليل الامتحان**, **بنك الأسئلة**.

#### `/admin/quizzes/[quizId]/attempts` — محاولات الطلاب (`attempt:read`)
`GET /api/admin/quizzes/{quizId}/attempts` (+ `q`, `needsGradingOnly`).
Search **دور بالاسم...**, toggle **محتاج تصحيح بس**, submit **دور بالنص...**;
empty `copy.common.empty`. Same state labels as §4.14. Actions **فتح المحاولة**,
**ارجّع المحاولة للطالب**, **امنح محاولة إضافية**, **امنح وقت إضافي** (**دقايق إضافية**).
Link to **تحليل الامتحان**.

#### `/admin/quizzes/[quizId]/analytics` — تحليل الامتحان (`analytics:read`)
`GET /api/admin/quizzes/{quizId}/analytics` (`adminGetOrNotFound`). With no attempts the page
renders `copy.common.empty`.
Tiles **محاولات الطلاب** («{n} محاولة») · **متوسط الدرجات** · **الوسيط** · **نسبة النجاح**.
Sections **توزيع الدرجات** and **تحليل الاختيارات**, with per-item **معامل السهولة**,
**معامل التمييز**, columns `copy.quiz.question` / **عدد المحاولات**, and «{n} اختاروه» per
distractor. When the sample is small: «محتاجين {n} محاولة على الأقل عشان الأرقام تبقى معبّرة».

---

## 5. Prioritisation — what to build first

Justification is drawn from three signals that are in the code, not from opinion: **which screens
have a live badge/count endpoint**, **where each item sits in `ADMIN_NAV`**, and **which screens
default to a "waiting on me" filter** rather than to "everything".

### Tier 1 — daily, and someone is waiting on the other end

Every screen with a **polled count** is here by construction. Four count endpoints exist, and they
badge exactly four nav rows; three of the four also feed the overview's «محتاج تصرّف» band.

| Screen | Evidence |
|---|---|
| `/admin/payments` | badge `GET …/submissions?status=pending&perPage=10`; overview tile «دفعة مستنية مراجعة»; default filter is `pending`, not `all`; nav position 4 |
| `/admin/books` | badge `GET …/book-orders?status=paid&perPage=10`; overview tile «كتاب لسه ما اتشحنش»; default tab `paid` = "owed to somebody right now"; nav 7; the only screen with **bulk** actions and an export built for a courier |
| `/admin/inbox` | badge `GET /api/admin/conversations/unread-count`; overview tile «رسالة مستنية رد»; default filter `unread`; a GET marks the thread read, so the count and the screen cannot disagree; nav 11 |
| `/admin/homework` | badge `GET /api/admin/homework/pending-count`; default filter `pending`; nav 8 |
| `/admin/transfers` | no badge, but it is the **evidence** behind `/admin/payments` and sits directly beneath it (nav 5); default filter `unmatched` = "money nothing explains"; its ingest can approve a pending claim outright and therefore revalidates `/admin/payments` |
| `/admin/students` | nav 3, the destination of every name link on every other Tier-1 screen (payments, books, inbox, homework, transfers all link into it); holds the ban / password / manual-subscribe / grant controls |

Build order inside Tier 1: **payments → transfers → books → homework → inbox → students detail**.
Payments and transfers are one workflow (a claim and its money); books is the only one with a
physical deadline; inbox and homework both need attachments/photos, which is the largest mobile
lift.

### Tier 2 — weekly, and it is money or content

- `/admin/finance` + `/admin/finance/subscriptions` + `/admin/finance/expenses` — nav 6, but not a
  queue: nobody is waiting. Read-mostly, with three write dialogs (edit amount, edit dates,
  cancel + refund).
- `/admin/courses` and `/admin/courses/[id]` — nav 2 (top of التدريس) and by far the largest
  surface in the admin: autosave, drag-and-drop on three levels, video probing, an embed check, a
  resource uploader, the homework block and the exam gate. High value, high cost.
- `/admin/books/catalog` — opened when a title or a price changes, not daily (its own file says so).
- `/admin/attempts` — nav 9; opened when a student says an exam went wrong.
- `/admin/outreach` — nav 12; a log to check, plus 8 switches.
- `/admin/inbox/questions` — the assistant's backlog; read when writing new knowledge entries.

### Tier 3 — occasional / configuration

`/admin/analytics` (+ 4 sub-routes), `/admin/home`, `/admin/navigation`, `/admin/media`,
`/admin/news`, `/admin/settings/branding`, `/admin/marketing/*`, `/admin/questions*`,
`/admin/quizzes/*`.
`/admin/analytics` sits in `teaching` (nav 10) because it is about students, but it has **no
badge**, **no default "needs me" filter** and its own copy admits every number counts rows that
live on another screen.

### Tier 4 — rare, and mostly read-only

- `/admin/taxonomy` (+ 4 editors) — nav 13, last in التدريس. Reference data that changes when the
  ministry changes, i.e. roughly never. Governorates cannot even be deleted.
- `/admin/flags` — 7 switches, nav 20.
- `/admin/errors` — nav 21. **Rare but urgent**: the first screen opened during an incident, which
  is why it sits beside the audit log. Read-mostly (one resolve/reopen button).
- `/admin/audit` — nav 22, dead last. Opened after the fact, and its chain verification is
  deliberately behind a button because the table is large.

### A caution about "rare"

Nav order is a strong signal, but two of the four «النظام» screens are the ones you most want on a
phone precisely *because* they are rare: `/admin/errors` and `/admin/flags` are what an owner
reaches for at 11pm when a student says the site is broken. A read-only errors list plus a flag
toggle is a very cheap, very high-leverage mobile screen.

---

## 6. Mobile gaps — what has to change before a Flutter client can do this

1. **CSRF is cookie-derived and browser-shaped.** `csrfFromCookie()` reads the `CSRF_COOKIE` and
   echoes it in `CSRF_HEADER` on every write; a native client with a cookie jar can do this, but
   the flow is undocumented outside `apps/web/lib/csrf.ts`. Either expose the token on a small
   endpoint or accept a bearer token for native clients.
2. **Session is a browser cookie.** better-auth issues it on the web login route; there is no
   documented token exchange for a native app. A mobile client needs either a first-class session
   endpoint or a documented cookie-jar contract, plus refresh semantics.
3. **Server Actions are not an API.** Around 40 of the admin's writes go through Next.js Server
   Actions (`.../actions.ts` in almost every folder), which wrap the real REST endpoints. The REST
   endpoints all exist, but the **error mapping, the 409/403 discrimination, the `revalidatePath`
   choreography and several multi-call flows live only in those action files** — e.g.
   `createCourseAction` is 3 calls (course + section + lesson), `seedDefaultHomeBlocksAction` is
   N calls, `bulkDeleteStudentsAction` interprets a partial-success report. Flutter has to
   re-implement each of these.
4. **Two private-image patterns rely on browser cookie auth.** Payment screenshots
   (`/api/admin/payments/submissions/{id}/screenshot`), book-order screenshots, homework images
   (`/api/admin/homework/images/{id}`) and message attachments are session-gated binary routes with
   no signed-URL variant. Flutter's image loaders need an authenticated fetch (or the API needs
   short-lived signed URLs).
5. **No push for the four admin queues.** The counts are 30-second polls plus **Web Push**
   (`sw.js`'s `push` handler + `NotificationsService.announce`). Native needs FCM/APNs registration
   endpoints; today `POST /api/me/push/subscribe` takes a **Web Push** subscription only.
6. **The SSE notification stream** (`GET /api/me/notifications/stream`) is an EventSource. Native
   can consume SSE, but background delivery has to be push, not a held connection.
7. **No offline/optimistic story anywhere.** Every admin read is `no-store` by explicit design.
   Mobile has to decide, per screen, whether a stale-while-revalidate cache is acceptable — and for
   the review queues it is *not*, because approving a claim twice is a real failure.
8. **Uploads are multipart from the browser, direct to the API.** Media (8 MiB, 5 MIME types,
   50 MP), documents (95 MiB), homework images, payment/book screenshots and conversation
   attachments. Flutter needs the same limits enforced client-side (the API's refusals are mapped
   to four distinct Arabic strings per surface) and a progress callback — the upload form shows
   «جارٍ الرفع… {n}%».
9. **HEIC.** iPhone photos are HEIC and the API rejects them
   («صور الآيفون (HEIC) لازم تتحوّل الأول»). A Flutter admin taking a photo of a transfer or a
   homework page must transcode to JPEG/WebP client-side, or the API must learn HEIC.
10. **The image cropper is a DOM/canvas component.** `CoverCropper` + the re-crop flow
    (`POST /api/admin/media/{id}/replace`) has no native equivalent; aspect presets are
    square / 1.91:1 / free.
11. **The rich admin editors have no mobile analogue yet**: the course editor's autosave +
    three-level drag-and-drop, the inline-edit title pattern, the quiz builder's slot list and
    review matrix, the home-block composer, and the news Markdown editor with live preview. Each
    needs a deliberate mobile redesign, not a port.
12. **Voice notes** in the inbox require microphone permission; on the web this was blocked by a
    `Permissions-Policy` header. Native needs its own permission strings (`NSMicrophoneUsageDescription`,
    `RECORD_AUDIO`) and the same upload path.
13. **Marketing device pairing renders a QR the admin scans with *another* phone.** On a phone
    that is awkward: `state: 'linking'` returns a `qr` string meant to be displayed on a second
    screen. Either surface it large enough to scan from another device, or add a share/export.
14. **CSV/XLSX exports are `GET` routes that stream a file**
    (`/api/admin/analytics/export/lessons.csv`, `.../students.csv`,
    `.../lessons/{id}/roster.csv`, `/api/admin/book-orders/export`). Flutter needs authenticated
    download + a share sheet, not an `<a href>`.
15. **Rate limiting is per-identity and admin bulk reads trip it.** Repeated admin GETs 429 after
    roughly 60/minute; a mobile client that fans out per-row requests (e.g. one image fetch per
    homework submission) will hit it. Batch, or paginate harder.
16. **`window.confirm` appears in three places** (nav archive, ship one order, deliver one order,
    reopen an attempt). These must become real dialogs on mobile; a native `confirm` equivalent
    does not exist.
17. **Two id shapes.** `userId` is a better-auth nanoid (`z.string()`); everything else is a UUID.
    A Dart model that types every id as a UUID will 400 on every real student.
18. **`deleteIdentityMatches` must be ported exactly**, including the Egyptian-phone folding and
    the `/^\+?[\d\s()-]+$/` guard. A naive string compare makes the delete dialog impassable for
    every phone-identity account; a naive digit compare turns it into a substring match.
19. **The audit log is INSERT-only** (row-level `42501` on UPDATE/DELETE). Any mobile "clean up"
    affordance is impossible by design.
20. **Arabic + RTL + mixed-direction runs.** Phone numbers, emails, routes, digests, hashes,
    storage keys and stack traces are all forced `dir="ltr"` inside RTL paragraphs. Flutter needs
    `Directionality`/`textDirection: TextDirection.ltr` on exactly those spans, plus
    `FontFeature('tnum')` wherever the web uses `tabular-nums`.
21. **The two digit systems** (`ar-EG` vs `ar-EG-u-nu-latn`) are inconsistent across admin screens.
    Pick one deliberately for mobile and record the decision, because the web will look different.
22. **Theme.** Admin pages are theme-aware (light/dark) with a token system where dark mode uses an
    inset top highlight instead of shadows. A Flutter theme must reproduce both, not just dark.
23. **Deep links.** Every filter, tab, sort and page is URL state
    (`?status=`, `?filter=`, `?sort=`, `?stream=`, `?year=`, `?q=`, `?page=`, `?archived=1`,
    `?escalated=1`, `?days=`, `?courseId=`). Mobile needs equivalent route arguments if
    "send a colleague this search" is to survive.
24. **`/admin/assistant` is a permanent redirect** to `/admin/inbox/questions`; mobile routing
    should honour it so old links keep working.
25. **Permission gating is currently vacuous** (`admin: '*'`). If mobile ever ships a
    limited-permission staff role, every screen's `permission` field in §2.2 becomes load-bearing
    and the four pollers must be conditionally mounted exactly as the layout does — otherwise a
    role without `payment:read` polls a 403 every 30 seconds forever.
