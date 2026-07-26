# Plan 2 — Auth & Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A student can register with email+password or Google, complete a 9-field onboarding that adapts to the البكالوريا taxonomy, and land on a personalised dashboard — with NestJS as the sole authorization authority.

**Architecture:** Better Auth hosted inside NestJS, users and sessions in our own Postgres via the Prisma adapter. NestJS guards remain the only thing that grants or denies access; Better Auth only establishes identity. Single origin means httpOnly `__Host-` cookies with `SameSite=Strict` and zero CORS.

**Tech Stack:** `better-auth@1.6.25` · `@thallesp/nestjs-better-auth@2.7.0` · `argon2@0.45.1` · `react-hook-form@7.83.0` + `@hookform/resolvers@5.5.3` · `libphonenumber-js@1.13.9` · Zod 4 (shared contracts)

**Prerequisite:** Plan 1 complete (PR #1). All versions above verified against the npm registry 2026-07-26.

---

## Global Constraints

Inherited from Plan 1 and still binding — plus auth-specific ones.

1. **Single origin.** Web serves `/`, API serves `/api`. Never configure CORS. Never hardcode the API host outside `next.config.ts` and `lib/api.ts`.
2. **Ports:** web `3200`, api `3300`. Port 3000 is occupied.
3. **RTL-native.** Logical utilities only; `ayman/no-physical-direction` now also inspects module-level class constants.
4. **No user-facing string literals outside `packages/contracts`.** `app/dev/*` is exempt.
5. **Extensionless relative imports.** `moduleResolution: Bundler` in both apps.
6. **`tsc` is type-check only** in `apps/api` (`noEmit: true`); SWC produces the runtime output.
7. **Argon2id at m=19456 (19 MiB), t=2, p=1.** Not bcrypt, not default parameters.
8. **NestJS guards are the sole authorization authority.** Better Auth answers "who is this"; guards answer "may they".
9. **Permissions are `resource:action` strings**, never role equality checks.
10. **Deny by default.** Every route is protected unless explicitly marked public.
11. Commit after every task, explicit `git add` paths, conventional messages.

---

## Security Requirements

These are not optional polish. Each one closes a specific attack.

| # | Requirement | Attack it closes |
|---|---|---|
| S1 | Identical error + status for unknown-user, wrong-password, and locked account | Account enumeration |
| S2 | Argon2 runs against a **dummy hash** when the account does not exist | Timing-based enumeration |
| S3 | Login rate limit keyed on **email + IP jointly** | IP-only locks out a whole school's NAT; account-only lets a botnet lock out a victim |
| S4 | Progressive delay (2^n capped at 30s), soft lock at 10 attempts for 15 min, auto-clearing | Brute force, without a permanent DoS on the victim |
| S5 | OAuth: pass `algorithms` explicitly; never read `alg` from the token | Algorithm confusion |
| S6 | Key accounts on `(provider, providerAccountId)`, **never email** | Email is mutable; keying on it allows takeover |
| S7 | **Reject auto-linking when `email_verified` is false** | Full account-takeover primitive |
| S8 | Session cookie: `httpOnly`, `Secure`, `SameSite=Strict`, `__Host-` prefix | XSS token theft, CSRF |
| S9 | CSRF: `SameSite=Strict` + required custom header on state-changing methods + `Origin`/`Sec-Fetch-Site` validation | SameSite alone is explicitly discouraged by OWASP |
| S10 | Onboarding writes are validated server-side against the taxonomy | A student PATCHing `{ role: 'admin' }` or an invalid track |
| S11 | Separate DTOs per role; `forbidNonWhitelisted: true` | Mass assignment |
| S12 | Fail closed — an adapter error or failed JWKS fetch denies | Fail-open auth is worse than no auth |

**Apple Sign In is scaffolded but cannot be tested locally.** Apple rejects `http://localhost` redirect URIs, and its `client_secret` is a generated ES256 JWT that expires (max 6 months), not a static value. The provider is wired and the button renders conditionally, but end-to-end verification waits for a staging HTTPS domain. Say so plainly in reports rather than claiming it works.

---

## Task 1: Better Auth schema + server instance

**Files:** `apps/api/prisma/schema.prisma` (add auth models), `apps/api/src/auth/auth.config.ts`, `apps/api/src/auth/auth.module.ts`, `apps/api/.env` (+ `.env.example`)

**Produces:** `auth` — the configured Better Auth instance; Prisma models `User`, `Session`, `Account`, `Verification`.

- [ ] **Step 1: Add the auth env vars** to `apps/api/src/config/env.ts`'s Zod schema and `.env.example`:
  `BETTER_AUTH_SECRET` (min 32 chars), `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and optional `APPLE_CLIENT_ID` / `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY`.
  Google and Apple vars must be **optional** — the app has to boot without them so local development works before OAuth apps exist. But if `GOOGLE_CLIENT_ID` is set, `GOOGLE_CLIENT_SECRET` must be too: enforce that pairing with a `.refine()`, and add a test.
- [ ] **Step 2: Generate the Better Auth Prisma models.** Run the Better Auth CLI generator against the config, or write the models by hand to match. They live in schema `app` like everything else. Add `@@schema("app")` to each.
- [ ] **Step 3: Write `auth.config.ts`** with `prismaAdapter(prisma, { provider: 'postgresql' })`, `emailAndPassword: { enabled: true }`, Google, and Apple. Set the Argon2id parameters explicitly — do NOT accept the library default. Configure `advanced.cookiePrefix` and cookie attributes for `__Host-`.
- [ ] **Step 4:** Migrate, generate, and confirm the four tables exist in schema `app`.
- [ ] **Step 5:** Verify `ayman_runtime` can `SELECT/INSERT/UPDATE/DELETE` on them but still cannot DDL.
- [ ] **Step 6: Commit.**

---

## Task 2: Mount Better Auth in NestJS + the guard layer

**Files:** `apps/api/src/auth/*`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`

**Produces:** `AuthGuard` (deny-by-default), `@Public()`, `@CurrentUser()`, `@RequirePermission('resource:action')`.

- [ ] **Step 1: Write the failing test** for the guard: an unauthenticated request to a protected route returns 401; a `@Public()` route returns 200; an authenticated request with an insufficient permission returns 403.
- [ ] **Step 2: Run it, confirm it fails.**
- [ ] **Step 3:** Mount the Better Auth handler via `@thallesp/nestjs-better-auth`. `bodyParser: false` is already set in `main.ts` — confirm it is still there, the adapter needs raw bodies.
- [ ] **Step 4:** Register `AuthGuard` as an `APP_GUARD` so **every** route is protected unless decorated `@Public()`. `GET /api/health` and `GET /api/taxonomy` must be marked public — verify both still respond anonymously afterward, since the onboarding form needs taxonomy before a user exists.
- [ ] **Step 5:** Implement permissions as `resource:action` strings with a role→permissions map (`admin` gets everything; `student` gets `profile:read`, `profile:write`, `course:read`). No role equality checks anywhere.
- [ ] **Step 6: Run the tests, confirm green. Commit.**

---

## Task 3: Login hardening

**Files:** `apps/api/src/auth/login-throttle.service.ts` + spec, wired into the auth hooks

**Produces:** the S1–S4 controls, independently testable.

- [ ] **Step 1: Write the failing tests.** Assert: (a) unknown email and wrong password produce byte-identical responses and status codes; (b) the attempt counter keys on `email + IP` together, so two different IPs attacking one account share a counter AND two accounts from one IP do not collide; (c) delay grows as 2^n capped at 30s; (d) soft lock trips at 10 and clears after 15 minutes.
- [ ] **Step 2: Run, confirm failing.**
- [ ] **Step 3: Implement.** For S2, hash against a precomputed dummy Argon2 hash when the user is absent, so the timing profile matches. Measure and record both paths in your report — if they differ by more than ~15%, the control is not working.
- [ ] **Step 4:** Wire into Better Auth's hooks. Confirm the generic error is what actually reaches the client, not a library-specific message that leaks which field was wrong.
- [ ] **Step 5: Commit.**

---

## Task 4: Student profile + onboarding API

**Files:** `apps/api/prisma/schema.prisma` (StudentProfile), `apps/api/src/modules/profile/*`, `packages/contracts/src/onboarding.ts`

**Produces:** `OnboardingSchema` (shared), `GET /api/profile/me`, `PATCH /api/profile/onboarding`.

- [ ] **Step 1:** Add `StudentProfile` per spec §6.2: `userId` PK/FK, `fullName`, `gender`, `phone` (citext, unique, E.164), `governorateCode` FK, `schoolName?`, `fatherPhone?`, `motherPhone?`, `systemId?`, `year?`, `trackId?`, `electiveSubjectId?`, `onboardingCompletedAt?`.
- [ ] **Step 2: Add the database-level constraint** enforcing that grade 1 has no track:
  ```sql
  ALTER TABLE app.student_profiles
    ADD CONSTRAINT student_profiles_year1_has_no_track
    CHECK (year IS NULL OR year <> 1 OR track_id IS NULL);
  ```
  Prisma cannot express this — hand-write it in the migration. **Then prove it rejects** a year-1 row carrying a track.
- [ ] **Step 3: Write `OnboardingSchema` in `packages/contracts`** as a Zod schema with the conditional logic as **refinements**, so the same rules drive the client form and the server:
  - `track` must be null when `year === 1`
  - `track` must belong to the chosen `system`
  - `electiveSubject` is required **only** when `system === 'bacalorya' && year === 2`, and must be one of that track's two options
  - `phone` validated with `libphonenumber-js` for Egypt (`+20`), stored E.164
- [ ] **Step 4: Write the failing tests** covering every branch above, including the negative cases (grade-1 with a track → rejected; a ثانوية عامة track submitted with `system: bacalorya` → rejected).
- [ ] **Step 5: Implement the service.** It must re-validate against the **database** taxonomy, not just the schema — a client could submit a syntactically valid track UUID that belongs to another system. This is S10; do not skip it because Zod already ran.
- [ ] **Step 6:** `PATCH /api/profile/onboarding` uses a student-scoped DTO with `forbidNonWhitelisted: true`. Add a test asserting that submitting `{ role: 'admin' }` or `{ userId: '<other>' }` is rejected, not silently ignored (S11).
- [ ] **Step 7: Commit.**

---

## Task 5: Auth UI — register, login, and the Apple/Google split

**Files:** `apps/web/app/(auth)/login/page.tsx`, `.../register/page.tsx`, `apps/web/components/auth/*`, copy additions in `packages/contracts`

**Produces:** working email+password and Google flows against the real API.

- [ ] **Step 1:** Add all auth copy to `packages/contracts/src/copy/ar.ts` under an `auth` key. No Arabic literal may appear in a component.
- [ ] **Step 2:** Build the form with react-hook-form + the shared Zod schema via `@hookform/resolvers`. Use the shadcn `Field` primitives, which accept raw Standard Schema issues — one schema drives client and server validation with no adapter.
- [ ] **Step 3: The Apple button renders only on Apple platforms.** Detect via `navigator.userAgent` / `navigator.platform` on the client, defaulting to hidden during SSR so it never flashes on Android. Google shows everywhere. Put the detection in one testable helper, not inline in the component.
- [ ] **Step 4:** Wire error states to the generic message from Task 3 — the UI must not "helpfully" distinguish "no such account" from "wrong password", which would undo S1.
- [ ] **Step 5: Verify in a real browser:** register → session cookie set with `HttpOnly`, `Secure`, `SameSite=Strict`; log out → cookie cleared; log in again → redirected to onboarding because it is incomplete. Read the actual cookie attributes from devtools; do not infer them.
- [ ] **Step 6: Commit.**

---

## Task 6: Onboarding UI — three steps, conditional taxonomy

**Files:** `apps/web/app/(app)/onboarding/*`, `apps/web/components/onboarding/*`

**Produces:** the 9-field flow from spec §5.2.

- [ ] **Step 1:** Fetch the taxonomy server-side and pass it down; the form is a client component driven by the shared schema.
- [ ] **Step 2: Implement the conditional rendering.** Track is **hidden entirely** when year is 1 — not disabled, hidden — and its value cleared so a stale selection cannot be submitted. Elective appears only for بكالوريا year 2 and its options depend on the chosen track.
- [ ] **Step 3:** Governorates render with القاهرة، الجيزة، الإسكندرية pinned to the top, the rest in official code order. Never sort alphabetically.
- [ ] **Step 4:** Parent phone fields are skippable. Record that they were skipped so they can be re-prompted later.
- [ ] **Step 5: Verify every conditional branch in a browser.** Selecting year 1 hides track; switching system swaps the track list; switching track swaps the elective options; submitting with a stale hidden value is rejected server-side.
- [ ] **Step 6: Commit.**

---

## Task 7: Sessions, devices, and the أجهزتي page

**Files:** `apps/api/src/modules/sessions/*`, `apps/web/app/(app)/settings/devices/*`

- [ ] **Step 1:** Model `SessionDevice` per spec §6.7 (`userId`, `sessionId`, `deviceName`, `deviceType`, `ip`, `lastSeenAt`, `loggedInAt`, `revokedAt`).
- [ ] **Step 2:** Populate it on sign-in from the user agent. Do not use a fingerprinting library — parse the UA into a human label.
- [ ] **Step 3:** `GET /api/sessions` (own sessions only — add an IDOR test asserting user A cannot read user B's) and `DELETE /api/sessions/:id` with the same ownership check compiled into the query, not applied after the fetch.
- [ ] **Step 4:** The أجهزتي page lists devices with a revoke button and marks the current session.
- [ ] **Step 5: Verify:** log in from two browsers, revoke one from the other, confirm the revoked session is actually rejected on its next request.
- [ ] **Step 6: Commit.**

---

## Task 8: Route protection + security headers

**Files:** `apps/web/proxy.ts`, `apps/api/src/main.ts`

- [ ] **Step 1:** `proxy.ts` (NOT `middleware.ts` — deprecated in Next 16) redirects unauthenticated users away from `/dashboard`, `/onboarding`, `/settings`, and redirects authenticated-but-not-onboarded users to `/onboarding`. It runs on Node, so it can verify the session properly.
- [ ] **Step 2:** Add security headers: HSTS, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, restrictive `Permissions-Policy`.
- [ ] **Step 3: CSP as `Content-Security-Policy-Report-Only` first**, with a report endpoint. A strict CSP shipped blind will break the app. Apply the nonce-based policy only to authenticated routes via the matcher — nonces disable static optimization and PPR, so the public catalog must keep a hash-based policy.
- [ ] **Step 4:** Add the CSRF guard: required custom header on state-changing methods plus `Origin`/`Sec-Fetch-Site` validation (S9).
- [ ] **Step 5: Verify** the redirect matrix by hand: anonymous → `/dashboard` redirects to login; logged-in-not-onboarded → `/dashboard` redirects to onboarding; fully onboarded → `/dashboard` renders.
- [ ] **Step 6: Commit.**

---

## Definition of done

- [ ] A new user can register, log in, complete onboarding, and reach a dashboard — verified in a browser, not inferred.
- [ ] Unknown-email and wrong-password responses are byte-identical.
- [ ] The year-1-has-no-track constraint is enforced by Postgres, proven by a rejected insert.
- [ ] Submitting another user's id or `role: 'admin'` to the onboarding endpoint is rejected.
- [ ] User A cannot read or revoke user B's sessions.
- [ ] Session cookie is `HttpOnly` + `Secure` + `SameSite=Strict` with the `__Host-` prefix, read from devtools.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` green across all packages.
- [ ] Apple Sign In is wired but explicitly reported as **untested pending an HTTPS domain**.

## Deliberately not in Plan 2

Courses, lessons, video player, quizzes, the admin dashboard, email verification delivery, SMS OTP, the parent dashboard, and Redis-backed throttler storage. Plans 3–7.
