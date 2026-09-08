# API surface — complete HTTP reference (`apps/api`)

Source of truth for this document: every `*.controller.ts` under `apps/api/src` (55 files),
`apps/api/src/main.ts`, `apps/api/src/app.module.ts`, the guards/filters/interceptors in
`apps/api/src/common` and `apps/api/src/auth`, and the zod schemas in `packages/contracts/src`.
Everything below was read out of the repo; nothing is remembered or inferred.

Written for a Flutter engineer who has never opened this repo. Field names and types are copied
from the zod schemas verbatim.

**As of 2026-09-08, working tree of branch `feat/video-mirror`.** Mobile enablement is actively
landing in this same worktree: `bearer()` auth (§0.2, §1), a `code` field on the error body
(§0.5), and bearer-aware rate-limit keying (§0.8) were all added on this date and are described
here as they now stand, not as they were. `apps/mobile/` exists and is untracked. Re-read the
files listed at the end of §17 before trusting any detail that is more than a few days old.

---

## 0. Global rules

### 0.1 Base URL and the global prefix

`apps/api/src/main.ts`:

- `app.setGlobalPrefix('api', { exclude: [{ path: 'media/:prefix/:name', method: GET }] })`
- So **every** route in this document is `/api/<controller path>/<route path>` — with exactly one
  exception, `GET /media/:prefix/:name`, which is deliberately **not** under `/api`.
  The comment in `main.ts` explains why: `/api/*` is what the Next.js app rewrites onto its own
  origin, and attacker-uploaded bytes must never come back on the app origin.
- The server listens on `env.API_PORT` (`apps/api/src/config/env.ts`).
- `app.set('trust proxy', 1)` — a specific hop count, never `true`.
- `bodyParser: false` at bootstrap; `@thallesp/nestjs-better-auth`'s `AuthModule.forRoot`
  installs the JSON/urlencoded parsers for every route other than its own
  (`apps/api/src/auth/auth.module.ts`). Only `application/json` is parsed by default; the CSP
  report route installs its own parser for `application/csp-report` and
  `application/reports+json` (`apps/api/src/modules/security/security.module.ts`).
- **No CORS is configured anywhere.** `main.ts` says so explicitly. The web app reaches the API
  through a Next.js rewrite (`apps/web/next.config.ts`:
  `{ source: '/api/:path*', destination: '${API_ORIGIN}/api/:path*' }`), so the browser only ever
  sees one origin. A native mobile client is not subject to CORS, but **Flutter Web would be
  blocked outright**.

### 0.2 Authentication

Better Auth 1.6.25, mounted as raw middleware at `basePath: '/api/auth'`
(`apps/api/src/auth/auth.config.ts`). Session is a **cookie**, not a bearer token:

| | value |
|---|---|
| cookie name (production) | `__Host-session_token` |
| cookie name (development) | `session_token` |
| attributes | `httpOnly`, `Secure` (prod only), `SameSite=Lax`, `Path=/`, no `Domain` |
| lifetime | `expiresIn: 60*60*24*90` (90 days), rolling; `updateAge: 60*60*24` (one refresh write per day) |
| session cache | **deliberately absent** (`session.cookieCache` is not set) so `DELETE /api/sessions/:id` revokes immediately |

**Bearer tokens ARE supported** (added 2026-09-08, `apps/api/src/auth/auth.config.ts`):
`plugins: [bearer(), phoneNumber({...})]`, with `bearer()` registered **first** so its before-hook
injects the cookie before any other plugin's hook looks for a session.

- Every sign-in / sign-up response already returns the session token in its JSON body; the
  plugin's after-hook additionally emits a **`set-auth-token`** response header on any response
  that sets the session cookie. **Store that value** (Keychain / Android Keystore).
- Send it back as **`Authorization: Bearer <token>`**. It is HMAC-verified against
  `BETTER_AUTH_SECRET` and injected as the session cookie before the handler runs.
- It covers the **whole API**, not just `/api/auth/**`: `AuthGuard` calls
  `auth.api.getSession({ headers: toWebHeaders(request.headers) })` and `toWebHeaders` copies
  every incoming header including `authorization`; `auth.api.*` runs plugin hooks, so the token
  resolves there too.
- ⚠️ Do **not** send a cookie from a native client. Better Auth's origin check activates on
  `headers.has('cookie')` (`origin-check.mjs`), and a native request has no `Origin`, so it 403s.
  Send the bearer header and nothing else.
- ⚠️ Removing the plugin makes every mobile request **anonymous**, not 401 — public routes keep
  working and only signed-in ones break.

Every authenticated request still reads the session row from Postgres (no cookie cache), so
`DELETE /api/sessions/:id` revokes a device immediately for cookie and bearer callers alike.

`trustedOrigins: [env.APP_URL]` — Better Auth rejects any request whose `Origin` header is not
`APP_URL`.

**`AuthGuard` (`apps/api/src/auth/guards/auth.guard.ts`) is registered as a global `APP_GUARD`**
(from `AuthModule`). Behaviour:

1. `@Public()` on the handler or the controller class → allowed through, no session lookup.
2. Otherwise `auth.api.getSession(...)`. If it **throws** → `401` (fails closed, logged).
   If it returns `null` → `401 UnauthorizedException`.
3. On success it attaches `request.user` and `request.session`.
4. If the route carries `@RequirePermission('resource:action')` and
   `roleHasPermission(user.role, permission)` is false → `403 ForbiddenException`.

Never a role-equality check. `roleHasPermission` fails closed on an unknown/absent role.

### 0.3 Roles and permissions

`apps/api/src/auth/permissions.ts`. Roles: `'admin' | 'student'`.

- `admin: '*'` — holds every permission in the catalogue, including ones added later.
- `student` holds exactly:
  `profile:read`, `profile:write`, `course:read`, `enrollment:read`, `enrollment:create`,
  `progress:read`, `progress:write`, `quiz:read`, `quiz:attempt`, `payment:submit`,
  `book-order:submit`, `homework:submit`.

Full permission catalogue (the `PERMISSIONS` array, in order):

```
course:read  profile:read  profile:write
course:create  course:update  course:publish  course:delete  course:read-admin
section:write  section:reorder  lesson:write  lesson:reorder
enrollment:read  enrollment:create
progress:read  progress:write
question:read  question:write  quiz:read  quiz:write  quiz:attempt  quiz:grade
attempt:grade  analytics:read
admin:access
settings:read  settings:write  flags:read  flags:write  nav:read  nav:write
home:read  home:write  media:read  media:write  media:delete
taxonomy:read  taxonomy:write
student:read  student:write  student:role-change  student:ban  student:delete  student:set-password
attempt:read  attempt:unlock  audit:read
conversation:read  conversation:reply  conversation:close
outreach:read
news:read  news:write  news:publish
diagnostics:read  diagnostics:resolve
marketing:read  marketing:write  marketing:send  marketing:device
payment:submit  payment:read  payment:review
book-order:submit  book-order:read  book-order:ship  book-order:create  book-order:write
book:read  book:write
expense:read  expense:write
homework:submit  homework:read  homework:review
```

`GET /api/session` returns the caller's concrete permission list
(`permissionsForRole`) so a client can decide what to *render*. It is never the authorization
decision — the guard re-checks on every request.

### 0.4 CSRF — what a mobile client MUST send

`apps/api/src/modules/security/csrf.guard.ts`, registered as a second global `APP_GUARD` from
`SecurityModule`. It runs on every request. Rules, in order:

1. If the route is `@Public()` **and not** `@RequireCsrf()` → allowed, no checks.
2. If the method is `GET`, `HEAD` or `OPTIONS` → allowed (only `POST/PUT/PATCH/DELETE` are checked).
3. If an `Origin` header is present and `!== env.APP_URL` → `403 "CSRF: origin mismatch"`.
   An **absent** `Origin` is accepted.
4. If a `Sec-Fetch-Site` header is present and is not `same-origin` or `none` →
   `403 "CSRF: cross-site request"`. An **absent** header is accepted.
5. If the `x-csrf-token` header is missing or empty → `403 "CSRF: missing x-csrf-token header"`.

**The header's value is never validated.** Presence is the whole control
(`apps/web/lib/csrf.ts` documents this). The web app reads the value from a
non-`httpOnly` `__Host-csrf` cookie minted by `apps/web/proxy.ts` (a random UUID,
`secure: true`, `sameSite: 'strict'`, `path: '/'`) and echoes it, so the check *could* be
tightened into a real double-submit later.

Practical consequence for Flutter: **send `x-csrf-token: <any non-empty string>` on every
POST/PUT/PATCH/DELETE**, and either send no `Origin` header or send exactly `APP_URL`.
Do not send a `Sec-Fetch-Site` header (native clients don't).

⚠️ `CsrfGuard` was **not** relaxed for bearer callers — it runs before the handler on every
mutating request regardless of how the session was proved, so a bearer-authenticated app that
omits `x-csrf-token` gets `403 "CSRF: missing x-csrf-token header"` on every write.

`@RequireCsrf()` (`apps/api/src/modules/security/require-csrf.decorator.ts`) opts a `@Public()`
route back into all three checks. It is on: the assistant's public writes, the book-order public
writes, and (redundantly, since they are already non-public) the news/books/expenses/marketing
admin writes.

### 0.5 Error shape — the exception filter

`apps/api/src/common/filters/all-exceptions.filter.ts`, registered as the global `APP_FILTER`.
**Every** error response, without exception, has exactly this body:

```json
{
  "statusCode": 403,
  "message": "Forbidden Exception",
  "requestId": "5f1c…",
  "timestamp": "2026-09-08T12:00:00.000Z"
}
```

- `requestId` = the incoming `x-request-id` header if it is a string, else a fresh `randomUUID()`.
- `timestamp` = `new Date().toISOString()`.
- `message` resolution for an `HttpException`:
  - response payload is a string → that string;
  - payload is an object **with a `message` key** → `String(message)`, or `message.join('، ')`
    (Arabic comma + space) if it is an array;
  - otherwise → `exception.message`, which for an object payload without `message` is Nest's
    derived name, e.g. `"Forbidden Exception"`, `"Conflict Exception"`, `"Not Found Exception"`
    (`HttpException.initMessage`, `@nestjs/common` 11.1.28).
- A Prisma "record not found" (`P2025`) or data-validation error is mapped to **404 `"Not Found"`**
  (`apps/api/src/common/prisma/prisma-errors.ts`). A malformed id and an id matching nothing are
  the same answer.
- Anything else (not an `HttpException`) → **500 `"Internal server error"`**, with the stack logged
  server-side and nothing leaked.

**`code` — the machine-readable reason (added 2026-09-08).** When the thrown payload carries a
**string** `code`, the filter now copies it onto the body:

```json
{ "statusCode": 403, "message": "Forbidden Exception", "code": "quiz_not_open_yet",
  "requestId": "…", "timestamp": "…" }
```

`codeFromPayload` is deliberately strict — a non-string `code` is dropped rather than coerced
(`String(someObject)` would hand the app `"[object Object]"` to switch on) — and the key is
**absent**, never `null`, when there is no code (spread, not `code: undefined`), so an existing
consumer never starts seeing a null it did not have before. **Only `code` crosses the wire**; the
rest of the payload (ids, timestamps, row fragments) is still discarded.

> ⚠️ Still lost, and still a gap for a mobile client:
> `nestjs-zod`'s `ZodValidationException` body carries no `code`, so a 400 from
> `ZodValidationPipe` reaches the client as `{ statusCode: 400, message: "Validation failed" }`
> with the **`errors` array dropped**; `parseRequest`'s `{ message, issues }` likewise loses its
> **`issues`**. There is no per-field validation detail on the wire. And the `message` for an
> object payload with no `message` key is still Nest's derived English name
> (`"Forbidden Exception"`), so **branch on `code` + `statusCode`, never on `message`**.
> Some codes still arrive only inside a 200 body — e.g. `QuizOverview.blocked.code`.

### 0.6 Validation

Two mechanisms, with different failure text:

| mechanism | where | 400 body `message` |
|---|---|---|
| `ZodValidationPipe` from `nestjs-zod@5.5.0`, applied via `@UsePipes(ZodValidationPipe)` on a controller or handler, against a `createZodDto(Schema)` DTO | most write routes | `"Validation failed"` |
| `parseRequest(schema, value, what)` (`apps/api/src/common/http/parse-request.ts`) | hand-parsed query strings on admin list routes | `"invalid <what>"`, e.g. `"invalid list query"`, `"invalid filter"`, `"invalid sort"` |

`parseRequest` exists because a raw `Schema.parse()` on client input produced a **500** (a
`ZodError` is not an `HttpException`, and the filter fails closed). Its file header records the
real incident: `GET /api/admin/errors?perPage=40` answered `500`.

Almost every request schema in `packages/contracts` is `.strict()`: an unrecognised key is a
**400**, not a silently-stripped field. This closes mass assignment (`role`, `userId`,
`onboardingCompletedAt` all fail validation).

### 0.7 Pagination — there are three different conventions

**(a) Offset pagination, `ListQuerySchema`** (`packages/contracts/src/admin/list.ts`) — the admin
default:

```ts
ListQuerySchema = z.object({
  page:    z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().refine(n => [10,20,50,100].includes(n)).default(20),
  q:       z.string().max(120).default(''),
  dir:     z.enum(['asc','desc']).default('desc'),
})
```

`perPage` is a **closed set**: `10 | 20 | 50 | 100`. Anything else is a 400. Several modules
`.extend()`/`.omit()` this (see each route). Response shape:

```ts
ListResponse<T> = { rows: T[]; rowCount: number }   // rowCount = total matching, not page size
```

**(b) Cursor pagination**, used by the two student feeds:

- `GET /api/me/activity` → `ActivityFeed { entries, nextCursor: string | null }`
- `GET /api/me/notifications` → `NotificationFeed { entries, nextCursor: string | null }`

Query params: `?cursor=<opaque string>&limit=<int>`. `limit` default **20**, max **50**;
non-numeric / `<= 0` falls back to the default (`clampLimit` in both controllers).

**(c) `take`/`skip`**, used by the quiz admin routes:
`?take=50&skip=0`, `take` clamped to `Math.min(Number(take) || 50, 200)`.

**(d) Unpaginated on purpose**: `GET /api/admin/transfers` returns a fixed `PAGE_SIZE = 100`;
`GET /api/admin/books`, `GET /api/admin/news`, `GET /api/admin/navigation`,
`GET /api/admin/home-blocks`, `GET /api/admin/flags`, `GET /api/catalog/courses`,
`GET /api/books`, `GET /api/news` return everything.

### 0.8 Rate limiting

`apps/api/src/app.module.ts` registers `ThrottlerGuard` as a global `APP_GUARD`, backed by
Redis (`ThrottlerStorageRedisService`) so counters are shared across replicas.

Four named throttlers, all applied to every route unless overridden:

| name | window | limit | tracker |
|---|---|---|---|
| `short` | 1 s | 10 | session-keyed |
| `medium` | 60 s | 60 | session-keyed |
| `long` | 3600 s | 1000 | session-keyed |
| `ip` | 60 s | 1200 | IP-keyed |

Tracker functions (`apps/api/src/common/throttle/request-identity.ts`):

- `trackerFromRequest` → `sess:<sha256(value), base64url, first 22 chars>`, resolved in this
  order: the `__Host-session_token` cookie, the `session_token` cookie, then (added 2026-09-08,
  **for the native apps**) an `Authorization: Bearer <token>` header matched
  case-insensitively (`/^bearer\s+\S/i` — RFC 9110 §11.1 makes the scheme token
  case-insensitive and Dio capitalises it). Falls back to `ip:<request.ip>` for anonymous traffic.
  Without the bearer branch every signed-in mobile student would land in the IP bucket, and
  Egyptian carrier NAT would put a whole carrier's students into one `10/s` bucket.
  **Neither the cookie nor the token is validated before hashing** — a client that changes it per
  request mints a fresh bucket. Deliberate: this is fairness, not security; `ipTrackerFromRequest`
  is the ceiling.
- `ipTrackerFromRequest` → `ip:<cf-connecting-ip || request.ip || 'unknown'>` — the abuse ceiling
  the session key cannot provide.

Exceeded → **429** (the standard Nest throttler response, reshaped by the filter to the body in
§0.5, `message` = `"ThrottlerException: Too Many Requests"`).

`@SkipThrottle(SKIP_ALL_THROTTLERS)` — note the argument; a bare `@SkipThrottle()` skips nothing
because there is no throttler named `default`. Only `GET /api/health` uses it.

Per-route overrides (the full list; anything not here uses the global limits):

| route(s) | short | medium | long |
|---|---|---|---|
| `GET /api/taxonomy` | 300/1s | 3000/60s | 30000/1h |
| `GET /api/catalog/*` (controller-level) | 300/1s | 3000/60s | 30000/1h |
| `GET /api/settings/branding`, `GET /api/settings/public` | 300/1s | 3000/60s | 30000/1h |
| `GET /api/news`, `GET /api/news/:slug` | 300/1s | 3000/60s | 30000/1h |
| `GET /api/books` | 300/1s | 3000/60s | 30000/1h |
| `POST /api/lessons/:lessonId/heartbeat` | 2/1s | 15/60s | 500/1h |
| `POST /api/lessons/:lessonId/dwell` | 2/1s | 20/60s | — |
| `POST /api/assistant/conversations` | 1/10s | 3/600s | 5/1h |
| `POST /api/assistant/conversations/:id/messages` | 1/3s | 10/600s | — |
| `POST /api/assistant/ask` | 2/6s | 20/600s | 60/1h |
| `POST /api/book-orders`, `POST /api/book-orders/screenshot` | 1/10s | 3/600s | 10/1h |
| `POST /api/book-orders/:id/payment` | 1/5s | 5/600s | — |
| `POST /api/errors` | `default: 20/60s` (note: name `default` — see caveat below) | | |
| `POST /api/security/csp-report` | 20/10s | — | — |
| `GET /api/health` | **all skipped** | | |

> Caveat carried in the repo: `@Throttle({ default: { … } })` on `POST /api/errors` names a
> throttler (`default`) that this app does not configure, so it does not actually replace the
> global limits — the global `short/medium/long/ip` still apply. Stated here because a mobile
> client that batches error reports will hit `10/s` and `60/min`, not `20/min`.

Login itself has a **separate, non-throttler** control
(`apps/api/src/auth/login-throttle.service.ts`), keyed on the normalised identifier:
3 free attempts, then a progressive delay of `min(2^attempts, 30)` seconds injected server-side
(the request just takes longer); at 10 failures the identifier is locked for **15 minutes**.
The lock is **per identifier** — locked on the phone does not lock the email.

### 0.9 Response caching headers

`PrivateCacheInterceptor` (global `APP_INTERCEPTOR`, `apps/api/src/common/http/private-cache.interceptor.ts`):
every response on a route that is **not** `@Public()` gets
`Cache-Control: private, no-store` and `Vary: Cookie`, unless the handler already set a
`cache-control`. `@Public()` routes are left alone entirely.

Explicit per-route headers:

- `GET /media/:prefix/:name` → `Cache-Control: public, max-age=31536000, immutable`,
  `Cross-Origin-Resource-Policy: cross-origin`, `Access-Control-Allow-Origin: *`.
- All authenticated file streams (lesson resources, homework images, payment/book-order
  screenshots, assistant attachments) → `Cache-Control: private, no-store`,
  `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`.
- SSE routes → `Cache-Control: private, no-store, no-transform`, `Connection: keep-alive`,
  `X-Accel-Buffering: no`.

### 0.10 The public / authenticated / admin split

**Public routes — the complete, test-enforced list.**
`apps/api/src/test/authorization-matrix.int-spec.ts` → `it('marks nothing public by accident')`
asserts this exact set. Adding a `@Public()` route without amending that array fails CI.

```
GET  /api/health
GET  /api/taxonomy
GET  /api/catalog/courses
GET  /api/catalog/courses/:slug
GET  /api/settings/branding
GET  /api/settings/public
GET  /api/flags
GET  /api/navigation
GET  /api/home-blocks
GET  /api/news
GET  /api/news/:slug
GET  /api/books
GET  /media/:prefix/:name                                  (no /api prefix)
GET  /api/assistant/conversations/mine
GET  /api/assistant/conversations/mine/summary
GET  /api/assistant/conversations/:id/messages/:messageId/attachment
POST /api/assistant/conversations                          (+ @RequireCsrf)
POST /api/assistant/conversations/:id/messages             (+ @RequireCsrf)
POST /api/assistant/conversations/:id/read                 (+ @RequireCsrf)
POST /api/assistant/ask                                    (+ @RequireCsrf)
POST /api/errors
POST /api/marketing/wa/inbound                             (gated by x-wa-token)
POST /api/ingest/transfers                                 (gated by x-instapay-token)
POST /api/security/csp-report
POST /api/book-orders                                      (+ @RequireCsrf)
POST /api/book-orders/screenshot                           (+ @RequireCsrf)
POST /api/book-orders/:id/payment                          (+ @RequireCsrf)
GET  /api/book-orders/:id
```

**Authenticated but permission-free** (session only, ownership enforced in the query):
`GET /api/session`, `GET /api/sessions`, `DELETE /api/sessions/:id`.

**Everything else** requires a session **and** the `@RequirePermission(...)` named per route below.
Every route under `/api/admin/**` is admin-only in practice, because only `admin: '*'` holds the
permissions those routes name.

### 0.11 The authorization matrix — read this before changing the backend

`apps/api/src/test/authorization-matrix.int-spec.ts` (2131 lines) boots four real Nest
applications with a faked `getSession` — **anonymous, student, other-student, admin** — and drives
real HTTP requests with `supertest` against the real `AuthGuard` and the real permission map.
It deliberately excludes `AuthModule` (real Better Auth is ESM-only) and `SecurityModule` (the CSRF
guard), because its job is *who may call what*, not session issuance or CSRF.

Two meta-tests make it a **coverage gate**:

1. `it('accounts for every registered route across this file, quiz.authz.spec.ts, or a documented gap')`
   — `enumerateRoutes(app)` (`apps/api/src/test/route-inventory.ts`) walks Nest's DI container and
   reflects `PATH_METADATA` / `METHOD_METADATA` / `IS_PUBLIC_KEY` / `PERMISSION_KEY` off every
   controller, producing `{ method, path, controller, handler, isPublic, permission }` for every
   registered route (the `api` prefix is re-added by hand — `setGlobalPrefix` is not in metadata).
   Any route not matched by a `MATRIX` row, not in `COVERED_BY_QUIZ_AUTHZ_SPEC`, and not in
   `KNOWN_GAPS` fails the test with its `METHOD /path` printed.
   A row matches a route when the segment counts are equal and every static segment is identical
   (a `:param` position matches anything); the query string is stripped before comparing.
2. `it('marks nothing public by accident')` — asserts the exact sorted list in §0.10.

`KNOWN_GAPS` (routes intentionally uncovered, each with a stated reason — all multipart uploads
that would need a magic-byte-valid image fixture, or non-browser token-gated ingest):

```
POST /api/media                 POST /api/profile/avatar
POST /api/payments/screenshot   POST /api/book-orders/screenshot
POST /api/ingest/transfers      POST /api/marketing/wa/inbound
POST /api/lessons/:lessonId/heartbeat
```

`COVERED_BY_QUIZ_AUTHZ_SPEC` delegates ~39 quiz routes to
`apps/api/src/modules/quiz/quiz.authz.spec.ts` (a 64-case table).
Note: that set still names five routes that no longer exist
(`.../questions/:slotPosition/check`, `POST /api/quiz/attempt-questions/:id/appeals`,
`GET /api/quiz/attempts/:attemptId/appeals`, `GET /api/admin/appeals`,
`PATCH /api/admin/appeals/:id`) — it is an allowlist, so stale entries are harmless.

**Any backend change driven by the mobile app must add rows to this file**: one row per
(route × actor) it wants asserted, or a new `KNOWN_GAPS` entry with a written reason. A new
endpoint with no row is a red CI run, not a silent hole.

---

## 1. Better Auth — `/api/auth/*`

These routes are **not** Nest controllers. `AuthModule.forRoot({ auth, disableGlobalAuthGuard: true })`
mounts Better Auth's own HTTP handler as raw middleware at `basePath: '/api/auth'`, ahead of Nest's
router, so `AuthGuard`, `CsrfGuard` and `ThrottlerGuard` **do not run on them**
(`apps/api/src/auth/auth.module.ts`, `apps/api/src/auth/auth.config.ts`). They also do **not**
appear in `enumerateRoutes()` and therefore carry no authorization-matrix row.

Configuration that changes the wire contract:

- `emailAndPassword.enabled = true`; passwords hashed with **argon2id**, explicit parameters
  (`apps/api/src/auth/argon2-options.ts`).
- `user.additionalFields.role` — `type: ['admin','student']`, `defaultValue: 'student'`,
  **`input: false`** → a body containing `{"role":"admin"}` is silently ignored by Better Auth.
- `user.additionalFields.email` re-declares the **core** field as `required: false` — an account
  may legitimately have no email.
- `socialProviders.google` registered only when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
  are set; `apple` only when all four `APPLE_*` vars are set.
  `account.accountLinking.trustedProviders = []` → an OAuth account is never auto-linked when the
  provider reports `email_verified: false`.
- `plugins: [bearer(), phoneNumber({...})]`.
  **`bearer()`** (registered first) is what lets the Flutter app hold a session — see §0.2.
  It adds a before-hook that HMAC-verifies `Authorization: Bearer <token>` against
  `BETTER_AUTH_SECRET` and injects it as the session cookie, and an after-hook that emits a
  **`set-auth-token`** response header on every response that sets the session cookie.
  Imported from the narrow subpath `better-auth/plugins/bearer`, never the
  `better-auth/plugins` barrel.
- **`phoneNumber({...})`** contributes `users.phone_number` / `phone_number_verified` and
  **`POST /api/auth/sign-in/phone-number`**. It does **not** create accounts:
  there is no `/sign-up/phone-number`, `signUpOnVerification` is absent, and
  `requireVerification` is left off.
- `sendOTP` **throws on purpose**: `APIError('NOT_IMPLEMENTED', { code: 'OTP_NOT_CONFIGURED',
  message: 'لسه مفيش طريقة نبعت بيها كود التأكيد — رسالة للدعم.' })`. There is no SMS/WhatsApp
  sender in this codebase, so every OTP path (`/phone-number/send-otp`, `/phone-number/verify`,
  `/phone-number/request-password-reset`, `/phone-number/reset-password`) fails loudly.
  **There is therefore no password-reset flow at all on this platform.**

### 1.1 Routes a client actually calls

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/auth/sign-up/email` | `{ name, email, password, phoneNumber }` | The only account-creating path. `phoneNumber` is required in practice (see the hook). |
| POST | `/api/auth/sign-in/email` | `{ email, password }` | |
| POST | `/api/auth/sign-in/phone-number` | `{ phoneNumber, password }` | |
| POST | `/api/auth/sign-out` | `{}` | |
| GET | `/api/auth/get-session` | — | Better Auth's own session echo. Prefer `GET /api/session` (§2.1). |

Every response above that establishes a session also carries **`set-auth-token: <token>`**
(the `bearer()` plugin's after-hook). A native client stores that value and sends it as
`Authorization: Bearer <token>` on every subsequent request — including to the Nest routes,
not just `/api/auth/*`.
| GET | `/api/auth/sign-in/social?provider=google` … | — | Standard Better Auth OAuth entry/callback. |

### 1.2 The single `hooks.before` — phone normalisation, sign-up guard, login hardening

`apps/api/src/auth/login-security.hook.ts` + `apps/api/src/auth/phone-identity.ts`.

**Phone normalisation** runs on every request whose path is `/sign-up/email` or one of
`/sign-in/phone-number`, `/phone-number/send-otp`, `/phone-number/verify`,
`/phone-number/request-password-reset`, `/phone-number/reset-password`:

- `normalizeEgyptianPhone(value)` (`packages/contracts/src/phone.ts`) parses with
  `libphonenumber-js` against embedded EG metadata, requires `isValid()` **and** `country === 'EG'`,
  and returns **E.164** (`+201XXXXXXXXX`). Arabic-Indic and Persian digits are converted first
  by `toAsciiDigits`.
- On `/sign-up/email`: a missing phone → `400 { code: 'INVALID_PHONE_NUMBER', message: 'رقم الموبايل مطلوب' }`;
  an unparseable phone → `400 { code: 'INVALID_PHONE_NUMBER', message: 'رقم الهاتف يجب أن يكون رقمًا مصريًا صحيحًا' }`.
- On `/sign-up/email` **with no email**: a placeholder address is injected into the request body,
  `<digits without +>@phone.invalid` (`placeholderEmailForPhone`), purely to get past Better Auth's
  own `z.email()` gate. `databaseHooks.user.create.before` strips it, so the stored `email` is
  `NULL`. `isPlaceholderEmail()` is the detector; `GET /api/session` already nulls it out.
- On the sign-in/OTP paths a bad phone is left alone (so it falls through to the ordinary generic
  failure rather than becoming a distinguishable "bad format" branch).

**Sign-up: phone already registered** → `422 { code: 'PHONE_ALREADY_REGISTERED', message: 'هذا الرقم لديه حساب بالفعل' }`.
This is the *one* deliberately specific auth error; the file explains why sign-in stays silent and
sign-up does not. Without it the answer is the opaque `422 FAILED_TO_CREATE_USER`, which the web
maps to «مقدرناش نعمل الحساب. البيانات محتاجة مراجعة» — the recorded production symptom.

**Sign-in** (`/sign-in/email` and `/sign-in/phone-number`):

1. `LoginSecurityService.evaluate(identifier, password, ip)` performs **exactly one** argon2 verify
   per attempt — against the real hash, or against a precomputed dummy of identical cost when no
   account exists — so timing cannot be used to enumerate accounts.
2. `result.delayMs` is slept server-side before answering (see §0.8 for the schedule).
3. Failure → `401` with one identical generic body for every cause.
4. **Only after the password verifies** is the ban checked →
   `403 { code: 'ACCOUNT_BANNED', message: … }`. Checking earlier would be an enumeration oracle.
   The enforcing half is `databaseHooks.session.create.before` in `auth.config.ts`, which refuses
   the session write on *every* path including Google.
5. `resolveClientIp` reads the **last** hop of `x-forwarded-for`, else `'direct'`.

Client-side validation contract for the two forms
(`packages/contracts/src/auth.ts` — used by the web, mirror it in Flutter):

```ts
LoginSchema = z.object({
  identifier: z.string().trim().min(1, 'رقم موبايلك أو إيميلك'),
  password:   z.string().min(1, 'كلمة المرور مطلوبة'),
}).strict()

resolveLoginIdentifier(identifier) ->
  contains '@'                -> { kind: 'email', value: trimmed }
  normalizeEgyptianPhone ok    -> { kind: 'phone', value: E.164 }
  otherwise                    -> { kind: 'email', value: trimmed }   // let the server refuse

RegisterSchema = z.object({
  name:            z.string().trim().min(2, 'الاسم الكامل مطلوب').max(120, 'الاسم طويل جدًا'),
  phone:           egyptianPhone('رقم الموبايل مطلوب'),          // -> E.164
  email:           optional; '' becomes undefined; else z.email('أدخل بريدًا إلكترونيًا صحيحًا'),
  password:        z.string().min(8, 'كلمة المرور لازم تكون 8 أحرف على الأقل').max(128, 'كلمة المرور طويلة جدًا'),
  confirmPassword: z.string().min(1, 'تأكيد كلمة المرور مطلوب'),
}).strict().superRefine(password === confirmPassword else 'كلمتا المرور غير متطابقتين' on confirmPassword)
```

`egyptianPhone(msg)` error string on an unparseable number: **`'رقم الهاتف يجب أن يكون رقمًا مصريًا صحيحًا'`**.

---

## 2. Session and devices

### 2.1 `GET /api/session` — `SessionController`

`apps/api/src/auth/session.controller.ts`. **No decorator at all** — deliberately: it is the
minimal "am I logged in" echo and doubles as a live proof that `AuthGuard` denies by default.

- Auth: session required. Permission: none. CSRF: n/a (GET).
- 200 body:

```ts
{
  id: string,
  email: string | null,        // null when the student never gave one
  phoneNumber: string | null,  // E.164; the account's real identity
  name: string,
  image: string | null,        // a storage key ("ab/uuid.webp") for our uploads,
                               // or a full https://lh3.googleusercontent.com/… URL for Google
  role: string,                // 'admin' | 'student'
  permissions: string[]        // the concrete list for that role
}
```

- 401 when unauthenticated.

### 2.2 `SessionsController` — `/api/sessions` («أجهزتي»)

`apps/api/src/modules/sessions/sessions.controller.ts`. No `@RequirePermission` on purpose:
self-scoped; ownership lives in the query.

| Method | Path | Guard | Response |
|---|---|---|---|
| GET | `/api/sessions` | session only | `SessionDeviceView[]` |
| DELETE | `/api/sessions/:id` | session only | **204**, empty body |

```ts
SessionDeviceView = {
  id: string,
  deviceName: string,
  deviceType: string,
  ip: string | null,
  lastSeenAt: string,   // ISO
  loggedInAt: string,   // ISO
  isCurrent: boolean,   // true for the session answering this request
}
```

Ordered `lastSeenAt` desc, filtered `revokedAt: null`.

`DELETE` returns **404, never 403**, for someone else's / a nonexistent / an already-revoked id —
a 403 would confirm the id belongs to *someone*. Revocation is immediate because there is no
session cookie cache. CSRF header required.

---

## 3. Public reference data

### 3.1 `GET /api/health` — `HealthController`

`@Public()`, `@SkipThrottle(SKIP_ALL_THROTTLERS)`. No auth, no rate limit (a Redis outage must not
take the container down through its own healthcheck).

```ts
{ status: 'ok' | 'degraded', service: 'ayman-api', database: 'up' | 'down', startedAt: string }
```

`startedAt` is captured at module import, second precision (`…Z`, no millis) — a **restart marker**
used by the deploy job, not a clock.

### 3.2 `GET /api/taxonomy` — `TaxonomyController`

`@Public()`, throttle 300/1s · 3000/60s · 30000/1h. Needed by the onboarding form before a user
exists. Response `Taxonomy` (`packages/contracts/src/taxonomy.ts`):

```ts
Taxonomy = {
  governorates: Governorate[],
  pinnedGovernorateCodes: string[],      // each exactly 2 chars; pinned to the top of the dropdown
  systems: EducationSystem[],
}

Governorate = {
  code: string(len 2), nameAr: string(min 1), slug: string(min 1),
  region: 'urban' | 'lower' | 'upper' | 'frontier',
  sortOrder: int,
}

EducationSystem = {
  id: string, slug: string, nameAr: string,
  totalMarks: int > 0, passPercent: number 0..100, allowsRetakes: boolean,
  years: AcademicYear[], tracks: Track[],
}

AcademicYear = { year: int 1..3, labelAr: string, badgeAr: string }

Track = {
  id: string, slug: string, labelAr: string,
  minYear: int,                 // tracks start at year 2; year 1 has no track
  electiveGroups: ElectiveGroup[],   // empty for every ثانوية عامة track
}

ElectiveGroup = { id: string, year: int, labelAr: string, pickCount: int > 0, options: ElectiveOption[] }

ElectiveOption = {
  id: string,          // SubjectOffering.id — this is what you submit as electiveSubjectId
  subjectId: string,   // Subject.id — different value, used by the admin course editor
  subjectSlug: string,
  nameAr: string,
}
```

### 3.3 `GET /api/settings/branding` and `GET /api/settings/public` — `SettingsController`

Both `@Public()`, both throttled 300/1s · 3000/60s · 30000/1h.
(The admin half of this controller is in §9.1.)

```ts
BrandingRead = {
  accent: 'amber'|'cyan'|'blue'|'violet'|'magenta'|'slate',   // default 'amber'
  radius: 'sharp'|'default'|'soft',                            // default 'default'
  logoLightAssetId: string(uuid) | null,
  logoDarkAssetId:  string(uuid) | null,
  faviconAssetId:   string(uuid) | null,
  logoLightKey: string | null,   // resolved storage key, for building a media URL
  logoDarkKey:  string | null,
  faviconKey:   string | null,
}

PublicSettingsRead = {
  seo: {
    titleAr: string(max 70), descriptionAr: string(max 160),
    ogImageAssetId: string(uuid) | null, ogImageKey: string | null,
  },
  contact: {
    email: string(email) | null,
    phone: string(/^\+[1-9]\d{7,14}$/) | null,
    whatsapp: same | null,
    facebook | youtube | telegram | instagram | tiktok |
      whatsappChannel | whatsappGroup | facebookGroup: https:// URL | null,
    vodafoneCash: phone | null,
    instapay: phone | null,
  },
}
```

### 3.4 `GET /api/flags`, `GET /api/navigation`, `GET /api/home-blocks`

All three `@Public()`, no per-route throttle (global limits apply).

- `GET /api/flags` → `FeatureFlag[]`: `{ key, descriptionAr, enabled, updatedAt: string }`.
  Declared keys and defaults (`packages/contracts/src/admin/flags.ts`):
  `catalog.showComingSoon` (false), `quiz.practiceMode` (true),
  `quiz.showReviewAfterSubmit` (true), `player.trackProgress` (true),
  `onboarding.askParentPhones` (true), `home.showTestimonials` (false),
  `sessions.enforceDeviceLimit` (false).
  `isEnabled(flags, key)` falls back to the declared default when the row is absent.
- `GET /api/navigation` → `NavigationTree` = array of
  `{ id, parentId: string|null, labelAr, href, icon: string|null, position: int,
     visibleTo: string[], isPublished: boolean, children: NavigationItem[] }`.
- `GET /api/home-blocks` → `HomeBlock[]` = `{ id, key, position: int, isPublished: boolean, props }`
  where `props` is the discriminated union on `type`:
  `hero | whyRail | courseGrid | books | instructor | yearTracks | about | stats | testimonials | faq | cta`
  (full field lists in `packages/contracts/src/admin/home-blocks.ts`).

### 3.5 `GET /api/news`, `GET /api/news/:slug` — `NewsController` (public half)

Both `@Public()`, throttled 300/1s · 3000/60s · 30000/1h. The service filters `status: 'published'`
in SQL, so a draft is genuinely unreachable, not merely unlinked.

```ts
NewsList = { posts: NewsListItem[], total: int }

NewsListItem = {
  id: uuid, slug: string, title: string, excerpt: string,
  coverKey: string | null,
  publishedAt: ISO datetime, updatedAt: ISO datetime,
  readingMinutes: int >= 1,        // ceil(words/180), min 1
}

NewsPostDetail = NewsListItem & {
  body: string,                    // markdown-ish; a hand-written subset, no tables
  relatedCourseSlug: string | null,
  relatedCourseTitle: string | null,
}
```

`GET /api/news/:slug` → **404** when not found or not published.

### 3.6 `GET /api/books` — `BooksController`

`@Public()`, throttled 300/1s · 3000/60s · 30000/1h. The service filters `isActive: true` in SQL.

```ts
BookCatalog = { shelves: BookShelf[], shippingCents: int >= 0, total: int >= 0 }

BookShelf = {
  subjectId: uuid | null, subjectNameAr: string, subjectSlug: string | null,
  first: BookCard[], second: BookCard[], full: BookCard[],   // grouped by term
}

BookCard = {
  id: uuid, slug: string, titleAr: string, subtitleAr: string | null,
  coverKey: string | null, descriptionAr: string | null,
  priceCents: int >= 0, comparePriceCents: int >= 0 | null,
  pageCount: int >= 1 | null,
  term: 'first' | 'second' | 'full',
  year: int 1..3 | null,
  inStock: boolean, forGeneral: boolean, forLanguages: boolean, showOnLanding: boolean,
}
```

Constants: `BOOK_SHIPPING_CENTS = 6500`, `MAX_BOOK_QUANTITY = 20`, `MAX_CART_LINES = 20`
(`packages/contracts/src/books.ts`).

### 3.7 `GET /media/:prefix/:name` — `MediaController.serve` (**no `/api` prefix**)

`@Public()`. Streams the object at storage key `` `${prefix}/${name}` ``.

- 404 when the key is unknown.
- Headers: `Content-Type: image/webp`, `Content-Length`, `X-Content-Type-Options: nosniff`,
  `Content-Disposition: inline; filename="<name>"`,
  `Cache-Control: public, max-age=31536000, immutable`,
  `Content-Security-Policy: default-src 'none'; sandbox`,
  `Cross-Origin-Resource-Policy: cross-origin`, `Access-Control-Allow-Origin: *`.
- Two path segments only. Every private prefix (`doc/`, `msg/`, `payment-proof/`,
  `book-order-proof/`, `hw/`) is **three** segments precisely so it cannot be served here.
  `packages/contracts/src/admin/media.ts` holds the patterns:

```
STORAGE_KEY_PATTERN            ^[0-9a-f]{2}/[0-9a-f-]{36}\.webp$
DOCUMENT_KEY_PATTERN           ^doc/[0-9a-f]{2}/[0-9a-f-]{36}\.(pdf|pptx|docx|xlsx)$
CONVERSATION_KEY_PATTERN       ^msg/[0-9a-f]{2}/[0-9a-f-]{36}\.(webp|pdf|pptx|docx|xlsx)$
PAYMENT_PROOF_KEY_PATTERN      ^payment-proof/[0-9a-f]{2}/[0-9a-f-]{36}\.webp$
BOOK_ORDER_PROOF_KEY_PATTERN   ^book-order-proof/[0-9a-f]{2}/[0-9a-f-]{36}\.webp$
HOMEWORK_KEY_PATTERN           ^hw/[0-9a-f]{2}/[0-9a-f-]{36}\.webp$
```

Base URL for building media links: `env.MEDIA_BASE_URL` (default
`http://localhost:3300/media`); on the web it is `NEXT_PUBLIC_MEDIA_ORIGIN`. **URLs are never
persisted** — only keys — because the media origin is a different host and baking it into a row
makes moving it a data migration.

---

## 4. Catalog (public) — `CatalogController`

`@Controller('catalog')` with a controller-level `@Throttle({ short: 300/1s, medium: 3000/60s,
long: 30000/1h })`. Both routes `@Public()`. The generous budget exists because `next build`
statically generates one page per published course and would blow through `10/s`.

### `GET /api/catalog/courses`

Query: `?stream=general|languages`. Parsed with `CatalogStreamFilterSchema.safeParse` — anything
else (including `both`) becomes `undefined`, i.e. **no filter, full list**. A typo returns
everything, never an empty page.

```ts
CatalogList = { courses: CatalogCourse[], total: int >= 0 }

CatalogCourse = {
  contentComplete: boolean,
  id: uuid, slug: string, title: string, subtitle: string | null,
  systemSlug: string, systemNameAr: string,
  year: int 1..3,
  trackLabelAr: string | null,
  subjectNameAr: string,
  coverKey: string | null,
  lessonCount: int >= 0, totalSeconds: int >= 0,
  forGeneral: boolean, forLanguages: boolean,
  emphasis: 'required'|'recommended'|'optional' | null,
  emphasisNote: string | null,
  monthlyPriceCents: int | null,
  quarterlyPriceCents: int | null,
  yearlyPriceCents: int | null,
  bookTitle: string | null,      // ⚠️ in production this column holds CTA copy, not a book name
  bookPriceCents: int | null,
  publishedAt: ISO datetime, updatedAt: ISO datetime,
}
```

### `GET /api/catalog/courses/:slug`

```ts
CatalogCourseDetail = CatalogCourse & {
  description: string | null,
  terms: { id: uuid, title: string, priceCents: int }[],
  sections: {
    id: uuid, title: string, summary: string | null,
    lessons: {
      id: uuid, title: string,
      kind: 'video'|'quiz'|'attachment'|'text',
      estimatedSeconds: int >= 0,
      isFreePreview: boolean,
      durationSeconds: int >= 0 | null,
      forGeneral: boolean, forLanguages: boolean,
    }[]
  }[],
  comingSoonNote: string | null,
}
```

Helper: `isComingSoon(realLectureCount) === realLectureCount === 0`.

> Product fact worth knowing before building filters: **the catalog does not filter by academic
> year.** `year` is a label on the card, not a gate — every student sees every course.

---

## 5. Student profile and onboarding — `ProfileController` (`/api/profile`)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/profile/me` | `profile:read` | |
| PATCH | `/api/profile/onboarding` | `profile:write` | `ZodValidationPipe` |
| PATCH | `/api/profile/section` | `profile:write` | `ZodValidationPipe` |
| POST | `/api/profile/avatar` | `profile:write` | multipart, field `file` |
| POST | `/api/profile/whatsapp-opened` | `profile:write` | **204**, idempotent |

`userId` is **never** read from a body — always `@CurrentUser()`. Both PATCH schemas are
`.strict()`, so `role` / `userId` / `onboardingCompletedAt` are a **400**, not a stripped field.

### `GET /api/profile/me`

```ts
{ userId: string, onboardingCompleted: boolean, profile: StudentProfile | null }
```

`profile` is the raw Prisma row (`apps/api/prisma/schema.prisma` → `model StudentProfile`):

```
userId, fullName, gender ('male'|'female'), phone (E.164, citext unique — a MIRROR of
User.phoneNumber), phoneVerifiedAt (never written), governorateCode (char 2), schoolName,
schoolStream ('general'|'languages'|null), fatherPhone, motherPhone (no longer collected),
systemId, year, trackId, electiveSubjectId, onboardingCompletedAt, whatsappOpenedAt,
createdAt, updatedAt
```

`onboardingCompleted === (profile?.onboardingCompletedAt != null)`.

### `PATCH /api/profile/onboarding` — `OnboardingSchema` (`packages/contracts/src/onboarding.ts`)

```ts
{
  fullName:         z.string().trim().min(2, 'الاسم الكامل مطلوب').max(120),
  gender:           'male' | 'female',
  phone:            egyptianPhone('رقم الهاتف مطلوب'),        // -> E.164
  governorateCode:  z.string().length(2, 'لازم نحدد المحافظة'),
  schoolName:       z.string().trim().min(1, 'اسم المدرسة مطلوب').max(200),
  schoolStream:     'general' | 'languages',
  fatherPhone:      egyptianPhone('هاتف الأب مطلوب'),
  system?:          'bacalorya' | 'thanaweya_amma',
  year:             z.number({ error: 'لازم نحدد الصف الدراسي' }).int().min(1).max(3),
  trackId?:         z.string().min(1),
  electiveSubjectId?: z.string().min(1),
}.strict().superRefine(refineSection)
```

`refineSection` cross-field rules (identical for both PATCH routes):

| condition | issue path | Arabic message |
|---|---|---|
| `year === 1 && trackId !== undefined` | `trackId` | `الصف الأول لا يختار مسارًا بعد` |
| `trackId !== undefined && system === undefined` | `system` | `لازم نحدد النظام الدراسي الأول` |
| `electiveSubjectId !== undefined` while **not** (`system === 'bacalorya' && year === 2`) | `electiveSubjectId` | `المادة الاختيارية غير متاحة في هذه الحالة` |
| `electiveSubjectId !== undefined && trackId === undefined` | `trackId` | `لازم نحدد المسار الأول` |

Deliberately **not** enforced: "بكالوريا year 2 must carry an elective". The student is no longer
asked — the client fills system/track/elective from the taxonomy and the only visible question is
the year.

Response: the written `StudentProfile` row.
A phone collision maps Prisma `P2002` to **409**.

### `PATCH /api/profile/section` — `StudentSectionSchema`

The four section fields only, `.strict()`, same `refineSection`:
`{ system?, year, trackId?, electiveSubjectId? }`. Response: `StudentProfile`.

### `POST /api/profile/avatar`

`multipart/form-data`, single field **`file`**, `memoryStorage`,
`limits: { fileSize: MAX_AVATAR_BYTES = 2 * 1024 * 1024, files: 1 }`.
Missing file → `400 "no file uploaded"`. Response `{ image: string }` — a **storage key**
(`ab/uuid.webp`), re-encoded to WebP at `AVATAR_SIZE_PX = 512`. The previous asset is archived,
not deleted. Uses `profile:write`, deliberately **not** `media:write`.

### `POST /api/profile/whatsapp-opened`

Empty body, **204**, idempotent (writes only while the column is null). Fire-and-forget from a
click handler racing a navigation to WhatsApp.

---

## 6. Enrollment, dashboard, path, activity

### 6.1 `EnrollmentController` (no controller prefix)

| Method | Path | Permission |
|---|---|---|
| POST | `/api/courses/:courseId/enroll` | `enrollment:create` |
| GET | `/api/enrollments` | `enrollment:read` |

`POST .../enroll` — no body. `user.id` comes from the session; there is no user id anywhere in the
route. Idempotent (`upsert` on `(userId, courseId)`), so tapping «ابدأ الكورس» twice resumes rather
than erroring. Returns:

```ts
{ enrollmentId: string, access: CourseAccess, resumeLessonId: string | null }
```

`resumeLessonId` exists so the primary action costs **one** round trip.

Errors:
- **404** — course missing or `status !== 'published'`.
- **403** — entitlement refused *before* the enrollment row is created. The reason string is the
  exception payload's `message`… except it is passed as a bare string
  (`throw new ForbiddenException(access.reason)`), so it **does** survive the filter. Possible
  values (`CourseAccess`, `apps/api/src/modules/entitlement/entitlement.service.ts`):
  `no_grant`, `not_yet_valid`, `expired`, `revoked`, `course_not_published`,
  `needs_course_grant`, `needs_term_grant`.
  Product meaning: `needs_course_grant` → «الكورس ده مقفول»; `expired` → «انتهت صلاحيتك»;
  `needs_term_grant` → «لازم تشترك في الترم ده».

`GET /api/enrollments` → `EnrollmentDto[]`:

```ts
{
  id: string, courseId: string, courseSlug: string,
  status: 'active'|'suspended'|'expired'|'revoked'|'completed',
  progressPercent: number 0..100,
  lastLessonId: string | null,
  enrolledAt: ISO datetime,
  completedAt: ISO datetime | null,
}
```

### 6.2 `GET /api/me/dashboard` — `DashboardController` · `enrollment:read`

No id parameter anywhere under `/api/me/*` — that uniformity **is** the IDOR defence.

```ts
Dashboard = {
  continueWatching: {
    courseId, courseSlug, courseTitle, lessonId, lessonTitle,
    lessonKind: 'video'|'quiz'|'attachment'|'text',
    progressPercent: 0..100, remainingSeconds: int >= 0,
  } | null,
  enrolledCourses: {
    id, slug, title, coverKey: string|null, subjectNameAr,
    whatsappGroupUrl: string|null, published: boolean,
    progressPercent: 0..100, completedLessons: int, totalLessons: int,
    lastLessonId: string|null,
    subscriptionValidUntil: ISO datetime | null,
    comingSoonNote: string|null, contentComplete: boolean,
    bookTitle: string|null, bookPriceCents: int|null, scheduleNote: string|null,
  }[],
  recentScores: {
    attemptId, quizTitle, courseSlug, scorePercent: 0..100, submittedAt: ISO datetime,
  }[],                                   // the last five; the full history is GET /api/me/quizzes
  totalWatchedSeconds: int >= 0,
  pendingExams: { courseId, courseSlug, courseTitle, lessonId, lessonTitle }[],
}
```

### 6.3 `GET /api/me/path` — `DashboardController.path_` · `enrollment:read`

```ts
LearningPath = {
  courses: {
    id, slug, title, subjectNameAr, coverKey: string|null, published: boolean,
    progressPercent: 0..100, clearedLessons: int, totalLessons: int,
    contentComplete: boolean, whatsappGroupUrl: string|null,
    nextLessonId: string|null,
    nodes: {
      id, lessonId, title,
      kind: 'video'|'quiz'|'attachment'|'text',
      state: 'not_started'|'in_progress'|'completed'|'passed'|'failed',
      gate:  'cleared'|'available'|'locked',
      isExam: boolean,
    }[],
  }[],
  currentCourseId: string | null,
  clearedLessons: int, totalLessons: int, percent: 0..100,
}
```

The lock states come from the same resolver the lesson routes enforce, not a second computation.

### 6.4 `GET /api/me/activity` — `ActivityController` · `progress:read`

Query `?cursor=<string>&limit=<int>`. `limit` default 20, max 50; junk → default.

```ts
ActivityFeed = { entries: ActivityEntry[], nextCursor: string | null }

// discriminated on `kind`; all three share:
//   id, occurredAt (ISO), lessonId, lessonTitle, courseTitle, courseSlug
{ kind: 'watched',   secondsWatched: int >= 0 }
{ kind: 'completed', completedVia: 'auto'|'manual'|'dwell' | null }
{ kind: 'quiz',      attemptId: string, attemptNo: int >= 1,
                     scorePercent: 0..100, passed: boolean | null }
```

---

## 7. Player and progress

### 7.1 `PlayerController` (no controller prefix) — all four routes `course:read`

| Method | Path | Response |
|---|---|---|
| GET | `/api/courses/:slug/outline` | `CourseOutline` |
| GET | `/api/lessons/:lessonId/player` | `LessonPlayer` |
| GET | `/api/lessons/:lessonId/resources/:resourceId/view` | streamed bytes, `inline` |
| GET | `/api/lessons/:lessonId/resources/:resourceId/download` | streamed bytes, `attachment` |

Errors: **404** `'course not found'` / `'resource not found'`; **403** with the entitlement reason
string when a lapsed grant is detected mid-course (`LAPSED_GRANT_REASONS`), or when a term grant
does not cover this lesson's term (`revoked` / `needs_term_grant`).

```ts
CourseOutline = {
  course: {
    id, slug, title,
    bookTitle: string|null, bookPriceCents: int|null,
    coverKey: string|null, subjectNameAr: string,
    contentComplete: boolean, whatsappGroupUrl: string|null,
  },
  sections: { id, title, position: int, lessons: OutlineLesson[] }[],
  enrollmentId: string,
  progressPercent: 0..100,
  lastLessonId: string|null,
  completedLessons: int, totalLessons: int, totalEstimatedSeconds: int,
  examLessonId: string|null,
}

OutlineLesson = {
  id, title, kind: 'video'|'quiz'|'attachment'|'text', position: int,
  estimatedSeconds: int|null, isFreePreview: boolean,
  state: 'not_started'|'in_progress'|'completed'|'passed'|'failed',
  completion: number 0..1,
  gate: 'cleared'|'available'|'locked',
  isExam: boolean,
}
```

```ts
LessonPlayer = {
  lesson: { id, courseId, courseSlug, courseTitle, sectionTitle, title,
            kind, estimatedSeconds: int|null },
  video: {
    youtubeId: /^[A-Za-z0-9_-]{11}$/,
    durationSeconds: int >= 0,
    posterUrl: string | null,
    mirror: { hlsUrl: https:// string, maxHeight: int > 0 } | null,
  } | null,
  text: { bodyHtml: string } | null,
  homework: StudentHomework | null,          // see §7.3
  quiz: { id: string } | null,
  resources: PlayerResource[],
  progress: LessonProgressDto,
  previous: { id, title, kind } | null,
  next:     { id, title, kind } | null,
  autoCompleteAvailable: boolean,
}

PlayerResource = {
  id, kind: 'presentation'|'video'|'document'|'link',
  title, description: string|null,
  filename: string|null, mime: string|null, sizeBytes: int|null,
  youtubeId: /^[A-Za-z0-9_-]{11}$/ | null,
  linkUrl: https:// string | null,
  viewPath:     '/api/…' | null,      // hand these to the two stream routes above
  downloadPath: '/api/…' | null,
}

LessonProgressDto = {
  lessonId: string,
  state: 'not_started'|'in_progress'|'completed'|'passed'|'failed',
  completion: number 0..1,
  watchedSeconds: int >= 0,
  maxPositionSeconds: int >= 0,
  openCount: int >= 0,
  completedAt: ISO datetime | null,
  completedVia: 'auto'|'manual'|'dwell' | null,
}
```

**Video mirror** (`packages/contracts/src/video.ts`): every lecture is also mirrored to our own
HLS so a ministry tablet with no YouTube can play it.
`mirrorPrefix(youtubeId) = "v/<id>"`, `mirrorPlaylistUrl(base, id) = "<base>/v/<id>/master.m3u8"`.
`MIRROR_MAX_ATTEMPTS = 3`, `MIRROR_MAX_PIXELS = 1920*1080`, `MIRROR_MAX_RUNGS = 4`.
Mirror status enum: `pending | mirroring | ready | failed | disabled`.

**Resource streaming** — this replaced a `302` to the public media origin on purpose:
that redirect authorised once and minted a URL that then worked forever, for anyone, with no
session. The bytes are now piped with backpressure. Headers:
`Content-Type` (our detected mime, never the uploader's), `Content-Length`,
`X-Content-Type-Options: nosniff`,
`Content-Disposition: inline|attachment; filename*=UTF-8''<percent-encoded>` (RFC 5987 — these
filenames are Arabic more often than not), `Cache-Control: private, no-store`,
`Content-Security-Policy: default-src 'none'; sandbox`.

### 7.2 `ProgressController` — `/api/lessons/:lessonId/*`, all `progress:write`

| Method | Path | Body | Throttle | Response |
|---|---|---|---|---|
| POST | `/api/lessons/:lessonId/heartbeat` | `HeartbeatRequest` | 2/1s · 15/60s · 500/1h | `HeartbeatResponse` |
| POST | `/api/lessons/:lessonId/open` | `{}` strict | global | `LessonProgressDto` |
| POST | `/api/lessons/:lessonId/dwell` | `{}` strict | 2/1s · 20/60s | `HeartbeatResponse` |
| POST | `/api/lessons/:lessonId/complete` | `{}` strict | global | `HeartbeatResponse` |

```ts
HeartbeatRequest = z.object({
  position: z.number().int().min(0).max(86_400),   // seconds into the video
  delta:    z.number().int().min(0).max(15),       // MAX_HEARTBEAT_DELTA_SECONDS
}).strict()

HeartbeatResponse = {
  progress: LessonProgressDto,
  justCompleted: boolean,
  courseProgressPercent: number 0..100,
}
```

Client rules from `packages/contracts/src/progress.ts` (all exported constants — mirror them):

- `HEARTBEAT_INTERVAL_MS = 10_000` → an honest client sends 6/minute.
- `MAX_HEARTBEAT_DELTA_SECONDS = 15`, `HEARTBEAT_CLOCK_GRACE_SECONDS = 2`.
- Server credits `allowedHeartbeatSeconds(claimedDelta, elapsedSeconds) =
  min( clamp(floor(claimedDelta), 0, 15), floor(max(elapsed,0)) + 2 )` — you cannot claim more
  than wall-clock plus 2s.
- `DWELL_COMPLETE_MS = 5_000` — call `/dwell` after 5 s on a non-video lesson. **The body is empty
  and strict**: elapsed time is measured server-side, so there is nothing to forge.
- `VIEW_SESSION_GAP_SECONDS = 30 * 60`.
- Auto-complete: `VIDEO_POSITION_THRESHOLD = 0.95`, `VIDEO_WATCHED_THRESHOLD = 0.70`;
  `isVideoAutoComplete` requires **both** (`maxPosition >= 0.95*duration` **and**
  `watched >= 0.70*duration`).
- `videoCompletionFraction` returns 1 when auto-complete, else
  `round(clamp(watched/duration,0,1) * 10_000) / 10_000`.

Errors:
- `/heartbeat` on a non-video lesson → **400** `'heartbeats are only accepted for video lessons'`.
- `/dwell` on a lesson kind that is not dwell-completed → **400**
  `'this lesson kind is not completed by dwelling'`.
- `/complete` on a quiz lesson → **400** `'A quiz lesson is completed by passing its quiz.'`
- Not enrolled / lapsed → **403** with the entitlement reason.

### 7.3 Homework — `HomeworkController` (`/api/homework`), all `homework:submit`

Self-scoped: `user.id` from the session, never a route param. There is no route that takes a
submission id for a write — the pair (lesson, student) **is** the identity.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/homework/lessons/:lessonId/images` | multipart, field `file`, `fileSize: MAX_UPLOAD_BYTES = 8 MiB`, `files: 1`. `:lessonId` runs through `ParseUUIDPipe` (**400** on a non-UUID). |
| POST | `/api/homework/lessons/:lessonId/submissions` | JSON, `ZodValidationPipe` |
| GET | `/api/homework/lessons/:lessonId` | `StudentHomework | null` |
| GET | `/api/homework/images/:imageId` | streamed WebP |

`POST .../images` → `{ storageKey: string, sizeBytes: int }`. Note: the "no file uploaded" check
lives **in the service, after the enrolment gate**, so a caller with no business seeing the lecture
gets the 404 rather than a 400 that leaks the shape of the request.

`POST .../submissions` body — `HomeworkSubmitSchema`:

```ts
{ images: { storageKey: string(max 255), sizeBytes: int > 0 }[]   // min 1, max MAX_HOMEWORK_IMAGES = 8
}.strict()
```

Errors: **400** `'too many images for this homework'`, `'image was not uploaded'`,
`'this homework has already been accepted'`; **404** when the lesson has no published homework.

```ts
StudentHomework = { body: string, maxImages: int, submission: MyHomeworkSubmission | null }

MyHomeworkSubmission = {
  id: uuid,
  status: 'submitted'|'accepted'|'needs_work',
  attempt: int >= 1,
  imageCount: int >= 0,
  imageIds: uuid[],
  imagesPurged: boolean,          // images are deleted after HOMEWORK_IMAGE_RETENTION_DAYS = 30
  grade: number 0..100 | null,
  reviewNote: string | null,
  submittedAt: ISO datetime,
  reviewedAt: ISO datetime | null,
}
```

`GET /api/homework/images/:imageId` streams the WebP with
`Content-Type: image/webp`, `Content-Length`, `X-Content-Type-Options: nosniff`,
`Cache-Control: private, no-store`, `Content-Security-Policy: default-src 'none'; sandbox`.
**Not** through `/media/...` — `hw/` is three segments so it cannot be. 404 when the object row
exists but the object does not.

Instructor-side constants: `MAX_HOMEWORK_IMAGES = 8`, `DEFAULT_HOMEWORK_IMAGES = 4`.

---

## 8. Quizzes

### 8.1 `AttemptController` — `@Controller('quiz')`, class-level `@RequirePermission('quiz:attempt')`

Every route before submission carries `@NoAnswerLeak()`, an interceptor
(`apps/api/src/modules/quiz/interceptors/no-answer-leak.interceptor.ts`) that rejects a response
body containing **any** key from `FORBIDDEN_ANSWER_KEYS` at any depth:

```
fraction isCorrect correct correctness feedback feedbackHtml generalFeedbackHtml
specificFeedback rightAnswer rightAnswerText rightAnswerOptionIds answerPattern
answerPatterns graderInfo penalty position mark marks maxFraction minFraction
rawScore scaledScore passed state matchedOptionIds
```

| Method | Path | Permission | NoAnswerLeak | Body |
|---|---|---|---|---|
| GET | `/api/quiz/lessons/:lessonId` | `quiz:read` (method-level override) | no | — |
| POST | `/api/quiz/quizzes/:quizId/attempts` | `quiz:attempt` | yes | — |
| POST | `/api/quiz/attempts/:attemptId/resume` | `quiz:attempt` | yes | — |
| PUT | `/api/quiz/attempts/:attemptId/answers` | `quiz:attempt` | yes | `SaveAnswers` |
| POST | `/api/quiz/attempts/:attemptId/flag` | `quiz:attempt` | yes | `Flag` |
| POST | `/api/quiz/attempts/:attemptId/submit` | `quiz:attempt` | **no** (terminal action) | `Submit` |
| GET | `/api/quiz/attempts/:attemptId/preflight` | `quiz:attempt` | yes | — |
| GET | `/api/quiz/attempts/:attemptId/review` | `quiz:attempt` | **no** (the one learner route allowed answer data) | — |

**`GET /api/quiz/lessons/:lessonId` → `QuizOverview`**

```ts
QuizOverview = {
  quizId: string, lessonId: string,
  questionCount: int, sumMarks: number, gradeOutOf: number,
  durationSeconds: int | null,
  passPercent: number,
  attemptsUsed: int,
  allowsImprovement: boolean,
  nextPaper: 'original'|'improvement' | null,
  bestScore: number | null,
  inProgressAttemptId: string | null,
  blocked: { code: 'quiz_not_open_yet'|'quiz_closed'|'no_attempts_left',
             availableAt: string | null } | null,
  attempts: {
    id, attemptNo: int,
    state: 'in_progress'|'overdue'|'submitted'|'pending_review'|'abandoned',
    submittedAt: string | null,
    scaledScore: number | null,
    passed: boolean | null,
    paper: 'original'|'improvement',
    counts: boolean,
  }[],
}
```

`blocked.code` is the **only** structured quiz error code that reaches a client, because it comes
back inside a 200. `404` when the quiz is missing or unpublished.
`attemptAllowance(allowsImprovement) = allowsImprovement ? 2 : 1` — the course exam is two papers
(الأصلي / تحسين).

**`POST /api/quiz/quizzes/:quizId/attempts` and `POST .../resume` → `StartedAttempt`**

```ts
StartedAttempt = {
  attemptId: string,
  attemptToken: string(uuid),      // the write credential; echo it on every save/flag/submit
  deadlineAt: ISO string | null,   // persisted at start, never recomputed
  serverTime: ISO string,          // count down against THIS, never the device clock
  status: 'in_progress',
  navMethod: 'free' | 'sequential',
  paper: 'original' | 'improvement',
  gradeOutOf: number,
  sumMarks: number,
  nextSeq: int,                    // lowest safe `seq` for this page's first autosave
  graceSeconds: int,
  overdueHandling: 'autosubmit'|'graceperiod'|'autoabandon',
  questions: LearnerQuestion[],
}

LearnerQuestion = {
  slotPosition: int,
  questionId: string,
  type: 'mcq_single'|'mcq_multi'|'true_false'|'short_answer'|'ordering'|'essay',
  stemHtml: string,
  maxMark: number,
  options: { id: string, bodyHtml: string }[],   // already in this attempt's shuffled order
  response: unknown,                              // the saved answer, or null
  flagged: boolean,
  answered: boolean,
  settings: { minWords?: int, maxWords?: int },
}
```

`nextSeq = max(0, ...responseSeq) + 1`. A fresh page (new tab, reload) has no memory of the `seq`
a previous session reached and nothing on `LearnerQuestion` exposes `responseSeq`, so starting a
client counter at 1 would lose the `responseSeq < seq` race and silently no-op the first save.
**Always seed the counter from `nextSeq`.**

`start` errors: **403** `{ code: <sitting.reason> }` (dropped to `"Forbidden Exception"` by the
filter — see §0.5), **403** `{ code: 'quiz_has_no_questions' }`.
`resume` errors: **404** when the attempt is not the caller's.

**`PUT /api/quiz/attempts/:attemptId/answers`** — `SaveAnswersSchema`:

```ts
{
  attemptToken: z.string().uuid(),
  seq: z.number().int().min(1),               // monotonic per client; server keeps the highest
  answers: [{
    slotPosition: z.number().int().min(0),
    response: ({ kind: 'choice', optionIds: string[] (max 50) }
             | { kind: 'text',   text: string (max 20_000) }) | null,
  }] // min 1, max 200, each entry .strict()
}.strict()
```

Response `SaveResult`:

```ts
{ savedSlots: int[], serverTime: ISO string, deadlineAt: ISO string | null, answeredCount: int }
```

A slot whose stored `responseSeq >= seq` is skipped (not an error) and simply absent from
`savedSlots`.

Errors: **404** (not the caller's attempt), **409** `{ code: 'attempt_stale' }`,
**409** `{ code: 'attempt_overdue', message: 'attempt is overdue' }` (this one *does* keep its
message), **409** `{ code: 'question_checked', message: 'this question has already been checked
and is locked' }`, **400** `{ code: 'unknown_slot' }`.

**`POST /api/quiz/attempts/:attemptId/flag`** — `FlagSchema`
`{ attemptToken: uuid, slotPosition: int >= 0, flagged: boolean }.strict()` → `{ flagged: boolean }`.

**`POST /api/quiz/attempts/:attemptId/submit`** — `SubmitSchema` `{ attemptToken: uuid }.strict()`
→ `AttemptResult`:

```ts
{ attemptId: string, rawScore: number, scaledScore: number,
  passed: boolean, needsGrading: boolean,
  attemptState: 'submitted' | 'pending_review' }
```

Errors: **404** (not yours), **409** `{ code: 'attempt_already_submitted' }`.

**`GET /api/quiz/attempts/:attemptId/preflight`** → `{ unansweredCount: int, total: int }`.

**`GET /api/quiz/attempts/:attemptId/review`** → `ReviewPayload`
(`packages/contracts/src/quiz/attempt.ts`):

```ts
ReviewLocked   = { locked: true, reason: 'during' | 'awaitingClose' }
ReviewUnlocked = {
  locked: false, attemptId: string,
  window: 'during'|'immediatelyAfter'|'laterWhileOpen'|'afterClose',
  rawScore: number|null, scaledScore: number|null,
  gradeOutOf: number, sumMarks: number, passPercent: number,
  passed: boolean|null,
  questions: ReviewQuestion[],
}

ReviewQuestion = {
  slotPosition: int, questionId: string, attemptQuestionId: string,
  type: QuestionType, stemHtml: string,
  options: { id: string, bodyHtml: string }[],
  response?: unknown,
  correctness?: 'correct'|'partial'|'incorrect'|'needsGrading'|'unanswered',
  mark?: number|null, maxMark?: number,
  feedbackHtml?: string, generalFeedbackHtml?: string,
  rightAnswerText?: string, rightAnswerOptionIds?: string[],
}
```

Which optional fields appear is decided by the quiz's `reviewOptions` for the current window —
seven independent booleans per window (`response`, `correctness`, `marks`, `specificFeedback`,
`generalFeedback`, `rightAnswer`, `overallFeedback`) across four windows. `DEFAULT_REVIEW_OPTIONS`:
`during` all false; `immediatelyAfter` all true; `laterWhileOpen` all true **except**
`rightAnswer: false`; `afterClose` all true.

> Product trap worth encoding in the client: **one failed sitting can deadlock the rest of a
> course.** The gate treats a course exam as a chain step; a client should surface
> `blocked.code` and `attempts[].state` rather than assuming a retry is available.

### 8.2 `MeQuizzesController` — `@Controller('me')`

| Method | Path | Permission | Response |
|---|---|---|---|
| GET | `/api/me/quizzes` | `quiz:read` | `StudentQuizHistory` |
| GET | `/api/me/mastery` | `quiz:read` | `StudentMastery` |

```ts
StudentQuizHistory = {
  summary: { quizzesTaken: int, attemptsTotal: int,
             averagePercent: 0..100|null, bestPercent: 0..100|null, passedCount: int },
  series: { attemptId, lessonId, quizTitle, attemptNo: int >= 1,
            scorePercent: 0..100, passed: boolean|null, submittedAt: ISO }[],
  quizzes: { lessonId, quizTitle, courseTitle, courseSlug,
             attemptsUsed: int, allowsImprovement: boolean, improvementUsed: boolean,
             bestPercent: 0..100|null, latestPercent: 0..100|null,
             latestAttemptId: string, passed: boolean|null, lastSubmittedAt: ISO }[],
}

StudentMastery = {
  weakest: MasteryTopic[] (max 3),
  strongest: MasteryTopic[] (max 3),
  evaluated: int, pending: int,
}
MasteryTopic = { categoryId: uuid, name: string, answered: int, accuracyPercent: int,
                 lessonId: uuid|null, lessonTitle: string|null, courseSlug: string|null }
```

Thresholds: `MASTERY_MIN_EVIDENCE = 4`, `MASTERY_REVIEW_BELOW = 70`, `MASTERY_STRONG_AT = 90`.

### 8.3 Quiz admin — `AdminQuizzesController` (`/api/admin/quizzes`, class `quiz:write`, `ZodValidationPipe`)

Declaration order matters and is load-bearing; the matrix tests both sides of each pair.

| Method | Path | Body / notes |
|---|---|---|
| GET | `/api/admin/quizzes/lesson/:lessonId` | 404 when none. Declared **before** `:quizId`. |
| PUT | `/api/admin/quizzes/lesson/:lessonId` | `QuizSettings` → `{ id }` |
| PATCH | `/api/admin/quizzes/:quizId/lesson` | `{ lessonId: uuid }.strict()` → `{ ok: true }` |
| GET | `/api/admin/quizzes/:quizId` | builder payload (settings + slots + pools) |
| POST | `/api/admin/quizzes/:quizId/slots` | `AddSlot` → `{ id }` |
| DELETE | `/api/admin/quizzes/:quizId/slots/:slotId` | `{ ok: true }` |
| PATCH | `/api/admin/quizzes/:quizId/slots/order` | `ReorderSlots` → `{ ok: true }`. **Declared before `:slotId`** — otherwise `slotId === 'order'` and drag-to-reorder silently stops saving. |
| PATCH | `/api/admin/quizzes/:quizId/slots/:slotId` | `{ maxMark: number > 0 }.strict()` → `{ ok: true }` |
| POST | `/api/admin/quizzes/:quizId/pools` | `AddPool` → `{ id }` |
| POST | `/api/admin/quizzes/:quizId/publish` | → `{ ok: true }` |

Every response is wrapped in an object on purpose: Nest's Express adapter only calls
`response.json()` for an object return, so a bare string or `void` produced invalid JSON and the
browser reported "save failed".

```ts
QuizSettingsSchema = z.object({
  durationSeconds:   int > 0 | null   (default null),
  openFrom:          coerce Date | null (default null),
  openUntil:         coerce Date | null (default null),
  allowsImprovement: boolean (default false),
  passPercent:       number 0..100 (default 70),
  shuffleQuestions:  boolean (default false),
  shuffleOptions:    boolean (default true),
  overdueHandling:   'autosubmit'|'graceperiod'|'autoabandon' (default 'autosubmit'),
  graceSeconds:      int >= 0 (default 60),
  navMethod:         'free'|'sequential' (default 'free'),
  gradeOutOf:        number > 0 (default 100),
  reviewOptions:     ReviewOptions,   // required, all four windows × seven booleans
}).refine(openUntil === null || openFrom === null || openUntil > openFrom,
          'openUntil must be after openFrom' on ['openUntil'])

AddSlotSchema = { bankEntryId: string(min 1), pinnedVersion?: int > 0,
                  maxMark: number > 0, paper: 'original'|'improvement' (default 'original') }.strict()
ReorderSlotsSchema = { slotIds: string[] (min 1), paper: default 'original' }.strict()
AddPoolSchema = { name: string(min 1), pickCount: int > 0, pointsPerQuestion: number > 0,
                  sourceFilter: { categoryIds?: string[], types?: QuestionType[] }.strict(),
                  paper: default 'original' }.strict()
```

### 8.4 `AdminQuestionsController` (`/api/admin/questions`, class `question:write`, `ZodValidationPipe`)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/admin/questions/categories` | — | categories |
| POST | `/api/admin/questions/categories` | `{ name: string 1..200 }.strict()` | category |
| GET | `/api/admin/questions` | query `categoryId`, `search`, `take` (default `'50'`, clamped `min(Number(take)||50, 200)`), `skip` (default `'0'`) | list |
| POST | `/api/admin/questions` | `QuestionInput` | created |
| GET | `/api/admin/questions/:bankEntryId` | — | edit payload |
| PATCH | `/api/admin/questions/:bankEntryId` | `QuestionInput` | draft saved |
| POST | `/api/admin/questions/:versionId/publish` | — | `{ ok: true }` |
| POST | `/api/admin/questions/:bankEntryId/duplicate` | — | `{ bankEntryId }` |
| POST | `/api/admin/questions/bulk` | `{ categoryId: string(min 1), text: string 1..200_000 }.strict()` | import report |

`QuestionInputSchema` is a discriminated union on `type`
(`packages/contracts/src/quiz/question.ts`). Shared base:
`categoryId: string(min 1)`, `stemHtml: string(min 1, 'copy.quizErrors.stemRequired')`,
`generalFeedbackHtml?: string`, `defaultMark: number > 0 (default 1)`,
`settings: { shuffleOptions: boolean=true, caseSensitive: boolean=false,
minWords?: int>=0, maxWords?: int>=0, graderInfo?: string }`.

| `type` | options schema | refinements |
|---|---|---|
| `mcq_single` | `ChoiceOption[]` | `>= 2` options; exactly one with `fraction > 1 - 1e-6` |
| `mcq_multi` | `ChoiceOption[]` | `>= 2` options; at least one `fraction > 0`; positive fractions sum to 1 (±1e-6) |
| `true_false` | `ChoiceOption[]` | exactly 2 options; exactly one full-credit |
| `short_answer` | `PatternOption[]` | at least one full-credit pattern |
| `ordering` | `ChoiceOption[]` | `>= 3` options |
| `essay` | `z.never()[]` (default `[]`) | must be empty; `maxWords >= minWords` when both given |

```ts
ChoiceOption  = { id?: string, bodyHtml: string(min 1), fraction: number -1..1, feedbackHtml?: string }
PatternOption = { id?: string, answerPattern: string 1..200, fraction: number -1..1, feedbackHtml?: string }
                 // at most 20 unescaped '*' wildcards
```

### 8.5 `AdminAttemptsController` (`@Controller('admin')`, `ZodValidationPipe`)

| Method | Path | Permission | Query / body |
|---|---|---|---|
| GET | `/api/admin/attempts` | `attempt:read` | `quizId`, `userId`, `state`, `q`, `take` (default 50, max 200), `skip` (default 0) |
| GET | `/api/admin/quizzes/:quizId/attempts` | `attempt:read` | same, `quizId` from the path |
| POST | `/api/admin/attempts/:id/reopen` | `attempt:unlock` | `{ extraSeconds: int >= 0 (default 0) }.strict()` → `{ ok: true }` |
| POST | `/api/admin/attempts/:id/extra-time` | `attempt:unlock` | `{ seconds: int > 0 }.strict()` → `{ ok: true }` |
| POST | `/api/admin/quizzes/:quizId/students/:userId/extra-attempt` | `attempt:unlock` | — → `{ ok: true }` |

`AdminAttemptRow` never carries `attemptToken` — a write credential has no business in a list.

### 8.6 `AdminAnalyticsController`

`GET /api/admin/quizzes/:quizId/analytics` · class-level `analytics:read`.

---

## 9. Admin configuration

### 9.1 `SettingsController` (admin half)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/admin/settings` | `settings:read` | `SiteSettings` |
| PATCH | `/api/admin/settings/:section` | `settings:write` | body is `unknown`, validated per section |

`:section` ∈ `branding | seo | contact | outreach | store`; anything else →
**400** `` `unknown settings section: <raw>` ``. Body is validated against `SECTION_SCHEMAS[section]`
inside the service. Response is the whole `SiteSettings` object:

```ts
SiteSettings = {
  branding: Branding,        // accent, radius, logoLightAssetId, logoDarkAssetId, faviconAssetId
  seo:      Seo,             // titleAr(max 70), descriptionAr(max 160), ogImageAssetId
  contact:  Contact,         // §3.3
  outreach: {
    quizResult: boolean=true, quizNudge: boolean=true, lessonPraise: boolean=true,
    whatsappInvite: boolean=true,
    nudgeAfterHours: int 1..720 = 24,
    groupInviteEveryDays: int 3..365 = 21,
    maxInvitesPerStudent: int 1..20 = 4,
    maxPerStudentPerDay: int 1..10 = 2,
  },
  store: { shippingCents: int 0..50_000 = 6500 },
}
```

> Deployment trap: `next build` bakes an empty settings cache, so a feature gated on a setting
> can vanish for minutes after a deploy. Not an API bug.

### 9.2 `FlagsController` (admin half)

| Method | Path | Permission | Body |
|---|---|---|---|
| GET | `/api/admin/flags` | `flags:read` | — |
| PATCH | `/api/admin/flags/:key` | `flags:write` | `{ enabled: boolean }.strict()` |

### 9.3 `NavigationController` (admin half)

| Method | Path | Permission | Body |
|---|---|---|---|
| GET | `/api/admin/navigation` | `nav:read` | — |
| POST | `/api/admin/navigation` | `nav:write` | `NavigationCreate` |
| PATCH | `/api/admin/navigation/:id` | `nav:write` | `NavigationCreate.partial().strict()` |
| DELETE | `/api/admin/navigation/:id` | `nav:write` | → `{ ok: true }` (archive, not hard delete) |
| POST | `/api/admin/navigation/:id/restore` | `nav:write` | → `{ ok: true }` |
| POST | `/api/admin/navigation/order` | `nav:write` | `{ parentId: uuid|null, ids: uuid[] 1..200 }.strict()`, ids unique (`'ids must be unique'`) → `{ ok: true }` |

```ts
NavigationCreateSchema = {
  parentId: uuid | null (default null),
  labelAr: string 1..60,
  href: string 1..200 matching /^\/[A-Za-z0-9\-._~/?#[\]@!$&'()*+,;=%]*$/
        ('must be a site-relative path starting with /'),
  icon: string(max 40) | null (default null),
  visibleTo: string[] each /^[a-z-]+:[a-z-]+$/, max 10 (default []),
  isPublished: boolean (default true),
}.strict()
```

### 9.4 `HomeBlocksController` (admin half)

| Method | Path | Permission | Body |
|---|---|---|---|
| GET | `/api/admin/home-blocks` | `home:read` | — |
| POST | `/api/admin/home-blocks` | `home:write` | `{ key: string 2..64 /^[a-z0-9]+(?:-[a-z0-9]+)*$/, isPublished: boolean=false, props: HomeBlockProps }` |
| PATCH | `/api/admin/home-blocks/:id` | `home:write` | `{ isPublished?: boolean, props?: HomeBlockProps }` |
| PATCH | `/api/admin/home-blocks/:id/published` | `home:write` | `{ isPublished: boolean }.strict()` |
| DELETE | `/api/admin/home-blocks/:id` | `home:write` | → `{ ok: true }` (archive) |
| POST | `/api/admin/home-blocks/:id/restore` | `home:write` | → `{ ok: true }` |
| POST | `/api/admin/home-blocks/order` | `home:write` | `{ ids: uuid[] 1..50 }.strict()`, unique → `{ ok: true }` |

> The landing copy lives in the **database** (these blocks), not in `packages/contracts/src/copy/ar.ts`.
> Editing `landing.*` in `ar.ts` changes the seed, not the live home page.

### 9.5 `AuditReadController` — `@Controller('admin/audit')`, class `@RequirePermission('audit:read')`

| Method | Path | Response |
|---|---|---|
| GET | `/api/admin/audit/verify` | `{ ok: true } \| { ok: false, brokenAtId: string }` |
| GET | `/api/admin/audit` | `{ rows: AuditEntry[], rowCount: int }`, `orderBy occurredAt desc` |

Query (`AuditListQuerySchema`, `ZodValidationPipe`):

```ts
{
  page: coerce int >= 1 (default 1),
  perPage: coerce int 1..200 (default 50),        // NOT the closed PAGE_SIZES set
  action: one-or-many of AUDIT_ACTIONS (default []),   // repeated ?action= params are collected
  resourceType: string(max 80) -> null when absent,
  actorUserId: string -> null,
  outcome: 'success'|'failure'|'denied' -> null,
  from: ISO datetime with offset -> null,
  to:   ISO datetime with offset -> null,
}
```

```ts
AuditEntry = {
  id, occurredAt: string, actorUserId: string|null, actorEmail: string|null,
  actorIp: string|null, action: AuditAction, resourceType: string,
  resourceId: string|null, outcome: 'success'|'failure'|'denied',
  metadata: unknown|null, prevHash: string|null, hash: string,
}
```

`AUDIT_ACTIONS` is a 90-entry enum in `packages/contracts/src/admin/audit.ts` (course/section/
term/lesson, quiz, settings/branding/flag/nav/home-block/media/profile/taxonomy, student
lifecycle, attempt, news, campaign, whatsapp, payment/transfer/finance, book-order, book, expense,
homework). The table is **INSERT-only** — a test that tidies up its own audit row gets a Postgres
`42501`.

### 9.6 `AdminTaxonomyController` — `@Controller('admin/taxonomy')`, class `taxonomy:write`

Reads override to `taxonomy:read`; every write inherits `taxonomy:write`.

| Method | Path | Permission | Body |
|---|---|---|---|
| GET | `/api/admin/taxonomy/governorates` | `taxonomy:read` | — |
| PATCH | `/api/admin/taxonomy/governorates/:code` | `taxonomy:write` | `{ nameAr? 2..80, region? , sortOrder? int, isActive? }` `.strict()` |
| GET | `/api/admin/taxonomy/systems` | `taxonomy:read` | — |
| PATCH | `/api/admin/taxonomy/systems/:id` | `taxonomy:write` | `{ nameAr? 2..80, totalMarks? int 1..2000, passPercent? 0..100, allowsRetakes?, sortOrder? }` |
| PATCH | `/api/admin/taxonomy/academic-years/:id` | `taxonomy:write` | `{ labelAr? 2..80, badgeAr? 2..40, sortOrder? }` |
| GET | `/api/admin/taxonomy/tracks` | `taxonomy:read` | — |
| POST | `/api/admin/taxonomy/tracks` | `taxonomy:write` | `{ systemId: uuid, slug, labelAr 2..80, aliases: string[]<=20 = [], minYear int 1..3 = 2, sortOrder int = 0 }` |
| PATCH | `/api/admin/taxonomy/tracks/:id` | `taxonomy:write` | `{ labelAr?, aliases?, minYear?, sortOrder? }` |
| GET | `/api/admin/taxonomy/subjects` | `taxonomy:read` | — |
| POST | `/api/admin/taxonomy/subjects` | `taxonomy:write` | `{ slug, nameAr 2..80, aliases: string[]<=20 = [] }` |
| PATCH | `/api/admin/taxonomy/subjects/:id` | `taxonomy:write` | `{ nameAr?, aliases? }` |
| DELETE | `/api/admin/taxonomy/subjects/:id` | `taxonomy:write` | → `{ ok: true }` |
| GET | `/api/admin/taxonomy/subject-offerings` | `taxonomy:read` | — |
| POST | `/api/admin/taxonomy/subject-offerings` | `taxonomy:write` | `SubjectOffering` |
| PATCH | `/api/admin/taxonomy/subject-offerings/:id` | `taxonomy:write` | `SubjectOfferingPatch` |

`slug` everywhere here: `string 2..64` matching `/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/`
('lowercase latin, digits, - and _ only').

```ts
SubjectOffering = {
  systemId: uuid, year: int 1..3, trackId: uuid|null, subjectId: uuid,
  countsTowardTotal: boolean = true,
  level: 'normal'|'advanced'|null = null,
  electiveGroupId: uuid|null = null,
  marks: int 0..1000 = 100,
  sortOrder: int = 0,
}.strict().refine(year !== 1 || trackId === null,
                  'year 1 offerings cannot be scoped to a track' on ['trackId'])
```

### 9.7 `MediaController` (admin half)

| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/api/media` | `media:write` | multipart `file`, `fileSize: 8 MiB`, `files: 1` |
| POST | `/api/media/documents` | `media:write` | multipart `file`, `fileSize: MAX_DOCUMENT_BYTES = 95 MiB` |
| GET | `/api/admin/media` | `media:read` | query `page` (default 1), `perPage` (coerce int 1..100, default **40**), `includeArchived` (coerce boolean, default false) |
| PATCH | `/api/admin/media/:id` | `media:write` | `{ altAr: string(max 200) \| null }.strict()` |
| POST | `/api/admin/media/:id/archive` | `media:delete` | |
| POST | `/api/admin/media/:id/restore` | `media:delete` | |
| GET | `/api/admin/media/:id/usage` | `media:read` | `{ usedBy: ('brandingLogoLight'\|'brandingLogoDark'\|'brandingFavicon'\|'seoOgImage'\|'homeBlock')[] }` |
| DELETE | `/api/admin/media/:id` | `media:delete` | **204** |
| POST | `/api/admin/media/:id/replace` | `media:write` | multipart `file`, 8 MiB |

Missing file on any upload → **400** `'no file uploaded'`.
Accepted image input: `image/png`, `image/jpeg`, `image/webp`, `image/avif`, `image/gif`
(extensions `png jpg jpeg webp avif gif`), `MAX_INPUT_PIXELS = 50_000_000`.
**Output is always `image/webp`.** Documents: `pdf pptx docx xlsx` with the matching
OOXML mime types.

```ts
MediaAsset = { id, storageKey, filename, mime: 'image/webp', sizeBytes: int,
               width: int|null, height: int|null, altAr: string|null,
               archivedAt: string|null, createdAt: string }
```

> Web-only constraint that does **not** apply to Flutter: the Next.js Server Action upload ceiling
> is 1 MB, which is why the web compresses images in the browser first. A native client posting
> straight to `/api/media` gets the full 8 MiB.

---

## 10. Content authoring (admin)

### 10.1 `CourseController` — `@Controller('admin/courses')`, `@UsePipes(ZodValidationPipe)`

| Method | Path | Permission | Body → response |
|---|---|---|---|
| GET | `/api/admin/courses` | `course:read-admin` | course list |
| GET | `/api/admin/courses/:id` | `course:read-admin` | admin course detail |
| POST | `/api/admin/courses` | `course:create` | `CourseCreate` |
| PATCH | `/api/admin/courses/:id` | `course:update` | `CourseUpdate` |
| PATCH | `/api/admin/courses/:id/status` | `course:publish` | `{ status: 'draft'\|'published'\|'archived' }.strict()` |
| POST | `/api/admin/courses/:id/publish-all` | `course:publish` | → `PublishAllResult` |
| GET | `/api/admin/courses/:id/video-check` | `course:read-admin` | `CourseVideoCheck` |
| PUT | `/api/admin/courses/:id/exam` | `course:update` | `{ examLessonId: uuid \| null }.strict()` |
| POST | `/api/admin/courses/:id/exam/scaffold` | `course:update` **and** `quiz:write` | → `ExamScaffoldResult` |
| DELETE | `/api/admin/courses/:id` | `course:delete` | |

`course:read-admin` exists *because* `course:read` is also held by students — the admin
list/detail used to require it, so any signed-in student could read every course's draft titles,
unpublished trees and video ids. Found by the authorization matrix.

`POST .../exam/scaffold` does a second, in-handler check:
`if (!roleHasPermission(user.role, 'quiz:write')) throw new ForbiddenException('scaffolding an
exam also requires quiz:write')`.

```ts
courseWritableShape = {
  slug: SlugSchema,                 // string 3..96, /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
                                    // 'المُعرّف لازم يكون حروف إنجليزي صغيرة وأرقام وشرطات بس';
                                    // reserved: new edit admin api dev me sitemap robots -> 'المُعرّف ده محجوز'
  title: string 3..160,
  subtitle: string(max 240)|null = null,
  description: string(max 4000)|null = null,
  systemId: uuid,
  year: int 1..3,
  trackId: uuid|null = null,
  subjectId: uuid,
  coverKey: string(max 255)|null = null,
  requiresGrant: boolean = false,
  emphasis: 'required'|'recommended'|'optional'|null = null,
  emphasisNote: string 1..80 (trimmed)|null = null,
  comingSoonNote: string 1..240|null = null,
  scheduleNote: string 1..120|null = null,
  whatsappGroupUrl: url(max 500) starting https://|null = null,   // 'must be an https:// URL'
  contentComplete: boolean = false,
  monthlyPriceCents / quarterlyPriceCents / yearlyPriceCents: int >= 0 | null = null,
  bookTitle: string 1..160|null = null,
  bookPriceCents: int >= 0|null = null,
  forGeneral: boolean = true,
  forLanguages: boolean = true,
}
```

`CourseCreateSchema = z.object(shape).strict()` plus five refinements:

| rule | path | Arabic message |
|---|---|---|
| `year !== 1 \|\| trackId == null` | `trackId` | `الصف الأول مالوش مسار` |
| `emphasisNote == null \|\| emphasis != null` | `emphasisNote` | `الملاحظة محتاجة شارة` |
| `forGeneral !== false \|\| forLanguages !== false` | `forGeneral` | `لازم يتحدد عام أو لغات أو الاتنين` |
| all three price fields null **or** `requiresGrant === true` | `requiresGrant` | `الكورس المدفوع لازم يبقى مقفول` |
| `(bookTitle == null) === (bookPriceCents == null)` | `bookPriceCents` | `الكتاب محتاج اسم وسعر مع بعض` |

`CourseUpdateSchema = z.object(partialWithoutDefaults(shape)).strict()` with the first three
refinements only.

> ⚠️ `partialWithoutDefaults` (`packages/contracts/src/partial.ts`) exists because a plain
> `.partial()` **keeps every `.default()`**, so a PATCH that renamed a lecture also injected
> `isPublished: false` and unpublished it. Any new partial schema must use this helper.

> ⚠️ `courses.book_title` in production holds **CTA copy**, not a book name.

```ts
PublishAllResult = {
  publishedLessons: int, publishedSections: int,
  skipped: { id: uuid, title: string,
             reason: 'noVideo'|'noText'|'noResources'|'quizNotPublished' }[],
}

CourseVideoCheck = {
  checked: int,
  problems: { lessonId: uuid, title, sectionTitle, isPublished: boolean,
              externalId: string|null,
              embed: 'ok'|'blocked'|'unavailable'|'unknown' | null }[],
}

ExamScaffoldResult = { quizId: uuid, lessonId: uuid, created: boolean }.strict()
EXAM_SECTION_TITLE = 'الامتحان النهائي'
```

### 10.2 `SectionController` — `@Controller('admin')`

| Method | Path | Permission | Body |
|---|---|---|---|
| PATCH | `/api/admin/courses/:courseId/sections/order` | `section:reorder` | `Reorder` |
| POST | `/api/admin/courses/:courseId/sections` | `section:write` | `SectionCreate` |
| PATCH | `/api/admin/sections/:id` | `section:write` | `SectionUpdate` |
| DELETE | `/api/admin/sections/:id` | `section:write` | |

```ts
ReorderSchema = { orderedIds: uuid[] (min 1, max 500), unique
                  ('فيه عنصر متكرر في الترتيب') }.strict()
sectionWritableShape = { title: string 2..160, summary: string(max 1000)|null = null,
                         isPublished: boolean = false, termId: uuid|null = null }
```

### 10.3 `TermController` — `@Controller('admin')`, all `section:write`

| Method | Path | Body |
|---|---|---|
| GET | `/api/admin/courses/:courseId/terms` | — |
| POST | `/api/admin/courses/:courseId/terms` | `{ title: string 2..160, priceCents: int >= 0 \| null = null }.strict()` |
| PATCH | `/api/admin/terms/:id` | same, partial-without-defaults, `.strict()` |
| PATCH | `/api/admin/terms/:id/open` | `{ isOpen: boolean }.strict()` |

```ts
CourseTerm = { id: uuid, courseId: uuid, title, position: int, isOpen: boolean, priceCents: int|null }
TermSetOpenResult = { term: CourseTerm, revokedGrantCount: int >= 0 }
```

Closing a term revokes the term grants that depend on it (`revokedGrantCount`), which surfaces to
students as `revoked` / `needs_term_grant`.

### 10.4 `LessonController` — `@Controller('admin')`

| Method | Path | Permission | Body |
|---|---|---|---|
| GET | `/api/admin/lessons/video-duration?url=` | `lesson:write` | → `{ durationSeconds: int\|null, embed: 'ok'\|'blocked'\|'unavailable'\|'unknown' }`; **400** `copy.admin.lesson.videoUrlInvalid` when `extractYouTubeId(url)` is null |
| PATCH | `/api/admin/sections/:sectionId/lessons/order` | `lesson:reorder` | `Reorder` |
| POST | `/api/admin/sections/:sectionId/lessons` | `lesson:write` | `LessonCreate` |
| PATCH | `/api/admin/lessons/:id` | `lesson:write` | `LessonUpdate` |
| DELETE | `/api/admin/lessons/:id` | `lesson:write` | |
| PUT | `/api/admin/lessons/:id/video` | `lesson:write` | `LessonVideoInput` |
| DELETE | `/api/admin/lessons/:id/video` | `lesson:write` | |
| POST | `/api/admin/lessons/:id/video/mirror` | `lesson:write` | re-queue the HLS mirror |
| PUT | `/api/admin/lessons/:id/text` | `lesson:write` | `{ bodyHtml: string 1..65_536 }.strict()` |
| PUT | `/api/admin/lessons/:id/homework` | `lesson:write` | `HomeworkWrite` |
| DELETE | `/api/admin/lessons/:id/homework` | `lesson:write` | |
| PATCH | `/api/admin/lessons/:id/resources/order` | `lesson:reorder` | `Reorder` |
| POST | `/api/admin/lessons/:id/resources` | `lesson:write` | `LessonResourceInput` |
| PATCH | `/api/admin/resources/:id` | `lesson:write` | `{ title? 1..200, description?: string(max 1000)\|null }.strict()` |
| DELETE | `/api/admin/resources/:id` | `lesson:write` | |

```ts
lessonWritableShape = {
  title: string 2..200,
  kind: 'video'|'quiz'|'attachment'|'text',
  isPublished: boolean = false,
  isFreePreview: boolean = false,
  estimatedSeconds: int 0..86400 = 0,
  completionMode: 'none'|'manual'|'on_view'|'on_grade'|'on_pass' = 'manual',
  completionMinViewSeconds: int >= 0 | null = null,
  completionPassGrade: number 0..100 | null = null,
  forGeneral: boolean = true, forLanguages: boolean = true,
}
// refinements: 'قاعدة إتمام الدرس ناقصة قيمتها' on ['completionMode'] when
//   on_view without completionMinViewSeconds, or on_grade/on_pass without completionPassGrade;
// plus the stream refinement 'لازم يتحدد عام أو لغات أو الاتنين'.

LessonVideoInputSchema = { provider: VideoProvider, url: string 1..2048,
                           durationSeconds?: int 1..43200, posterKey: string(max 255)|null = null }
  .strict().transform(...)
// provider !== 'youtube'  -> 'النسخة الحالية بتدعم فيديوهات يوتيوب بس' on ['provider']
// unparseable url         -> 'رابط يوتيوب غير صالح' on ['url']
// output: { provider: 'youtube', externalId: <11 chars>, durationSeconds: number|null, posterKey }

LessonResourceInputSchema (.strict(), then a transform that branches on kind):
  presentation | document -> requires storageKey + filename + mime + sizeBytes
                             ('لازم ترفع الملف الأول' on ['storageKey']),
                             and rejects linkUrl/url ('الملف مايجيش معاه رابط' on ['kind'])
  video                   -> provider must be 'youtube'
                             ('النسخة الحالية بتدعم فيديوهات يوتيوب بس' on ['provider']),
                             url must yield an id ('رابط يوتيوب غير صالح' on ['url'])
  link                    -> linkUrl must start with https://
                             ('الرابط لازم يبدأ بـ https' on ['linkUrl']),
                             and rejects storageKey/url ('الرابط مايجيش معاه ملف' on ['kind'])
  sizeBytes max = MAX_RESOURCE_BYTES = MAX_DOCUMENT_BYTES = 95 MiB

HomeworkWriteSchema = { body: string 3..4000 (trimmed),
                        maxImages: int 1..8 = 4,
                        isPublished: boolean = false }.strict()
```

`extractYouTubeId` accepts a bare 11-char id, or a URL on
`youtube.com / www / m / music / youtube-nocookie.com / youtu.be` (rejecting embedded credentials
and non-http(s) schemes) in the forms `/watch?v=`, `/embed/<id>`, `/shorts/<id>`, `/live/<id>`,
`/v/<id>`, `youtu.be/<id>`. Player URL:
`https://www.youtube-nocookie.com/embed/<id>?rel=0&modestbranding=1&playsinline=1[&start=N]`.
Thumbnail: `https://i.ytimg.com/vi/<id>/hqdefault.jpg` (or `maxresdefault.jpg`).

> Quiz content is edited **through the API**, not the DB; and a PATCH alone ships an invisible
> draft — publishing a lecture needs the publish call plus (empirically) a no-op edit to unstick
> the public page.

---

## 11. Money

### 11.1 `PaymentsController` — `/api/payments` (student side, `payment:submit`)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/payments/screenshot` | multipart `file`, 8 MiB, `files: 1` → `{ screenshotKey: string }`; **400** `'no file uploaded'` |
| POST | `/api/payments/submissions` | `SubmitPayment`, `ZodValidationPipe` → `PaymentSubmission` |
| GET | `/api/payments/submissions/me` | → `PaymentSubmission[]` |

Two-step upload: get a `screenshotKey`, then submit it with the rest of the claim.

```ts
SubmitPaymentSchema = {
  courseId: uuid,
  plan: 'monthly'|'quarterly'|'term'|'yearly',
  termId: uuid | null = null,
  senderPhone: egyptianPhone('اكتب رقم الموبايل اللي حوّلت منه'),
  screenshotKey: string 1..255,
}.strict()
 .refine((plan === 'term') === (termId !== null),
         'لازم تختار الترم اللي هتشترك فيه' on ['termId'])
```

Errors on submit:
- **400** `'screenshotKey was not issued by POST /payments/screenshot'`
- **404** course missing or not published
- **400** `'this term is not open for subscription'`
- **400** `'this course does not sell that plan'`
- **409** `'a submission for this course is already under review'`

```ts
PaymentSubmission = {
  id: uuid, courseId: uuid, courseTitle: string,
  plan: PaymentPlan,
  termId: uuid|null, termTitle: string|null,
  amountCents: int,               // derived server-side from the course's own pricing,
                                  // NEVER from student input
  senderPhone: string|null,       // null for an admin-created row
  status: 'pending'|'approved'|'rejected',
  rejectionReason: string|null,   // non-null only when rejected; admin-authored, shown as-is
  validUntil: ISO datetime|null,  // null while pending; the new expiry once approved
  createdAt: ISO datetime,
}
```

### 11.2 `AdminPaymentsController` — `/api/admin/payments`

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/admin/payments/submissions` | `payment:read` | `AdminPaymentQuery` via `@Query()` + `ZodValidationPipe` |
| GET | `/api/admin/payments/submissions/:id/screenshot` | `payment:read` | streamed WebP; 404 when the object is gone |
| POST | `/api/admin/payments/submissions/:id/approve` | `payment:review` | also calls `TransfersService.learnFromApproval(id)`, best-effort (`.catch(() => undefined)`) |
| POST | `/api/admin/payments/submissions/:id/reject` | `payment:review` | `{ reason: string 1..400 (trimmed) }.strict()` → `{ ok: true }` |

```ts
AdminPaymentQuerySchema = ListQuerySchema
  .extend({ status?: 'pending'|'approved'|'rejected',
            sort: 'oldest'|'newest'|'amount_desc'|'amount_asc' = 'oldest' })
  .omit({ dir: true, q: true })     // -> page, perPage, status?, sort

AdminPaymentRow = {
  id: uuid, userId: string, studentName, studentEmail: string|null, studentPhone: string|null,
  courseId: uuid, courseTitle,
  plan, termId: uuid|null, termTitle: string|null,
  amountCents: int, senderPhone: string|null,
  status, rejectionReason: string|null,
  approvedBefore: int >= 0,
  createdAt: ISO, reviewedAt: ISO|null,
  isFree: boolean, hasScreenshot: boolean,
}
ApprovePaymentResult = { id: uuid, status: 'approved', validUntil: ISO|null }
```

Errors: **404** unknown submission / no screenshot; **409** `'this submission was already reviewed'`.

### 11.3 `AdminStudentSubscriptionsController` — `/api/admin/students/:userId/subscriptions`

| Method | Path | Permission | Body |
|---|---|---|---|
| GET | `/api/admin/students/:userId/subscriptions` | `payment:read` | → `AdminSubscriptionRow[]` |
| POST | `/api/admin/students/:userId/subscriptions` | `payment:review` | `AdminManualSubscribe` |
| DELETE | `/api/admin/students/:userId/subscriptions/:grantId` | `payment:review` | |

```ts
AdminManualSubscribeSchema = {
  courseId: uuid,
  plan: PaymentPlan,
  termId: uuid|null = null,
  isFree: boolean,
  screenshotKey: string 1..255 | null = null,
}.strict().refine((plan === 'term') === (termId !== null), 'لازم تختار الترم' on ['termId'])

AdminSubscriptionRow = {
  id, courseId, courseTitle, plan: PaymentPlan|null,
  termId: string|null, termTitle: string|null,
  amountCents: int|null, isFree: boolean|null,
  validUntil: ISO|null, revokedAt: ISO|null, createdAt: ISO,
}
```

Deliberately **not** on `StudentsController`: this needs `payment:review`, not `student:write`.

> Product fact: a hand-issued grant shows on **no money screen**. And bulk admin GETs start
> 429-ing after roughly 60 calls.

### 11.4 `AdminFinanceController` — `/api/admin/finance`

| Method | Path | Permission | Body |
|---|---|---|---|
| GET | `/api/admin/finance` | `payment:read` | `AdminFinanceQuery` |
| PATCH | `/api/admin/finance/:grantId/amount` | `payment:review` | `{ amountCents: int >= 0, isFree: boolean }.strict()` |
| PATCH | `/api/admin/finance/:grantId/dates` | `payment:review` | `{ validFrom: ISO datetime, validUntil: ISO datetime\|null }.strict()` |
| POST | `/api/admin/finance/:grantId/cancel` | `payment:review` | `{ reason: string 1..400, showToStudent: boolean = false, refundCents: int >= 1 \| null = null }.strict()` |

```ts
AdminFinanceQuerySchema = ListQuerySchema.extend({
  status?: 'active'|'expiring_soon'|'expired',
  plan?:   'monthly'|'quarterly'|'yearly'|'term'|'free',
  year?:   coerce int >= 1,
  stream?: 'general'|'languages',
  sort:    'paid_desc'|'paid_asc' = 'paid_desc',
  perPage: coerce int 1..2000 = 20,     // OVERRIDES the closed PAGE_SIZES set
}).omit({ dir: true, q: true })

AdminFinanceList = { rows: AdminFinanceRow[], rowCount: int, summary: AdminFinanceSummary }

AdminFinanceRow = {
  id: uuid, userId, studentName, courseId: uuid, courseTitle,
  plan: PaymentPlan|null, termId: uuid|null, termTitle: string|null,
  amountCents: int|null, paidAt: ISO|null, isFree: boolean|null,
  validUntil: ISO|null, validFrom: ISO,
  scope: 'course'|'term',
  status: 'active'|'expiring_soon'|'expired',
  renewalCount: int >= 0,
  cancelReason: string|null, cancelReasonVisibleToStudent: boolean,
  refundedCents: int >= 0,
}

AdminFinanceSummary = {
  revenueTotalCents, refundsTotalCents, netRevenueTotalCents,
  activeCount, expiringSoonCount,
  filterCounts: { plan: {monthly,quarterly,yearly,term,free},
                  year: Record<string,int>,
                  stream: {general,languages} },
}
```

> Cancelling changes **access**; only a `Refund` row moves money. That is why `cancel` takes
> `refundCents` separately.

### 11.5 InstaPay transfers

**`POST /api/ingest/transfers` — `TransfersIngestController`, `@Public()`.**
Caller is an iOS Shortcut that OCRs the InstaPay notification list. Header
**`x-instapay-token`** must equal `env.INSTAPAY_INGEST_TOKEN`; an unset env var disables the route
outright (`401` for everything). No CSRF (`@Public()` without `@RequireCsrf()`), so no
`x-csrf-token` is needed.

**`AdminTransfersController` — `/api/admin/transfers`.**

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/admin/transfers?filter=` | `payment:read` | `AdminTransferFilterSchema.catch('unmatched')` — an invalid filter silently becomes `unmatched`. Fixed `PAGE_SIZE = 100`, no paging. |
| POST | `/api/admin/transfers/ingest` | `payment:review` | same `IngestTransfers` body, session-authenticated |
| POST | `/api/admin/transfers/:id/dismiss` | `payment:review` | → `{ ok: true }` |

```ts
IngestTransfersSchema = { text: string 1..20_000, capturedAt?: ISO datetime }.strict()
IngestTransfersResult = { read: int, created: int, duplicates: int, matched: int, unreadable: int }

AdminTransferFilter = 'unmatched' | 'matched' | 'dismissed' | 'all'

AdminTransferRow = {
  id: uuid, source: 'notification'|'sms'|'manual',
  amountCents: int|null, senderHandle: string|null, senderStudentName: string|null,
  rawLine: string, receivedAt: ISO,
  matchedSubmissionId: uuid|null, matchedBookOrderId: uuid|null,
  matchedStudentName: string|null, matchedCourseTitle: string|null,
  dismissedAt: ISO|null,
}
AdminTransferList = { rows: AdminTransferRow[], rowCount: int }
```

### 11.6 Books catalogue (admin) — `AdminBooksController` (`/api/admin/books`)

| Method | Path | Permission | Body |
|---|---|---|---|
| GET | `/api/admin/books` | `book:read` | → `AdminBookRow[]` |
| POST | `/api/admin/books` | `book:write` + `@RequireCsrf()` | `AdminBookCreate` |
| PATCH | `/api/admin/books/:id` | `book:write` + `@RequireCsrf()` | `AdminBookPatch` |
| DELETE | `/api/admin/books/:id` | `book:write` + `@RequireCsrf()` | → `{ ok: true }` |

```ts
bookShape = {
  slug: string 2..80 trimmed, no '/', '.', or whitespace
        ('الرابط ما ينفعش يحتوي على مسافة أو نقطة أو شرطة مائلة'),
  titleAr: string 2..160 ('اسم الكتاب مطلوب'),
  subtitleAr: string(max 200)|null = null,
  subjectId: uuid|null = null,
  year: int 1..3|null = null,
  term: 'first'|'second'|'full' = 'full',
  courseId: uuid|null = null,
  forGeneral = true, forLanguages = true, showOnLanding = true, showOnCourse = true,
  priceCents: int 0..10_000_000,
  comparePriceCents / unitCostCents: same | null = null,
  coverKey: string 1..255|null = null,
  descriptionAr: string(max 2000)|null = null,
  pageCount: int 1..5000|null = null,
  isActive: boolean = true,
  stock: int 0..100_000|null = null,
  sortOrder: int 0..9999 = 0,
}
// create refinements:
//   comparePriceCents === null || comparePriceCents > priceCents
//     -> 'السعر قبل الخصم لازم يكون أعلى من السعر الحالي' on ['comparePriceCents']
//   forGeneral || forLanguages -> 'لازم تحدد الكتاب لمدارس عام ولا لغات ولا الاتنين' on ['forGeneral']
// patch: partialWithoutDefaults + the same two rules applied only when both operands are present,
//        plus Object.keys(value).length > 0 -> 'مفيش حاجة اتغيرت'

AdminBookRow = bookShape-ish + { id, subjectNameAr: string|null, courseTitle: string|null,
                                 orderedCount: int >= 0, updatedAt: ISO }
```

### 11.7 Book orders — `BookOrdersController` (`/api/book-orders`)

Guest checkout: ordering the physical textbook is "a different service" from login-gated course
content, so a stranger must be able to complete it. Ownership for a caller with no session is the
order's own **UUIDv7 id** (handed back only to whoever created it) plus `userId: null` in the WHERE
clause. `OptionalSessionService.userOrNull(request)` answers "is anyone here?" and is never an
authorization decision.

| Method | Path | Guard | Throttle | Body |
|---|---|---|---|---|
| POST | `/api/book-orders/screenshot` | `@Public()` + `@RequireCsrf()` | 1/10s · 3/600s · 10/1h | multipart `file`, 8 MiB → `{ screenshotKey }` |
| POST | `/api/book-orders` | `@Public()` + `@RequireCsrf()` | 1/10s · 3/600s · 10/1h | `CreateBookOrder` → `BookOrder` |
| POST | `/api/book-orders/:id/payment` | `@Public()` + `@RequireCsrf()` | 1/5s · 5/600s | `SubmitBookOrderPayment` → `BookOrder` |
| GET | `/api/book-orders/mine` | `book-order:submit` | global | → `BookOrder[]` |
| GET | `/api/book-orders/:id` | `@Public()` | global | → `BookOrder` |

`GET /api/book-orders/mine` is declared **before** `GET /api/book-orders/:id` so the literal
segment is not captured.

```ts
CreateBookOrderSchema = {
  courseId?: uuid,                 // exactly one of courseId / items
  items?: BookCart,                // [{ bookId: uuid, quantity: int 1..20 }], 1..20 lines,
                                   // each bookId once ('الكتاب الواحد يتكتب مرة واحدة بالعدد المطلوب')
                                   // 'لازم تختار كتاب واحد على الأقل' when empty
  fullName: string 2..120 ('الاسم الكامل مطلوب'),
  phone: egyptianPhone('رقم الموبايل مطلوب'),
  altPhone: egyptianPhone('رقم موبايل تاني مطلوب للتواصل'),
  governorateCode: string(len 2) ('لازم نحدد المحافظة'),
  city: string 1..100 ('المدينة مطلوبة'),
  addressStreet: string 1..200 ('اسم الشارع مطلوب'),
  addressBuilding: string(max 60)|null = null,
  addressNote: string(max 300)|null = null,
}.strict().refine(exactly one of courseId/items,
  'الطلب لازم يبقى إما كتاب كورس واحد أو سلة كتب — مش الاتنين' on ['items'])

SubmitBookOrderPaymentSchema = {
  senderPhone: egyptianPhone('اكتب رقم الموبايل اللي حوّلت منه'),
  screenshotKey: string 1..255,
}.strict()

BookOrder = {
  id: uuid, courseId: uuid|null, courseTitle: string|null,
  bookTitle: string, items: BookOrderLine[],
  amountCents: int, itemsCents: int, shippingCents: int, discountCents: int,
  status: 'address_only'|'paid'|'shipped'|'delivered'|'rejected',
  fullName, phone, altPhone, governorateCode, city, addressStreet,
  addressBuilding: string|null, addressNote: string|null,
  senderPhone: string|null,
  paidAt / shippedAt / deliveredAt / rejectedAt: ISO|null,
  rejectionReason: string|null,
  createdAt: ISO,
}

BookOrderLine = { bookId: uuid|null, titleAr, unitPriceCents: int, quantity: int >= 1,
                  forGeneral: boolean|null, forLanguages: boolean|null, year: int|null }

bookOrderTotals(lines, shippingCents, discountCents = 0) -> {
  itemsCents = Σ unitPriceCents*quantity,
  shippingCents = lines.length === 0 ? 0 : shippingCents,
  discountCents = clamp(discountCents, 0, itemsCents + shipping),
  totalCents = itemsCents + shipping - discount,
}
```

Errors: **400** `'governorateCode does not match a known governorate'`,
`'في كتاب في السلة مش متاح دلوقتي — حدّث الصفحة'`, `` `«<titleAr>» مفيش منه العدد ده دلوقتي` ``,
`'this course has no book to order'`, `'screenshotKey was not issued by POST /book-orders/screenshot'`,
`'this order was already paid'`; **404** unknown order / unpublished course.

### 11.8 `AdminBookOrdersController` — `/api/admin/book-orders`

Declaration order: `summary`, `export`, `ship`, `deliver` (collection-level) all come **before**
their `:id`-shaped siblings.

| Method | Path | Permission | Body / query |
|---|---|---|---|
| GET | `/api/admin/book-orders` | `book-order:read` | `AdminBookOrderQuery` |
| GET | `/api/admin/book-orders/summary` | `book-order:read` | → `{ revenueTotalCents, paidCount }` |
| POST | `/api/admin/book-orders` | `book-order:create` + CSRF | `AdminCreateBookOrder` → `BookOrder` |
| PATCH | `/api/admin/book-orders/:id` | `book-order:write` + CSRF | `AdminBookOrderPatch` → `BookOrder` |
| GET | `/api/admin/book-orders/:id/screenshot` | `book-order:read` | streamed WebP |
| GET | `/api/admin/book-orders/export` | `book-order:read` | `ExportBookOrdersQuery` → XLSX (`Content-Disposition: attachment; filename="book-orders-<status>.xlsx"`) |
| POST | `/api/admin/book-orders/ship` | `book-order:ship` + CSRF | `BulkBookOrderAction` |
| POST | `/api/admin/book-orders/deliver` | `book-order:ship` + CSRF | `BulkBookOrderAction` |
| POST | `/api/admin/book-orders/:id/ship` | `book-order:ship` + CSRF | → `MarkBookOrderShippedResult` |
| POST | `/api/admin/book-orders/:id/deliver` | `book-order:ship` + CSRF | → `MarkBookOrderDeliveredResult` |
| POST | `/api/admin/book-orders/:id/reject` | `book-order:write` + CSRF | `{ reason }` → `RejectBookOrderResult` |
| DELETE | `/api/admin/book-orders/:id` | `book-order:write` + CSRF | `{ reason }` → `DeleteBookOrderResult` (soft) |
| POST | `/api/admin/book-orders/:id/restore` | `book-order:write` + CSRF | → `RestoreBookOrderResult` |

```ts
AdminBookOrderQuerySchema = ListQuerySchema.extend({
  status?: 'address_only'|'paid'|'shipped'|'delivered'|'rejected'|'deleted',
  sort: 'oldest'|'newest'|'amount_desc'|'amount_asc'|'name_asc'|'governorate' = 'oldest',
  stream?: 'general'|'languages',
  year?: coerce int 1..3,
}).omit({ dir: true })            // keeps q

reason = string 3..300 trimmed, 'اكتب سبب واضح' / 'السبب طويل أوي'
BulkBookOrderActionSchema = { ids: uuid[] 1..100, whatsapp: boolean = false }.strict()
BulkBookOrderResult = { rows: { id, outcome: 'shipped'|'delivered'|'notice_failed'|'skipped',
                                fullName, reason: string|null }[],
                        succeeded: int, noticeFailed: int, skipped: int }
ExportBookOrdersQuerySchema = { status: AdminBookOrderFilter, from: ISO date|null = null,
                                to: ISO date|null = null }.strict()   // status is REQUIRED
```

### 11.9 `ExpensesController` — `/api/admin/expenses`, `@UsePipes(ZodValidationPipe)`

| Method | Path | Permission | Body |
|---|---|---|---|
| GET | `/api/admin/expenses/overview` | `expense:read` | → `AdminFinanceOverview` |
| GET | `/api/admin/expenses` | `expense:read` | `AdminExpenseQuery` → `{ rows, rowCount }` |
| POST | `/api/admin/expenses` | `expense:write` + CSRF | `AdminExpenseCreate` |
| PATCH | `/api/admin/expenses/:id` | `expense:write` + CSRF | `AdminExpensePatch` |
| DELETE | `/api/admin/expenses/:id` | `expense:write` + CSRF | → `{ ok: true }` |

```ts
category = 'filming'|'printing'|'equipment'|'marketing'|'staff'|'services'|'other'
expenseWritableShape = {
  occurredOn: ISO date (YYYY-MM-DD),
  category,
  amountCents: int 1..1_000_000_000,
  titleAr: string 2..160 trimmed,
  noteAr: string(max 2000)|null = null,
  bookId: uuid|null = null,
  quantity: int 1..100_000 | null = null,
}.strict().refine(bookId == null || quantity != null,
                  'لازم تكتب اشتريت كام نسخة' on ['quantity'])

AdminExpenseQuerySchema = ListQuerySchema.extend({
  category?: ExpenseCategory,
  month?: /^\d{4}-(0[1-9]|1[0-2])$/ ('الشهر لازم يكون بالشكل YYYY-MM'),
}).omit({ dir: true })

AdminFinanceOverview = {
  subscriptionRevenueCents, bookRevenueCents, revenueTotalCents,
  subscriptionRefundsCents, bookRefundsCents, refundsTotalCents,
  subscriptionNetRevenueCents, bookNetRevenueCents, netRevenueTotalCents,
  expensesTotalCents,
  expensesByCategory: { category, amountCents }[],
  bookCostOfSalesCents, bookCostUnknownCount, bookProfitCents,
  bookItemsNetCents, bookShippingCents,
  netCents,
  months: { month, subscriptionRevenueCents, bookRevenueCents, expensesCents,
            subscriptionRefundsCents, bookRefundsCents, netCents }[],
}
```

---

## 12. Notifications and push — `NotificationsController` (`@Controller('me')`)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/me/notifications/stream` | `profile:read` | **SSE** |
| GET | `/api/me/notifications` | `profile:read` | cursor feed |
| GET | `/api/me/notifications/unread-count` | `profile:read` | `{ unread: int }` |
| POST | `/api/me/notifications/:id/read` | `profile:write` | **204** |
| POST | `/api/me/notifications/read-all` | `profile:write` | **204** |
| GET | `/api/me/push/public-key` | `profile:read` | `{ publicKey: string \| null }` |
| POST | `/api/me/push/subscribe` | `profile:write` | **204** |
| POST | `/api/me/push/unsubscribe` | `profile:write` | **204** |

### SSE stream

`Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: private, no-store, no-transform`,
`Connection: keep-alive`, `X-Accel-Buffering: no`. First line written is `retry: 5000\n\n`.
Frames are `data: <json>\n\n` where `<json>` is:

```ts
NotificationEvent =
  | { type: 'notification', notification: StudentNotification, unread: int }
  | { type: 'ping' }
```

A `ping` every `HEARTBEAT_MS = 25_000`. Teardown is bound to **`response.on('close')`**, never
`request.on('close')` — Node emits `close` on the request as soon as its body is read, which for a
GET is immediately.

Flutter note: this is a cookie-authenticated `text/event-stream`. `package:http` streaming or a
raw `HttpClient` works; `EventSource` does not exist on mobile.

### Feed

`GET /api/me/notifications?cursor=&limit=` — same clamp as the activity feed (default 20, max 50).

```ts
NotificationFeed = { entries: StudentNotification[], nextCursor: string | null }
```

`StudentNotification` is a discriminated union on `kind`. Every member has
`id: string`, `createdAt: ISO`, `readAt: ISO | null`.

| `kind` | extra fields |
|---|---|
| `quiz_graded` | `attemptId`, `lessonId`, `lessonTitle`, `scorePercent` 0..100, `passed: boolean\|null` |
| `extra_attempt_granted` | `lessonId`, `lessonTitle` |
| `conversation_reply` | `conversationId: uuid` |
| `instructor_message` | `conversationId: uuid`, `outreachKind: string` |
| `payment_approved` | `courseId`, `courseTitle`, `courseSlug`, `validUntil: ISO\|null` |
| `payment_rejected` | `courseId`, `courseTitle`, `courseSlug`, `reason: string` |
| `subscription_expiring_soon` | `courseId`, `courseTitle`, `courseSlug`, `validUntil: ISO` |
| `subscription_cancelled` | `courseId`, `courseTitle`, `courseSlug`, `reason: string` |
| `payment_submitted` (admin) | `submissionId`, `courseId`, `courseTitle`, `courseSlug`, `studentName` |
| `book_order_placed` (admin) | `orderId: uuid`, `studentName` |
| `assistant_question_received` (admin) | `conversationId: uuid`, `preview: string`, `studentName` |
| `book_order_shipped` | `orderId`, `bookTitle`, `deliveryDays: int 1..14` |
| `book_order_delivered` | `orderId`, `bookTitle` |
| `book_order_rejected` | `orderId`, `bookTitle`, `reason: string` |
| `course_completed` | `courseId`, `courseTitle`, `courseSlug` |
| `homework_submitted` (admin) | `submissionId`, `lessonId`, `lessonTitle`, `studentName` |
| `homework_reviewed` | `submissionId`, `lessonId`, `lessonTitle`, `courseSlug`, `homeworkStatus: 'accepted'\|'needs_work'`, `grade: 0..100\|null` |

Admin-targeted kinds are delivered by `notifyPermission('<permission>', kind, payload)`, which
resolves recipients through `rolesWithPermission(...)` — never a hard-coded `['admin']`.

### Web Push

```ts
PushSubscribeSchema   = { endpoint: z.url(),
                          keys: { p256dh: string(min 1), auth: string(min 1) } }.strict()
PushUnsubscribeSchema = { endpoint: z.url() }.strict()
PushPublicKey         = { publicKey: string | null }     // null when VAPID_PUBLIC_KEY is unset
```

This is **W3C Web Push (VAPID)**, `env.VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`
(`mailto:` or `https://`). There is no FCM/APNs integration anywhere in `apps/api` — see §16.

---

## 13. المساعد — the assistant

### 13.1 `AssistantController` — `/api/assistant` (visitor side, all `@Public()`)

Identity for a signed-out visitor is a **guest cookie**
(`apps/api/src/modules/assistant/guest-token.ts`):

- name: `__Host-assistant` in production, `assistant` in development;
- value: 32 random bytes, base64url; stored **hashed** (sha256 hex) server-side;
- set by `POST /api/assistant/conversations` with
  `httpOnly: true, secure: <production>, sameSite: 'strict', path: '/',
  maxAge: GUEST_COOKIE_MAX_AGE_SECONDS * 1000` where the constant is `90 * 24 * 60 * 60`.

| Method | Path | CSRF | Throttle |
|---|---|---|---|
| GET | `/api/assistant/conversations/mine` | no | global |
| GET | `/api/assistant/conversations/mine/summary` | no | global |
| POST | `/api/assistant/conversations` | **yes** | 1/10s · 3/600s · 5/1h |
| POST | `/api/assistant/conversations/:id/messages` | **yes** | 1/3s · 10/600s |
| GET | `/api/assistant/conversations/:id/messages/:messageId/attachment?download=` | no | global |
| POST | `/api/assistant/conversations/:id/read` | **yes** | global; **204** |

`:id` and `:messageId` go through `ParseUUIDPipe` → **400** on a non-UUID.
The attachment route returns **403** when neither a session nor a guest cookie is present
(`ownerWhere(...)` is null).

```ts
MyConversation        = { conversation: ConversationThread | null, isSignedIn: boolean }
MyConversationSummary = { unread: int >= 0, hasThread: boolean, hasOpenThread: boolean,
                          isSignedIn: boolean, latestFromAyman: string | null }
                        // SUMMARY_PREVIEW_MAX = 240

ConversationThread = {
  id: uuid,
  status: 'open'|'answered'|'closed',
  entryPath: string[],
  messages: ConversationMessage[],
  unreadForVisitor: int >= 0,
}

ConversationMessage = {
  id: uuid, author: 'visitor'|'admin', body: string, createdAt: ISO,
  adminReaction: string | null,
  attachment: {
    kind: 'image'|'document'|'voice', filename: string, sizeBytes: int > 0,
    durationSeconds: int > 0 | null,
    path: '/api/…', downloadPath: '/api/…',
  } | null,
  editedAt: ISO | null,
}
```

`POST /api/assistant/conversations` — `OpenConversationSchema`:

```ts
{
  entryPath: string[] (max 24), each a known assistant node id ('خطوة مش معروفة'),
  message:   string trimmed, min 2 ('السؤال الأول لسه فاضي'),
                            max 2000 ('الرسالة طويلة أوي — الحد 2000 حرف'),
  name?:     string trimmed 2..120 ('الاسم لسه فاضي'),
  phone?:    egyptianPhone('رقم الواتساب مطلوب'),
  transcript?: { role: 'user'|'assistant', text: string 1..1000 }[] (max 12),
}.strict()
```

`name`/`phone` are used **only** when there is no session (`user || !name || !phone ? null : {…}`).
Response: `ConversationThread`. Side effect: notifies every holder of `conversation:read`.

`POST /api/assistant/conversations/:id/messages` — `PostMessageSchema`
`{ message: <same rules>, transcript?: … }.strict()` → `ConversationThread`.

Transcript wire format (`serializeAssistantTranscript`): a single body string beginning with the
marker `🤖💬`, then optionally `⋯` when turns were dropped, then one line per turn prefixed
`🙋 ` (user) or `🤖 ` (assistant). `TRANSCRIPT_TURNS_MAX = 12`, `TRANSCRIPT_TURN_MAX = 300`
chars per line, whole body clipped to `TRANSCRIPT_BODY_MAX = 2000`.
`parseAssistantTranscript(body)` reverses it; `assistantTranscriptTrimmed(body)` reports the `⋯`.

Message reactions available to the instructor: `MESSAGE_REACTIONS = ['👍','❤️','😂','🔥','😮','🙏']`.

### 13.2 `POST /api/assistant/ask` — `AssistantAskController`, `@Public()` + `@RequireCsrf()`

Throttle 2/6s · 20/600s · 60/1h — the tightest in the product, because this is the only route that
**costs money per call**.

Request `AskRequestSchema`:

```ts
{
  question: string trimmed, min 1 ('مفيش سؤال متكتوب'), max 500
            ('السؤال طويل أوي — الحد 500 حرف'),
  history:  { role: 'user'|'assistant', text: string trimmed 1..4000 }[] (max 8, default []),
}.strict()
```

Response is **SSE**, always `200` even on failure (`Content-Type: text/event-stream; charset=utf-8`,
`Cache-Control: private, no-store, no-transform`, `Connection: keep-alive`,
`X-Accel-Buffering: no`). Frames are `data: <json>\n\n` with:

```ts
AskEvent =
  | { t: 'delta', text: string }
  | { t: 'done',  escalate: boolean, actions?: { label: string, href: string }[] }   // max 3
  | { t: 'error', code: 'failed' | 'tooMany' | 'unavailable' }
```

Special case: a signed-in student currently sitting an exam gets
`{t:'delta', text: copy.assistant.ai.duringExam}` then `{t:'done', escalate:false}` — the model is
never called.

Navigation actions the model may emit as `[[GO:<id>]]` markers (stripped from the text by
`readGoMarkers`), resolved by `askActions(ids, courses)`:

```
courses -> /courses      books -> /books        essentials -> /essentials
dashboard -> /dashboard  library -> /library    path -> /path
results -> /results      foundations -> /foundations
store -> /store          orders -> /store/orders
playground -> /playground profile -> /profile   devices -> /settings/devices
login -> /login          register -> /register
course:<slug> -> /courses/<slug>   (only when the slug is in the supplied course list)
```

`ASK_ACTIONS_MAX = 3`, `ASK_ACTION_LABEL_MAX = 40` (longer labels are clipped with `…`).
`isAskHref` accepts only the fixed set above or `/courses/<kebab-slug>`.

### 13.3 `AdminInboxController` — `/api/admin/conversations`

Static routes first: `attachments` and `unread-count` are declared **before** `:id`.

| Method | Path | Permission | Body / query |
|---|---|---|---|
| GET | `/api/admin/conversations` | `conversation:read` | `?filter=&page=&perPage=&sort=`; `filter` ∈ `unread\|open\|answered\|closed\|all` (default `unread`), `sort` ∈ `newest\|oldest` (default `newest`), page/perPage via `ListQuerySchema`; parsed with `parseRequest` → 400 `"invalid filter"` / `"invalid sort"` / `"invalid list query"` |
| POST | `/api/admin/conversations/attachments` | `conversation:reply` | multipart `file`, `fileSize: 95 MiB`, `files: 1` → `MessageAttachmentInput` |
| GET | `/api/admin/conversations/unread-count` | `conversation:read` | → `{ unread: int }` |
| GET | `/api/admin/conversations/:id` | `conversation:read` | → `AdminConversationDetail` |
| GET | `/api/admin/conversations/:id/messages/:messageId/attachment?download=` | `conversation:read` | streamed |
| POST | `/api/admin/conversations/:id/reply` | `conversation:reply` | `Reply` → **204** |
| PUT | `/api/admin/conversations/:id/messages/:messageId/reaction` | `conversation:reply` | `{ reaction: MessageReaction \| null }.strict()` → **204** |
| PATCH | `/api/admin/conversations/:id/messages/:messageId` | `conversation:reply` | `{ message: string 2..2000 }.strict()` → **204** |
| DELETE | `/api/admin/conversations/:id/messages/:messageId` | `conversation:reply` | **204** |
| PATCH | `/api/admin/conversations/:id/status` | `conversation:close` | `{ status: 'open'\|'closed' }.strict()` → **204** |

```ts
ReplySchema = { message: string trimmed max 2000,
                attachment?: MessageAttachmentInput | null }.strict()
  .refine(message.length >= 2 || attachment, 'اكتب رسالة أو ارفق ملف' on ['message'])

MessageAttachmentInputSchema = {
  storageKey: string passing isValidStorageKey ('الملف مش معروف'),
  filename: string trimmed 1..200,
  sizeBytes: int 1..MAX_DOCUMENT_BYTES,
  durationSeconds?: int 1..MAX_VOICE_SECONDS (600) | null,
}.strict()

AdminConversationRow = {
  id: uuid, status, origin: 'visitor'|'outreach', hasVisitorReply: boolean,
  who: string, userId: string|null, isGuest: boolean, guestPhone: string|null,
  entryPath: string[], preview: string, previewAuthor: 'visitor'|'admin',
  lastMessageAt: ISO, unreadForAdmin: boolean,
}
AdminConversationDetail = AdminConversationRow & {
  messages: ConversationMessage[], createdAt: ISO,
  contactPhone: string|null, hasActiveSubscription: boolean|null,
  courses: { courseId, courseTitle, source, validUntil: ISO|null }[] | null,
}
```

Voice notes: `ALLOWED_VOICE_EXT = ['webm','m4a']`, `ALLOWED_VOICE_MIME = ['audio/webm','audio/mp4']`,
magic bytes `webm @0 = 1A 45 DF A3`, `m4a @4 = 66 74 79 70`, `MAX_VOICE_BYTES = 20 MiB`,
`MAX_VOICE_SECONDS = 600`.

### 13.4 `AdminAssistantQuestionsController` — `/api/admin/assistant`

| Method | Path | Permission | Query |
|---|---|---|---|
| GET | `/api/admin/assistant/questions` | `conversation:read` | `ListQuerySchema.extend({ escalatedOnly: coerce boolean = false }).strict()` |
| GET | `/api/admin/assistant/questions/:id/context` | `conversation:read` | `:id` via `ParseUUIDPipe` |

```ts
AssistantQuestion = { id: uuid, question, answer, provider: string|null, escalated: boolean,
                      studentName: string|null, isGuest: boolean,
                      conversationId: uuid|null, askedAt: ISO }
AssistantQuestionContext = { question: AssistantQuestion, siblings: AssistantQuestion[],
                             conversation: { id: uuid, status, startedAt: ISO } | null }
```

### 13.5 `AdminOutreachController` — `/api/admin/outreach`, all `outreach:read`

«رسايل م. أيمن» — auditing what the platform said in the instructor's name. There is deliberately
**no `outreach:send`**: sending is caused by what students do; the only human control is
`settings:write` (§9.1's `outreach` section).

| Method | Path | Query |
|---|---|---|
| GET | `/api/admin/outreach` | `?filter=&page=&perPage=` — `filter` ∈ `all` + `OUTREACH_KINDS`, default `all` (via `parseRequest`) |
| GET | `/api/admin/outreach/stats` | — |
| GET | `/api/admin/outreach/preview` | — |

```ts
OutreachLogRow = { id: uuid, kind, userId: string|null, studentName, conversationId: uuid,
                   body: string, facts: OutreachFacts, createdAt: ISO,
                   seen: boolean, replied: boolean }

OutreachFacts (discriminated on kind) =
  | { kind: 'quiz_result', quizTitle, scorePercent 0..100,
      weakTopics: { name: string|null, questionNumbers: int[] }[], strongTopics: string[] }
  | { kind: 'quiz_nudge',    lessonTitle }
  | { kind: 'lesson_praise', lessonTitle }
  | { kind: 'whatsapp_invite' }

OutreachStats   = { sent, seen, replied, sentRecent, activeSince: ISO|null }
OutreachPreview = { samples: { kind, body }[] }
```

---

## 14. Students, homework review, analytics, diagnostics, marketing

### 14.1 `StudentsController` — `/api/admin/students`, `@UsePipes(ZodValidationPipe)`

| Method | Path | Permission | Body |
|---|---|---|---|
| GET | `/api/admin/students` | `student:read` | `StudentListQuery` |
| GET | `/api/admin/students/:userId` | `student:read` | → `AdminStudentDetail` |
| PATCH | `/api/admin/students/:userId` | `student:write` | `AdminStudentPatch` |
| GET | `/api/admin/students/:userId/history` | `student:read` | → `StudentHistoryEntry[]` |
| GET | `/api/admin/students/:userId/grants` | `student:read` | → `AdminGrantRow[]` |
| POST | `/api/admin/students/:userId/grants` | `student:write` | `AdminGrantCreate` |
| DELETE | `/api/admin/students/:userId/grants/:grantId` | `student:write` | |
| POST | `/api/admin/students/:userId/set-password` | `student:set-password` | `{ newPassword: string 8..128 }` |
| POST | `/api/admin/students/:userId/role` | `student:role-change` | `{ role: 'admin'\|'student', reason: string 8..500 }.strict()` |
| POST | `/api/admin/students/:userId/ban` | `student:ban` | `{ reason: string 8..500 }.strict()` |
| POST | `/api/admin/students/:userId/unban` | `student:ban` | — |
| DELETE | `/api/admin/students` | `student:delete` | `AdminStudentBulkDelete` — **declared BEFORE `:userId`** |
| DELETE | `/api/admin/students/:userId` | `student:delete` | `AdminStudentDelete` |

```ts
StudentListQuerySchema = {
  page: coerce int >= 1 = 1,
  perPage: coerce int 1..100 = 20,      // NOT the closed PAGE_SIZES set
  q: string(max 120) = '',
  governorate: string(len 2)[] = []     // repeatable query param, normalised to an array
  year: coerce int[] = [],
  track: string[] = [],
  sort: 'createdAt'|'fullName'|'governorate' = 'createdAt',
  dir: 'asc'|'desc' = 'desc',
  access: 'hand_opened'|'comped'|'paid' | null = null,
}

AdminStudentRow = { id, fullName, email: string|null, phone, gender: 'male'|'female',
                    governorateCode(2), governorateNameAr,
                    systemSlug: string|null, year: int|null, trackLabelAr: string|null,
                    onboardingCompleted: boolean, createdAt: string, bannedAt: string|null }

AdminStudentDetail = AdminStudentRow & {
  role: string, schoolName: string|null, schoolStream: 'general'|'languages'|null,
  fatherPhone: string|null, motherPhone: string|null,
  electiveSubjectNameAr: string|null,
  bannedReason: string|null, bannedByName: string|null,
}

AdminStudentPatchSchema = {
  fullName? 2..120, schoolName?: string(max 160)|null, governorateCode?(len 2),
  year?: int 1..3|null, schoolStream?: 'general'|'languages'|null,
  phone?: egyptianPhone('رقم الموبايل مطلوب'),
  email?: z.email('أدخل بريدًا إلكترونيًا صحيحًا') rejecting @phone.invalid | null,
}.strict().refine(Object.keys(value).length > 0, 'no fields to update')
// NOTE: there is deliberately NO `password` key here.

AdminStudentDeleteSchema = { confirmIdentity: string 3..320, reason: string 8..500 }.strict()
// `expectedDeleteIdentity({phone,email})` -> phone ?? email ?? null
// `deleteIdentityMatches(typed, expected)` — case-insensitive exact match, or Egyptian
//   national-digit equality (strips 00/20/leading zeros, needs >= 9 digits).

AdminStudentBulkDeleteSchema = { userIds: string[] (1..100, each 1..64), reason: string 8..500 }.strict()
AdminStudentBulkDeleteResult = { deleted: string[],
  failed: { userId, name, reason: 'self'|'last-admin'|'authored-content'|'not-found' }[] }

AdminGrantCreateSchema = { courseId: uuid, validUntil: ISO datetime|null = null,
                           note: string(max 500)|null = null }.strict()
AdminGrantRow = { id, courseId, courseTitle, source: string, validFrom: ISO,
                  validUntil: ISO|null, revokedAt: ISO|null, note: string|null }

StudentHistoryEntry = { key, kind, at: ISO, courseId: string|null, courseTitle: string|null,
                        actorName: string|null, source: string|null, amountCents: int|null,
                        isFree: boolean|null, plan: string|null, validUntil: ISO|null,
                        detail: string|null }
STUDENT_HISTORY_KINDS = account_created | grant_created | grant_revoked | payment_submitted
  | payment_approved | payment_rejected | book_order_placed | book_order_paid
  | book_order_shipped | book_order_delivered | book_order_rejected | banned | unbanned
```

> Deleting a user is blocked by a CHECK on `conversations`, and Postgres names the wrong table in
> the error. `AdminStudentDeleteBlockerSchema = { courses, questionBankEntries, questionVersions,
> newsPosts }` describes the authored-content blockers.
> Also: `better-auth` ids are **nanoids**, not UUIDs — a `z.uuid()` on a `userId` passes every
> fixture and 400s every real student. That is why `userIds` here is `string().min(1).max(64)`.

### 14.2 `AdminHomeworkController` — `/api/admin/homework`

Static route first: `pending-count`, then `images/:imageId`, then `:id`. That ordering is
load-bearing (`:id` uses `ParseUUIDPipe`, so a mis-ordered `images` would 400).

| Method | Path | Permission | Query / body |
|---|---|---|---|
| GET | `/api/admin/homework/pending-count` | `homework:read` | → `{ pending: int >= 0 }` |
| GET | `/api/admin/homework` | `homework:read` | `?filter=&courseId=&page=&perPage=`; `filter` ∈ `pending\|accepted\|needs_work\|all` default `pending`; page/perPage via `ListQuerySchema` (`parseRequest`) → `{ rows: AdminHomeworkRow[], rowCount }` |
| GET | `/api/admin/homework/images/:imageId` | `homework:read` | streamed WebP |
| GET | `/api/admin/homework/:id` | `homework:read` | → `AdminHomeworkDetail` |
| POST | `/api/admin/homework/:id/review` | `homework:review` | `HomeworkReview` → **204** |

```ts
AdminHomeworkRow = { id: uuid, status, attempt: int, imageCount: int, imagesPurged: boolean,
                     grade: number|null, submittedAt: ISO,
                     studentId, studentName, lessonId: uuid, lessonTitle,
                     courseId: uuid, courseTitle }
AdminHomeworkDetail = AdminHomeworkRow & {
  prompt: string, imageIds: uuid[], reviewNote: string|null, reviewedAt: ISO|null,
  studentPhone: string|null, courseSlug: string,
  suggestions: { accepted: string[], needsWork: string[] },
}

HomeworkReviewSchema = {
  decision: 'accepted'|'needs_work',
  grade: number 0..100 | null = null,
  message: string trimmed 2..1000,
}.strict().refine(decision === 'accepted' || grade === null,
                  'الدرجة تتحط مع القبول بس' on ['grade'])
```

⚠️ The review route returns **204**. A client must use a void helper — parsing the body would throw
*after* the student had already been marked and notified.

### 14.3 `AnalyticsController` — `/api/admin/analytics`, class `analytics:read`, `ZodValidationPipe`

| Method | Path | Query |
|---|---|---|
| GET | `/api/admin/analytics/overview` | `{ days: coerce int ∈ {7,30,90,365} = 30, courseId: uuid → null }` |
| GET | `/api/admin/analytics/lessons` | `{ courseId: uuid → null }` → `LessonAnalyticsRow[]` |
| GET | `/api/admin/analytics/lessons/:lessonId` | `ParseUUIDPipe` → `LessonAnalyticsDetail` |
| GET | `/api/admin/analytics/students` | `StudentAnalyticsQuery` → `{ rows, rowCount }` |
| GET | `/api/admin/analytics/students/:userId` | → `StudentAnalyticsDetail` |
| GET | `/api/admin/analytics/export/lessons.csv` | `LessonAnalyticsQuery`; `text/csv; charset=utf-8`, `attachment; filename="lessons.csv"` |
| GET | `/api/admin/analytics/export/students.csv` | `StudentAnalyticsQuery`; forced to `page: 1, perPage: 100_000`; `attachment; filename="students.csv"` |
| GET | `/api/admin/analytics/lessons/:lessonId/roster.csv` | `attachment; filename="lesson-roster.csv"` |

```ts
StudentAnalyticsQuerySchema = {
  page: coerce int >= 1 = 1, perPage: coerce int 1..200 = 25,
  q: string(max 120) = '',
  sort: 'fullName'|'lessonsCompleted'|'watchHours'|'avgCompletion'|'attempts'|'meanScore'
        |'passRate'|'lastActiveAt' = 'lastActiveAt',
  dir: 'asc'|'desc' = 'desc',
  year: coerce int 1..3 [] = [],
  courseId: uuid → null,
}
```

`AnalyticsOverview` (`packages/contracts/src/admin/analytics.ts`) carries `students`, `video`,
`quiz` blocks plus `scoreBuckets`, `gradeBands`, `durationBuckets`, `completionBuckets`,
`engagement`, `daily`, `byYear`, `byGovernorate`. Rates are **fractions 0..1**, not percentages.
Grade bands: `a >= 0.85, b >= 0.75, c >= 0.65, d >= 0.5, else f`.
Duration buckets: `[60, 180, 300, 600, 900, 1800, 3600]` seconds plus an open-ended `null` upper.
Engagement segments: `both | videoOnly | quizOnly | neither`.

CSV columns are written explicitly in the controller — see
`apps/api/src/modules/analytics/analytics.controller.ts` for the exact header rows.
These `.csv` paths are exactly why `PrivateCacheInterceptor` exists (Cloudflare caches `.csv` by
extension by default).

### 14.4 Diagnostics

**`POST /api/errors` — `DiagnosticsController`, `@Public()`, no `@RequireCsrf()`, `@HttpCode(204)`.**
A browser CSP-violation-style report route: public because the failures most worth knowing about
are the ones a signed-out visitor hits on a link from WhatsApp. It records `userId` when a session
happens to be present (`optionalSession.userOrNull(request).catch(() => null)`) and
`user-agent` truncated to 400 chars.

```ts
ErrorReportInputSchema = {
  kind: 'server'|'client'|'timeout',
  route: string 1..512 that must start with '/',      // a pathname, so a reset token in a
                                                      // query string can never be logged
  message: string 1..1000,
  digest?: string(max 200),
  stack?: string(max 4000),
}
```

**`AdminErrorsController` — `/api/admin/errors`.**

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/admin/errors?filter=&page=&perPage=` | `diagnostics:read` | `filter` ∈ `open\|resolved\|all` default `open`; `perPage` must be one of `10\|20\|50\|100` (this is the route whose 500-on-`perPage=40` created `parseRequest`) |
| PATCH | `/api/admin/errors/:id/resolve` | `diagnostics:resolve` | **204** |
| PATCH | `/api/admin/errors/:id/reopen` | `diagnostics:resolve` | **204** |

```ts
ErrorReportList = { rows: ErrorReportRow[], total: int, summary: { open: int, last24h: int } }
ErrorReportRow = { id, kind, route, message, digest: string|null, stack: string|null,
                   userAgent: string|null, userId: string|null,
                   occurrences: int > 0, firstSeenAt, lastSeenAt, resolvedAt: string|null }
```

Rows are grouped on a fingerprint and counted, not appended per call.

> Operational note: the error log **misses every API 500**, and the audit log only ever says
> "success".

**`POST /api/security/csp-report` — `CspReportController`, `@Public()`, `@HttpCode(204)`,
throttle 20/10s.** Body is `unknown`; `normalise()` accepts both the Reporting API array form
(`[{ type: 'csp-violation', body: { effectiveDirective, blockedURL, documentURL, sample } }]`) and
the legacy `{ "csp-report": { "effective-directive"|"violated-directive", "blocked-uri",
"document-uri", "script-sample" } }`. Fields truncated to 120 chars; deduped per
`directive|blockedUri` for 60 s, map cleared at 500 keys. No CSRF (a browser's own report POST
cannot carry a custom header). Its own body parser accepts
`application/csp-report`, `application/reports+json`, `application/json`, max 16 KiB.

### 14.5 `MarketingController` — `/api/admin/marketing`, `@UsePipes(ZodValidationPipe)`

Every write carries `@RequireCsrf()` in addition to its permission.

| Method | Path | Permission | Body |
|---|---|---|---|
| GET | `/api/admin/marketing/device` | `marketing:read` | → `WhatsappDevice` |
| POST | `/api/admin/marketing/device/link` | `marketing:device` | → `WhatsappDevice` (audits `whatsapp:link`) |
| POST | `/api/admin/marketing/device/unlink` | `marketing:device` | → `{ ok: true }` (audits `whatsapp:unlink`) |
| GET | `/api/admin/marketing/opt-outs` | `marketing:read` | → `OptOutRow[]` |
| POST | `/api/admin/marketing/opt-outs` | `marketing:write` | `{ phone: string 6..20, reason: string(max 300)\|null }` |
| DELETE | `/api/admin/marketing/opt-outs/:phone` | `marketing:write` | → `{ ok: true }` |
| POST | `/api/admin/marketing/audience-preview` | `marketing:write` | `{ audience: Audience, pacing: Pacing }` → `AudiencePreview` |
| GET | `/api/admin/marketing/campaigns` | `marketing:read` | → `CampaignRow[]` |
| POST | `/api/admin/marketing/campaigns` | `marketing:write` | `CampaignCreate` → `CampaignRow` |
| GET | `/api/admin/marketing/campaigns/:id` | `marketing:read` | → `CampaignDetail` |
| GET | `/api/admin/marketing/campaigns/:id/recipients?status=` | `marketing:read` | `status` ∈ `pending\|sent\|failed\|skipped`, anything else → `'all'` |
| PATCH | `/api/admin/marketing/campaigns/:id` | `marketing:write` | `CampaignPatch` → `CampaignDetail` |
| POST | `/api/admin/marketing/campaigns/:id/start` | `marketing:send` | → `CampaignRow` |
| POST | `/api/admin/marketing/campaigns/:id/pause` | `marketing:send` | → `CampaignRow` |
| POST | `/api/admin/marketing/campaigns/:id/cancel` | `marketing:send` | → `CampaignRow` |
| DELETE | `/api/admin/marketing/campaigns/:id` | `marketing:write` | → `{ ok: true }` |

```ts
Audience = { students: boolean, parents: boolean, years: int[1..3][],
             schoolStreams: ('general'|'languages')[] = [],
             courseIds: uuid[], notSubscribedOnly: boolean = false,
             bookOrderStatuses: BookOrderStatus[] = [], extraPhones: string[] (max 500) }

Pacing = { minDelaySeconds: int 5..3600, maxDelaySeconds: int 5..3600,
           batchSize: int 0..500, batchPauseMinutes: int 0..720,
           dailyCap: int 1..1000, windowStartHour: int 0..23, windowEndHour: int 1..24 }
 .refine(max >= min, 'أقصى مدة بين الرسايل لازم تكون أكبر من أقلها أو تساويها' on ['maxDelaySeconds'])
 .refine(windowEndHour > windowStartHour, 'ساعة الإقفال لازم تكون بعد ساعة الفتح' on ['windowEndHour'])

CampaignCreate = { name: string 2..120, body: string 4..900, imageAssetId: uuid|null,
                   linkUrl: url starting http(s) ('اللينك لازم يبدأ بـ http:// أو https://')|null,
                   audience: Audience, pacing: Pacing }
CampaignPatch  = CampaignCreate minus audience, all keys optional

Message tokens: NAME_TOKEN = '{{الاسم}}', LINK_TOKEN = '{{اللينك}}'
Campaign statuses: draft | running | paused | done | cancelled
Recipient statuses: pending | sent | failed | skipped
WhatsappDevice = { state: 'disabled'|'unreachable'|'disconnected'|'linking'|'connected',
                   phone: string|null, qr: string|null, detail: string|null }
```

**`POST /api/marketing/wa/inbound` — `WhatsappInboundController`, `@Public()`.**
The WhatsApp sidecar's relay, a container on the compose network — not a browser route.
Header **`x-wa-token`** must equal `env.WA_SERVICE_TOKEN` (unset → `401` for everything).
Body `{ phone?: unknown, text?: unknown }`; non-string phone or text → **400**
`'phone and text are required'`. If `isOptOutMessage(text)` the phone is added to the opt-out list
(best effort). Always `{ ok: true }`.

---

## 15. Complete route index

Generated by reflecting the route decorators of all 55 controllers under `apps/api/src`
(the same data `enumerateRoutes()` uses in the authorization matrix). `Guard` is the effective
`@RequirePermission` after the method-level override of any class-level one; `CSRF` marks routes
that carry `@RequireCsrf()` **in addition** to being `@Public()` — every non-public write is
CSRF-checked anyway (§0.4). `Status` is a non-default `@HttpCode`.

Total registered routes: **278**

| Path | Method | Guard | CSRF | Status |
|---|---|---|---|---|
| `/api/admin/analytics/export/lessons.csv` | GET | `analytics:read` |  |  |
| `/api/admin/analytics/export/students.csv` | GET | `analytics:read` |  |  |
| `/api/admin/analytics/lessons` | GET | `analytics:read` |  |  |
| `/api/admin/analytics/lessons/:lessonId` | GET | `analytics:read` |  |  |
| `/api/admin/analytics/lessons/:lessonId/roster.csv` | GET | `analytics:read` |  |  |
| `/api/admin/analytics/overview` | GET | `analytics:read` |  |  |
| `/api/admin/analytics/students` | GET | `analytics:read` |  |  |
| `/api/admin/analytics/students/:userId` | GET | `analytics:read` |  |  |
| `/api/admin/assistant/questions` | GET | `conversation:read` |  |  |
| `/api/admin/assistant/questions/:id/context` | GET | `conversation:read` |  |  |
| `/api/admin/attempts` | GET | `attempt:read` |  |  |
| `/api/admin/attempts/:id/extra-time` | POST | `attempt:unlock` |  |  |
| `/api/admin/attempts/:id/reopen` | POST | `attempt:unlock` |  |  |
| `/api/admin/audit` | GET | `audit:read` |  |  |
| `/api/admin/audit/verify` | GET | `audit:read` |  |  |
| `/api/admin/book-orders` | GET | `book-order:read` |  |  |
| `/api/admin/book-orders` | POST | `book-order:create` | yes |  |
| `/api/admin/book-orders/:id` | DELETE | `book-order:write` | yes |  |
| `/api/admin/book-orders/:id` | PATCH | `book-order:write` | yes |  |
| `/api/admin/book-orders/:id/deliver` | POST | `book-order:ship` | yes |  |
| `/api/admin/book-orders/:id/reject` | POST | `book-order:write` | yes |  |
| `/api/admin/book-orders/:id/restore` | POST | `book-order:write` | yes |  |
| `/api/admin/book-orders/:id/screenshot` | GET | `book-order:read` |  |  |
| `/api/admin/book-orders/:id/ship` | POST | `book-order:ship` | yes |  |
| `/api/admin/book-orders/deliver` | POST | `book-order:ship` | yes |  |
| `/api/admin/book-orders/export` | GET | `book-order:read` |  |  |
| `/api/admin/book-orders/ship` | POST | `book-order:ship` | yes |  |
| `/api/admin/book-orders/summary` | GET | `book-order:read` |  |  |
| `/api/admin/books` | GET | `book:read` |  |  |
| `/api/admin/books` | POST | `book:write` | yes |  |
| `/api/admin/books/:id` | DELETE | `book:write` | yes |  |
| `/api/admin/books/:id` | PATCH | `book:write` | yes |  |
| `/api/admin/conversations` | GET | `conversation:read` |  |  |
| `/api/admin/conversations/:id` | GET | `conversation:read` |  |  |
| `/api/admin/conversations/:id/messages/:messageId` | DELETE | `conversation:reply` |  | 204 |
| `/api/admin/conversations/:id/messages/:messageId` | PATCH | `conversation:reply` |  | 204 |
| `/api/admin/conversations/:id/messages/:messageId/attachment` | GET | `conversation:read` |  |  |
| `/api/admin/conversations/:id/messages/:messageId/reaction` | PUT | `conversation:reply` |  | 204 |
| `/api/admin/conversations/:id/reply` | POST | `conversation:reply` |  | 204 |
| `/api/admin/conversations/:id/status` | PATCH | `conversation:close` |  | 204 |
| `/api/admin/conversations/attachments` | POST | `conversation:reply` |  |  |
| `/api/admin/conversations/unread-count` | GET | `conversation:read` |  |  |
| `/api/admin/courses` | GET | `course:read-admin` |  |  |
| `/api/admin/courses` | POST | `course:create` |  |  |
| `/api/admin/courses/:courseId/sections` | POST | `section:write` |  |  |
| `/api/admin/courses/:courseId/sections/order` | PATCH | `section:reorder` |  |  |
| `/api/admin/courses/:courseId/terms` | GET | `section:write` |  |  |
| `/api/admin/courses/:courseId/terms` | POST | `section:write` |  |  |
| `/api/admin/courses/:id` | DELETE | `course:delete` |  |  |
| `/api/admin/courses/:id` | GET | `course:read-admin` |  |  |
| `/api/admin/courses/:id` | PATCH | `course:update` |  |  |
| `/api/admin/courses/:id/exam` | PUT | `course:update` |  |  |
| `/api/admin/courses/:id/exam/scaffold` | POST | `course:update` |  |  |
| `/api/admin/courses/:id/publish-all` | POST | `course:publish` |  |  |
| `/api/admin/courses/:id/status` | PATCH | `course:publish` |  |  |
| `/api/admin/courses/:id/video-check` | GET | `course:read-admin` |  |  |
| `/api/admin/errors` | GET | `diagnostics:read` |  |  |
| `/api/admin/errors/:id/reopen` | PATCH | `diagnostics:resolve` |  | 204 |
| `/api/admin/errors/:id/resolve` | PATCH | `diagnostics:resolve` |  | 204 |
| `/api/admin/expenses` | GET | `expense:read` |  |  |
| `/api/admin/expenses` | POST | `expense:write` | yes |  |
| `/api/admin/expenses/:id` | DELETE | `expense:write` | yes |  |
| `/api/admin/expenses/:id` | PATCH | `expense:write` | yes |  |
| `/api/admin/expenses/overview` | GET | `expense:read` |  |  |
| `/api/admin/finance` | GET | `payment:read` |  |  |
| `/api/admin/finance/:grantId/amount` | PATCH | `payment:review` |  |  |
| `/api/admin/finance/:grantId/cancel` | POST | `payment:review` |  |  |
| `/api/admin/finance/:grantId/dates` | PATCH | `payment:review` |  |  |
| `/api/admin/flags` | GET | `flags:read` |  |  |
| `/api/admin/flags/:key` | PATCH | `flags:write` |  |  |
| `/api/admin/home-blocks` | GET | `home:read` |  |  |
| `/api/admin/home-blocks` | POST | `home:write` |  |  |
| `/api/admin/home-blocks/:id` | DELETE | `home:write` |  |  |
| `/api/admin/home-blocks/:id` | PATCH | `home:write` |  |  |
| `/api/admin/home-blocks/:id/published` | PATCH | `home:write` |  |  |
| `/api/admin/home-blocks/:id/restore` | POST | `home:write` |  |  |
| `/api/admin/home-blocks/order` | POST | `home:write` |  |  |
| `/api/admin/homework` | GET | `homework:read` |  |  |
| `/api/admin/homework/:id` | GET | `homework:read` |  |  |
| `/api/admin/homework/:id/review` | POST | `homework:review` |  | 204 |
| `/api/admin/homework/images/:imageId` | GET | `homework:read` |  |  |
| `/api/admin/homework/pending-count` | GET | `homework:read` |  |  |
| `/api/admin/lessons/:id` | DELETE | `lesson:write` |  |  |
| `/api/admin/lessons/:id` | PATCH | `lesson:write` |  |  |
| `/api/admin/lessons/:id/homework` | DELETE | `lesson:write` |  |  |
| `/api/admin/lessons/:id/homework` | PUT | `lesson:write` |  |  |
| `/api/admin/lessons/:id/resources` | POST | `lesson:write` |  |  |
| `/api/admin/lessons/:id/resources/order` | PATCH | `lesson:reorder` |  |  |
| `/api/admin/lessons/:id/text` | PUT | `lesson:write` |  |  |
| `/api/admin/lessons/:id/video` | DELETE | `lesson:write` |  |  |
| `/api/admin/lessons/:id/video` | PUT | `lesson:write` |  |  |
| `/api/admin/lessons/:id/video/mirror` | POST | `lesson:write` |  |  |
| `/api/admin/lessons/video-duration` | GET | `lesson:write` |  |  |
| `/api/admin/marketing/audience-preview` | POST | `marketing:write` | yes |  |
| `/api/admin/marketing/campaigns` | GET | `marketing:read` |  |  |
| `/api/admin/marketing/campaigns` | POST | `marketing:write` | yes |  |
| `/api/admin/marketing/campaigns/:id` | DELETE | `marketing:write` | yes |  |
| `/api/admin/marketing/campaigns/:id` | GET | `marketing:read` |  |  |
| `/api/admin/marketing/campaigns/:id` | PATCH | `marketing:write` | yes |  |
| `/api/admin/marketing/campaigns/:id/cancel` | POST | `marketing:send` | yes |  |
| `/api/admin/marketing/campaigns/:id/pause` | POST | `marketing:send` | yes |  |
| `/api/admin/marketing/campaigns/:id/recipients` | GET | `marketing:read` |  |  |
| `/api/admin/marketing/campaigns/:id/start` | POST | `marketing:send` | yes |  |
| `/api/admin/marketing/device` | GET | `marketing:read` |  |  |
| `/api/admin/marketing/device/link` | POST | `marketing:device` | yes |  |
| `/api/admin/marketing/device/unlink` | POST | `marketing:device` | yes |  |
| `/api/admin/marketing/opt-outs` | GET | `marketing:read` |  |  |
| `/api/admin/marketing/opt-outs` | POST | `marketing:write` | yes |  |
| `/api/admin/marketing/opt-outs/:phone` | DELETE | `marketing:write` | yes |  |
| `/api/admin/media` | GET | `media:read` |  |  |
| `/api/admin/media/:id` | DELETE | `media:delete` |  | 204 |
| `/api/admin/media/:id` | PATCH | `media:write` |  |  |
| `/api/admin/media/:id/archive` | POST | `media:delete` |  |  |
| `/api/admin/media/:id/replace` | POST | `media:write` |  |  |
| `/api/admin/media/:id/restore` | POST | `media:delete` |  |  |
| `/api/admin/media/:id/usage` | GET | `media:read` |  |  |
| `/api/admin/navigation` | GET | `nav:read` |  |  |
| `/api/admin/navigation` | POST | `nav:write` |  |  |
| `/api/admin/navigation/:id` | DELETE | `nav:write` |  |  |
| `/api/admin/navigation/:id` | PATCH | `nav:write` |  |  |
| `/api/admin/navigation/:id/restore` | POST | `nav:write` |  |  |
| `/api/admin/navigation/order` | POST | `nav:write` |  |  |
| `/api/admin/news` | GET | `news:read` |  |  |
| `/api/admin/news` | POST | `news:write` | yes |  |
| `/api/admin/news/:id` | DELETE | `news:write` | yes |  |
| `/api/admin/news/:id` | GET | `news:read` |  |  |
| `/api/admin/news/:id` | PATCH | `news:write` | yes |  |
| `/api/admin/news/:id/published` | PATCH | `news:publish` | yes |  |
| `/api/admin/outreach` | GET | `outreach:read` |  |  |
| `/api/admin/outreach/preview` | GET | `outreach:read` |  |  |
| `/api/admin/outreach/stats` | GET | `outreach:read` |  |  |
| `/api/admin/payments/submissions` | GET | `payment:read` |  |  |
| `/api/admin/payments/submissions/:id/approve` | POST | `payment:review` |  |  |
| `/api/admin/payments/submissions/:id/reject` | POST | `payment:review` |  |  |
| `/api/admin/payments/submissions/:id/screenshot` | GET | `payment:read` |  |  |
| `/api/admin/questions` | GET | `question:write` |  |  |
| `/api/admin/questions` | POST | `question:write` |  |  |
| `/api/admin/questions/:bankEntryId` | GET | `question:write` |  |  |
| `/api/admin/questions/:bankEntryId` | PATCH | `question:write` |  |  |
| `/api/admin/questions/:bankEntryId/duplicate` | POST | `question:write` |  |  |
| `/api/admin/questions/:versionId/publish` | POST | `question:write` |  |  |
| `/api/admin/questions/bulk` | POST | `question:write` |  |  |
| `/api/admin/questions/categories` | GET | `question:write` |  |  |
| `/api/admin/questions/categories` | POST | `question:write` |  |  |
| `/api/admin/quizzes/:quizId` | GET | `quiz:write` |  |  |
| `/api/admin/quizzes/:quizId/analytics` | GET | `analytics:read` |  |  |
| `/api/admin/quizzes/:quizId/attempts` | GET | `attempt:read` |  |  |
| `/api/admin/quizzes/:quizId/lesson` | PATCH | `quiz:write` |  |  |
| `/api/admin/quizzes/:quizId/pools` | POST | `quiz:write` |  |  |
| `/api/admin/quizzes/:quizId/publish` | POST | `quiz:write` |  |  |
| `/api/admin/quizzes/:quizId/slots` | POST | `quiz:write` |  |  |
| `/api/admin/quizzes/:quizId/slots/:slotId` | DELETE | `quiz:write` |  |  |
| `/api/admin/quizzes/:quizId/slots/:slotId` | PATCH | `quiz:write` |  |  |
| `/api/admin/quizzes/:quizId/slots/order` | PATCH | `quiz:write` |  |  |
| `/api/admin/quizzes/:quizId/students/:userId/extra-attempt` | POST | `attempt:unlock` |  |  |
| `/api/admin/quizzes/lesson/:lessonId` | GET | `quiz:write` |  |  |
| `/api/admin/quizzes/lesson/:lessonId` | PUT | `quiz:write` |  |  |
| `/api/admin/resources/:id` | DELETE | `lesson:write` |  |  |
| `/api/admin/resources/:id` | PATCH | `lesson:write` |  |  |
| `/api/admin/sections/:id` | DELETE | `section:write` |  |  |
| `/api/admin/sections/:id` | PATCH | `section:write` |  |  |
| `/api/admin/sections/:sectionId/lessons` | POST | `lesson:write` |  |  |
| `/api/admin/sections/:sectionId/lessons/order` | PATCH | `lesson:reorder` |  |  |
| `/api/admin/settings` | GET | `settings:read` |  |  |
| `/api/admin/settings/:section` | PATCH | `settings:write` |  |  |
| `/api/admin/students` | DELETE | `student:delete` |  |  |
| `/api/admin/students` | GET | `student:read` |  |  |
| `/api/admin/students/:userId` | DELETE | `student:delete` |  |  |
| `/api/admin/students/:userId` | GET | `student:read` |  |  |
| `/api/admin/students/:userId` | PATCH | `student:write` |  |  |
| `/api/admin/students/:userId/ban` | POST | `student:ban` |  |  |
| `/api/admin/students/:userId/grants` | GET | `student:read` |  |  |
| `/api/admin/students/:userId/grants` | POST | `student:write` |  |  |
| `/api/admin/students/:userId/grants/:grantId` | DELETE | `student:write` |  |  |
| `/api/admin/students/:userId/history` | GET | `student:read` |  |  |
| `/api/admin/students/:userId/role` | POST | `student:role-change` |  |  |
| `/api/admin/students/:userId/set-password` | POST | `student:set-password` |  |  |
| `/api/admin/students/:userId/subscriptions` | GET | `payment:read` |  |  |
| `/api/admin/students/:userId/subscriptions` | POST | `payment:review` |  |  |
| `/api/admin/students/:userId/subscriptions/:grantId` | DELETE | `payment:review` |  |  |
| `/api/admin/students/:userId/unban` | POST | `student:ban` |  |  |
| `/api/admin/taxonomy/academic-years/:id` | PATCH | `taxonomy:write` |  |  |
| `/api/admin/taxonomy/governorates` | GET | `taxonomy:read` |  |  |
| `/api/admin/taxonomy/governorates/:code` | PATCH | `taxonomy:write` |  |  |
| `/api/admin/taxonomy/subject-offerings` | GET | `taxonomy:read` |  |  |
| `/api/admin/taxonomy/subject-offerings` | POST | `taxonomy:write` |  |  |
| `/api/admin/taxonomy/subject-offerings/:id` | PATCH | `taxonomy:write` |  |  |
| `/api/admin/taxonomy/subjects` | GET | `taxonomy:read` |  |  |
| `/api/admin/taxonomy/subjects` | POST | `taxonomy:write` |  |  |
| `/api/admin/taxonomy/subjects/:id` | DELETE | `taxonomy:write` |  |  |
| `/api/admin/taxonomy/subjects/:id` | PATCH | `taxonomy:write` |  |  |
| `/api/admin/taxonomy/systems` | GET | `taxonomy:read` |  |  |
| `/api/admin/taxonomy/systems/:id` | PATCH | `taxonomy:write` |  |  |
| `/api/admin/taxonomy/tracks` | GET | `taxonomy:read` |  |  |
| `/api/admin/taxonomy/tracks` | POST | `taxonomy:write` |  |  |
| `/api/admin/taxonomy/tracks/:id` | PATCH | `taxonomy:write` |  |  |
| `/api/admin/terms/:id` | PATCH | `section:write` |  |  |
| `/api/admin/terms/:id/open` | PATCH | `section:write` |  |  |
| `/api/admin/transfers` | GET | `payment:read` |  |  |
| `/api/admin/transfers/:id/dismiss` | POST | `payment:review` |  |  |
| `/api/admin/transfers/ingest` | POST | `payment:review` |  |  |
| `/api/assistant/ask` | POST | **public** | yes |  |
| `/api/assistant/conversations` | POST | **public** | yes |  |
| `/api/assistant/conversations/:id/messages` | POST | **public** | yes |  |
| `/api/assistant/conversations/:id/messages/:messageId/attachment` | GET | **public** |  |  |
| `/api/assistant/conversations/:id/read` | POST | **public** | yes | 204 |
| `/api/assistant/conversations/mine` | GET | **public** |  |  |
| `/api/assistant/conversations/mine/summary` | GET | **public** |  |  |
| `/api/book-orders` | POST | **public** | yes |  |
| `/api/book-orders/:id` | GET | **public** |  |  |
| `/api/book-orders/:id/payment` | POST | **public** | yes |  |
| `/api/book-orders/mine` | GET | `book-order:submit` |  |  |
| `/api/book-orders/screenshot` | POST | **public** | yes |  |
| `/api/books` | GET | **public** |  |  |
| `/api/catalog/courses` | GET | **public** |  |  |
| `/api/catalog/courses/:slug` | GET | **public** |  |  |
| `/api/courses/:courseId/enroll` | POST | `enrollment:create` |  |  |
| `/api/courses/:slug/outline` | GET | `course:read` |  |  |
| `/api/enrollments` | GET | `enrollment:read` |  |  |
| `/api/errors` | POST | **public** |  | 204 |
| `/api/flags` | GET | **public** |  |  |
| `/api/health` | GET | **public** |  |  |
| `/api/home-blocks` | GET | **public** |  |  |
| `/api/homework/images/:imageId` | GET | `homework:submit` |  |  |
| `/api/homework/lessons/:lessonId` | GET | `homework:submit` |  |  |
| `/api/homework/lessons/:lessonId/images` | POST | `homework:submit` |  |  |
| `/api/homework/lessons/:lessonId/submissions` | POST | `homework:submit` |  |  |
| `/api/ingest/transfers` | POST | **public** |  |  |
| `/api/lessons/:lessonId/complete` | POST | `progress:write` |  |  |
| `/api/lessons/:lessonId/dwell` | POST | `progress:write` |  |  |
| `/api/lessons/:lessonId/heartbeat` | POST | `progress:write` |  |  |
| `/api/lessons/:lessonId/open` | POST | `progress:write` |  |  |
| `/api/lessons/:lessonId/player` | GET | `course:read` |  |  |
| `/api/lessons/:lessonId/resources/:resourceId/download` | GET | `course:read` |  |  |
| `/api/lessons/:lessonId/resources/:resourceId/view` | GET | `course:read` |  |  |
| `/api/marketing/wa/inbound` | POST | **public** |  |  |
| `/api/me/activity` | GET | `progress:read` |  |  |
| `/api/me/dashboard` | GET | `enrollment:read` |  |  |
| `/api/me/mastery` | GET | `quiz:read` |  |  |
| `/api/me/notifications` | GET | `profile:read` |  |  |
| `/api/me/notifications/:id/read` | POST | `profile:write` |  | 204 |
| `/api/me/notifications/read-all` | POST | `profile:write` |  | 204 |
| `/api/me/notifications/stream` | GET | `profile:read` |  |  |
| `/api/me/notifications/unread-count` | GET | `profile:read` |  |  |
| `/api/me/path` | GET | `enrollment:read` |  |  |
| `/api/me/push/public-key` | GET | `profile:read` |  |  |
| `/api/me/push/subscribe` | POST | `profile:write` |  | 204 |
| `/api/me/push/unsubscribe` | POST | `profile:write` |  | 204 |
| `/api/me/quizzes` | GET | `quiz:read` |  |  |
| `/api/media` | POST | `media:write` |  |  |
| `/api/media/documents` | POST | `media:write` |  |  |
| `/api/navigation` | GET | **public** |  |  |
| `/api/news` | GET | **public** |  |  |
| `/api/news/:slug` | GET | **public** |  |  |
| `/api/payments/screenshot` | POST | `payment:submit` |  |  |
| `/api/payments/submissions` | POST | `payment:submit` |  |  |
| `/api/payments/submissions/me` | GET | `payment:submit` |  |  |
| `/api/profile/avatar` | POST | `profile:write` |  |  |
| `/api/profile/me` | GET | `profile:read` |  |  |
| `/api/profile/onboarding` | PATCH | `profile:write` |  |  |
| `/api/profile/section` | PATCH | `profile:write` |  |  |
| `/api/profile/whatsapp-opened` | POST | `profile:write` |  | 204 |
| `/api/quiz/attempts/:attemptId/answers` | PUT | `quiz:attempt` |  |  |
| `/api/quiz/attempts/:attemptId/flag` | POST | `quiz:attempt` |  |  |
| `/api/quiz/attempts/:attemptId/preflight` | GET | `quiz:attempt` |  |  |
| `/api/quiz/attempts/:attemptId/resume` | POST | `quiz:attempt` |  |  |
| `/api/quiz/attempts/:attemptId/review` | GET | `quiz:attempt` |  |  |
| `/api/quiz/attempts/:attemptId/submit` | POST | `quiz:attempt` |  |  |
| `/api/quiz/lessons/:lessonId` | GET | `quiz:read` |  |  |
| `/api/quiz/quizzes/:quizId/attempts` | POST | `quiz:attempt` |  |  |
| `/api/security/csp-report` | POST | **public** |  | 204 |
| `/api/session` | GET | _session only_ |  |  |
| `/api/sessions` | GET | _session only_ |  |  |
| `/api/sessions/:id` | DELETE | _session only_ |  | 204 |
| `/api/settings/branding` | GET | **public** |  |  |
| `/api/settings/public` | GET | **public** |  |  |
| `/api/taxonomy` | GET | **public** |  |  |
| `/media/:prefix/:name` | GET | **public** |  |  |

---

## 16. What a Flutter client needs that this API does not have yet

Each item is a **backend or product change**, not a client workaround. Every one of them that adds
or changes a route must also add rows to `apps/api/src/test/authorization-matrix.int-spec.ts`
(§0.11) or CI fails.

1. **~~No token auth~~ — CLOSED 2026-09-08.** `bearer()` is registered in
   `apps/api/src/auth/auth.config.ts`; the app stores the `set-auth-token` header value and sends
   `Authorization: Bearer <token>`. What remains for the client: keep the token in the Keychain /
   Android Keystore (not `SharedPreferences`), send **no cookie at all** (a cookie activates
   Better Auth's origin check, which 403s a native request that has no `Origin`), and answer
   "am I signed in" with `GET /api/session` + `401` handling. There is still **no refresh
   endpoint** — the token lives for the session's 90 days and a revoked device is discovered
   only by a `401`.

2. **`CsrfGuard` demands an `x-csrf-token` header on every mutating request.**
   Today the value is unchecked, so Flutter can send a constant. But the header's presence is
   load-bearing and the web mints the value from a cookie the app has no equivalent of. If the
   guard is ever tightened into a real double-submit (its own comment says it may be), the mobile
   app breaks with a blanket `403`.
   *Change to request:* an explicit exemption path for token-authenticated (non-cookie) clients,
   or a `GET /api/csrf` that mints and returns the value.

3. **Structured error codes — HALF closed 2026-09-08.** `AllExceptionsFilter` now copies a
   string `code` onto the body, so `quiz_not_open_yet`, `attempt_stale`, `no_attempts_left`,
   `question_checked`, `unknown_slot`, `quiz_has_no_questions` etc. reach the client.
   Still missing: (a) the rest of the payload — `openFrom`, `openUntil` and friends are
   discarded, so the app cannot say *when* the paper opens; (b) **field-level validation detail** —
   `ZodValidationPipe` 400s arrive as `"Validation failed"` with the `errors` array gone, and
   `parseRequest` 400s lose their `issues`. A native form cannot highlight the offending field.
   *Change to request:* a whitelisted `details` object alongside `code`, and a `code` +
   `issues` passthrough for validation failures.

4. **No Arabic error copy on the wire for most failures.**
   Some messages are Arabic (`'في كتاب في السلة مش متاح دلوقتي — حدّث الصفحة'`,
   `'هذا الرقم لديه حساب بالفعل'`), most are English developer strings
   (`'this submission was already reviewed'`, `'heartbeats are only accepted for video lessons'`).
   The web app maps status codes to its own Arabic copy in `packages/contracts/src/copy/ar.ts`.
   *Change to request:* either ship the copy keys to the client (export a status/code → Arabic map
   from `@ayman/contracts`) or return the Arabic string from the API. Flutter must not
   re-invent the wording.

5. **Push is Web Push (VAPID) only.** `PushSubscribeSchema` takes a browser
   `PushSubscription` (`endpoint` + `p256dh`/`auth` keys). There is no FCM or APNs token
   anywhere in `apps/api`.
   *Change to request:* an `POST /api/me/push/device` accepting
   `{ platform: 'android'|'ios', token: string }`, an FCM/APNs sender alongside the existing
   `PushService`, and the same `NOTIFICATION_KINDS` payload mapping. Until then, the app can only
   receive notifications while the SSE stream is open.

6. **Realtime is SSE over an authenticated cookie.** `GET /api/me/notifications/stream` is
   `text/event-stream` with a 25 s `ping`. Flutter has no `EventSource`; it needs a manual
   streamed `HttpClient` request that reconnects on drop (the server suggests `retry: 5000`).
   Combined with (1) and (5), a backgrounded app receives nothing.

7. **Video is YouTube-first.** `PlayerVideo.youtubeId` plus an optional `mirror.hlsUrl`. The web
   uses the YouTube IFrame API, which is unavailable/awkward in Flutter, and the API script is
   blocked far more often than YouTube itself. The HLS mirror (`master.m3u8`) is the mobile-viable
   path, but `mirror` is nullable and there is no endpoint that reports mirror status per lesson.
   *Change to request:* expose the mirror status on `LessonPlayer` (`pending|mirroring|ready|
   failed|disabled`) so the client can choose a player, and guarantee a mirror for every published
   lecture before shipping offline/native playback.

8. **File streams are not range-capable.** `PlayerController.serveResource`,
   `HomeworkController.image`, the payment/book-order screenshots and the assistant attachments all
   `pipe()` the whole object with a fixed `Content-Length` and no `Accept-Ranges`. A mobile video
   or large PDF cannot be seeked or resumed.
   *Change to request:* HTTP range support on the authenticated stream routes.

9. **No offline/delta endpoints.** Every read returns a full document
   (`Dashboard`, `CourseOutline`, `LearningPath`, `BookCatalog`). There is no `updatedSince`
   parameter and no ETag/`If-None-Match` handling — and `PrivateCacheInterceptor` forces
   `no-store` on authenticated responses, so nothing is cacheable by the HTTP layer.
   *Change to request:* `?since=<ISO>` on the heavy reads, and an explicit
   `ETag` + `304` path for the outline/dashboard.

10. **Uploads are multipart-only and image-only for student paths.**
    `POST /api/homework/lessons/:lessonId/images`, `POST /api/payments/screenshot`,
    `POST /api/book-orders/screenshot`, `POST /api/profile/avatar` all take a single field `file`
    and re-encode to WebP. A phone camera JPEG at 8 MiB is fine, but there is **no resumable /
    chunked upload**, so a flaky connection loses the whole file.

11. **No password reset, no phone verification.** `sendOTP` throws
    `OTP_NOT_CONFIGURED` by design. On mobile, "forgot my password" is table stakes.
    *Change to request:* wire a WhatsApp Business API or SMS sender into
    `phoneNumber({ sendOTP })`, then enable `requireVerification` **only after** backfilling
    `phoneNumberVerified` — every existing row is `false`, so flipping it today locks out the
    entire student body.

12. **`Origin` handling.** `CsrfGuard` rejects any `Origin` that is not `env.APP_URL`, and Better
    Auth's `trustedOrigins` is `[APP_URL]`. Some HTTP stacks add an `Origin` automatically.
    The app must ensure it either omits `Origin` or sends exactly `APP_URL` on `/api/auth/*` too.

13. **~~Rate limits are session-cookie-keyed~~ — CLOSED 2026-09-08.**
    `trackerFromRequest` now also hashes an `Authorization: Bearer` token (case-insensitive), so a
    token-authenticated phone gets its own `sess:` bucket instead of sharing the carrier-NAT `ip:`
    one. The `ip` ceiling (1200/min on `cf-connecting-ip`) still applies on top, and behind carrier
    NAT that ceiling **is** shared — keep client retry/backoff conservative.

14. **Nothing returns a stable pagination cursor for admin lists.** Offset paging over
    `ORDER BY <timestamp> DESC` duplicates and drops rows when timestamps tie. The repo already
    knows this (`id` is `uuid(7)` so it can act as a chronological tiebreak) but the admin list
    services use `skip`/`take`. Mobile infinite-scroll will show duplicates.

15. **No health/version endpoint the app can use for forced upgrade.** `GET /api/health` returns
    `startedAt` (a restart marker), not an API version. A mobile client needs a minimum-supported
    version signal.

16. **Media URLs are keys, not URLs.** Every `coverKey`, `image`, `posterKey`, `storageKey` must be
    joined with `MEDIA_BASE_URL` / `NEXT_PUBLIC_MEDIA_ORIGIN` by the client, **except** `User.image`
    for Google accounts, which is already a full `https://lh3.googleusercontent.com/…` URL. The
    rule is: starts with `http` → use as-is; otherwise treat as a key.

### Known operational risks a mobile client will hit

- **Deploy window**: for a few minutes after a deploy, `next build` has baked an empty settings
  cache and some list responses come back empty. Do not treat an empty `enrolledCourses` as
  "no enrollments" without a retry.
- **API writes skip Next revalidation**: writing straight to Nest leaves the public catalog stale
  for hours. A mobile-only write path will need its own revalidation hook.
- **Bulk admin GETs 429 after ~60 calls** in a minute (the `medium` throttler). Any admin screen
  that fans out per-row requests must batch.
- **`GET /api/catalog/courses` does not filter by year** — do not present it as if it does.
- **`courses.book_title` holds CTA copy in production**, not a book title.

---

## 17. Appendix — enum values in one place

```
role                    admin | student
CourseStatus            draft | published | archived
CourseEmphasis          required | recommended | optional
LessonKind              video | quiz | attachment | text
CompletionMode          none | manual | on_view | on_grade | on_pass
LessonResourceKind      presentation | video | document | link
LessonProgressState     not_started | in_progress | completed | passed | failed
CompletionSource        auto | manual | dwell
GateState               cleared | available | locked
EnrollmentStatus        active | suspended | expired | revoked | completed
CourseAccess.reason     no_grant | not_yet_valid | expired | revoked |
                        course_not_published | needs_course_grant | needs_term_grant
Region                  urban | lower | upper | frontier
Gender                  male | female
SchoolStream            general | languages
OnboardingSystem        bacalorya | thanaweya_amma
CatalogStreamFilter     general | languages
QuestionType            mcq_single | mcq_multi | true_false | short_answer | ordering | essay
QuizPaper               original | improvement
AttemptState            in_progress | overdue | submitted | pending_review | abandoned
BlockedReason.code      quiz_not_open_yet | quiz_closed | no_attempts_left
Correctness             correct | partial | incorrect | needsGrading | unanswered
ReviewWindow            during | immediatelyAfter | laterWhileOpen | afterClose
ReviewFlag              response | correctness | marks | specificFeedback |
                        generalFeedback | rightAnswer | overallFeedback
OverdueHandling         autosubmit | graceperiod | autoabandon
NavMethod               free | sequential
PaymentPlan             monthly | quarterly | term | yearly
PaymentSubmissionStatus pending | approved | rejected
AdminPaymentSort        oldest | newest | amount_desc | amount_asc
FinanceStatus           active | expiring_soon | expired
FinancePlanFilter       monthly | quarterly | yearly | term | free
FinanceSort             paid_desc | paid_asc
AccessGrant scope       course | term   (plus a platform-wide grant, see EntitlementService)
IncomingTransferSource  notification | sms | manual
AdminTransferFilter     unmatched | matched | dismissed | all
BookTerm                first | second | full
BookOrderStatus         address_only | paid | shipped | delivered | rejected
AdminBookOrderFilter    <BookOrderStatus> | deleted
AdminBookOrderSort      oldest | newest | amount_desc | amount_asc | name_asc | governorate
BulkBookOrderOutcome    shipped | delivered | notice_failed | skipped
ExpenseCategory         filming | printing | equipment | marketing | staff | services | other
HomeworkStatus          submitted | accepted | needs_work
HomeworkFilter          pending | accepted | needs_work | all
ConversationStatus      open | answered | closed
ConversationOrigin      visitor | outreach
MessageAuthor           visitor | admin
MessageAttachment.kind  image | document | voice
MessageReaction         👍 ❤️ 😂 🔥 😮 🙏
InboxFilter             unread | open | answered | closed | all
InboxSort               newest | oldest
AskEvent.t              delta | done | error
AskErrorCode            failed | tooMany | unavailable
NotificationKind        quiz_graded | extra_attempt_granted | conversation_reply |
                        instructor_message | payment_approved | payment_rejected |
                        subscription_expiring_soon | subscription_cancelled |
                        payment_submitted | book_order_placed |
                        assistant_question_received | book_order_shipped |
                        book_order_delivered | book_order_rejected | course_completed |
                        homework_submitted | homework_reviewed
NotificationEvent.type  notification | ping
ErrorReportKind         server | client | timeout
ErrorReportFilter       open | resolved | all
AuditOutcome            success | failure | denied
NewsStatus              draft | published
MediaUsageKind          brandingLogoLight | brandingLogoDark | brandingFavicon |
                        seoOgImage | homeBlock
AccentSlot              amber | cyan | blue | violet | magenta | slate
RadiusSlot              sharp | default | soft
SettingsSection         branding | seo | contact | outreach | store
HomeBlockType           hero | whyRail | courseGrid | books | instructor | yearTracks |
                        about | stats | testimonials | faq | cta
CampaignStatus          draft | running | paused | done | cancelled
RecipientStatus         pending | sent | failed | skipped
WhatsappDeviceState     disabled | unreachable | disconnected | linking | connected
VideoProvider           youtube | upload | vimeo | bunny | vdocipher | ink | gumlet
VideoEmbedStatus        ok | blocked | unavailable | unknown
VideoMirrorStatus       pending | mirroring | ready | failed | disabled
StudentHistoryKind      account_created | grant_created | grant_revoked | payment_submitted |
                        payment_approved | payment_rejected | book_order_placed |
                        book_order_paid | book_order_shipped | book_order_delivered |
                        book_order_rejected | banned | unbanned
StudentBulkDeleteFail   self | last-admin | authored-content | not-found
StudentAccessFilter     hand_opened | comped | paid
PublishSkipReason       noVideo | noText | noResources | quizNotPublished
GradeBand               a | b | c | d | f      (a>=.85, b>=.75, c>=.65, d>=.5)
EngagementSegment       both | videoOnly | quizOnly | neither
```

### Key numeric constants

```
PAGE_SIZES                       10, 20, 50, 100
activity/notification feed       default limit 20, max 50
quiz admin take                  default 50, max 200
MAX_UPLOAD_BYTES                 8 * 1024 * 1024
MAX_AVATAR_BYTES                 2 * 1024 * 1024      AVATAR_SIZE_PX 512
MAX_DOCUMENT_BYTES               95 * 1024 * 1024      (= MAX_RESOURCE_BYTES)
MAX_VOICE_BYTES                  20 * 1024 * 1024      MAX_VOICE_SECONDS 600
MAX_INPUT_PIXELS                 50_000_000
MAX_RICH_TEXT_CHARS              65_536
HEARTBEAT_INTERVAL_MS            10_000
MAX_HEARTBEAT_DELTA_SECONDS      15    HEARTBEAT_CLOCK_GRACE_SECONDS 2
DWELL_COMPLETE_MS                5_000
VIEW_SESSION_GAP_SECONDS         1_800
VIDEO_POSITION_THRESHOLD 0.95    VIDEO_WATCHED_THRESHOLD 0.70
MESSAGE_MAX 2000 / min 2         SUMMARY_PREVIEW_MAX 240
TRANSCRIPT_TURNS_MAX 12          TRANSCRIPT_TURN_MAX 300   TRANSCRIPT_TURN_WIRE_MAX 1000
ASK_QUESTION_MAX 500             ASK_HISTORY_MAX 8   ASK_ACTIONS_MAX 3   ASK_ACTION_LABEL_MAX 40
MAX_HOMEWORK_IMAGES 8            DEFAULT_HOMEWORK_IMAGES 4
HOMEWORK_IMAGE_RETENTION_DAYS    30
BOOK_SHIPPING_CENTS 6500         MAX_BOOK_QUANTITY 20   MAX_CART_LINES 20
MASTERY_MIN_EVIDENCE 4           MASTERY_REVIEW_BELOW 70   MASTERY_STRONG_AT 90
session expiresIn                90 days, updateAge 1 day
guest assistant cookie           90 days
login: 3 free attempts, delay min(2^n, 30)s, lock at 10 for 15 minutes
notifications SSE heartbeat      25_000 ms, `retry: 5000`
```

### Files to re-read when any of this changes

```
apps/api/src/main.ts                                   global prefix, media exclusion, trust proxy
apps/api/src/app.module.ts                             throttlers, global guard/filter/interceptor
apps/api/src/common/filters/all-exceptions.filter.ts   the one error shape
apps/api/src/common/http/parse-request.ts              query-string 400s
apps/api/src/common/http/private-cache.interceptor.ts  cache headers
apps/api/src/common/throttle/request-identity.ts       throttle keys, SKIP_ALL_THROTTLERS
apps/api/src/auth/auth.config.ts                       Better Auth wiring, cookies, plugins
apps/api/src/auth/guards/auth.guard.ts                 deny-by-default
apps/api/src/auth/permissions.ts                       the permission catalogue and role map
apps/api/src/modules/security/csrf.guard.ts            the three CSRF checks
apps/api/src/test/authorization-matrix.int-spec.ts     the coverage gate
apps/api/src/test/route-inventory.ts                   how routes are enumerated
packages/contracts/src/**                              every request/response schema
packages/contracts/package.json                        the export subpaths (import from these,
                                                       never the root barrel, at runtime)
```

> Runtime import rule inherited from the repo: **import runtime values from the contracts
> subpath**, never `@ayman/contracts` (the root barrel re-exports through extensionless relative
> specifiers that plain Node ESM cannot resolve — every test passes and then the server will not
> boot).
