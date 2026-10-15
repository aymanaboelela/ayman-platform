# Architecture map

Where things live. Paths are relative to the repo root. Counts are approximate
and drift. Trust `ls` over this file when they disagree.

---

## 1. Domain in one paragraph

Students register (phone or email, better-auth), onboard (governorate, city,
education system, year, track), then buy access to **courses** organised into
**sections → lessons** and, for monthly billing, **months**. Lessons are video
lectures (YouTube, or uploaded/mirrored HLS on R2), text, resources (PDF decks),
**homework** (photo answers), or **quizzes** (`kind: 'quiz'` lessons). Access is
decided by **`AccessGrant`** rows (`course | term | course_month | section | lesson`
scopes), not by `Enrollment.status`. Payment comes from InstaPay transfers (a
screenshot plus an Android handset that forwards bank notifications), unlock codes, or
the wallet. Admins author content, grade essays, run monthly exams, the honor
board, WhatsApp campaigns, book orders (Torod courier), centres (in-person
attendance) and finance.

**Egyptian school systems.** The Egyptian Baccalaureate (600 marks, 70% pass,
retake up to 4 times) and Thanaweya Amma (320 marks, 50%) run **in parallel**.
The first Baccalaureate exam is June 2027. There are four tracks: medicine and life
sciences, engineering and computer science, business, and arts. Year 2 carries 67% of
the total.

---

## 2. `apps/api` (NestJS 11 + Prisma 7)

### Bootstrap
- `src/main.ts`: `loadEnv()` (Zod, throws) → `loadEntitlements()` → Nest with
  `bodyParser:false` (better-auth needs the raw body). Global prefix `api`, except
  `GET media/:prefix/:name`. `trust proxy` is 1. `X-Robots-Tag: noindex` is set on `/api`.
  No CORS.
- `src/app.module.ts`: pino logger (redacts cookies/tokens/passwords), Redis,
  Throttler (Redis storage), Schedule, Prisma, Audit (global), every feature
  module. Global: `ThrottlerGuard`, `FeatureGuard`, `PrivateCacheInterceptor`,
  `AllExceptionsFilter`. `AuthGuard` (AuthModule) and `CsrfGuard`
  (SecurityModule) are also `APP_GUARD`s.
- `src/config/env.ts`: required vars are `API_PORT`, `APP_URL`, `DATABASE_URL` (runtime
  role), `DIRECT_DATABASE_URL` (owner), `REDIS_URL`, `BETTER_AUTH_SECRET` (≥32),
  and `BETTER_AUTH_URL`. Everything else is optional, and paired vars are all-or-nothing:
  Google OAuth, Apple (4), WA sidecar, VAPID (3), and video mirror R2 (5). An empty string
  counts as unset; use `optionalSecret`/`optionalWithDefault`, never a bare `.min(1)`.
  Some vars are read raw outside the schema: `TENANT_*`, `DATABASE_POOL_MAX`, `ADMIN_*`.
- `docker-entrypoint.sh` runs, in order:
  1. Create the runtime role and schema `app`.
  2. `prisma migrate deploy`.
  3. Re-grant DML, then **REVOKE UPDATE/DELETE on `audit_log` and `attempt_events`**.
     This step must stay after the grants.
  4. Run `dist/scripts/seed.js` (warn-only).
  5. Run `create-admin.js` if `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set.
  6. `node dist/main`.
- `Dockerfile`: node 24 slim, multi-stage. The runtime image includes ffmpeg, python3 and
  yt-dlp, runs as `node`, and its healthcheck hits `/api/health`.

### Cross-cutting
- **Auth** (`src/auth`):
  - `auth.config.ts`: better-auth at `/api/auth`, Prisma adapter, argon2, `bearer` and
    `phoneNumber` plugins, Turnstile (`human-check.ts`), device limit, login security hook
    and login throttle.
  - Decorators: `@Public()`, `@RequirePermission()`, `@RequireFeature()`, `@CurrentUser()`.
  - `permissions.ts`: `PERMISSIONS` and `ROLE_PERMISSIONS` (admin `*`, owner = all minus
    `OWNER_WITHHELD`, student = minimal). Runtime grants and per-user overrides live in
    the DB (`permission-grants.service.ts`).
  - `GET /api/session` is what the web proxy uses to decide redirects.
- **Feature gating**:
  - `FeatureGuard` 404s routes whose `@RequireFeature` isn't in the signed
    `TENANT_ENTITLEMENTS` JWS (`common/entitlements.ts`, EdDSA via jose).
  - DB feature flags: `packages/contracts/src/admin/flags.ts` (`FLAG_DECLARATIONS`).
    `common/flag-default.ts` gives per-tenant defaults (`defaultForTenant`).
- **CSRF** (`modules/security/csrf.guard.ts`): applies to POST/PUT/PATCH/DELETE.
  - Requires an `x-csrf-token` header (double-submit cookie `__Host-csrf`).
  - `Origin` must equal `APP_URL`.
  - `Sec-Fetch-Site` must be same-origin, none, or absent.
- **Authorization matrix**: `src/test/authorization-matrix.int-spec.ts` (`MATRIX` rows,
  `KNOWN_GAPS`, explicit `@Public` list). Routes come from
  `src/test/route-inventory.ts`. Quiz routes are covered in `modules/quiz/quiz.authz.spec.ts`.
- **Throttling**: the buckets `short` (10/s), `medium` (60/min) and `long` (1000/h) are
  keyed by session; `ip` allows 1200/min. There is **no** `default` bucket, so a bare
  `@SkipThrottle()` skips nothing. Identity: `common/throttle/request-identity.ts`. The
  client IP comes from `cf-connecting-ip`.
- **Redis** (`src/redis/redis.module.ts`) backs the throttler (fail-closed), arena,
  notifications SSE pub/sub, guardian sessions, campaign runner, unlock attempts and
  video locks.
- **Audit** (`src/audit`):
  - SHA-256 hash chain with writes serialised by an advisory lock.
  - `AuditService.record` / `recordTx` is the only writer; `only-the-service-writes.spec.ts`
    enforces it.
  - The actor comes from AsyncLocalStorage (`AuditContextInterceptor`).
- **Other**: `common/sanitize/rich-text.ts` (sanitize-html), `common/tenant.ts`,
  `common/http/parse-request.ts` (query/param parsing → 400), `private-cache.interceptor.ts`
  (`Cache-Control: private, no-store`).

### Modules (`src/modules`, all routes under `/api`)

| Module | Purpose · main routes · integrations |
|---|---|
| admin | settings (`admin/settings`, public `settings/branding`, `settings/public`), flags, navigation, roles/staff permissions, students, audit read, taxonomy, home-blocks, honor-board |
| analytics | cohort/lesson/student/video analytics, CSV (`admin/analytics`) |
| arena | «ساحة التحدي», a live 1v1 quiz match. `me/arena` (SSE), `admin/arena`. Uses Redis. Feature `arena.enabled` |
| assistant | Support chat and AI answers. `assistant`, `admin/conversations`, `admin/assistant`. AI chain Gemini → Groq → Anthropic. Daily retention cron |
| book-orders | Paper book orders and transfer receipts. `book-orders`, `admin/book-orders`, `webhooks/torod/:token`. Torod courier, tesseract OCR, exceljs |
| books | Book catalogue: `books`, `admin/books` |
| catalog | Public `catalog/courses`, `catalog/courses/:slug`, `catalog/honor-board` |
| centers | In-person centres: slots, bookings, attendance scan. `centers`, `me/center-booking`, `admin/centers` |
| content | Course authoring: `admin/*` courses, sections, lessons, terms, months, resources, video, homework. Scheduled-publish cron runs every minute |
| dashboard | `me/dashboard`, `me/path` |
| diagnostics | Client error reports: `POST errors`, `admin/errors` |
| enrollment / entitlement | Access decisions (`content-access.ts`, `month-access.ts`, `grant-liveness.ts`). `enrollments`, `courses/:id/enroll` |
| expenses | `admin/expenses`, finance overview |
| follow-up | `admin/follow-up`: idle and non-subscriber lists |
| guardian | Parent portal (code-based cookie session): `guardian/*` |
| homework | `homework/lessons/:id/{images,submissions}`, `admin/homework`. HEIC is converted to JPEG. Purge cron |
| marketing | WhatsApp campaigns: `admin/marketing`, `marketing/wa/{inbound,receipt}`. Campaign runner every 10 s |
| media | `POST media`, `POST media/documents`, `admin/media/*`, `GET /media/:prefix/:name`. Local disk storage, sharp re-encode, file-signature checks |
| mistakes | «دفتر غلطاتي»: `me/mistakes`. Feature `mistakes.enabled` |
| news | `news`, `news/:slug`, `admin/news` |
| notifications | `me/notifications` (SSE stream), `me/push/*` (web-push/VAPID) |
| outreach | Messages in the teacher's voice: `admin/outreach`, `admin/broadcast`. Sweeper crons |
| payments | `payments` (screenshot submissions, wallet purchase), `ingest/transfers` (Android handset), `admin/{payments,transfers,finance}`. Expiry sweeper |
| player | `courses/:slug/outline`, `lessons/:id/player`, resources, `videos/:id/key` (HLS AES key, entitlement-gated) |
| profile | `profile/me`, onboarding, section, avatar |
| progress | `lessons/:id/{heartbeat,open,dwell,complete}`, `me/rank`, `me/activity`, `admin/leaderboard` |
| quiz | Largest module. `quiz/*` attempt lifecycle, `me/quizzes`, `me/game`, and `admin/{questions,quizzes,exams,attempts,grading-queue,game-banks,external-books…}`. `NoAnswerLeakInterceptor`. Overdue cron |
| security | CSRF guard, CSP report endpoint |
| sessions | Device list and revoke |
| taxonomy | Public `GET taxonomy` |
| tenant-entitlements | Public `GET entitlements` |
| unlock-codes | «أكواد الفتح»: `me/unlock-codes`, `admin/unlock-codes` |
| video-mirror | HLS on R2/S3: direct browser upload (presigned multipart → ffmpeg encode → AES-128 TS) and YouTube mirror (yt-dlp; blocked on the VPS by YouTube's bot check). `admin/videos*` |
| wallet | `wallet`, `admin/wallets`, `admin/wallet-topups`; append-only ledger triggers |

### Data model (`apps/api/prisma/schema.prisma`)
- About 92 models and 56 enums, all in Postgres schema `app`. The client is generated to
  `src/generated/prisma` (committed). Migrations (about 143) live in `prisma/migrations/`.
- The app connects through `@prisma/adapter-pg` with `DATABASE_URL`. The CLI uses
  `prisma.config.ts` with `DIRECT_DATABASE_URL`.
- Groups:
  - **Users/auth**: User, Session, Account, SessionDevice, StudentProfile, permission
    grants/overrides.
  - **Taxonomy**: Governorate, EducationSystem, AcademicYear, Track, Subject, offerings.
  - **Courses**: Course, CourseSection, CourseTerm, CourseMonth, LessonMonth, Lesson,
    LessonVideo, LessonResource, LessonHomework, Enrollment, **AccessGrant**,
    LessonProgress.
  - **Quiz**: QuestionBankEntry → QuestionVersion (drafts/publish), Quiz, QuizSlot,
    QuizAttempt, AttemptEvent (append-only), ExamCoverage, HonorBoardPin.
  - **Money**: PaymentSubmission, IncomingTransfer, UnlockCode, Book, BookOrder(+Item),
    Expense, **Refund**, Wallet(+Transaction/Topup).
  - **Comms**: Notification, PushSubscription, Conversation, OutreachMessage,
    MarketingCampaign/Recipient/OptOut.
  - **Config**: SiteSetting, FeatureFlag, NavigationItem, HomeBlock, NewsPost,
    MediaAsset.
  - **Ops**: AuditLog (INSERT-only), ErrorReport.
- Ids: `uuid(7)` for most tables (chronological). **better-auth user ids are
  32-char nanoids.**
- Timestamps are `timestamp without time zone`, stored as UTC. Cairo is UTC+3 in summer
  and UTC+2 in winter. Send explicit `…Z` strings.

### Scripts and tests
- `src/scripts/seed.ts` runs on every boot and upserts reference data (governorates,
  systems, years, tracks, subjects, flags, contact). The file wins over admin edits for
  that data. `pnpm db:seed` runs it locally. (`prisma.config.ts` points at a
  non-existent `prisma/seed.ts`; ignore it.)
- `src/scripts/create-admin.ts`, `finance-reconcile.ts` (**do not run**, its guards are
  stale), `mirror-local.ts`, and `backfill-animated-dimensions.ts`.
- `prisma/seed-admin.ts` creates e2e fixtures and refuses to run in production.
- Unit tests: jest, `*.spec.ts`, `maxWorkers: 1`. About 70 of them hit the real seeded
  DB. Integration tests: `*.int-spec.ts` via `pnpm test:integration` (Postgres + Redis).

---

## 3. `apps/web` (Next.js 16)

### Config
- `next.config.ts`:
  - `output: 'standalone'`, `cacheComponents: true`, `staleTimes.dynamic: 30`.
  - `env: {TENANT_KEY, TENANT_DISPLAY_NAME}` is baked at build time.
  - `cacheHandlers.default = cache-handler/redis.js` (Redis + memory tier, **fails open**).
  - `rewrites`: `/api/*` → `API_ORIGIN`.
  - noindex headers for non-page files. Do **not** add a `Link` header here; it bloats
    the cached shell.
- `proxy.ts` (Next 16 middleware, tests in `proxy.test.ts`):
  - Flood guard: 120 anonymous renders/min/IP.
  - Markdown twins (`.md` or `Accept: text/markdown` → `/md/...`).
  - Auth redirect matrix: `PROTECTED_PREFIXES` checked via `GET /api/session`.
  - Security headers, including **Permissions-Policy**: camera and mic are allowed only on
    `/admin`. A new feature using a gated browser API must add it there.
  - CSP is report-only unless `CSP_ENFORCE=true`. It has no nonces, because cached shells
    can't carry them.
  - Sets the `__Host-csrf` cookie.
- ESLint: `packages/config/eslint` (`ayman/no-physical-direction`,
  `ayman/no-layout-animation`, raw-unsafe ban).
- Tests: Vitest with jsdom runs `**/*.test.{ts,tsx}`. Playwright runs `e2e/*.(e2e|spec).ts`
  with projects desktop 1440×900 and mobile Pixel 7, locale ar-EG, TZ Africa/Cairo, and
  one worker.
- `public/sw.js`: never caches HTML or `/api`. It caches `/_next/static` per build version,
  handles push, and precaches `/offline`.

### Route groups (`apps/web/app`)
- **`(site)` marketing**:
  - `/` is the landing page (preset-dependent), `/about`, `/courses`, `/courses/[slug]`
    (sales page), and `/courses/[slug]/subscribe` (checkout).
  - Also `/years/[year]`, `/essentials`, `/books`, `/news[/slug]`, `/honor-board`,
    `/subscribe`, `/privacy`, `/terms`.
  - CSS lives in `(site)/styles/`.
- **`(app)` student** (inside `StudentShell`):
  - Core: `/dashboard`, `/path`, `/library[/slug]`, and the player at
    `/courses/[slug]/lessons/[lessonId]`.
  - Quizzes: `/quizzes/[lessonId]`, plus `/attempt/[id]` and `/review`.
  - Results and practice: `/results`, `/mistakes`, `/rank`, `/game`, `/arena`.
  - Learning tools: `/foundations`, `/playground` (Python via Pyodide, JS worker, HTML iframe).
  - Account: `/profile`, `/settings/*`, `/onboarding`, `/welcome`, `/notifications`,
    `/codes`, `/wallet`.
  - Books: `/store[/orders]`.
- **`(auth)`**: `/login` and `/register` (Turnstile).
- **`(guardian)`**: `/guardian`, the parent portal.
- **`(link)`**: `/links`, a link-in-bio page.
- **`(admin)/admin`**:
  - The layout is not a security boundary; the API is.
  - Analytics and logs: analytics, attempts, audit, errors, leaderboard.
  - Content: courses, exams, questions, question-books, quizzes, homework, grading, games,
    videos, media, taxonomy.
  - Communication: assistant, broadcast, inbox, follow-up, outreach, news, marketing.
  - Money and commerce: books, finance, payments, wallet, transfers, unlock-codes.
  - Site and access: home, honor-board, navigation, platforms, settings/branding, roles,
    flags, students, centers.
- **Agent-facing**: `AGENTS.md/route.ts` (the product guide), `llms.txt`, `md/[[...slug]]`,
  `auth.md`, `docs/api`, `openapi.json` (generated from Zod), and `.well-known/*`. See
  `docs/runbooks/agent-discovery.md`. Paths are declared once in
  `lib/agents/discovery.ts`.
- **Other**: `build-id`, `offline`, `tenant-icon`, `dev/*` (404 in production), and the
  IndexNow key route.

### Talking to the API
- `lib/api.ts` (client-safe):
  - Read helpers: `apiGet(path, zodSchema)`, `apiGetOrNull`.
  - Write helpers: `apiPost/Patch/Put/Delete`. They send `x-csrf-token` and throw
    `ApiRequestError`.
  - 15 s server timeout.
- `lib/api-server.ts` (server-only, forwards cookies and client IP): `apiGetAuthed`,
  `apiCommand`, `apiSend`.
- `lib/admin-api.ts` (server-only): `adminGet*` and `adminSend*`.
- `lib/session.ts`: `getSession()` (React `cache`) and `can(session, perm)`.
  `lib/auth-client.ts` is the better-auth client.
- **Caching**:
  - Tag vocabulary is in `lib/cache-tags.ts`.
  - Public loaders are `'use cache'` + `cacheTag` + `cacheLife`.
  - Admin server actions invalidate with `updateTag()`.
  - **A write made directly to the API (curl) never invalidates Next caches.**
- **Writes**: admin writes go through Server Actions (`app/(admin)/admin/*/actions.ts`).
  Student hot paths call `apiPost` from the client, then `router.refresh()`.

### Notable lib files
- `tenant.ts`, `tenant-copy.ts`, `tenant-contact.ts`.
- `brand-assets.ts`: Ayman-only imagery, the dragon video timings, `<MediaSlot>` images.
- `settings.ts`: `getBranding()` is cached, tag `settings:branding`, and also cached in
  Redis. `getWhatsappChannelFresh()` is uncached.
- `entitlements.ts`: `featureEnabled()` decides rendering only. The real gate is the
  API's `FeatureGuard`.
- `home-blocks.ts`: landing blocks. `DEFAULT_HOME_BLOCKS` is served only while the table
  is empty.
- `catalog.ts`, `upload-client.ts`, `video-upload-manager.ts`, `youtube.ts`, `gsap.ts`
  (the only ScrollTrigger registration), `fonts.ts`, `seo/`, `agents/`.

### Components and styling
- `components/site/`:
  - Nav, hero, footer, year tracks (the `#years` dragon is a **video**, not three.js),
    `subscribe-panel` (reads live prices in the browser).
  - `presets/{neon,board,studio}`.
  - `vendor/`: React Bits components, with modifications documented in its README.
- `components/app/`: the student shell. `components/admin/`: `app-sidebar.tsx`,
  `nav-items.ts`, `data-table/`, `course/`.
- Import components by direct path. `components/index.ts` is intentionally empty.
- Styling:
  - `app/globals.css` imports Tailwind and `@ayman/ui/tokens.css`.
  - Brand colours come from `packages/ui/src/lib/branding.ts` (OKLCH ramps) and are
    inlined by `renderBrandingStyle`.
  - Theme is light by default. Dark mode is `:root[data-theme='dark']` plus the
    `prefers-color-scheme` guard. The prepaint script applies the stored theme.
- Motion: GSAP + ScrollTrigger, Lenis smooth scroll (desktop only), and LazyMotion.
  Continuous motion stops under `prefers-reduced-motion`.

### e2e (`apps/web/e2e`)
- `a11y.e2e.ts` runs axe (fails on serious or critical) over a **hand-maintained**
  `PUBLIC_ROUTES` list. Add new public routes there.
- Admin specs: course builder, publish, question panel, upload size.
- Student specs: signup → onboarding → lesson, gating, outline, path, quiz attempt and
  review, playground, assistant, shell, tab bar, and so on.
- Infra specs: skew check, module-eval recovery, WebGL context loss, agent discovery.

---

## 4. `packages/`

- **`contracts`** (`@ayman/contracts`, exports point at `.ts` source):
  - About 120 subpath exports: `./zod`, `./partial`, `./copy`, `./copy/admin`, `./admin/*`,
    `./quiz/*`, `./outreach/*`, `./marketing/*`, `./assistant/*`, and so on.
  - The root barrel `.` is **types only** for the API.
  - `zod.ts` may export `z` only (`zod-exports-only-z.spec.ts`). Put helpers in new files.
  - `copy/ar.ts` (~7k lines, student) and `copy/admin.ts` (~7k lines, admin; it re-exports
    the merged `copy`). The split keeps admin strings out of the student bundle.
  - `admin/settings.ts` holds `BrandingSchema` (`.strict()`; preset, layout, accent,
    radius, asset ids), plus the Seo, Contact, Store and About schemas.
  - `admin/flags.ts` declares the flags. The DB holds values only; an undeclared key is
    ignored.
  - Guard specs: `tenant-identity-leak.spec.ts`, `outreach/compose.spec.ts`
    (masculine-address tripwire), `*-voice.spec.ts`, and `check-tenant-env.spec.ts`.
- **`ui`** (`@ayman/ui`): `./tokens.css` (`src/tokens/*.css`), `./components/*` (Radix:
  button, dialog, sheet, select, dropdown-menu with `modal={false}`, and so on),
  `./hooks/*` (`use-back-dismiss.ts`), `./branding`, `./oklch`, `./ramp`.
- **`config`**: `tsconfig.base.json` (ES2023, Bundler resolution, strict,
  `noUncheckedIndexedAccess`) and `eslint/` presets and custom rules.

---

## 5. `services/wa` (WhatsApp sidecar)

- Uses Baileys as an unofficial linked device. It has its own `package-lock.json` and
  `node --test` suite, and sits deliberately outside the pnpm workspace.
- Endpoints: `/health`, `/status` (QR), `/link`, `/unlink`, `/send`. All need the
  `x-wa-token` header except `/health`.
- It posts inbound messages and delivery receipts to `api:3300/api/marketing/wa/*`.
- The API client is `apps/api/src/modules/marketing/whatsapp-device.service.ts`.
- **"Sent" ≠ "delivered"**: delivery is receipt status 3. Look for nack `463` in the logs.

---

## 6. Docs worth knowing

- `docs/runbooks/`:
  - `new-tenant.md`, `deploy.md`, `backups.md`, `video-upload.md`, `video-mirror.md`
  - `instapay-transfers.md`, `book-courier-torod.md`, `whatsapp-marketing.md`
  - `google-sign-in.md`, `agent-discovery.md`, `assistant-chat.md`, `links-subdomain.md`
  - `launch-runbook.md`, `vps-setup.md`
- `docs/DEPLOYMENT.md` (Arabic): single origin, env vars, DB roles, Redis's two failure
  modes.
- `docs/superpowers/specs/` holds approved designs and `docs/superpowers/plans/` holds
  implementation plans; its `README.md` is the ownership register. **Approved ≠ built.**
- `docs/mobile-spec/{student-app,admin-app}.md`: Flutter client specs. The app lives on
  branch `feat/mobile-app` (`apps/mobile`, BLoC + get_it + dartz).
  `scripts/sync-mobile-copy.ts` generates its copy from contracts.
