# Student App — screen-by-screen specification for the Flutter client

Scope: everything under `apps/web/app/(app)/` and `apps/web/app/(auth)/`.
Every claim below cites a repo-relative path. Arabic strings are quoted verbatim
and the copy key is named; keys are paths into the object exported from
`packages/contracts/src/copy/ar.ts` (re-exported as `copy` from
`@ayman/contracts/copy`). Placeholders like `{n}` are literal — see §0.5.

---

## 0. Global platform facts

### 0.1 API base, prefix, transport

- NestJS API, global prefix `api` (`apps/api/src/main.ts:32` → `app.setGlobalPrefix('api')`).
  Every path below therefore begins `/api/`.
- The web client talks to the API **same-origin** in the browser and to
  `process.env.API_ORIGIN ?? 'http://localhost:3300'` on the server
  (`apps/web/lib/api.ts` → `SERVER_BASE`, `resolve()`); `resolve()` throws if a
  path does not start with `/api/`.
- Server-side fetches carry a 15 s timeout (`SERVER_TIMEOUT_MS = 15_000`);
  a timeout surfaces as `ApiRequestError(504)` with
  `digest = 'AYMAN_UPSTREAM_TIMEOUT'`.

### 0.2 Session & CSRF

- Auth is a **cookie session** (better-auth). All state-changing requests send
  `credentials: 'same-origin'` plus the CSRF header (`apps/web/lib/api.ts` →
  `apiPost`, `apiPatch`, `apiPut`, `apiPutTyped`, `apiPostVoid`, `apiDelete`).
- CSRF (`apps/web/lib/csrf.ts`): cookie `__Host-csrf`, header `x-csrf-token`.
  The value is read from the cookie and echoed on every `POST/PATCH/PUT/DELETE`;
  the API's `CsrfGuard` requires it. Server-to-server calls send the cookie value
  or the literal `'server-action'` (`apps/web/lib/api-server.ts`).
- Auth endpoints (`apps/web/lib/auth-client.ts`):
  - `POST /api/auth/sign-up/email` — `{ name, email?, password, phoneNumber }`
  - `POST /api/auth/sign-in/email` — `{ email, password }`
  - `POST /api/auth/sign-in/phone-number` — `{ phoneNumber, password }`
  - `POST /api/auth/sign-out` — `{}`
  - `POST /api/auth/sign-in/social` — `{ provider, callbackURL, errorCallbackURL }`
  - Error payloads may carry `code`. Only two are branched on:
    `'ACCOUNT_BANNED'` (may carry `reason`) and `'PHONE_ALREADY_REGISTERED'`.

### 0.3 Rate limits (shapes mobile retry/poll strategy)

`apps/api/src/app.module.ts:86-114`:

| bucket | window | limit | tracker |
|---|---|---|---|
| `short` | 1 s | 10 | per user/session |
| `medium` | 60 s | 60 | per user/session |
| `long` | 3600 s | 1000 | per user/session |
| `ip` | 60 s | 1200 | per IP |

The dashboard alone issues **ten parallel reads** (§5.1) — a client that fans out
the same way sits at the `short` ceiling on one screen.

### 0.4 Route protection / redirect matrix

`apps/web/proxy.ts`.

`PROTECTED_PREFIXES` (matched as `path === prefix || path.startsWith(prefix + '/')`):
`/dashboard`, `/path`, `/onboarding`, `/settings`, `/admin`, `/quizzes`,
`/library`, `/profile`, `/results`, `/foundations`, `/playground`, `/store`,
`/notifications`.
Plus `PROTECTED_LESSON_PATTERN = /^\/courses\/[^/]+\/lessons(?:\/|$)/`.

Auth routes (not protected, but redirect when signed in): `/login`, `/register`.

`decideRedirect(pathname, { authenticated, onboardingCompleted })`
(`apps/web/proxy.ts:355`) → `'login' | 'onboarding' | 'dashboard' | 'next' | null`:

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
- Auth state is one round trip: **401 ⇒ no session; 200 ⇒ body carries
  `onboardingCompleted: boolean`** (`proxy.ts:379-404`). Reproduce with
  `GET /api/profile/me` (`ProfileMeSchema` carries the flag).
- `/dev/*` is dev-only and 404s in production.

**Mobile equivalent:** on cold start probe the session, then route
Login → Onboarding → Welcome → Dashboard, honouring a stored `next` deep link.

### 0.5 Copy interpolation & formatting

- `formatCopy(template, vars)` replaces `{key}` (`packages/contracts/src/format.ts`);
  unknown keys are left as-is. Some call sites use `String.replace('{n}', …)` —
  identical semantics.
- `formatMark(v)` = `String(Math.round(v * 100) / 100)` — at most 2 decimals, no
  trailing zeros.
- Durations (`apps/web/lib/format.ts`):
  - `formatDuration(sec)` → `H:MM:SS` when hours > 0 else `M:SS`; negative/NaN → 0.
  - `formatRemaining(sec)` → `formatDuration(sec)` under 60 s, else rounds **up**
    to the next whole minute then formats.
  - `formatHoursMinutes(sec)` → «{m} د», or «{h} س» / «{h} س {m} د» at ≥ 60 min.
- Dates: `Intl.DateTimeFormat('ar-EG-u-nu-latn', …)` — Arabic locale, **Latin digits**:
  - `{ dateStyle: 'medium', timeStyle: 'short' }` — notifications, devices, activity.
  - `{ dateStyle: 'medium' }` — book orders.
- Numbers are Latin digits everywhere except a few hand-written Arabic-Indic
  literals in copy (e.g. the sittings tile prints `'٠'`/`'١'`/`'٢'`).

### 0.6 Direction, typography, breakpoints

- The document is **RTL** throughout; every layout uses logical properties
  (`border-e`, `ps-`, `inline-size`, `inline-start`). No `left`/`right` anywhere
  in the student area.
- Latin runs are isolated with `dir="ltr"`: the account-menu email, phone fields,
  the playground editor, the error `digest`, the `404` string, `term.en` in Foundations.
- Tailwind breakpoints: `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536;
  plus raw queries at `48rem`(768), `64rem`(1024), `80rem`(1280), `30rem`(480),
  `max-width: 47.999rem` (below `md`), and `max-width: 62rem` for the auth split.
- Shell tokens (`apps/web/app/globals.css:965-973`):
  `--rail-w: 296px`, `--rail-w-collapsed: 76px`, `--topbar-h: 56px`.
- Page widths: `--w-app` (grid screens), `--w-shell` (1152 px reading screens),
  `--w-prose` (single-column reading).
- Touch targets: **44 px minimum below `md`** — `.topbar__actions > *`
  (`min-block-size/inline-size: 2.75rem`), the menu button (`h-11`), the
  notification mark-all text button (`min-h-11 md:min-h-0`), submit-dialog jump
  chips (`size-11 md:size-8`), `.nav-chip` (44 → 36 above `md`).
- Colour semantics (product-wide, enforced):
  - **amber / accent** = the one thing to press, and "where you are" (progress).
  - **ember (`--e-*`, `.stage`, `study-tint`)** = structure, never pressable.
  - **green `--ok` / red `--err`** = quiz correctness ONLY (`result-header.tsx`,
    `review-question.tsx`), plus the single green "course done" word on a library card.
  - Ink on an accent fill is the fixed near-black `#1A1206`.

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
      ├─ StudentRail (aside, `hidden … md:block`)
      │   └─ sticky top-0, h-dvh, flex column, overflow-hidden, p-3
      │      ├─ .rail__head  → BrandLockup (link → /dashboard, no tagline) + RailToggle
      │      ├─ nav[aria-label=copy.nav.mainNav] → StudentNavList (non-footer items)
      │      ├─ p.rail__label.nav-group__head = copy.nav.railCourses «كورساتي»
      │      │  └─ scrollable RailCourses list (min-h-0 flex-1 overflow-y-auto)
      │      └─ footer block (border-t)
      │         ├─ StudentNavFooterList
      │         └─ Link "/" + ArrowUpLeft = copy.nav.backToSite
      └─ div.flex.min-w-0.flex-col
         ├─ StudentTopbar (sticky top-0 z-40, border-b, h = --topbar-h 56px)
         └─ div.route-fade[key=pathname] → children
```

`.route-fade` = 220 ms fade + 4 px rise, re-keyed on pathname
(`globals.css:698-710`). Reduced motion zeroes it globally.

### 1.2 Navigation table — `STUDENT_NAV`

`apps/web/components/app/student-nav-items.ts`. Order is render order.

| # | href | copy key | Arabic | lucide icon | footer? |
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

Plus a fixed trailing link `"/"` with `ArrowUpLeft`, label `nav.backToSite`
«الموقع الرئيسي».
⚠️ Entry 6 is `/store`, **not** `/books` — `/books` is the marketing shop and
throws a signed-in student out of the shell.

**Active item** — `activeStudentNav(pathname)`:
1. alias: any path starting `"/courses/"` resolves to `/library`.
2. `/dashboard` matches **exactly**; every other entry by `startsWith`.
3. longest matching `href` wins; exactly one item may be current
   (two `aria-current="page"` would tell a screen reader the user is in two places).

**Route rules** (pure string predicates, same file, unit-tested):
- `isAttemptRoute(p)` = `/^\/quizzes\/[^/]+\/attempt\/[^/]+$/` — anchored, so
  `…/review` is NOT an attempt. On a match the entire shell is discarded.
- `isRailForcedCollapsed(p)` = `/^\/courses\/[^/]+\/lessons\/[^/]+/` — the lesson
  player forces the rail to icon width without overwriting the stored preference.

### 1.3 Rail collapse state

- The preference lives in `localStorage`, stamped as
  `html[data-rail="collapsed"|"expanded"]` before first paint
  (`apps/web/lib/rail.ts`, read through `useSyncExternalStore`).
- The route override is `.shell[data-rail-forced="true"]` (emitted only when true).
- CSS (`globals.css:1206-1290`), **entirely inside `@media (min-width: 768px)`**:
  - `.shell { display:grid; grid-template-columns: var(--rail-w) minmax(0,1fr) }`
  - collapsed/forced → `var(--rail-w-collapsed) minmax(0,1fr)`
  - collapsed hides `.rail__label` and `.brand__text`, stacks `.rail__head` into a
    column, centres `.rail__item`.
  - `transition: grid-template-columns 160ms` unless reduced motion.
- **Below `md` there is no rail and none of the collapse rules apply** — they are
  deliberately guarded, because `.rail__label` is also what the mobile drawer is
  built from and an unguarded rule stripped every label out of it.

### 1.4 Topbar (this is the mobile chrome)

```
header.topbar  (sticky top-0, z-40, border-b, background var(--n-1);
                backdrop-blur ONLY under @media (pointer: fine) — it is the most
                expensive declaration in the product on a scrolling phone)
└─ div  h=var(--topbar-h) 56px, items-center justify-between, gap-3, px-4 md:px-6
   ├─ left cluster (min-w-0, gap-2)
   │   ├─ [md:hidden] Sheet trigger button — h-11, Menu icon (size-5)
   │   │     + the VISIBLE label copy.nav.menuLabel «القائمة»
   │   │     (no aria-label: the word IS the accessible name)
   │   ├─ [md:hidden] BrandLockup compact (portrait only) → /dashboard
   │   └─ [hidden md:block] h2 = activeStudentNav(pathname)?.labelAr ?? copy.nav.dashboard
   └─ div.topbar__actions (shrink-0, gap-2; every child ≥ 44px below md)
       ├─ assistant slot   (docked launcher — §21)
       ├─ notifications    (NotificationBell — §15.5)
       ├─ [hidden md:block] ThemeToggle
       └─ accountMenu
```

**The page title is deliberately absent below `md`** — measured at 8 px on a
360 px phone. Every route renders its own `<h1>` instead. The Flutter app must put
the screen name in the page body, not in the app bar.

**Mobile drawer** (`SheetContent`, `md:hidden`; closes on pathname change, watched
during render rather than in an effect):
```
SheetTitle → BrandLockup (no tagline)
nav[aria-label=copy.nav.mainNav] → StudentNavList (non-footer, onNavigate=close)
p.eyebrow = copy.nav.railCourses «كورساتي»
  → the same RailCourses node the rail renders
divider
StudentNavFooterList (onNavigate=close)
Link "/" → copy.nav.backToSite «الموقع الرئيسي» (h-10 row, ArrowUpLeft)
row: span = copy.theme.toggle «تبديل المظهر» + ThemeToggle
     ⚠️ this row does NOT close the sheet — changing the theme is something you
     do to look at
```
Sheet close button label = `copy.common.close` «إغلاق».
Theme options: `copy.theme.light` «فاتح», `copy.theme.dark` «داكن»,
`copy.theme.system` «حسب النظام».

### 1.5 Rail course list — `RailCourses`

Data: `GET /api/me/dashboard` (`DashboardSchema`), shared per request via
`cache()` (`apps/web/lib/dashboard.ts`) — the rail and the page cost one call.

- **Empty:** one line, `copy.nav.railCoursesEmpty` «لسه مفيش كورسات».
- **Row (published):** `<Link href=enrolledCourseHref(course)>` with the title
  (`line-clamp-2`, `--fs-text-lg`, muted) and a 2 px `aria-hidden` meter whose
  width is `clamp(progressPercent, 0, 100)%`, `bg-accent` on `bg-surface-4`.
- **Row (`published === false`):** a `<span>`, not a link, `opacity-60`,
  `cursor-not-allowed`; second line = `copy.path.closedBadge` «مقفول مؤقتاً».
- **Skeleton:** 3 rows of a 16 px bar + a 2 px bar.

`enrolledCourseHref` (`apps/web/lib/course-href.ts`): `/courses/{slug}/lessons/{lastLessonId}`
when `lastLessonId` is set, otherwise `/library/{slug}`. It must **never** send an
enrolled student to the public `/courses/{slug}` page.

### 1.6 Account menu

- Trigger: `aria-label = copy.nav.accountMenu` «قائمة الحساب»; 36 px avatar +
  name (`hidden … sm:block`, `max-w-[10rem] truncate`) + `ChevronDown`.
  `h-11` below `sm`, `h-9` from `sm`.
- Panel (`align="end"`, `min-w-[16rem]`, class `product-type` because it is
  portalled outside `.shell`):
  - header: 44 px avatar, name, identity line (`dir="ltr"`, mono label, muted) =
    email if present else phone (`accountIdentityLabel`, `apps/web/lib/session.ts`)
  - separator
  - `/profile` + `UserRound` → `copy.nav.profile` «بروفايلي»
  - `/settings/devices` + `MonitorSmartphone` → `copy.nav.devices` «أجهزتي»
  - `/admin` + `ShieldCheck` → `copy.nav.adminPanel` «لوحة التحكم» — only when the
    session has permission `admin:access` (not a security boundary; the API guard is)
  - separator
  - `SignOutButton`: `copy.nav.logout` «تسجيل الخروج», pending
    `copy.nav.loggingOut` «جارٍ الخروج…», failure toast `copy.nav.logoutFailed`
    «مقدرناش نسجّل خروجك. نحاول تاني.». It **hard-navigates**
    (`window.location.assign`) so no cached authenticated payload survives.
- Fallback while the session read is in flight: a bare 32 px circle,
  `aria-hidden`, **no `aria-label`** (a placeholder must not be announced as a control).

### 1.7 Shell states

| state | what renders |
|---|---|
| loading | topbar + rail paint immediately; `RailCoursesSkeleton`, `NotificationBellFallback` (empty 36 px span), `AccountMenuFallback` (empty circle) stream in independently |
| running attempt | **no shell at all**. Also suppressed server-side by `ChromeUnlessAttempt` (off a pathname header the proxy stamps) so `/api/me/dashboard`, the session read and the unread count are never issued |
| lesson player | rail forced to 76 px; `RailToggle` hidden |
| error | `apps/web/app/(app)/error.tsx` (§22.1) |
| 404 | `apps/web/app/(app)/not-found.tsx` (§22.2) |

### 1.8 Mobile layout summary (what Flutter must match)

- No persistent rail. Navigation is a **drawer** opened by a labelled «القائمة»
  button in the app bar.
- **There is no bottom navigation bar anywhere in this product. Do not invent one.**
- App bar at 360 px: `[القائمة] [portrait] ……… [assistant] [bell] [avatar]`.
  The theme switch is NOT in the bar on phones; it lives in the drawer footer.
- Every `main` below `md` gets `padding-block-end: 5.5rem` so the assistant
  launcher never covers page content (`globals.css:1200-1204`).

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

**Mobile (< 62rem ≈ 992 px): the showcase is gone; only the form column renders.**

Showcase copy (`copy.auth.aside`): eyebrow «منصة أ. أيمن أبو العلا»,
title «حسابك هو مكان مذاكرتك كله»,
body «الكورسات، الدروس اللي خلصت، درجاتك في كل اختبار، وآخر حتة في المذاكرة — كله بيستناك جوه.»,
point1 «كل كورساتك في صفحة واحدة», point2 «المشغّل بيفتكر آخر ثانية في الفيديو»,
point3 «كل درجاتك ومراجعاتك متسجّلة», codeCaption «welcome.js».

Metadata: `privateRouteMetadata` → `noindex, nofollow`. These pages stay crawlable
(a disallowed page's noindex is never read) but must not rank for the brand query.

### 2.1 `/login`

Server params: `next`, `error`; `safeNext(next)` validates before anything renders it.

```
header.auth-head
  h1.auth-head__title = copy.auth.login.title    «تسجيل الدخول»
  p.auth-head__sub    = copy.auth.login.subtitle «نكمّل من المكان اللي وقفنا عنده.»
[if next]  p.auth-notice role=status = copy.auth.login.continueNotice «تسجيل الدخول عشان نكمّل»
[if error] p.auth-notice role=alert (colour --err) = social error
LoginForm
p.auth-switch: copy.auth.switch.noAccount «لسه معملتش حساب؟»
               + Link → /register(?next=…) copy.auth.switch.createAccount «نعمل واحد دلوقتي»
```

Social error mapping (`socialErrorMessage`) — the raw code is **never rendered**:
- `account_not_linked` → `copy.auth.errors.socialAccountNotLinked`
  «الإيميل ده مسجّل عندنا بكلمة سر. الدخول بالإيميل وكلمة السر من فوق، مش بجوجل.»
- anything else → `copy.auth.errors.socialGeneric`
  «مقدرناش نكمّل الدخول بجوجل. نجرّب تاني، أو ندخل بالإيميل وكلمة السر.»

**Fields** — `LoginSchema` (`packages/contracts/src/auth.ts`, `.strict()`):

| field | label / Arabic | input | autocomplete | rule |
|---|---|---|---|---|
| `identifier` | `auth.fields.identifier` «رقم الموبايل أو البريد الإلكتروني» | `type=text`, `dir=ltr` | `username` | `z.string().trim().min(1, 'رقم موبايلك أو إيميلك')` |
| `password` | `auth.fields.password` «كلمة المرور» | `type=password` | `current-password` | `z.string().min(1, 'كلمة المرور مطلوبة')` |

⚠️ `type=text`, not `type=email` — the field legitimately holds a phone number and
a browser validating it as an address would block the submit.

**Identifier routing** — `resolveLoginIdentifier(identifier)`:
1. trim; 2. contains `@` → email; 3. else `normalizeEgyptianPhone` — if it parses,
`{ kind:'phone', value: E.164 }`; 4. else **email, deliberately**, so an
unparseable input earns the same generic 401 as a wrong password.

Submit → `POST /api/auth/sign-in/phone-number { phoneNumber, password }`
or `POST /api/auth/sign-in/email { email, password }`.

Failure:
- `code === 'ACCOUNT_BANNED'` → one joined string:
  `copy.auth.errors.loginBanned` «حسابك موقوف دلوقتي، والدخول مقفول.»
  + (when `error.reason`) `formatCopy(copy.auth.errors.loginBannedReason, {reason})`
  «السبب: {reason}»
  + `copy.auth.errors.loginBannedContact` «ولو فيه غلط، كلمة للمدرّس وهيتظبط.»
  This is safe to distinguish because the API only emits it **after** the password
  has verified.
- **everything else** — wrong password, unknown account, the progressive soft
  lock, a network error → one string, `copy.auth.errors.login`
  «البريد أو كلمة المرور مش مظبوطين». Never distinguish further.
- Rendered as `<p role="alert">` in `--err`.

Success → `resolvePostLoginDestination(next)` then a **hard navigation**
(`window.location.assign`), because the client router cache holds anonymous payloads.

Button: `copy.auth.actions.login` «دخول» / `copy.auth.actions.loginPending`
«بندخّلك…»; disabled while submitting — which is also what absorbs the server's
progressive delay of up to 30 s from the 4th attempt. **No client-side timeout is set.**

`AuthProviders`: divider `copy.auth.providers.divider` «أو», Google button
`copy.auth.providers.google` «المتابعة بحساب جوجل».

### 2.2 `/register`

```
header.auth-head
  h1 = copy.auth.register.title    «إنشاء حسابك»
  p  = copy.auth.register.subtitle «دقيقة واحدة وتكون جوه أول محاضرة.»
RegisterForm
p.auth-switch: copy.auth.switch.haveAccount «عندك حساب؟»
               + Link → /login(?next=…) copy.auth.switch.login «الدخول من هنا»
```

Fields — `RegisterSchema` (`.strict()` + superRefine):

| field | label / Arabic | input | autocomplete | rule (verbatim messages) |
|---|---|---|---|---|
| `name` | `auth.fields.name` «الاسم الكامل» | text | `name` | trim, min 2 «الاسم الكامل مطلوب», max 120 «الاسم طويل جدًا» |
| `phone` | `auth.fields.phone` «رقم الموبايل» | `type=tel`, `dir=ltr`, `inputMode=numeric`, placeholder `auth.fields.phonePlaceholder` «01012345678» | `tel` | `egyptianPhone('رقم الموبايل مطلوب')` — **transforms to E.164** |
| `email` | `auth.fields.emailOptional` «البريد الإلكتروني (اختياري)», hint `auth.fields.emailOptionalHint` «مش لازم. المنصة مابتبعتش إيميلات — الرقم هو اللي بيتم الدخول بيه.» | email, `dir=ltr` | `email` | optional; `''`/undefined ⇒ **omitted from the request entirely**; else `z.email('أدخل بريدًا إلكترونيًا صحيحًا')` |
| `password` | `auth.fields.password` «كلمة المرور» | password | `new-password` | min 8 «كلمة المرور لازم تكون 8 أحرف على الأقل», max 128 «كلمة المرور طويلة جدًا» |
| `confirmPassword` | `auth.fields.confirmPassword` «تأكيد كلمة المرور» | password | `new-password` | min 1 «تأكيد كلمة المرور مطلوب»; mismatch → issue on `confirmPassword` «كلمتا المرور غير متطابقتين» |

(Bounds copied from better-auth's own defaults: 8 / 128.)

Submit → `POST /api/auth/sign-up/email` with
`{ name, password, phoneNumber: values.phone, ...(email ? { email } : {}) }`.
`confirmPassword` is **never sent**.

Failure:
- `code === 'PHONE_ALREADY_REGISTERED'` → `copy.auth.errors.registerPhoneTaken`
  «الرقم ده ليه حساب عندنا بالفعل.» plus, inside the same `role="alert"`, a link
  to `/login(?next=…)` labelled `copy.auth.errors.registerPhoneTakenAction`
  «ادخل بالرقم ده». (Naming this one does not weaken the sign-in rule: a sign-up
  form answers "is this number registered" by refusing, whatever words it prints.)
- anything else → `copy.auth.errors.register`
  «مقدرناش نعمل الحساب. البيانات محتاجة مراجعة، وبعدها نحاول تاني.»

Success → hard navigation to `/onboarding` (`next` forwarded via `withNext`).

Button: `copy.auth.actions.register` «إنشاء الحساب» / `registerPending` «بنجهّز حسابك…».

Footer: `copy.auth.legalBefore` «بإنشاء الحساب إنت موافق على» + `/terms`
(`copy.legal.termsTitle`) + `copy.auth.legalAnd` «و» + `/privacy`
(`copy.legal.privacyTitle`) + «.».

### 2.3 `(auth)` error boundary

`apps/web/app/(auth)/error.tsx` — `copy.errors.auth.title` / `.body` in the
`.auth-head` slot, then a row: accent `copy.common.retry` «نحاول تاني»
(via `useErrorRetry`: refresh first, escalate to a document load on a repeat press)
and an outlined `<a href="/">` labelled `copy.nav.home` «الرئيسية».
When `error.digest` exists: `copy.errors.digestLabel` + `: ` + the digest in
`dir="ltr"` mono.

---

## 3. `/onboarding`

`apps/web/app/(app)/onboarding/page.tsx`,
`apps/web/components/onboarding/onboarding-form.tsx`.

**Gate:** signed in, `onboardingCompleted === false`. A completed student is
redirected to `/dashboard`, a signed-out one to `/login`.

**Data (parallel):** `getTaxonomyOrNull()` (cached `GET /api/taxonomy`), the
session (name, identity, image, `phoneNumber`), `searchParams.next`.
If the cached taxonomy is `null` a **live** `GET /api/taxonomy` is attempted —
this screen is a dead end without it, and `'use cache'` bodies are evaluated
during `next build` when the API is unreachable, so a healthy deployment starts
life with a cached `null`.

```
main (max-w-2xl px-6 py-16)
  h1 = copy.onboarding.title    «نكمّل بيانات حسابك»
  p  = copy.onboarding.subtitle «شوية معلومات سريعة عشان نعرف نوريك الكورسات اللي تخصّك إنت بس»
  taxonomy === null ? TaxonomyUnavailable : OnboardingForm
```

**TaxonomyUnavailable:** a `.panel` with
`copy.onboarding.unavailableTitle` «مش قادرين نجيب قايمة المحافظات والصفوف دلوقتي»,
`copy.onboarding.unavailableBody`
«المشكلة عندنا إحنا مش عندك، وحسابك اتعمل تمام ومحصلش أي حاجة له. دقيقة واحدة ونجرّب تاني — والباقي بيكمّل من نفس المكان.»,
and a **full document reload** link to `/onboarding` (preserving `next`) labelled
`copy.common.retry` «نحاول تاني», `min-h-11`. The failure is cached for up to 60 s,
which is why the copy says "wait a minute" rather than promising the next press works.

### 3.1 Wizard structure

Four steps; **all fields stay mounted**, inactive steps use `hidden` (an unmounted
field cannot be focused, and `trigger` focuses the first invalid one).

```
IdentityHeader (avatar + session name + identity)
StepProgress   (currentStep = index+1, totalSteps = 4, title = STEPS[i].title)
Card > CardBody
  step 0  fullName, gender, phone
  step 1  governorateCode, schoolName, schoolStream
  step 2  year
  step 3  FieldNote + fatherPhone
[formError] p role=alert --err
row: [copy.onboarding.back «السابق» (secondary, only when stepIndex>0)]
     [copy.onboarding.next «التالي» | copy.onboarding.submit «حفظ ونكمّل» (flex-1)]
p (centred, muted) = copy.onboarding.privacyNote + Link /privacy?from=onboarding
```

Step titles: `step1Title` «مين إنت», `step2Title` «إنت فين»,
`step3Title` «إنت في سنة كام», `step4Title` «تليفون ولي الأمر».
`copy.onboarding.progressLabel` «تقدّمك في تكميل البيانات» labels the progress element.

### 3.2 Fields — `OnboardingSchema` (`packages/contracts/src/onboarding.ts`, `.strict()`)

| field | label / Arabic | placeholder | control | rule (verbatim) |
|---|---|---|---|---|
| `fullName` | `fullName` «الاسم الكامل» | `fullNamePlaceholder` «الاسم بالكامل» | text, autocomplete `name` | trim, min 2 «الاسم الكامل مطلوب», max 120 |
| `gender` | `gender` «النوع» | `genderPlaceholder` «اختار» | select | `z.enum(['male','female'])`; UI error `genderError` «لازم نحدد النوع». Options `genderMale` «ذكر», `genderFemale` «أنثى» |
| `phone` | `phone` «رقم الهاتف» | `phonePlaceholder` «مثال: 01012345678» | `PhoneField` (rewrites Arabic-Indic digits to Latin as you type), autocomplete `tel` | `egyptianPhone('رقم الهاتف مطلوب')` → E.164 |
| `governorateCode` | `governorate` «المحافظة» | `governoratePlaceholder` «محافظتك» | select from `taxonomy.governorates` | `z.string().length(2, 'لازم نحدد المحافظة')` |
| `schoolName` | `schoolName` «اسم المدرسة» | `schoolNamePlaceholder` «مثال: مدرسة النصر الثانوية» | text | trim, min 1 «اسم المدرسة مطلوب», max 200 |
| `schoolStream` | `schoolStream` «مدرستك» | `schoolStreamPlaceholder` «مدرسة عام ولا لغات؟» | select | `z.enum(['general','languages'])`; UI error `schoolStreamError` «لازم نحدد نوع مدرستك» |
| `year` | `year` «الصف الدراسي» | `yearPlaceholder` «اختار صفّك» | select from `offeredYearOptions(taxonomy)` | `z.number({error:'لازم نحدد الصف الدراسي'}).int().min(1).max(3)`; `''` maps to `undefined`, never `NaN` |
| `fatherPhone` | `fatherPhone` «رقم تليفون ولي الأمر» | `phonePlaceholder` | `PhoneField` | `egyptianPhone('هاتف الأب مطلوب')` |

Not asked; resolved from the taxonomy on submit
(`apps/web/lib/section-defaults.ts` → `fixedSectionFor(taxonomy, year)`):
`system`, `trackId`, `electiveSubjectId`. Spread **after** the form values so they
always win.

`refineSection` cross-field rules:
- `year === 1` with a `trackId` → `trackId`: «الصف الأول لا يختار مسارًا بعد»
- `trackId` without `system` → `system`: «لازم نحدد النظام الدراسي الأول»
- `electiveSubjectId` when not (`system==='bacalorya' && year===2`) →
  `electiveSubjectId`: «المادة الاختيارية غير متاحة في هذه الحالة»
- `electiveSubjectId` without `trackId` → `trackId`: «لازم نحدد المسار الأول»

Guardian-phone note (`FieldNote`, `ShieldCheck`, tinted panel, wired with
`aria-describedby`): `copy.onboarding.parentPhonesWhy`
«الرقم ده عشان نقدر نتواصل مع ولي أمرك عن مستواك لو احتجنا. مابنستعملهوش في أي حاجة تانية.»

Privacy line: `copy.onboarding.privacyNote`
«بياناتك محفوظة عند أيمن أبو العلا وبس، ومابتتباعش ولا بتتشارك مع حد.»
+ `copy.onboarding.privacyLink` «اعرف بالظبط بنجمع إيه وليه» → `/privacy?from=onboarding`.

### 3.3 Behaviour

- **Next** validates only the current step's fields.
- **Back** never validates.
- **Enter** in a text input on steps 0-2 calls `goNext()` instead of submitting.
- Answers are mirrored into a **draft** (`use-onboarding-draft.ts`) so navigating
  to the privacy page and back restores them; cleared on success.
- Prefills: `fullName` ← session name; `phone` ← `session.phoneNumber` (E.164) or
  `undefined`; the draft overrides both.

**Submit:** `PATCH /api/profile/onboarding` with the validated body plus the three
resolved section fields; no response body is consumed.

Errors:
- **409** (the student's own phone belongs to another account — `fatherPhone` has
  no unique index and can never 409) → set a field error on `phone`
  (`copy.onboarding.phoneConflictError` «رقمك ده متسجّل على حساب تاني»), **jump
  the wizard back to the phone step**, and show the form-level hint
  `copy.onboarding.phoneConflictHint`
  «رجّعناك لرقمك — فيه حساب تاني متسجّل بيه. غيّره أو سجّل الدخول بيه.»
- anything else → `copy.onboarding.submitError`
  «مقدرناش نحفظ بياناتك. مراجعة سريعة ونحاول تاني.»

**Success:** hard navigation to `/welcome` (`?next=<encoded>` when a validated
`next` exists).

---

## 4. `/welcome`

`apps/web/app/(app)/welcome/page.tsx`, `components/welcome/welcome-scene.tsx`,
`apps/web/lib/welcome-motion.ts`.

One screen between finishing onboarding and the product; its only ask is the
WhatsApp channel, and it is skippable.

**Data:** `searchParams.next`, `getWhatsappChannelFresh()` (deliberately **not**
the cached settings reader — a cached empty value made this screen vanish for
minutes after every deploy), `getSession()` for the first name only.

`destination = safeNext(next) ?? '/dashboard'`.
**If no channel is configured → `redirect(destination)`; the screen does not exist.**

```
WelcomeScene (owns <main> and the CTA)
├─ section.stage.stage--welcome
│  ├─ div.welcome-aura (aria-hidden)
│  └─ div.stage__body
│     ├─ p.stage__eyebrow = copy.welcome.eyebrow «آخر خطوة»
│     ├─ h1.stage__title  = copy.welcome.titleNamed «أهلاً يا {name} 👋»
│     │                     (fallback copy.welcome.title «أهلاً وسهلاً 👋»)
│     ├─ p.stage__sub     = copy.welcome.body «حسابك جاهز. فاضل حاجة واحدة بس.»
│     └─ ol.welcome-steps aria-label=copy.welcome.stepsLabel «خطوات إنشاء الحساب»
│        ├─ done → copy.welcome.stepAccount «الحساب اتعمل»
│        ├─ done → copy.welcome.stepProfile «بياناتك اتحفظت»
│        └─ open → copy.welcome.stepStart   «نبدأ الدراسة»
├─ div.welcome-in.mt-6 → WhatsappChannelCard(href=channel, flush)
└─ CTA link → destination = copy.welcome.continue «يلا نبدأ»
```

- First name = `firstName(session?.name)` — first whitespace token or `null`.
- Entrance ladder: eyebrow → title → body → steps (60 ms stride) → card; the whole
  sequence finishes under 800 ms.
- The CTA is a real `<Link>`: a plain left click is held 260 ms (third stop ticks,
  scene lifts) before the router moves; middle-click / ⌘-click are untouched.
- **Everything is disabled under `prefers-reduced-motion: reduce`; the CTA is
  painted and pressable on the first frame regardless.**
- All three step marks are `aria-hidden`; the state is carried entirely by the
  list order and the words.
- The WhatsApp press is what stamps `whatsappOpenedAt`
  (`POST /api/profile/whatsapp-opened`) — never stamp it for a programmatic redirect.

`WhatsappChannelCard` (`copy.dashboard.whatsappChannel`): title «قناة الواتساب»,
lead «أول ما يتنزل درس جديد أو يتحدد ميعاد امتحان، هيوصلك على طول.», cta «اشتراك».
It is **green**, not amber — it leaves the platform.

---

## 5. `/dashboard` — «حسابي»

`apps/web/app/(app)/dashboard/page.tsx`. Metadata title = `copy.nav.dashboard` «حسابي».

### 5.1 Data — TEN parallel reads

| # | call | endpoint | schema | on failure |
|---|---|---|---|---|
| 1 | `getDashboard()` | `GET /api/me/dashboard` | `DashboardSchema` | throws → error boundary |
| 2 | profile | `GET /api/profile/me` | `ProfileMeSchema` | throws |
| 3 | quiz history | `GET /api/me/quizzes` | `StudentQuizHistorySchema` | throws |
| 4 | `getTaxonomyOrNull()` | cached `GET /api/taxonomy` | `Taxonomy` | `null` → band renders without year/track chips |
| 5 | `getSession()` | session | — | `null` tolerated |
| 6 | `getMasteryOrNull()` | `GET /api/me/mastery` | `StudentMasterySchema` | `null` → «ذاكر ده» absent |
| 7 | `getPublicSettingsOrDefaults()` | cached settings | — | empty contact block |
| 8 | `getCatalogOrEmpty()` | cached `GET /api/catalog/courses` | — | `[]` → recommendations absent |
| 9 | `getBookCatalogOrEmpty()` | cached `GET /api/books` | — | empty shelves |
| 10 | `getMyBookOrdersOrEmpty()` | `GET /api/book-orders/mine` | `BookOrder[]` | `[]` → «كتبي» absent |

**Only reads 1–3 may take the page down.** Everything else degrades to the section
simply not rendering. Copy that policy or a 429 on the tenth call blanks the home
screen — it has happened.

### 5.2 `DashboardSchema` (`packages/contracts/src/progress.ts`)

```ts
Dashboard {
  continueWatching: ContinueWatching | null
  enrolledCourses: EnrolledCourse[]
  recentScores: RecentScore[]
  totalWatchedSeconds: int >= 0     // summed LessonProgress.watchedSeconds
  pendingExams: PendingExam[]
}
ContinueWatching { courseId, courseSlug, courseTitle, lessonId, lessonTitle,
                   lessonKind, progressPercent: 0..100,
                   remainingSeconds: int >= 0 }   // 0 when not a video / unknown
RecentScore      { attemptId, quizTitle, courseSlug, scorePercent: 0..100, submittedAt }
PendingExam      { courseId, courseSlug, courseTitle, lessonId, lessonTitle }
EnrolledCourse {
  id, slug, title: string
  coverKey: string | null            // a storage KEY, never a URL
  subjectNameAr: string
  whatsappGroupUrl: string | null    // null for most courses; the steady state
  published: boolean                 // false = instructor took it down to edit
  progressPercent: 0..100
  completedLessons, totalLessons: int
  lastLessonId: string | null        // always null while the course is closed
  subscriptionValidUntil: ISO | null
  comingSoonNote: string | null      // only meaningful while totalLessons === 0
  contentComplete: boolean           // the instructor's own "syllabus is fully up"
  bookTitle: string | null
  bookPriceCents: int | null
  scheduleNote: string | null        // ⚠️ NOTHING parses this. Print it verbatim.
}
```

`PendingExam` qualifies only when every published lecture is cleared, the exam's
gate is `available`, and **no sitting is recorded against it** — a failed sitting
is an improvement owed, which is `ExamsSection`'s job, not this card's.

### 5.3 Derived values (reproduce exactly)

`summarise(dashboard)` (`apps/web/lib/dashboard-view.ts`):
```
completedLessons = Σ enrolledCourses[].completedLessons
totalLessons     = Σ enrolledCourses[].totalLessons
overallPercent   = totalLessons === 0 ? 0 : round(completed/total*100)
averageScore     = recentScores.length === 0 ? null : round(mean(scorePercent))
learningSeconds  = dashboard.totalWatchedSeconds
```
`firstName(fullName)` = first whitespace token or `null`.
`completedCourseCount` = courses with `totalLessons > 0 && completedLessons >= totalLessons`
(**not** `progressPercent`, which has been observed stuck stale).
`xpFor` (`apps/web/lib/xp.ts`): `completedLessons*10 + passedQuizCount*30 + completedCourseCount*100`,
where `passedQuizCount = quizzes.summary.passedCount`. Computed live; nothing is stored.

`achievementsFor` (`apps/web/lib/achievements.ts`) — six badges, fixed order:

| id | glyph | tier | title / hint (`copy.dashboard.badges`) | earned when |
|---|---|---|---|---|
| `first-lesson` | play | bronze | «أول درس» / «أول محاضرة لحد آخرها.» | `completedLessons >= 1` |
| `ten-lessons` | layers | silver | «عشر دروس» / «عشر محاضرات في أي كورس.» | `completedLessons >= 10` |
| `first-exam` | clipboard | bronze | «أول امتحان» / «أول امتحان يتقدّم ويتسلّم.» | `summary.quizzesTaken >= 1` |
| `first-pass` | medal | silver | «أول نجاح» / «اعدّي أي امتحان.» | `summary.passedCount >= 1` |
| `course-done` | trophy | gold | «كورس كامل» / «كورس كامل من أوله لآخره.» | any course `totalLessons>0 && completedLessons>=totalLessons` |
| `distinction` | star | gold | «امتياز» / «خُد ٩٠٪ أو أكتر في أي امتحان.» | `summary.bestPercent !== null && >= 90` (`MASTERY_STRONG_AT`) |

`earnedCount` = number earned; `highestTier` = highest earned (`bronze<silver<gold`) or `null`.

`recommendedCourses({courses, identity, enrolledCourseIds, limit: 4})`:
`[]` when `identity === null`; else the public catalogue filtered to courses not
already enrolled **and** `isOwnCourse(course, identity)`; when
`identity.schoolStream === null` also requires `forGeneral && forLanguages`;
first 4.

`startHereSteps(dashboard)` — three steps `{id,title,body,cta,href,done,blockedBy}`:
- `enroll` — done when `enrolledCourses.length > 0`; href `/library`; never blocked.
- `lesson` — done when any course has `lastLessonId !== null`; href = the resume
  lesson, else `enrolledCourseHref(firstCourse)`, else `/library`;
  blocked when not enrolled → reason `stepLessonBlocked`, cta `stepEnrollCta`, `/library`.
- `quiz` — done when `recentScores.length > 0`; href `/path`;
  blocked with no course → `stepQuizBlockedNoCourse` + `/library`;
  blocked when enrolled but nothing opened → `stepQuizBlocked`, cta `stepLessonCta`,
  href = the lesson href above.
  (Rule: the **reason** belongs to the step being pressed, the **destination** to
  the earliest thing that is missing.)

### 5.4 Page tree

```
main (mx-auto w-full max-w-[var(--w-app)] px-4 py-8 md:px-6 md:py-10)
├─ DashboardHero                     (§5.5)
├─ NextUpBlock(showRing=false)       (§5.6)
├─ InstructorMessageCard             (§5.7, full width, usually absent)
└─ div.dash-split   (a grid only from 80rem/1280px; stacks in DOM order below)
   ├─ div.dash-split__main.space-y-8
   │   ├─ [continueWatching] ContinueWatchingCard             (§5.8)
   │   ├─ [hasOutstandingSteps] StartHereCard(tone = resume ? 'plain' : 'hero')
   │   ├─ section «كورساتي»
   │   │   .group-head: mark + h2 copy.dashboard.myCourses «كورساتي»
   │   │                + copy.library.courseCount «{n} كورس»
   │   │   grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 → EnrolledCourseCard[]
   │   │   empty: .empty + SpotIllustration('courses')
   │   │          + copy.dashboard.noCoursesYet «لسه مامعاكش أي كورس.»
   │   ├─ [recommended.length] section «كورسات في مسارك»
   │   │   .group-head + Link /library = copy.dashboard.recommendedSeeAll «كل الكورسات»
   │   │   ul grid gap-4 sm:grid-cols-2 2xl:grid-cols-3 → LibraryCourseCard[]
   │   ├─ ExamsSection(quizzes.quizzes)                       (§5.9)
   │   ├─ MyBookOrdersSection(orders, supportHref)            (§5.10)
   │   └─ BooksSection(first 6 flattened books)               (§5.11)
   └─ aside.dash-split__side (mt-8 space-y-4 lg:mt-0)
       ├─ WhatsappChannelCard(variant='aside', flush)
       ├─ CourseGroupCard per enrolled course with whatsappGroupUrl !== null
       ├─ [pendingExams.length] AsideBlock → PendingExamsCard
       ├─ [mastery] AsideBlock(art='mastery') → MasteryCard
       ├─ Achievements(variant='aside')
       └─ TipOfDayCard
```

Rule the split encodes: **the main column is the student's own work; the aside is
everything about them or around them.**
⚠️ `xl:grid-cols-1` on the course grid is not a typo — at 1280 the split has just
switched on and the main track is 592 px, so two cards there are 284 px each.

**Mobile:** `.dash-split` is not a grid below 1280 px, so the phone order is
exactly the DOM order — the whole main column, then the whole aside. The course
grid is 1-up below `sm`, 2-up from `sm`.

### 5.5 `DashboardHero` — the ember band

`components/dashboard/dashboard-hero.tsx`; styles `.dash-hero`
(`apps/web/app/study.css:195-660`).

```
header.dash-hero.mb-6
├─ svg.dash-hero__art  (aria-hidden, four circles; hidden below md)
├─ div.dash-hero__id
│   ├─ UserAvatar(name, image, size=64).dash-hero__avatar
│   └─ div.dash-hero__text
│       ├─ p.dash-hero__eyebrow = copy.dashboard.eyebrow «01 / حسابي»
│       ├─ h1.dash-hero__title  = formatCopy(copy.dashboard.greeting,{name}) «أهلًا {name}»
│       │                          fallback copy.dashboard.greetingFallback «أهلًا وسهلاً»
│       └─ div.dash-hero__facts  (only when at least one exists)
│           GraduationCap + yearLabel   ← identityOf(me, taxonomy).yearLabelAr
│           Route         + trackLabel  ← identityOf(...).trackLabelAr
│           School        + schoolName  ← me.profile.schoolName
├─ div.dash-hero__stats  (three figures, own full-width grid row)
├─ [schedule.length] div.dash-hero__schedule
│   title = copy.dashboard.scheduleTitle «مواعيد المحاضرات»
│   one row per enrolled course whose trimmed scheduleNote is non-empty:
│     course title + the note VERBATIM
└─ div.dash-hero__aside → 104px ProgressRing(overallPercent)
   label = copy.dashboard.statOverall «إجمالي تقدّمك»
```

Name = `me.profile?.fullName ?? session?.name ?? ''` (the profile's own name wins —
it is what the student typed, while `session.name` may be whatever Google supplied).

The three big figures (`statFigures`, `components/dashboard/stats-row.tsx`), in order:

| id | value | suffix | label | note | links to |
|---|---|---|---|---|---|
| `xp` | `xp` | — | `copy.dashboard.xpLabel` «نقاط الخبرة» | `{completedLessons} {copy.dashboard.statLessonsDone}` → «… دروس خلصتها» | `/path` |
| `time` | `formatHoursMinutes(learningSeconds)` | — | `copy.dashboard.learningHoursLabel` «وقت المذاكرة» | `{courseCount} {copy.dashboard.statCourses}` → «… كورساتك» | `/library` |
| `badges` | `badgesEarned` | tier name when earned: `tierBronze` «برونزية» / `tierSilver` «فضية» / `tierGold` «ذهبية» | `copy.dashboard.badgesEarnedLabel` «شارات محققة» | `averageScore === null` → «متوسط درجاتك لسه», else «متوسط درجاتك {n}%» | `/results` |

(`copy.dashboard.statNoScores` is «لسه».)

The band is ember; **nothing on it is pressable except those three tiles' links**,
and the only amber on it is the ring's arc.
**Mobile** (`@media (max-width: 47.9375rem)`, study.css:472): the band stacks —
avatar + text, then the stats row, then the schedule, then the ring.

### 5.6 `NextUpBlock` — «ناقصك كده وتخلص»

`components/dashboard/next-up-block.tsx`, `apps/web/lib/next-up.ts`,
`apps/web/app/next-up.css`. Copy under `copy.dashboard.nextUp`.

`nextUp(dashboard)` — **one entry per COURSE**:
- for each `pendingExams[]` whose course is published (or absent from
  `enrolledCourses`): `{kind:'exam', href: quizHref(lessonId), count:1,
  label: nextUp.exam «فاضل امتحان الكورس», courseTitle}`, `remaining = 1`.
- for each published enrolled course **not** already represented by an exam and
  with `remaining = totalLessons - completedLessons > 0`:
  `{kind:'lessons', href: enrolledCourseHref(course), count: remaining,
  label: lessonsLeftLabel(remaining), courseTitle}`.
- ranking: fewest `remaining` first, then higher `progressPercent`, then payload order.

`lessonsLeftLabel(n)` — four Arabic plural forms:
1 → `lessonsOne` «فاضلك درس واحد»; 2 → `lessonsTwo` «فاضلك درسين»;
3–10 → `lessonsFew` «فاضلك {n} دروس»; ≥ 11 → `lessonsMany` «فاضلك {n} درس».

Render:
- `items.length === 0` and not celebrating → the block renders **nothing**.
- normal:
  ```
  section.next-up aria-labelledby
    .next-up__head → [ProgressRing when showRing] + h2 nextUp.title «ناقصك كده وتخلص»
                     + p nextUp.lead «دوس على أي واحدة منهم وهي توديك لمكانها على طول.»
    ul.next-up__list → per item Link.next-up__item
        .next-up__well = the count (lessons) or a ClipboardCheck glyph (exam)
        .next-up__text = label + course title
        .next-up__cta  = nextUp.ctaExam «ادخل الامتحان» | nextUp.ctaLessons «يلا نكمّل»
  ```
- **Celebration** — `items.length === 0 && percent >= 100 && enrolledCourses.length > 0`:
  ```
  section.next-up.next-up--won
    svg.next-up__burst (12 rays, aria-hidden) + Trophy disc
    h2 = formatCopy(nextUp.wonTitle,{name}) «مبروك يا {name}! خلصت كل حاجة»
         fallback nextUp.wonTitleFallback «مبروك! خلصت كل حاجة»
    p  = formatCopy(nextUp.wonCourses,{courses}) «قفلت من أوله لآخره: {courses}.»
         {courses} = first 2 finished titles joined by nextUp.listSeparator «، »,
         plus formatCopy(nextUp.wonAndMore,{n}) «و{n} كمان» when more remain;
         no titles → nextUp.wonCoursesPlain «مافيش ولا درس ولا امتحان لسه مستنيك.»
    p  = nextUp.wonNote «ده مش شوية. اللي بيمشي لحد الآخر كده بيبان في الامتحان، مش في النسبة بس. خد نفسك، ارجع راجع اللي عدى وانت مرتاح، وأول ما ينزل جديد هتلاقيني مستنيك.»
    Link /results = nextUp.wonResults «شوف درجاتك»
    Link /library = nextUp.wonBrowse  «كورسات تانية»
  ```

### 5.7 `InstructorMessageCard`

Client. `GET /api/assistant/conversations/mine/summary`
(`parseMyConversationSummary`; the in-flight promise is deduped module-wide).
Renders **only** when `summary.latestFromAyman` is non-null.
Copy (`copy.dashboard.instructorMessage`): eyebrow «رسالة جديدة»,
role «م. أيمن أبو العلا», action «اقرأها وردّ», extras «وكمان {n} رسالة».
Pressing it calls `openAssistant()` — it opens the panel in place, it does not navigate.

### 5.8 `ContinueWatchingCard`

```
article  (amber-tinted panel — the ONE amber surface on the page)
└─ flex-col gap-4 → sm:flex-row sm:items-center sm:gap-5
   ├─ [lg only, when subjectNameAr] 128px 16/9 CourseArt thumbnail with a
   │    bg-black/28 scrim and a 36px amber play disc on it
   ├─ [every width the thumbnail is not drawn] a 48px amber play disc
   ├─ text block (min-w-0 flex-1)
   │   ├─ p.eyebrow accent = copy.dashboard.continueWatching «نكمّل من مكانك»
   │   ├─ lesson title (truncate, --fs-title-3)
   │   └─ course title (truncate, --fs-text-sm, muted)
   └─ right cluster
       ├─ [remainingSeconds > 0] «{copy.dashboard.remaining} {formatRemaining(sec)}» → «باقي 12:00»
       └─ Link → /courses/{courseSlug}/lessons/{lessonId}
                 copy.dashboard.continueCta «نكمّل» + ChevronForward
                 (stretched: after:absolute after:inset-0)
LessonProgressBar(item.progressPercent, label = copy.player.courseProgress)
```
**Mobile:** the thumbnail is hidden below `lg` (it starved the lesson title to
~140 px, rendering as «المحاضـ…»); below `sm` everything stacks.

### 5.9 `ExamsSection` — «امتحاناتك»

Source `quizzes.quizzes`. Shows the first `SHOWN` rows; a count and an "all" link
appear only past that.
- header `.group-head` + h2 `copy.dashboard.examsTitle` «امتحاناتك»
  + `formatCopy(copy.library.courseCount,{n})` when truncated.
- empty: `.empty` + `SpotIllustration('exams')` + `copy.dashboard.examsEmpty`
  «لسه مافيش امتحانات. أول امتحان يخلص هيبان هنا بدرجته.» + `chip--quiet` → `/path`
  labelled `copy.dashboard.examsEmptyCta` «مسارك التعليمي».
- row (`.attempt-row`, `+ --action` when improvable):
  - `canImprove = allowsImprovement && !improvementUsed`
  - well glyph: `Sparkles` when improvable, else `Trophy` when `passed`, else `GraduationCap`
  - title = `quizTitle`, stretched link → `quizHref(lessonId)` when improvable,
    else `reviewHref(lessonId, latestAttemptId)`
  - meta = `bestPercent === null ? copy.quiz.essayPending : "{bestPercent}%"`,
    plus ` · ` + `copy.dashboard.examsImproveHint` «لسه قدامك محاولة تحسين» when improvable
  - **only the PASS verdict** — `copy.quiz.passed` «ناجح» when `passed === true`.
    A red «محتاجة مراجعة» badge here marked the student rather than telling them
    anything and was removed.
  - trailing chip: `chip--solid` + `copy.quiz.improveExam` «دخول امتحان التحسين»
    when improvable, else `chip--accent` + `copy.quiz.reviewAnswers` «مراجعة الإجابات»
- trailing link when truncated: `/results`, `copy.dashboard.examsAll` «كل امتحاناتك».

### 5.10 `MyBookOrdersSection` — «كتبي»

`null` for zero orders. Header `.group-head` + h2 `copy.books.mine.title` «كتبي»
+ link `/store/orders` labelled `copy.books.mine.all` «كل طلباتي».
Shows the **two newest** orders as `BookOrderCard` (§19.2), then an outlined
`chip--accent` link to `/books` labelled `copy.books.mine.orderAnother`
«اطلب كتاب تاني».

### 5.11 `BooksSection` — «الكتب»

Books = the flattened shelves (`shelf.first`, `shelf.second`, `shelf.full`) capped
at **6**; the first two as wide cards, the remainder in a compact row headed
`copy.dashboard.booksMore` «كتب تانية». Section title `copy.dashboard.books` «الكتب»,
see-all `copy.dashboard.booksSeeAll` «كل الكتب».

### 5.12 Aside blocks

**`PendingExamsCard`** — only when `pendingExams.length > 0`.
h2 `copy.dashboard.pendingExamsTitle` «امتحانات في انتظارك»; per row the lesson
title + `formatCopy(copy.dashboard.pendingExamsMeta,{course})`
«خلّصت {course} — الامتحان جاهز» + `chip chip--solid`
`copy.dashboard.pendingExamsCta` «ابدأ الامتحان» → `quizHref(lessonId)`.

**`MasteryCard`** — «ذاكر ده». `GET /api/me/mastery` → `StudentMasterySchema`
(`weakest[≤3]`, `strongest[≤3]`, `evaluated`, `pending`;
`MasteryTopic { categoryId, name, answered, accuracyPercent, lessonId|null,
lessonTitle|null, courseSlug|null }`).
Constants: `MASTERY_MIN_EVIDENCE = 4`, `MASTERY_REVIEW_BELOW = 70`,
`MASTERY_STRONG_AT = 90`.
- h2 `mastery.title` «ذاكر ده» + `formatCopy(mastery.evaluatedCount,{n})` «{n} موضوع اتقاسوا»
- weak rows: name, a meter at `min(accuracyPercent,100)%`, the percent, an
  `sr-only` `formatCopy(mastery.accessibleRow,{topic,percent})` «{topic} — {percent}٪ من الدرجات»,
  and — when the topic has `courseSlug` + `lessonId` — a link to
  `/courses/{courseSlug}/lessons/{lessonId}` labelled `mastery.reviewCta` «مراجعة».
- `formatCopy(mastery.pendingNote,{n})` «لسه في {n} موضوع تحت القياس.» when `pending > 0`.
- strong strip: `mastery.strongLabel` «متمكّن في:» then «{name} {percent}%» chips.
- empty: `mastery.emptyBody` «لسه بنجمّع صورة عن مستواك. كام امتحان كمان وهتلاقي هنا بالظبط الضعف فين.»
  or, when measured but nothing is weak, `mastery.allClearBody`
  «مفيش موضوع محتاج مراجعة دلوقتي — كل اللي اتقاس فوق السبعين.»

**`Achievements`** (`variant='aside'`) — h2 `badges.title` «إنجازاتك», count
`formatCopy(badges.count,{earned,total})` «{earned} من {total}», note `badges.note`
«بتتفتح لوحدها مع المذاكرة.». Each badge's accessible name is
«{title} — شارة {tier} — اتحقّق» when earned, else «{title} — شارة {tier} — لسه: {hint}»
(`badges.tierLabel` «شارة {tier}», `badges.earned` «اتحقّق», `badges.locked` «لسه»).

**`TipOfDayCard`** — h2 `copy.dashboard.tipOfDayTitle` «نصيحة اليوم».
Text = `copy.dashboard.tipOfDay[dayOfYear(date) % 10]`, where
`dayOfYear` = `floor((now - new Date(year,0,0)) / 86_400_000)` in **local time**.
The ten tips are listed under `copy.dashboard.tipOfDay` in `ar.ts` and must be
reproduced in the same order for the rotation to match.

**`CourseGroupCard`** (`copy.player.group`) — title «جروب الدفعة», lead
«جروب الواتساب الخاص بطلبة الكورس ده — الأسئلة والتنبيهات بينزلوا فيه.»,
cta «دخول الجروب». Renders `null` for a `null` url.

**`StartHereCard`** — h2 `copy.dashboard.startHereTitle` «نبدأ من هنا», progress
`copy.dashboard.startHereProgress` «خطوة {done} من {total}», footer note
`copy.dashboard.startHereNote` «عشر دقايق في اليوم أحسن من ساعة مش هتذاكرها أصلًا.».
Each done step shows `copy.dashboard.stepDone` «تمّت». Step copy:
`stepEnrollTitle` «نختار كورس ونشترك فيه» / `stepEnrollBody` «أي كورس من سنتك ومسارك بيظهر في قائمتك على طول.» / `stepEnrollCta` «نشوف الكورسات»;
`stepLessonTitle` «فتح أول درس» / `stepLessonBody` «الدرس بيتقفل لوحده لما توصل لآخر الفيديو وتكون شُفت معظمه.» / `stepLessonCta` «فتح الدرس»;
`stepQuizTitle` «حل أول اختبار» / `stepQuizBody` «كل درس وراه اختبار قصير. درجتك بتظهر هنا على طول بعد التسليم.» / `stepQuizCta` «مسارك».
Blocked copy: `stepBlockedTitle` «لسه بدري شوية على الخطوة دي»,
`stepLessonBlocked` «عشان تفتح درس، لازم تكون مشترك في كورس الأول. نختار كورس ونبدأ.»,
`stepQuizBlocked` «الاختبار بييجي بعد الدرس — افتح أول درس، والاختبار بتاعه هيفتح بعده.»,
`stepQuizBlockedNoCourse` «الاختبار بييجي بعد الدرس، والدرس بييجي بعد ما تشترك في كورس. نبدأ من هنا.»

### 5.13 `EnrolledCourseCard`

```
closed     = !course.published
comingSoon = !closed && course.totalLessons === 0
done       = course.progressPercent >= 100
cta        = comingSoon ? copy.course.comingSoonBadge
           : done       ? copy.dashboard.openCourse     «فتح الكورس»
           : progress>0 ? copy.dashboard.continueCourse «نكمّل الكورس»
           :              copy.dashboard.startCourse    «نبدأ الكورس»
```
```
article.panel (relative isolate flex column)
├─ cover box — aspect-[16/7] ONLY when coverKey is null; an uploaded cover keeps
│   its own height. A `.course-cover__badge` mono pill on the artwork prints
│   `Math.round(progressPercent)%`.
└─ div.flex-1.flex-col.gap-4.p-5
   ├─ h3 = title (a stretched Link unless `closed`, in which case plain text —
   │        enrolledCourseHref resolves to /library/{slug}, which 404s a
   │        course the published-only catalogue does not hold)
   └─ mt-auto footer
      ├─ LessonProgressBar(progressPercent, label = copy.dashboard.progressLabel «التقدّم»)
      └─ row: mono «{completedLessons} {copy.dashboard.lessonsOf} {totalLessons} {copy.dashboard.lessonsWord}»
              → «12 من 40 درس»
              + chip: closed → `chip--locked` ; comingSoon → `chip--quiet` ; else `chip--solid`
      ├─ [showBookCta = book present && !closed] BookOrderButton — «اطلب الكتاب»
      └─ [subscriptionValidUntil] expiry line, one of
         copy.dashboard.subscriptionExpiresToday «الاشتراك بينتهي النهارده»
         copy.dashboard.subscriptionExpiresInDays «باقي {days} يوم على انتهاء الاشتراك»
         copy.dashboard.subscriptionExpiresOn «الاشتراك بينتهي في {date}»
```
Done-state words elsewhere on the card: `copy.dashboard.courseDone` «الكورس ده خلص»
and `copy.dashboard.courseUpToDate` «خلّصت اللي نزل» (the latter whenever
`contentComplete` is false — the syllabus is still being uploaded).

---

## 6. `/path` — «مسارك التعليمي»

`apps/web/app/(app)/path/page.tsx`, `components/path/course-rail.tsx`,
`path-map.tsx`, `course-closed-dialog.tsx`.

**Data:** one read, `GET /api/me/path` → `LearningPathSchema`
(`packages/contracts/src/path.ts`):

```ts
LearningPath { courses: PathCourse[], currentCourseId: string|null,
               clearedLessons: int, totalLessons: int, percent: 0..100 }
PathCourse   { id, slug, title, subjectNameAr, coverKey: string|null,
               published: boolean, progressPercent: 0..100,
               clearedLessons, totalLessons: int, contentComplete: boolean,
               whatsappGroupUrl: string|null, nextLessonId: string|null,
               nodes: PathNode[] }
PathNode     { id, lessonId, title,
               kind: 'video'|'quiz'|'attachment'|'text',
               state: 'not_started'|'in_progress'|'completed'|'passed'|'failed',
               gate: 'cleared'|'available'|'locked',
               isExam: boolean }
```

**The lock is a RENDER of a server decision, never the decision.** Every lesson
route re-derives the gate per request and 404s a locked lesson.

### 6.1 Empty (`courses.length === 0`)

```
main (max-w-[var(--w-app)] px-6 py-10 md:py-12)
  header.study-head
    p.eyebrow = copy.path.eyebrow «02 / مساري»
    h1        = copy.path.title   «مسارك التعليمي»
  div (rounded-lg border-study-line bg-study-tint px-6 py-10, centred)
    p = copy.path.empty «لسه مافيش أي كورس في القايمة.»
    Link /library (amber h-10) = copy.path.emptyCta «الكورسات المتاحة»
```
Ember-tinted rather than a dashed grey box — a grey rectangle is indistinguishable
from something that failed to load.

### 6.2 Populated

```
main
├─ header.study-head
│   p.eyebrow = copy.path.eyebrow «02 / مساري»
│   h1        = copy.path.title   «مسارك التعليمي»
│   p.lead    = copy.path.subtitle «كل كورس مفتوح لك، بالترتيب اللي هتذاكر بيه.»
├─ section (ember tint, rounded-lg, px-5 py-4, mb-8)
│   ├─ Route glyph in a 40px ember disc
│   ├─ copy.path.summary with {cleared}/{total}/{courses}
│   │    «{cleared} من {total} محاضرة في {courses} كورس»
│   ├─ copy.path.percentComplete «خلصت {percent}%» (mono tabular, accent)
│   └─ LessonProgressBar(path.percent, label = copy.path.title)
└─ div.grid.gap-8.grid-cols-[minmax(0,1fr)] lg:grid-cols-[18rem_minmax(0,1fr)]
   ├─ CourseRail(courses, currentCourseId)
   └─ div.space-y-10 → per course: div#course-{id}.scroll-mt-6 → PathMap(course, index)
```

⚠️ `grid-cols-[minmax(0,1fr)]` is present **at phone width too**. Without it the
implicit `auto` track takes the map header's 399 px min-content and the whole
screen overflows to the inline start on a 412 px device.

### 6.3 `CourseRail`

`aside`, `lg:sticky lg:top-6`. Eyebrow `copy.path.courses` «الكورسات».
One `<a href="#course-{id}">` per course:
- `ProgressRing(progressPercent, size=40)` holding a `CheckIcon` when
  `totalLessons > 0 && clearedLessons === totalLessons`, else a `SubjectMark`
- title (truncate, `--fs-text-sm`)
- meta: done → `copy.path.courseDone` «الكورس خلص» if `contentComplete`, else
  `copy.path.courseUpToDate` «خلّصت اللي نزل»; otherwise «{cleared} / {total}»
- the current course carries `border-accent` on its inline-start border.

### 6.4 `PathMap`

Header (`.panel`, mb-2):
- `sm`+: a 20-width 4/3 cover strip; below `sm` a 40 px `ProgressRing`
- eyebrow `copy.path.courseIndex` «الكورس {n}» with `n = index + 1`
  (⚠️ the index prop is required — without it it rendered «الكورس NaN»),
  plus, below `sm`, the `{cleared}/{total}` counter
- `copy.path.closedBadge` «مقفول مؤقتاً» pill when `published === false`
- `h2` = course title (`line-clamp-2` below `sm`, `truncate` from `sm`), a
  stretched link when the course is open
- from `sm`: a right-aligned mono `{cleared} / {total}`

Body:
- no open nodes → `copy.path.nothingOpen` «مفيش حاجة مفتوحة دلوقتي»
- else `ol.path-run` — a vertical meander of nodes joined by dotted connectors
  (`.path-run__at`, offset by a sine wave; decorative, not a directional cue)

Per node:
- glyph: current → `LessonKindIcon` on amber; `cleared` → `CheckIcon`;
  `locked` → `LockIcon`; else `LessonKindIcon`
- accessible label parts: `copy.path.exam` «الامتحان النهائي» when `isExam`;
  `copy.path.locked` «مقفول» when locked; `copy.course.lessonKind[kind]`;
  `lessonStateLabel(node)`
- the first available node carries `copy.path.startHere` «نبدأ من هنا» (mono,
  amber fill, `#1A1206` ink)
- a locked node opens the exam-locked dialog (§9.4) with
  `triggerLabel = "{title} — مقفول"`
- a node in a **closed** course opens the course-closed dialog with
  `triggerLabel = "{title} — مقفول مؤقتاً"`:
  `copy.path.closedTitle` «الكورس ده مقفول مؤقتاً»,
  `copy.path.closedBody` «م. أيمن بيعدّل فيه دلوقتي، فمقفول للحظات. تقدمك ودرجاتك كلها محفوظة، وأول ما يخلص هيفتح لوحده — مش محتاج تعمل حاجة.»,
  close `copy.path.closedClose` «تمام»

Both dialogs use real focusable `<button>` triggers, never inert spans.

`lessonStateLabel` / `lessonStateMark` (`apps/web/lib/course-outline.ts`):
```
isLessonFinished(l) = l.gate === 'cleared'
                   || l.state === 'completed'
                   || l.state === 'passed'
                   || (l.kind === 'quiz' && !l.isExam && l.state === 'failed')
mark  = finished ? 'done' : l.state === 'in_progress' ? 'started' : 'new'
label   done    → copy.library.lessonDone     «خلصت»
        started → copy.library.lessonStarted  «لسه ما خلصتهاش»
        new     → kind==='quiz' ? copy.library.lessonQuizNew «لسه ما امتحنتش»
                                : copy.library.lessonNew     «لسه ماشوفتهاش»
```

---

## 7. `/library` — «الكورسات»

`apps/web/app/(app)/library/page.tsx`, `apps/web/lib/library.ts`,
`components/library/*`.

**Data (4 parallel):** `getCatalogOrEmpty()`, `GET /api/me/path`,
`GET /api/profile/me`, `getTaxonomyOrNull()` (a `null` taxonomy only degrades the
year headings). Joined by `buildLibrary({courses, path, me, taxonomy})` into
`{ identity, yours, rest, totalCourses }`.

```
main (max-w-[var(--w-app)] px-6 py-10 md:py-12)
├─ header.study-head
│   p.eyebrow = copy.library.eyebrow «04 / الكورسات»
│   h1        = copy.library.title   «الكورسات»
│   p.lead    = copy.library.subtitle «كل الكورسات المنشورة، مرتّبة بالصف والمسار — وكورساتك إنت في الأول.»
├─ IdentityStrip(identity, me.onboardingCompleted)
└─ totalCourses === 0
   │  p (ember panel, centred) = copy.library.empty «لسه مفيش كورسات منشورة.»
   └─ else div.mt-10.flex.flex-col.gap-12
      ├─ [identity !== null] section «كورساتك»
      │   .group-head: mark + h2 copy.library.yoursTitle «كورساتك»
      │       + [sm+] note copy.library.yoursLead «الكورسات اللي على صفّك ومسارك.»
      │       + [count>0] copy.library.courseCount «{n} كورس»
      │   yours.length === 0 → panel copy.library.yoursEmpty
      │        «لسه مفيش كورسات منشورة لصفّك. أول ما ينزل كورس هيظهر هنا.»
      │   else → TrackCell per track group
      └─ [rest.length] p = copy.library.restLead «مفتوحة لك تتفرّج عليها في أي وقت.»
                       + YearSection per year group
```

`TrackCell`: a 6 px ember dot + `h3` track label + mono `copy.library.courseCount`,
then `ul.grid gap-4 sm:grid-cols-2 xl:grid-cols-3` of `LibraryCourseCard`.
When a year has exactly one track whose key is `''`, the track header is omitted.
`YearSection`: `.group-head` + `h2` year label + count, then its `TrackCell`s.
`copy.library.trackGeneral` «عام» is the general-track label.

### 7.1 `IdentityStrip`

- **No identity:** an ember panel with `copy.library.identityMissing`
  «لسه ماخترتش صفّك», `copy.library.identityMissingHint`
  «صفّك ومسارك عشان نعرف نرتّب كورساتك.», and an amber `h-10` button
  `copy.library.identityMissingCta` «نختار صفّك» going to
  **`/settings/section` when `onboardingCompleted` is true, `/onboarding` otherwise**
  (a fully-onboarded student with no year is bounced straight back out of the wizard).
- **Identity present:** a 40 px ember disc with `GraduationCap`, eyebrow
  `copy.library.identityLabel` «صفّك ومسارك», label
  `copy.library.identity` «{year} · {track}» (or the year alone when there is no
  track), plus a third line with `schoolStreamLabelAr` when present, and a
  trailing `chip chip--quiet` → `/settings/section` labelled
  `copy.library.identityEdit` «غيّرهم».

### 7.2 `LibraryCourseCard`

```
enrolled = progressPercent !== null
done     = enrolled && progressPercent === 100
empty    = lessonCount === 0
href     = enrolledCourseHref({ slug, lastLessonId: nextLessonId })
cta      = empty ? copy.library.emptyCardCta «لسه فاضي»
         : !enrolled ? copy.library.start «نبدأ الكورس»
         : done ? copy.library.open «فتح الكورس»
         : copy.library.resume «نكمّل»
chip class = (enrolled && !done && !empty) ? chip--solid : chip--quiet
```
```
li.panel (flex column, overflow-hidden)
├─ cover box — aspect-[16/8] ONLY when coverKey is null
├─ div.flex.flex-1.flex-col.gap-3.p-4
│   ├─ h3 → Link href
│   ├─ mono meta: Layers + copy.library.lessonCount «{n} محاضرة»
│   │             Clock  + formatDuration(totalSeconds)
│   │             (glyphs ember, figures muted)
│   └─ mt-auto footer
│       enrolled → row [state word] + mono «{cleared} / {lessonCount}»
│                   + LessonProgressBar(progressPercent)
│          state word: done → contentComplete ? copy.library.courseDone «خلصت الكورس»
│                                             : copy.library.courseUpToDate «خلّصت اللي نزل»
│                             (the ONE green word on this screen)
│                     else copy.library.percentDone «خلصت {percent}%»
│       not enrolled → copy.library.notStarted «لسه ماابتديتش»
└─ Link.chip.w-full → href, label + class above
```

---

## 8. `/library/[slug]` — one course, signed-in view

`apps/web/app/(app)/library/[slug]/page.tsx`.
Metadata: `privateRouteMetadata` with `title = course.title ?? copy.course.notFound`.

**Data (3 parallel):** `getCourse(slug)` (cached catalogue detail, shared with the
public page), `GET /api/me/path`, `getPublicSettingsOrDefaults()`.
`if (!course) notFound()`. The per-student half is
`path.courses.find(c => c.id === course.id) ?? null`, joined by
`buildCourseOutline({course, path})`.

```
main (max-w-[var(--w-shell)] px-6 py-10 md:py-12)
├─ section.stage.mb-8 > .stage__body
│   ├─ Link /library .stage__back (ArrowRight, icon-inline) = copy.library.backToLibrary «كل الكورسات»
│   └─ grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] md:gap-10
│      ├─ text column
│      │   ├─ p.stage__eyebrow = systemNameAr [· trackLabelAr] · subjectNameAr
│      │   ├─ h1.stage__title  = course.title
│      │   ├─ [subtitle] p.stage__sub
│      │   └─ .stage__facts: Layers + copy.library.lessonCount «{n} محاضرة»
│      │                     Clock  + formatDuration(course.totalSeconds)
│      └─ CourseCover(coverKey, subjectNameAr, seed=slug)
├─ ONE of three state panels
├─ [pathCourse?.whatsappGroupUrl] CourseGroupCard (max-w-[28rem])
├─ [course.description] RichText
└─ [gating rule below] CourseOutlineView(outline, courseSlug, courseId)
```

⚠️ `whatsappGroupUrl` is read off `/api/me/path` — the only payload here behind an
enrolment. `course` is the shared cached catalogue detail served to anybody, and
putting a cohort invite on it would publish the link on the marketing page.

**Mobile:** the stage grid collapses to one column and the cover drops **below**
the facts.

### 8.1 The three state panels, checked in this order

1. **`outline.totalLessons === 0`** — checked *before* the enrolled split, because
   the answer is the same either way.
   `.empty` + `SpotIllustration('courses')` + `copy.library.emptyTitle`
   «الكورس ده لسه فاضي» + `course.comingSoonNote ?? copy.library.emptyBody`
   («المحاضرات لسه ماتنشرتش. أول ما تنزل هتلاقيها هنا على طول، ومش محتاج تعمل حاجة.»)
   + `chip chip--solid` → `/library` labelled `copy.library.emptyCta`
   «نشوف باقي الكورسات». No retry — nothing the student presses can publish a lecture.

2. **`outline.enrolled`** — a `.panel`:
   - headline: `progressPercent === 100`
     ? (`contentComplete ? copy.library.courseDone «خلصت الكورس»
        : copy.library.courseUpToDate «خلّصت اللي نزل»`)
     : `copy.library.percentDone` «خلصت {percent}%»
   - mono accent `{clearedLessons} / {totalLessons}`
   - `LessonProgressBar(progressPercent)`
   - when `outline.nextLessonId`: an amber `h-10` link to
     `/courses/{slug}/lessons/{nextLessonId}` with a `Play` glyph and
     `copy.library.resume` «نكمّل»

3. **not enrolled** — a `.panel`:
   - `copy.library.notEnrolledTitle` «نبدأ الكورس عشان المحاضرات تتفتح»
   - priced (any of `monthlyPriceCents`/`quarterlyPriceCents`/`yearlyPriceCents`
     non-null, or `terms.length > 0`) → `copy.library.notEnrolledBodyPriced`
     «الكورس ده مدفوع — دوسة على «نبدأ» وهيبان لك تفاصيل الاشتراك.»
     else `copy.library.notEnrolledBody`
     «الكورس مجاني بالكامل — دوسة على «نبدأ» وأول محاضرة بتتفتح على طول.»
   - `CourseStartButton(courseId, slug, hasLessons, prices, terms, instapay)`:
     `POST /api/courses/{courseId}/enroll` → `EnrollResponseSchema`
     `{ enrollmentId, resumeLessonId: string|null }`. A **403 opens the subscribe
     modal**. `resumeLessonId === null` (published course, no published lessons)
     renders the button disabled rather than navigating into a lesson that does
     not exist. `copy.library.enrollCta` «نبدأ الكورس»;
     `copy.enrollment` carries «الاشتراك في الكورس» / «إنت في الكورس» /
     «بنشتركك…» / «نبدأ الكورس».

### 8.2 Outline visibility rule

`CourseOutlineView` renders **only** when
`outline.totalLessons > 0 && (outline.enrolled || course is free)`,
free = all three price fields `null` **and** `terms.length === 0`.
A priced course the student has not bought hides its outline entirely — every row
would 403 identically.

---

## 9. Shared course-outline vocabulary

Used by `/library/[slug]` (`components/library/course-outline.tsx`) and the player
sidebar (`components/player/course-outline.tsx`). Styles `.unit`, `.lesson-row`,
`.chip` in `apps/web/app/study.css`.

### 9.1 Grouping — `groupIntoEntries(lessons)`

Walk the section's lessons in order: a lesson with `kind === 'quiz' && !isExam`
attaches to the previous entry's `quizzes[]`; anything else starts a new entry.
An exam is therefore never nested, and an orphan quiz stands alone.

### 9.2 Row

```
li.lesson-row [--done|--new|--started|--quiz|--locked] [outline-row--current]
├─ span.lesson-row__well → LessonKindIcon(kind)  (aria-hidden)
├─ div.lesson-row__text
│   ├─ p.lesson-row__title = lesson.title
│   ├─ p.lesson-row__meta  = parts joined with " · ":
│   │     [copy.library.lessonQuiz «كويز المحاضرة» when nested under a lecture]
│   │     [copy.library.exam «الامتحان النهائي» when isExam]
│   │     [formatDuration(estimatedSeconds) when non-null]
│   │     lessonStateLabel(lesson)
│   └─ [isFreePreview] Badge tone=accent = copy.catalog.freePreview
└─ LessonChip → Link /courses/{slug}/lessons/{id}
   aria-label = "{label} — {title}"
   label: gate==='cleared'                     → copy.library.review   «مراجعة»
          kind!=='quiz'                        → copy.library.watch    «مشاهدة»
          quiz already sat (failed|passed)     → copy.library.quizDone «نتيجتك»
          quiz not sat                         → copy.library.takeQuiz «دخول الامتحان»
   class: chip + (isLessonFinished ? chip--done : chip--solid)
```
Exactly **one** control per row; `.lesson-row__link` stretches the pointer target
over the whole row without adding a second tab stop.
`copy.library.reread` «مراجعة الدرس» is available for a re-read affordance.

### 9.3 Collapsible lecture entry

A lecture entry carrying at least one quiz renders as a native
`<details class="unit">`, open when the active lesson is the lecture or one of its
quizzes. Summary = kind icon + lecture title + `formatDuration(estimatedSeconds)`
+ a chevron. Its body lists the lecture row then each quiz row with `isQuiz`
(indented, `.lesson-row--quiz`). A lecture with **no** quizzes stays a plain
always-visible row — hiding a single chip behind a click adds a tap for nothing.

### 9.4 Locked exam

Only the course's final exam can be `gate === 'locked'`.
`LockedExam` → `ExamLockedDialog`:
- trigger: `chip chip--locked` (grey, `cursor: not-allowed`) with a `LockIcon`
  and `copy.library.lessonLocked` «مقفول»
- title `copy.library.lockedExamTitle` «الامتحان النهائي لسه مقفول»
- body `formatCopy(copy.library.lockedExamBody,{remaining,total})`
  «بيفتح لما كل محاضرات الكورس تخلص — باقي {remaining} من {total}.»
  or, when `remaining` is 0/null, `copy.library.lockedExamBodyPlain`
  «بيفتح لما كل محاضرات الكورس تخلص.»
- list heading `copy.library.lockedExamLeftTitle` «المحاضرات اللي لسه فاضلة:»
  then up to **8** remaining lectures, each with the title and a mono meta of
  `copy.library.lessonIndex` «المحاضرة {n}» + ` · ` + `lessonStarted`/`lessonNew`;
  overflow `copy.library.lockedExamLeftMore` «و{n} محاضرة كمان في الفهرس تحت.»
- the close (X) label is `copy.common.close` «إغلاق»; the footer button is
  `copy.library.lockedClose` «تمام». **They must differ** — two controls with one
  accessible name in one dialog is ambiguous.

`remainingLectures(flatLessons)` counts **lectures only** (quizzes are skipped
before the counter increments), so lecture numbering never shifts.
Other player-side lock strings: `copy.player.lockedHint`
«اللي قبله لازم يخلص الأول عشان يتفتح», `copy.player.examBadge` «امتحان»,
`copy.player.examLockedHint` «الامتحان بيتفتح لما كل المحاضرات تخلص».

---

## 10. LESSON PLAYER — `/courses/[slug]/lessons/[lessonId]`

The most complex screen after the quiz runner.
Files: `apps/web/app/(app)/courses/[slug]/lessons/[lessonId]/page.tsx`,
`homework-actions.ts`, `apps/web/components/player/*`,
`apps/web/lib/progress-client.ts`, `packages/contracts/src/progress.ts`.

### 10.1 Server load

| call | endpoint | schema | failure handling |
|---|---|---|---|
| outline | `GET /api/courses/{slug}/outline` | `CourseOutlineSchema` | 404 → `null`; anything else rethrows |
| player | `GET /api/lessons/{lessonId}/player` | `LessonPlayerSchema` | **403 → `redirect('/courses/{slug}')`** (lapsed/revoked subscription — the public page's start button already turns that 403 into the subscribe modal); 404 → `null`; else rethrow |
| settings | cached public settings | — | `…OrDefaults` |
| shipping | `getBookShippingCents()` | — | cached |

Then:
- `if (!outline) notFound()` — the course is not theirs at all.
- `if (!payload) redirect('/library/{slug}')` — enrolled, but this lesson is gated;
  `/library/[slug]` is the page that can explain it.
- `payload.text.bodyHtml` is sanitized a **second** time on the server
  (`sanitizeRichText`) before crossing to the client, so `dompurify` never ships.

⚠️ A 404 genuinely means "not enrolled **or** no such lesson" (ownership is
compiled into the query so the catalogue cannot be used as an oracle). A 500 /
429 / dropped connection must **not** be rendered as "not found".

### 10.2 Payload — `LessonPlayerSchema`

```ts
{
  lesson: { id, courseId, courseSlug, courseTitle, sectionTitle, title,
            kind: 'video'|'quiz'|'attachment'|'text',
            estimatedSeconds: int | null }
  video: {
    youtubeId: string  /^[A-Za-z0-9_-]{11}$/     // the ID only, never a URL
    durationSeconds: int >= 0                    // 0 = unknown
    posterUrl: string | null
    mirror: PlayerVideoMirror | null             // our own copy, { hlsUrl, … }
  } | null
  text: { bodyHtml: string } | null
  homework: StudentHomework | null    // null also when the homework is a DRAFT
  quiz: { id: string } | null         // a published quiz attached to THIS lesson,
                                      // regardless of lesson.kind
  resources: PlayerResource[]
  progress: LessonProgress
  previous: { id, title, kind } | null
  next:     { id, title, kind } | null
  autoCompleteAvailable: boolean      // false when the duration is unknown
}

LessonProgress {
  lessonId: string
  state: 'not_started'|'in_progress'|'completed'|'passed'|'failed'
  completion: 0..1
  watchedSeconds: int >= 0
  maxPositionSeconds: int >= 0
  openCount: int >= 0
  completedAt: ISO | null
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
  viewPath: string | null      // SAME-ORIGIN, starts /api/ — null for video/link
  downloadPath: string | null  // SAME-ORIGIN, starts /api/ — null for video/link
}
```

`CourseOutlineSchema` additionally carries
`course.{ id, slug, title, bookTitle|null, bookPriceCents|null, coverKey|null,
subjectNameAr, contentComplete, whatsappGroupUrl|null }`, `sections[]`,
`enrollmentId`, `progressPercent`, `lastLessonId`, `completedLessons`,
`totalLessons`, `totalEstimatedSeconds`, `examLessonId|null`, and per lesson
`{ id, title, kind, position, estimatedSeconds, isFreePreview, state, completion,
gate, isExam }`.

### 10.3 Page layout

```
main (mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8)
└─ div.grid.gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8
   ├─ div.min-w-0                       (content column, inline-start in RTL)
   │   ├─ LessonPlayerView(payload)
   │   ├─ h1 (mt-5, --fs-title-3, semibold) = payload.lesson.title
   │   ├─ p.mono (mt-1, --fs-mono-label, muted) = "{courseTitle} · {sectionTitle}"
   │   └─ [payload.homework] LessonHomework(lessonId, homework)
   └─ div.flex.flex-col.gap-4
       ├─ CourseOutlineSidebar(outline, activeLessonId, shippingCents, instapay)
       ├─ CourseGroupCard(outline.course.whatsappGroupUrl)  — null renders nothing
       └─ CourseHelpCard(whatsapp)
```

`max-w-[1440px]` is wider than the rest of the product (`--w-shell` 1152) — the
video is the one object that is better bigger. **The title sits BELOW the player.**
There is deliberately **no course-details card** on this page.

`CourseHelpCard` (`copy.player.help`): title «تحتاج مساعدة؟», lead
«لو عندك سؤال عن الكورس ده، ابعتله على واتساب.», cta «واتساب».

**Mobile (< `lg`):** one column — player, title, meta, homework, then the outline,
group card and help card stacked underneath.

### 10.4 `CourseOutlineSidebar`

`nav[aria-label=copy.player.outline]`, `data-course-outline`, rounded, bordered,
`max-h-[60dvh] overflow-y-auto`; from `lg`:
`sticky top-6 max-h-[calc(100dvh-3rem)] self-start`.

Header (`border-b px-5 py-5`):
- `copy.player.outline` «محتوى الكورس»
- `LessonProgressBar(outline.progressPercent, label = copy.player.courseProgress «تقدّمك في الكورس»)`
- mono `{completedLessons} {copy.player.lessonsCompleted} {totalLessons}` → «12 درس خلص من 40»
- when `courseBookCtaVisible(outline.course)`: `BookOrderButton(courseId,
  bookTitle, bookPriceCents, shippingCents, instapay)` — «اطلب الكتاب»

Body: `ol` of sections, each printing a mono zero-padded index
(`String(i+1).padStart(2,'0')`) beside its title, then `groupIntoEntries` rows (§9).
`OutlineScrollToCurrent` scrolls `[aria-current]` into view on mount.

### 10.5 `LessonPlayerView` — body dispatch

Local state: `progress` (seeded from `payload.progress`), `saveFailed`.

On mount: `POST /api/lessons/{id}/open` (`{}`) → `LessonProgressSchema`.
It registers `openCount`/`firstOpenedAt` **and writes `enrollment.lastLessonId`**,
which is what makes "resume" land here tomorrow. Failure is swallowed.

| condition | renders |
|---|---|
| `kind==='video' && video` | `VideoLesson` (§10.6) |
| `kind==='video' && !video` | `<p role="status">` filling an `aspect-video` grey box = `copy.player.videoMissing` «المحاضرة دي لسه مافيهاش فيديو.» |
| `kind==='text' && text` | `TextLesson` — sanitized HTML + a **dwell timer** |
| `kind==='attachment'` | `AttachmentLesson` — `ResourceList` + a **dwell timer** |
| `kind==='quiz'` | `QuizLesson(variant='exam')` |
| `kind!=='quiz' && payload.quiz` | `QuizLesson(variant='attached')` |
| `kind!=='attachment' && resources.length` | `LessonMaterials` (collapsed by default) |

Then, always:
- one hint paragraph:
  - quiz → `copy.player.quizAutoCompleteHint` «الدرس ده بيتقفل لوحده مع النجاح في الاختبار.»
  - `autoCompleteAvailable` → `copy.player.autoCompleteHint`
    «الدرس بيتقفل لوحده لما توصل لآخر الفيديو وتكون شُفت معظمه.»
  - else → `copy.player.manualOnlyHint`
    «مدة الفيديو مش متسجّلة، فدوسة على «الدرس خلص» في الآخر.»
- `[saveFailed]` `<p role="status">` in `--warn` = `copy.player.saveFailed`
  «مقدرناش نسجّل تقدّمك دلوقتي»
- `LessonNav` (§10.8)

`LessonMaterials`: a disclosure button (`aria-expanded`, `aria-controls`) with a
`DownloadIcon` well, `copy.player.materials` «مواد المحاضرة» and
`{n} {copy.player.materialsCount}` → «3 حاجات مرفوعة». **Closed by default.**

`ResourceList` per resource: icon + title (+ mono `copy.player.mainPresentation`
«البريزنتيشن الأساسي» for `presentation`), optional description, then:
- `video` → a `youtube-nocookie.com/embed/{youtubeId}` iframe
- `link` → a YouTube id or Google-Drive file id is extracted and embedded when
  possible, plus an open-externally link showing the hostname
  (`copy.player.openInNewTab` «فتح في تبويب جديد»)
- file kinds → `DocumentViewer`: a toggle `copy.player.openDocument`
  «دوسة عشان يتفتح» / `copy.player.closeDocument` «دوسة عشان يتقفل», a download
  `<a href={downloadPath}>` labelled `copy.player.download` «تحميل المحاضرة», and
  an `<iframe src={viewPath}>` once opened (**an iframe, not `<object>`** — the CSP
  sets `object-src 'none'`). Fallback `copy.player.viewerUnavailable`
  «المتصفح مش قادر يعرض الملف — التحميل بيفتحه.»
- empty list → `copy.player.noResources` «مفيش مواد مرفوعة للدرس ده.»
  (`copy.player.resources` «مواد الدرس» is the other heading in the table.)

`viewPath` / `downloadPath` are **same-origin `/api/…` routes that re-derive access
per request**. Never construct a storage URL; a leaked key is not an access grant.

### 10.6 `VideoLesson` — the state machine

`components/player/video-lesson.tsx` + `mirror-video.tsx`.

**States:** `activated`, `startedAt`, `player`, `failure`, `posterFailed`,
`plainFrame`, `mirrorFailed`, `fullscreen`.

**Source order — the mirror wins.** `useMirror = video.mirror !== null && !mirrorFailed`.
Our own HLS copy is tried FIRST because on a ministry tablet YouTube is blocked at
the network and **a blocked network reports nothing** — a YouTube-first player with
our copy as a fallback would never fall back.

**Resume point** — `resumePoint(furthest, duration)`:
```
RESUME_REWIND_SECONDS = 5
!finite(furthest)                    → 0
point = floor(furthest) - 5
point <= 0                           → 0
duration > 0 && point >= duration    → 0      // stale position from a re-cut video
else                                   point
```
`resumeAt` is `payload.progress.completedAt != null ? 0 : payload.progress.maxPositionSeconds`
— read from the **server-rendered payload**, never from live state (a state read
races the `postOpen` response against the student's finger). A finished lesson
always restarts at 0.

**Poster (before `activated`)**:
- the poster image at full opacity + a `bg-black/45` scrim; dropped entirely if the
  image errors (`posterFailed`) rather than showing a broken-image glyph
- a **full-bleed transparent `<button>`** = the whole tap target, with no children,
  `aria-label = playLabel`:
  - with a resume: «تشغيل الفيديو — أكمل من {mm:ss} — {title}»
  - without: «تشغيل الفيديو — {title}»
  (`copy.player.play` «تشغيل الفيديو», `copy.player.resumeFrom` «أكمل من»)
- an 80 px (`sm`: 96 px) amber disc with a play glyph, `pointer-events-none`
- the word `copy.player.play` under it (`--fs-title-4` semibold; white over a
  poster, `text-fg` without one)
- then **either** (never both — a 360 px phone's 184 px overlay cannot hold four
  stacked items):
  - `resumeSeconds > 0` → «أكمل من» + `formatDuration(resumeSeconds)` (mono tabular)
    + a `pointer-events-auto` `min-h-11` outlined button `copy.player.restart`
    «من الأول» (`aria-label = "من الأول — {title}"`) which activates at 0
  - else, `durationSeconds > 0` → the total duration in mono tabular

**`activate(startAt)`:**
```
if (activated || no mount node) return
setActivated(true); setStartedAt(startAt)
if (useMirror) return                 // <MirrorVideo> mounts on the next render
await startYouTube(startAt)
```

**`startYouTube(startAt)`:**
1. `await loadYouTubeIframeApi()` (a script from `youtube.com`, own timeout).
   On throw → `setPlainFrame(true)` — ad blocker, filtered DNS, captive portal.
2. `new api.Player(mount, { videoId, host: YOUTUBE_NOCOOKIE_HOST, playerVars: {
   rel:0, modestbranding:1, playsinline:1, hl:'ar', cc_lang_pref:'ar', origin,
   fs:1, start: startAt } })`. **No URL ever comes out of the database.**
3. `onReady`: clear the ready timer, store the handle, set `allow` + `allowfullscreen`
   on the generated iframe (the API builds it, so there is no JSX to put the
   attribute in, and `Permissions-Policy` defaults `fullscreen` to `self`), then
   **call `playVideo()`** — constructing a player only *cues* it, which is why the
   student used to have to press a second play button inside the frame.
4. `onError(event)` → `setFailure(failureOfCode(event.data))`:
   `101|150 → 'embedBlocked'`, `100 → 'removed'`, `2|5|anything → 'unknown'`.
5. `FRAME_READY_TIMEOUT_MS = 15_000`, armed **after** construction: if `onReady`
   never fires, destroy the instance and `setPlainFrame(true)` — the nocookie host
   was swallowed, try the ordinary one.

**Fallback plain iframe** (`plainFrame === true`):
`https://www.youtube.com/embed/{id}?autoplay=1&rel=0&modestbranding=1&playsinline=1&hl=ar&cc_lang_pref=ar&start={resumeSeconds}`
— the **ordinary** host, deliberately not nocookie (repeating the host that just
failed would be a retry, not a different attempt). `autoplay=1` is safe here
because the frame only mounts after a user gesture.
Under the player, a `role="status"` line: `copy.player.videoFallbackNote`
«النت عندك كان مانع المشغّل بتاعنا، فشغّلناه بطريقة تانية. الدرس مش هيتسجّل لوحده — دوس «خلاص · التالي» لما تخلّص.»
plus `copy.player.videoOpenOnYouTube` «افتحه على يوتيوب» →
`https://www.youtube.com/watch?v={id}`.
**This path has no `getCurrentTime`, so there is no heartbeat and no auto-completion.**

**Failure panel** (`failure !== null`) — absolutely positioned over the box,
`role="status"`, centred:
- `embedBlocked` → `copy.player.videoEmbedBlocked`
  «الفيديو ده مش مسموح يتشغّل جوه المنصة. افتحه على يوتيوب.»
- `removed` → `copy.player.videoRemoved`
  «الفيديو ده مش موجود على يوتيوب دلوقتي. ولو فضلت المشكلة، كلمة للمدرّس.»
- `unknown` → `copy.player.videoUnavailable` «الفيديو مش متاح دلوقتي»
plus the same «افتحه على يوتيوب» link. **No retry button** — the one retryable
failure now falls through to `plainFrame` instead.

**`MirrorVideo`** — a plain `<video controls playsInline autoPlay
preload="metadata" poster aria-label={title}>` filling the box:
- Safari / iOS (`canPlayType('application/vnd.apple.mpegurl') !== ''`) → set
  `element.src = mirror.hlsUrl` natively. **Never load hls.js on iOS** — no MSE, so
  it would attach, fail, and report a fatal error for a stream the element plays.
- everything else → dynamic `import('hls.js')`; `!Hls.isSupported()` → `onFatal()`.
  Else `new Hls({ startLevel: -1, capLevelToPlayerSize: true })`,
  `loadSource(hlsUrl)`, `attachMedia(element)`.
  Fatal `NETWORK_ERROR` → `startLoad()`; fatal `MEDIA_ERROR` → `recoverMediaError()`;
  anything else fatal → `onFatal()`. A failed dynamic import also calls `onFatal()`.
- `onFatal` in the parent: `setMirrorFailed(true)` then `startYouTube(startedAt)` —
  the student sees one frame reload, not an error.
- Seek: on the **first** `loadedmetadata` only, `currentTime = startAt`.
  `loadedmetadata` fires again on every native quality change; re-seeking would
  drag the student backwards every time their connection improved.
- The element is adapted to the YouTube interface so ONE heartbeat serves both:
  ```
  getCurrentTime() → element.currentTime
  getDuration()    → finite(element.duration) ? element.duration : 0
  getPlayerState() → element.ended ? 0 : element.paused ? 2 : 1
  playVideo()      → element.play().catch(noop)
  destroy()        → noop
  ```
  (`1 = PLAYING`, `2 = PAUSED`, `0 = ENDED`.)

**Fullscreen:** the shell div is the fullscreen element. A document-level `keydown`
listens for `event.code === 'KeyF'` (**never `event.key`** — on an Arabic layout F
emits «ب»), ignoring modifiers and `INPUT`/`TEXTAREA`/`SELECT`/`contenteditable`
targets. `fullscreenchange` syncs the state back. In fullscreen the box drops
`aspect-video`, the border and the radius, and takes `h-full`.

### 10.7 Progress reporting

Constants (`packages/contracts/src/progress.ts`, shared with the server):
```
VIDEO_POSITION_THRESHOLD      = 0.95
VIDEO_WATCHED_THRESHOLD       = 0.70
HEARTBEAT_INTERVAL_MS         = 10_000
MAX_HEARTBEAT_DELTA_SECONDS   = 15
HEARTBEAT_CLOCK_GRACE_SECONDS = 2
DWELL_COMPLETE_MS             = 5_000
VIEW_SESSION_GAP_SECONDS      = 1800    // 30 min — ends a viewing sitting
```

Completion (server authority; mirrored client-side for display only):
```
isVideoAutoComplete(s) = s.durationSeconds > 0
                      && s.maxPositionSeconds >= 0.95 * s.durationSeconds
                      && s.watchedSeconds    >= 0.70 * s.durationSeconds
```
**Both** thresholds are required — position alone is defeated by dragging the
scrubber, watch-time alone by leaving the tab playing in the background.

`videoCompletionFraction(s)` = `0` when duration ≤ 0, `1` when auto-complete, else
`round(clamp(watched/duration,0,1) * 10_000)/10_000` (matches `numeric(5,4)`).

**Heartbeat loop** (`use-video-heartbeat.ts`):
- ticks every 1000 ms while a player exists
- `advanced = getCurrentTime() - last`; credit is added **only** when
  `getPlayerState() === PLAYING` **and** `0 < advanced <= 2`
  (`MAX_HONEST_TICK_ADVANCE`) — a bigger jump is a seek, not playback
- flushes every 10 ticks (10 s)
- flush payload: `position = max(floor(getCurrentTime()),0)`,
  `delta = min(round(accumulated), 15)`; skipped when `delta <= 0` and not a
  keepalive flush, and while another flush is in flight
- the accumulator is cleared **optimistically** and restored (capped at 15) if the
  POST fails, and `onError()` fires (surfacing `copy.player.saveFailed`)
- `POST /api/lessons/{id}/heartbeat` body `{ position: int 0..86400, delta: int 0..15 }`
  (`HeartbeatRequestSchema`, `.strict()` — extra keys are a 400)
  → `HeartbeatResponseSchema` `{ progress, justCompleted: boolean,
  courseProgressPercent: 0..100 }`. **`justCompleted` is server-decided.**
- `visibilitychange → hidden` and unmount flush with `keepalive: true`
  (**not** `navigator.sendBeacon` — a beacon cannot set the CSRF header)
- server clamp: `allowedHeartbeatSeconds(claimed, elapsed) =
  min(clamp(floor(claimed),0,15), max(floor(elapsed),0) + 2)`, so no request storm
  can accumulate watch time faster than time itself passes.

**Dwell loop** (`use-dwell-complete.ts`, text + attachment only):
- skipped when already complete
- after 5000 ms → `POST /api/lessons/{id}/dwell` (`{}`) → `HeartbeatResponse`
- if the response's `progress.completedAt` is still null, retry once more after
  another 5 s. **The server measures the real elapsed time from `first_opened_at`**,
  so firing early or a hundred times cannot complete a lesson faster than 5 real
  seconds. Failures are silent — the manual button is always available.

**Client endpoints** (`apps/web/lib/progress-client.ts`):
| function | request |
|---|---|
| `postOpen` | `POST /api/lessons/{id}/open` `{}` → `LessonProgress` |
| `postHeartbeat` | `POST /api/lessons/{id}/heartbeat` `{position, delta}` → `HeartbeatResponse` |
| `postDwell` | `POST /api/lessons/{id}/dwell` `{}` → `HeartbeatResponse` |
| `postComplete` | `POST /api/lessons/{id}/complete` `{}` → `HeartbeatResponse` |

`EmptyBodySchema` = `z.object({}).strict()` — the manual button carries no payload.

### 10.8 `LessonNav`

```
div (flex-wrap, justify-between, gap-3, border-t, pt-6)
├─ left: [previous] Link → /courses/{slug}/lessons/{previous.id}
│            ChevronBack + copy.player.previous «الدرس السابق»
│         [next]     Link → …/{next.id}
│            copy.player.next «الدرس التالي» + ChevronForward
└─ right: [manualComplete] column (items-end)
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
The whole right block (not just the button) is omitted for a quiz.

`finish()` — order is load-bearing:
```
setSaving(true); setFailed(false)
try   { onProgress(await postComplete(lessonId))
        if (next) router.push(`/courses/${slug}/lessons/${next.id}`) }
catch { setFailed(true) }        // ⚠️ NAVIGATION IS NOT ATTEMPTED ON FAILURE
finally { setSaving(false) }
```
Advancing after a failed write is what makes a progress hole invisible — the
student ends up further along with a gap they only find weeks later when the
course refuses to reach 100%.

Other player state words: `copy.player.inProgress` «شغّال»,
`copy.player.notStarted` «لسه», `copy.player.eyebrow` «09 / المشغّل».

### 10.9 `LessonHomework` — «واجب المحاضرة»

Contract `packages/contracts/src/homework.ts`; copy `copy.homework`.

```ts
StudentHomework { body: string, maxImages: int, submission: MyHomeworkSubmission | null }
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
MAX_HOMEWORK_IMAGES = 8   DEFAULT_HOMEWORK_IMAGES = 4
HOMEWORK_IMAGE_RETENTION_DAYS = 30
```
```
canUpload = submission === null || submission.status === 'needs_work'
reopened  = submission?.status === 'needs_work'
remaining = maxImages - staged.length
```
```
section (mt-6, rounded-lg, border, bg-surface-2)
├─ header (ember tint, border-b, px-4 py-3)
│   NotebookPen in a 40px ember well + h2 copy.homework.title «واجب المحاضرة»
│   + [submission] StatusChip
├─ p muted = copy.homework.lead «المطلوب في الواجب ده:»
├─ p whitespace-pre-line = homework.body   (PLAIN text with newlines, NEVER HTML —
│                                           there is no HTML sink on a page that
│                                           also accepts file uploads)
├─ [submission] Verdict block
│   «اتسلّم {n} صورة» (copy.homework.submittedCount)
│   [attempt > 1] · «المحاولة {attempt}» (copy.homework.attempt «المحاولة»)
│   [imagesPurged] copy.homework.imagesGone «الصور اتشالت بعد المراجعة، والتسليم متسجّل.»
│   [grade !== null] copy.homework.grade «الدرجة {grade} من ١٠٠»
│   [reviewNote] copy.homework.note «رد مهندس أيمن» + the note
└─ [canUpload] upload block
    [reopened] tinted notice = copy.homework.reopened «الواجب مفتوح تاني — رفع الحل الجديد من هنا.»
    p bold  = copy.homework.uploadTitle «رفع صور الحل»
    p muted = formatCopy(copy.homework.uploadHint,{max}) «صوّر ورقة الحل ودوس هنا — لحد {max} صورة.»
    [staged] ul grid-cols-3 sm:grid-cols-4 of aspect-[3/4] previews, each with a
             28px round remove button aria-label copy.homework.remove «شيل الصورة»
    row: [ImagePlus] secondary = copy.homework.pick «اختيار الصور»
             (busy → copy.homework.uploading «بنرفع…»; disabled when remaining <= 0)
         primary = copy.homework.submit «تسليم الواجب»
             (reopened → copy.homework.resubmit «تسليم الحل من تاني»;
              pending  → copy.homework.submitting «بنسلّم…»)
         [staged] «{n} صورة» (copy.homework.imageUnit «صورة»)
    [error] p role=alert --err
```
Status chips: `statusPending` «الواجب اتسلّم — مستني مراجعة مهندس أيمن»,
`statusAccepted` «الواجب اتقبل», `statusNeedsWork` «الواجب محتاج شغل تاني».
Badge word elsewhere: `copy.homework.badge` «واجب».

**Upload flow — two steps, and the file never goes through a Server Action:**
1. per file, `POST /api/homework/lessons/{lessonId}/images` (multipart), cap
   `MAX_UPLOAD_BYTES = 8 MiB`, compressed in the browser first →
   `{ storageKey: string, sizeBytes: int }`
2. `POST /api/homework/lessons/{lessonId}/submissions` body
   `{ images: [{ storageKey, sizeBytes }] }` (`HomeworkSubmitSchema`, `.strict()`,
   1..8 entries). On success the previews are revoked and the route refreshes.

Client errors:
- more files than `remaining` → `formatCopy(copy.homework.tooMany,{max})`
  «الحد الأقصى {max} صورة للواجب ده.»
- oversize → `copy.homework.tooLarge` «الصورة كبيرة أوي — أقصى حجم ٨ ميجا للصورة.»
- wrong type / unreadable → `copy.homework.badType`
  «ده مش ملف صورة. الصور بس (JPG أو PNG أو WebP).»
- upload failed → `copy.homework.uploadFailed` «مقدرناش نرفع الصورة. نجرّب تاني.»
- submit failed → `copy.homework.submitFailed` «مقدرناش نسلّم الواجب دلوقتي. نجرّب تاني.»
- nothing staged → `copy.homework.empty` «لازم صورة واحدة على الأقل للحل.»

`GET /api/homework/lessons/{lessonId}` returns the same `StudentHomework`;
`GET /api/homework/images/{imageId}` streams one reviewed image.

### 10.10 `QuizLesson` — the doorway card

```
sat     = progress.state === 'passed' || progress.state === 'failed'
passed  = progress.state === 'passed'
percent = Math.round(progress.completion * 100)   // for a quiz lesson, `completion`
                                                  // IS the best scaled score, 0..1
```
```
Card > CardBody (flex column, items-start, gap-4)
├─ QuizIcon (accent)
├─ sat ?
│    ├─ p muted = copy.player.quizYourScore «درجتك في الاختبار»
│    ├─ row: mono tabular --fs-title-2 «{percent}%»
│    │        + [passed] .verdict--pass copy.quiz.passed «ناجح»  (never a fail badge)
│    └─ p muted =
│         passed && attached → copy.player.quizAttachedPassedNote «نجحت في الكويز.»
│         passed             → copy.player.quizPassedNote «نجحت، والدرس اتقفل.»
│         else               → copy.player.quizFailedNote
│              «مراجعة الإجابات والدخول تاني ممكنين طول ما الاختبار مفتوح.»
│  : p muted = attached ? copy.player.quizAttachedIntro «في كويز قصير على المحاضرة دي.»
│                       : copy.player.quizIntro «الدرس ده اختبار — نبدأه في أي وقت.»
└─ Link → /quizzes/{lessonId}  (amber, h-10)
   sat ? (attached ? copy.player.quizAttachedOpenCta «فتح الكويز»
                   : copy.player.quizOpenCta        «فتح الاختبار»)
       : (attached ? copy.player.quizAttachedCta    «حلّ الكويز»
                   : copy.player.quizCta            «نبدأ الاختبار»)
```
(`copy.player.quizNotSatYet` «لسه مدخلتش الاختبار.» exists in the table.)
The link never starts an attempt — `/quizzes/[lessonId]` owns that decision.

---

## 11. `/quizzes/[lessonId]` — the exam intro screen

`apps/web/app/(app)/quizzes/[lessonId]/page.tsx`.
Metadata title = `copy.quiz.resultsTitle` «نتيجتك».

**Data:** one read, `GET /api/quiz/lessons/{lessonId}` → `QuizOverviewSchema`.
**Never cached** — attempt state and open windows must always be fresh.
404 → `notFound()`; anything else rethrows.

```ts
QuizOverview {
  quizId, lessonId: string
  questionCount: int          // scoped to nextPaper — NOT the sum of both papers
  sumMarks: number            // what the questions add up to
  gradeOutOf: number          // what the mark is reported OUT OF — use THIS
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
  id: string, attemptNo: int
  state: 'in_progress'|'overdue'|'submitted'|'pending_review'|'abandoned'
  submittedAt: string | null
  scaledScore: number | null
  passed: boolean | null
  paper: 'original' | 'improvement'
  counts: boolean            // server-decided: is THIS the sitting that counts
}
```
⚠️ `counts` is sent rather than derived — a client-side `Math.max` disagrees with
the server the moment one paper is still awaiting marking and its score is null.

Derived on screen:
```
improving    = nextPaper === 'improvement'
minutes      = durationSeconds ? Math.round(durationSeconds/60) : null
sittingAhead = inProgressAttemptId !== null || (!blocked && nextPaper !== null)
spent        = blocked?.code === 'no_attempts_left'
heading      = inProgressAttemptId ? copy.quiz.resume       «نكمّل امتحانك»
             : blocked             ? copy.quiz.resultsTitle «نتيجتك»
             : improving           ? copy.quiz.improveExam  «دخول امتحان التحسين»
             :                       copy.quiz.start        «نبدأ الامتحان»
```

### 11.1 Tree

```
main (max-w-[var(--w-shell)] px-4 py-8 md:px-6 md:py-10)
├─ header.stage.mb-6 > .stage__body
│   ├─ [allowsImprovement] p.stage__eyebrow = copy.quiz.papers[nextPaper ?? 'original']
│   │       original «الامتحان الأصلي» | improvement «امتحان التحسين»
│   ├─ h1.stage__title = heading
│   ├─ [sittingAhead] p.stage__sub =
│   │       improving ? copy.examGate.improveIntro «قبل الدخول، في حاجتين لازم يكونوا معروفين.»
│   │                 : copy.quiz.hint            «مراجعة الإجابات كويس قبل التسليم.»
│   └─ .exam-stage__action — exactly ONE of:
│        inProgressAttemptId → Link chip chip--solid → attemptHref, copy.quiz.resume
│        blocked             → p.exam-stage__blocked = BLOCKED_COPY[code]
│        nextPaper           → StartAttemptButton
├─ section.exam-facts.mb-8 — four StatTiles
└─ [attempts.length] section «محاولاتك السابقة»
```

| blocked code | copy key | Arabic |
|---|---|---|
| `quiz_not_open_yet` | `copy.quiz.notOpenYet` | «الامتحان لسه مفتحش» |
| `quiz_closed` | `copy.quiz.closed` | «الامتحان قفل» |
| `no_attempts_left` | `copy.quiz.noAttemptsLeft` | «الامتحان ده اتقدّم خلاص» |

(`copy.quiz.blockedTitle` «الامتحان مش متاح دلوقتي» and `copy.quiz.notEnrolled`
«الامتحان للمشتركين في الكورس بس» also exist in the table.)

### 11.2 The four facts

| icon | value | label |
|---|---|---|
| `ClipboardList` | `questionCount` | `formatCopy(copy.quiz.questionCount,{n})` «{n} سؤال» |
| `Target` | `formatMark(gradeOutOf)` | `formatCopy(copy.quiz.totalMarks,{marks})` «الدرجة الكلية {marks}» |
| `Clock` | `minutes ?? '—'` | `minutes === null ? copy.quiz.noTimeLimit «من غير وقت محدد» : formatCopy(copy.quiz.duration,{minutes})` «مدة الامتحان {minutes} دقيقة» |
| `Repeat2` (accent unless `spent`) | `spent ? '٠' : allowsImprovement ? '٢' : '١'` | `spent ? copy.quiz.noSittingsLeft «مفيش محاولات تانية» : allowsImprovement ? copy.quiz.twoAttempts «محاولة + تحسين» : copy.quiz.singleAttempt «محاولة واحدة»` |

⚠️ The total is `gradeOutOf`, **not** `sumMarks` — the two differ on 150 of 154
quizzes, and `gradeOutOf` is what `ResultHeader`, the attempt rows and `/results`
all divide by.
⚠️ The sittings tile counts what is **left**, not what the quiz allows.

### 11.3 Previous attempts

Header `.group-head` + h2 `copy.quiz.previousAttempts` «محاولاتك السابقة»
+ (when `bestScore !== null`) «{copy.quiz.bestScore} {formatMark(bestScore)}»
(`bestScore` label = «أعلى درجة»).

Per row (`.attempt-row`, `+ --counts` when `showPaper && counts`), where
`showPaper = overview.allowsImprovement`:
- well glyph: `Trophy` when marked as counting, else `ClipboardList`
- title, stretched link:
  `running = state === 'in_progress'` → `attemptHref(lessonId, id)`,
  otherwise `reviewHref(lessonId, id)`;
  text = `showPaper ? copy.quiz.papers[paper] : formatCopy(copy.quiz.attemptNo,{n: attemptNo})`
  «المحاولة رقم {n}»
- meta = `scaledScore === null ? copy.quiz.essayPending «إجابتك المقالية عند المدرّس للتصحيح»
  : formatCopy(copy.quiz.marksEarned,{earned: formatMark(scaledScore), max: formatMark(gradeOutOf)})`
  «{earned} من {max}», plus ` · ` + `copy.quiz.counts` «الدرجة المحتسبة» when marked
- verdict badge when `passed !== null`: `verdict--pass` `copy.quiz.passed` «ناجح»
  or `verdict--fail` `copy.quiz.failed` «محتاجة مراجعة»
- trailing `chip chip--quiet`: `running ? copy.quiz.resume «نكمّل امتحانك»
  : copy.quiz.reviewAnswers «مراجعة الإجابات»`

Link helpers (`apps/web/lib/quiz-links.ts`):
```
quizHref(lessonId)        = /quizzes/{lessonId}
attemptHref(lessonId, id) = /quizzes/{lessonId}/attempt/{id}
reviewHref(lessonId, id)  = /quizzes/{lessonId}/attempt/{id}/review
```

### 11.4 `StartAttemptButton` + `ExamGateDialog`

The button label comes from `paper`, **never** from `attemptsUsed` (an abandoned
sitting makes that count lie):
`improving ? copy.quiz.improveExam «دخول امتحان التحسين» : copy.quiz.start «نبدأ الامتحان»`.
Pressing it opens the gate; **the attempt is only created on confirm.**

Gate — **original paper**:
```
art mark
title       copy.examGate.title  «قبل البداية»
description copy.examGate.intro  «الكلام ده يستاهل دقيقة قراية.»
points:
  Focus       focusTitle    «تركيز في كل سؤال»
              focusBody     «الامتحان بيتفتح مرة واحدة، ومفيش رجوع بعد التسليم.»
  ShieldCheck recordedTitle «درجتك هتتسجّل»
              recordedBody  «النتيجة بتتحفظ في سجلك وبتفضل فيه — مش بتتمسح ولا بتترجع.»
  Repeat2|AlarmClock
              onceTitle     «محاولة واحدة بس»
              allowsImprovement ? onceExamBody
                 «دي محاولتك الأصلية. بعدها فيه محاولة تحسين واحدة، وأعلى درجة هي اللي بتتحسب.»
              : onceBody «الكويز ده ليه محاولة واحدة. حلّه وانت مركّز.»
tail   = the timing line
footer = secondary copy.examGate.cancel «مش دلوقتي» | primary copy.examGate.agree «تمام، نبدأ الامتحان»
```

Gate — **improvement paper**:
```
title       improveTitle «امتحان التحسين»
description improveIntro «قبل الدخول، في حاجتين لازم يكونوا معروفين.»
points:
  Sparkles    improveDifferentTitle «الأسئلة هتكون مختلفة»
              improveDifferentBody  «ده امتحان تاني بأسئلة غير اللي فاتت. مذاكرة الأول، والاعتماد على اللي فات مش هينفع.»
  ShieldCheck improveSafeTitle «درجتك الحالية في أمان»
              improveSafeBody  «أعلى درجة في الاتنين هي اللي بتتحسب. ولو الدرجة طلعت أقل، الأولى هي اللي هتفضل.»
  AlarmClock  focusTitle «تركيز في كل سؤال» + the timing line
tail    = improveOnceBody «ودي فرصتك الوحيدة للتحسين — مفيش محاولة تالتة.»
primary = improveAgree «تمام، نبدأ التحسين»
```
The improvement dialog deliberately does **not** repeat «درجتك هتتسجّل» — without
the safety point that reads as a threat and stops people improving.

Timing line: `durationSeconds ? formatCopy(copy.examGate.timedBody,{minutes: round(sec/60)})`
«الامتحان {minutes} دقيقة من أول دوسة على «نبدأ»، والوقت بيمشي حتى لو الصفحة اتقفلت.»
else `copy.examGate.untimedBody`
«مفيش وقت محدد، بس المحاولة بتفضل مفتوحة لحد ما تتسلّم.»

- Escape and the overlay **do** close it (a gate, not a trap), but the confirm
  button is **not** auto-focused.
- Close (X) label = `copy.common.close` «إغلاق», never `cancel`.

**Confirm →** `POST /api/quiz/quizzes/{quizId}/attempts` body `{ acknowledged: true }`
(recorded on the `attempt_started` event, so "they were told" outlives the dialog)
→ `{ attemptId }` → navigate to `attemptHref`.

On **any** failure the dialog stays open and shows, above the footer, a
`role="alert"` line in `--err`: `copy.quiz.startFailed`
«مقدرناش نبدأ الامتحان دلوقتي. مفيش محاولة اتحرقت خالص — تأكيد على النت ونجرّب تاني.»
The message is never derived from the error (that would put an English HTTP string
in front of a student mid-exam). It is cleared when the dialog closes.

---

## 12. `/quizzes/[lessonId]/attempt/[attemptId]` — THE RUNNER

### 12.1 Chrome

**None.** `isAttemptRoute` matches this exact path and the shell renders the
children bare. A support launcher over a timed exam is one mis-tap from leaving
it, and a channel to a person beside a graded question is an integrity hole.
`…/review` underneath is **not** an attempt and keeps the full shell.

### 12.2 Load — resume on EVERY visit

`POST /api/quiz/attempts/{attemptId}/resume` (no body) → `StartedAttemptSchema`.

There is **no special-cased first visit**: a fresh navigation after Start, a hard
reload, and reopening the tab after a disconnect all call `resume()` and all get
the same snapshotted questions, the same option order, a **rotated attempt token**
(killing whatever tab held the previous one), and the server's current
`deadlineAt` / `serverTime` pair.
A 404 (the helper throws a plain `Error` whose message contains `failed with 404`)
→ `notFound()`.
Stems and option bodies are **sanitized once on the server per page load**, not
per render — this screen used to pay `DOMPurify` N+1 times per keystroke.

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
  nextSeq: number                 // the lowest seq this page may send
  graceSeconds: number
  overdueHandling: 'autosubmit' | 'graceperiod' | 'autoabandon'
  questions: LearnerQuestion[]
}
LearnerQuestion {
  slotPosition: number            // 0-based; DISPLAYED as slotPosition + 1
  questionId: string
  type: 'mcq_single'|'mcq_multi'|'true_false'|'short_answer'|'ordering'|'essay'
  stemHtml: string
  maxMark: number
  options: { id: string, bodyHtml: string }[]
  response: unknown               // the previously saved answer, or null
  flagged: boolean
  answered: boolean
  settings: { minWords?: number, maxWords?: number }
}
```

Answer shape: `{ kind:'choice', optionIds: string[] } | { kind:'text', text: string } | null`.
`toAnswerResponse(value)` accepts only those two and returns `null` otherwise.

### 12.3 Runner state

```
responses  : Record<slotPosition, AnswerResponse|null>   seeded from question.response
flags      : Record<slotPosition, boolean>               seeded from question.flagged
currentSlot: the first question's slotPosition
serverTime : re-anchored from every autosave response
deadlineAt : frozen at load
submitDialogOpen, submitting, leaveDialogOpen
autosave.status : 'idle'|'saving'|'saved'|'error'|'stale'
```
Derived:
```
answeredCount   = slots whose response is not null/undefined
flaggedCount    = true flags
answeredPercent = questions.length ? answeredCount/questions.length*100 : 0
isLast          = currentIndex >= questions.length - 1
```
The bar's meter tracks questions **answered**, not questions visited — walking past
a question you did not answer is not progress.

### 12.4 Layout

```
main (max-w-[var(--w-shell)] px-4 py-8 md:px-6 md:py-10)    ← px-4 on phones
└─ div.runner   (grid, gap 16px; from 64rem: grid-template-columns minmax(0,1fr) 15rem)
   ├─ div.runner__main (flex column, gap 16px)
   │   ├─ div.runner-bar   ⚠️ position:sticky; inset-block-start:0; z-index:20
   │   │   ├─ .runner-bar__progress
   │   │   │   ├─ p.runner-bar__count =
   │   │   │   │    formatCopy(copy.quiz.questionOf,{current: idx+1, total}) «سؤال {current} من {total}»
   │   │   │   │    + " · " +
   │   │   │   │    formatCopy(copy.quiz.answeredCount,{answered,total}) «جاوبت على {answered} من {total}»
   │   │   │   └─ span.runner-bar__meter > span  (transform: scaleX(pct/100),
   │   │   │        transform-origin flipped to `right center` under [dir=rtl])
   │   │   └─ QuizTimer   (the clock stands ALONE on this side)
   │   ├─ div.runner-card → QuestionView
   │   └─ div.runner-foot (flex-wrap, justify-between, gap 12px, border-t, pt 16px)
   │       ├─ navMethod === 'free' ? Button secondary copy.quiz.previous «السابق»
   │       │                          (disabled at index 0)
   │       │                        : <span/>        (sequential hides Previous)
   │       └─ isLast ? [Button primary copy.quiz.submit «تسليم الامتحان»]
   │                 : [Button ghost copy.quiz.submit] + [Button primary copy.quiz.next «التالي»]
   └─ [navMethod === 'free'] aside.runner-nav
       ├─ p.runner-nav__title = copy.quiz.navigator «خريطة الأسئلة»
       ├─ QuestionNavigator
       └─ p.runner-nav__legend = the answeredCount line
            [+ " · " + formatCopy(copy.quiz.flaggedCount,{n}) «{n} سؤال معلّم» when flaggedCount>0]
```

**Exactly one control says «تسليم الامتحان» at a time**: it is the secondary
action until there is no "next" left, and then it becomes the primary one.

**Mobile:** one column, the navigator **below** the card (hence `z-index: 20` on
the sticky bar — `.nav-chip` is positioned and would otherwise scroll over it).
The bar is sticky at `top: 0` with nothing above it because the shell is gone;
budget ~90 px of taken viewport (it wraps, and at the narrowest widths the clock
drops under the meter). `.runner-foot` wraps too — at 320 px the three buttons
need ~300 px in a 288 px card, so the third drops to its own line while every
label stays on one (`whitespace-nowrap` on `Button` + `flex-wrap` here; **neither
half works alone**).
`sequential` nav hides the navigator aside **and** the Previous button.

### 12.5 The clock — `QuizTimer`

`useServerCountdown(deadlineAt, serverTime)`:
- anchors ONCE per `serverTime`: `{ perf: performance.now(), serverMs: Date.parse(serverTime) }`
- ticks every **250 ms**: `now = anchor.serverMs + (performance.now() - anchor.perf)`,
  `remaining = max(0, deadlineMs - now)`
- **the system clock is never read again after the anchor** — a wrong or jumping
  device clock cannot buy or steal time
- every autosave response carries a fresh `serverTime` which **re-anchors** it
- state is committed only when the displayed whole second changes
  (`Math.ceil(ms/1000)`), **except** the zero crossing, committed immediately so
  the autosubmit is never up to a second late
- `deadlineAt === null` ⇒ the component renders nothing at all

Display: `runner-clock`, mono tabular, `AlarmClock` glyph, zero-padded `MM:SS`.
Escalation: `<= 300 s` → `runner-clock--warn`; `<= 60 s` → `runner-clock--critical`.
(Two escalations, not one: a single warning colour that appears with five minutes
left has stopped meaning anything by the time there is one.)

Overdue at zero:
```
overdueHandling === 'graceperiod' && graceSeconds > 0 && grace not yet entered
   → enter grace: a SECOND countdown of graceSeconds from the deadline, always
     rendered --critical, text = formatCopy(copy.quiz.graceRemaining,{seconds})
     «الوقت خلص — فاضل {seconds} ثانية للتسليم.»
     grace hits 0 → onTimeUp()
otherwise → onTimeUp()      (fired exactly once, ref-guarded)
```
`onTimeUp` is the runner's `submitOnce()` — the autosubmit.

**Screen-reader announcements:** the visible clock ticks every second, but
`role="timer"` carries an implicit `aria-live="off"` and must keep it. A separate
visually-hidden `aria-live="polite"` region announces **once** per threshold:

| threshold | copy key | Arabic |
|---|---|---|
| 600 s | `copy.quiz.timeRemaining10Min` | «باقي 10 دقايق على انتهاء وقت الامتحان» |
| 300 s | `copy.quiz.timeRemaining5Min` | «باقي 5 دقايق على انتهاء وقت الامتحان» |
| 60 s | `copy.quiz.timeRemaining1Min` | «باقي دقيقة واحدة على انتهاء وقت الامتحان» |
| 30 s | `copy.quiz.timeRemaining30Sec` | «باقي 30 ثانية على انتهاء وقت الامتحان» |

Each fires at most once for the component's lifetime; the grace countdown drives
the same announcer once it starts.
(`copy.quiz.timeLeft` «الوقت المتبقي», `copy.quiz.timeAlmostUp` «الوقت قرب يخلص»,
`copy.quiz.timeUpTitle` «الوقت خلص», `copy.quiz.timeUpBody` «امتحانك اتسلّم تلقائيًا.»
are also in the table.)

### 12.6 Autosave — `useAttemptAutosave`

```
intervalMs = 15_000        MAX_BACKOFF_MS = 30_000
seqRef starts at initial.nextSeq
dirtyRef : Map<slotPosition, AnswerResponse|null>
```
- `setAnswer(slot, response)` only **marks the slot dirty** — it schedules no
  network call. Ten keystrokes in ten seconds produce ONE request.
- Flush triggers: the 15 s interval, `flushNow()` (question navigation, opening
  the submit dialog, submitting, leaving), `visibilitychange → hidden` (keepalive),
  `pagehide` (keepalive).
- A flush snapshots `[slot, valueAtSendTime]` pairs, increments `seq` on **every
  send attempt including retries** (so a slow earlier reply can never clobber a
  later write), and issues
  `PUT /api/quiz/attempts/{attemptId}/answers` body
  `{ attemptToken, seq, answers: [{ slotPosition, response }] }` →
  `{ savedSlots: number[], serverTime: string, deadlineAt: string|null, answeredCount: number }`.
- Success: clear only the slots this request sent, and only if nothing newer
  overwrote them while in flight; reset backoff to 1000 ms; `status = 'saved'`;
  `onSaved(result)` re-anchors the timer.
- **409 → `status = 'stale'` permanently, no retry ever** — retrying a stale write
  is how a second tab silently loses an hour of work.
- any other failure → `status = 'error'`, retry after `backoff`, then
  `backoff = min(backoff*2, 30_000)`.
- A caller awaiting `flushNow()` while a request is in flight gets **that request's
  promise**, not an immediate resolve. `flushNow()` never rejects.

Status labels (`AUTOSAVE_STATUS_LABEL`), rendered in the question card's footer:

| status | copy key | Arabic |
|---|---|---|
| `idle` | — | `''` |
| `saving` | `copy.quiz.saving` | «بيتحفظ…» |
| `saved` | `copy.quiz.saved` | «اتحفظ» |
| `error` | `copy.quiz.saveFailed` | «مقدرناش نحفظ إجابتك — بنحاول تاني» |
| `stale` | `copy.quiz.staleTab` | «الامتحان ده مفتوح في مكان تاني. تحديث الصفحة عشان نكمّل من هنا.» |

**Stale screen** — the runner replaces the entire paper with a centred block
(`max-w-[var(--w-prose)]`, `py-24`): `copy.quiz.staleTab` + a
`copy.common.retry` «نحاول تاني» button calling `router.refresh()`, and it
**releases the back guard** (there is nothing left to guard).

**Flags do NOT ride the answer autosave** — `SaveAnswersSchema` has no `flagged`
field, and assuming otherwise silently lost every flag on reload.
`setFlag(slot, flagged)` issues its own
`POST /api/quiz/attempts/{attemptId}/flag` body `{ attemptToken, slotPosition, flagged }`
→ `{ flagged: boolean }`, **fire-and-forget**, swallowed on failure (a bookmark
must never interrupt an exam), skipped entirely once stale. Toggling a flag also
calls `flushNow()` for the answers.

### 12.7 Question card — `QuestionView`

Memoised; the runner passes stable props (`useMemo` question, `useCallback` handlers).

```
div (flex column, gap-5)
├─ header row (flex-col items-start gap-3 → sm:flex-row sm:justify-between sm:gap-4)
│   ├─ SafeHtml(stemHtml)  min-w-0 max-w-[var(--w-prose)]
│   └─ Button ghost sm shrink-0, aria-pressed=flagged, accent text when flagged
│        flagged ? copy.quiz.unflag «شيل العلامة» : copy.quiz.flag «علّم السؤال»
├─ ONE of the four input blocks
└─ footer row (justify-between)
    ├─ button (dotted underline, disabled when response === null)
    │      copy.quiz.clearAnswer «مسح إجابتي» → onChange(null)
    └─ p aria-live=polite mono = saveStatus
```
⚠️ The header **stacks below `sm`** — as one row at 360 px both children shrank
and the two-word flag label wrapped outside its own `h-10` box.

| type | control | payload |
|---|---|---|
| `mcq_single`, `true_false` | `RadioGroup`, `value = chosenIds[0] ?? ''` (**never `undefined`** — that makes Radix uncontrolled for life), one `.runner-option` label per option | `{kind:'choice', optionIds:[value]}` |
| `mcq_multi` | one `Checkbox` per option inside `.runner-option` | `nextIds.length ? {kind:'choice', optionIds: nextIds} : null` |
| `ordering` | `OrderingList` — lazily imported (`ssr:false`, ~40–50 KB of dnd-kit); drag **or** move-up/move-down buttons | every move saves the WHOLE sequence `{kind:'choice', optionIds}`. An untouched question stays `null` — the served order is a shuffle, not an answer |
| `short_answer`, `essay` | `Textarea` (`aria-label = copy.quiz.typeAnswer` «إجابتك هنا»; `min-h-56` for essay) + a word counter | `value.length ? {kind:'text', text:value} : null` |

Word counter: `formatCopy(copy.quiz.wordCount,{n})` «{n} كلمة»,
`wordCount(t) = t.trim().length === 0 ? 0 : t.trim().split(/\s+/).length`
(memoised — it is O(n) per keystroke otherwise).

Ordering copy: `orderInstruction` «ترتيب العناصر بالسحب، أو بأزرار التحريك»,
`moveUp` «حرّك لفوق», `moveDown` «حرّك لتحت»,
`movedTo` «{item} — المركز {position} من {total}» (announced),
`orderAllOrNothing` «السؤال ده بيتصحح كامل — الترتيب لازم يبقى مظبوط كله».
Choice hints: `chooseOne` «إجابة واحدة بس», `chooseMany` «كل الإجابات الصحيحة»;
true/false labels `copy.quiz.true` «صح», `copy.quiz.false` «خطأ».

**Options render in the snapshotted server order and are never re-sorted client-side**
— that order is what makes "resume five times, identical option order" true.

`.runner-option`: `flex items-start gap-12px`, padding 12/16 px, hairline border;
`:has(:checked)` → amber border + 8 % amber wash; `:has(:disabled)` → 0.6 opacity
and `cursor: not-allowed`.

### 12.8 `QuestionNavigator`

`nav[aria-label=copy.quiz.navigator]` → `ul.runner-nav__grid` (wrapping flex, 8 px gap).
Per question a button:
- text `String(slotPosition + 1).padStart(2,'0')`
- `aria-label = "{copy.common.question} {slotPosition + 1}"` → «السؤال 3»
- `aria-current="step"` on the current one
- `data-answered="true"|"false"` (a stable handle, not styling)
- roving tabindex: exactly one button is `tabIndex=0`
- **RTL arrow keys are reversed** (WAI-ARIA APG): `ArrowLeft` → next,
  `ArrowRight` → previous, `Home` → first, `End` → last
- classes `.nav-chip`, `+ --current` (amber ring), `+ --answered` (filled surface);
  flagged adds a `.nav-chip__flag` amber dot (`aria-hidden`)
- **four states told apart by weight and fill, never by hue** — no green, no red,
  because this grid is two clicks from a screen where those mean right and wrong
- 44 px below `md`, 36 px from `md`

### 12.9 Navigation & scroll

```
goTo(slot):
  autosave.flushNow()                    // fire-and-forget here
  setCurrentSlot(slot)
  window.scrollTo({ top: 0, behavior: 'auto' })
```
The scroll reset is **required**: changing question is React state, not a route
change, so the router's scroll restoration never fires; on a phone the offset is
500–600 px and «التالي» landed the student mid-options with the stem off screen.
`behavior:'auto'` (not `'smooth'`) so the reduced-motion CSS backstop applies —
a `'smooth'` option bypasses `scroll-behavior` by spec.
`goRelative(delta)` resolves by index and calls `goTo`.

### 12.10 Submit

```
openSubmitDialog(): AWAIT autosave.flushNow(), then open.
   Awaiting is what closes the race with the dialog's own preflight GET; firing
   both in one tick only narrows it, and the preflight frequently won — the
   reported symptom was «لسه فيه 1 سؤال من غير إجابة» on a finished paper.
submit(): AWAIT autosave.flushNow()
          POST /api/quiz/attempts/{attemptId}/submit  { attemptToken } → { attemptId }
          releaseBackGuard()                      ← BEFORE the push
          router.push(reviewHref(lessonId, attemptId))
   catch 409 → toast.info(copy.quiz.alreadySubmitted) «الامتحان ده اتسلّم خلاص.»
               releaseBackGuard(); push to the review anyway
   catch else → toast.error(copy.common.saveFailed)
               «الحفظ فشل — التغييرات اترجعت زي ما كانت»
submitOnce(): guarded by `submitting` so a double tap cannot double-post.
```

`SubmitDialog`:
- on open, `GET /api/quiz/attempts/{attemptId}/preflight` →
  `{ unansweredCount: number, total: number }`. **The headline count always comes
  from the server**, so a failed autosave cannot turn "3 unanswered" into "0".
- body states:
  - loading → `copy.common.loading` «ثانية واحدة…»
  - error → `copy.common.error` «حصلت مشكلة» + a secondary `copy.common.retry`
    «نحاول تاني». **Confirm stays enabled** — a failed preflight must not wedge
    the dialog; the count is advisory and the server recomputes it on submit.
  - `unansweredCount === 0` → `copy.quiz.submitConfirmAllAnswered` «جاوبت على كل الأسئلة.»
  - otherwise → `formatCopy(copy.quiz.submitConfirmUnanswered,{count})`
    «لسه فيه {count} سؤال من غير إجابة.» plus a wrapping list of jump chips built
    from the **client's** own unanswered slots (44 px below `md`, 32 px above;
    tapping one closes the dialog and jumps there — and a mis-tap costs a second
    preflight round trip, which is why they are 44 px)
- title `copy.quiz.submitConfirmTitle` «نسلّم الامتحان؟»,
  description `copy.quiz.submitConfirmBody` «بعد التسليم مش هتقدر تغيّر إجاباتك.»
- footer: **cancel is auto-focused** — `copy.quiz.submitCancel` «الرجوع للأسئلة»;
  confirm `copy.quiz.submitConfirmAction` «أيوه، نسلّم» → `copy.quiz.submitting`
  «بيتسلّم…» while pending. Both labels occupy the same grid cell (the hidden one
  is `invisible`, **not** `opacity-0`, so a screen reader does not read both) —
  the button never changes width under a thumb.
- confirm disabled while `submitting`, or while the preflight is loading and has
  not errored.
- `copy.quiz.unansweredChipLabel` «سؤال {n}» labels a jump chip.

### 12.11 Leaving the attempt

- **Pull-to-refresh is disabled for exactly as long as the runner is mounted**:
  `document.documentElement.style.overscrollBehaviorY = 'contain'` on mount, the
  previous inline value restored on unmount. **Block axis only** — the inline axis
  carries the edge-swipe back gesture, and killing that would delete the gesture
  instead of answering it.
- The back gesture is intercepted by `useBackDismiss(handler, { rearm: true })`.
  It sits **under** any overlay: back with the submit dialog up closes the dialog
  only; back with the paper bare opens the leave dialog; back again closes that
  dialog and leaves the student in the paper.
- `beforeunload` is **not** used — the App Router handles back as a soft
  navigation, so it never fires. It would only cover a hard reload and a closed
  tab, where the attempt survives on the server anyway.
- Leave dialog: `copy.quiz.leaveTitle` «الخروج من الامتحان؟»,
  `copy.quiz.leaveBody` «إجاباتك محفوظة، بس الوقت هيفضل ماشي بره. والرجوع للكمالة من نفس المكان ممكن قبل ما الوقت يخلص.»,
  ghost `copy.quiz.leaveConfirm` «الخروج من الامتحان»,
  **auto-focused** primary `copy.quiz.leaveStay` «نكمّل الامتحان»,
  close (X) `copy.common.close` «إغلاق».
- `leaveAttempt()` = `await flushNow()` → `releaseBackGuard()` →
  `router.replace(quizHref(lessonId))`. A **replace** to the quiz page, never
  history arithmetic (`history.go(-2)` is wrong the moment anything else touches
  the stack, and "wherever they came from" is nothing at all for a cold tab).

### 12.12 Runner state machine

```
                 ┌────────── resume() on every load ──────────┐
   (mount) ──────► in_progress  ──── setAnswer ───► dirty      │
                     │  ▲                │                     │
                     │  └── flush ok ────┘ (status: saved)     │
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
`components/quiz/{result-header,review-locked,review-list,review-question}.tsx`.
Contract `packages/contracts/src/quiz/attempt.ts`.

**Chrome:** the full shell. **Metadata title:** `copy.quiz.reviewTitle` «مراجعة إجاباتك».

**Data:** `GET /api/quiz/attempts/{attemptId}/review`, **never cached** — the window
can flip between two loads and a stale response would show fields the student is
no longer supposed to see. **403 and 404 both → `notFound()`**; anything else
rethrows. (Four ordinary states reach 404: an id that is not theirs, one that no
longer exists, a revoked enrolment, an unpublished lesson. Rendering the generic
error boundary there also poisoned the admin error log with fake outages.)

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
  // information. BRANCH ON PRESENCE.
  response?: unknown
  correctness?: 'correct'|'partial'|'incorrect'|'needsGrading'|'unanswered'
  mark?: number | null
  maxMark?: number
  feedbackHtml?: string
  generalFeedbackHtml?: string
  rightAnswerText?: string          // display prose only, NEVER parsed
  rightAnswerOptionIds?: string[]   // choice types only — drives the highlight
}
```
⚠️ A **locked** review returns no `questions` array at all — not even an empty one,
because a length leaks the question count.

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
`copy.quiz.reviewLocked` «المراجعة مش متاحة دلوقتي», then
`during` → `copy.quiz.reviewLockedDuringBody` «هتقدر تراجع إجاباتك بعد ما تسلّم المحاولة.»
or `awaitingClose` → `copy.quiz.reviewLockedUntilClose` «هتقدر تراجع إجاباتك بعد ما الامتحان يقفل.»
**No question list of any kind.**

### 13.3 `ResultHeader`

```
div (rounded-lg, border, bg-surface-2, p-5, flex column gap-3)
├─ p.eyebrow = copy.quiz.resultsTitle «نتيجتك»
├─ row (items-baseline, gap-3)
│   ├─ p.mono --fs-title-1 tabular =
│   │     (scaledScore === null ? '—' : formatMark(scaledScore))
│   │     + <span muted> / {gradeOutOf}</span>
│   └─ [passed !== null] Badge tone=ok|err =
│         copy.quiz.passed «ناجح» | copy.quiz.failed «محتاجة مراجعة»
├─ p.mono = formatCopy(copy.quiz.passMark,{percent: passPercent}) «درجة النجاح {percent}%»
└─ needsGrading ? copy.quiz.essayPending «إجابتك المقالية عند المدرّس للتصحيح»
                : band ?? nothing
```
`band` — `null` when `passed === null` **or** `needsGrading`:
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
canFilter = gradeable.length > 0      // false in a window that withholds correctness
shown     = wrongOnly ? wrong : questions
```
Header row (only when `canFilter`):
- left: `wrong.length === 0 ? copy.quiz.allCorrect «مفيش ولا غلطة — ورقة كاملة»
  : formatCopy(copy.quiz.wrongCount,{n: wrong.length, total: gradeable.length})` «{n} غلط من {total}»
- right: when `wrong.length > 0`, a two-button group
  (`role="group" aria-label = copy.quiz.reviewTitle`) with `aria-pressed`:
  `ListChecks` + `copy.quiz.showAll` «كل الأسئلة» and
  `XCircle` + `copy.quiz.wrongOnly` «الغلطات بس».
  When `wrong.length === 0` a `verdict--pass` chip with `CheckCircle2` +
  `copy.quiz.passed` «ناجح» instead — a filter whose only outcome is an empty
  screen is not shipped.

The filter is purely client-side and **cannot reveal anything** — the server has
already omitted every field the window forbids.

### 13.5 `ReviewQuestion`

```
div[data-correctness={correctness}] (rounded-lg, border, bg-surface-2, p-5, gap-4)
├─ head row
│   ├─ p.mono = String(slotPosition+1).padStart(2,'0')
│   └─ right: [mark !== undefined && maxMark !== undefined] mono «{mark ?? '—'} / {maxMark}»
│             [correctness] p font-medium in CORRECTNESS_TONE = CORRECTNESS_LABEL
├─ SafeHtml(stemHtml)
├─ body by type
├─ [feedbackHtml] label copy.quiz.questionFeedback «ملاحظة على إجابتك» + SafeHtml
└─ [generalFeedbackHtml] label copy.quiz.explanation «الشرح» + SafeHtml
```

| correctness | copy key | Arabic | tone |
|---|---|---|---|
| `correct` | `copy.quiz.correct` | «إجابة صحيحة» | `text-ok` |
| `partial` | `copy.quiz.partial` | «إجابة صح جزئيًا» | `text-fg` |
| `incorrect` | `copy.quiz.incorrect` | «إجابة خاطئة» | `text-err` |
| `needsGrading` | `copy.quiz.needsGrading` | «محتاج تصحيح من المدرّس» | `text-fg-muted` |
| `unanswered` | `copy.quiz.notAnswered` | «مجاوبتش» | `text-fg-muted` |

**Choice types** (`mcq_single`, `mcq_multi`, `true_false`) — one row per option:
```
correctIds      = new Set(rightAnswerOptionIds ?? [])   ← ID MEMBERSHIP, never a string split
isChosen        = response.optionIds.includes(option.id)
isCorrectOption = correctIds.has(option.id)
isWrongChosen   = isChosen && !isCorrectOption && correctness === 'incorrect'

border/background:
  isCorrectOption → border-ok  + 8% ok wash
  isWrongChosen   → border-err + 8% err wash
  isChosen        → border-accent
  else            → border-line-subtle

second channel (colour is NEVER the only signal — WCAG 1.4.1):
  isCorrectOption → CheckGlyph + copy.quiz.rightAnswer «الإجابة الصحيحة»  (ok)
  isWrongChosen   → CrossGlyph + copy.quiz.yourAnswer  «إجابتك»            (err)
  isChosen        → plain muted copy.quiz.yourAnswer   «إجابتك»
```

**Ordering** — two numbered lists side by side (`flex-col sm:flex-row`), never
per-option highlights (an item can be in the right place in a wrong order):
- `copy.quiz.yourOrder` «ترتيبك» — the student's `optionIds` in order; each row is
  marked in place / out of place by **position** (`correctIds[index] === option.id`)
  with a `CheckGlyph`/`CrossGlyph` and an ok/err border.
  Empty → `copy.quiz.notAnswered` «مجاوبتش».
- `copy.quiz.rightOrder` «الترتيب الصحيح» — `rightAnswerOptionIds` in order,
  `tone='ok'`; rendered only when that array is present and non-empty.
- The student's own order is shown even when it is correct.

**Text types** (`short_answer`, `essay`):
- `[response !== undefined]` label `copy.quiz.yourAnswer` «إجابتك» + the text
  (`whitespace-pre-wrap wrap-anywhere`), or `copy.quiz.notAnswered` when empty.
- `[rightAnswerText]` label `copy.quiz.rightAnswer` «الإجابة الصحيحة» + the text
  **as plain text, never HTML** — a short-answer pattern may legitimately contain
  `<` and `>` and is deliberately never sanitized.

`copy.quiz.answerListSeparator` «، » is used only to JOIN display prose. It must
**never** be used to split `rightAnswerText` back apart — an option body can
contain the same ordinary Arabic list comma, which highlighted the wrong option.
`copy.quiz.checkAnswer` «عرض الإجابة» exists in the table for a practice affordance.

---

## 14. `/results` — «نتائجي»

`apps/web/app/(app)/results/page.tsx`.

**Data:** one read, `GET /api/me/quizzes` → `StudentQuizHistorySchema`
(`packages/contracts/src/quiz/history.ts`):
```ts
{
  summary: {
    quizzesTaken: int        // distinct quizzes with ≥1 submitted attempt
    attemptsTotal: int
    averagePercent: 0..100 | null   // mean over ATTEMPTS ("how do I score when I sit one")
    bestPercent: 0..100 | null
    passedCount: int                // counted over QUIZZES, keyed on each BEST attempt
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
Every average/best is nullable rather than 0 — a student with no graded attempt has
no average, and «٠٪» tells them they scored nothing.

Header (both states):
```
header.mb-6
  p.eyebrow = copy.results.eyebrow «03 / نتائجي»
  h1        = copy.results.title   «نتائجي»
  p         = copy.results.subtitle «كل امتحان دخلته، درجتك فيه، وإزاي بتتحسّن مع الوقت.»
```

**Empty (`quizzes.length === 0`):** `.empty` + `SpotIllustration('scores')`
+ `copy.results.emptyTitle` «لسه مدخلتش أي امتحان»
+ `copy.results.emptyBody` «كل درس وراه امتحان قصير. أول ما واحد يخلص، درجتك ومراجعة إجاباتك هيبانوا هنا.»
+ `chip chip--solid` → `/path`, `copy.results.emptyCta` «مسارك».

**Populated:**
```
main (max-w-[var(--w-app)] px-4 py-8 md:px-6 md:py-10)
├─ Header
├─ section.grid.grid-cols-2.gap-3 sm:gap-4 lg:grid-cols-4     ← 2-up on phones
│   ├─ ClipboardList summary.quizzesTaken  copy.results.statQuizzes  «امتحانات دخلتها»  hue 225
│   ├─ Repeat2       summary.attemptsTotal copy.results.statAttempts «عدد محاولاتك»     hue 165
│   ├─ Target        summary.averagePercent ?? copy.results.noneYet «لسه»
│   │                suffix '%' unless null  copy.results.statAverage «متوسط درجاتك»  hue 295
│   └─ Award         summary.passedCount  suffix «/ {quizzesTaken}»
│                    copy.results.statPassed «امتحانات نجحت فيها»
│                    meterPercent = passedCount/quizzesTaken*100, accent
├─ [series.length > 1] section → ScoreTrend(series)
└─ section
    h2 = copy.results.quizzesTitle «كل امتحان على حدة»
    ul (rounded-lg, border, bg-surface-2) → QuizResultRow per row
```
`ScoreTrend` renders from **two** points up. Copy: `copy.results.trendTitle`
«درجاتك مع الوقت», `trendSummary` «رسم بياني لـ{count} محاولة، من {first}% لحد {last}%.»,
`trendPassLine` «خط النجاح», `trendLegendPassed` «محاولة عدّيتها»,
`trendLegendFailed` «محاولة ماعدّتش».
`QuizResultRow` copy: `copy.results.best` «أعلى درجة», `latest` «آخر محاولة»,
`attemptsUsed` «محاولاتك», `attemptsOf` «{used} من {max}», `attemptsUnlimited` «من غير حد»,
plus `copy.results.statBest` «أعلى درجة». It links to
`reviewHref(lessonId, latestAttemptId)` and offers `copy.quiz.improveExam`
«دخول امتحان التحسين» when `allowsImprovement && !improvementUsed`.

The same four hues appear in the same order as on the dashboard's tile row — a
student meets both in one session and two colour orders read as two products.

---

## 15. Notifications

### 15.1 Endpoints

| method + path | shape |
|---|---|
| `GET /api/me/notifications` (optional `?cursor=`) | `{ entries: Notification[], nextCursor: string|null }` |
| `GET /api/me/notifications/unread-count` | `{ unread: int >= 0 }` |
| `POST /api/me/notifications/{id}/read` | 204 |
| `POST /api/me/notifications/read-all` | 204 |
| `GET /api/me/notifications/stream` | **SSE**, one connection per tab |
| `GET /api/me/push/public-key`, `POST /api/me/push/subscribe`, `POST /api/me/push/unsubscribe` | Web Push |

### 15.2 Kinds

Discriminated on `kind`; every entry carries `id: string`, `createdAt: ISO`,
`readAt: ISO | null` (`packages/contracts/src/notifications.ts`).

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
(`apps/web/lib/notification-view.ts`), and icons come from `iconFor(entry)`.

| kind | title | detail | subtitle | href | icon |
|---|---|---|---|---|---|
| `quiz_graded` | «اتصحّحت ورقتك — الدرجة {score}%» | `passed===null` → null; true → «نجحت»; false → «محتاجة مراجعة» | `lessonTitle` | `reviewHref(lessonId, attemptId)` | `ClipboardCheck` |
| `extra_attempt_granted` | «المدرّس دّالك محاولة زيادة في الامتحان ده» | — | `lessonTitle` | `/quizzes/{lessonId}` (never a new attempt — starting a graded exam is not something a link does) | `BadgeCheck` |
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
| `homework_reviewed` | accepted → «واجب {lesson} اتقبل ✅»; else «واجب {lesson} فيه ملاحظات» | accepted+grade → «الدرجة {grade} من 100»; accepted → «مهندس أيمن راجع الحل وكتب لك رد.»; needs_work → «مهندس أيمن كتب لك رد، والواجب مفتوح تاني.» | `lessonTitle` | `/courses/{courseSlug}/lessons/{lessonId}` | `NotebookPen` |
| `payment_submitted` | «اشتراك جديد مستني مراجعة — {name}» | — | `courseTitle` | `/admin/payments` | `Wallet` |
| `book_order_placed` | «طلب كتاب جديد مدفوع — {name}» | — | «طلبات الكتب» | `/admin/books` | `PackageOpen` |
| `assistant_question_received` | «سؤال جديد مستني رد — {name}» | `preview` or null | «صندوق الوارد» | `/admin/inbox/{conversationId}` | `MessageCircleQuestion` |
| `homework_submitted` | «واجب جديد من {name}» | «الحل مستني مراجعة» | `lessonTitle` | `/admin/homework/{submissionId}` | `NotebookPen` |

`instructor_message` lead-ins by `outreachKind` (unknown kinds fall back to
`copy.notifications.instructorMessage` «مهندس أيمن بعتلك رسالة» — a message from
the instructor is the last thing this feed should swallow):
`quiz_result` → «مهندس أيمن شاف نتيجتك»; `quiz_nudge` → «مهندس أيمن فاكرك بالكويز»;
`lesson_praise` → «مهندس أيمن بعتلك كلمتين»;
`whatsapp_invite` → «مهندس أيمن عازمك على جروب الواتساب».

`formatNotificationTime(iso)` is an **absolute** date/time
(`ar-EG-u-nu-latn`, `dateStyle: medium`, `timeStyle: short`). Relative time was
tried and rejected — it is impure during render and stale the moment it is painted.

### 15.4 `/notifications`

```
main (max-w-[var(--w-prose)] px-4 py-8 md:px-6 md:py-10)
├─ header
│   p.eyebrow = copy.notifications.eyebrow «05 / الإشعارات»
│   h1        = copy.notifications.title   «الإشعارات»
│   p         = copy.notifications.subtitle «كل حاجة حصلت في حسابك وتستاهل المعرفة.»
└─ NotificationList(initialEntries, initialCursor)
```
Server-rendered first page from `GET /api/me/notifications`.

`NotificationList`:
- **Empty:** a dashed panel — `copy.notifications.empty` «مفيش إشعارات لسه.»
  + `copy.notifications.emptyHint` «أول ما تتصحّح لك ورقة أو يتردّ على تظلّم، هتلاقيه هنا.»
- **Mark-all row** (only when some entry is unread): a text button
  `copy.notifications.markAllRead` «علّم الكل كمقروء» /
  `copy.notifications.markingAll` «بنعلّم…». **Optimistic** — every entry gets
  `readAt = now` immediately, then `POST /api/me/notifications/read-all`.
  `min-h-11 md:min-h-0`.
- **Rows** are real `<Link>`s (long-press / open-in-new-tab work):
  ```
  li (border-b)
   └ Link href=view.href
     onClick: if unread → set readAt optimistically and POST …/{id}/read
              (navigation is NOT blocked on the write)
      ├ 32px rounded icon well (aria-hidden)
      ├ column: title (--fs-text-sm medium) / [detail] / subtitle (truncate, muted)
      └ time (mono)
         unread → text-fg   ⚠️ FULL strength, not muted: the row's amber tint makes
                            both --fg-faint (3.83:1) and --fg-muted (3.39:1) fail
         read   → text-fg-faint
  unread row background = color-mix(in oklch, var(--a-9), var(--n-2) 95%)
  ```
- **Load more:** `GET /api/me/notifications?cursor={nextCursor}`, appends;
  on failure it **keeps what is on screen** and shows `copy.notifications.failed`
  «مقدرناش نجيب الإشعارات. نحاول تاني.». Button `copy.notifications.more` «أقدم».

### 15.5 The bell

`NotificationBell` (server) reads **only** the count so the badge is right on first
paint without a tap. The panel's rows are fetched **on open, every open** — a list
a student opens precisely because they suspect it changed must not be a cached
copy; whatever is already on screen stays while the read is in flight.

- badge: hidden at 0 (a permanent zero trains people to ignore the bell);
  `min-w-[18px]` amber pill, `#1A1206` ink, `9+` above 9, `aria-hidden`
- trigger `aria-label`: `count > 0 ? formatCopy(copy.notifications.bellWithUnread,{n})`
  «الإشعارات — {n} جديدة» : `copy.notifications.bell` «الإشعارات»
- panel width `min(22rem, 100vw - 2rem)`; header
  `copy.notifications.panelTitle` «الإشعارات» + the same mark-all button
- rows: `PANEL_SIZE = 8`; each is a `<button>` that closes the panel, **navigates
  first**, then marks read in the background. Unread dot = an 8 px amber circle,
  `aria-hidden`. They are a plain list, **not** `DropdownMenuItem`s — Radix menu
  semantics would announce a list of commands where the student is looking at a
  list of things that happened.
- first-ever open placeholder: `role="status" sr-only` = `copy.notifications.loading`
  «بنجيب…» + three shimmering skeleton rows
- empty panel: `copy.notifications.empty` + `copy.notifications.emptyHint`
- failure: `role="alert"` in `--err` = `copy.notifications.failed`
- footer link `/notifications` = `copy.notifications.seeAll` «الكل»

### 15.6 The live stream

`NotificationStreamProvider` wraps the **whole shell**, not just the bell — one
`EventSource` on `GET /api/me/notifications/stream` per open tab. Per event:
1. the badge number is **replaced** (the payload carries an absolute count, so a
   tab that slept through ten events converges on the first one it sees);
2. a toast, for the tab actually being looked at (action label
   `copy.notifications.liveOpen` «افتح»);
3. an OS notification for a tab that is not, gated on `Notification.permission`.

It deliberately does **not** call `router.refresh()` — that would re-run every
server component on the page for an event whose whole payload is already in hand.
`useLiveUnread()` returns `null` until the first event; the badge is
`live ?? serverRenderedCount`.

**Mobile equivalent:** replace SSE + Web Push with FCM/APNs. The payload must keep
carrying the **absolute** unread count so the badge converges the same way.

---

## 16. `/profile` — «بروفايلي»

`apps/web/app/(app)/profile/page.tsx`, `components/profile/*`,
`components/settings/devices-list.tsx`.

The page function is **synchronous**; five independent `<Suspense>` boundaries
stream on their own so a slow chart never holds up the avatar.

```
main (max-w-[var(--w-app)] px-4 py-8 md:px-6 md:py-10)
├─ header
│   p.eyebrow = copy.profile.eyebrow «04 / بروفايلي»
│   h1        = copy.profile.title   «بروفايلي»
│   p         = copy.profile.subtitle «بياناتك، اللي حصّلته، والأجهزة اللي حسابك مفتوح عليها.»
├─ Suspense(IdentitySkeleton) → Identity
├─ section  h2 = copy.profile.earnedTitle «اللي حصّلته»
│   Suspense(TotalsSkeleton) → Totals
├─ section  h2 = copy.profile.chartsTitle «أرقامك»
│            p = copy.profile.chartsSubtitle «درجاتك في كل اختبار خلّصته، ومسارها مع الوقت.»
│   Suspense(ChartsSkeleton) → Charts
└─ div.grid.gap-8.grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_22rem]
   ├─ section  h2 = copy.profile.activityTitle «سجل نشاطك»
   │            p = copy.profile.activitySubtitle «كل حاجة عملتها، بالترتيب.»
   │   Suspense(ActivitySkeleton) → ActivityFeed
   └─ aside    h2 = copy.profile.devicesTitle «أجهزتك»
                p = copy.profile.devicesSubtitle «لو فيه جهاز مش بتاعك، اقفله من هنا.»
       DevicesList (client, owns its own fetch — the list is mutable from the page)
```
⚠️ `grid-cols-[minmax(0,1fr)]` at phone width too — without it the activity row's
`truncate` title contributes its full min-content (measured 505 px in a 380 px
container) and the whole lower half sits off the inline start.

### 16.1 `Identity`

Parallel: session, `GET /api/profile/me`, `getTaxonomyOrNull()`.
```
section.panel
├─ AvatarForm(name, image)
└─ dl.grid.gap-4.sm:grid-cols-2.lg:grid-cols-4  (border-t, pt-5)
   ├─ copy.profile.fieldPhone       «رقم الموبايل» ← profile.phone   (dir=ltr)
   ├─ copy.profile.fieldSchool      «المدرسة»      ← profile.schoolName
   ├─ copy.profile.fieldGovernorate «المحافظة»     ← taxonomy lookup by governorateCode
   └─ copy.profile.fieldYear        «الصف»         ← identityOf(me, taxonomy).yearLabelAr
   null → copy.profile.fieldNotSet «مش متسجّل» in text-fg-faint
Link /settings/section (outlined, min-h-11) = copy.profile.fieldsEdit «عدّل بياناتك»
```
⚠️ `/api/profile/me` returns the raw row — the governorate is a two-character CODE
and the year a bare integer. Rendered straight they read "01" and "2".
⚠️ The year label MUST come from the taxonomy (`identityOf`), not a local 1/2/3
table — a local table printed «الصف الثاني الثانوي» while `/library` and the
dashboard printed «الصف الثاني بكالوريا» about the same student.
A `null` taxonomy degrades to «مش متسجّل», never to an error.

**`AvatarForm`:** title `copy.profile.photoTitle` «صورتك», hint
`copy.profile.photoHint` «PNG أو JPG، لحد ٢ ميجا. هنقصّها مربّعة تلقائيًا.»,
button `copy.profile.photoChange` «تغيير صورتك» / `photoUploading` «بنرفع الصورة…».
Upload goes **browser → `POST /api/profile/avatar`** (multipart) directly.
⚠️ It must never go through a Server Action: those buffer and cap at 1 MB while
`MAX_AVATAR_BYTES = 2 MiB`, so every 1–2 MB phone photo failed silently.
Success → `toast.success(copy.profile.photoDone)` «اتغيّرت صورتك» then
`refreshAvatarAction()` (revalidates `/profile` and re-renders the dynamic tree so
the topbar avatar updates).
Failures: `tooLarge` → `copy.profile.photoTooLarge`
«الصورة أكبر من ٢ ميجا. صغّرها وجرّب تاني.»; `badType`/`unreadable` →
`copy.profile.photoWrongType` «ده مش ملف صورة. المطلوب PNG أو JPG.»;
else `copy.profile.photoFailed` «مقدرناش نرفع الصورة. نجرّب صورة تانية.»

### 16.2 `Totals`

`getDashboard()` + `GET /api/me/quizzes`. Four `StatTile`s
(`grid-cols-2 … lg:grid-cols-4`):

| icon | value | suffix | label | meter | hue |
|---|---|---|---|---|---|
| `Layers` | `completedLessons` | `/ {totalLessons}` when > 0 | `copy.profile.statLessons` «دروس خلصتها» | `completed/total*100` | 165 |
| `Award` | `summary.passedCount` | `/ {quizzesTaken}` | `copy.profile.statQuizzesPassed` «امتحانات نجحت فيها» | `passed/taken*100` | accent |
| `Target` | `summary.averagePercent ?? copy.profile.noneYet «لسه»` | `%` unless null | `copy.profile.statAverage` «متوسط درجاتك» | — | 295 |
| `Clock` | watch time (own nested Suspense) | `س` at ≥ 60 min, else `د` | `copy.profile.statWatchTime` «وقت المذاكرة» | — | 225 |

⚠️ Watch time is summed from the **first page of the activity feed**
(`getActivity()`, one shared `cache()`d promise), not from `lesson_progress`, so
the figure and the timeline under it are derived from the same rows. It is study
time over that window, not all-time history.

### 16.3 `Charts`

`GET /api/me/quizzes` in its own boundary (the slowest read here).
- `series.length === 0` → dashed panel `copy.profile.chartsEmpty`
  «أول اختبار يخلص هتلاقي درجتك هنا مرسومة.»
- else `grid gap-5 lg:grid-cols-2`: `[series.length > 1] ScoreTrend(series)`
  and `QuizScoreBars(quizzes)`.
  Bars copy: `copy.profile.scoresTitle` «درجاتك في كل اختبار»,
  `scoresBest` «أحسن محاولة», `scoresBarLabel` «{quiz}: {percent}٪».

### 16.4 `ActivityFeed`

First page server-rendered; "load more" client-side.
`GET /api/me/activity` (`?cursor=`) → `ActivityFeedSchema`
(`packages/contracts/src/activity.ts`):
```ts
{ entries: ActivityEntry[], nextCursor: string | null }
base      { id, occurredAt: ISO, lessonId, lessonTitle, courseTitle, courseSlug }
watched   { kind:'watched',   secondsWatched: int }
completed { kind:'completed', completedVia: 'auto'|'manual'|'dwell' | null }
quiz      { kind:'quiz', attemptId, attemptNo: int>=1,
            scorePercent: 0..100, passed: boolean|null }
```
Row text:
- `watched` → `formatCopy(copy.profile.activityWatched,{duration})` «شُفت الدرس لمدة {duration}»
- `completed` → `copy.profile.activityCompleted` «الدرس خلص», plus ` — ` +
  `activityViaAuto` «تلقائيًا» / `activityViaManual` «بنفسك» /
  `activityViaDwell` «بعد قراية الدرس» when `completedVia` is non-null
- `quiz` → `formatCopy(copy.profile.activityQuiz,{score})` «امتحان بدرجة {score}%»
  (`copy.profile.activityAttemptNo` «المحاولة {n}» is available for the number)

Empty: `copy.profile.activityEmpty` «أول ما درس يتفتح أو امتحان يتقدّم، الحركة بتبان هنا.»
Load-more: `copy.profile.activityMore` «أقدم» / `activityLoading` «بنجيب…»;
failure `copy.profile.activityFailed` «مقدرناش نجيب باقي السجل. نحاول تاني.»
Timestamps use the same absolute `ar-EG-u-nu-latn` formatter.

---

## 17. Settings

### 17.1 `/settings/section` — «بياناتك»

`apps/web/app/(app)/settings/section/page.tsx`,
`apps/web/components/settings/profile-form.tsx`.

**Data:** `getTaxonomyOrNull()` + `GET /api/profile/me`, in parallel.
`if (!me.profile) redirect('/onboarding')` — `PATCH /profile/section` 404s without
a profile, and the wizard is the right place to make one.

```
main (max-w-2xl px-6 py-10 md:py-12)
├─ header
│   p.eyebrow = copy.section.eyebrow «الإعدادات»
│   h1        = copy.section.title   «بياناتك»
│   p         = copy.section.subtitle «عدّل أي حاجة فيهم وقت ما تحب — الكورسات اللي تظهرلك بتمشي مع صفّك ومدرستك.»
├─ taxonomy === null ? TaxonomyUnavailable : ProfileForm
└─ Link /library = copy.section.back «رجوع للكورسات»
```

**TaxonomyUnavailable:** a `.panel` with `copy.section.unavailableTitle`
«مش قادرين نجيب قايمة الصفوف دلوقتي» + `copy.section.unavailableBody`
«مشكلة مؤقتة عندنا. صفّك الحالي وكل تقدمك زي ما هما ومحصلّهمش حاجة — نجرّب تاني بعد شوية.»
+ a **full document reload** `<a href="/settings/section">` labelled
`copy.common.retry` «نحاول تاني», `min-h-11`.
(Unlike `/library` and `/profile`, this page cannot drop a label on a null — the
year `<select>` IS the page.)

**`ProfileForm`** — three groups, all prefilled:

| group heading | fields |
|---|---|
| `copy.section.groupPersonal` «بياناتك الشخصية» | `fullName`, `gender`, `phone` (**readOnly**), `fatherPhone` |
| `copy.section.groupSchool` «مدرستك» | `governorateCode`, `schoolName`, `schoolStream` |
| `copy.section.groupSection` «صفّك الدراسي» | `year`, then `FixedSectionNote`, then the reassurance panel |

Field labels/placeholders are reused from `copy.onboarding` (§3.2 table).

- `phone` is **`readOnly`, not `disabled`** — a disabled input is skipped by
  screen readers and cannot be selected. Under it: `copy.section.phoneLocked`
  «ده رقمك اللي بتدخل بيه، ومش بيتغيّر من هنا. لو محتاج تغيّره كلّمنا على واتساب.»
- `FixedSectionNote` states the three fixed answers:
  `copy.onboarding.fixedSectionTitle` «الباقي إحنا عارفينه»,
  `fixedSystem` «البكالوريا المصرية», `fixedTrack` «مسار الهندسة وعلوم الحاسب»,
  `fixedSubject` «البرمجة وعلوم الحاسب», hint `fixedSectionHint`
  «المنصّة دي للبكالوريا بس، ولمادة البرمجة تحديدًا — فمش هنسألك على نظام ولا مسار ولا مادة.»
- reassurance: `copy.section.keepsProgress`
  «تقدمك محفوظ. ولو الرجوع للصف القديم حصل، هتلاقي كل اللي خلص ودرجاتك زي ما هي.»
- Submit → **`PATCH /api/profile/onboarding`** (the same whole-set upsert the
  wizard uses; a field left out would blank a column the student never touched).
  Button `copy.section.save` «حفظ» / `copy.section.saving` «جارٍ الحفظ…»;
  success toast `copy.section.saved` «اتحفظت بياناتك.»;
  409 → `copy.onboarding.phoneConflictError` «رقمك ده متسجّل على حساب تاني»;
  anything else → `copy.section.saveFailed` «مقدرناش نحفظ التغيير. نحاول تاني.»
  (`role="alert"`, `--err`).

`PATCH /api/profile/section` still exists (`StudentSectionSchema`:
`{ system?, year, trackId?, electiveSubjectId? }`, `.strict()`) — it is the
narrower endpoint and is **not** what this form uses.

### 17.2 `/settings/devices` — «أجهزتي»

```
main (max-w-2xl px-6 py-16)
  h1 = copy.settings.devices.title    «أجهزتي»
  p  = copy.settings.devices.subtitle «الأجهزة اللي حسابك مفتوح عليها دلوقتي. لو فيه جهاز مش بتاعك، اقفله من هنا.»
  DevicesList
```

`GET /api/sessions` → `SessionDeviceListSchema`:
```ts
SessionDevice { id, deviceName, deviceType: string, ip: string | null,
                lastSeenAt: string, loggedInAt: string, isCurrent: boolean }
```
States:
- loading → two 80 px skeleton bars
- error → `<p>` in `--err` = `copy.common.error` «حصلت مشكلة»
- empty → `copy.settings.devices.empty` «مفيش أجهزة مفتوحة دلوقتي»
- rows: a `Card` each
  ```
  CardBody (flex-col items-start gap-3 → sm:flex-row sm:items-start sm:justify-between)
   ├─ column
   │   ├─ flex-wrap row: deviceName (truncate, medium)
   │   │        + [isCurrent] Badge tone=accent = copy.settings.devices.current «الجهاز الحالي»
   │   ├─ mono: copy.settings.devices.loggedInAt «دخل في» + formatted loggedInAt
   │   └─ mono: copy.settings.devices.lastSeenAt «آخر نشاط» + formatted lastSeenAt
   └─ Button variant=danger size=sm, w-full below sm, whitespace-nowrap
        copy.settings.devices.revoke «قفل الجهاز» / revokePending «جارٍ القفل…»
  ```
- Revoking the **current** device first confirms:
  `copy.settings.devices.revokeCurrentConfirm`
  «ده الجهاز اللي إنت عليه دلوقتي — لو قفلته هيتسجّل خروجك فورًا. تمام؟»
- `DELETE /api/sessions/{id}`. If it was the current device →
  `router.replace('/login')`; otherwise the row is removed from local state.
  A failure flips the list into the error state
  (`copy.settings.devices.revokeError` «مقدرناش نقفل الجهاز. نحاول تاني.» is the
  string kept for it).

The same `DevicesList` is embedded in `/profile`'s 22 rem aside — hence the
stack-below-`sm` layout.

---

## 18. `/foundations` — «التأسيس»

`apps/web/app/(app)/foundations/page.tsx`, `apps/web/lib/essentials-terms.ts`,
`apps/web/lib/foundation-courses.ts`.

The same twelve definitions as the public `/essentials`, different reader: no
liquid hero, no WARM-UP badge, no closing «نختار صفّك».
**No search box, no filter, no client component** — twelve items fit one screen
and are a `⌘F` away everywhere else.

**Data:** `getCatalogOrEmpty()` → `foundationCourses(courses)`. An unreachable API
costs this screen its course strip, never its glossary.

```
main (max-w-[var(--w-app)] px-6 py-10 md:py-12)
├─ header
│   p.eyebrow = copy.essentials.appEyebrow
│   h1        = copy.essentials.appTitle
│   p         = copy.essentials.appSubtitle
├─ [foundation.length] section
│   p.eyebrow = copy.essentials.courseBadge
│   ul.grid.gap-4 lg:grid-cols-2 2xl:grid-cols-3
│     └─ Link /library/{slug}  (.panel, horizontal card)
│        128px 16/9 CourseArt + title (truncate)
│        + mono «{lessonCount} {copy.catalog.lessonCount} · {formatDuration(totalSeconds)}»
└─ ul.grid.gap-4 sm:grid-cols-2 xl:grid-cols-3      ← 1-up on phones, 2-up from sm
   └─ li.panel per ESSENTIAL_TERM
      ├─ row: span dir="ltr" mono accent = term.en
      │        (a CODE token — «Input / Output» reorders around the slash without it)
      │       span mono tabular muted = String(index+1).padStart(2,'0')
      ├─ h2 (--fs-title-4 medium) = term.ar
      └─ p (--fs-text-sm muted)   = term.body
```
The course link goes to **`/library/{slug}`**, not `/courses/{slug}` — this reader
is already inside the shell, and that route renders for a non-enrolled student too.

---

## 19. `/store` and `/store/orders`

### 19.1 `/store` — «الكتب» inside the shell

`apps/web/app/(app)/store/page.tsx`, `store.css`, plus
`apps/web/app/(site)/styles/books.css` and `components/site/books-shop.tsx`.

`/books` (public, indexed, marketing chrome) and `/store` (same shop, student
shell) are two URLs for one component — a route group is not a URL segment, so
they cannot be one route. **A mobile app only needs this one.**
`/store` is `noindex` by inheritance, so there is no duplicate-content question.

**Data:** `getBookCatalogOrEmpty()` + `getPublicSettingsOrDefaults()` — both cached
and both non-throwing.

```
main (max-w-[var(--w-app)] px-4 py-8 md:px-6 md:py-10)
├─ header.study-head              (NOT the marketing .books-hero — the topbar is
│   p.eyebrow = copy.books.badge     already the top of the screen, and every other
│               «كتب المنهج»          shell route opens with this exact object)
│   h1        = copy.books.pageTitle «الكتب»
│   p.lead    = copy.books.lead      «اختار الكتب اللي محتاجها، حدد العدد، وابعت طلبك — والباقي علينا.»
└─ div.store-surface
   ├─ BooksShippingChip(shippingCents)
   │    copy.books.shippingOnce «الشحن {price} مرة واحدة على الطلب كله — مهما كان عدد الكتب»
   │    or copy.books.shippingFreeOnce «التوصيل مجانًا — السعر شامل الشحن لحد باب البيت»
   └─ BooksShop(catalog, instapay)
```

`BooksShop` vocabulary (`copy.books`): shelves grouped by subject then term —
`termFirst` «الترم الأول», `termSecond` «الترم التاني», `termFull` «السنة كاملة»
(one book for the year, deliberately not «الترمين»), `generalShelf` «كتب عامة»,
`yearChip` «الصف {n}», `pages` «{n} صفحة», `shelfCount` «{n} كتاب».
Card actions: `add` «ضيفه للطلب», `added` «في الطلب», `remove` «شيله»,
`outOfStock` «خلص دلوقتي».
Basket: `cartTitle` «طلبك», `cartEmpty` «لسه مختارتش أي كتاب»,
`subtotal` «الكتب», `shipping` «الشحن», `shippingFree` «مجانًا», `total` «الإجمالي»,
`quantity` «العدد», `lineQuantity` «{quantity} × {price}»,
`lineTitleQuantity` «{title} ×{quantity}», `checkout` «كمّل الطلب»,
`checkoutNote` «هتكتب العنوان، وبعدين تحوّل وتبعت صورة التحويل.»,
`cartAnnounce` «الطلب فيه {n} كتاب — الإجمالي {price}».
Empty / error: `empty` «لسه مفيش كتب متاحة دلوقتي»,
`emptyNote` «أول ما ينزل كتاب هتلاقيه هنا.»,
`staleCart` «في كتاب في طلبك مبقاش متاح — حدّث الصفحة وجرب تاني».

Checkout endpoints: `POST /api/book-orders/screenshot` (multipart, 8 MiB cap,
browser-compressed) → `{ screenshotKey }`; `POST /api/book-orders` (address +
lines); `POST /api/book-orders/{id}/payment` (attach the transfer screenshot);
`GET /api/book-orders/mine`; `GET /api/book-orders/{id}`.

### 19.2 `/store/orders` — «كل طلباتي»

**Data:** `getMyBookOrdersOrEmpty()` (swallows its own error and returns `[]`) +
`getPublicSettingsOrDefaults()`.
`supportHref = waMeHref(settings.contact.whatsapp)` — the **support** number, not
the broadcast channel; `null` renders no support link.
⚠️ `[]` is ambiguous (no orders / unreachable API) and that is the deliberate
trade: the empty state's own action leads somewhere useful in both readings, and
the alternative is handing an error page to a student worried about a book.

```
main (max-w-[var(--w-prose)] px-4 py-8 md:px-6 md:py-10)
├─ header
│   h1 = copy.books.mine.pageTitle «طلبات الكتب»
│   p  = copy.books.mine.pageLead  «كل كتاب طلبته، وهو فين دلوقتي.»
├─ orders.length === 0 ? .empty
│     PackageOpen glyph (there is no parcel SpotIllustration)
│     copy.books.mine.empty     «لسه ما طلبتش أي كتاب»
│     copy.books.mine.emptyNote «كتب المنهج بتتشحن لحد باب البيت.»
│     chip chip--solid → /books = copy.books.mine.emptyCta «شوف الكتب»
└─ else ul.space-y-4 → BookOrderCard per order (newestFirst)
       + chip chip--accent → /books = copy.books.mine.orderAnother «اطلب كتاب تاني»
```

**`BookOrderCard`** (also used by the dashboard section):
```
li.panel.p-4
├─ row: status chip painted from ONE --tone variable
│         color = var(--tone)
│         background = color-mix(in oklch, var(--tone) 12%, var(--n-1))
│         inset hairline = color-mix(in oklch, var(--tone) 35%, transparent)
│       + <time> = formatCopy(copy.books.mine.placedOn,{date}) «اتطلب {date}»
├─ ul lines: title (medium) [+ «×{quantity}» when > 1]
│            [+ StreamBadge only when BOTH forGeneral and forLanguages are non-null]
│            + line total = formatEGP(unitPriceCents * quantity)
├─ dl (border-t): copy.books.subtotal «الكتب» / copy.books.shipping «الشحن»
│                 (formatShipping → «مجانًا» at 0, never a bare 0)
│                 / copy.books.total «الإجمالي» in accent, --fs-title-4, bold
│   ⚠️ total = items + shipping − discount is a DB CHECK constraint. Show all rows —
│      «٥٦٥ جنيه» with nothing explaining the ٦٥ is the commonest support call.
├─ p muted = status.note
├─ [rejectionReason] copy.books.mine.rejectionReason «السبب:» + the admin's words verbatim
└─ dates: copy.books.mine.shippedOn «اتشحن {date}», copy.books.mine.deliveredOn «وصل {date}»
   [supportHref] link = copy.books.mine.support «كلّم الدعم»
```

Status map (`apps/web/lib/book-order-view.ts` → `describeBookOrderStatus`):

| status | label | note | tone | closed |
|---|---|---|---|---|
| `address_only` | «مكمّلتش» | «الطلب اتسجّل بس لسه ماتدفعش. كمّل الدفع وهنجهّزه على طول.» | `--warn` | no |
| `paid` | «بنجهّزه» | «استلمنا طلبك وبنجهّزه للشحن. ما تقلقش — أول ما يتشحن هتلاقي هنا إنه في الطريق.» | `--info` | no |
| `shipped` | «في الطريق» | «الكتاب خرج ليك وفي الطريق. ساعات بيتأخر يوم أو اتنين، وده عادي — أول ما يوصلك هتلاقي هنا إنه اتسلّم.» | `--e-ink` | no |
| `delivered` | «وصلك» | «الكتاب وصلك. لو في أي مشكلة فيه كلّم الدعم وإحنا نظبّطها.» | `--ok` | yes |
| `rejected` | «اترفض» | «الطلب ده اترفض.» (the admin's reason follows separately) | `--err` | yes |

`address_only` is the only state whose next move belongs to the student — the only
one wearing `--warn`. `shipped` is ember rather than a second blue precisely
because `paid` and `shipped` sit one above the other in a history list.

---

## 20. `/playground` — «تجربة الكود»

`apps/web/app/(app)/playground/page.tsx`, `components/playground/playground.tsx`,
`apps/web/lib/run-code.ts`, `run-python.ts`.

Nothing here is stored, submitted or graded — the subtitle says so, because a
platform that records everything else has to be explicit about the one place that
does not.

```
main (max-w-[var(--w-shell)] px-6 py-10 md:py-12)
├─ header
│   p.eyebrow = copy.playground.eyebrow «06 / التجربة»
│   h1        = copy.playground.title   «تجربة الكود»
│   p         = copy.playground.subtitle «كود بيتكتب ويشتغل على طول. مافيش حاجة بتتحفظ ولا بتتصحّح — المكان ده للتجريب.»
├─ Playground
└─ p = copy.playground.pythonNote + ' ' + copy.playground.pythonNoPackages
```

`Playground` — `grid gap-4 lg:grid-cols-2` (editor and output **stack on phones**):
```
section.panel (editor)
├─ toolbar (border-b, bg-surface-2, flex-wrap)
│   ├─ role="group" aria-label=copy.playground.languageLabel «اللغة»
│   │   two aria-pressed buttons, h-10 (md:h-7):
│   │   copy.playground.js «JavaScript» | copy.playground.python «Python»
│   ├─ mono = copy.playground.lines «{n} سطر»
│   └─ select (h-10 md:h-8), sr-only label copy.playground.examplesLabel «أمثلة جاهزة»
│      five examples per language: «أول برنامج», «شرط», «حلقة», «دالة»,
│      «مصفوفة» (JS) / «قائمة» (Python)
├─ textarea  dir="ltr" spellCheck=false autoCapitalize=off autoCorrect=off
│            aria-label=copy.playground.editorLabel «محرّر الكود», min-h-[19rem], mono
│            Tab inserts two spaces; Escape blurs
└─ footer (border-t, flex-wrap)
    ├─ needsPythonDownload ? amber Download button
    │      copy.playground.pythonLoad «تحميل البايثون (١٣ ميجا)»
    │      / copy.playground.pythonLoading «بيحمّل البايثون… أول مرة بس»
    │   : amber Play button
    │      copy.playground.run «تشغيل» / copy.playground.running «بيشتغل…»
    ├─ outlined RotateCcw = copy.playground.reset «رجوع المثال»
    ├─ outlined = copy.playground.copy «نسخ» / copy.playground.copied «اتنسخ» (1600 ms)
    └─ [python ready] ghost = copy.playground.resetRuntime «نبدأ من نضيف»
section (output)
    copy.playground.output «النتيجة»
    empty = copy.playground.outputEmpty «دوسة على «تشغيل» والنتيجة بتطلع هنا.»
```

- **JavaScript runs immediately** — the browser has an engine; nothing is downloaded.
- **Python is opt-in.** Pyodide's runtime is 13.5 MB, vendored under
  `public/pyodide/` (the CSP sets `script-src 'self'`, so a CDN would need a
  permanent exception). The download is **its own button, labelled with the size**;
  picking Python from the switcher never starts it. A persistent worker keeps
  variables between runs (notebook semantics); the restart button is the escape hatch.
- Both runners share one `RunResult` shape, so the output panel is unaware of which
  language produced what it shows.
- Failure copy: `copy.playground.pythonUnavailable`
  «مقدرناش نشغّل البايثون على المتصفّح ده.»;
  `copy.playground.timeout` «الكود أخد وقت طويل واتوقف. غالبًا فيه حلقة مالهاش نهاية.»
- Page notes: `pythonNote` «البايثون بتشتغل جوّه المتصفّح عندك — مافيش كود بيتبعت لأي سيرفر. أول تحميل ١٣ ميجا وبعدها بيتخزّن.»,
  `pythonNoPackages` «المكتبات الخارجية زي numpy مش متاحة هنا — بايثون الأساسية بس.»,
  `tipsTitle` «حاجات تجرّبها», `pythonReady` «البايثون جاهزة».
- Switching language resets the example index, the code and the output.

---

## 21. المساعد — the assistant

`apps/web/components/assistant/*` (`assistant-slot.tsx`, `assistant-widget.tsx`,
`assistant-chat.tsx`, `assistant-escalate.tsx`, `assistant-thread.tsx`,
`use-assistant-ask.ts`, `voice-recorder.tsx`, `message-attachment.tsx`).

**Where it is mounted:** per route group, never at the root.
- `(app)/layout.tsx` → `<AssistantSlot variant="docked" />` — a **control in the
  topbar** beside the bell, not a floating disc.
- `(auth)/layout.tsx` → `<AssistantSlot />` (floating variant, a fixed pill).
- `(admin)` mounts nothing — the instructor does not message himself.
- **It must not render on a 404 or on a running attempt.**

`AssistantSlot` reads `getPublicSettingsOrDefaults()` (cached, hourly) and passes
`{ channel: contact.whatsappChannel, number: contact.whatsapp }`. Both are
admin-editable and start `null`; a `null` renders no WhatsApp row at all.

### 21.1 Launcher

- **docked:** a 36 px round button, `bg = color-mix(--a-9 18%, transparent)`,
  `text-accent-text`, containing an animated robot mark — or an `X` while the
  panel is open — plus an unread badge.
  `aria-label = unread > 0 ? copy.assistant.openWithReply «فتح المساعد — فيه رد جديد»
  : copy.assistant.open «فتح المساعد»`. It is **first in the actions cluster**
  (the inline-start end in RTL, nearest the page content) and the only coloured
  one there — the other three toggle things, this one offers something.
- **floating:** a fixed `h-14` amber pill with the robot, the badge, and (from
  `sm`) the words `copy.assistant.open` «فتح المساعد».
- Close label: `copy.assistant.close` «قفل المساعد».

### 21.2 Panel

Portalled to `document.body` (the topbar's `backdrop-blur` creates a containing
block for `position: fixed`, exactly as a finished CSS transform does), a
`role="dialog" aria-modal="false" aria-label={copy.assistant.title}`:
```
header (amber band, #1A1206 ink)
  robot mark + copy.assistant.title    «مساعد المنصة»
             + copy.assistant.subtitle «إجابات سريعة، ولو مالقيتش اللي بتدوّر عليه بوصّلك لأيمن.»
             + close button
body (flex-1, min-h-0) — four modes:
  'chat'      AssistantChat        ⚠️ HIDDEN, never unmounted, when another mode
                                      is active — the transcript lives inside the
                                      hook, and unmounting threw away a
                                      conversation in progress and aborted a
                                      streaming answer
  'escalate'  AssistantEscalate    the hand-off form
  'sent'      the receipt
  'thread'    AssistantThread      the conversation with م. أيمن
```

### 21.3 Chat copy (`copy.assistant.ai`)

- lead «اسأل أي حاجة عن المنصة أو عن المادة، بالعامية عادي.»
- starters: «الكورسات المفتوحة دلوقتي إيه؟», «إزاي أشترك في كورس؟»,
  «الامتحانات شكلها إيه؟», «يعني إيه متغيّر في البرمجة؟»
- placeholder «سؤالك هنا…», send «إرسال», stop «إيقاف», thinking «بيفكّر…»
- speakers: you «إنت», bot «مساعد المنصة»; clear «محادثة جديدة»
- disclaimer «ردود آلية من كلام المنصة نفسها. ولو مش كفاية، م. أيمن تحت.»
- `unknown` «السؤال ده مش لاقي ليه إجابة مظبوطة عندي، ومش عايز أخمّن.»
- `refused` «ده مش حاجة أقدر أساعد فيها. أنا هنا للمنصة وللمادة نفسها.»
- **`duringExam`** «المساعد مقفول أثناء الامتحان — ده جزء من إن الدرجة تبقى بجد. أول ما الامتحان يتسلّم، أنا هنا.»
- `failed` «حصلت مشكلة في الرد. تحاول تاني بعد شوية.»
- `tooMany` «أسئلة كتير في وقت قصير. شوية ونكمّل.»

Escalation card: `escalateTitle` «السؤال ده محتاج أيمن»,
`escalateBody` «أوصّله ليه بالسؤال زي ما هو، والرد بيرجع هنا ومعاه إشعار.»,
`escalateAction` «إرسال السؤال لأيمن».
Hand-off states: `handoffSending` «بنوصّل السؤال لم. أيمن…»,
`handoffSentTitle` «الرسالة راحت لم. أيمن»,
`handoffSentBody` «هو اللي هيرد، والرد بيوصل هنا ومعاه إشعار. والصفحة ممكن تتقفل عادي.»,
`handoffOpenThread` «فتح المحادثة».
WhatsApp row: `copy.assistant.whatsapp.channel` «قناة الواتساب»,
`copy.assistant.whatsapp.chat` «التواصل على واتساب».

### 21.4 Deep link

`?assistant=1` (`ASSISTANT_OPEN_PARAM`) on `/dashboard` opens the panel — this is
where every `conversation_reply` and `instructor_message` notification lands.
There is deliberately **no `/conversations/:id` route**: a second place to read the
same messages would give the student two inboxes.

---

## 22. Cross-cutting states

### 22.1 `(app)/error.tsx`

```
main (max-w-2xl px-6 py-16)
└─ div.panel (space-y-3, p-5 sm:p-6)
   ├─ h1 = copy.errors.app.title «الصفحة دي مافتحتش»
   ├─ p  = copy.errors.app.body
   │       «المشكلة عندنا إحنا مش عندك. حسابك وكل اللي ذاكرته متسجّل زي ما هو ومامسّهوش حاجة. نجرّب تحميل الصفحة تاني، ولو فضلت واقفة نرجع للحساب ونكمّل من مكان تاني.»
   ├─ row (flex-col below sm, flex-row from sm — two 44px targets do not fit 320px)
   │   ├─ amber button min-h-11 = copy.common.retry «نحاول تاني»
   │   │     ⚠️ `retry` from useErrorRetry, NOT the bare `reset`: `reset()` does not
   │   │        invalidate the router cache, so it re-reads the same failed payload
   │   │        and throws again with nothing on screen changing. The hook refreshes
   │   │        first and escalates a repeat press to a document load.
   │   └─ outlined <a href="/dashboard"> = copy.nav.dashboard «حسابي»
   │         ⚠️ a plain <a>, NOT a <Link> — /dashboard is itself the likeliest
   │            route to have thrown, and a soft navigation to the current URL can
   │            be answered from the router cache and visibly do nothing
   └─ [error.digest] p (--fs-text-xs, faint) =
        copy.errors.digestLabel «كود العطل» + ': ' + digest in dir="ltr" mono
```
The digest is never printed bare and `error.message` is shown nowhere.
Every boundary also calls `useErrorReport(error)`, which posts to the admin error
log — which is exactly why the review page's ordinary 404 must be `notFound()`
and not a throw (§13).

Sibling boundaries: `copy.errors.site` («حصلت مشكلة في الصفحة دي»),
`copy.errors.auth` («مقدرناش نفتح الصفحة دي»), the global one
(«الموقع مش قادر يفتح دلوقتي») and the build-time one
(«حصلت مشكلة وإحنا بنجهّز الصفحة»). The voice is fixed: put the fault on us, say
what was **not** lost, then a next step that is not the page that just failed.
Deliberately absent from every student-facing error: the word «خطأ», any apology
beyond the first clause, and «حاول مرة أخرى لاحقاً».

### 22.2 `(app)/not-found.tsx`

```
main (max-w-2xl px-6 py-16)
└─ div.panel
   ├─ p dir="ltr" font-mono --fs-text-xs faint = "404"   (out of the <h1>)
   ├─ h1 = copy.notFound.app.title «الصفحة دي مش موجودة»
   ├─ p  = copy.notFound.app.body
   │       «يمكن الدرس أو الكورس ده اتشال أو الرابط قديم. حسابك وكل اللي ذاكرته زي ما هو — نرجع للحساب ونكمّل من هناك.»
   └─ row (flex-col below sm, flex-row from sm)
       amber Link /dashboard = copy.notFound.app.cta «حسابي»
```

### 22.3 Offline

`copy.offline` — the ONLY screen the service worker serves from cache:
- online-but-server-down (`navigator.onLine === true`):
  `serverTitle` «المنصة مش راضية ترد دلوقتي»,
  `serverBody` «نتك شغال — المشكلة عندنا إحنا. دي بتحصل لتانية وقت التحديث، وبترجع لوحدها. شوية ونحاول تاني.»
- genuinely offline: `title` «مفيش نت دلوقتي»,
  `body` «الصفحة دي محتاجة اتصال. نجرّب تاني أول ما النت يرجع — مفيش حاجة ضاعت.»
- `retry` «نحاول تاني», `retrying` «بيحاول تاني…», `home` «الصفحة الرئيسية»

A mobile client must make the same distinction — telling someone on full 4G that
their internet is out sends them to reboot a router.

### 22.4 `loading.tsx` skeletons

Every route in `(app)` ships one: `dashboard`, `foundations`, `library`,
`library/[slug]`, `notifications`, `onboarding`, `path`, `playground`, `profile`,
`results`, `settings/devices`, `settings/section`, `store`, `store/orders`,
`welcome`, `courses/[slug]/lessons/[lessonId]`, `quizzes/[lessonId]`,
`quizzes/[lessonId]/attempt/[attemptId]`, and `…/review`.
They mirror the real layout's boxes (the dashboard's skeleton mirrors the hero's
exact nesting, including the stats row as a sibling of the identity block) so
nothing jumps when the data lands.

### 22.5 Common strings

| key | Arabic |
|---|---|
| `copy.common.loading` | «ثانية واحدة…» |
| `copy.common.error` | «حصلت مشكلة» |
| `copy.common.retry` | «نحاول تاني» |
| `copy.common.empty` | «مفيش حاجة هنا لسه» |
| `copy.common.undo` | «تراجع» |
| `copy.common.undone` | «اترجع» |
| `copy.common.close` | «إغلاق» |
| `copy.common.saveFailed` | «الحفظ فشل — التغييرات اترجعت زي ما كانت» |
| `copy.common.question` | «السؤال» |
| `copy.a11y.toastRegionLabel` | «الإشعارات» |
| `copy.a11y.skipToContent` | «تخطَّ إلى المحتوى» |
| `copy.a11y.decorative` | «عنصر زخرفي» |

---

## 23. Voice rules the copy obeys (do not "improve" strings)

`packages/contracts/src/copy/ar.ts` header, and it is load-bearing:

**Nothing on the student surface knows whether it is talking to a boy or a girl.**
The platform never asks and roughly half the students are girls, so every
student-facing string is written so both readings are the same spelling:
- actions become the masdar — «فتح الكورس», «حفظ», «تحميل المحاضرة»,
  «تسليم الامتحان», «إرسال»
- anything with a voice becomes the inclusive plural — «نبدأ الكورس», «نكمّل»,
  «نحاول تاني»
- statements about the reader go nominal — «الدرس خلص», «الامتحان مش متاح دلوقتي»,
  «مفيش رجوع بعد التسليم»
- placeholders drop the verb and name the field — «الاسم بالكامل», «محافظتك»,
  «سؤالك هنا…»

Only the `admin` namespaces stay in the imperative; they have exactly one reader.

Other standing rules:
- **No emoji as UI icons** (Global Constraint 9) — lucide components only. The two
  emoji that DO appear are inside copy strings («أهلاً وسهلاً 👋», «واجب {lesson} اتقبل ✅»).
- **Green and red are reserved for quiz correctness.** Progress is amber, never green.
- **No user-facing literal may live in a component** — everything comes from `copy`.

---

## 24. Endpoint index (student surface)

Auth (better-auth): `POST /api/auth/sign-up/email`, `/sign-in/email`,
`/sign-in/phone-number`, `/sign-in/social`, `/sign-out`.

| method + path | used by |
|---|---|
| `GET /api/profile/me` | proxy gate, dashboard, library, profile, settings/section |
| `PATCH /api/profile/onboarding` | onboarding wizard **and** `/settings/section` |
| `PATCH /api/profile/section` | (narrower; not used by the current form) |
| `POST /api/profile/avatar` | `/profile` avatar (multipart, ≤ 2 MiB) |
| `POST /api/profile/whatsapp-opened` | `/welcome` channel press |
| `GET /api/taxonomy` | onboarding, library, profile, settings/section, dashboard |
| `GET /api/catalog/courses`, `GET /api/catalog/courses/{slug}` | library, foundations, library/[slug] |
| `GET /api/me/dashboard` | dashboard, rail, profile totals |
| `GET /api/me/path` | `/path`, `/library`, `/library/[slug]` |
| `GET /api/me/quizzes` | dashboard, `/results`, `/profile` |
| `GET /api/me/mastery` | dashboard aside |
| `GET /api/me/activity` (`?cursor=`) | `/profile` |
| `GET /api/me/notifications` (`?cursor=`) | `/notifications`, bell panel |
| `GET /api/me/notifications/unread-count` | bell badge |
| `POST /api/me/notifications/{id}/read`, `/read-all` | bell + list |
| `GET /api/me/notifications/stream` | SSE, one per tab |
| `GET /api/me/push/public-key`, `POST /api/me/push/subscribe`, `/unsubscribe` | Web Push |
| `GET /api/sessions`, `DELETE /api/sessions/{id}` | `/settings/devices`, `/profile` |
| `POST /api/courses/{courseId}/enroll` | course start button |
| `GET /api/enrollments` | — |
| `GET /api/courses/{slug}/outline` | lesson player sidebar |
| `GET /api/lessons/{lessonId}/player` | lesson player |
| `GET /api/lessons/{lessonId}/resources/{resourceId}/view` and `/download` | resources |
| `POST /api/lessons/{id}/open`, `/heartbeat`, `/dwell`, `/complete` | progress |
| `GET /api/quiz/lessons/{lessonId}` | quiz intro |
| `POST /api/quiz/quizzes/{quizId}/attempts` | start an attempt |
| `POST /api/quiz/attempts/{attemptId}/resume` | the runner, every load |
| `PUT /api/quiz/attempts/{attemptId}/answers` | autosave |
| `POST /api/quiz/attempts/{attemptId}/flag` | flags (separate from autosave) |
| `GET /api/quiz/attempts/{attemptId}/preflight` | submit dialog |
| `POST /api/quiz/attempts/{attemptId}/submit` | submit |
| `GET /api/quiz/attempts/{attemptId}/review` | review |
| `GET /api/homework/lessons/{lessonId}` | homework card |
| `POST /api/homework/lessons/{lessonId}/images` | homework upload (multipart) |
| `POST /api/homework/lessons/{lessonId}/submissions` | homework submit |
| `GET /api/homework/images/{imageId}` | reviewed image |
| `GET /api/books` | `/store`, dashboard books |
| `POST /api/book-orders/screenshot`, `POST /api/book-orders`, `POST /api/book-orders/{id}/payment` | checkout |
| `GET /api/book-orders/mine`, `GET /api/book-orders/{id}` | `/store/orders`, dashboard |
| `POST /api/payments/screenshot`, `POST /api/payments/submissions`, `GET /api/payments/submissions/me` | course subscription |
| `GET /api/assistant/conversations/mine/summary` | instructor-message card |
| `GET /api/media/{prefix}/{name}` | media (public route, access re-derived) |

Upload caps (`packages/contracts/src/admin/media.ts`):
`MAX_UPLOAD_BYTES = 8 MiB`, `MAX_AVATAR_BYTES = 2 MiB`,
`MAX_DOCUMENT_BYTES = 95 MiB`.

---

## 25. What a Flutter client needs that does not exist yet

These are the concrete backend / product gaps, each with the reason.

1. **No mobile session mechanism.** Auth is a `__Host-` cookie session plus a
   double-submit CSRF cookie, and every write helper reads `document.cookie`.
   A native client needs either a documented cookie-jar contract (including
   `__Host-csrf` handling) or a bearer-token grant on the better-auth config.
2. **No push transport for native.** Notifications are SSE
   (`GET /api/me/notifications/stream`) plus Web Push
   (`/api/me/push/*` with a VAPID public key). FCM/APNs registration endpoints and
   a payload that keeps the **absolute** unread count do not exist.
3. **The gate probe is `GET /api/profile/me`.** There is no single
   "session + onboardingCompleted + permissions" endpoint; the proxy synthesises
   it from a 401/200. A mobile client should get one, or it pays a full profile
   read on every cold start.
4. **The dashboard is ten parallel calls against a 10-req/second bucket.**
   On mobile that is one screen consuming the whole `short` budget. A single
   aggregated `/api/me/home` (or per-section lazy loads with documented failure
   semantics) is needed before a native client can also poll or prefetch.
5. **Video: two players, one of which is unusable natively.**
   The mirror path is plain HLS and maps cleanly to `video_player`/`better_player`.
   The YouTube path is the IFrame API plus two iframe fallbacks; native needs
   either the mirror guaranteed for every lesson or a documented native YouTube
   strategy. Critically, the fallback path **cannot report position**, so it
   records no progress — that must not become the default on mobile.
6. **Heartbeat semantics assume a foreground tab.** `visibilitychange` +
   `pagehide` + `fetch keepalive` have no native equivalent; a background/killed
   app needs a documented flush-on-pause contract, and the server's
   `allowedHeartbeatSeconds` clamp must still hold.
7. **The quiz timer is anchored to `performance.now()`.** A native app needs a
   monotonic clock that survives backgrounding, plus a defined behaviour for an
   app killed mid-attempt (the server already handles it via `resume()` and
   `overdueHandling`, but nothing documents what the client should show).
8. **`overscroll-behavior` and `useBackDismiss` are web-only.** The runner's
   "back asks before it obeys" rule and the pull-to-refresh suppression must be
   re-implemented with `PopScope`/`WillPopScope` and a disabled refresh indicator.
9. **Rich text is HTML.** Stems, options, feedback, lesson bodies and course
   descriptions are sanitized HTML strings. Flutter needs an agreed renderer and
   an allowlist that matches `sanitizeRichText`, or the API needs to emit a
   structured format.
10. **`/playground` cannot ship as-is.** It is a browser JS engine plus a 13.5 MB
    Pyodide WASM runtime served from `public/pyodide/`. Native needs either a
    WebView, a server-side sandbox, or the screen dropped.
11. **File uploads bypass Server Actions for a reason** and are plain multipart —
    that part ports fine — but the **browser-side image compression** in
    `upload-client.ts` (which is what makes 8 MiB workable on Egyptian mobile
    data) has to be re-implemented natively.
12. **The assistant is a portalled web panel** with streaming answers, a voice
    recorder and attachments. Its transport is not documented as an API surface
    anywhere in `packages/contracts` except the summary endpoint.
13. **Deep links are web paths.** `?assistant=1`, `reviewHref`, `attemptHref` and
    every notification `href` are web routes; a mobile client needs an
    App-Links/Universal-Links map and a canonical route table.
14. **No offline story.** The service worker serves exactly one page and nothing
    else is cached; there is no downloaded-lesson concept, no offline attempt
    queue, and `copy.offline` distinguishes "no internet" from "our server is
    down" — both must be reproduced.
15. **RTL + Arabic typography assumptions.** The Latin-digit
    `ar-EG-u-nu-latn` formatters, `dir="ltr"` islands, the reversed arrow-key
    mapping in the question navigator, and `text-wrap: balance` on the brand all
    need explicit Flutter equivalents.
16. **The 44 px touch-target pass is CSS-only.** Every measurement in §0.6 was
    taken at 360 px against production and has to be re-established in Flutter.
17. **Theme is three-state** (light / dark / system) and stamped on `<html>`
    before first paint to avoid a flash; the rail-collapse preference is stored
    the same way. Neither has a native storage contract.
18. **`scheduleNote` is unparsed free text** and `comingSoonNote` likewise — no
    reminder can be scheduled off either. If mobile wants lecture reminders, the
    field has to become structured first.
