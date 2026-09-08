# Auth & Session — mobile spec

Everything a Flutter engineer needs to reproduce authentication, session handling,
device management and onboarding, without reading the web app.

Every claim below cites the file it came from (repo-relative). Version pins that
matter: `better-auth@1.6.25`, `@thallesp/nestjs-better-auth@2.7.0`
(`apps/api/package.json:30,32`).

---

## 0. Architecture — how a request actually reaches auth

```
Browser ──► apps/web (Next 16, :3200)  ──rewrite /api/:path* ──►  apps/api (Nest, :3300)
Mobile  ──────────────────────────────────────────────────────►  apps/api directly
```

* `apps/web/next.config.ts:277-279` — `{ source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` }`.
  This is why the browser only ever sees one origin. **A mobile app has no such rewrite
  and must call the API host directly.**
* In production `docker-compose.yml:99-100` sets `BETTER_AUTH_URL: ${APP_URL}` — i.e.
  better-auth believes its own base URL is `https://aymanaboelela.com`, and the Next
  rewrite makes that true from the browser's point of view. In local dev
  (`apps/api/.env.example:8,18`) `APP_URL=http://localhost:3200` and
  `BETTER_AUTH_URL=http://localhost:3300`.
* **Two different HTTP layers live under `/api`:**

  | Path prefix | Handled by | Nest guards apply? |
  |---|---|---|
  | `/api/auth/**` | better-auth, mounted as **raw Express middleware** | **NO** |
  | everything else under `/api/**` | Nest controllers | **YES** |

  Proof: `@thallesp/nestjs-better-auth@2.7.0` `dist/index.mjs:879-903` does
  `this.adapter.httpAdapter.use((req,res,next) => authHandler(...))`, i.e. it installs
  the handler on the Express app **before** Nest's router. Its constructor
  (`dist/index.mjs:789-799`) also excludes `basePath` and `basePath/*path` from Nest's
  global prefix. `apps/api/src/auth/auth.module.ts:16-31` mounts it with
  `basePath` from `auth.config.ts` = `/api/auth`.

  **Consequence for mobile:** `x-csrf-token` is NOT required on `/api/auth/**`,
  and the Nest `ThrottlerGuard` rate limits do NOT apply there either. They ARE
  required/applied on every other `/api/**` route.
* `apps/api/src/main.ts:18` — `bodyParser: false` at bootstrap; the better-auth Nest
  module installs JSON/urlencoded parsers for every non-`/api/auth` route
  (`nestjs-better-auth` `SkipBodyParsingMiddleware`, `dist/index.mjs:663-698`).
* `apps/api/src/main.ts:32-38` — global prefix `api` (media excluded),
  `app.set('trust proxy', 1)`.
* CORS: the Nest better-auth module calls
  `httpAdapter.enableCors({ origin: trustedOrigins, methods: ['GET','POST','PUT','DELETE'], credentials: true })`
  (`dist/index.mjs:845-853`), and `trustedOrigins` is `[env.APP_URL]`
  (`apps/api/src/auth/auth.config.ts:163`). So the only browser origin allowed is the
  web app. **Irrelevant to a native client** — CORS is a browser control.

---

## 1. Endpoint catalogue

### 1.1 better-auth endpoints (`/api/auth/**`, no Nest guards)

Base path is `/api/auth` (`apps/api/src/auth/auth.config.ts:161`).
Core routes exist regardless of whether the app uses them
(enumerated from `better-auth/dist/api/routes/*.mjs`):

| Method | Path | Used by web? | Notes |
|---|---|---|---|
| POST | `/api/auth/sign-up/email` | ✅ registration | the ONLY account-creating route on this platform |
| POST | `/api/auth/sign-in/email` | ✅ | hardened by this repo's before-hook |
| POST | `/api/auth/sign-in/phone-number` | ✅ | phone-number plugin |
| POST | `/api/auth/sign-in/social` | ✅ (google only) | supports `idToken` branch — see §5 |
| POST | `/api/auth/sign-out` | ✅ | clears the session cookie |
| GET \| POST | `/api/auth/get-session` | ❌ (web uses `/api/session`) | `requireHeaders: true` |
| GET | `/api/auth/callback/:id` | ✅ (browser redirect target) | OAuth callback, e.g. `/api/auth/callback/google` |
| GET | `/api/auth/error` | — | better-auth's own bare English error page |
| GET | `/api/auth/ok` | — | liveness |
| POST | `/api/auth/change-password` | ❌ | exists, unused by the web UI |
| POST | `/api/auth/change-email` | ❌ | exists, unused |
| POST | `/api/auth/update-user` | ❌ | `role` is `input:false`, cannot be set here |
| GET | `/api/auth/list-sessions` | ❌ | the product uses `/api/sessions` instead |
| POST | `/api/auth/revoke-session` / `/revoke-sessions` / `/revoke-other-sessions` | ❌ | ditto |
| GET | `/api/auth/list-accounts`, `/account-info` | ❌ | |
| POST | `/api/auth/link-social`, `/unlink-account` | ❌ | |
| POST | `/api/auth/delete-user` (+ `/delete-user/callback`) | ❌ | |
| POST | `/api/auth/request-password-reset`, `/reset-password`, `/reset-password/:token` | ❌ **DEAD** | needs email delivery; there is none (§2.6) |
| POST | `/api/auth/send-verification-email`, `/verify-email` | ❌ **DEAD** | same reason |
| POST | `/api/auth/verify-password` | ❌ | |
| POST | `/api/auth/refresh-token`, `/get-access-token` | ❌ | OAuth provider token refresh, not session refresh |

Phone-number plugin routes (`better-auth/dist/plugins/phone-number/routes.mjs`),
registered by `apps/api/src/auth/auth.config.ts:352-390`:

| Method | Path | State |
|---|---|---|
| POST | `/api/auth/sign-in/phone-number` | ✅ live |
| POST | `/api/auth/phone-number/send-otp` | 🔴 always throws (see §2.6) |
| POST | `/api/auth/phone-number/verify` | 🔴 unreachable (no OTP can exist) |
| POST | `/api/auth/phone-number/request-password-reset` | 🔴 unreachable |
| POST | `/api/auth/phone-number/reset-password` | 🔴 unreachable |

There is **no** `/sign-up/phone-number`. The plugin does not define one
(`apps/api/src/auth/auth.config.ts:333-345`).

### 1.2 Custom Nest endpoints (guards DO apply)

| Method | Path | Auth | Permission | Source |
|---|---|---|---|---|
| GET | `/api/session` | session required | none (authenticated only) | `apps/api/src/auth/session.controller.ts:51-64` |
| GET | `/api/sessions` | session required | none (self-scoped) | `apps/api/src/modules/sessions/sessions.controller.ts:21-27` |
| DELETE | `/api/sessions/:id` | session required | none (self-scoped) | `apps/api/src/modules/sessions/sessions.controller.ts:34-41` → `204` |
| GET | `/api/profile/me` | session required | `profile:read` | `apps/api/src/modules/profile/profile.controller.ts:27-31` |
| PATCH | `/api/profile/onboarding` | session required | `profile:write` | `apps/api/src/modules/profile/profile.controller.ts:40-48` |
| PATCH | `/api/profile/section` | session required | `profile:write` | `apps/api/src/modules/profile/profile.controller.ts:59-67` |
| POST | `/api/profile/avatar` (multipart `file`) | session required | `profile:write` | `apps/api/src/modules/profile/profile.controller.ts:83-97` |
| POST | `/api/profile/whatsapp-opened` | session required | `profile:write` | `apps/api/src/modules/profile/profile.controller.ts:124-129` → `204` |
| GET | `/api/taxonomy` | public | — | needed by onboarding (§8) |

Authorization-matrix rows pinning the status codes
(`apps/api/src/test/authorization-matrix.int-spec.ts:559-594`):

```
GET  /api/session      anonymous → 401 | student → 200
GET  /api/sessions     anonymous → 401 | student → 200
DEL  /api/sessions/:id anonymous → 401 | non-owner → 404 | owner → 204
```

---

## 2. Cookies, headers, CSRF

### 2.1 Session cookie

`apps/api/src/auth/auth.config.ts:404-448`:

| Property | Production | Development |
|---|---|---|
| name | `__Host-session_token` | `session_token` |
| `httpOnly` | true | true |
| `secure` | true | false |
| `sameSite` | `lax` | `lax` |
| `path` | `/` | `/` |
| `domain` | never set (required by `__Host-`) | — |
| Max-Age | 90 days (from `session.expiresIn`) | same |

`advanced.useSecureCookies: false` disables better-auth's automatic `__Secure-`
prefix; `advanced.defaultCookieAttributes.secure = isProduction` restores `Secure`
on every OTHER auth cookie (including the OAuth `state` cookie).

`sameSite` is deliberately `lax`, not `strict` — `strict` breaks the Google callback
redirect chain (`auth.config.ts:412-434`).

### 2.2 Session lifetime

`apps/api/src/auth/auth.config.ts:196-199`:

```
session.expiresIn = 60*60*24*90   // 90 days
session.updateAge = 60*60*24      // rolling refresh, at most 1 write/day/session
```

`session.cookieCache` is **deliberately absent** (`auth.config.ts:181-195`) so that
`DELETE /api/sessions/:id` and a ban take effect on the very next request.

### 2.3 CSRF cookie (web only)

`apps/web/proxy.ts:919-947` mints `__Host-csrf` (`httpOnly:false`, `secure:true`,
`sameSite:'strict'`, `path:'/'`, value = `randomUUID()`), and the browser echoes it
in the `x-csrf-token` header (`apps/web/lib/csrf.ts:16-29`).

### 2.4 `CsrfGuard` — what it actually checks

`apps/api/src/modules/security/csrf.guard.ts:69-107`, registered as a second
`APP_GUARD` in `apps/api/src/modules/security/security.module.ts:68`:

* Skipped for `GET`/`HEAD`/`OPTIONS` and for `@Public()` routes not marked
  `@RequireCsrf()`.
* Rejects with `403 Forbidden` if:
  1. `Origin` header is present and `!== APP_URL` → `"CSRF: origin mismatch"`
  2. `Sec-Fetch-Site` is present and not in `{'same-origin','none'}` → `"CSRF: cross-site request"`
  3. `x-csrf-token` header is absent or empty → `"CSRF: missing x-csrf-token header"`
* The header VALUE is never compared to the cookie. **Presence is the control.**

**Mobile rule:** on every `POST/PUT/PATCH/DELETE` to a non-`/api/auth` route,
send `x-csrf-token: <any non-empty string>` and send **no** `Origin` header
(or send exactly `APP_URL`). Do not send a `Sec-Fetch-Site` header. This works today
with zero backend change.

### 2.5 better-auth's own origin / form-CSRF checks (`/api/auth/**`)

`better-auth/dist/api/middlewares/origin-check.mjs`:

* `validateOrigin` (line 96-118): `if (!(forceValidate || useCookies)) return;` where
  `useCookies = headers.has('cookie')`. **A request with no `Cookie` header skips the
  origin check entirely.**
* `formCsrfMiddleware` (line 119-150), applied to `/sign-up/email` and `/sign-in/email`:
  * has `Cookie` → run `validateOrigin` (must match `trustedOrigins = [APP_URL]`)
  * else, if any `Sec-Fetch-*` header present → block `site==='cross-site' && mode==='navigate'`
    (`CROSS_SITE_NAVIGATION_LOGIN_BLOCKED`), otherwise force origin validation
  * else, if `Origin` or `Referer` present → force origin validation
  * else → **pass**

**Mobile rule:** a native HTTP client that sends no `Cookie`, no `Origin`, no `Referer`
and no `Sec-Fetch-*` headers passes all of these. Once you start sending a session
cookie back (cookie-jar style), you MUST also send `Origin: <APP_URL>` or you get
`403 INVALID_ORIGIN` / `MISSING_OR_NULL_ORIGIN`.

### 2.6 Nest rate limits (non-`/api/auth` routes only)

`apps/api/src/app.module.ts:86-115`, keys from
`apps/api/src/common/throttle/request-identity.ts`:

| Name | Window | Limit | Key |
|---|---|---|---|
| short | 1 s | 10 | hashed session cookie (fallback IP) |
| medium | 60 s | 60 | hashed session cookie (fallback IP) |
| long | 3600 s | 1000 | hashed session cookie (fallback IP) |
| ip | 60 s | 1200 | `cf-connecting-ip` → `req.ip` |

Client IP resolution prefers `cf-connecting-ip`
(`request-identity.ts:54-60`). Exceeding a limit returns **429**.

---

## 3. Phone normalisation — the single most important rule

Egyptian phones are the account identity. Everything is stored in **E.164**
(`+201012345678`).

### 3.1 `toAsciiDigits` — Arabic/Persian digit folding

`packages/contracts/src/phone.ts:72-78`:

```ts
export function toAsciiDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}
```

Covers Arabic-Indic `U+0660–0669` and Extended Arabic-Indic `U+06F0–06F9`.
Applied **per keystroke** on every phone input so the field shows what will be saved
(`apps/web/components/auth/phone-field.tsx:54-58`). Everything else (`+`, spaces,
leading zero) passes through untouched. Because it is a one-codepoint-for-one-codepoint
replacement, the caret position stays valid.

### 3.2 `normalizeEgyptianPhone` — the one parser

`packages/contracts/src/phone.ts:105-115`:

```ts
export function normalizeEgyptianPhone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = parsePhoneNumberWithError(trimmed, "EG", EG_METADATA);
    if (!parsed.isValid() || parsed.country !== "EG") return null;
    return parsed.number;   // E.164
  } catch {
    return null;
  }
}
```

* Library: `libphonenumber-js/core` with a 366-byte EG-only metadata blob
  (`packages/contracts/src/eg-metadata.ts`).
* Accepts `01012345678`, `+201012345678`, `٠١٠١٢٣٤٥٦٧٨`.
* Rejects anything that is not a valid EG number, returning `null` — never throws.
* Flutter equivalent: use `libphonenumber`/`phone_numbers_parser` with region `EG`
  and require `isValid() && country == 'EG'`; emit the E.164 string.

### 3.3 The zod wrapper

`packages/contracts/src/phone.ts:125-138` — `egyptianPhone(requiredMessage)`:
`trim().min(1, requiredMessage)` then transform; on `null` adds a custom issue with
the message **`رقم الهاتف يجب أن يكون رقمًا مصريًا صحيحًا`**
(the constant `INVALID`, `phone.ts:41`).

### 3.4 Placeholder emails

`packages/contracts/src/phone.ts:145-188`:

* `PLACEHOLDER_EMAIL_DOMAIN = "phone.invalid"`
* `placeholderEmailForPhone('+201012345678') === '201012345678@phone.invalid'`
  (normalise, then strip the leading `+`).
* `isPlaceholderEmail(email)` — case-insensitive `endsWith('@phone.invalid')`.

**These never reach the mobile client.** The value exists only inside a single
sign-up request: `createAuthBeforeHook` mints it to satisfy better-auth's
`z.email()` route validator, and `databaseHooks.user.create.before` strips it back to
`null` before the row is written (`apps/api/src/auth/auth.config.ts:456-497`).
`users.email` is genuinely nullable (`apps/api/prisma/schema.prisma`, `User.email`).

### 3.5 Server-side normalisation hook

`apps/api/src/auth/phone-identity.ts` (pure, fully unit-tested) +
`apps/api/src/auth/login-security.hook.ts:186-345` (the better-auth adapter).

`planPhoneNormalization(path, body)` returns one of:

| Path | `phoneNumber` missing | unparseable | parseable |
|---|---|---|---|
| `/sign-up/email` | **reject** `رقم الموبايل مطلوب` | **reject** `رقم الهاتف يجب أن يكون رقمًا مصريًا صحيحًا` | rewrite to E.164 (+ mint `email` if body's email is blank) |
| `/sign-in/phone-number`, `/phone-number/send-otp`, `/phone-number/verify`, `/phone-number/request-password-reset`, `/phone-number/reset-password` | ignore | ignore (silently falls through to a generic 401) | rewrite to E.164 |
| anything else | ignore | ignore | ignore |

Rejections are thrown as `APIError('BAD_REQUEST', { code: 'INVALID_PHONE_NUMBER', message })`
(`login-security.hook.ts:201-206`) → **HTTP 400**.

The asymmetry is deliberate (S1): sign-up may say "that number is malformed";
sign-in must never produce a branch that "wrong password" cannot
(`phone-identity.ts:99-114`).

---

## 4. Registration

### 4.1 Client contract

`packages/contracts/src/auth.ts:132-167` — `RegisterSchema` (`.strict()`):

| Field | Type | Rules | Error message (Arabic, verbatim) |
|---|---|---|---|
| `name` | string | trim, min 2, max 120 | `الاسم الكامل مطلوب` / `الاسم طويل جدًا` |
| `phone` | string → E.164 | `egyptianPhone('رقم الموبايل مطلوب')` | `رقم الموبايل مطلوب` / `رقم الهاتف يجب أن يكون رقمًا مصريًا صحيحًا` |
| `email` | string, **optional** | blank/whitespace → `undefined`; otherwise `z.email()` | `أدخل بريدًا إلكترونيًا صحيحًا` |
| `password` | string | min 8, max 128 | `كلمة المرور لازم تكون 8 أحرف على الأقل` / `كلمة المرور طويلة جدًا` |
| `confirmPassword` | string | min 1, must equal `password` | `تأكيد كلمة المرور مطلوب` / `كلمتا المرور غير متطابقتين` (attached to `confirmPassword`) |

`MIN_PASSWORD_LENGTH = 8`, `MAX_PASSWORD_LENGTH = 128` — copied from better-auth's own
defaults (`auth.ts:22-28`).

### 4.2 The request

`apps/web/lib/auth-client.ts:130-143`. `confirmPassword` is dropped; `email` is
omitted entirely when blank.

```http
POST /api/auth/sign-up/email
Content-Type: application/json

{
  "name": "أحمد محمد",
  "phoneNumber": "+201012345678",
  "password": "…",
  "email": "a@b.com"          // OMIT when the student gave none
}
```

`phoneNumber` is an extra field better-auth's `parseUserInput` merges from the
phone-number plugin's schema; the plugin does not set `input:false`, so it is written
to `users.phone_number` (`apps/api/src/auth/auth.config.ts:333-345`).

better-auth's own body schema (`better-auth/dist/api/routes/sign-up.mjs:14-21`):
`{ name: string, email: z.email(), password: nonempty, image?: string, callbackURL?: string, rememberMe?: boolean } & Record<string,any>`.

### 4.3 Success response — 200

```jsonc
{
  "token": "<session token>",
  "user": {
    "id": "...",           // better-auth nanoid, NOT a uuid — see §6.5
    "email": null,         // or the address the student typed
    "name": "أحمد محمد",
    "emailVerified": false,
    "image": null,
    "createdAt": "...",
    "updatedAt": "...",
    "phoneNumber": "+201012345678",
    "phoneNumberVerified": false,
    "role": "student"
  }
}
```

`Set-Cookie` carries the session cookie (§2.1) — a session is created immediately on
sign-up (`apps/api/src/auth/auth.config.ts:501-507` notes this).

### 4.4 Error responses and exact UI copy

All copy from `packages/contracts/src/copy/ar.ts:564-641` (`copy.auth.errors.*`).

| HTTP | `code` | Cause | What the UI renders |
|---|---|---|---|
| 400 | `INVALID_PHONE_NUMBER` | phone missing / unparseable, server-side | generic register error |
| 422 | `PHONE_ALREADY_REGISTERED` | number already has an account | **`الرقم ده ليه حساب عندنا بالفعل.`** + a link labelled **`ادخل بالرقم ده`** pointing at `/login` (carrying `next`) |
| 422 | `FAILED_TO_CREATE_USER` | unique violation race, hashing failure, dead DB | generic |
| any other | — | network error, 500, rejected password | generic |

Generic register error: **`مقدرناش نعمل الحساب. البيانات محتاجة مراجعة، وبعدها نحاول تاني.`**

`PHONE_ALREADY_REGISTERED` is raised by
`apps/api/src/auth/login-security.hook.ts:252-259`:

```ts
throw new APIError('UNPROCESSABLE_ENTITY', {
  code: PHONE_TAKEN_ERROR,            // 'PHONE_ALREADY_REGISTERED'
  message: 'هذا الرقم لديه حساب بالفعل',
});
```

Note the API's own `message` is a *different* Arabic string from what the UI renders.
**The client must branch on `code`, never render `message`** — the same rule
`apps/web/lib/auth-client.ts:52-63` states.

Client handling: `apps/web/components/auth/register-form.tsx:51-80`.

### 4.5 After success

`apps/web/components/auth/register-form.tsx:81-92` — navigate to `/onboarding`
(carrying `next`). No server round-trip: a brand-new account has never onboarded.

### 4.6 Password hashing (server side, informational)

`apps/api/src/auth/argon2-options.ts:12-17` — Argon2id, `memoryCost: 19456` KiB,
`timeCost: 2`, `parallelism: 1`. Wired into
`emailAndPassword.password.{hash,verify}` (`auth.config.ts:167-173`).

### 4.7 There is NO account recovery

`apps/api/src/auth/auth.config.ts:373-389` — `sendOTP` always throws:

```ts
throw new APIError('NOT_IMPLEMENTED', {
  code: 'OTP_NOT_CONFIGURED',
  message: 'لسه مفيش طريقة نبعت بيها كود التأكيد — رسالة للدعم.',
});
```

No SMS provider, no WhatsApp Business API, no mail anywhere in the repo. So:
**no "forgot password" flow exists**, `requireVerification` is off (turning it on
would lock out every existing student, since every backfilled `phoneNumberVerified`
is `false`), and the only reset path is an admin calling
`PATCH /api/admin/students/:id/password` (`student:set-password`).

---

## 5. Login

### 5.1 One field, two endpoints

`packages/contracts/src/auth.ts:69-74` — `LoginSchema` (`.strict()`):

| Field | Rules | Error message |
|---|---|---|
| `identifier` | trim, min 1 — **no shape check at all** | `رقم موبايلك أو إيميلك` |
| `password` | min 1 — **no length check** (deliberate, S1) | `كلمة المرور مطلوبة` |

`resolveLoginIdentifier` (`packages/contracts/src/auth.ts:90-109`):

```ts
const trimmed = identifier.trim();
if (trimmed.includes('@')) return { kind: 'email', value: trimmed };   // '@' test FIRST
const phone = normalizeEgyptianPhone(trimmed);
if (phone) return { kind: 'phone', value: phone };
return { kind: 'email', value: trimmed };                              // unparseable → email endpoint
```

The `@` test runs first because `libphonenumber-js` reads
`201012345678@phone.invalid` as the valid number `+201012345678`.

Unparseable input goes to the **email** endpoint on purpose so a typo earns the same
generic 401 as any other wrong credential.

### 5.2 Requests

```http
POST /api/auth/sign-in/phone-number
{ "phoneNumber": "+201012345678", "password": "…" }      // rememberMe?: boolean

POST /api/auth/sign-in/email
{ "email": "a@b.com", "password": "…" }                  // callbackURL?, rememberMe?
```

Body schemas: `better-auth/dist/plugins/phone-number/routes.mjs:11-15`,
`better-auth/dist/api/routes/sign-in.mjs` (`signInEmail`).
Web wrappers: `apps/web/lib/auth-client.ts:145-166`.

### 5.3 Success — 200

`/sign-in/email` returns `{ redirect: boolean, token: string, url: string|undefined, user: User }`.
`/sign-in/phone-number` returns `{ token: string, user: User }`.
Both set the session cookie.

### 5.4 The hardened failure path

`apps/api/src/auth/login-security.hook.ts:261-335` intercepts BOTH sign-in paths
**before** better-auth's own handler, so no library-specific message ever reaches the
client.

`LoginSecurityService.evaluate` (`apps/api/src/auth/login-security.service.ts:49-85`):

1. Compute `throttleKey = "${kind}:${value}"`
   (`credential-check.service.ts:78-80` — `email:` and `phone:` are **separate buckets**).
2. If locked → run a dummy Argon2 verify against `DUMMY_PASSWORD_HASH`
   (`credential-check.service.ts:96-107`) and fail with `delayMs: 0`.
3. Otherwise look the credential up and run **exactly one** Argon2 verify — against the
   real hash if the account exists, against the dummy hash if it does not
   (`credential-check.service.ts:121-133`). Timing is identical either way.
4. Success → clear the throttle bucket. Failure → record it, get `delayMs`.

Every failure returns the identical body (`login-security.service.ts:18-22`):

```jsonc
// HTTP 401
{ "code": "INVALID_CREDENTIALS", "message": "Invalid email or password" }
```

The server sleeps `delayMs` before responding (`login-security.hook.ts:287-289`).

### 5.5 Throttle / lockout — exact numbers

`apps/api/src/auth/login-throttle.service.ts:64-128`:

| Constant | Value |
|---|---|
| `FREE_ATTEMPTS` | 3 (attempts 1–3 have zero artificial delay) |
| delay formula | `min(2 ** attemptCount, 30)` seconds, from attempt 4 |
| `MAX_DELAY_SECONDS` | 30 |
| `LOCK_THRESHOLD` | 10 (the 10th failed attempt trips the lock) |
| `LOCK_DURATION_MS` | `15 * 60 * 1000` = 15 minutes |

Resulting delays: attempt 4 → 16 s, attempt 5 → 30 s (capped), 6+ → 30 s.
At attempt 10 the account soft-locks for 15 minutes; while locked the response is the
same generic 401 with `delayMs: 0` (so a locked account is not *slower*, only refused).

* Key: **the normalised identifier only** (`normalizeThrottleKey` lowercases+trims),
  never `email+IP`. Attempts from different IPs accumulate into one counter; different
  accounts behind one school NAT never collide (`login-throttle.service.ts:1-27`).
* Auto-clearing: `isLocked` deletes an expired record as a side effect — no admin
  action, no sweeper.
* A successful login clears the bucket. An admin setting a password clears **both**
  buckets (`apps/api/src/modules/admin/students/students.service.ts:594-599`).
* Storage is an **in-memory `Map`, per API process**
  (`apps/api/src/auth/login-throttle.instance.ts`). With one API container that is the
  whole truth.

**What the user sees for every one of these:** the same string,
`copy.auth.errors.login` = **`البريد أو كلمة المرور مش مظبوطين`**
(`packages/contracts/src/copy/ar.ts:571`). Unknown account, wrong password,
soft-locked, network error — all identical. The submit button stays disabled while the
request is in flight, which is also what absorbs the up-to-30-second delay
(`apps/web/components/auth/login-form.tsx:161-169`). **Set no client-side HTTP timeout
shorter than ~40 s on login**, or the progressive delay reads as a network failure.

### 5.6 Ban (حظر) — the ONE distinguishable login failure

Checked **only after the password verifies** (`login-security.hook.ts:295-335`):

```jsonc
// HTTP 403
{ "code": "ACCOUNT_BANNED", "message": "This account has been suspended", "reason": "<admin's Arabic text or null>" }
```

UI (`apps/web/components/auth/login-form.tsx:70-83`) joins with spaces:

1. `حسابك موقوف دلوقتي، والدخول مقفول.`  (`copy.auth.errors.loginBanned`)
2. if `reason` present: `السبب: {reason}`  (`copy.auth.errors.loginBannedReason`,
   `{reason}` interpolated via `formatCopy`)
3. `ولو فيه غلط، كلمة للمدرّس وهيتظبط.`  (`copy.auth.errors.loginBannedContact`)

Enforcement is elsewhere and unconditional:
`databaseHooks.session.create.before` returns `false` for any user with `bannedAt`
(`apps/api/src/auth/auth.config.ts:498-540`), which better-auth turns into
`401 FAILED_TO_CREATE_SESSION`. This covers sign-up and Google too.
`StudentsService.ban` additionally deletes every `Session` **and** `SessionDevice` row
in one transaction (`students.service.ts:702-709`), so existing 90-day sessions die
immediately.

**A banned user's cached mobile session must be treated as revoked the moment any
authed request returns 401.**

### 5.7 Post-login routing (mirror this in Flutter)

`apps/web/lib/onboarding-redirect.ts:27-39`:

```
GET /api/profile/me
  → onboardingCompleted === false  ⇒ /onboarding (carrying next)
  → onboardingCompleted === true   ⇒ next ?? /dashboard
  → any failure                    ⇒ /onboarding (fail toward onboarding)
```

The web additionally enforces this on every request in `apps/web/proxy.ts:355-375`
(`decideRedirect`):

```
anonymous              → protected route          ⇒ login
anonymous              → /login, /register        ⇒ (stay)
authed, !onboarded     → any other protected      ⇒ /onboarding
authed, !onboarded     → /login, /register        ⇒ /onboarding
authed, onboarded      → /onboarding              ⇒ /dashboard
authed, onboarded      → /login, /register        ⇒ next ?? /dashboard
anything else                                     ⇒ (stay)
```

Protected prefixes (`apps/web/proxy.ts:82-136`): `/dashboard`, `/path`, `/onboarding`,
`/settings`, `/admin`, `/quizzes`, `/library`, `/profile`, `/results`, `/foundations`,
`/playground`, `/store`, `/notifications`, plus
`^/courses/[^/]+/lessons(/|$)` (`proxy.ts:151`).

---

## 6. Google & Apple social sign-in

### 6.1 Current server configuration

`apps/api/src/auth/auth.config.ts:277-325`. Providers are registered **conditionally**,
so a missing client id never crashes boot:

```ts
socialProviders: {
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
    : {}),
  ...(env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY
    ? { apple: async () => ({ clientId, clientSecret: await generateAppleClientSecret(...) }) }
    : {}),
}
```

Env vars (`apps/api/src/config/env.ts:96-101`, all `optionalSecret`; validated
all-or-nothing by `.refine()` at lines 328-349):

* `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — required together
* `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` — all four together

Apple's `client_secret` is a per-request ES256 JWT signed with `jose`
(`auth.config.ts:94-115`): header `{alg:'ES256', kid: APPLE_KEY_ID}`,
`iss = APPLE_TEAM_ID`, `sub = APPLE_CLIENT_ID`, `aud = 'https://appleid.apple.com'`,
`exp = now + 180 days`.

### 6.2 Redirect / callback URLs

Derived, not configurable: `<BETTER_AUTH_URL>/api/auth/callback/<provider>`
(`docs/runbooks/google-sign-in.md`):

| Environment | `BETTER_AUTH_URL` | Authorized redirect URI |
|---|---|---|
| local | `http://localhost:3300` | `http://localhost:3300/api/auth/callback/google` |
| production | `https://aymanaboelela.com` | `https://aymanaboelela.com/api/auth/callback/google` |

**Status as of the runbook: no Google OAuth client exists yet.** Until the two env
vars are set, better-auth does not register the provider and
`POST /api/auth/sign-in/social` returns `404 PROVIDER_NOT_FOUND`
(`better-auth/dist/api/routes/sign-in.mjs:137-141`).

Apple has **no button in the web UI** (`apps/web/lib/auth-client.ts:185-189`:
`export type SocialProvider = 'google'`), and the API wiring is inert.

### 6.3 Account linking

`apps/api/src/auth/auth.config.ts:249-253`:

```ts
account: { accountLinking: { enabled: true, trustedProviders: [] } }
```

`trustedProviders: []` means neither Google nor Apple is ever exempted from
better-auth's `!isTrustedProvider && !userInfo.emailVerified` gate. Accounts are keyed
on `(providerId, accountId)` — DB constraint `@@unique([providerId, accountId])` on
`Account` — never on email.

**Practical consequence:** an email that already has a *password* account cannot be
linked to Google, because this platform has no email-verification flow, so
`users.email_verified` is `false` on every password account. The provider returns
`?error=account_not_linked`.

### 6.4 The web browser flow (for reference)

1. `POST /api/auth/sign-in/social` with
   `{ provider: 'google', callbackURL: '/onboarding?next=…', errorCallbackURL: '/login?next=…' }`
   (`apps/web/lib/auth-client.ts:202-224`, `components/auth/auth-providers.tsx:82-90`).
2. Response `{ url?: string, redirect: boolean }` — the caller does
   `window.location.href = url`.
3. Google redirects back to `/api/auth/callback/google`; better-auth sets the session
   cookie and 302s to `callbackURL`.
4. On failure it 302s to `errorCallbackURL` with `?error=<code>` appended.

`errorCallbackURL` is **mandatory in practice**: without it better-auth falls back to
`${baseURL}/error` — its own bare English page on an API path
(`apps/web/lib/auth-client.ts:204-221`).

Error copy (`apps/web/app/(auth)/login/page.tsx:49-54`):

| `?error=` | Rendered string |
|---|---|
| `account_not_linked` | `الإيميل ده مسجّل عندنا بكلمة سر. الدخول بالإيميل وكلمة السر من فوق، مش بجوجل.` |
| anything else | `مقدرناش نكمّل الدخول بجوجل. نجرّب تاني، أو ندخل بالإيميل وكلمة السر.` |

Rendered above the form with `role="alert"` and `color/borderColor: var(--err)`.
The raw `?error=` value is never printed — it only *chooses* between two constants.

### 6.5 ⚠️ What must change for a NATIVE mobile client

Two independent problems: **no browser cookies**, and **no browser redirect**.

#### (a) Native ID-token sign-in — already supported by the library, NOT by this deployment's UX only

`better-auth/dist/api/routes/sign-in.mjs:44-88, 144-190` — `/sign-in/social` already
accepts an `idToken` branch:

```jsonc
POST /api/auth/sign-in/social
{
  "provider": "google",              // or "apple"
  "idToken": {
    "token": "<provider id_token>",  // REQUIRED
    "nonce": "<nonce used to mint it>",
    "accessToken": "…",              // optional
    "refreshToken": "…",             // optional
    "expiresAt": 1234567890,         // optional
    "user": { "name": { "firstName": "…", "lastName": "…" }, "email": "…" }  // Apple only
  }
}
```

Success response (line 183-188):

```jsonc
{ "redirect": false, "token": "<session token>", "url": null, "user": { … } }
```

Failure codes on that branch:

| HTTP | code | when |
|---|---|---|
| 404 | `PROVIDER_NOT_FOUND` | env vars not set |
| 404 | `ID_TOKEN_NOT_SUPPORTED` | provider has no `verifyIdToken` |
| 401 | `INVALID_TOKEN` | `verifyIdToken` failed |
| 401 | `FAILED_TO_GET_USER_INFO` | userinfo empty |
| 401 | `USER_EMAIL_NOT_FOUND` | provider returned no email |
| 401 | `OAUTH_LINK_ERROR` | linking refused (this is `account_not_linked`) |

**Backend changes required for this to work on mobile — exact list:**

1. **Set the env vars.** `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` do not exist yet
   (`docs/runbooks/google-sign-in.md`, "Status: NOT YET DONE"). Without them the route
   404s. For Apple, all four `APPLE_*`.
2. **Register the mobile OAuth client IDs.** Google issues a *different* client id per
   platform (iOS / Android). better-auth 1.6.25's Google provider verifies the
   `id_token`'s `aud` against the configured `clientId`. The Google provider in this
   version accepts an `audience`/`clientId` list — the deployment must either
   configure the mobile client ids alongside the web one, or the mobile app must
   request the id_token with the **web** client id as its `serverClientId`
   (the standard `google_sign_in` Flutter pattern: pass the Web client id as
   `serverClientId` so the returned `idToken.aud` matches). **The second option needs
   zero backend change and is the recommended path.**
3. **Apple:** the mobile bundle id differs from the Services ID used for web. Either
   register the bundle id as an additional audience or sign in with the Services ID.
4. **Nothing about CSRF/origin needs changing** — `/api/auth/**` bypasses `CsrfGuard`
   (§0), and `formCsrfMiddleware` is not applied to `/sign-in/social` at all
   (only `/sign-up/email` and `/sign-in/email` carry it).

#### (b) Carrying the session without cookies — the `bearer` plugin

The session token IS already returned in the JSON body of every sign-in/sign-up
response (`token`). What is missing is a way to **send it back**.

`better-auth/dist/plugins/bearer/index.mjs` (ships in the installed version, currently
NOT registered) does exactly two things:

* **before hook** — if `Authorization: Bearer <token>` is present, verify its HMAC
  signature against `BETTER_AUTH_SECRET` and inject it as the session cookie on the
  request headers.
* **after hook** — on any response that sets the session cookie, also emit
  `set-auth-token: <token>` and add it to `Access-Control-Expose-Headers`.

**Exact backend change:**

```ts
// apps/api/src/auth/auth.config.ts — plugins array (line ~352)
import { bearer } from 'better-auth/plugins/bearer';   // NARROW subpath, per this repo's rule
plugins: [
  bearer(),                 // ← add
  phoneNumber({ … }),
]
```

That alone makes `/api/auth/**` work from a native client. **It is not sufficient**,
because the rest of the API is guarded by Nest, not by better-auth:

* `apps/api/src/auth/guards/auth.guard.ts:89` calls
  `this.auth.api.getSession({ headers: toWebHeaders(request.headers) })`.
  `toWebHeaders` copies **all** incoming Node headers, including `authorization`
  (lines 41-52), and `auth.api.*` endpoints run plugin hooks
  (`better-auth/dist/api/dispatch.mjs:206-207`, `to-auth-endpoints.mjs`).
  **So `AuthGuard` will resolve a bearer session with no change** once the plugin is
  registered — this is the key finding.
* `apps/api/src/auth/optional-session.service.ts:55-67` does the same and therefore
  also works.
* `CsrfGuard` still demands `x-csrf-token` on state-changing non-auth routes
  (`csrf.guard.ts:101-104`). The mobile client can simply send a constant
  (e.g. `x-csrf-token: mobile`) — **or** the guard could be relaxed to skip requests
  that authenticate via `Authorization` and carry no `Cookie`. The former needs no
  backend change.
* Throttling keys on the session **cookie** hash (`request-identity.ts:87-105`).
  A bearer-only client has no cookie, so every mobile request falls back to the IP
  bucket, which is `1200/min` — shared across all users behind one carrier NAT.
  **Recommended change:** extend `trackerFromRequest` to hash the `Authorization`
  header when no session cookie is present.

Full mobile checklist in §11.

---

## 7. Roles & permissions

### 7.1 Roles

`apps/api/src/auth/permissions.ts:226` — `export type Role = 'admin' | 'student'`.

The `role` column is declared as a better-auth `additionalField`
(`apps/api/src/auth/auth.config.ts:211-219`):

```ts
role: { type: ['admin','student'], required: false, defaultValue: 'student', input: false }
```

`input: false` is load-bearing: a client POSTing `{ role: 'admin' }` to
`/sign-up/email` or `/update-user` is silently ignored by better-auth itself.

Role is changed only via the admin route guarded by `student:role-change`; an admin
cannot demote themselves and the last admin cannot be demoted
(`apps/api/src/modules/admin/students/students.service.ts`, `changeRole`).

### 7.2 The full permission catalogue

`apps/api/src/auth/permissions.ts:15-222`. Shape is strictly
`^[a-z][a-z-]*:[a-z][a-z-]*$`.

```
course:read              profile:read             profile:write
course:create            course:update            course:publish            course:delete
course:read-admin        section:write            section:reorder
lesson:write             lesson:reorder
enrollment:read          enrollment:create
progress:read            progress:write
question:read            question:write
quiz:read                quiz:write               quiz:attempt              quiz:grade
attempt:grade            analytics:read
admin:access
settings:read            settings:write
flags:read               flags:write
nav:read                 nav:write
home:read                home:write
media:read               media:write              media:delete
taxonomy:read            taxonomy:write
student:read             student:write            student:role-change
student:ban              student:delete           student:set-password
attempt:read             attempt:unlock
audit:read
conversation:read        conversation:reply       conversation:close
outreach:read
news:read                news:write               news:publish
diagnostics:read         diagnostics:resolve
marketing:read           marketing:write          marketing:send            marketing:device
payment:submit           payment:read             payment:review
book-order:submit        book-order:read          book-order:ship
book-order:create        book-order:write
book:read                book:write
expense:read             expense:write
homework:submit          homework:read            homework:review
```

### 7.3 Role → permission map

`apps/api/src/auth/permissions.ts:239-270`:

```ts
admin:   '*'            // every permission, including ones added later
student: new Set([
  'profile:read', 'profile:write', 'course:read',
  'enrollment:read', 'enrollment:create',
  'progress:read', 'progress:write',
  'quiz:read', 'quiz:attempt',
  'payment:submit', 'book-order:submit', 'homework:submit',
])
```

`course:read-admin` is deliberately **not** granted to `student` (it exists precisely
because `course:read` was over-granted on the admin course routes — see the comment at
`permissions.ts:25-33`).

### 7.4 How the decision is made

* Server: `AuthGuard` (`apps/api/src/auth/guards/auth.guard.ts:67-112`), registered as
  `APP_GUARD` in `apps/api/src/auth/auth.module.ts:35`. **Deny by default** — every
  route needs a session unless decorated `@Public()`. If the session lookup *throws*,
  it denies with 401 (fail closed, line 90-93). `@RequirePermission('x:y')` adds a
  `roleHasPermission(user.role, 'x:y')` check → `403` on failure.
* `roleHasPermission(role, permission)` (`permissions.ts:302-306`) — unknown/missing
  role holds nothing.
* `permissionsForRole(role)` (`permissions.ts:313-318`) materialises `'*'` into the
  concrete array for the client.

### 7.5 How the web decides to show admin UI

**Never `role === 'admin'`.** Always the permission list from `/api/session`:

* `apps/web/lib/session.ts:92-94`:
  `can(session, p) = session?.permissions.includes(p) ?? false`
* `apps/web/app/(admin)/layout.tsx:56-58`:
  `if (!session) redirect('/login'); if (!can(session,'admin:access')) notFound();`
  — **`notFound()`, not 403**, so a student learns nothing about `/admin` existing.
* `apps/web/components/app/account-menu.tsx:34`:
  `isAdmin={can(session, 'admin:access')}` — decides whether the
  «لوحة التحكم» link is drawn.
* Admin sidebar items are individually permission-gated
  (`apps/web/components/admin/nav-items.ts`, each entry has a `permission` field).
* Admin poller providers are gated per-permission so a role without
  `conversation:read` / `payment:read` / `book-order:read` / `homework:read` doesn't
  poll a 403 every 30 s (`apps/web/app/(admin)/layout.tsx:67-80`).

**None of this is a security boundary** — the API guard re-checks every request.
Mirror the same rule in Flutter: gate UI on `permissions.contains(...)`.

---

## 8. Session shape

### 8.1 `GET /api/session` — what the product actually uses

`apps/api/src/auth/session.controller.ts:5-64`. Requires a session (no `@Public()`),
no permission string. **401 when anonymous.**

```jsonc
{
  "id": "string",                  // User.id
  "email": "string | null",        // null when absent AND when it was a @phone.invalid placeholder
  "phoneNumber": "string | null",  // E.164, null for a Google account pre-onboarding
  "name": "string",
  "image": "string | null",        // null for password accounts and photo-less Google accounts
  "role": "string",                // 'admin' | 'student'
  "permissions": ["profile:read", "profile:write", …]   // concrete list, never '*'
}
```

Client schema mirroring this: `apps/web/lib/session.ts:6-33` (`email`, `phoneNumber`,
`image` are `.nullable()`, **not** `.optional()` — the API always sends the key).

Identity label rule (`apps/web/lib/session.ts:113-118`):
`accountIdentityLabel = email ?? phoneNumber ?? null`. Rendered `dir="ltr"` inside the
RTL page. `null` is a real state (an admin created by `create-admin.ts` has no phone).

### 8.2 `GET|POST /api/auth/get-session` — better-auth's own

`better-auth/dist/api/routes/session.mjs`. `requireHeaders: true`.
Returns `null` (HTTP 200, body `null`) when there is no session, otherwise:

```jsonc
{
  "session": {
    "id": "string",
    "token": "string",
    "userId": "string",
    "expiresAt": "ISO-8601",
    "createdAt": "ISO-8601",
    "updatedAt": "ISO-8601",
    "ipAddress": "string | null",
    "userAgent": "string | null"
  },
  "user": {
    "id": "string",
    "name": "string",
    "email": "string | null",         // nullable here — additionalFields override
    "emailVerified": false,
    "image": "string | null",
    "createdAt": "ISO-8601",
    "updatedAt": "ISO-8601",
    "role": "student",
    "phoneNumber": "string | null",
    "phoneNumberVerified": false
  }
}
```

Column list from `apps/api/prisma/schema.prisma` (`Session`, `User` models).

**Prefer `/api/session` on mobile** — it is one round trip that also yields the
permission list.

### 8.3 Prisma models (field → column)

`apps/api/prisma/schema.prisma`, schema `app`:

**`users`**
`id` (String, PK, better-auth nanoid), `name`, `email` (String?, `@unique` —
Postgres exempts NULLs so every email-less account is NULL and they do not collide),
`email_verified` (Boolean, default false), `image` (String?),
`role` (String, default `"student"`), `created_at`, `updated_at`,
`phone_number` (String?, `@unique`, **always E.164**, plain text not citext because
better-auth compares byte-for-byte), `phone_number_verified` (Boolean?, default false,
`false` on every row today), `banned_at` (DateTime?), `banned_reason` (String?),
`banned_by_user_id` (String?, `onDelete: SetNull`).

**`sessions`**
`id` (PK), `expires_at`, `token` (`@unique`), `created_at`, `updated_at`,
`ip_address` (String?), `user_agent` (String?), `user_id` (FK → users, `Cascade`).

**`accounts`**
`id` (PK), `account_id`, `provider_id` (`'credential'` | `'google'` | `'apple'`),
`user_id` (FK, `Cascade`), `access_token?`, `refresh_token?`, `id_token?`,
`access_token_expires_at?`, `refresh_token_expires_at?`, `scope?`,
`password?` (the Argon2id hash for `provider_id='credential'`),
`created_at`, `updated_at`. `@@unique([provider_id, account_id])`.
For the credential provider, `account_id === user_id` (better-auth convention, noted
at `students.service.ts:536-538`).

**`verifications`**
`id`, `identifier` (indexed), `value`, `expires_at`, `created_at`, `updated_at`.
Only ever written by the OTP path, which is disabled.

**`session_devices`**
`id` (uuid7, PK), `user_id` (FK, `Cascade`), `session_id` (`@unique`),
`device_name`, `device_type`, `ip` (`Inet`, nullable), `last_seen_at`,
`logged_in_at` (default now), `revoked_at` (DateTime?).
`@@index([user_id, revoked_at])`.

### 8.4 ⚠️ User ids are nanoids, not UUIDs

`User.id` is `String @id` with no `@default(uuid())` — better-auth generates it.
Do **not** validate a `userId` with a UUID regex on the client
(this repo has been bitten by exactly that; see `packages/contracts/src` conventions).

---

## 9. SessionDevice — «أجهزتي»

### 9.1 Registration (automatic, server-side)

`apps/api/src/auth/auth.config.ts:541-556` —
`databaseHooks.session.create.after` calls
`SessionDeviceService.recordLogin({ sessionId, userId, ipAddress, userAgent })`.
Because it hooks the **DB write**, it fires for email/password sign-in, sign-up, and
any future OAuth provider, with no per-path wiring. It is best-effort: a failure is
caught and logged (`console.error('session-device: failed to record login', …)`),
never surfacing to the user.

`apps/api/src/modules/sessions/session-device.service.ts:71-85`:

```ts
const { deviceName, deviceType } = parseUserAgent(input.userAgent);
prisma.sessionDevice.create({ data: {
  userId, sessionId, deviceName, deviceType,
  ip: blankToNull(input.ipAddress),   // '' → null; ''::inet is a 22P02 that kills the row
  lastSeenAt: now, loggedInAt: now,
}});
```

### 9.2 `parseUserAgent` — device labels

`apps/api/src/modules/sessions/user-agent.ts`. Order matters; most-specific first.

Browser detection (line 29-42), in order:
`EdgA?/` → `Edge`; `OPR/` → `Opera`; `SamsungBrowser/` → `Samsung Internet`;
`FxiOS/` → `Firefox`; `CriOS/` → `Chrome`; `Firefox/` → `Firefox`;
`Chrome/ && !Chromium/` → `Chrome`; `Safari/ && Version/` → `Safari`;
else `متصفح غير معروف`.

OS detection (line 44-51):
`iPhone|iPad|iPod` → `iOS`; `Mac OS X` → `macOS`; `Android` → `Android`;
`Windows` → `Windows`; `Linux` → `Linux`; else `نظام غير معروف`.

Device type (line 53-57):
`iPad` OR (`Android` without `Mobile`) → `tablet`;
`iPhone|iPod|Mobile` → `mobile`; else `desktop`.

Empty/missing UA → `{ deviceName: 'جهاز غير معروف', deviceType: 'unknown' }`.

Label format: **`` `${browser} على ${os}` ``** — e.g. `Chrome على Android`.

**Mobile implication:** a Flutter client sending its default Dart UA
(`Dart/3.x (dart:io)`) will be labelled **`متصفح غير معروف على نظام غير معروف`**
with `deviceType: 'desktop'`. See §11 gap 5.

### 9.3 `GET /api/sessions`

Returns `SessionDeviceView[]`. Contract:
`packages/contracts/src/sessions.ts:12-24`.

```jsonc
[
  {
    "id": "uuid7 string",
    "deviceName": "Chrome على Android",
    "deviceType": "mobile" | "tablet" | "desktop" | "unknown",
    "ip": "string | null",
    "lastSeenAt": "ISO-8601 string",
    "loggedInAt": "ISO-8601 string",
    "isCurrent": true
  }
]
```

* Filter: `where { userId, revokedAt: null }` — revoked rows are dropped from the list
  but survive in the DB for audit.
* **Ordering: `orderBy { lastSeenAt: 'desc' }`** (`session-device.service.ts:94-97`).
* No pagination.
* `isCurrent` = `row.sessionId === currentSessionId`, and `currentSessionId` comes from
  `AuthGuard`'s attached session (`@CurrentSession()`), never from the request body,
  so it cannot be spoofed.

### 9.4 `DELETE /api/sessions/:id`

`apps/api/src/modules/sessions/sessions.controller.ts:34-41` → **204 No Content**,
empty body.

`revokeOwn` (`session-device.service.ts:126-144`) — the IDOR-critical path:

```sql
UPDATE session_devices SET revoked_at = now()
 WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
```

`count === 0` → controller throws `NotFoundException` → **404**, identically for
"belongs to someone else", "does not exist", and "already revoked". A 403 would confirm
the id exists. On success it also `session.deleteMany({ id: device.sessionId })`, which
is what makes the revoked session fail its very next request.

### 9.5 UI (`/settings/devices`)

Page: `apps/web/app/(app)/settings/devices/page.tsx`.
List: `apps/web/components/settings/devices-list.tsx`.
Copy: `packages/contracts/src/copy/ar.ts:973-984` (`copy.settings.devices.*`).

| Key | Arabic |
|---|---|
| `title` | `أجهزتي` |
| `subtitle` | `الأجهزة اللي حسابك مفتوح عليها دلوقتي. لو فيه جهاز مش بتاعك، اقفله من هنا.` |
| `current` | `الجهاز الحالي` |
| `loggedInAt` | `دخل في` |
| `lastSeenAt` | `آخر نشاط` |
| `revoke` | `قفل الجهاز` |
| `revokePending` | `جارٍ القفل…` |
| `revokeCurrentConfirm` | `ده الجهاز اللي إنت عليه دلوقتي — لو قفلته هيتسجّل خروجك فورًا. تمام؟` |
| `revokeError` | `مقدرناش نقفل الجهاز. نحاول تاني.` |
| `empty` | `مفيش أجهزة مفتوحة دلوقتي` |

States (`devices-list.tsx:71-86`):

* **loading** — two `Skeleton` blocks, `h-20 w-full`, `space-y-3`
* **error** — a single `<p>` in `var(--err)` reading `copy.common.error` = **`حصلت مشكلة`**
* **empty** — a single muted `<p>` reading `مفيش أجهزة مفتوحة دلوقتي`
* **success** — a `<ul>` of `Card`s

Row layout (`devices-list.tsx:107-135`): stacked below the `sm` breakpoint, side-by-side
above it. Left/start column: device name (truncated, `font-medium`) + an accent `Badge`
reading `الجهاز الحالي` when `isCurrent`, then two mono muted lines:
`دخل في {formatDate(loggedInAt)}` and `آخر نشاط {formatDate(lastSeenAt)}`.
End column: a `danger` `sm` button, full width below `sm`.

Date format (`devices-list.tsx:16-19`):
`Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' })`
— **Western digits**, matching the phone fields.

Revoke behaviour (`devices-list.tsx:45-69`):

1. If `device.isCurrent`, show a native confirm with `revokeCurrentConfirm`; abort on cancel.
2. Disable that row's button, label it `جارٍ القفل…`.
3. `DELETE /api/sessions/{id}`.
4. If it was the current device → navigate to `/login` (the cookie is already dead).
5. Otherwise remove the row from local state.
6. On any throw → flip the whole component into the error state.

---

## 10. Onboarding

`/onboarding` is mandatory: `proxy.ts` bounces a signed-in student with
`onboardingCompleted === false` back to it from every protected route (§5.7).

### 10.1 Prerequisite: the taxonomy

`GET /api/taxonomy` (public). Contract `packages/contracts/src/taxonomy.ts:80-85`:

```jsonc
{
  "governorates": [ { "code": "01", "nameAr": "…", "slug": "…",
                      "region": "urban"|"lower"|"upper"|"frontier", "sortOrder": 0 } ],
  "pinnedGovernorateCodes": ["01", "02", …],
  "systems": [ {
    "id": "uuid", "slug": "bacalorya", "nameAr": "…",
    "totalMarks": 0, "passPercent": 0, "allowsRetakes": false,
    "years":  [ { "year": 1, "labelAr": "…", "badgeAr": "…" } ],
    "tracks": [ { "id": "uuid", "slug": "engineering_cs", "labelAr": "…", "minYear": 2,
                  "electiveGroups": [ { "id": "uuid", "year": 2, "labelAr": "…", "pickCount": 1,
                    "options": [ { "id": "<SubjectOffering.id>", "subjectId": "<Subject.id>",
                                   "subjectSlug": "programming_cs", "nameAr": "…" } ] } ] } ]
  } ]
}
```

`governorate.code` is exactly 2 characters.
Option order for the governorate select (`apps/web/lib/profile-options.ts:42-50`):
**pinned codes first, in `pinnedGovernorateCodes` order, then everything else in the
array's own order.** Label = `nameAr`, value = `code`.

### 10.2 The three questions the student is NOT asked

`apps/web/lib/section-defaults.ts`:

```ts
FIXED_SYSTEM_SLUG            = 'bacalorya'
FIXED_TRACK_SLUG             = 'engineering_cs'
FIXED_ELECTIVE_SUBJECT_SLUG  = 'programming_cs'
HIGHEST_OFFERED_YEAR         = 2      // years offered: 1 and 2 only
FIRST_TRACKED_YEAR           = 2      // year 1 is common, no track
```

* `offeredYearOptions(taxonomy)` = the `bacalorya` system's `years` filtered to
  `year <= 2`, mapped to `{ value: String(year), label: labelAr }`.
* `fixedSectionFor(taxonomy, year)` (`section-defaults.ts:82-95`):
  * base `{ system: 'bacalorya', year }`
  * `year < 2` → base (no track, no elective)
  * `year >= 2` → find the `engineering_cs` track by slug → add `trackId`;
    inside it find the elective group with `group.year === year`, then the option with
    `subjectSlug === 'programming_cs'` → add `electiveSubjectId`
  * a taxonomy missing either degrades to the base rather than throwing

These three are spread **after** the form values on submit so they always win
(`onboarding-form.tsx:188-191`).

### 10.3 The payload contract

`packages/contracts/src/onboarding.ts:30-106` — `OnboardingSchema` = `OnboardingShapeSchema.superRefine(refineSection)`, `.strict()`.

| Field | Type | Required | Rules | Arabic error |
|---|---|---|---|---|
| `fullName` | string | ✅ | trim, min 2, max 120 | `الاسم الكامل مطلوب` (max has no custom message) |
| `gender` | `'male' \| 'female'` | ✅ | `z.enum` | UI substitutes `لازم نحدد النوع` |
| `phone` | string → E.164 | ✅ | `egyptianPhone('رقم الهاتف مطلوب')` | `رقم الهاتف مطلوب` / `رقم الهاتف يجب أن يكون رقمًا مصريًا صحيحًا` |
| `governorateCode` | string | ✅ | `.length(2)` | `لازم نحدد المحافظة` |
| `schoolName` | string | ✅ | trim, min 1, max 200 | `اسم المدرسة مطلوب` |
| `schoolStream` | `'general' \| 'languages'` | ✅ | `z.enum` | UI substitutes `لازم نحدد نوع مدرستك` |
| `fatherPhone` | string → E.164 | ✅ | `egyptianPhone('هاتف الأب مطلوب')` | `هاتف الأب مطلوب` / invalid message |
| `system` | `'bacalorya' \| 'thanaweya_amma'` | optional | slug, resolved server-side to the FK | — |
| `year` | number | ✅ | `int().min(1).max(3)` | `لازم نحدد الصف الدراسي` |
| `trackId` | string | optional | min 1 | — |
| `electiveSubjectId` | string | optional | min 1 | — |

**`motherPhone` is not accepted at all** — `.strict()` rejects it (the column survives
for legacy rows but nothing writes it).

`.strict()` closes mass assignment (S11): a payload carrying `role`, `userId` or
`onboardingCompletedAt` **fails validation** rather than being stripped.

Cross-field rules — `refineSection` (`onboarding.ts:152-200`):

| Condition | issue path | Arabic message |
|---|---|---|
| `year === 1 && trackId !== undefined` | `trackId` | `الصف الأول لا يختار مسارًا بعد` |
| `trackId !== undefined && system === undefined` | `system` | `لازم نحدد النظام الدراسي الأول` |
| `electiveSubjectId !== undefined` and NOT (`system === 'bacalorya' && year === 2`) | `electiveSubjectId` | `المادة الاختيارية غير متاحة في هذه الحالة` |
| `electiveSubjectId !== undefined && trackId === undefined` | `trackId` | `لازم نحدد المسار الأول` |

There is deliberately **no** "بكالوريا year 2 must carry an elective" rule any more.

### 10.4 The request

```http
PATCH /api/profile/onboarding
Content-Type: application/json
x-csrf-token: <non-empty>

{ ...OnboardingSchema fields, ...fixedSectionFor(taxonomy, year) }
```

Requires `profile:write`. `userId` is taken from the session and never read from the
body (`profile.controller.ts:33-48`).

Server-side validation beyond the schema (`apps/api/src/modules/profile/profile.service.ts`):

| Check | Failure |
|---|---|
| `governorateCode` matches a real `Governorate` row | 400 `governorateCode does not match a known governorate` |
| `system` slug resolves to a real `EducationSystem` | 400 `system does not match a known education system` |
| `trackId` exists AND `track.systemId === systemId` | 400 `trackId does not belong to the selected system` |
| `electiveSubjectId` exists, has `electiveGroupId`, `trackId` matches, `year` matches | 400 `electiveSubjectId is not one of the available options for the selected track and year` |
| after first completion, `phone` ≠ stored `users.phone_number` | 400 `phone cannot be changed here` |
| unique violation on `users.phone_number` OR `student_profiles.phone` | **409** `phone is already registered to another profile` |

Success: **200** with the whole `StudentProfile` row.

Write semantics (`profile.service.ts:272-319`):
one transaction writing `users.phone_number` **and** the `student_profiles` upsert;
`onboardingCompletedAt` is stamped only the first time (`existing?.onboardingCompletedAt ?? new Date()`).
`motherPhone` is omitted from the update object, not nulled.

### 10.5 The step machine

`apps/web/components/onboarding/onboarding-form.tsx:45-58`:

```ts
const STEPS = [
  { title: copy.onboarding.step1Title, fields: ['fullName','gender','phone'] },
  { title: copy.onboarding.step2Title, fields: ['governorateCode','schoolName','schoolStream'] },
  { title: copy.onboarding.step3Title, fields: ['year'] },
  { title: copy.onboarding.step4Title, fields: ['fatherPhone'] },
];
const PHONE_STEP = STEPS.findIndex(s => s.fields.includes('phone'));   // 0
```

Rules:

* **Next** validates only the current step's fields (`trigger([...fields])`). If invalid,
  it does not advance. On success it clears the form-level error and advances.
* **Back** never validates and never blocks.
* **Enter** on steps 1–3 is intercepted and calls `goNext()` instead of submitting
  (`onboarding-form.tsx:285-290`).
* Only step 4 has a submit button. The whole payload posts from there.
* All four steps stay **mounted**; inactive ones are `hidden` (so validation can focus
  an invalid field on a step you are not looking at).
* The Next / Submit buttons carry distinct React `key`s (`"next"` / `"submit"`) to force
  a real unmount/remount, so a click racing the step change cannot submit early
  (`onboarding-form.tsx:442-458`).

Prefill (`onboarding-form.tsx:131-149`):

```
fullName: account.name                    // from /api/session
phone:    account.phoneNumber ?? undefined  // undefined, not '', for a Google account
...readOnboardingDraft()                  // spread LAST — the draft wins
```

Draft persistence (`apps/web/components/onboarding/use-onboarding-draft.ts`):
`sessionStorage` key **`onboarding-draft`**; restorable keys are exactly
`['fullName','gender','phone','governorateCode','schoolName','schoolStream','year','fatherPhone']`
— the three fixed-section fields are deliberately NOT restorable, so a hand-edited draft
cannot choose a student's track. Cleared explicitly on success
(`clearOnboardingDraft()`), never left to expire with the tab.
Every failure mode returns `{}` rather than throwing.

Year select coercion (`onboarding-form.tsx:74-76`):
`emptyToUndefinedYear(v) => v === '' ? undefined : Number(v)` — `undefined`, not `NaN`,
so the required check produces the Arabic message rather than zod's English default.

### 10.6 Onboarding copy (verbatim)

`packages/contracts/src/copy/ar.ts:211-403` (`copy.onboarding.*`):

| Key | Arabic |
|---|---|
| `title` | `نكمّل بيانات حسابك` |
| `subtitle` | `شوية معلومات سريعة عشان نعرف نوريك الكورسات اللي تخصّك إنت بس` |
| `identityGreeting` | `أهلاً يا` (rendered as `{identityGreeting} {name}`) |
| `step1Title` | `مين إنت` |
| `step2Title` | `إنت فين` |
| `step3Title` | `إنت في سنة كام` |
| `step4Title` | `تليفون ولي الأمر` |
| `privacyNote` | `بياناتك محفوظة عند أيمن أبو العلا وبس، ومابتتباعش ولا بتتشارك مع حد.` |
| `privacyLink` | `اعرف بالظبط بنجمع إيه وليه` |
| `parentPhonesWhy` | `الرقم ده عشان نقدر نتواصل مع ولي أمرك عن مستواك لو احتجنا. مابنستعملهوش في أي حاجة تانية.` |
| `fullName` | `الاسم الكامل` |
| `fullNamePlaceholder` | `الاسم بالكامل` |
| `gender` | `النوع` |
| `genderPlaceholder` | `اختار` |
| `genderMale` | `ذكر` |
| `genderFemale` | `أنثى` |
| `genderError` | `لازم نحدد النوع` |
| `phone` | `رقم الهاتف` |
| `phonePlaceholder` | `مثال: 01012345678` |
| `governorate` | `المحافظة` |
| `governoratePlaceholder` | `محافظتك` |
| `schoolName` | `اسم المدرسة` |
| `schoolNamePlaceholder` | `مثال: مدرسة النصر الثانوية` |
| `schoolStream` | `مدرستك` |
| `schoolStreamPlaceholder` | `مدرسة عام ولا لغات؟` |
| `schoolStreamError` | `لازم نحدد نوع مدرستك` |
| `year` | `الصف الدراسي` |
| `yearPlaceholder` | `اختار صفّك` |
| `fatherPhone` | `رقم تليفون ولي الأمر` |
| `next` | `التالي` |
| `back` | `السابق` |
| `progressLabel` | `تقدّمك في تكميل البيانات` (accessible name of the progress bar) |
| `submit` | `حفظ ونكمّل` |
| `submitPending` | `جارٍ الحفظ…` |
| `submitError` | `مقدرناش نحفظ بياناتك. مراجعة سريعة ونحاول تاني.` |
| `phoneConflictError` | `رقمك ده متسجّل على حساب تاني` |
| `phoneConflictHint` | `رجّعناك لرقمك — فيه حساب تاني متسجّل بيه. غيّره أو سجّل الدخول بيه.` |
| `unavailableTitle` | `مش قادرين نجيب قايمة المحافظات والصفوف دلوقتي` |
| `unavailableBody` | `المشكلة عندنا إحنا مش عندك، وحسابك اتعمل تمام ومحصلش أي حاجة له. دقيقة واحدة ونجرّب تاني — والباقي بيكمّل من نفس المكان.` |

The two `schoolStream` option labels come from `copy.stream.general` / `copy.stream.languages`,
**not** from this namespace, so the student's answer and a course's badge cannot be
spelled differently (`apps/web/lib/profile-options.ts:31-34`).

Fixed-section panel (rendered only on `/settings/section`, **not** during sign-up):
`fixedSectionTitle` `الباقي إحنا عارفينه`, `fixedSystem` `البكالوريا المصرية`,
`fixedTrack` `مسار الهندسة وعلوم الحاسب`, `fixedSubject` `البرمجة وعلوم الحاسب`,
`fixedSectionHint` `المنصّة دي للبكالوريا بس، ولمادة البرمجة تحديدًا — فمش هنسألك على نظام ولا مسار ولا مادة.`

### 10.7 Onboarding screen structure & states

`apps/web/app/(app)/onboarding/page.tsx`:

```
<main max-w-2xl px-6 py-16>
  <h1>نكمّل بيانات حسابك</h1>
  <p muted>شوية معلومات سريعة…</p>
  taxonomy === null ? <TaxonomyUnavailable/> : <OnboardingForm/>
</main>
```

**Error / degraded state** (`TaxonomyUnavailable`, page.tsx:144-160): a `.panel`
containing `unavailableTitle` (h2), `unavailableBody` (p), and a retry rendered as a
plain `<a href="/onboarding?next=…">` labelled `copy.common.retry` = **`نحاول تاني`**.
This is a dead end otherwise, because `proxy.ts` keeps sending the student back here.

**Form structure** (`onboarding-form.tsx:259-490`), top to bottom:

1. `IdentityHeader` — avatar (48px, photo or initials) + `أهلاً يا {name}` +
   an `dir="ltr"` truncated identity line (`email ?? phoneNumber`, omitted if null).
   Container: `flex items-center gap-4 rounded-md border border-line bg-surface-2 p-4`.
2. `StepProgress` — `role="progressbar"`, `aria-label="تقدّمك في تكميل البيانات"`,
   `aria-valuemin=1`, `aria-valuemax=4`, `aria-valuenow=stepIndex+1`; four 1px-tall
   segments (accent when `index < currentStep`, `bg-surface-4` otherwise), then the
   step title in a mono muted label.
3. A `Card` whose body holds the four step `<div hidden={stepIndex !== n}>` blocks.
4. Form-level error `<p role="alert">` in `var(--err)` when set.
5. Button row: `السابق` (secondary, only when `stepIndex > 0`) and
   `التالي` / `حفظ ونكمّل` (`flex-1`).
6. Privacy line under every step: `privacyNote` + a link to `/privacy?from=onboarding`
   labelled `privacyLink`. Same-tab navigation (the draft survives it).

**Submit success** (`onboarding-form.tsx:251-256`): clear the draft, then navigate to
`/welcome` (or `/welcome?next=<encoded>`). `/welcome` offers the WhatsApp channel once
and redirects straight through when no channel is configured.

**409 handling** (`onboarding-form.tsx:215-220`) — the one server error attached to a
field:

```ts
setError('phone', { message: copy.onboarding.phoneConflictError }, { shouldFocus: false });
setStepIndex(PHONE_STEP);          // walk back to step 1
setFormError(copy.onboarding.phoneConflictHint);
```

`shouldFocus: false` because the step is changing in the same commit.
**Any other error** → `setFormError(copy.onboarding.submitError)`.

### 10.8 `/settings/section` — changing year afterwards

`PATCH /api/profile/section`, `profile:write`.
Schema `StudentSectionSchema` (`onboarding.ts:115-134, 218`), `.strict()`:
`{ system?: 'bacalorya'|'thanaweya_amma', year: int 1..3 (REQUIRED), trackId?: string, electiveSubjectId?: string }`
with the same `refineSection` rules. Writes only those four columns —
**it does not reset progress** (`onboarding.ts:204-217`).

---

## 11. Screen-by-screen: /login and /register

### 11.1 Shell

`apps/web/app/(auth)/layout.tsx` — a split screen:

```
<div class="auth-shell">
  <main class="auth-pane">
    <div class="auth-pane__inner">      // flex column, 32px gap
      <Link href="/" class="auth-brand-link"><BrandLockup/></Link>
      {children}
    </div>
  </main>
  <AuthShowcase/>                        // dark panel, hidden below 62rem
  <Suspense><AssistantSlot/></Suspense>
</div>
```

`AuthShowcase` copy (`copy.auth.aside`, `ar.ts:555-563`):

| Key | Arabic |
|---|---|
| `eyebrow` | `منصة أ. أيمن أبو العلا` |
| `title` | `حسابك هو مكان مذاكرتك كله` |
| `body` | `الكورسات، الدروس اللي خلصت، درجاتك في كل اختبار، وآخر حتة في المذاكرة — كله بيستناك جوه.` |
| `point1` | `كل كورساتك في صفحة واحدة` |
| `point2` | `المشغّل بيفتكر آخر ثانية في الفيديو` |
| `point3` | `كل درجاتك ومراجعاتك متسجّلة` |
| `codeCaption` | `welcome.js` |

Metadata: `noindex` (`privateRouteMetadata`) — deliberately crawlable so the directive
is seen.

### 11.2 `/login`

`apps/web/app/(auth)/login/page.tsx`:

1. `<header class="auth-head">` — h1 `تسجيل الدخول`, p `نكمّل من المكان اللي وقفنا عنده.`
2. **If a valid `?next=` is present**, a `role="status"` notice reading
   `تسجيل الدخول عشان نكمّل` (`copy.auth.login.continueNotice`). Absent for a direct visit.
3. **If `?error=` is present**, a `role="alert"` notice in `var(--err)` with the social
   error string (§6.4). Rendered **above** the form, because the fix is the form.
4. `<LoginForm/>`
5. Footer: `لسه معملتش حساب؟` + link `نعمل واحد دلوقتي` → `/register` (carrying `next`).

`LoginForm` (`apps/web/components/auth/login-form.tsx`):

* `<form method="post" noValidate>` — `method="post"` is a **credential-leak guard**:
  a press before hydration would otherwise submit as GET and put the password in the URL.
  Reproduce the equivalent guard in Flutter by disabling the button until state is ready.
* Field 1: label `رقم الموبايل أو البريد الإلكتروني`, `type="text"` (NOT `email`),
  `autoComplete="username"`, `dir="ltr"`.
* Field 2: label `كلمة المرور`, `type="password"`, `autoComplete="current-password"`.
* Error `<p role="alert">` in `var(--err)`.
* Submit: `دخول` / while pending `بندخّلك…`; disabled while submitting.
* Divider `أو` (`role="separator"`), then the Google button:
  four-colour G mark + label `المتابعة بحساب جوجل`, `variant="secondary"`, full width.
* On success: `resolvePostLoginDestination(next)` then a **full page navigation**
  (`window.location.assign`) — never a soft route change, because the router cache holds
  Server Component payloads fetched under the previous session.

### 11.3 `/register`

`apps/web/app/(auth)/register/page.tsx` — h1 `إنشاء حسابك`,
subtitle `دقيقة واحدة وتكون جوه أول محاضرة.`, then `<RegisterForm/>`, then
`عندك حساب؟` + `الدخول من هنا`.

`RegisterForm` fields, in order (`register-form.tsx:108-154`):

| Label | type | autoComplete | extras |
|---|---|---|---|
| `الاسم الكامل` | text | `name` | — |
| `رقم الموبايل` | tel | `tel` | `inputMode="numeric"`, `dir="ltr"`, placeholder `01012345678` |
| `البريد الإلكتروني (اختياري)` | email | `email` | `dir="ltr"`, hint `مش لازم. المنصة مابتبعتش إيميلات — الرقم هو اللي بيتم الدخول بيه.` |
| `كلمة المرور` | password | `new-password` | — |
| `تأكيد كلمة المرور` | password | `new-password` | — |

Submit: `إنشاء الحساب` / `بنجهّز حسابك…`.
Then the Google button, then the consent line:
`بإنشاء الحساب إنت موافق على` [شروط الاستخدام] `و` [سياسة الخصوصية].

Note the register phone field uses the plain `FormField` with `placeholder: '01012345678'`
(no `مثال:` prefix — a bidi run made the hint jump; `ar.ts:501-510`), while the
onboarding phone fields use `PhoneField` with `مثال: 01012345678`.

### 11.4 Loading & error boundaries

* `login/loading.tsx` / `register/loading.tsx` — skeletons mirroring the real form's
  proportions: heading (h-8 wide + h-4 narrow), N field groups (h-3 label + h-10 input),
  h-10 submit, h-3 divider, h-10 provider button.
* `(auth)/error.tsx` — h1 `copy.errors.auth.title`, p `copy.errors.auth.body`, a
  primary retry button `نحاول تاني`, a secondary `<a href="/">` labelled `copy.nav.home`,
  and (when `error.digest` exists) `{copy.errors.digestLabel}: <span dir="ltr" mono>{digest}</span>`.

### 11.5 Sign out

`apps/web/components/sign-out-button.tsx` + `apps/web/lib/auth-client.ts:181-183`:

```http
POST /api/auth/sign-out
{}
```

Labels (`copy.nav`, `ar.ts:175-178`): `تسجيل الخروج` / while pending `جارٍ الخروج…` /
on failure a toast reading `مقدرناش نسجّل خروجك. نحاول تاني.`
On success: **full page navigation to `/`**, never a soft route change.

Related nav copy: `account` = `الحساب`, `adminPanel` = `لوحة التحكم`.

### 11.6 The `next` parameter — open-redirect rules

`apps/web/lib/safe-next.ts:58-89`. Any surface reading `?next=` MUST run it through
`safeNext`:

1. reject if it matches the FORBIDDEN pattern `/[\u0000-\u0020\u007F]|\s/u` (C0 controls, space, DEL, any Unicode whitespace)
2. reject unless it `startsWith('/')`
3. parse against `https://next.invalid`; reject if `url.origin !== BASE`
   (this is what kills `//evil.com` and `/\evil.com`, which the WHATWG parser folds)
4. return the **normalised** `${pathname}${search}${hash}`

`withNext(to, next)` appends `?next=` / `&next=` with `encodeURIComponent`, or returns
`to` unchanged.

---

## 12. Error code → UI, complete table

| Source | HTTP | code | UI string (verbatim) |
|---|---|---|---|
| any login failure | 401 | `INVALID_CREDENTIALS` | `البريد أو كلمة المرور مش مظبوطين` |
| login, banned account | 403 | `ACCOUNT_BANNED` | `حسابك موقوف دلوقتي، والدخول مقفول.` + `السبب: {reason}` + `ولو فيه غلط، كلمة للمدرّس وهيتظبط.` |
| sign-up, taken number | 422 | `PHONE_ALREADY_REGISTERED` | `الرقم ده ليه حساب عندنا بالفعل.` + link `ادخل بالرقم ده` |
| sign-up, bad/missing phone | 400 | `INVALID_PHONE_NUMBER` | generic register error |
| sign-up, any other | 422/500/network | `FAILED_TO_CREATE_USER` / — | `مقدرناش نعمل الحساب. البيانات محتاجة مراجعة، وبعدها نحاول تاني.` |
| social callback | redirect | `?error=account_not_linked` | `الإيميل ده مسجّل عندنا بكلمة سر. الدخول بالإيميل وكلمة السر من فوق، مش بجوجل.` |
| social callback | redirect | `?error=<anything else>` | `مقدرناش نكمّل الدخول بجوجل. نجرّب تاني، أو ندخل بالإيميل وكلمة السر.` |
| onboarding | 409 | — | field error `رقمك ده متسجّل على حساب تاني` + form hint `رجّعناك لرقمك — فيه حساب تاني متسجّل بيه. غيّره أو سجّل الدخول بيه.` |
| onboarding | 400/500/network | — | `مقدرناش نحفظ بياناتك. مراجعة سريعة ونحاول تاني.` |
| taxonomy unavailable | — | — | `مش قادرين نجيب قايمة المحافظات والصفوف دلوقتي` + body + `نحاول تاني` |
| devices list/revoke | any | — | `حصلت مشكلة` (`copy.common.error`) |
| sign-out | any | — | toast `مقدرناش نسجّل خروجك. نحاول تاني.` |
| any guarded route, no session | 401 | — | app navigates to `/login?next=<path>` |
| any guarded route, wrong permission | 403 | — | admin shell renders `notFound()` |
| throttled (non-auth route) | 429 | — | no dedicated copy — falls to the generic error state |
| OTP endpoints | 501 | `OTP_NOT_CONFIGURED` | `لسه مفيش طريقة نبعت بيها كود التأكيد — رسالة للدعم.` (never surfaced today) |

**Rule the whole product follows:** never render `message` from an auth error response.
Branch on `code` only. The two documented exceptions are `ACCOUNT_BANNED` (safe because
the password already verified) and `PHONE_ALREADY_REGISTERED` (safe because a sign-up
form answers "does this number exist?" by refusing, whatever it says).

---

## 13. Mobile gaps — what must change server-side

Ordered by how blocking they are.

1. **Register the `bearer` plugin** in `apps/api/src/auth/auth.config.ts`'s `plugins`
   array (`import { bearer } from 'better-auth/plugins/bearer'` — the narrow subpath,
   never the `better-auth/plugins` barrel, per this repo's own rule at `auth.config.ts:16-19`).
   Without it a cookie-less client cannot authenticate anything.
   `AuthGuard` and `OptionalSessionService` already forward the `authorization` header
   into `auth.api.getSession`, so they start working with no further change.
2. **Provision Google OAuth and set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.**
   They are unset today (`docs/runbooks/google-sign-in.md`, "Status: NOT YET DONE"),
   so `POST /api/auth/sign-in/social` currently 404s with `PROVIDER_NOT_FOUND`.
   For native ID-token sign-in the Flutter app should pass the **web** client id as
   `serverClientId` so the returned `id_token.aud` matches the configured `clientId` —
   that needs zero backend change. Registering separate iOS/Android client ids instead
   would require adding them as accepted audiences.
3. **Apple:** all four `APPLE_*` vars must be set, and the mobile bundle id has to be an
   accepted audience (or the app must sign in with the Services ID). Apple is also
   inert in the UI today (`SocialProvider = 'google'`).
4. **Rate-limiting key.** `trackerFromRequest` hashes the session **cookie**
   (`apps/api/src/common/throttle/request-identity.ts:87-105`). A bearer-only client
   has none, so every mobile request falls into the shared `ip` bucket (1200/min) and
   loses per-student fairness. Extend the tracker to hash the `Authorization` header
   when no session cookie is present.
5. **Device labels.** `parseUserAgent` only understands browser UA strings
   (`apps/api/src/modules/sessions/user-agent.ts`); a Flutter client will appear in
   «أجهزتي» as `متصفح غير معروف على نظام غير معروف` / `deviceType: 'desktop'`.
   Either send a UA the parser recognises, or add native cases
   (e.g. `AymanApp/1.0 (Android 14; Pixel 8)` → `Android` / `mobile`).
6. **Client IP.** `blankToNull` guards `''::inet`, but `resolveClientIp`
   (`apps/api/src/auth/login-security.hook.ts:83-94`) reads only `x-forwarded-for` and
   falls back to the literal `'direct'`; better-auth's own `getIp` returns null unless
   the header holds exactly one address. Direct-to-API mobile traffic behind Cloudflare
   will mostly record `ip: null` on `session_devices`. Cosmetic — nothing renders it.
7. **CSRF.** No backend change is strictly needed (send a constant `x-csrf-token` on
   every state-changing non-auth request), but a cleaner fix is to make `CsrfGuard`
   skip requests that carry `Authorization` and no `Cookie`.
8. **Account recovery does not exist.** No OTP, no email, no password reset
   (`auth.config.ts:373-389`). A mobile app must not ship a "نسيت كلمة السر" link until
   `sendOTP` is implemented and `requireVerification` can be turned on — and note that
   turning `requireVerification` on today locks out every existing student, because
   every `phone_number_verified` is `false`.
9. **Session revocation is immediate by design** (`cookieCache` deliberately absent).
   The mobile client must treat any 401 on a previously working request as "signed out",
   clear the stored token, and route to login — a ban or a remote device revoke lands
   exactly this way.
10. **Onboarding is mandatory and enforced only by the web proxy.** The API does not
    refuse other routes for a profile-less student. The mobile app must reproduce
    `decideRedirect` (§5.7) itself: after every sign-in, `GET /api/profile/me` and route
    to onboarding when `onboardingCompleted === false`; fail toward onboarding on error.
11. **Deep links / OAuth callback for the browser fallback.** If the app ever uses the
    redirect (non-ID-token) branch, `callbackURL` and `errorCallbackURL` are validated
    against `trustedOrigins = [APP_URL]` with `allowRelativePaths: true`
    (`origin-check.mjs:52-70`), so a custom scheme like `aymanapp://` would be rejected
    with `INVALID_CALLBACK_URL` unless added to `trustedOrigins`. Prefer the ID-token
    branch and avoid this entirely.
