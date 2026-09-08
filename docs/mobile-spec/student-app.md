# Student App — screen-by-screen specification for the Flutter client

Scope: everything under `apps/web/app/(app)/` and `apps/web/app/(auth)/`.
Every claim below cites a repo-relative path. Arabic strings are quoted verbatim
and the copy key is named; the key path is into the object exported from
`packages/contracts/src/copy/ar.ts` (re-exported as `copy` from
`@ayman/contracts/copy`). Placeholders like `{n}` are literal — see
"Copy interpolation" below.

---

## 0. Global platform facts

### 0.1 API base, prefix, transport

- NestJS API, global prefix `api` (`apps/api/src/main.ts:32` → `app.setGlobalPrefix('api')`).
  Every path in this document therefore begins `/api/`.
- The web client talks to the API **same-origin** in the browser and to
  `process.env.API_ORIGIN ?? 'http://localhost:3300'` on the server
  (`apps/web/lib/api.ts` → `SERVER_BASE`, `resolve()`).
  `resolve()` throws if a path does not start with `/api/`.
- Server-side fetches carry a 15 s timeout (`SERVER_TIMEOUT_MS = 15_000`,
  `apps/web/lib/api.ts`); a timeout is surfaced as `ApiRequestError(504)` with
  `digest = 'AYMAN_UPSTREAM_TIMEOUT'`.

### 0.2 Session & CSRF

- Auth is **cookie session** (better-auth). All state-changing requests send
  `credentials: 'same-origin'` plus the CSRF header
  (`apps/web/lib/api.ts` → `apiPost`, `apiPatch`, `apiPut`, `apiPutTyped`,
  `apiPostVoid`, `apiDelete`).
- CSRF constants (`apps/web/lib/csrf.ts`):
  - cookie name: `__Host-csrf`
  - header name: `x-csrf-token`
  - value is read from the cookie and echoed in the header on every
    `POST/PATCH/PUT/DELETE`. The API's `CsrfGuard` requires it.
  - Server-to-server calls (Server Actions) send the cookie value or the literal
    `'server-action'` (`apps/web/lib/api-server.ts` → `apiCommand`, `apiSend`).
- Auth endpoints (better-auth, `apps/web/lib/auth-client.ts`):
  - `POST /api/auth/sign-up/email` — body `{ name, email?, password, phoneNumber }`
  - `POST /api/auth/sign-in/email` — body `{ email, password }`
  - `POST /api/auth/sign-in/phone-number` — body `{ phoneNumber, password }`
  - `POST /api/auth/sign-out` — body `{}`
  - `POST /api/auth/sign-in/social` — body `{ provider, callbackURL, errorCallbackURL }`
  - Error payloads may carry `code`. Two codes are branched on:
    `'ACCOUNT_BANNED'` (`BANNED_ACCOUNT_CODE`, may carry `reason`) and
    `'PHONE_ALREADY_REGISTERED'` (`PHONE_TAKEN_CODE`).

### 0.3 Rate limits (must shape mobile retry/poll strategy)

`apps/api/src/app.module.ts:86-114`:

| bucket | window | limit | tracker |
|---|---|---|---|
| `short` | 1 s | 10 | per user/session |
| `medium` | 60 s | 60 | per user/session |
| `long` | 3600 s | 1000 | per user/session |
| `ip` | 60 s | 1200 | per IP |

The dashboard alone issues **ten parallel reads** (see §7); a mobile client that
fans out the same way is at the `short` ceiling on one screen.

### 0.4 Route protection / redirect matrix

`apps/web/proxy.ts`.

`PROTECTED_PREFIXES` (exact prefix match, `path === prefix || path.startsWith(prefix + '/')`):
`/dashboard`, `/path`, `/onboarding`, `/settings`, `/admin`, `/quizzes`,
`/library`, `/profile`, `/results`, `/foundations`, `/playground`, `/store`,
`/notifications`.
Plus `PROTECTED_LESSON_PATTERN = /^\/courses\/[^/]+\/lessons(?:\/|$)/`.

Auth routes (not protected, but redirect when signed in): `/login`, `/register`.

`decideRedirect(pathname, { authenticated, onboardingCompleted })`
(`apps/web/proxy.ts:355`) returns one of
`'login' | 'onboarding' | 'dashboard' | 'next' | null`:

```
anonymous             → /login, /register                    ⇒ null (render)
anonymous             → any protected route                  ⇒ 'login'
onboarding incomplete → any OTHER protected route            ⇒ 'onboarding'
onboarding incomplete → /onboarding                          ⇒ null
onboarding incomplete → /login, /register                    ⇒ 'onboarding'
onboarding complete   → /onboarding                          ⇒ 'dashboard'
onboarding complete   → any other protected route            ⇒ null
onboarding complete   → /login, /register                    ⇒ 'next'
```

- `'login'` builds `/login?next=<pathname+search>`.
- `'onboarding'` forwards any pending `next` as `/onboarding?next=…`.
- Auth state is resolved by one round trip: **401 ⇒ no session; 200 ⇒ body carries
  `onboardingCompleted: boolean`** (`apps/web/proxy.ts:379-404`).
  The Flutter client should reproduce this with `GET /api/profile/me`
  (`ProfileMeSchema` carries `onboardingCompleted`).
- `/dev/*` is dev-only and 404s in production (`isDevOnlyRoute`).

**Mobile equivalent:** on cold start, call the session/profile probe; route to
Login → Onboarding → Welcome → Dashboard in that order, honouring a stored
`next` deep link.

### 0.5 Copy interpolation & formatting

- `formatCopy(template, vars)` replaces `{key}` occurrences
  (`packages/contracts/src/format.ts`). Unknown keys are left as-is.
  Some call sites use plain `String.replace('{n}', …)` — identical semantics.
- `formatMark(value)` = `String(Math.round(value * 100) / 100)` — marks print with
  at most 2 decimals, no trailing zeros.
- Durations (`apps/web/lib/format.ts`):
  - `formatDuration(sec)` → `H:MM:SS` when hours > 0, else `M:SS`. Negative/NaN → 0.
  - `formatRemaining(sec)` → `formatDuration(sec)` under 60 s, otherwise rounds **up**
    to the next whole minute then formats.
  - `formatHoursMinutes(sec)` → `«{m} د»`, or `«{h} س»` / `«{h} س {m} د»` at ≥ 60 min.
- Dates: `new Intl.DateTimeFormat('ar-EG-u-nu-latn', …)` — Arabic locale but
  **Latin digits**. Two variants in use:
  - `{ dateStyle: 'medium', timeStyle: 'short' }` — notifications
    (`apps/web/lib/notification-view.ts`), devices (`apps/web/components/settings/devices-list.tsx`),
    activity feed.
  - `{ dateStyle: 'medium' }` — book orders (`apps/web/lib/book-order-view.ts`).
- Numbers on screen are Latin digits everywhere except a handful of hand-written
  Arabic-Indic literals in copy (e.g. `copy.quiz` sittings tile prints `'٠'`/`'١'`/`'٢'`
  as literals — `apps/web/app/(app)/quizzes/[lessonId]/page.tsx`).

### 0.6 Direction, typography, breakpoints

- Document is **RTL** throughout. Every layout uses logical properties
  (`border-e`, `ps-`, `inline-size`, `inline-start`). Nothing in the student area
  uses `left`/`right`.
- Latin runs are isolated with `dir="ltr"`: email in the account menu, phone
  fields, the playground editor, the error `digest`, the `404` string,
  `term.en` in Foundations.
- Tailwind breakpoints in use (viewport widths):
  `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536; plus custom media queries
  at `48rem` (768), `64rem` (1024), `80rem` (1280), `30rem` (480), `47.999rem`
  (max-width, i.e. below `md`).
- Shell tokens (`apps/web/app/globals.css:965-973`):
  `--rail-w: 296px`, `--rail-w-collapsed: 76px`, `--topbar-h: 56px`.
- Page width tokens: `--w-app` (grid screens), `--w-shell` (1152px reading screens),
  `--w-prose` (single-column reading).
- Touch targets: **44 px minimum below `md`** — enforced on `.topbar__actions > *`
  (`min-block-size/inline-size: 2.75rem`), the menu button (`h-11`), the
  notification "mark all" text button (`min-h-11 md:min-h-0`), submit-dialog
  jump chips (`size-11 md:size-8`), `.nav-chip` (44 → 36 above `md`).
- Colour semantics (enforced product-wide):
  - **amber / accent** = the one thing to press, and "where you are" (progress).
  - **ember (`--e-*`, `.stage`, `study-tint`)** = structure, never pressable.
  - **green `--ok` / red `--err`** = quiz correctness ONLY
    (`result-header.tsx`, `review-question.tsx`), plus the single green
    "course done" word on a library card.
  - Text on an accent fill is the fixed near-black `#1A1206`.

---

## 1. The signed-in shell

Files: `apps/web/app/(app)/layout.tsx`, `apps/web/components/app/student-shell.tsx`,
`student-rail.tsx`, `student-topbar.tsx`, `student-nav-list.tsx`,
`student-nav-items.ts`, `rail-courses.tsx`, `rail-toggle.tsx`,
`account-menu.tsx`, `account-menu-client.tsx`, `chrome-unless-attempt.tsx`.

### 1.1 Structure

```
StudentShell (client, reads pathname)
├─ if isAttemptRoute(pathname) → renders children ONLY (no chrome at all)
└─ NotificationStreamProvider (one SSE connection per tab)
   └─ div.shell.product-type  [data-rail-forced="true" on the lesson player]
      ├─ div.app-bloom                      (decorative warm gradient, top of viewport)
      ├─ StudentRail        (aside, hidden below md — `hidden … md:block`)
      │   └─ sticky, h-dvh, flex column, overflow-hidden, p-3
      │      ├─ .rail__head  → BrandLockup (link → /dashboard, no tagline) + RailToggle
      │      ├─ nav[aria-label=copy.nav.mainNav] → StudentNavList (non-footer items)
      │      ├─ .rail__label heading = copy.nav.railCourses  («كورساتي»)
      │      │  └─ scrollable RailCourses list  (min-h-0 flex-1 overflow-y-auto)
      │      └─ footer block (border-t)
      │         ├─ StudentNavFooterList (footer items)
      │         └─ Link "/" with ArrowUpLeft = copy.nav.backToSite
      └─ div.flex.min-w-0.flex-col
         ├─ StudentTopbar (sticky top-0 z-40, border-b, height --topbar-h = 56px)
         └─ div.route-fade[key=pathname] → children
```

`.route-fade` = 220 ms fade + 4 px rise, re-keyed on pathname
(`apps/web/app/globals.css:698-710`). Reduced motion zeroes it globally.

### 1.2 Navigation table — `STUDENT_NAV`

`apps/web/components/app/student-nav-items.ts`. Order is render order.

| # | href | label (copy key) | Arabic | lucide icon | footer? |
|---|---|---|---|---|---|
| 1 | `/dashboard` | `nav.dashboard` | «حسابي» | `LayoutDashboard` | no |
| 2 | `/path` | `nav.path` | «مساري» | `Route` | no |
| 3 | `/results` | `nav.results` | «نتائجي» | `BarChart3` | no |
| 4 | `/library` | `nav.courses` | «الكورسات» | `BookMarked` | no |
| 5 | `/foundations` | `nav.essentials` | «التأسيس» | `Sprout` | no |
| 6 | `/store` | `nav.books` | «الكتب» | `BookOpen` | no |
| 7 | `/playground` | `nav.playground` | «تجربة الكود» | `Terminal` | no |
| 8 | `/profile` | `nav.profile` | «بروفايلي» | `UserRound` | **yes** |
| 9 | `/settings/devices` | `nav.devices` | «أجهزتي» | `MonitorSmartphone` | **yes** |

Plus a fixed trailing link `"/"` with `ArrowUpLeft`, label `nav.backToSite` = «الموقع الرئيسي».

**Active-item rule** — `activeStudentNav(pathname)`:
1. alias map: any path starting `"/courses/"` resolves to `/library`.
2. `/dashboard` matches **exactly**; every other entry matches by `startsWith`.
3. longest matching `href` wins; exactly one item may be current.

**Route rules** (pure string predicates, same file):
- `isAttemptRoute(p)` = `/^\/quizzes\/[^/]+\/attempt\/[^/]+$/` — anchored, so
  `…/review` is NOT an attempt. On a match the entire shell is discarded.
- `isRailForcedCollapsed(p)` = `/^\/courses\/[^/]+\/lessons\/[^/]+/` — the lesson
  player forces the rail to icon width, without overwriting the stored preference.

### 1.3 Rail collapse state

- Preference lives in `localStorage` and is stamped as `html[data-rail="collapsed"|"expanded"]`
  before first paint (`apps/web/lib/rail.ts`, read via `useSyncExternalStore`).
- The route override is `.shell[data-rail-forced="true"]` (emitted only when true).
- CSS (`globals.css:1206-1290`), **all inside `@media (min-width: 768px)`**:
  - `.shell { display:grid; grid-template-columns: var(--rail-w) minmax(0,1fr) }`
  - collapsed/forced → `var(--rail-w-collapsed) minmax(0,1fr)`
  - collapsed hides `.rail__label` (`display:none`), hides `.brand__text`,
    stacks `.rail__head` into a column, centres `.rail__item`.
  - transition `grid-template-columns 160ms` unless reduced motion.
- **Below `md` there is no rail at all** and none of the collapse rules apply
  (they are deliberately guarded — an unguarded rule stripped the labels out of
  the mobile drawer).

### 1.4 Topbar (this is the mobile chrome)

`apps/web/components/app/student-topbar.tsx`.

```
header.topbar  (sticky top-0, z-40, border-b, background var(--n-1);
                backdrop-blur ONLY under @media (pointer: fine))
└─ div  h=var(--topbar-h) 56px, items-center justify-between, gap-3, px-4 md:px-6
   ├─ left cluster (min-w-0, gap-2)
   │   ├─ [md:hidden] Sheet trigger button
   │   │     h-11, Menu icon (size-5) + visible label copy.nav.menuLabel «القائمة»
   │   ├─ [md:hidden] BrandLockup compact (portrait only) → /dashboard
   │   └─ [hidden md:block] h2 = activeStudentNav(pathname)?.labelAr ?? copy.nav.dashboard
   └─ div.topbar__actions (shrink-0, gap-2; every child ≥44px below md)
       ├─ assistant slot   (docked launcher — §19)
       ├─ notifications    (NotificationBell — §13.1)
       ├─ [hidden md:block] ThemeToggle
       └─ accountMenu      (AccountMenuClient)
```

**The page title is deliberately absent below `md`.** Measured at 8 px on a 360 px
phone; instead every route renders its own `<h1>`. The Flutter app must put the
screen name in the page body, not in the app bar.

**Mobile drawer** (`SheetContent`, `md:hidden`, closes on pathname change):
```
SheetTitle → BrandLockup (no tagline)
nav[aria-label=copy.nav.mainNav] → StudentNavList (non-footer items, onNavigate=close)
p.eyebrow = copy.nav.railCourses «كورساتي»
  → the same RailCourses node the rail renders
divider
StudentNavFooterList (onNavigate=close)
Link "/" → copy.nav.backToSite «الموقع الرئيسي»  (h-10 row, ArrowUpLeft)
row: span = copy.theme.toggle «تبديل المظهر» + ThemeToggle   (does NOT close the sheet)
```
Sheet close button label = `copy.common.close` = «إغلاق».

### 1.5 Rail course list — `RailCourses`

`apps/web/components/app/rail-courses.tsx`. Data: `GET /api/me/dashboard`
(`DashboardSchema`), shared per-request via `cache()` (`apps/web/lib/dashboard.ts`).

- **Empty:** one line, `copy.nav.railCoursesEmpty` = «لسه مفيش كورسات».
- **Row (published):** `<Link href=enrolledCourseHref(course)>` with
  - title, `line-clamp-2`, `--fs-text-lg`, `text-fg-muted`
  - a 2 px progress meter, `aria-hidden`, width = `clamp(progressPercent, 0, 100)%`,
    `bg-accent` on `bg-surface-4`.
- **Row (unpublished, `course.published === false`):** a `<span>`, not a link,
  `opacity-60`, `cursor-not-allowed`; second line = `copy.path.closedBadge` = «مقفول مؤقتاً».
- **Skeleton:** 3 rows, each a 16 px bar + a 2 px bar.

`enrolledCourseHref` (`apps/web/lib/course-href.ts`): resumes at
`/courses/{slug}/lessons/{lastLessonId}` when `lastLessonId` is set, otherwise
`/library/{slug}`. It must **never** send an enrolled student to the public
`/courses/{slug}` page.

### 1.6 Account menu

`account-menu.tsx` (server) reads the session; `account-menu-client.tsx` renders.

- Trigger: `aria-label = copy.nav.accountMenu` = «قائمة الحساب»;
  avatar 36 px + name (`hidden … sm:block`, `max-w-[10rem] truncate`) + `ChevronDown`.
  Row height `h-11` below `sm`, `h-9` from `sm`.
- Panel (`align="end"`, `min-w-[16rem]`, class `product-type`):
  - header: avatar 44 px, name (`--fs-text-sm` medium), identity line
    (`dir="ltr"`, `--fs-mono-label`, muted) = email if present else phone
    (`accountIdentityLabel`, `apps/web/lib/session.ts`).
  - separator
  - `/profile` + `UserRound` → `copy.nav.profile` «بروفايلي»
  - `/settings/devices` + `MonitorSmartphone` → `copy.nav.devices` «أجهزتي»
  - `/admin` + `ShieldCheck` → `copy.nav.adminPanel` «لوحة التحكم» — only when
    the session has permission `admin:access`
  - separator
  - `SignOutButton`. Labels: `copy.nav.logout` «تسجيل الخروج»,
    pending `copy.nav.loggingOut` «جارٍ الخروج…», failure toast
    `copy.nav.logoutFailed` «مقدرناش نسجّل خروجك. نحاول تاني.».
    Sign-out **hard-navigates** (`window.location.assign`) so no cached
    authenticated payload survives.
- Fallback while the session read is in flight: a bare 32 px circle,
  `aria-hidden`, **no `aria-label`**.

### 1.7 Shell states

| state | what renders |
|---|---|
| loading (server streaming) | topbar + rail paint immediately; `RailCoursesSkeleton`, `NotificationBellFallback` (empty 36 px span), `AccountMenuFallback` (empty circle) stream in independently |
| running attempt (`/quizzes/:lessonId/attempt/:attemptId`) | **no shell at all** — no rail, no topbar, no bell, no account menu, no assistant. Also suppressed server-side by `ChromeUnlessAttempt` so the three chrome fetches are never issued |
| lesson player | rail forced to 76 px icon width; `RailToggle` hidden |
| error | `apps/web/app/(app)/error.tsx` (§20.1) |
| 404 | `apps/web/app/(app)/not-found.tsx` (§20.2) |

### 1.8 Mobile layout summary (what Flutter must match)

- No persistent rail. Navigation is a **left-edge drawer** (inline-start = right
  in RTL; the Radix sheet slides from the inline start) opened by a labelled
  «القائمة» button in the app bar.
- **There is no bottom navigation bar anywhere in this product.** Do not invent one.
- App bar contents at 360 px: `[القائمة] [portrait] ……… [assistant] [bell] [avatar]`.
  Theme switch is NOT in the bar on phones; it lives in the drawer footer.
- Every `main` below `md` gets `padding-block-end: 5.5rem` so the floating
  assistant does not cover page content (`globals.css:1200-1204`).

---

## 2. `(auth)` shell — `/login`, `/register`

`apps/web/app/(auth)/layout.tsx`, `auth.css`.

```
div.auth-shell            (split screen)
├─ main.auth-pane
│   └─ div.auth-pane__inner   (flex column, gap 32px)
│      ├─ Link "/" aria-label=copy.site.name → BrandLockup (with tagline)
│      └─ {children}
├─ AuthShowcase            (dark panel in BOTH themes; collapses entirely below 62rem)
└─ AssistantSlot (floating variant)
```

**Mobile (< 62rem / 992px): the showcase panel is gone; only the form column renders.**

Showcase copy (`copy.auth.aside`):
- `eyebrow` «منصة أ. أيمن أبو العلا»
- `title` «حسابك هو مكان مذاكرتك كله»
- `body` «الكورسات، الدروس اللي خلصت، درجاتك في كل اختبار، وآخر حتة في المذاكرة — كله بيستناك جوه.»
- `point1` «كل كورساتك في صفحة واحدة»
- `point2` «المشغّل بيفتكر آخر ثانية في الفيديو»
- `point3` «كل درجاتك ومراجعاتك متسجّلة»
- `codeCaption` «welcome.js»

Metadata: `privateRouteMetadata` → `noindex, nofollow` (these pages are crawlable
but must not be indexed).

### 2.1 `/login`

`apps/web/app/(auth)/login/page.tsx`, `apps/web/components/auth/login-form.tsx`.

Query params read on the server: `next`, `error`.
`safeNext(next)` validates it (`apps/web/lib/safe-next.ts`) before anything renders it.

Layout:
```
header.auth-head
  h1.auth-head__title   = copy.auth.login.title      «تسجيل الدخول»
  p.auth-head__sub      = copy.auth.login.subtitle   «نكمّل من المكان اللي وقفنا عنده.»
[if next]  p.auth-notice role=status = copy.auth.login.continueNotice «تسجيل الدخول عشان نكمّل»
[if error] p.auth-notice role=alert, colour --err  = social error (below)
LoginForm
p.auth-switch: copy.auth.switch.noAccount «لسه معملتش حساب؟»
               + Link → /register(?next=…) copy.auth.switch.createAccount «نعمل واحد دلوقتي»
```

Social error mapping (`socialErrorMessage`, same file) — the raw code is never rendered:
- `account_not_linked` → `copy.auth.errors.socialAccountNotLinked` =
  «الإيميل ده مسجّل عندنا بكلمة سر. الدخول بالإيميل وكلمة السر من فوق، مش بجوجل.»
- anything else → `copy.auth.errors.socialGeneric` =
  «مقدرناش نكمّل الدخول بجوجل. نجرّب تاني، أو ندخل بالإيميل وكلمة السر.»

**Form** (`<form method="post" noValidate>` — the `method="post"` is a credential-leak
guard for a pre-hydration submit; a Flutter client is unaffected but the API shape matters):

| field | label key / Arabic | input | autocomplete | validation |
|---|---|---|---|---|
| `identifier` | `auth.fields.identifier` «رقم الموبايل أو البريد الإلكتروني» | `type=text`, `dir=ltr` | `username` | `z.string().trim().min(1, 'رقم موبايلك أو إيميلك')` |
| `password` | `auth.fields.password` «كلمة المرور» | `type=password` | `current-password` | `z.string().min(1, 'كلمة المرور مطلوبة')` |

Schema: `LoginSchema` in `packages/contracts/src/auth.ts` (`.strict()`).

**Identifier routing** — `resolveLoginIdentifier(identifier)` (same file):
1. trim.
2. contains `@` → `{ kind: 'email' }`.
3. else `normalizeEgyptianPhone(trimmed)`; if it parses → `{ kind: 'phone', value: E.164 }`.
4. else → `{ kind: 'email' }` **deliberately**, so an unparseable input earns the
   same generic 401 as a wrong password rather than a distinguishable client branch.

Submit → `POST /api/auth/sign-in/phone-number { phoneNumber, password }`
or `POST /api/auth/sign-in/email { email, password }`.

Failure handling:
- `code === 'ACCOUNT_BANNED'` → a single joined string:
  `copy.auth.errors.loginBanned` «حسابك موقوف دلوقتي، والدخول مقفول.»
  + (when `error.reason` is present) `formatCopy(copy.auth.errors.loginBannedReason, {reason})`
    = «السبب: {reason}»
  + `copy.auth.errors.loginBannedContact` «ولو فيه غلط، كلمة للمدرّس وهيتظبط.»
- **everything else** (wrong password, unknown account, progressive lock, network)
  → one string, `copy.auth.errors.login` = «البريد أو كلمة المرور مش مظبوطين».
  Never distinguish further; the API returns byte-identical responses across
  those cases and the UI must not undo that.
- Rendered as `<p role="alert">` in `--err`.

Success → `resolvePostLoginDestination(next)` then a **hard navigation**
(`window.location.assign`) — the client router cache holds anonymous payloads.

Button: `copy.auth.actions.login` «دخول» / pending `copy.auth.actions.loginPending`
«بندخّلك…»; disabled while submitting (this is also what absorbs the server's
progressive delay of up to 30 s from the 4th attempt; there is no client timeout).

`AuthProviders` below the button: divider `copy.auth.providers.divider` «أو»,
Google button `copy.auth.providers.google` «المتابعة بحساب جوجل».

### 2.2 `/register`

`apps/web/app/(auth)/register/page.tsx`, `apps/web/components/auth/register-form.tsx`.

```
header.auth-head
  h1 = copy.auth.register.title    «إنشاء حسابك»
  p  = copy.auth.register.subtitle «دقيقة واحدة وتكون جوه أول محاضرة.»
RegisterForm
p.auth-switch: copy.auth.switch.haveAccount «عندك حساب؟»
               + Link → /login(?next=…) copy.auth.switch.login «الدخول من هنا»
```

Fields (`RegisterSchema`, `packages/contracts/src/auth.ts`, `.strict()` + superRefine):

| field | label / Arabic | input | autocomplete | rule |
|---|---|---|---|---|
| `name` | `auth.fields.name` «الاسم الكامل» | text | `name` | trim, min 2 «الاسم الكامل مطلوب», max 120 «الاسم طويل جدًا» |
| `phone` | `auth.fields.phone` «رقم الموبايل» | `type=tel`, `dir=ltr`, `inputMode=numeric`, placeholder `auth.fields.phonePlaceholder` «01012345678» | `tel` | `egyptianPhone('رقم الموبايل مطلوب')` — **transforms to E.164** |
| `email` | `auth.fields.emailOptional` «البريد الإلكتروني (اختياري)» + hint `auth.fields.emailOptionalHint` «مش لازم. المنصة مابتبعتش إيميلات — الرقم هو اللي بيتم الدخول بيه.» | email, `dir=ltr` | `email` | optional; `''`/undefined ⇒ omitted entirely; else `z.email('أدخل بريدًا إلكترونيًا صحيحًا')` |
| `password` | `auth.fields.password` «كلمة المرور» | password | `new-password` | min 8 «كلمة المرور لازم تكون 8 أحرف على الأقل», max 128 «كلمة المرور طويلة جدًا» |
| `confirmPassword` | `auth.fields.confirmPassword` «تأكيد كلمة المرور» | password | `new-password` | min 1 «تأكيد كلمة المرور مطلوب»; mismatch → issue on `confirmPassword`: «كلمتا المرور غير متطابقتين» |

Submit → `POST /api/auth/sign-up/email` with
`{ name, password, phoneNumber: values.phone, ...(email ? { email } : {}) }`.
`confirmPassword` is **never sent**.

Failure:
- `code === 'PHONE_ALREADY_REGISTERED'` → `copy.auth.errors.registerPhoneTaken`
  «الرقم ده ليه حساب عندنا بالفعل.» plus, inside the same `role="alert"`, a link to
  `/login(?next=…)` labelled `copy.auth.errors.registerPhoneTakenAction` «ادخل بالرقم ده».
- anything else → `copy.auth.errors.register`
  «مقدرناش نعمل الحساب. البيانات محتاجة مراجعة، وبعدها نحاول تاني.»
  (In practice this is almost always a duplicate phone that did not surface the code.)

Success → hard navigation to `/onboarding` (with `next` forwarded via `withNext`).
A new account has never completed onboarding, so no probe is needed.

Button: `copy.auth.actions.register` «إنشاء الحساب» / pending
`copy.auth.actions.registerPending` «بنجهّز حسابك…».

Footer line: `copy.auth.legalBefore` «بإنشاء الحساب إنت موافق على» + link
`/terms` (`copy.legal.termsTitle`) + `copy.auth.legalAnd` «و» + link `/privacy`
(`copy.legal.privacyTitle`) + «.».

### 2.3 `(auth)` error boundary

`apps/web/app/(auth)/error.tsx`. Renders `copy.errors.auth.title` / `.body` in the
`.auth-head` slot, then a row: accent «نحاول تاني» (`copy.common.retry`, uses
`useErrorRetry` — refresh first, escalate to a document load on repeat) and an
outlined `<a href="/">` labelled `copy.nav.home` «الرئيسية». If `error.digest`
exists it prints `copy.errors.digestLabel` + `: ` + the digest in `dir="ltr"` mono.

---

## 3. `/onboarding`

`apps/web/app/(app)/onboarding/page.tsx`, `apps/web/components/onboarding/onboarding-form.tsx`.

**Gate:** signed in, `onboardingCompleted === false`. A completed student is
redirected to `/dashboard`; a signed-out one to `/login`.

**Data (server, in parallel):**
1. `getTaxonomyOrNull()` — cached `GET /api/taxonomy`; may legitimately be `null`.
2. session (name, identity, image, `phoneNumber`).
3. `searchParams.next`.
If the cached taxonomy is `null`, a **live** `GET /api/taxonomy` is attempted
(`getTaxonomyLiveOrNull()`), because this screen is a dead end without it.

**Page chrome** (`main` max-w-2xl, px-6, py-16):
- `h1` = `copy.onboarding.title` «نكمّل بيانات حسابك»
- `p` = `copy.onboarding.subtitle`
  «شوية معلومات سريعة عشان نعرف نوريك الكورسات اللي تخصّك إنت بس»

**Taxonomy-unavailable state** (`TaxonomyUnavailable`): a `.panel` with
- `h2` = `copy.onboarding.unavailableTitle` «مش قادرين نجيب قايمة المحافظات والصفوف دلوقتي»
- `p` = `copy.onboarding.unavailableBody` «المشكلة عندنا إحنا مش عندك، وحسابك اتعمل تمام ومحصلش أي حاجة له. دقيقة واحدة ونجرّب تاني — والباقي بيكمّل من نفس المكان.»
- a **full document reload** link to `/onboarding` (with `next` preserved) labelled
  `copy.common.retry` «نحاول تاني», `min-h-11`.
  The failure is cached for up to 60 s, hence the wording "wait a minute".

### 3.1 Wizard structure

Four steps; **all fields stay mounted**, inactive steps use `hidden`.

```
IdentityHeader (avatar + session name + identity)
StepProgress   (currentStep = index+1, totalSteps = 4, title = STEPS[i].title)
Card > CardBody
  step 0  fields: fullName, gender, phone
  step 1  fields: governorateCode, schoolName, schoolStream
  step 2  fields: year
  step 3  fields: fatherPhone   (+ FieldNote explaining why)
[formError]  p role=alert, --err
row: [السابق (secondary, only when stepIndex>0)]  [التالي | حفظ ونكمّل (flex-1)]
p (centred, muted): copy.onboarding.privacyNote + Link /privacy?from=onboarding
```

Step titles (`copy.onboarding`):
- `step1Title` «مين إنت»
- `step2Title` «إنت فين»
- `step3Title` «إنت في سنة كام»
- `step4Title` «تليفون ولي الأمر»

`progressLabel` «تقدّمك في تكميل البيانات» labels the progress element.

### 3.2 Fields — `OnboardingSchema` (`packages/contracts/src/onboarding.ts`, `.strict()`)

| field | label / Arabic | placeholder | type | rule (message verbatim) |
|---|---|---|---|---|
| `fullName` | `fullName` «الاسم الكامل» | `fullNamePlaceholder` «الاسم بالكامل» | text, autocomplete `name` | trim, min 2 «الاسم الكامل مطلوب», max 120 |
| `gender` | `gender` «النوع» | `genderPlaceholder` «اختار» | select | `z.enum(['male','female'])`; UI error string is `genderError` «لازم نحدد النوع». Options: `genderMale` «ذكر», `genderFemale` «أنثى» |
| `phone` | `phone` «رقم الهاتف» | `phonePlaceholder` «مثال: 01012345678» | `PhoneField` (rewrites Arabic-Indic digits to Latin as you type), autocomplete `tel` | `egyptianPhone('رقم الهاتف مطلوب')`, transformed to E.164 |
| `governorateCode` | `governorate` «المحافظة» | `governoratePlaceholder` «محافظتك» | select from `taxonomy.governorates` | `z.string().length(2, 'لازم نحدد المحافظة')` |
| `schoolName` | `schoolName` «اسم المدرسة» | `schoolNamePlaceholder` «مثال: مدرسة النصر الثانوية» | text | trim, min 1 «اسم المدرسة مطلوب», max 200 |
| `schoolStream` | `schoolStream` «مدرستك» | `schoolStreamPlaceholder` «مدرسة عام ولا لغات؟» | select | `z.enum(['general','languages'])`; UI error `schoolStreamError` «لازم نحدد نوع مدرستك» |
| `year` | `year` «الصف الدراسي» | `yearPlaceholder` «اختار صفّك» | select from `offeredYearOptions(taxonomy)` | `z.number({error:'لازم نحدد الصف الدراسي'}).int().min(1).max(3)`; empty string maps to `undefined`, never `NaN` |
| `fatherPhone` | `fatherPhone` «رقم تليفون ولي الأمر» | `phonePlaceholder` | `PhoneField` | `egyptianPhone('هاتف الأب مطلوب')` |

Not asked, filled from the taxonomy on submit (`apps/web/lib/section-defaults.ts`
→ `fixedSectionFor(taxonomy, year)`): `system`, `trackId`, `electiveSubjectId`.
These are spread **after** the form values so they always win.

Cross-field rules in `refineSection`:
- `year === 1` with a `trackId` → issue on `trackId`: «الصف الأول لا يختار مسارًا بعد»
- `trackId` without `system` → issue on `system`: «لازم نحدد النظام الدراسي الأول»
- `electiveSubjectId` when not (`system==='bacalorya'` && `year===2`) →
  issue on `electiveSubjectId`: «المادة الاختيارية غير متاحة في هذه الحالة»
- `electiveSubjectId` without `trackId` → issue on `trackId`: «لازم نحدد المسار الأول»

Guardian-phone note (`FieldNote`, `ShieldCheck` icon, tinted panel,
`aria-describedby` on the input): `copy.onboarding.parentPhonesWhy` =
«الرقم ده عشان نقدر نتواصل مع ولي أمرك عن مستواك لو احتجنا. مابنستعملهوش في أي حاجة تانية.»

Privacy line: `copy.onboarding.privacyNote` = «بياناتك محفوظة عند أيمن أبو العلا وبس، ومابتتباعش ولا بتتشارك مع حد.»
+ link text `copy.onboarding.privacyLink` = «اعرف بالظبط بنجمع إيه وليه» → `/privacy?from=onboarding`.

### 3.3 Behaviour

- **Next** (`goNext`) validates only the current step's fields; nothing further ahead.
- **Back** (`goBack`) never validates.
- **Enter** in a text input on steps 0-2 is intercepted: it calls `goNext()` instead
  of submitting.
- The whole form is mirrored into a **draft** (`use-onboarding-draft.ts`) so a
  navigation to the privacy page and back restores the answers. It is cleared on
  success (`clearOnboardingDraft()`).
- Prefills: `fullName` ← session name; `phone` ← `session.phoneNumber` (E.164) or
  `undefined`; then the draft overrides both.
- Buttons: `copy.onboarding.next` «التالي», `copy.onboarding.back` «السابق»,
  `copy.onboarding.submit` «حفظ ونكمّل», pending `copy.onboarding.submitPending` «جارٍ الحفظ…».
  The two trailing buttons carry distinct React keys so a click landing during
  the step transition cannot submit early.

**Submit:** `PATCH /api/profile/onboarding` with the validated body plus the three
resolved section fields. No response body is consumed.

Errors:
- **409** (phone belongs to another account) → set a field error on `phone`
  (`copy.onboarding.phoneConflictError` «رقمك ده متسجّل على حساب تاني»),
  jump the wizard back to the **phone step** (index derived, not hard-coded), and
  show the form-level hint `copy.onboarding.phoneConflictHint` =
  «رجّعناك لرقمك — فيه حساب تاني متسجّل بيه. غيّره أو سجّل الدخول بيه.»
  Only the student's own `phone` can 409 — `fatherPhone` has no unique index.
- anything else → `copy.onboarding.submitError` =
  «مقدرناش نحفظ بياناتك. مراجعة سريعة ونحاول تاني.»

**Success:** hard navigation to `/welcome` (`?next=<encoded>` when a validated
`next` exists).

---

## 4. `/welcome`

`apps/web/app/(app)/welcome/page.tsx`, `apps/web/components/welcome/welcome-scene.tsx`,
`apps/web/lib/welcome-motion.ts`.

**Purpose:** one screen between finishing onboarding and the product, whose only
ask is the WhatsApp channel. Skippable.

**Data:** `searchParams.next`, `getWhatsappChannelFresh()` (deliberately **not** the
cached settings reader — a cached empty value made this screen vanish for minutes
after every deploy), `getSession()` (for the first name only).

**Redirect:** `destination = safeNext(next) ?? '/dashboard'`.
If no WhatsApp channel is configured → `redirect(destination)` immediately; the
screen does not exist.

Layout:
```
WelcomeScene (owns <main> and the CTA)
├─ section.stage.stage--welcome
│  ├─ div.welcome-aura (aria-hidden, drifting ember)
│  └─ div.stage__body
│     ├─ p.stage__eyebrow  = copy.welcome.eyebrow  «آخر خطوة»
│     ├─ h1.stage__title   = copy.welcome.titleNamed «أهلاً يا {name} 👋»
│     │                       (fallback copy.welcome.title «أهلاً وسهلاً 👋»)
│     ├─ p.stage__sub      = copy.welcome.body  «حسابك جاهز. فاضل حاجة واحدة بس.»
│     └─ ol.welcome-steps aria-label=copy.welcome.stepsLabel «خطوات إنشاء الحساب»
│        ├─ Step done  = copy.welcome.stepAccount «الحساب اتعمل»
│        ├─ Step done  = copy.welcome.stepProfile «بياناتك اتحفظت»
│        └─ Step open  = copy.welcome.stepStart   «نبدأ الدراسة»
├─ div.welcome-in.mt-6 → WhatsappChannelCard(href=channel, flush)
└─ CTA link → destination, label copy.welcome.continue «يلا نبدأ»
```

- First name = `firstName(session?.name)` — first whitespace-delimited token, or `null`.
- Entrance ladder: eyebrow → title → body → steps (60 ms stride) → card; whole
  sequence under 800 ms (`WELCOME_ENTRANCE_MS`, `stepDelayMs`, `entranceDelay`).
- The CTA is a real `<Link>`: a plain left click is held 260 ms (third stop ticks,
  scene lifts) before the router moves; middle-click / ⌘-click are untouched.
- **All animation is disabled under `prefers-reduced-motion: reduce`; the CTA is
  painted and pressable on the first frame regardless.**
- The WhatsApp press is what stamps `whatsappOpenedAt`
  (`POST /api/profile/whatsapp-opened`) — never stamp it for a programmatic redirect.

`WhatsappChannelCard` copy (`copy.dashboard.whatsappChannel`):
`title` «قناة الواتساب», `lead` «أول ما يتنزل درس جديد أو يتحدد ميعاد امتحان، هيوصلك على طول.»,
`cta` «اشتراك». It is **green**, not amber (it leaves the platform).

---

## 5. `/dashboard` — «حسابي»

`apps/web/app/(app)/dashboard/page.tsx`. Metadata title = `copy.nav.dashboard` «حسابي».

### 5.1 Data — TEN parallel reads

All issued together with `Promise.all`; each has a stated failure policy.

| # | call | endpoint / source | schema | on failure |
|---|---|---|---|---|
| 1 | `getDashboard()` | `GET /api/me/dashboard` | `DashboardSchema` | throws → error boundary |
| 2 | `apiGetAuthed('/api/profile/me')` | `GET /api/profile/me` | `ProfileMeSchema` | throws |
| 3 | `apiGetAuthed('/api/me/quizzes')` | `GET /api/me/quizzes` | `StudentQuizHistorySchema` | throws |
| 4 | `getTaxonomyOrNull()` | cached `GET /api/taxonomy` | `Taxonomy` | `null` → band renders without year/track chips |
| 5 | `getSession()` | session | — | `null` tolerated |
| 6 | `getMasteryOrNull()` | `GET /api/me/mastery` | `StudentMasterySchema` | `null` → «ذاكر ده» card absent |
| 7 | `getPublicSettingsOrDefaults()` | cached settings | — | empty contact block |
| 8 | `getCatalogOrEmpty()` | cached `GET /api/catalog/courses` | — | `[]` → recommendations absent |
| 9 | `getBookCatalogOrEmpty()` | cached `GET /api/books` | — | empty shelves |
| 10 | `getMyBookOrdersOrEmpty()` | `GET /api/book-orders/mine` | `BookOrder[]` | `[]` → «كتبي» section absent |

**Only reads 1-3 are allowed to take the page down.** Everything else degrades to
the section simply not rendering. A mobile client must copy that policy or a
429 on the tenth call blanks the home screen.

### 5.2 Derived values (must be reproduced exactly)

`apps/web/lib/dashboard-view.ts` → `summarise(dashboard)`:
- `completedLessons` = Σ `enrolledCourses[].completedLessons`
- `totalLessons` = Σ `enrolledCourses[].totalLessons`
- `overallPercent` = `totalLessons === 0 ? 0 : Math.round(completed/total*100)`
- `averageScore` = `recentScores.length === 0 ? null : Math.round(mean(scorePercent))`
- `learningSeconds` = `dashboard.totalWatchedSeconds`

`firstName(fullName)` = first whitespace token or `null`.

`completedCourseCount` = count of courses with `totalLessons > 0 && completedLessons >= totalLessons`.
(Deliberately **not** `progressPercent`, which has been observed stuck stale.)

`xpFor` (`apps/web/lib/xp.ts`):
`xp = completedLessons*10 + passedQuizCount*30 + completedCourseCount*100`
where `passedQuizCount = quizzes.summary.passedCount`.

`achievementsFor` (`apps/web/lib/achievements.ts`) — six badges, fixed order:

| id | glyph | tier | title / hint (`copy.dashboard.badges`) | earned when |
|---|---|---|---|---|
| `first-lesson` | play | bronze | «أول درس» / «أول محاضرة لحد آخرها.» | `completedLessons >= 1` |
| `ten-lessons` | layers | silver | «عشر دروس» / «عشر محاضرات في أي كورس.» | `completedLessons >= 10` |
| `first-exam` | clipboard | bronze | «أول امتحان» / «أول امتحان يتقدّم ويتسلّم.» | `summary.quizzesTaken >= 1` |
| `first-pass` | medal | silver | «أول نجاح» / «اعدّي أي امتحان.» | `summary.passedCount >= 1` |
| `course-done` | trophy | gold | «كورس كامل» / «كورس كامل من أوله لآخره.» | any course `totalLessons>0 && completedLessons>=totalLessons` |
| `distinction` | star | gold | «امتياز» / «خُد ٩٠٪ أو أكتر في أي امتحان.» | `summary.bestPercent !== null && >= 90` (`MASTERY_STRONG_AT`) |

`earnedCount` = number earned; `highestTier` = the highest earned tier
(`bronze < silver < gold`) or `null`.

`recommendedCourses({courses, identity, enrolledCourseIds, limit: 4})`:
returns `[]` when `identity === null`; otherwise filters the public catalog to
courses not already enrolled **and** `isOwnCourse(course, identity)`; when
`identity.schoolStream === null` additionally requires `forGeneral && forLanguages`;
takes the first 4.

`startHereSteps(dashboard)` — three steps, each `{id,title,body,cta,href,done,blockedBy}`:
- `enroll` — done when `enrolledCourses.length > 0`; href `/library`; never blocked.
- `lesson` — done when any course has `lastLessonId !== null`;
  href = resume lesson, else `enrolledCourseHref(firstCourse)`, else `/library`;
  blocked when not enrolled → reason `stepLessonBlocked`, cta `stepEnrollCta`, href `/library`.
- `quiz` — done when `recentScores.length > 0`; href `/path`;
  blocked when not enrolled → reason `stepQuizBlockedNoCourse` + `/library`;
  blocked when enrolled but nothing opened → reason `stepQuizBlocked`,
  cta `stepLessonCta`, href = the lesson href above.
`hasOutstandingSteps` = any step not done.

### 5.3 Page tree

```
main  (mx-auto w-full max-w-[var(--w-app)] px-4 py-8 md:px-6 md:py-10)
├─ DashboardHero                     (§5.4)
├─ NextUpBlock(showRing=false)       (§5.5)
├─ InstructorMessageCard             (§5.6, full width, usually absent)
└─ div.dash-split                    (grid only from 80rem / 1280px; stacks in DOM order below)
   ├─ div.dash-split__main.space-y-8
   │   ├─ [if continueWatching] ContinueWatchingCard          (§5.7)
   │   ├─ [if hasOutstandingSteps] StartHereCard(tone = resume ? 'plain' : 'hero')
   │   ├─ section «كورساتي»
   │   │   .group-head: mark + h2 copy.dashboard.myCourses + count copy.library.courseCount
   │   │   grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 → EnrolledCourseCard[]
   │   │   empty: .empty + SpotIllustration('courses') + copy.dashboard.noCoursesYet
   │   ├─ [if recommended.length] section «كورسات في مسارك»
   │   │   .group-head + Link /library = copy.dashboard.recommendedSeeAll
   │   │   ul grid gap-4 sm:grid-cols-2 2xl:grid-cols-3 → LibraryCourseCard[]
   │   ├─ ExamsSection(quizzes)                               (§5.8)
   │   ├─ MyBookOrdersSection(orders, supportHref)            (§5.9)
   │   └─ BooksSection(first 6 flattened books)               (§5.10)
   └─ aside.dash-split__side (mt-8 space-y-4 lg:mt-0)
       ├─ WhatsappChannelCard(variant='aside', flush)
       ├─ CourseGroupCard per enrolled course with whatsappGroupUrl !== null
       ├─ [if pendingExams.length] AsideBlock → PendingExamsCard
       ├─ [if mastery] AsideBlock(art='mastery') → MasteryCard
       ├─ Achievements(variant='aside')
       └─ TipOfDayCard
```

**Mobile:** `.dash-split` is not a grid below 1280 px, so the order on a phone is
exactly the DOM order above — main column first, then the whole aside.
The main column's course grid is 1-up below `sm` and 2-up from `sm`.

### 5.4 `DashboardHero` — the ember band

`apps/web/components/dashboard/dashboard-hero.tsx`, styles `.dash-hero` in
`apps/web/app/study.css:195-660`.

```
header.dash-hero.mb-6
├─ svg.dash-hero__art  (aria-hidden; four circles; hidden below md)
├─ div.dash-hero__id
│   ├─ UserAvatar(name, image, size=64) .dash-hero__avatar
│   └─ div.dash-hero__text
│       ├─ p.dash-hero__eyebrow = copy.dashboard.eyebrow «01 / حسابي»
│       ├─ h1.dash-hero__title  = formatCopy(copy.dashboard.greeting, {name}) «أهلًا {name}»
│       │                         fallback copy.dashboard.greetingFallback «أهلًا وسهلاً»
│       └─ div.dash-hero__facts  (only when at least one is present)
│           ├─ GraduationCap + yearLabel      (from identityOf(me, taxonomy).yearLabelAr)
│           ├─ Route         + trackLabel     (identityOf(...).trackLabelAr)
│           └─ School        + schoolName     (me.profile.schoolName)
├─ div.dash-hero__stats   (three figures, own grid row, full width)
├─ [if schedule.length] div.dash-hero__schedule
│   ├─ title = copy.dashboard.scheduleTitle «مواعيد المحاضرات»
│   └─ one row per enrolled course with a non-empty trimmed scheduleNote:
│      course title + the note VERBATIM (nothing parses it; it is not a date)
└─ div.dash-hero__aside → 104px ProgressRing(overallPercent)
   label = copy.dashboard.statOverall «إجمالي تقدّمك»
```

The three big figures (`statFigures`, `apps/web/components/dashboard/stats-row.tsx:85-125`),
in this order:

| id | value | suffix | label | note | links to |
|---|---|---|---|---|---|
| `xp` | `xp` | — | `copy.dashboard.xpLabel` «نقاط الخبرة» | `{completedLessons} {copy.dashboard.statLessonsDone}` → «… دروس خلصتها» | `/path` |
| `time` | `formatHoursMinutes(learningSeconds)` | — | `copy.dashboard.learningHoursLabel` «وقت المذاكرة» | `{courseCount} {copy.dashboard.statCourses}` → «… كورساتك» | `/library` |
| `badges` | `badgesEarned` | tier name when a tier is earned (`tierBronze` «برونزية» / `tierSilver` «فضية» / `tierGold` «ذهبية») | `copy.dashboard.badgesEarnedLabel` «شارات محققة» | `«متوسط درجاتك لسه»` when `averageScore === null`, else `«متوسط درجاتك {n}%»` | `/results` |

Contrast rule: the band is ember and **nothing on it is pressable except those
three tiles' links**; the only amber on it is the ring's arc.

**Mobile (`@media (max-width: 47.9375rem)` in study.css:472):** the band stacks —
avatar + text, then the stats row, then the schedule, then the ring/aside.

### 5.5 `NextUpBlock` — «ناقصك كده وتخلص»

`apps/web/components/dashboard/next-up-block.tsx`, `apps/web/lib/next-up.ts`,
styles in `apps/web/app/next-up.css`. Copy under `copy.dashboard.nextUp`.

`nextUp(dashboard)` produces **one entry per COURSE**, ranked:
- For each `pendingExams[]` entry whose course is published (or absent from
  `enrolledCourses`): `{ kind:'exam', href: quizHref(lessonId), count: 1,
  label: copy.dashboard.nextUp.exam «فاضل امتحان الكورس», courseTitle }`,
  `remaining = 1`.
- For each published enrolled course **not** already represented by an exam,
  with `remaining = totalLessons - completedLessons > 0`:
  `{ kind:'lessons', href: enrolledCourseHref(course), count: remaining,
  label: lessonsLeftLabel(remaining), courseTitle }`.
- Ranking: fewest `remaining` first, then higher `progressPercent`, then the
  order the courses arrive in.

`lessonsLeftLabel(n)` — four Arabic plural forms:
- 1 → `nextUp.lessonsOne` «فاضلك درس واحد»
- 2 → `nextUp.lessonsTwo` «فاضلك درسين»
- 3–10 → `formatCopy(nextUp.lessonsFew, {n})` «فاضلك {n} دروس»
- ≥ 11 → `formatCopy(nextUp.lessonsMany, {n})` «فاضلك {n} درس»

Render:
- `items.length === 0 && percent < 100` (or no courses) → the block renders **nothing**.
- Normal:
  ```
  section.next-up aria-labelledby
    .next-up__head  → [ProgressRing only when showRing] + h2 nextUp.title «ناقصك كده وتخلص»
                       + p nextUp.lead «دوس على أي واحدة منهم وهي توديك لمكانها على طول.»
    ul.next-up__list → per item: Link.next-up__item
        .next-up__well  = the count (lessons) or a ClipboardCheck glyph (exam)
        .next-up__text  = label + course title
        .next-up__cta   = nextUp.ctaExam «ادخل الامتحان» | nextUp.ctaLessons «يلا نكمّل»
  ```
- **Celebration** (`items.length === 0 && percent >= 100 && enrolledCourses.length > 0`):
  ```
  section.next-up.next-up--won
    svg.next-up__burst (12 rays, aria-hidden)
    Trophy disc
    h2 = formatCopy(nextUp.wonTitle, {name}) «مبروك يا {name}! خلصت كل حاجة»
         fallback nextUp.wonTitleFallback «مبروك! خلصت كل حاجة»
    p  = formatCopy(nextUp.wonCourses, {courses}) «قفلت من أوله لآخره: {courses}.»
         where {courses} = first 2 finished titles joined by nextUp.listSeparator «، »,
         plus formatCopy(nextUp.wonAndMore, {n}) «و{n} كمان» when more remain;
         if no titles → nextUp.wonCoursesPlain «مافيش ولا درس ولا امتحان لسه مستنيك.»
    p  = nextUp.wonNote  «ده مش شوية. اللي بيمشي لحد الآخر كده بيبان في الامتحان، مش في النسبة بس. خد نفسك، ارجع راجع اللي عدى وانت مرتاح، وأول ما ينزل جديد هتلاقيني مستنيك.»
    actions: Link /results = nextUp.wonResults «شوف درجاتك»
             Link /library = nextUp.wonBrowse  «كورسات تانية»
  ```

### 5.6 `InstructorMessageCard`

Client component. `GET /api/assistant/conversations/mine/summary`
(`parseMyConversationSummary`, deduped in-flight). Renders **only** when
`summary.latestFromAyman` is non-null.

Copy (`copy.dashboard.instructorMessage`): eyebrow «رسالة جديدة», role
«م. أيمن أبو العلا», action «اقرأها وردّ», and «وكمان {n} رسالة» for extras.
Pressing it calls `openAssistant()` (opens the assistant panel in place) rather
than navigating.

### 5.7 `ContinueWatchingCard`

Source: `dashboard.continueWatching` (`ContinueWatchingSchema`) plus the matching
course's `coverKey` / `subjectNameAr`.

```
article  (amber-tinted panel, the ONE amber surface on the page)
└─ flex-col gap-4  →  sm:flex-row sm:items-center sm:gap-5
   ├─ [lg only, when subjectNameAr] 128px 16/9 thumbnail (CourseArt) with a scrim
   │                                 and a 36px amber play disc on it
   ├─ [every width the thumbnail is not drawn] 48px amber play disc
   ├─ text block (min-w-0 flex-1)
   │   ├─ p.eyebrow accent = copy.dashboard.continueWatching «نكمّل من مكانك»
   │   ├─ lesson title  (truncate, --fs-title-3)
   │   └─ course title  (truncate, --fs-text-sm, muted)
   └─ right cluster
       ├─ [remainingSeconds > 0] «باقي {formatRemaining(remainingSeconds)}»
       │                          (copy.dashboard.remaining «باقي»)
       └─ Link → /courses/{courseSlug}/lessons/{lessonId}
                 label copy.dashboard.continueCta «نكمّل» + ChevronForward
                 (stretched: after:absolute after:inset-0)
LessonProgressBar(percent = item.progressPercent, label = copy.player.courseProgress)
```

**Mobile:** the thumbnail is hidden below `lg` (measured: it starved the lesson
title to ~140 px). Below `sm` everything stacks vertically.

### 5.8 `ExamsSection` — «امتحاناتك»

Source: `quizzes.quizzes` (`QuizHistoryRowSchema[]`, one row per quiz, most
recently sat first). Shows the first `SHOWN` rows; a count and an "all" link
appear only past that.

- Header: `.group-head` + h2 `copy.dashboard.examsTitle` «امتحاناتك»
  + count `formatCopy(copy.library.courseCount, {n})` when truncated.
- Empty: `.empty` + `SpotIllustration('exams')` + `copy.dashboard.examsEmpty`
  «لسه مافيش امتحانات. أول امتحان يخلص هيبان هنا بدرجته.» + chip `chip--quiet`
  → `/path`, label `copy.dashboard.examsEmptyCta` «مسارك التعليمي».
- Row (`.attempt-row`, `.attempt-row--action` when improvable):
  - `canImprove = row.allowsImprovement && !row.improvementUsed`
  - well glyph: `Sparkles` if `canImprove`, else `Trophy` if `row.passed`, else `GraduationCap`
  - title = `row.quizTitle`, stretched link to
    `quizHref(lessonId)` when `canImprove`, else `reviewHref(lessonId, latestAttemptId)`
  - meta = `bestPercent === null ? copy.quiz.essayPending : "{bestPercent}%"`,
    plus ` · ` + `copy.dashboard.examsImproveHint` «لسه قدامك محاولة تحسين» when improvable
  - verdict badge: **only** `copy.quiz.passed` «ناجح» when `row.passed === true`.
    A fail badge is deliberately never rendered here.
  - trailing chip: `chip--solid` + `copy.quiz.improveExam` «دخول امتحان التحسين»
    when improvable, else `chip--accent` + `copy.quiz.reviewAnswers` «مراجعة الإجابات»
- Trailing link when truncated: `/results`, `copy.dashboard.examsAll` «كل امتحاناتك».

### 5.9 `MyBookOrdersSection` — «كتبي»

Renders `null` for zero orders. Shows the **two newest** orders as `BookOrderCard`
(see §16.2 for the card), then an outlined `chip--accent` link to `/books`
labelled `copy.books.mine.orderAnother` «اطلب كتاب تاني».
Header: `.group-head` + h2 `copy.books.mine.title` «كتبي» + link to `/store/orders`
labelled `copy.books.mine.all` «كل طلباتي».

### 5.10 `BooksSection` — «الكتب»

Books are the flattened shelves (`shelf.first`, `shelf.second`, `shelf.full`)
capped at **6**. First two render as wide cards, the remainder as a compact row
headed `copy.dashboard.booksMore` «كتب تانية». Section title
`copy.dashboard.books` «الكتب», "see all" `copy.dashboard.booksSeeAll` «كل الكتب».

### 5.11 Aside blocks

**`PendingExamsCard`** — only when `dashboard.pendingExams.length > 0`.
h2 `copy.dashboard.pendingExamsTitle` «امتحانات في انتظارك»;
per row: lesson title + `formatCopy(copy.dashboard.pendingExamsMeta, {course})`
«خلّصت {course} — الامتحان جاهز» + `chip chip--solid` labelled
`copy.dashboard.pendingExamsCta` «ابدأ الامتحان» → `quizHref(lessonId)`.

**`MasteryCard`** — «ذاكر ده». Source `GET /api/me/mastery`
(`StudentMasterySchema`: `weakest[≤3]`, `strongest[≤3]`, `evaluated`, `pending`).
Constants: `MASTERY_MIN_EVIDENCE = 4`, `MASTERY_REVIEW_BELOW = 70`,
`MASTERY_STRONG_AT = 90`.
- h2 `copy.dashboard.mastery.title` «ذاكر ده»
  + `formatCopy(mastery.evaluatedCount, {n: evaluated})` «{n} موضوع اتقاسوا»
- weak rows: topic name, a meter sized `min(accuracyPercent,100)%`, the percent,
  an `sr-only` line `formatCopy(mastery.accessibleRow, {topic, percent})`
  «{topic} — {percent}٪ من الدرجات», and — when the topic carries
  `courseSlug` + `lessonId` — a link to `/courses/{courseSlug}/lessons/{lessonId}`
  labelled `mastery.reviewCta` «مراجعة».
- `formatCopy(mastery.pendingNote, {n: pending})` «لسه في {n} موضوع تحت القياس.» when `pending > 0`.
- strong strip: `mastery.strongLabel` «متمكّن في:» then `«{name} {percent}%»` chips.
- empty: `mastery.emptyBody` «لسه بنجمّع صورة عن مستواك. كام امتحان كمان وهتلاقي هنا بالظبط الضعف فين.»
  or, when measured but nothing is weak, `mastery.allClearBody`
  «مفيش موضوع محتاج مراجعة دلوقتي — كل اللي اتقاس فوق السبعين.»

**`Achievements`** (`variant='aside'`) — h2 `copy.dashboard.badges.title` «إنجازاتك»,
count `formatCopy(badges.count, {earned,total})` «{earned} من {total}», note
`badges.note` «بتتفتح لوحدها مع المذاكرة.». Each badge's accessible name is
`«{title} — شارة {tier} — اتحقّق»` when earned, otherwise
`«{title} — شارة {tier} — لسه: {hint}»` (`badges.tierLabel` «شارة {tier}»,
`badges.earned` «اتحقّق», `badges.locked` «لسه»).

**`TipOfDayCard`** — h2 `copy.dashboard.tipOfDayTitle` «نصيحة اليوم».
Text = `copy.dashboard.tipOfDay[dayOfYear(date) % 10]`; `dayOfYear` counts from
`new Date(year, 0, 0)` in **local time**, floor of ms/86_400_000. The ten tips
are listed under `copy.dashboard.tipOfDay` in `ar.ts` and must be reproduced in
the same order for the rotation to match.

**`CourseGroupCard`** (`copy.player.group`) — title «جروب الدفعة», lead
«جروب الواتساب الخاص بطلبة الكورس ده — الأسئلة والتنبيهات بينزلوا فيه.»,
cta «دخول الجروب». Renders `null` for a `null` url.

---

## 6. `/path` — «مسارك التعليمي»

`apps/web/app/(app)/path/page.tsx`, `apps/web/components/path/course-rail.tsx`,
`path-map.tsx`, `course-closed-dialog.tsx`.

**Data:** one read, `GET /api/me/path` → `LearningPathSchema`
(`packages/contracts/src/path.ts`):

```ts
LearningPath {
  courses: PathCourse[]
  currentCourseId: string | null
  clearedLessons: int >= 0
  totalLessons: int >= 0
  percent: 0..100
}
PathCourse {
  id, slug, title, subjectNameAr: string
  coverKey: string | null
  published: boolean
  progressPercent: 0..100
  clearedLessons, totalLessons: int
  contentComplete: boolean
  whatsappGroupUrl: string | null
  nextLessonId: string | null
  nodes: PathNode[]
}
PathNode {
  id, lessonId, title: string
  kind: 'video' | 'quiz' | 'attachment' | 'text'
  state: 'not_started'|'in_progress'|'completed'|'passed'|'failed'
  gate: 'cleared' | 'available' | 'locked'
  isExam: boolean
}
```

**The lock is a RENDER of a server decision.** Every lesson route re-derives the
gate per request and 404s a locked lesson; a mobile client must not treat the
`gate` field as authorisation.

### 6.1 Empty state (`courses.length === 0`)

```
main (max-w-[var(--w-app)] px-6 py-10 md:py-12)
  header.study-head
    p.eyebrow = copy.path.eyebrow «02 / مساري»
    h1.study-head__title = copy.path.title «مسارك التعليمي»
  div (ember-tinted, rounded-lg, border-study-line, bg-study-tint, px-6 py-10, centred)
    p = copy.path.empty «لسه مافيش أي كورس في القايمة.»
    Link /library, amber h-10 button = copy.path.emptyCta «الكورسات المتاحة»
```

### 6.2 Populated

```
main
├─ header.study-head
│   p.eyebrow  = copy.path.eyebrow «02 / مساري»
│   h1         = copy.path.title   «مسارك التعليمي»
│   p.lead     = copy.path.subtitle «كل كورس مفتوح لك، بالترتيب اللي هتذاكر بيه.»
├─ section (ember tint, rounded-lg, px-5 py-4, mb-8)
│   ├─ Route glyph in a 40px ember disc
│   ├─ summary = copy.path.summary with {cleared}/{total}/{courses} substituted
│   │            «{cleared} من {total} محاضرة في {courses} كورس»
│   ├─ copy.path.percentComplete «خلصت {percent}%»  (mono tabular, accent)
│   └─ LessonProgressBar(percent = path.percent, label = copy.path.title)
└─ div.grid.gap-8.grid-cols-[minmax(0,1fr)] lg:grid-cols-[18rem_minmax(0,1fr)]
   ├─ CourseRail(courses, currentCourseId)
   └─ div.space-y-10 → per course: div#course-{id}.scroll-mt-6 → PathMap(course, index)
```

⚠️ `grid-cols-[minmax(0,1fr)]` is present **at phone width too**, deliberately:
without it the implicit `auto` track takes the map header's 399 px min-content and
the whole screen overflows to the inline start on a 412 px device.

### 6.3 `CourseRail`

`aside`, `lg:sticky lg:top-6`. Eyebrow `copy.path.courses` «الكورسات».
One `<a href="#course-{id}">` per course:
- `ProgressRing(progressPercent, size=40)` containing either a `CheckIcon`
  (when `totalLessons > 0 && clearedLessons === totalLessons`) or a `SubjectMark`.
- title (truncate, `--fs-text-sm`)
- meta: when done → `copy.path.courseDone` «الكورس خلص» if `contentComplete`,
  else `copy.path.courseUpToDate` «خلّصت اللي نزل»; otherwise `«{cleared} / {total}»`.
- the current course carries `border-accent` on its inline-start border.

### 6.4 `PathMap`

Header (`.panel`, relative, mb-2):
- `sm` and up: a 20-width 4/3 cover strip; below `sm` a 40 px `ProgressRing`.
- eyebrow: `copy.path.courseIndex` «الكورس {n}» with `n = index + 1`
  (⚠️ the index prop is required; without it the eyebrow rendered «الكورس NaN»),
  plus, below `sm`, the `{cleared}/{total}` counter.
- `copy.path.closedBadge` «مقفول مؤقتاً» pill when `published === false`.
- `h2` = course title (`line-clamp-2` below `sm`, `truncate` from `sm`),
  stretched link when the course is open.
- from `sm`: a right-aligned mono `{cleared} / {total}`.

Body:
- no open nodes → `p` = `copy.path.nothingOpen` «مفيش حاجة مفتوحة دلوقتي»
- otherwise `ol.path-run` — a vertical meander of nodes with dotted connectors
  (`.path-run__at`, offset by a sine wave; the amplitude is a decorative meander,
  not a directional cue).

Per node:
- glyph: current → `LessonKindIcon` on amber; `gate === 'cleared'` → `CheckIcon`;
  `gate === 'locked'` → `LockIcon`; else `LessonKindIcon`.
- accessible label parts: `copy.path.exam` «الامتحان النهائي» when `isExam`;
  `copy.path.locked` «مقفول» when locked; `copy.course.lessonKind[kind]`;
  `lessonStateLabel(node)`.
- the first available node carries the badge `copy.path.startHere` «نبدأ من هنا»
  (mono, amber fill, `#1A1206` ink).
- a locked node opens the **exam-locked dialog** (§9.4) with
  `triggerLabel = "{title} — مقفول"`.
- a node in a **closed** course opens the **course-closed dialog** with
  `triggerLabel = "{title} — مقفول مؤقتاً"`, whose content is
  `copy.path.closedTitle` «الكورس ده مقفول مؤقتاً»,
  `copy.path.closedBody` «م. أيمن بيعدّل فيه دلوقتي، فمقفول للحظات. تقدمك ودرجاتك كلها محفوظة، وأول ما يخلص هيفتح لوحده — مش محتاج تعمل حاجة.»,
  close `copy.path.closedClose` «تمام».

Both dialogs are real focusable `<button>` triggers, never inert spans.

`lessonStateLabel` / `lessonStateMark` (`apps/web/lib/course-outline.ts`):
```
isLessonFinished(l) = l.gate === 'cleared'
                    || l.state === 'completed'
                    || l.state === 'passed'
                    || (l.kind === 'quiz' && !l.isExam && l.state === 'failed')
mark = finished ? 'done' : l.state === 'in_progress' ? 'started' : 'new'
label: done    → copy.library.lessonDone      «خلصت»
       started → copy.library.lessonStarted   «لسه ما خلصتهاش»
       new     → kind === 'quiz' ? copy.library.lessonQuizNew «لسه ما امتحنتش»
                                 : copy.library.lessonNew     «لسه ماشوفتهاش»
```

---

## 7. `/library` — «الكورسات»

`apps/web/app/(app)/library/page.tsx`, `apps/web/lib/library.ts`,
`apps/web/components/library/*`.

**Why it exists next to public `/courses`:** `/courses` is the indexed marketing
catalogue in the site chrome; this is the same catalogue inside the student shell.
A mobile app only ever needs this one.

**Data (4 parallel):**
1. `getCatalogOrEmpty()` — cached `GET /api/catalog/courses`
2. `GET /api/me/path` → `LearningPathSchema`
3. `GET /api/profile/me` → `ProfileMeSchema`
4. `getTaxonomyOrNull()` — cached `GET /api/taxonomy` (may be `null`; only
   degrades the year headings)

Joined client-side by `buildLibrary({courses, path, me, taxonomy})` into
`{ identity, yours, rest, totalCourses }`.

### 7.1 Tree

```
main (max-w-[var(--w-app)] px-6 py-10 md:py-12)
├─ header.study-head
│   p.eyebrow = copy.library.eyebrow «04 / الكورسات»
│   h1        = copy.library.title   «الكورسات»
│   p.lead    = copy.library.subtitle «كل الكورسات المنشورة، مرتّبة بالصف والمسار — وكورساتك إنت في الأول.»
├─ IdentityStrip(identity, onboardingCompleted)
└─ [totalCourses === 0]
   │  p (ember-tinted panel, centred) = copy.library.empty «لسه مفيش كورسات منشورة.»
   └─ else div.mt-10.flex.flex-col.gap-12
      ├─ [identity !== null] section «كورساتك»
      │   .group-head: mark + h2 copy.library.yoursTitle «كورساتك»
      │                + [sm+] note copy.library.yoursLead «الكورسات اللي على صفّك ومسارك.»
      │                + [count>0] copy.library.courseCount «{n} كورس»
      │   yours.length === 0 → panel = copy.library.yoursEmpty
      │        «لسه مفيش كورسات منشورة لصفّك. أول ما ينزل كورس هيظهر هنا.»
      │   else → TrackCell per track group
      └─ [rest.length] p = copy.library.restLead «مفتوحة لك تتفرّج عليها في أي وقت.»
                       + YearSection per year group
```

`TrackCell`: a 6 px ember dot + `h3` track label + a mono count
`copy.library.courseCount`, then `ul.grid gap-4 sm:grid-cols-2 xl:grid-cols-3`
of `LibraryCourseCard`. When a year has exactly one track and its key is `''`,
the track header is omitted entirely.

`YearSection`: `.group-head` + `h2` year label + `copy.library.courseCount`,
then its `TrackCell`s.

### 7.2 `IdentityStrip`

- **No identity:** ember panel with
  `h4`-weight `copy.library.identityMissing` «لسه ماخترتش صفّك»,
  `p` `copy.library.identityMissingHint` «صفّك ومسارك عشان نعرف نرتّب كورساتك.»,
  and an amber `h-10` button labelled `copy.library.identityMissingCta` «نختار صفّك»
  going to **`/settings/section` when `onboardingCompleted` is true, `/onboarding` otherwise**
  (a fully-onboarded student with no year is bounced straight back out of the wizard).
- **Identity present:** a 40 px ember disc with `GraduationCap`, then
  `p.eyebrow` `copy.library.identityLabel` «صفّك ومسارك»,
  label = `copy.library.identity` «{year} · {track}» when a track exists, else the
  year label alone, plus a third line with `schoolStreamLabelAr` when present
  (`copy.library.trackGeneral` «عام» is the general-track label).
  Trailing `chip chip--quiet` → `/settings/section`, `copy.library.identityEdit` «غيّرهم».

### 7.3 `LibraryCourseCard`

```
li.panel (flex column, overflow-hidden)
├─ cover box — aspect-[16/8] ONLY when coverKey is null (generated art has no
│   intrinsic height); an uploaded cover keeps its own ratio
├─ div.flex.flex-1.flex-col.gap-3.p-4
│   ├─ h3 → Link href=enrolledCourseHref({slug, lastLessonId: nextLessonId})
│   ├─ mono meta row: Layers + copy.library.lessonCount «{n} محاضرة»
│   │                 Clock  + formatDuration(totalSeconds)
│   └─ mt-auto footer
│       ├─ enrolled → row of [state word] + mono «{cleared} / {lessonCount}»
│       │             + LessonProgressBar(progressPercent)
│       │    state word: done → contentComplete ? copy.library.courseDone «خلصت الكورس»
│       │                                       : copy.library.courseUpToDate «خلّصت اللي نزل»
│       │                                       (the ONE green word on this screen)
│       │                else copy.library.percentDone «خلصت {percent}%»
│       └─ not enrolled → p = copy.library.notStarted «لسه ماابتديتش»
└─ Link.chip.w-full  → same href
   label: lessonCount === 0 → copy.library.emptyCardCta «لسه فاضي»  (chip--quiet)
          not enrolled      → copy.library.start        «نبدأ الكورس» (chip--quiet)
          done              → copy.library.open         «فتح الكورس»  (chip--quiet)
          otherwise         → copy.library.resume       «نكمّل»        (chip--solid)
```

---

## 8. `/library/[slug]` — one course, signed-in view

`apps/web/app/(app)/library/[slug]/page.tsx`.

**Metadata:** `privateRouteMetadata` (noindex) with `title = course.title` or
`copy.course.notFound`.

**Data (3 parallel):** `getCourse(slug)` (cached catalogue detail, shared with the
public page), `GET /api/me/path`, `getPublicSettingsOrDefaults()`.
`if (!course) notFound()`.
The per-student half is `path.courses.find(c => c.id === course.id) ?? null`,
joined by `buildCourseOutline({course, path})` (`apps/web/lib/course-outline.ts`).

### 8.1 Tree

```
main (max-w-[var(--w-shell)] px-6 py-10 md:py-12)
├─ section.stage.mb-8
│   └─ .stage__body
│      ├─ Link /library .stage__back  (ArrowRight, icon-inline) = copy.library.backToLibrary «كل الكورسات»
│      └─ grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] md:gap-10
│         ├─ text column
│         │   ├─ p.stage__eyebrow = systemNameAr [· trackLabelAr] · subjectNameAr
│         │   ├─ h1.stage__title  = course.title
│         │   ├─ [subtitle] p.stage__sub
│         │   └─ .stage__facts: Layers + copy.library.lessonCount «{n} محاضرة»
│         │                     Clock  + formatDuration(course.totalSeconds)
│         └─ CourseCover(coverKey, subjectNameAr, seed=slug)
├─ ONE of three state panels (below)
├─ [pathCourse?.whatsappGroupUrl] CourseGroupCard (max-w-[28rem])
├─ [course.description] RichText
└─ [see gating rule] CourseOutlineView(outline, courseSlug, courseId)
```

**Mobile:** the stage grid collapses to one column and the cover drops **below**
the facts (it is still the first thing seen on scroll).

### 8.2 The three state panels

Checked in this order:

1. **`outline.totalLessons === 0`** — a published course with nothing in it.
   `.empty` + `SpotIllustration('courses')`
   + `copy.library.emptyTitle` «الكورس ده لسه فاضي»
   + `course.comingSoonNote ?? copy.library.emptyBody`
     («المحاضرات لسه ماتنشرتش. أول ما تنزل هتلاقيها هنا على طول، ومش محتاج تعمل حاجة.»)
   + `chip chip--solid` → `/library`, `copy.library.emptyCta` «نشوف باقي الكورسات».
   Checked **before** the enrolled split — the answer is the same either way.

2. **`outline.enrolled`** — a `.panel`:
   - headline: `progressPercent === 100`
     ? (`contentComplete ? copy.library.courseDone «خلصت الكورس»
                         : copy.library.courseUpToDate «خلّصت اللي نزل»`)
     : `copy.library.percentDone` «خلصت {percent}%»
   - mono accent `{clearedLessons} / {totalLessons}`
   - `LessonProgressBar(progressPercent)`
   - when `outline.nextLessonId` → amber `h-10` link to
     `/courses/{slug}/lessons/{nextLessonId}` with a `Play` glyph and
     `copy.library.resume` «نكمّل».

3. **not enrolled** — a `.panel`:
   - `copy.library.notEnrolledTitle` «نبدأ الكورس عشان المحاضرات تتفتح»
   - body: priced (any of `monthlyPriceCents`/`quarterlyPriceCents`/`yearlyPriceCents`
     non-null, or `terms.length > 0`) → `copy.library.notEnrolledBodyPriced`
     «الكورس ده مدفوع — دوسة على «نبدأ» وهيبان لك تفاصيل الاشتراك.»;
     otherwise `copy.library.notEnrolledBody`
     «الكورس مجاني بالكامل — دوسة على «نبدأ» وأول محاضرة بتتفتح على طول.»
   - `CourseStartButton(courseId, slug, hasLessons, prices, terms, instapay)` —
     calls `POST /api/courses/{courseId}/enroll` (`EnrollResponseSchema`
     `{ enrollmentId, resumeLessonId }`); a 403 opens the subscribe modal.
     `resumeLessonId === null` (published course with no published lessons) renders
     the button disabled rather than navigating into a lesson that does not exist.

### 8.3 Outline visibility rule

`CourseOutlineView` renders **only** when
`outline.totalLessons > 0 && (outline.enrolled || course is free)`,
where free = all three price fields `null` **and** `terms.length === 0`.
A priced course the student has not bought hides its outline entirely (every row
would 403 identically).

---

## 9. Shared course-outline vocabulary

Used by `/library/[slug]` (`components/library/course-outline.tsx`) and the lesson
player sidebar (`components/player/course-outline.tsx`). Styles: `.unit`,
`.lesson-row`, `.chip` in `apps/web/app/study.css`.

### 9.1 Grouping — `groupIntoEntries(lessons)`

Walks the section's lessons in order. A lesson with `kind === 'quiz' && !isExam`
attaches to the previous entry's `quizzes[]`; anything else starts a new entry.
An exam is therefore never nested, and an orphan quiz (no lecture before it in
its section) stands alone as its own entry.

### 9.2 Row

```
li.lesson-row [--done|--new|--started|--quiet|--quiz|--locked] [outline-row--current]
├─ span.lesson-row__well  → LessonKindIcon(kind)   (aria-hidden)
├─ div.lesson-row__text
│   ├─ p.lesson-row__title = lesson.title
│   ├─ p.lesson-row__meta  = parts joined with " · ":
│   │     [copy.library.lessonQuiz «كويز المحاضرة»  when nested under a lecture]
│   │     [copy.library.exam       «الامتحان النهائي» when isExam]
│   │     [formatDuration(estimatedSeconds)          when non-null]
│   │     lessonStateLabel(lesson)
│   └─ [isFreePreview] Badge tone=accent = copy.catalog.freePreview
└─ LessonChip → Link /courses/{slug}/lessons/{id}
   aria-label = "{label} — {title}"
   label: gate === 'cleared'                       → copy.library.review    «مراجعة»
          kind !== 'quiz'                          → copy.library.watch     «مشاهدة»
          quiz already sat (state failed|passed)   → copy.library.quizDone   «نتيجتك»
          quiz not sat                             → copy.library.takeQuiz   «دخول الامتحان»
   class: chip + (isLessonFinished ? chip--done : chip--solid)
```

Exactly **one** control per row. `.lesson-row__link` stretches the pointer target
over the whole row without adding a second tab stop.

### 9.3 Collapsible lecture entry

A lecture entry that carries at least one quiz renders as a native `<details class="unit">`,
open when the active lesson is the lecture or one of its quizzes. Summary =
kind icon + lecture title + `formatDuration(estimatedSeconds)` + a chevron.
Its body lists the lecture row then each quiz row with `isQuiz` (indented,
`.lesson-row--quiz`). A lecture with **no** quizzes stays a plain always-visible row.

### 9.4 Locked exam

Only the course's final exam can be `gate === 'locked'`. The row renders
`LockedExam` → `ExamLockedDialog`:
- trigger: `chip chip--locked` (grey, `cursor: not-allowed`) with a `LockIcon`
  and `copy.library.lessonLocked` «مقفول».
- dialog title `copy.library.lockedExamTitle` «الامتحان النهائي لسه مقفول»
- body: `formatCopy(copy.library.lockedExamBody, {remaining, total})`
  «بيفتح لما كل محاضرات الكورس تخلص — باقي {remaining} من {total}.»
  or, when `remaining` is 0/null, `copy.library.lockedExamBodyPlain`
  «بيفتح لما كل محاضرات الكورس تخلص.»
- list heading `copy.library.lockedExamLeftTitle` «المحاضرات اللي لسه فاضلة:»
  then up to **8** remaining lectures, each showing the title and a mono meta of
  `copy.library.lessonIndex` «المحاضرة {n}» + ` · ` + `lessonStarted`/`lessonNew`;
  overflow line `copy.library.lockedExamLeftMore` «و{n} محاضرة كمان في الفهرس تحت.»
- close button label = `copy.common.close` «إغلاق» (NOT `lockedClose`, which is
  the footer button «تمام» — two controls must not share one accessible name).

`remainingLectures(flatLessons)` counts **lectures only** (quizzes are skipped
before the counter increments), so lecture numbering never shifts.

---

## 10. LESSON PLAYER — `/courses/[slug]/lessons/[lessonId]`

The most complex screen after the quiz runner.
Files: `apps/web/app/(app)/courses/[slug]/lessons/[lessonId]/page.tsx`,
`homework-actions.ts`, `apps/web/components/player/*`,
`apps/web/lib/progress-client.ts`, `packages/contracts/src/progress.ts`.

### 10.1 Server load

Four parallel reads:

| call | endpoint | schema | failure handling |
|---|---|---|---|
| outline | `GET /api/courses/{slug}/outline` | `CourseOutlineSchema` | 404 → `null`; anything else rethrows |
| player | `GET /api/lessons/{lessonId}/player` | `LessonPlayerSchema` | **403 → `redirect('/courses/{slug}')`** (lapsed/revoked subscription); 404 → `null`; else rethrow |
| settings | cached public settings | — | `…OrDefaults` |
| shipping | `getBookShippingCents()` | — | cached |

Then:
- `if (!outline) notFound()` — the course is not theirs at all.
- `if (!payload) redirect('/library/{slug}')` — enrolled, but this lesson is
  gated; `/library/[slug]` is the page that can explain it.
- `payload.text.bodyHtml` is sanitized a second time **on the server**
  (`sanitizeRichText`) before it crosses to the client.

⚠️ A 404 genuinely means "not enrolled **or** no such lesson" — the API compiles
ownership into the query on purpose so the catalogue cannot be used as an oracle.
A 500 / 429 / dropped connection must **not** be rendered as "not found".

### 10.2 Payload — `LessonPlayerSchema`

```ts
{
  lesson: { id, courseId, courseSlug, courseTitle, sectionTitle, title,
            kind: 'video'|'quiz'|'attachment'|'text',
            estimatedSeconds: int | null }
  video: {
    youtubeId: string /^[A-Za-z0-9_-]{11}$/
    durationSeconds: int >= 0        // 0 = unknown
    posterUrl: string | null
    mirror: PlayerVideoMirror | null // our own HLS copy, { hlsUrl, ... }
  } | null
  text: { bodyHtml: string } | null
  homework: StudentHomework | null   // null also when the homework is a draft
  quiz: { id: string } | null        // published quiz attached to THIS lesson,
                                     // regardless of lesson.kind
  resources: PlayerResource[]
  progress: LessonProgress
  previous: { id, title, kind } | null
  next:     { id, title, kind } | null
  autoCompleteAvailable: boolean     // false when the duration is unknown
}

LessonProgress {
  lessonId: string
  state: 'not_started'|'in_progress'|'completed'|'passed'|'failed'
  completion: 0..1
  watchedSeconds: int >= 0
  maxPositionSeconds: int >= 0
  openCount: int >= 0
  completedAt: ISO datetime | null
  completedVia: 'auto'|'manual'|'dwell' | null
}

PlayerResource {
  id, title: string
  kind: 'presentation'|'video'|'document'|'link'
  description: string | null
  filename: string | null      // file kinds only
  mime: string | null
  sizeBytes: int | null
  youtubeId: string | null     // video kind only, 11 chars
  linkUrl: string | null       // link kind only, must start https://
  viewPath: string | null      // same-origin, starts /api/  — null for video/link
  downloadPath: string | null  // same-origin, starts /api/  — null for video/link
}
```

### 10.3 Page layout

```
main (mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8)
└─ div.grid.gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8
   ├─ div.min-w-0                       (content column, inline-start in RTL)
   │   ├─ LessonPlayerView(payload)     ← the video/text/attachment/quiz body
   │   ├─ h1  (mt-5, --fs-title-3, semibold) = payload.lesson.title
   │   ├─ p.mono (mt-1, --fs-mono-label, muted)
   │   │      = `${lesson.courseTitle} · ${lesson.sectionTitle}`
   │   └─ [payload.homework] LessonHomework(lessonId, homework)   (§10.9)
   └─ div.flex.flex-col.gap-4           (sidebar)
       ├─ CourseOutlineSidebar(outline, activeLessonId, shippingCents, instapay)
       ├─ CourseGroupCard(outline.course.whatsappGroupUrl)   — null renders nothing
       └─ CourseHelpCard(whatsapp)
```

The `max-w-[1440px]` is wider than the rest of the product (`--w-shell` 1152) —
the video is the one object that is better bigger.
**The title sits BELOW the player**, deliberately.

**Mobile (< `lg`):** a single column — player, title, meta, homework, then the
outline sidebar, group card and help card stacked underneath.

`CourseHelpCard` copy (`copy.player.help`): title «تحتاج مساعدة؟», lead
«لو عندك سؤال عن الكورس ده، ابعتله على واتساب.», cta «واتساب».

### 10.4 `CourseOutlineSidebar`

`nav[aria-label=copy.player.outline]`, `data-course-outline`,
`rounded-lg border bg-surface-2`, `max-h-[60dvh] overflow-y-auto`,
and from `lg`: `sticky top-6 max-h-[calc(100dvh-3rem)] self-start`.

Header block (`border-b px-5 py-5`):
- `p` = `copy.player.outline` «محتوى الكورس»
- `LessonProgressBar(outline.progressPercent, label = copy.player.courseProgress «تقدّمك في الكورس»)`
- mono line: `{completedLessons} {copy.player.lessonsCompleted} {totalLessons}`
  → «12 درس خلص من 40»
- when `courseBookCtaVisible(outline.course)`: `BookOrderButton(courseId,
  bookTitle, bookPriceCents, shippingCents, instapay)` — «اطلب الكتاب».

Body: `ol` of sections. Each section prints a mono zero-padded index
(`String(i+1).padStart(2,'0')`) beside its title, then `groupIntoEntries` rows
(§9). `OutlineScrollToCurrent` scrolls `[aria-current]` into view on mount —
essential, because an unbounded panel opening at lesson 1 of 40 is useless.

### 10.5 `LessonPlayerView` — body dispatch

`apps/web/components/player/lesson-player.tsx`. Local state:
`progress` (seeded from `payload.progress`), `saveFailed`.

On mount: `POST /api/lessons/{id}/open` (empty body) → `LessonProgressSchema`.
It registers `openCount`/`firstOpenedAt` **and writes
`enrollment.lastLessonId`**, which is what makes "resume" land here tomorrow.
A failure is swallowed (the lesson is still watchable).

Body rendered by `lesson.kind`:

| condition | renders |
|---|---|
| `kind==='video' && video` | `VideoLesson` (§10.6) |
| `kind==='video' && !video` | `<p role="status">` filling an `aspect-video` grey box = `copy.player.videoMissing` «المحاضرة دي لسه مافيهاش فيديو.» |
| `kind==='text' && text` | `TextLesson` — sanitized HTML + a **dwell timer** |
| `kind==='attachment'` | `AttachmentLesson` — `ResourceList` + a **dwell timer** |
| `kind==='quiz'` | `QuizLesson(variant='exam')` |
| `kind!=='quiz' && payload.quiz` | `QuizLesson(variant='attached')` — a bonus quiz alongside the lesson's own completion rule |
| `kind!=='attachment' && resources.length` | `LessonMaterials` (collapsed by default) |

Then, always:
- one hint paragraph:
  - `kind==='quiz'` → `copy.player.quizAutoCompleteHint` «الدرس ده بيتقفل لوحده مع النجاح في الاختبار.»
  - else `autoCompleteAvailable` → `copy.player.autoCompleteHint`
    «الدرس بيتقفل لوحده لما توصل لآخر الفيديو وتكون شُفت معظمه.»
  - else → `copy.player.manualOnlyHint`
    «مدة الفيديو مش متسجّلة، فدوسة على «الدرس خلص» في الآخر.»
- `[saveFailed]` `<p role="status">` in `--warn` = `copy.player.saveFailed`
  «مقدرناش نسجّل تقدّمك دلوقتي»
- `LessonNav` (§10.8).

`LessonMaterials`: a disclosure button (`aria-expanded`, `aria-controls`) with a
`DownloadIcon` well, title `copy.player.materials` «مواد المحاضرة» and
`{n} {copy.player.materialsCount}` «… حاجات مرفوعة». Closed by default.

`ResourceList` per resource: icon + title (+ mono `copy.player.mainPresentation`
«البريزنتيشن الأساسي» for `presentation`), optional description, then:
- `kind==='video'` → a `youtube-nocookie.com/embed/{youtubeId}` iframe
- `kind==='link'` → a YouTube id or Google-Drive file id is extracted and embedded
  when possible, plus an "open externally" link showing the hostname
- file kinds → `DocumentViewer`: a toggle labelled `copy.player.openDocument`
  «دوسة عشان يتفتح» / `copy.player.closeDocument` «دوسة عشان يتقفل», a download
  `<a href={downloadPath}>` labelled `copy.player.download` «تحميل المحاضرة»,
  and an `<iframe src={viewPath}>` once opened (an `<iframe>` and not `<object>`
  because the CSP sets `object-src 'none'`). Fallback text
  `copy.player.viewerUnavailable` «المتصفح مش قادر يعرض الملف — التحميل بيفتحه.»
- empty list → `copy.player.noResources` «مفيش مواد مرفوعة للدرس ده.»

`viewPath` / `downloadPath` are **same-origin `/api/…` routes** that re-derive
access per request; never construct a storage URL.

### 10.6 `VideoLesson` — the state machine

`apps/web/components/player/video-lesson.tsx` (768 lines) + `mirror-video.tsx`.

**States** (all local React state):
`activated`, `startedAt`, `player` (adapter handle), `failure`, `posterFailed`,
`plainFrame`, `mirrorFailed`, `fullscreen`.

**Source order — the mirror wins.**
`useMirror = video.mirror !== null && !mirrorFailed`.
Our own HLS copy is tried FIRST because on a ministry tablet YouTube is blocked
at the network and a blocked network reports **nothing** — a YouTube-first player
with our copy as fallback would never fall back.

**Resume point** — `resumePoint(furthest, duration)`:
```
RESUME_REWIND_SECONDS = 5
if !finite(furthest) → 0
point = floor(furthest) - 5
if point <= 0 → 0
if duration > 0 && point >= duration → 0      // stale position from a re-cut video
else point
```
`resumeAt` passed in is `payload.progress.completedAt != null ? 0
: payload.progress.maxPositionSeconds` — **read from the server-rendered payload,
never from live state** (a state read races the `postOpen` response against the
student's finger). A finished lesson always restarts at 0.

**Poster (before `activated`)** — a `div` containing:
- the poster image at full opacity + a `bg-black/45` scrim (dropped entirely if
  the image errors, `posterFailed`)
- a full-bleed transparent `<button>` = the whole tap target;
  `aria-label = playLabel`:
  - with a resume: `«تشغيل الفيديو — أكمل من {mm:ss} — {title}»`
  - without: `«تشغيل الفيديو — {title}»`
  (`copy.player.play` «تشغيل الفيديو», `copy.player.resumeFrom` «أكمل من»)
- an 80 px (`sm`: 96 px) amber disc with a play glyph, `pointer-events-none`
- the word `copy.player.play` «تشغيل الفيديو» under it (`--fs-title-4` semibold;
  white when a poster is behind it, `text-fg` otherwise)
- then **either**:
  - `resumeSeconds > 0` → a row: `copy.player.resumeFrom` «أكمل من» +
    `formatDuration(resumeSeconds)` (mono tabular) + a `pointer-events-auto`
    `min-h-11` outlined button `copy.player.restart` «من الأول»
    (`aria-label = "من الأول — {title}"`) which activates at 0.
  - else, `durationSeconds > 0` → the total duration in mono tabular.
  The resume line **replaces** the duration; both never show together (a 360 px
  phone's 184 px overlay cannot hold four stacked items).

**Activation** — `activate(startAt)`:
```
if (activated || no mount node) return
setActivated(true); setStartedAt(startAt)
if (useMirror) return                 // <MirrorVideo> mounts on the next render
await startYouTube(startAt)
```

**`startYouTube(startAt)`:**
1. `await loadYouTubeIframeApi()` — a script from `youtube.com` with its own timeout.
   On throw → `setPlainFrame(true)` (ad blocker / filtered DNS / captive portal).
2. `new api.Player(mount, { videoId, host: YOUTUBE_NOCOOKIE_HOST,
   playerVars: { rel:0, modestbranding:1, playsinline:1, hl:'ar',
   cc_lang_pref:'ar', origin, fs:1, start: startAt } })`.
   **No URL is ever read from the database — only the 11-char id.**
3. `onReady`: clear the ready timer, store the handle, set
   `allow="fullscreen…"` + `allowfullscreen` on the generated iframe, then
   **call `playVideo()`** — constructing a player only cues it.
4. `onError(event)` → `setFailure(failureOfCode(event.data))`:
   - `101` or `150` → `'embedBlocked'`
   - `100` → `'removed'`
   - `2`, `5`, anything else → `'unknown'`
5. A `FRAME_READY_TIMEOUT_MS = 15_000` timer armed **after** construction:
   if `onReady` never fires, destroy the instance and `setPlainFrame(true)`
   (the nocookie host was swallowed; try the ordinary host).

**Fallback plain iframe** (`plainFrame === true`):
`https://www.youtube.com/embed/{id}?autoplay=1&rel=0&modestbranding=1&playsinline=1&hl=ar&cc_lang_pref=ar&start={resumeSeconds}`
— the **ordinary** host, deliberately not nocookie. `autoplay=1` is safe because
the frame only ever mounts after a user gesture.
Under the player a `role="status"` line:
`copy.player.videoFallbackNote` «النت عندك كان مانع المشغّل بتاعنا، فشغّلناه بطريقة تانية. الدرس مش هيتسجّل لوحده — دوس «خلاص · التالي» لما تخلّص.»
plus a link `copy.player.videoOpenOnYouTube` «افتحه على يوتيوب» →
`https://www.youtube.com/watch?v={id}`.
**This path has no `getCurrentTime`, so there is no heartbeat and no
auto-completion.**

**Failure panel** (`failure !== null`) — absolutely positioned over the box,
`role="status"`, centred:
- `embedBlocked` → `copy.player.videoEmbedBlocked` «الفيديو ده مش مسموح يتشغّل جوه المنصة. افتحه على يوتيوب.»
- `removed` → `copy.player.videoRemoved` «الفيديو ده مش موجود على يوتيوب دلوقتي. ولو فضلت المشكلة، كلمة للمدرّس.»
- `unknown` → `copy.player.videoUnavailable` «الفيديو مش متاح دلوقتي»
plus the same «افتحه على يوتيوب» link. **No retry button** — the one retryable
failure (script blocked) now falls through to `plainFrame` instead.

**`MirrorVideo`** (`mirror-video.tsx`) — a plain `<video controls playsInline
autoPlay preload="metadata" poster={posterUrl} aria-label={title}>` filling the box:
- Safari / iOS (`canPlayType('application/vnd.apple.mpegurl') !== ''`) →
  set `element.src = mirror.hlsUrl` natively. **Never load hls.js on iOS** —
  no MSE, so it would attach, fail and report a fatal error for a stream that plays.
- everything else → dynamic `import('hls.js')`; if `!Hls.isSupported()` → `onFatal()`.
  Otherwise `new Hls({ startLevel: -1, capLevelToPlayerSize: true })`,
  `loadSource(hlsUrl)`, `attachMedia(element)`.
  Fatal `NETWORK_ERROR` → `instance.startLoad()`; fatal `MEDIA_ERROR` →
  `instance.recoverMediaError()`; anything else fatal → `onFatal()`.
  A failed dynamic import also calls `onFatal()`.
- `onFatal` in the parent: `setMirrorFailed(true)` then `startYouTube(startedAt)` —
  the student sees one frame reload, not an error.
- Seek: on the **first** `loadedmetadata` only (`seeked` guard), set
  `currentTime = startAt`. `loadedmetadata` fires again on every native quality
  change and re-seeking would drag the student backwards.
- The element is adapted to the YouTube player interface so ONE heartbeat
  implementation serves both:
  ```
  getCurrentTime() → element.currentTime
  getDuration()    → finite(element.duration) ? element.duration : 0
  getPlayerState() → element.ended ? 0 : element.paused ? 2 : 1
  playVideo()      → element.play().catch(noop)
  destroy()        → noop
  ```
  (`1 = PLAYING`, `2 = PAUSED`, `0 = ENDED`.)

**Fullscreen:** the shell div is the fullscreen element. A document-level
`keydown` listens for `event.code === 'KeyF'` (**never `event.key`** — on an
Arabic layout F emits «ب»), ignoring it when a modifier is held or the target is
an `INPUT`/`TEXTAREA`/`SELECT`/`contenteditable`. `fullscreenchange` syncs the
state back. In fullscreen the box drops `aspect-video`, the border and the radius
and takes `h-full`.

### 10.7 Progress reporting

Constants (`packages/contracts/src/progress.ts` — shared with the server):

```
VIDEO_POSITION_THRESHOLD      = 0.95
VIDEO_WATCHED_THRESHOLD       = 0.70
HEARTBEAT_INTERVAL_MS         = 10_000
MAX_HEARTBEAT_DELTA_SECONDS   = 15
HEARTBEAT_CLOCK_GRACE_SECONDS = 2
DWELL_COMPLETE_MS             = 5_000
VIEW_SESSION_GAP_SECONDS      = 1800   (30 min — ends a viewing sitting)
```

Completion rule (server authority, mirrored client-side only for display):
```
isVideoAutoComplete(s) =
  s.durationSeconds > 0
  && s.maxPositionSeconds >= 0.95 * s.durationSeconds
  && s.watchedSeconds    >= 0.70 * s.durationSeconds
```
Both thresholds are required: position alone is defeated by dragging the
scrubber, watch-time alone by leaving the tab playing.

`videoCompletionFraction(s)` = `0` when duration ≤ 0, `1` when auto-complete,
else `round(clamp(watched/duration,0,1) * 10_000)/10_000` (matches `numeric(5,4)`).

**Heartbeat loop** (`use-video-heartbeat.ts`):
- ticks every `1000 ms` while a player exists.
- each tick reads `getCurrentTime()`; `advanced = now - last`.
  Credit is added **only** when `getPlayerState() === PLAYING` **and**
  `0 < advanced <= MAX_HONEST_TICK_ADVANCE (2)` — a bigger jump is a seek.
- every `TICKS_PER_FLUSH = 10` ticks (i.e. 10 s) it flushes.
- flush: `position = max(floor(getCurrentTime()), 0)`,
  `delta = min(round(accumulated), 15)`; skipped when `delta <= 0` and not a
  keepalive flush; a flush is skipped while one is in flight.
  The accumulator is cleared **optimistically** and restored (capped at 15) if
  the POST fails, and `onError()` fires (surfacing `copy.player.saveFailed`).
- `POST /api/lessons/{id}/heartbeat` body `{ position:int 0..86400, delta:int 0..15 }`
  (`HeartbeatRequestSchema`, `.strict()` — extra keys are a 400).
  Response `HeartbeatResponseSchema`:
  `{ progress: LessonProgress, justCompleted: boolean, courseProgressPercent: 0..100 }`.
  **`justCompleted` is server-decided; the client mirrors it and never computes it.**
- `visibilitychange → hidden` and unmount flush with `keepalive: true`
  (**not** `navigator.sendBeacon` — a beacon cannot set the CSRF header).
- Server-side clamp: `allowedHeartbeatSeconds(claimed, elapsed) =
  min(clamp(floor(claimed),0,15), max(floor(elapsed),0) + 2)`. No request storm
  can accumulate watch time faster than wall-clock time.

**Dwell loop** (`use-dwell-complete.ts`, text + attachment lessons only):
- skipped when the lesson is already complete.
- after `DWELL_COMPLETE_MS` (5 s) → `POST /api/lessons/{id}/dwell` (empty body)
  → `HeartbeatResponse`.
- if the response's `progress.completedAt` is still null, retry once more after
  another 5 s. The **server** measures the real elapsed time from `first_opened_at`,
  so firing early or a hundred times cannot complete a lesson faster than 5 real
  seconds. Failures are silent (the manual button is always available).

**Client endpoints** (`apps/web/lib/progress-client.ts`):
| function | request |
|---|---|
| `postOpen` | `POST /api/lessons/{id}/open` `{}` → `LessonProgress` |
| `postHeartbeat` | `POST /api/lessons/{id}/heartbeat` `{position, delta}` → `HeartbeatResponse` |
| `postDwell` | `POST /api/lessons/{id}/dwell` `{}` → `HeartbeatResponse` |
| `postComplete` | `POST /api/lessons/{id}/complete` `{}` → `HeartbeatResponse` |

`EmptyBodySchema` is `z.object({}).strict()` — the manual button carries no payload.

### 10.8 `LessonNav`

```
div (flex-wrap, justify-between, gap-3, border-t, pt-6)
├─ left: [previous] Link → /courses/{slug}/lessons/{previous.id}
│            ChevronBack + copy.player.previous «الدرس السابق»
│         [next]     Link → …/{next.id}
│            copy.player.next «الدرس التالي» + ChevronForward
└─ right: [manualComplete] column
   ├─ Button, disabled while saving or already complete
   │    complete  → CheckIcon + copy.player.completed «تم»
   │    saving    → copy.player.marking «بنسجّل…»
   │    has next  → copy.player.markComplete «خلاص · التالي»
   │    last one  → copy.player.markCompleteFinal «الدرس خلص»
   └─ [failed] p role=alert aria-live=polite, --err, text-end
        = copy.player.markFailed «ماتسجّلش إن الدرس خلص. تأكيد على النت ودوسة تانية.»
```

`manualComplete = lesson.kind !== 'quiz'` — a quiz lesson is completed by
**passing**, and the server rejects a manual complete on one.

`finish()` sequence — order is load-bearing:
```
setSaving(true); setFailed(false)
try   { onProgress(await postComplete(lessonId))
        if (next) router.push(`/courses/${slug}/lessons/${next.id}`) }
catch { setFailed(true) }          // ⚠️ NAVIGATION IS NOT ATTEMPTED ON FAILURE
finally { setSaving(false) }
```
Advancing after a failed write is what makes a progress hole invisible.

### 10.9 `LessonHomework` — «واجب المحاضرة»

`apps/web/components/player/lesson-homework.tsx`; contract
`packages/contracts/src/homework.ts`; copy `copy.homework`.

`StudentHomework = { body: string, maxImages: int, submission: MyHomeworkSubmission | null }`
```ts
MyHomeworkSubmission {
  id: uuid
  status: 'submitted' | 'accepted' | 'needs_work'
  attempt: int >= 1
  imageCount: int >= 0
  imageIds: uuid[]
  imagesPurged: boolean          // images are deleted 30 days after review
  grade: 0..100 | null
  reviewNote: string | null
  submittedAt: ISO
  reviewedAt: ISO | null
}
```
`MAX_HOMEWORK_IMAGES = 8`, `DEFAULT_HOMEWORK_IMAGES = 4`,
`HOMEWORK_IMAGE_RETENTION_DAYS = 30`.

State: `canUpload = submission === null || submission.status === 'needs_work'`;
`reopened = status === 'needs_work'`; `remaining = maxImages - staged.length`.

```
section (mt-6, rounded-lg, border, bg-surface-2)
├─ header (ember tint, border-b, px-4 py-3)
│   NotebookPen in a 40px ember well + h2 copy.homework.title «واجب المحاضرة»
│   + [submission] StatusChip
├─ p muted   = copy.homework.lead «المطلوب في الواجب ده:»
├─ p whitespace-pre-line = homework.body   (PLAIN text with newlines, never HTML)
├─ [submission] Verdict block
│   «اتسلّم {n} صورة» (copy.homework.submittedCount) [· «المحاولة {attempt}» when >1]
│   [imagesPurged] copy.homework.imagesGone «الصور اتشالت بعد المراجعة، والتسليم متسجّل.»
│   [grade !== null] copy.homework.grade «الدرجة {grade} من ١٠٠»
│   [reviewNote] copy.homework.note «رد مهندس أيمن» + the note
└─ [canUpload] upload block
    [reopened] tinted notice = copy.homework.reopened «الواجب مفتوح تاني — رفع الحل الجديد من هنا.»
    p bold = copy.homework.uploadTitle «رفع صور الحل»
    p muted = formatCopy(copy.homework.uploadHint, {max}) «صوّر ورقة الحل ودوس هنا — لحد {max} صورة.»
    [staged] ul grid-cols-3 sm:grid-cols-4 of aspect-[3/4] previews,
             each with a 28px round remove button aria-label copy.homework.remove «شيل الصورة»
    row: [ImagePlus] secondary button = copy.homework.pick «اختيار الصور»
              (label copy.homework.uploading «بنرفع…» while busy; disabled when remaining<=0)
         primary button = copy.homework.submit «تسليم الواجب»
              (reopened → copy.homework.resubmit «تسليم الحل من تاني»;
               pending  → copy.homework.submitting «بنسلّم…»)
         [staged] «{n} صورة» (copy.homework.imageUnit)
    [error] p role=alert --err
```

Status chip labels: `statusPending` «الواجب اتسلّم — مستني مراجعة مهندس أيمن»,
`statusAccepted` «الواجب اتقبل», `statusNeedsWork` «الواجب محتاج شغل تاني».
Badge word elsewhere: `copy.homework.badge` «واجب».

**Upload flow** — two steps, and the file never goes through a Server Action:
1. per file, `POST /api/homework/lessons/{lessonId}/images` (multipart), max
   `MAX_UPLOAD_BYTES = 8 MiB`, images compressed in the browser first.
   Response `{ storageKey: string, sizeBytes: int }`.
2. `submitHomeworkAction(lessonId, images[])` → `POST /api/homework/lessons/{lessonId}/submissions`
   body `{ images: [{ storageKey, sizeBytes }] }` (`HomeworkSubmitSchema`,
   `.strict()`, 1..8 entries).
   On success the staged previews are revoked and the route refreshes.

Client-side errors:
- more files than `remaining` → `formatCopy(copy.homework.tooMany, {max})`
  «الحد الأقصى {max} صورة للواجب ده.»
- over size → `copy.homework.tooLarge` «الصورة كبيرة أوي — أقصى حجم ٨ ميجا للصورة.»
- wrong type / unreadable → `copy.homework.badType` «ده مش ملف صورة. الصور بس (JPG أو PNG أو WebP).»
- upload failed → `copy.homework.uploadFailed` «مقدرناش نرفع الصورة. نجرّب تاني.»
- submit failed → `copy.homework.submitFailed` «مقدرناش نسلّم الواجب دلوقتي. نجرّب تاني.»
- nothing staged → `copy.homework.empty` «لازم صورة واحدة على الأقل للحل.»

`GET /api/homework/lessons/{lessonId}` returns the same `StudentHomework`;
`GET /api/homework/images/{imageId}` streams one reviewed image.

### 10.10 `QuizLesson` — the doorway card

Two variants; the mechanics are identical, only the copy changes.

`sat = progress.state === 'passed' || 'failed'`; `passed = state === 'passed'`;
`percent = Math.round(progress.completion * 100)` — the quiz lesson's
`completion` **is** the best scaled score as a 0..1 fraction.

```
Card > CardBody (flex column, items-start, gap-4)
├─ QuizIcon (accent)
├─ sat ?
│    ├─ p muted = copy.player.quizYourScore «درجتك في الاختبار»
│    ├─ row: mono tabular --fs-title-2 «{percent}%»
│    │        + [passed] .verdict--pass = copy.quiz.passed «ناجح»   (no fail badge)
│    └─ p muted =
│         passed && attached → copy.player.quizAttachedPassedNote «نجحت في الكويز.»
│         passed             → copy.player.quizPassedNote «نجحت، والدرس اتقفل.»
│         else               → copy.player.quizFailedNote
│              «مراجعة الإجابات والدخول تاني ممكنين طول ما الاختبار مفتوح.»
│  : p muted = attached ? copy.player.quizAttachedIntro «في كويز قصير على المحاضرة دي.»
│                       : copy.player.quizIntro «الدرس ده اختبار — نبدأه في أي وقت.»
└─ Link → /quizzes/{lessonId}   (amber, h-10)
   label: sat  ? (attached ? copy.player.quizAttachedOpenCta «فتح الكويز»
                           : copy.player.quizOpenCta       «فتح الاختبار»)
        : (attached ? copy.player.quizAttachedCta «حلّ الكويز»
                    : copy.player.quizCta         «نبدأ الاختبار»)
```

The link never starts an attempt; `/quizzes/[lessonId]` owns that decision.

---

## 11. `/quizzes/[lessonId]` — the exam intro screen

`apps/web/app/(app)/quizzes/[lessonId]/page.tsx`.
Metadata title = `copy.quiz.resultsTitle` «نتيجتك».

**Data:** one read, `GET /api/quiz/lessons/{lessonId}` → `QuizOverviewSchema`
(`packages/contracts/src/quiz/overview.ts`). **Never cached** — attempt state and
open windows must always be fresh. A 404 → `notFound()`; anything else rethrows.

```ts
QuizOverview {
  quizId, lessonId: string
  questionCount: int          // scoped to nextPaper — never the sum of both papers
  sumMarks: number            // what the questions add up to
  gradeOutOf: number          // what the mark is reported OUT OF (use THIS)
  durationSeconds: int | null // null = untimed
  passPercent: number
  attemptsUsed: int
  allowsImprovement: boolean
  nextPaper: 'original' | 'improvement' | null   // null = no sitting left
  bestScore: number | null
  inProgressAttemptId: string | null
  blocked: { code: 'quiz_not_open_yet'|'quiz_closed'|'no_attempts_left',
             availableAt: string | null } | null
  attempts: AttemptHistoryRow[]
}
AttemptHistoryRow {
  id: string
  attemptNo: int
  state: 'in_progress'|'overdue'|'submitted'|'pending_review'|'abandoned'
  submittedAt: string | null
  scaledScore: number | null
  passed: boolean | null
  paper: 'original' | 'improvement'
  counts: boolean            // server-decided: is THIS the sitting that counts
}
```

**Derived on screen:**
```
improving   = nextPaper === 'improvement'
minutes     = durationSeconds ? Math.round(durationSeconds/60) : null
sittingAhead= inProgressAttemptId !== null || (!blocked && nextPaper !== null)
spent       = blocked?.code === 'no_attempts_left'
heading     = inProgressAttemptId ? copy.quiz.resume      «نكمّل امتحانك»
            : blocked             ? copy.quiz.resultsTitle «نتيجتك»
            : improving           ? copy.quiz.improveExam  «دخول امتحان التحسين»
            :                       copy.quiz.start        «نبدأ الامتحان»
```

### 11.1 Tree

```
main (max-w-[var(--w-shell)] px-4 py-8 md:px-6 md:py-10)
├─ header.stage.mb-6 > .stage__body
│   ├─ [allowsImprovement] p.stage__eyebrow = copy.quiz.papers[nextPaper ?? 'original']
│   │        original    «الامتحان الأصلي»
│   │        improvement «امتحان التحسين»
│   ├─ h1.stage__title = heading
│   ├─ [sittingAhead] p.stage__sub =
│   │        improving ? copy.examGate.improveIntro «قبل الدخول، في حاجتين لازم يكونوا معروفين.»
│   │                  : copy.quiz.hint            «مراجعة الإجابات كويس قبل التسليم.»
│   └─ .exam-stage__action — exactly ONE of:
│        inProgressAttemptId → Link chip chip--solid → attemptHref, copy.quiz.resume
│        blocked             → p.exam-stage__blocked = BLOCKED_COPY[code]
│        nextPaper           → StartAttemptButton
│        (else nothing)
├─ section.exam-facts.mb-8 — four StatTiles
└─ [attempts.length] section «محاولاتك السابقة»
```

Blocked copy map:
| code | copy key | Arabic |
|---|---|---|
| `quiz_not_open_yet` | `copy.quiz.notOpenYet` | «الامتحان لسه مفتحش» |
| `quiz_closed` | `copy.quiz.closed` | «الامتحان قفل» |
| `no_attempts_left` | `copy.quiz.noAttemptsLeft` | «الامتحان ده اتقدّم خلاص» |

### 11.2 The four facts

| icon | value | label |
|---|---|---|
| `ClipboardList` | `questionCount` | `formatCopy(copy.quiz.questionCount, {n})` «{n} سؤال» |
| `Target` | `formatMark(gradeOutOf)` | `formatCopy(copy.quiz.totalMarks, {marks})` «الدرجة الكلية {marks}» |
| `Clock` | `minutes ?? '—'` | `minutes === null ? copy.quiz.noTimeLimit «من غير وقت محدد» : formatCopy(copy.quiz.duration, {minutes})` «مدة الامتحان {minutes} دقيقة» |
| `Repeat2` (accent unless `spent`) | `spent ? '٠' : allowsImprovement ? '٢' : '١'` | `spent ? copy.quiz.noSittingsLeft «مفيش محاولات تانية» : allowsImprovement ? copy.quiz.twoAttempts «محاولة + تحسين» : copy.quiz.singleAttempt «محاولة واحدة»` |

⚠️ The total is `gradeOutOf`, **not** `sumMarks` — `gradeOutOf` is what
`ResultHeader`, the attempt rows and `/results` all divide by.
⚠️ The sittings tile counts what is **left**, not what the quiz allows.

### 11.3 Previous attempts

Header `.group-head` + h2 `copy.quiz.previousAttempts` «محاولاتك السابقة»
+ (when `bestScore !== null`) `«{copy.quiz.bestScore} {formatMark(bestScore)}»`
where `bestScore` label = «أعلى درجة».

Per row (`.attempt-row`, `.attempt-row--counts` when `showPaper && counts`):
- `showPaper = overview.allowsImprovement` — on a one-sitting quiz neither the
  paper name nor the "counts" marker means anything.
- well glyph: `Trophy` when marked as counting, else `ClipboardList`.
- title (stretched link):
  - `running = state === 'in_progress'` → `attemptHref(lessonId, id)`
  - otherwise → `reviewHref(lessonId, id)`
  - text = `showPaper ? copy.quiz.papers[paper] : formatCopy(copy.quiz.attemptNo, {n: attemptNo})` «المحاولة رقم {n}»
- meta = `scaledScore === null ? copy.quiz.essayPending «إجابتك المقالية عند المدرّس للتصحيح»
  : formatCopy(copy.quiz.marksEarned, {earned: formatMark(scaledScore), max: formatMark(gradeOutOf)})` «{earned} من {max}»
  plus ` · ` + `copy.quiz.counts` «الدرجة المحتسبة» when marked.
- verdict badge when `passed !== null`: `verdict--pass` `copy.quiz.passed` «ناجح»
  or `verdict--fail` `copy.quiz.failed` «محتاجة مراجعة».
- trailing `chip chip--quiet`: `running ? copy.quiz.resume «نكمّل امتحانك»
  : copy.quiz.reviewAnswers «مراجعة الإجابات»`.

Link helpers (`apps/web/lib/quiz-links.ts`):
```
quizHref(lessonId)             = /quizzes/{lessonId}
attemptHref(lessonId, id)      = /quizzes/{lessonId}/attempt/{id}
reviewHref(lessonId, id)       = /quizzes/{lessonId}/attempt/{id}/review
```

### 11.4 `StartAttemptButton` + `ExamGateDialog`

`apps/web/components/quiz/start-attempt-button.tsx`, `exam-gate-dialog.tsx`.

The button label comes from `paper`, **never** from `attemptsUsed`
(an abandoned sitting makes that count lie):
`improving ? copy.quiz.improveExam «دخول امتحان التحسين» : copy.quiz.start «نبدأ الامتحان»`.

Pressing it opens the gate; **the attempt is only created on confirm.**

Gate content, original paper:
```
art mark
title       copy.examGate.title  «قبل البداية»
description copy.examGate.intro  «الكلام ده يستاهل دقيقة قراية.»
points:
  Focus       copy.examGate.focusTitle    «تركيز في كل سؤال»
              copy.examGate.focusBody     «الامتحان بيتفتح مرة واحدة، ومفيش رجوع بعد التسليم.»
  ShieldCheck copy.examGate.recordedTitle «درجتك هتتسجّل»
              copy.examGate.recordedBody  «النتيجة بتتحفظ في سجلك وبتفضل فيه — مش بتتمسح ولا بتترجع.»
  Repeat2 | AlarmClock
              copy.examGate.onceTitle     «محاولة واحدة بس»
              allowsImprovement ? copy.examGate.onceExamBody
                 «دي محاولتك الأصلية. بعدها فيه محاولة تحسين واحدة، وأعلى درجة هي اللي بتتحسب.»
              : copy.examGate.onceBody    «الكويز ده ليه محاولة واحدة. حلّه وانت مركّز.»
tail = timing (below)
footer: secondary copy.examGate.cancel «مش دلوقتي» | primary copy.examGate.agree «تمام، نبدأ الامتحان»
```

Improvement paper:
```
title       copy.examGate.improveTitle «امتحان التحسين»
description copy.examGate.improveIntro «قبل الدخول، في حاجتين لازم يكونوا معروفين.»
points:
  Sparkles    improveDifferentTitle «الأسئلة هتكون مختلفة»
              improveDifferentBody  «ده امتحان تاني بأسئلة غير اللي فاتت. مذاكرة الأول، والاعتماد على اللي فات مش هينفع.»
  ShieldCheck improveSafeTitle «درجتك الحالية في أمان»
              improveSafeBody  «أعلى درجة في الاتنين هي اللي بتتحسب. ولو الدرجة طلعت أقل، الأولى هي اللي هتفضل.»
  AlarmClock  focusTitle «تركيز في كل سؤال» + the timing line
tail = copy.examGate.improveOnceBody «ودي فرصتك الوحيدة للتحسين — مفيش محاولة تالتة.»
primary = copy.examGate.improveAgree «تمام، نبدأ التحسين»
```

Timing line: `durationSeconds ? formatCopy(copy.examGate.timedBody, {minutes: Math.round(durationSeconds/60)})`
«الامتحان {minutes} دقيقة من أول دوسة على «نبدأ»، والوقت بيمشي حتى لو الصفحة اتقفلت.»
else `copy.examGate.untimedBody` «مفيش وقت محدد، بس المحاولة بتفضل مفتوحة لحد ما تتسلّم.»

- Escape and the overlay **do** close it (a gate, not a trap), but the confirm
  button is **not** auto-focused — the primary action must be reached deliberately.
- The close (X) label is `copy.common.close` «إغلاق», never `cancel` — two
  controls must not share an accessible name.

**Confirm →** `POST /api/quiz/quizzes/{quizId}/attempts` body
`{ acknowledged: true }` (recorded on the `attempt_started` event, so "they were
told" survives the dialog) → `{ attemptId }` → navigate to `attemptHref`.

On **any** failure the dialog stays open and shows, above the footer,
a `role="alert"` line in `--err`: `copy.quiz.startFailed` =
«مقدرناش نبدأ الامتحان دلوقتي. مفيش محاولة اتحرقت خالص — تأكيد على النت ونجرّب تاني.»
The message is never derived from the error. It is cleared when the dialog closes.

---

## 12. `/quizzes/[lessonId]/attempt/[attemptId]` — THE RUNNER

`apps/web/app/(app)/quizzes/[lessonId]/attempt/[attemptId]/page.tsx`,
`apps/web/components/quiz/quiz-runner.tsx`, `attempt-schema.ts`,
`use-attempt-autosave.ts`, `quiz-timer.tsx`, `question-view.tsx`,
`question-navigator.tsx`, `submit-dialog.tsx`, `ordering-list.tsx`.

### 12.1 Chrome

**None.** `isAttemptRoute` matches this exact path and the shell renders the
children bare — no rail, no topbar, no bell, no account menu, no assistant.
A support launcher over a timed exam is one mis-tap from leaving it, and a
channel to a person beside a graded question is an integrity hole.
The `…/review` route underneath is **not** an attempt and keeps the full shell.

### 12.2 Load — resume on EVERY visit

`POST /api/quiz/attempts/{attemptId}/resume` (no body) → `StartedAttemptSchema`.

There is no special-cased "first visit": a fresh navigation after Start, a hard
reload, and reopening the tab after a disconnect all call `resume()` and all get
the same snapshotted questions, the same option order, a **rotated attempt token**
(killing whatever tab held the previous one), and the server's current
`deadlineAt` / `serverTime` pair.

A 404 (the helper throws a plain `Error` whose message contains
`failed with 404`) → `notFound()`.

The stem and every option body are **sanitized once on the server** per page load
(`sanitizePaper`), not per render.

```ts
StartedAttempt {
  attemptId: string
  attemptToken: string
  deadlineAt: string | null       // null = untimed
  serverTime: string              // the clock anchor
  status: 'in_progress'
  navMethod: 'free' | 'sequential'
  paper: 'original' | 'improvement'
  gradeOutOf: number
  sumMarks: number
  nextSeq: number                 // lowest seq this page may send
  graceSeconds: number
  overdueHandling: 'autosubmit' | 'graceperiod' | 'autoabandon'
  questions: LearnerQuestion[]
}
LearnerQuestion {
  slotPosition: number            // 0-based; displayed as slotPosition + 1
  questionId: string
  type: 'mcq_single'|'mcq_multi'|'true_false'|'short_answer'|'ordering'|'essay'
  stemHtml: string
  maxMark: number
  options: { id: string, bodyHtml: string }[]
  response: unknown               // previously saved answer, or null
  flagged: boolean
  answered: boolean
  settings: { minWords?: number, maxWords?: number }
}
```

**Answer shape** (`AnswerResponse`):
```ts
{ kind: 'choice', optionIds: string[] } | { kind: 'text', text: string } | null
```
`toAnswerResponse(value)` accepts only those two shapes and returns `null` otherwise.

### 12.3 Runner state

```
responses  : Record<slotPosition, AnswerResponse|null>  seeded from question.response
flags      : Record<slotPosition, boolean>              seeded from question.flagged
currentSlot: first question's slotPosition
serverTime : re-anchored from every autosave response
deadlineAt : frozen at load
submitDialogOpen, submitting, leaveDialogOpen
autosave.status : 'idle'|'saving'|'saved'|'error'|'stale'
```

Derived:
```
answeredCount   = count of slots whose response is not null/undefined
flaggedCount    = count of true flags
answeredPercent = questions.length ? answeredCount/questions.length*100 : 0
isLast          = currentIndex >= questions.length - 1
```
The bar's meter tracks questions **answered**, not questions visited.

### 12.4 Layout

```
main (max-w-[var(--w-shell)] px-4 py-8 md:px-6 md:py-10)   ← px-4 on phones
└─ div.runner   (grid gap-16px; from 64rem: grid-template-columns minmax(0,1fr) 15rem)
   ├─ div.runner__main (flex column, gap 16px)
   │   ├─ div.runner-bar   ⚠️ position:sticky; inset-block-start:0; z-index:20
   │   │   ├─ .runner-bar__progress
   │   │   │   ├─ p.runner-bar__count =
   │   │   │   │    formatCopy(copy.quiz.questionOf,{current: idx+1, total}) «سؤال {current} من {total}»
   │   │   │   │    + " · " +
   │   │   │   │    formatCopy(copy.quiz.answeredCount,{answered,total}) «جاوبت على {answered} من {total}»
   │   │   │   └─ span.runner-bar__meter > span   (transform: scaleX(pct/100), origin inline-start)
   │   │   └─ QuizTimer   (the clock stands ALONE on this side)
   │   ├─ div.runner-card → QuestionView
   │   └─ div.runner-foot (flex-wrap, justify-between, gap-12px, border-t, pt-16px)
   │       ├─ navMethod === 'free' ? Button secondary copy.quiz.previous «السابق»
   │       │                          (disabled at index 0)
   │       │                        : <span/>  (sequential hides Previous entirely)
   │       └─ isLast ? [Button primary copy.quiz.submit «تسليم الامتحان»]
   │                 : [Button ghost   copy.quiz.submit] + [Button primary copy.quiz.next «التالي»]
   └─ [navMethod === 'free'] aside.runner-nav
       ├─ p.runner-nav__title = copy.quiz.navigator «خريطة الأسئلة»
       ├─ QuestionNavigator
       └─ p.runner-nav__legend = answeredCount line [+ " · " + «{n} سؤال معلّم» when flaggedCount>0]
```

**Mobile:** one column. The navigator renders **below** the card (hence
`z-index: 20` on the sticky bar — `.nav-chip` is positioned and would otherwise
scroll over it). The bar is sticky at `top: 0` with nothing above it because the
shell is gone; budget ~90 px of taken viewport (it wraps, and at the narrowest
widths the clock drops under the meter).
`sequential` nav hides the navigator aside **and** the Previous button.

### 12.5 The clock — `QuizTimer`

`useServerCountdown(deadlineAt, serverTime)`:
- anchors ONCE per `serverTime` value: `{ perf: performance.now(), serverMs: Date.parse(serverTime) }`.
- ticks every **250 ms**: `now = anchor.serverMs + (performance.now() - anchor.perf)`,
  `remaining = max(0, deadlineMs - now)`.
- **The system clock is never read again after the anchor** — a wrong or jumping
  device clock cannot buy or steal time.
- Every autosave response carries a fresh `serverTime` which **re-anchors** the offset.
- State is committed only when the displayed whole second changes
  (`Math.ceil(ms/1000)`), except the zero crossing which commits immediately so
  the autosubmit is never up to a second late.
- `deadlineAt === null` ⇒ the component renders nothing at all.

Display: `runner-clock`, mono tabular, `AlarmClock` glyph, `MM:SS` zero-padded
(`formatClock`). Escalation:
- `<= 300 s` → `runner-clock--warn` (amber-ish warn tokens)
- `<= 60 s` → `runner-clock--critical` (error tokens)

Overdue handling when the countdown hits 0:
```
overdueHandling === 'graceperiod' && graceSeconds > 0 && grace not yet entered
   → enter grace: a SECOND countdown of graceSeconds from the deadline,
     always rendered as --critical, text =
     formatCopy(copy.quiz.graceRemaining, {seconds}) «الوقت خلص — فاضل {seconds} ثانية للتسليم.»
     when the grace itself hits 0 → onTimeUp()
otherwise → onTimeUp()   (fired exactly once, guarded by a ref)
```
`onTimeUp` in the runner is `submitOnce()` — the autosubmit.

**Screen-reader announcements** — the visible clock ticks every second but
`role="timer"` carries an implicit `aria-live="off"`. A separate visually-hidden
`aria-live="polite"` region announces **once** at each threshold, first time the
countdown drops to or below it:
| threshold | copy key | Arabic |
|---|---|---|
| 600 s | `copy.quiz.timeRemaining10Min` | «باقي 10 دقايق على انتهاء وقت الامتحان» |
| 300 s | `copy.quiz.timeRemaining5Min` | «باقي 5 دقايق على انتهاء وقت الامتحان» |
| 60 s | `copy.quiz.timeRemaining1Min` | «باقي دقيقة واحدة على انتهاء وقت الامتحان» |
| 30 s | `copy.quiz.timeRemaining30Sec` | «باقي 30 ثانية على انتهاء وقت الامتحان» |
Each fires at most once for the component's lifetime; the grace countdown drives
the same announcer once it starts.

### 12.6 Autosave — `useAttemptAutosave`

```
intervalMs = 15_000
MAX_BACKOFF_MS = 30_000
seqRef starts at initial.nextSeq
dirtyRef : Map<slotPosition, AnswerResponse|null>
```

- `setAnswer(slot, response)` only **marks the slot dirty**. It schedules no
  network call.
- Flush triggers: the 15 s interval, `flushNow()` (question navigation, opening
  the submit dialog, submitting, leaving), `visibilitychange → hidden`
  (keepalive), `pagehide` (keepalive).
- A flush snapshots `[slot, valueAtSendTime]` pairs, increments `seq` on **every
  send attempt including retries**, and issues
  `PUT /api/quiz/attempts/{attemptId}/answers` with body
  `{ attemptToken, seq, answers: [{ slotPosition, response }] }`.
  Response `SaveResultSchema`:
  `{ savedSlots: number[], serverTime: string, deadlineAt: string|null, answeredCount: number }`.
- Success: clear only the slots this request sent **and only if nothing newer
  overwrote them while in flight**; reset backoff to 1000 ms; `status = 'saved'`;
  call `onSaved(result)` (which re-anchors the timer's `serverTime`).
- **409 → `status = 'stale'` permanently.** No retry, ever — retrying a stale
  write is how a second tab silently loses an hour of work.
- any other failure → `status = 'error'`, retry after `backoff`, then
  `backoff = min(backoff*2, 30_000)`.
- A caller awaiting `flushNow()` while a request is already in flight gets **that
  request's promise**, not an immediate resolve. `flushNow()` never rejects.

Status labels (`AUTOSAVE_STATUS_LABEL`) rendered in the question card's footer:
| status | copy key | Arabic |
|---|---|---|
| `idle` | — | `''` |
| `saving` | `copy.quiz.saving` | «بيتحفظ…» |
| `saved` | `copy.quiz.saved` | «اتحفظ» |
| `error` | `copy.quiz.saveFailed` | «مقدرناش نحفظ إجابتك — بنحاول تاني» |
| `stale` | `copy.quiz.staleTab` | «الامتحان ده مفتوح في مكان تاني. تحديث الصفحة عشان نكمّل من هنا.» |

**Stale screen** — when `autosave.status === 'stale'` the runner replaces the
entire paper with:
```
div (max-w-[var(--w-prose)], centred, py-24)
  p = copy.quiz.staleTab
  Button = copy.common.retry «نحاول تاني»  → router.refresh()
```
and releases the back guard (there is nothing left to guard).

**Flags do NOT ride the answer autosave.** `SaveAnswersSchema` has no `flagged`
field. `setFlag(slot, flagged)` issues its own
`POST /api/quiz/attempts/{attemptId}/flag` body `{ attemptToken, slotPosition, flagged }`
→ `{ flagged: boolean }`, fire-and-forget, swallowed on failure, and skipped
entirely once stale. Toggling a flag also calls `flushNow()` for the answers.

### 12.7 Question card — `QuestionView`

Memoised; the runner passes stable props (`useMemo` for the question,
`useCallback` for all three handlers).

```
div (flex column, gap-5)
├─ header row (flex-col items-start gap-3 → sm:flex-row sm:justify-between sm:gap-4)
│   ├─ SafeHtml(stemHtml)  min-w-0 max-w-[var(--w-prose)]
│   └─ Button ghost sm shrink-0, aria-pressed=flagged, accent text when flagged
│        flagged ? copy.quiz.unflag «شيل العلامة» : copy.quiz.flag «علّم السؤال»
├─ ONE of the four input blocks (below)
└─ footer row (justify-between)
    ├─ button (dotted underline, disabled when response === null)
    │      = copy.quiz.clearAnswer «مسح إجابتي»   → onChange(null)
    └─ p aria-live=polite mono = saveStatus
```

⚠️ The header **stacks below `sm`**: as one row at 360 px both children shrank and
the flag label wrapped outside its own `h-10` box.

Input blocks by `type`:

| type | control | onChange payload |
|---|---|---|
| `mcq_single`, `true_false` | `RadioGroup`, `value = chosenIds[0] ?? ''` (**never `undefined`** — that makes Radix uncontrolled for life), one `.runner-option` label per option | `{kind:'choice', optionIds:[value]}` |
| `mcq_multi` | one `Checkbox` per option inside `.runner-option` | `nextIds.length ? {kind:'choice', optionIds: nextIds} : null` |
| `ordering` | `OrderingList` — lazily imported (`ssr:false`, ~40-50 KB of dnd-kit); drag **or** move-up/move-down buttons | every move saves the WHOLE sequence: `{kind:'choice', optionIds}`. An untouched question stays `null` — the served order is a shuffle, not an answer |
| `short_answer`, `essay` | `Textarea` (`aria-label = copy.quiz.typeAnswer` «إجابتك هنا»; `min-h-56` for essay) + a word counter | `value.length ? {kind:'text', text: value} : null` |

Word counter: `formatCopy(copy.quiz.wordCount, {n})` «{n} كلمة» where
`wordCount(t) = t.trim().length === 0 ? 0 : t.trim().split(/\s+/).length`.

Ordering copy: `copy.quiz.orderInstruction` «ترتيب العناصر بالسحب، أو بأزرار التحريك»,
`moveUp` «حرّك لفوق», `moveDown` «حرّك لتحت»,
`movedTo` «{item} — المركز {position} من {total}» (announced),
`orderAllOrNothing` «السؤال ده بيتصحح كامل — الترتيب لازم يبقى مظبوط كله».

**Options render in the snapshotted server order and are never re-sorted client-side.**

`.runner-option`: a big target — `flex items-start gap-12px padding 12px/16px`,
hairline border, `:has(:checked)` → amber border + 8 % amber wash.

### 12.8 `QuestionNavigator`

`nav[aria-label=copy.quiz.navigator]` → `ul.runner-nav__grid` (wrapping flex, 8 px gap).
One button per question:
- text: `String(slotPosition + 1).padStart(2,'0')`
- `aria-label = "{copy.common.question} {slotPosition + 1}"` → «السؤال 3»
- `aria-current="step"` on the current one
- `data-answered="true"|"false"` (a stable handle, not styling)
- roving tabindex: exactly one button is `tabIndex=0`
- **RTL arrow keys are reversed** (WAI-ARIA APG): `ArrowLeft` → next,
  `ArrowRight` → previous, `Home` → first, `End` → last.
- classes: `.nav-chip`, `+ --current` (amber ring), `+ --answered` (filled surface);
  flagged adds a `.nav-chip__flag` amber dot (`aria-hidden`).
- **Four states told apart by weight and fill, never by hue.** No green, no red —
  this grid is two clicks from a screen where those mean right and wrong.
- Size: 44 px below `md`, 36 px from `md`.

### 12.9 Navigation & scroll

`goTo(slot)`:
```
autosave.flushNow()        // fire-and-forget here
setCurrentSlot(slot)
window.scrollTo({ top: 0, behavior: 'auto' })
```
The scroll reset is **required**: changing question is React state, not a route
change, so the router's scroll restoration never fires; on a phone the offset is
500-600 px and «التالي» used to land the student mid-options with the stem off
screen. `behavior: 'auto'` (not `'smooth'`) so the reduced-motion CSS backstop
actually applies.

`goRelative(delta)` resolves the target by index and calls `goTo`.

### 12.10 Submit

```
openSubmitDialog()  : AWAIT autosave.flushNow(), then open.
                      (Awaiting is what closes the race with the dialog's own
                       preflight GET; firing both in one tick only narrows it.)
submit()            : AWAIT autosave.flushNow()
                      POST /api/quiz/attempts/{attemptId}/submit  { attemptToken }
                        → { attemptId }
                      releaseBackGuard()      ← BEFORE the push
                      router.push(reviewHref(lessonId, attemptId))
                    catch 409 → toast.info(copy.quiz.alreadySubmitted)
                                «الامتحان ده اتسلّم خلاص.»
                                releaseBackGuard(); push to the review anyway
                    catch other → toast.error(copy.common.saveFailed)
                                «الحفظ فشل — التغييرات اترجعت زي ما كانت»
submitOnce()        : guarded by `submitting` so a double tap cannot double-post.
```

`SubmitDialog`:
- On open it fetches `GET /api/quiz/attempts/{attemptId}/preflight` →
  `{ unansweredCount: number, total: number }`. The **headline count always comes
  from the server**, never from local state, so a failed autosave cannot turn
  "3 unanswered" into "0".
- Body states:
  - loading → `copy.common.loading` «ثانية واحدة…»
  - error → `copy.common.error` «حصلت مشكلة» + a secondary `copy.common.retry`
    «نحاول تاني» button. Confirm stays **enabled** — a failed preflight must not
    wedge the dialog.
  - `unansweredCount === 0` → `copy.quiz.submitConfirmAllAnswered` «جاوبت على كل الأسئلة.»
  - otherwise → `formatCopy(copy.quiz.submitConfirmUnanswered, {count})`
    «لسه فيه {count} سؤال من غير إجابة.» plus a wrapping list of jump chips built
    from the CLIENT's own unanswered slots (44 px below `md`, 32 px above);
    tapping one closes the dialog and jumps to that question.
- Title `copy.quiz.submitConfirmTitle` «نسلّم الامتحان؟»,
  description `copy.quiz.submitConfirmBody` «بعد التسليم مش هتقدر تغيّر إجاباتك.»
- Footer: **cancel is auto-focused** — `copy.quiz.submitCancel` «الرجوع للأسئلة»;
  confirm = `copy.quiz.submitConfirmAction` «أيوه، نسلّم», swapping to
  `copy.quiz.submitting` «بيتسلّم…» while pending. Both labels occupy the same
  grid cell (the hidden one is `invisible`, not `opacity-0`) so the button never
  changes width under a thumb.
- Confirm is disabled while `submitting` **or** while the preflight is still
  loading and has not errored.

### 12.11 Leaving the attempt

- **Pull-to-refresh is disabled for exactly as long as the runner is mounted**:
  `document.documentElement.style.overscrollBehaviorY = 'contain'` on mount, the
  previous inline value restored on unmount. Only the block axis — the inline
  axis carries the edge-swipe back gesture.
- The back gesture is intercepted by `useBackDismiss(handler, { rearm: true })`.
  It sits **under** any overlay: back with the submit dialog up closes the dialog
  only; back with the paper bare opens the leave dialog; back again closes that
  dialog and leaves the student in the paper.
- `beforeunload` is **not** used — the App Router handles back as a soft
  navigation, so it never fires.
- Leave dialog: title `copy.quiz.leaveTitle` «الخروج من الامتحان؟»,
  body `copy.quiz.leaveBody` «إجاباتك محفوظة، بس الوقت هيفضل ماشي بره. والرجوع للكمالة من نفس المكان ممكن قبل ما الوقت يخلص.»,
  ghost `copy.quiz.leaveConfirm` «الخروج من الامتحان»,
  **auto-focused** primary `copy.quiz.leaveStay` «نكمّل الامتحان».
  Close (X) label = `copy.common.close` «إغلاق».
- `leaveAttempt()` = `await flushNow()` → `releaseBackGuard()` →
  `router.replace(quizHref(lessonId))`. A **replace** to the quiz page, never
  history arithmetic.
- When the tab goes stale the guard is released so back is not silently swallowed.

### 12.12 Runner state machine (summary)

```
                 ┌────────── resume() on every load ──────────┐
   (mount) ──────► in_progress  ──── setAnswer ───► dirty      │
                     │  ▲                │                     │
                     │  └── flush ok ────┘ (status saved)      │
                     │                                          │
        409 on save ─┴────────────────────────► stale (terminal, full-screen notice)
                     │
   timer 0 ──► [graceperiod?] ──► grace countdown ──► onTimeUp
                     │ no                                  │
                     └───────────────► onTimeUp ───────────┘
                                            │
                                       submitOnce()
                                            │
                          ┌── 200 ──► push /review
                          ├── 409 ──► toast «اتسلّم خلاص» → push /review
                          └── else ─► toast saveFailed, stay in the paper
   back gesture ──► leave dialog ──► leave → replace /quizzes/{lessonId}
```

---

## 13. `/quizzes/[lessonId]/attempt/[attemptId]/review` — «مراجعة إجاباتك»

`apps/web/app/(app)/quizzes/[lessonId]/attempt/[attemptId]/review/page.tsx`,
`components/quiz/result-header.tsx`, `review-locked.tsx`, `review-list.tsx`,
`review-question.tsx`. Contract: `packages/contracts/src/quiz/attempt.ts`.

**Chrome:** full shell (this is not an attempt route).
**Metadata title:** `copy.quiz.reviewTitle` «مراجعة إجاباتك».

**Data:** `GET /api/quiz/attempts/{attemptId}/review`, **never cached** — the
review window can flip between two loads. **403 and 404 both → `notFound()`**;
anything else rethrows. (A revoked enrolment or an unpublished lesson puts a
student holding a review link into that branch; rendering the generic error
boundary there also poisoned the admin error log.)

Response is a discriminated union on `locked`:

```ts
// locked
{ locked: true, reason: 'during' | 'awaitingClose' }

// unlocked
{
  locked: false
  attemptId: string
  window: 'during' | 'immediatelyAfter' | 'laterWhileOpen' | 'afterClose'
  rawScore: number | null
  scaledScore: number | null
  gradeOutOf: number
  sumMarks: number
  passPercent: number
  passed: boolean | null
  questions: ReviewQuestion[]
}

ReviewQuestion {
  slotPosition: number
  questionId: string
  attemptQuestionId: string
  type: QuestionType
  stemHtml: string
  options: { id, bodyHtml }[]
  // EVERY field below is OMITTED when the resolved 4×7 review matrix forbids it.
  // There is no "null to hide it" variant — a key whose value is null is itself
  // information. Branch on PRESENCE.
  response?: unknown
  correctness?: 'correct'|'partial'|'incorrect'|'needsGrading'|'unanswered'
  mark?: number | null
  maxMark?: number
  feedbackHtml?: string
  generalFeedbackHtml?: string
  rightAnswerText?: string        // display prose only, never parsed
  rightAnswerOptionIds?: string[] // choice types only — drives the highlight
}
```

⚠️ A **locked** review returns no `questions` array at all — not even an empty
one, because a length would leak the question count.

### 13.1 Layout

```
main (mx-auto max-w-[var(--w-prose)] px-6 py-10)
├─ h1 (mb-6, --fs-title-2, semibold) = copy.quiz.reviewTitle «مراجعة إجاباتك»
└─ locked ? ReviewLocked(reason)
          : div.flex.flex-col.gap-6
            ├─ ResultHeader(scaledScore, gradeOutOf, passPercent, passed,
            │               needsGrading = questions.some(q => q.correctness === 'needsGrading'))
            └─ ReviewList(questions)
```

### 13.2 `ReviewLocked`

A `Card` with a centred body (`py-12`):
- `copy.quiz.reviewLocked` «المراجعة مش متاحة دلوقتي»
- `reason === 'during'` → `copy.quiz.reviewLockedDuringBody`
  «هتقدر تراجع إجاباتك بعد ما تسلّم المحاولة.»
- `reason === 'awaitingClose'` → `copy.quiz.reviewLockedUntilClose`
  «هتقدر تراجع إجاباتك بعد ما الامتحان يقفل.»

No question list of any kind.

### 13.3 `ResultHeader`

```
div (rounded-lg, border, bg-surface-2, p-5, flex column gap-3)
├─ p.eyebrow = copy.quiz.resultsTitle «نتيجتك»
├─ row (items-baseline, gap-3)
│   ├─ p.mono --fs-title-1 tabular =
│   │     scaledScore === null ? '—' : formatMark(scaledScore)
│   │     + <span muted> / {gradeOutOf}</span>
│   └─ [passed !== null] Badge tone=ok|err =
│         copy.quiz.passed «ناجح» | copy.quiz.failed «محتاجة مراجعة»
├─ p.mono = formatCopy(copy.quiz.passMark, {percent: passPercent}) «درجة النجاح {percent}%»
└─ needsGrading ? p = copy.quiz.essayPending «إجابتك المقالية عند المدرّس للتصحيح»
                : band ? p = band : null
```

`band` (null when `passed === null` **or** `needsGrading`):
- `passed && scaledScore !== null && scaledScore/gradeOutOf >= 0.9`
  → `copy.quiz.scoreBandExcellent` «أداء ممتاز»
- `passed` → `copy.quiz.scoreBandGood` «أداء كويس»
- else → `copy.quiz.scoreBandNeedsWork` «محتاج مراجعة للدرس تاني»

No confetti, no gradient ring, no emoji. `--ok` / `--err` appear here and in
`review-question.tsx` and **nowhere else in the product**.

### 13.4 `ReviewList` — the «الغلطات بس» filter

```
gradeable = questions.filter(q => q.correctness !== undefined)
WRONG     = { 'incorrect', 'partial', 'unanswered' }
wrong     = gradeable.filter(q => WRONG.has(q.correctness))
canFilter = gradeable.length > 0     // false in a window that withholds correctness
shown     = wrongOnly ? wrong : questions
```
Header row (only when `canFilter`):
- left: `wrong.length === 0 ? copy.quiz.allCorrect «مفيش ولا غلطة — ورقة كاملة»
  : formatCopy(copy.quiz.wrongCount, {n: wrong.length, total: gradeable.length})` «{n} غلط من {total}»
- right: when `wrong.length > 0`, a two-button group
  (`role="group" aria-label = copy.quiz.reviewTitle`) with `aria-pressed`:
  - `ListChecks` + `copy.quiz.showAll` «كل الأسئلة»
  - `XCircle` + `copy.quiz.wrongOnly` «الغلطات بس»
  when `wrong.length === 0`, a `verdict--pass` chip with `CheckCircle2` +
  `copy.quiz.passed` «ناجح» instead (a filter whose only outcome is an empty
  screen is not shipped).

The filter is purely client-side and **cannot reveal anything** — the server has
already omitted every field the window forbids.

### 13.5 `ReviewQuestion`

```
div[data-correctness={correctness}] (rounded-lg, border, bg-surface-2, p-5, gap-4)
├─ head row
│   ├─ p.mono = String(slotPosition+1).padStart(2,'0')
│   └─ right: [mark !== undefined && maxMark !== undefined] mono «{mark ?? '—'} / {maxMark}»
│             [correctness] p font-medium in CORRECTNESS_TONE[correctness]
│                            = CORRECTNESS_LABEL[correctness]
├─ SafeHtml(stemHtml)
├─ body by type (below)
├─ [feedbackHtml] label copy.quiz.questionFeedback «ملاحظة على إجابتك» + SafeHtml
└─ [generalFeedbackHtml] label copy.quiz.explanation «الشرح» + SafeHtml
```

Correctness labels / tones:
| value | label key | Arabic | tone |
|---|---|---|---|
| `correct` | `copy.quiz.correct` | «إجابة صحيحة» | `text-ok` |
| `partial` | `copy.quiz.partial` | «إجابة صح جزئيًا» | `text-fg` |
| `incorrect` | `copy.quiz.incorrect` | «إجابة خاطئة» | `text-err` |
| `needsGrading` | `copy.quiz.needsGrading` | «محتاج تصحيح من المدرّس» | `text-fg-muted` |
| `unanswered` | `copy.quiz.notAnswered` | «مجاوبتش» | `text-fg-muted` |

**Choice types** (`mcq_single`, `mcq_multi`, `true_false`) — one row per option:
```
correctIds = new Set(rightAnswerOptionIds ?? [])   ← ID MEMBERSHIP, never a string split
isChosen        = response.optionIds.includes(option.id)
isCorrectOption = correctIds.has(option.id)
isWrongChosen   = isChosen && !isCorrectOption && correctness === 'incorrect'

border/background:
  isCorrectOption → border-ok  + 8% ok wash
  isWrongChosen   → border-err + 8% err wash
  isChosen        → border-accent
  else            → border-line-subtle

second channel (colour is NEVER the only signal):
  isCorrectOption → CheckGlyph + copy.quiz.rightAnswer «الإجابة الصحيحة»  (ok)
  isWrongChosen   → CrossGlyph + copy.quiz.yourAnswer  «إجابتك»            (err)
  isChosen        → plain muted copy.quiz.yourAnswer   «إجابتك»
```

**Ordering** — two numbered lists side by side (`flex-col sm:flex-row`), never
per-option highlights:
- `copy.quiz.yourOrder` «ترتيبك» — the student's `optionIds` in order; each row is
  marked in place / out of place by **position** comparison
  (`correctIds[index] === option.id`), with a `CheckGlyph`/`CrossGlyph` and an
  ok/err border. Empty → `copy.quiz.notAnswered` «مجاوبتش».
- `copy.quiz.rightOrder` «الترتيب الصحيح» — `rightAnswerOptionIds` in order,
  `tone='ok'`. Rendered only when that array is present and non-empty.
The student's own order is shown even when it is correct.

**Text types** (`short_answer`, `essay`):
- `[response !== undefined]` label `copy.quiz.yourAnswer` «إجابتك» + the text
  (`whitespace-pre-wrap wrap-anywhere`) or `copy.quiz.notAnswered` when empty.
- `[rightAnswerText]` label `copy.quiz.rightAnswer` «الإجابة الصحيحة» + the text
  **as plain text, never HTML** (a short-answer pattern may legitimately contain
  `<` and `>` and is deliberately not sanitized).

`copy.quiz.answerListSeparator` is «، » and is used only to JOIN display prose.
It must never be used to split `rightAnswerText` back apart.

---

## 14. `/results` — «نتائجي»

`apps/web/app/(app)/results/page.tsx`.

**Data:** one read, `GET /api/me/quizzes` → `StudentQuizHistorySchema`
(`packages/contracts/src/quiz/history.ts`):

```ts
{
  summary: {
    quizzesTaken: int          // distinct quizzes with ≥1 submitted attempt
    attemptsTotal: int
    averagePercent: 0..100 | null   // mean over ATTEMPTS
    bestPercent: 0..100 | null
    passedCount: int                // counted over QUIZZES, keyed on each best attempt
  }
  series: QuizHistoryPoint[]   // every submitted attempt, OLDEST FIRST
  quizzes: QuizHistoryRow[]    // one row per quiz, most recently sat FIRST
}
QuizHistoryPoint { attemptId, lessonId, quizTitle, attemptNo, scorePercent,
                   passed: boolean|null, submittedAt }
QuizHistoryRow   { lessonId, quizTitle, courseTitle, courseSlug, attemptsUsed,
                   allowsImprovement, improvementUsed,
                   bestPercent: 0..100|null, latestPercent: 0..100|null,
                   latestAttemptId, passed: boolean|null, lastSubmittedAt }
```
Every average/best is nullable rather than 0 — a student with no graded attempt
has no average, and printing «٠٪» tells them they scored nothing.

### 14.1 Header (both states)

```
header.mb-6
  p.eyebrow = copy.results.eyebrow «03 / نتائجي»
  h1        = copy.results.title   «نتائجي»
  p         = copy.results.subtitle «كل امتحان دخلته، درجتك فيه، وإزاي بتتحسّن مع الوقت.»
```

### 14.2 Empty (`quizzes.length === 0`)

`.empty` + `SpotIllustration('scores')`
+ `copy.results.emptyTitle` «لسه مدخلتش أي امتحان»
+ `copy.results.emptyBody` «كل درس وراه امتحان قصير. أول ما واحد يخلص، درجتك ومراجعة إجاباتك هيبانوا هنا.»
+ `chip chip--solid` → `/path`, `copy.results.emptyCta` «مسارك».

### 14.3 Populated

```
main (max-w-[var(--w-app)] px-4 py-8 md:px-6 md:py-10)
├─ Header
├─ section.grid.grid-cols-2.gap-3 sm:gap-4 lg:grid-cols-4    ← 2-up on phones
│   ├─ ClipboardList  summary.quizzesTaken   copy.results.statQuizzes  «امتحانات دخلتها»  hue 225
│   ├─ Repeat2        summary.attemptsTotal  copy.results.statAttempts «عدد محاولاتك»     hue 165
│   ├─ Target         summary.averagePercent ?? copy.results.noneYet «لسه»
│   │                 suffix '%' unless null   copy.results.statAverage «متوسط درجاتك»  hue 295
│   └─ Award          summary.passedCount  suffix «/ {quizzesTaken}»
│                     copy.results.statPassed «امتحانات نجحت فيها»
│                     meterPercent = passedCount/quizzesTaken*100, accent
├─ [series.length > 1] section → ScoreTrend(series)
└─ section
    h2 = copy.results.quizzesTitle «كل امتحان على حدة»
    ul (rounded-lg, border, bg-surface-2) → QuizResultRow per row
```

`ScoreTrend` renders from **two** points up; one attempt is not a trend.
Copy: `copy.results.trendTitle` «درجاتك مع الوقت»,
`trendSummary` «رسم بياني لـ{count} محاولة، من {first}% لحد {last}%.»,
`trendPassLine` «خط النجاح», `trendLegendPassed` «محاولة عدّيتها»,
`trendLegendFailed` «محاولة ماعدّتش».

`QuizResultRow` copy: `copy.results.best` «أعلى درجة», `latest` «آخر محاولة»,
`attemptsUsed` «محاولاتك», `attemptsOf` «{used} من {max}»,
`attemptsUnlimited` «من غير حد». It links to
`reviewHref(lessonId, latestAttemptId)` and offers «دخول امتحان التحسين»
(`copy.quiz.improveExam`) when `allowsImprovement && !improvementUsed`.

The same four hues appear in the same order as on the dashboard's own tile row.

---

## 15. `/notifications` — «الإشعارات»

`apps/web/app/(app)/notifications/page.tsx`, `actions.ts`,
`components/notifications/*`, `apps/web/lib/notification-view.ts`.

### 15.1 Endpoints

| method + path | shape |
|---|---|
| `GET /api/me/notifications` (optional `?cursor=`) | `NotificationFeedSchema` `{ entries: Notification[], nextCursor: string|null }` |
| `GET /api/me/notifications/unread-count` | `{ unread: int >= 0 }` |
| `POST /api/me/notifications/{id}/read` | 204 |
| `POST /api/me/notifications/read-all` | 204 |
| `GET /api/me/notifications/stream` | **SSE**, one connection per tab |
| `GET /api/me/push/public-key`, `POST /api/me/push/subscribe`, `POST /api/me/push/unsubscribe` | Web Push (browser only) |

### 15.2 Notification kinds

`NOTIFICATION_KINDS` (`packages/contracts/src/notifications.ts`), discriminated on
`kind`. Every entry carries `id: string`, `createdAt: ISO`, `readAt: ISO | null`.

| kind | extra fields | audience |
|---|---|---|
| `quiz_graded` | `attemptId, lessonId, lessonTitle, scorePercent, passed: bool\|null` | student |
| `extra_attempt_granted` | `lessonId, lessonTitle` | student |
| `conversation_reply` | `conversationId: uuid` | student |
| `instructor_message` | `conversationId: uuid, outreachKind: string` | student |
| `payment_approved` | `courseId, courseTitle, courseSlug, validUntil: ISO\|null` | student |
| `payment_rejected` | `courseId, courseTitle, courseSlug, reason` | student |
| `subscription_expiring_soon` | `courseId, courseTitle, courseSlug, validUntil` | student |
| `subscription_cancelled` | `courseId, courseTitle, courseSlug, reason` | student |
| `course_completed` | `courseId, courseTitle, courseSlug` | student |
| `book_order_shipped` | `orderId, bookTitle, deliveryDays: int 1..14` | student |
| `book_order_delivered` | `orderId, bookTitle` | student |
| `book_order_rejected` | `orderId, bookTitle, reason` | student |
| `homework_reviewed` | `submissionId, lessonId, lessonTitle, courseSlug, homeworkStatus: 'accepted'\|'needs_work', grade: 0..100\|null` | student |
| `payment_submitted` | `submissionId, courseId, courseTitle, courseSlug, studentName` | **admin** |
| `book_order_placed` | `orderId, studentName` | **admin** |
| `assistant_question_received` | `conversationId, preview, studentName` | **admin** |
| `homework_submitted` | `submissionId, lessonId, lessonTitle, studentName` | **admin** |

Admin kinds land in the **same** feed and bell — do not build a second inbox.

### 15.3 `describeNotification(entry) → { title, detail, subtitle, href }`

The API sends **no prose**; this mapping is the whole of it
(`apps/web/lib/notification-view.ts`). Icons come from `iconFor(entry)`
in `notification-list.tsx`.

| kind | title | detail | subtitle | href | icon |
|---|---|---|---|---|---|
| `quiz_graded` | «اتصحّحت ورقتك — الدرجة {score}%» | `passed===null` → null; true → «نجحت»; false → «محتاجة مراجعة» | `lessonTitle` | `reviewHref(lessonId, attemptId)` | `ClipboardCheck` |
| `extra_attempt_granted` | «المدرّس دّالك محاولة زيادة في الامتحان ده» | — | `lessonTitle` | `/quizzes/{lessonId}` | `BadgeCheck` |
| `conversation_reply` | «مهندس أيمن ردّ على سؤالك» | — | `copy.assistant.title` | `/dashboard?assistant=1` | `MessagesSquare` |
| `instructor_message` | lead-in by `outreachKind` (below) | — | `copy.assistant.thread.title` | `/dashboard?assistant=1` | `Send` |
| `payment_approved` | «تم تفعيل اشتراكك في {course}» | — | `courseTitle` | `/courses/{slug}` | `Wallet` |
| `payment_rejected` | «محتاجين نراجع اشتراكك في {course}» | the admin's `reason`, verbatim | `courseTitle` | `/courses/{slug}` | `CircleAlert` |
| `subscription_expiring_soon` | «اشتراكك في {course} هيخلص قريب» | `formatNotificationTime(validUntil)` | `courseTitle` | `/courses/{slug}` | `Hourglass` |
| `subscription_cancelled` | «اشتراكك في {course} اتلغى» | `reason`, verbatim | `courseTitle` | `/courses/{slug}` | `CircleAlert` |
| `course_completed` | «مبروك! خلصت {course}» | «قفلته من أوله لآخره، ودي مش حاجة بسيطة. أنا فخور بالمجهود ده.» | `courseTitle` | `/courses/{slug}` | `Trophy` |
| `book_order_shipped` | «كتابك اتشحن — {book}» | «هيوصلك خلال {days} أيام عمل، والمندوب هيتصل بيك قبل ما يوصل.» | «كتبي» | `/store/orders` | `Truck` |
| `book_order_delivered` | «الكتاب وصلك — {book}» | — | «كتبي» | `/store/orders` | `PackageCheck` |
| `book_order_rejected` | «طلب الكتاب اترفض — {book}» | `reason`, verbatim | «كتبي» | `/store/orders` | `PackageX` |
| `homework_reviewed` | accepted → «واجب {lesson} اتقبل ✅»; else «واجب {lesson} فيه ملاحظات» | accepted & grade → «الدرجة {grade} من 100»; accepted → «مهندس أيمن راجع الحل وكتب لك رد.»; needs_work → «مهندس أيمن كتب لك رد، والواجب مفتوح تاني.» | `lessonTitle` | `/courses/{courseSlug}/lessons/{lessonId}` | `NotebookPen` |
| `payment_submitted` | «اشتراك جديد مستني مراجعة — {name}» | — | `courseTitle` | `/admin/payments` | `Wallet` |
| `book_order_placed` | «طلب كتاب جديد مدفوع — {name}» | — | «طلبات الكتب» | `/admin/books` | `PackageOpen` |
| `assistant_question_received` | «سؤال جديد مستني رد — {name}» | `preview` or null | «صندوق الوارد» | `/admin/inbox/{conversationId}` | `MessageCircleQuestion` |
| `homework_submitted` | «واجب جديد من {name}» | «الحل مستني مراجعة» | `lessonTitle` | `/admin/homework/{submissionId}` | `NotebookPen` |

`instructor_message` lead-ins by `outreachKind` (unknown kinds fall back to
`copy.notifications.instructorMessage` «مهندس أيمن بعتلك رسالة»):
- `quiz_result` → «مهندس أيمن شاف نتيجتك»
- `quiz_nudge` → «مهندس أيمن فاكرك بالكويز»
- `lesson_praise` → «مهندس أيمن بعتلك كلمتين»
- `whatsapp_invite` → «مهندس أيمن عازمك على جروب الواتساب»

`formatNotificationTime(iso)` is an **absolute** date/time
(`ar-EG-u-nu-latn`, `dateStyle: medium`, `timeStyle: short`). Relative time was
tried and rejected (impure during render, and stale the moment it is painted).

### 15.4 The page

```
main (max-w-[var(--w-prose)] px-4 py-8 md:px-6 md:py-10)
├─ header
│   p.eyebrow = copy.notifications.eyebrow «05 / الإشعارات»
│   h1        = copy.notifications.title   «الإشعارات»
│   p         = copy.notifications.subtitle «كل حاجة حصلت في حسابك وتستاهل المعرفة.»
└─ NotificationList(initialEntries, initialCursor)
```

`NotificationList`:
- **Empty:** dashed panel — `copy.notifications.empty` «مفيش إشعارات لسه.» +
  `copy.notifications.emptyHint` «أول ما تتصحّح لك ورقة أو يتردّ على تظلّم، هتلاقيه هنا.»
- **Mark-all row** (only when some entry is unread): a text button
  `copy.notifications.markAllRead` «علّم الكل كمقروء» /
  `copy.notifications.markingAll` «بنعلّم…» while pending. **Optimistic** — every
  entry gets `readAt = now` immediately, then `POST /api/me/notifications/read-all`.
  `min-h-11 md:min-h-0`.
- **Rows** are real `<Link>`s (not buttons) so long-press / open-in-new-tab work:
  ```
  li (border-b)
   └ Link href=view.href, onClick: if unread → set readAt optimistically and
     POST /api/me/notifications/{id}/read   (navigation is NOT blocked on it)
      ├ 32px rounded icon well (aria-hidden)
      ├ column: title (--fs-text-sm medium) / [detail] / subtitle (truncate, muted)
      └ time (mono, --fs-mono-label)
         unread → text-fg   (⚠️ full-strength, NOT muted — the row's amber tint
                             makes --fg-faint and --fg-muted both fail contrast)
         read   → text-fg-faint
  unread row background = color-mix(in oklch, var(--a-9), var(--n-2) 95%)
  ```
- **Load more:** `GET /api/me/notifications?cursor={nextCursor}`; appends;
  on failure keeps what is on screen and shows
  `copy.notifications.failed` «مقدرناش نجيب الإشعارات. نحاول تاني.»
  Button label `copy.notifications.more` «أقدم».

### 15.5 The bell

`NotificationBell` (server) reads **only** the count
(`GET /api/me/notifications/unread-count`) so the badge is right on first paint.
The panel's rows are fetched **on open**, every open (a list a student opens
precisely because they suspect it changed must not be a cached copy); whatever is
already on screen stays while the read is in flight.

`NotificationBellClient`:
- badge: hidden at 0; `min-w-[18px]` amber pill with `#1A1206` ink showing the
  count, or `9+` above 9; `aria-hidden` (the count is already in the trigger name).
- trigger `aria-label`: `count > 0 ? formatCopy(copy.notifications.bellWithUnread, {n})`
  «الإشعارات — {n} جديدة» : `copy.notifications.bell` «الإشعارات».
- panel width `min(22rem, 100vw - 2rem)`, header row:
  `copy.notifications.panelTitle` «الإشعارات» + the same mark-all button.
- rows: `PANEL_SIZE = 8`; each is a `<button>` (not a link) that closes the panel,
  **navigates first**, then marks read in the background. Unread dot = a 8 px
  amber circle, `aria-hidden`.
- placeholder on the first-ever open: `role="status" sr-only` =
  `copy.notifications.loading` «بنجيب…» plus three shimmering skeleton rows.
- empty panel: `copy.notifications.empty` + `copy.notifications.emptyHint`.
- failure: `role="alert"` in `--err` = `copy.notifications.failed`.
- footer: link `/notifications` = `copy.notifications.seeAll` «الكل».

### 15.6 The live stream

`NotificationStreamProvider` wraps the **whole shell** (not just the bell) —
one `EventSource` on `GET /api/me/notifications/stream` per open tab.
Three things happen per event and they are not the same thing:
1. the badge number is **replaced** (the payload carries an absolute count, so a
   tab that slept through ten events converges on the first one it sees);
2. a toast, for the tab actually being looked at;
3. an OS notification for a tab that is not, gated on `Notification.permission`.

It deliberately does **not** call `router.refresh()`.
`useLiveUnread()` returns `null` until the first event; the badge is
`live ?? serverRenderedCount`.
Toast "open" action label: `copy.notifications.liveOpen` «افتح».

**Mobile equivalent:** replace SSE + Web Push with FCM/APNs; the payload must keep
carrying the absolute unread count so the badge converges the same way.
