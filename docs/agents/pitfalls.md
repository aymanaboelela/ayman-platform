# Pitfalls: read before writing code

Each entry is a trap that has already cost real time on this repo. Most of them
pass typecheck, lint and tests, and still break production.

---

## Domain and business rules

**Enrollment is not access.** Nothing ever writes `EnrollmentStatus.expired`, so a
lapsed student's enrollment stays `active` forever. Access lives in `AccessGrant`
(`revoked_at`, `valid_from`, `valid_until`). To answer "may this student open it", read
the grant or `accessActive` from `GET /api/enrollments`, never `status`. The shared
predicate is `apps/api/src/modules/entitlement/grant-liveness.ts`.

**Scope lists that forget `course_month`.** Older filters say `in ('course','term')` and
silently drop monthly subscribers. Before trusting any subscription count or guard, run
`grep -rn "'course', 'term'" apps/api/src | grep -v course_month`. Keep `platform` and
`subject_teacher` out on purpose.

**Unlock codes with `section`/`lesson` scope.** These are deliberately excluded from
`courseAccessScopes`. Redeeming a code creates an Enrollment, which would normally open
the whole course; only `EntitlementService.resolveContentAccess` (`codeOnly`) stops that.
Every new lesson, quiz or homework door must go through
`LessonAccessService.requireEntitled` (or `LessonGateService` for padlocks).

**A month purchase is reached through the UI.** When "students can't buy X" is reported,
it often means there is no entry point (`MonthOfferCard`,
`/courses/:slug/subscribe?month=a,b`), not that a gate is wrong. A published lesson with
no month tag is locked for every monthly subscriber. `LessonService.create` inherits the
nearest tagged neighbour's month.

**Only a refund moves money.** Cancelling a subscription or deleting a book order only
changes access. Revenue drops only through an `app.refunds` row, which targets exactly
one `submission_id` or `book_order_id`, is booked on its own `occurred_on`, and is never
deducted automatically.

**Book revenue has one definition:** `BOOK_REVENUE_WHERE` in
`modules/book-orders/book-revenue.ts`. `unit_cost_cents` is frozen at order time. Fix
income discrepancies on the revenue side, never as an expense row.
`src/scripts/finance-reconcile.ts` has never run and its guards are stale, so do not run it.

**The catalog doesn't filter by year.** `year` is a card label, and
`student_profiles.year` is nullable. Use `courses.emphasis` and `emphasis_note`. Don't add
a year filter without the owner.

**Quizzes are lessons.** A quiz goes on its own `kind:'quiz'` lesson right after its
lecture. To move one, use `PATCH /api/admin/quizzes/:quizId/lesson`. **Never rebuild a
quiz**: `quiz_attempts.quiz_id` is the attempt's only link to the paper. A published quiz
can't be deleted once anyone has sat it (409), so build it unpublished and publish last.

**Quizzes never gate the chain.** Progression counts lectures only. Four places count
lessons (`lessonCount`, `CourseProgressService.recalculate`, `path.service`,
`dashboard.service`) and all must use `kind: { not: 'quiz' }`. Changing the rule needs a
backfill of `enrollment.progress_percent`.

**Improvement sitting (تحسين)** is a second *paper* on the same quiz
(`QuizPaperSchema` `'original' | 'improvement'`, `settings.allowsImprovement`), not a
second quiz. The higher score wins. Abandoned attempts count toward the allowance.

**Monthly exams** have their own door, `/api/admin/exams` (`ScheduledExamsService`). Never
build one as a quiz lesson. Unpublish instead of deleting once it has been sat.

**Pending essay marks count as zero.** While `pendingOutOf > 0`, divide by
`gradedOutOf` (`quiz/grading/mark-split.ts`) and render no verdict. Answer keys are
revealed only after `gradedAt`.

**Homework (الواجب)** is its own feature (`LessonHomework`,
`PUT/DELETE /api/admin/lessons/:id/homework`): plain-text body, photo answers. It is
never a quiz.

**Exam paper shape (owner's preference).** Half MCQ, about a dozen of them deliberately
tricky. Half easy essay, as many single-part questions; never one essay with (أ)(ب)(ج)
parts. Essay model answers go in `settings.graderInfo`, never `generalFeedbackHtml`, which
leaks to students.

**Honor board photos are opt-in.** The board renders only
`student_profiles.honor_photo_key`. Never render `User.image` publicly; it may be a
minor's private photo.

**Centres appear because data exists**, not because of a flag. `student_number` is
public and `guardianCode` is a secret.

**Duplicate book orders are usually one payment.** Compare the SHA-256 of
`/api/admin/book-orders/<id>/screenshot`. For OCR digits use tesseract `eng` only.
`courses.book_title` is CTA copy, not a book name.

**InstaPay auto-approval learns the sender.** An admin approves the first transfer from
an unknown sender address by hand, which binds that address to the student; later
transfers settle automatically. Two ideas were already built and removed (piastre codes,
odd-pound codes), so don't re-propose them. The receiver must be an Android device.

**WhatsApp "sent" ≠ "delivered".** Delivery comes from receipts
(`marketing_recipients.delivered_at`). When everything shows one grey tick, look for nack
`463` in the `wa` logs.

**Torod courier.** Field names come from Torod's Swagger, not their PDF. The webhook is
unauthenticated, so it is routed as `/api/webhooks/torod/:token`.

---

## Backend / API

**Contracts subpath imports.** For runtime values, the API must import
`@ayman/contracts/<subpath>`, and you add the subpath to `exports` if it is missing. The
root barrel is `import type` only. Leaf modules in contracts import siblings by subpath
too.

**Every new route needs an authz row** in
`apps/api/src/test/authorization-matrix.int-spec.ts`. A new controller needs four edits:

1. Add it to the fixture `controllers`.
2. Add its service to `providers`.
3. Add MATRIX rows (401 anonymous, 403 student) or a `KNOWN_GAPS` entry.
4. Add it to the public list if it is `@Public()`.

A controller missing from the fixture is invisible to the matrix. The matrix runs only in
`pnpm test:integration`. better-auth plugin routes are raw middleware, so the matrix can't
see them.

**Empty env strings.** `""` skips Zod `.default()`. Use `optionalSecret` and
`optionalWithDefault(fallback)` in `config/env.ts`.

**`.partial()` keeps `.default()`.** A rename PATCH once unpublished a lecture. Use
`partialWithoutDefaults(shape)` from `@ayman/contracts/partial`.

**User ids are nanoids.** better-auth ids are 32-char strings; only seeded and e2e users
have UUIDs. Never use `z.uuid()` or `ParseUUIDPipe` on a user id. Test with an account
created through the real sign-up route.

**User email is nullable** (phone-only students). This is done with a better-auth
`additionalFields.email` override plus a hook pair. Don't `GROUP BY email`.

**Phone numbers.** They are stored in E.164 and UNIQUE. better-auth's phone plugin never
normalises them; that happens in `createAuthBeforeHook`. When routing between phone and
email, test for `@` first.

**Sign-up vs sign-in errors.** Sign-up names the duplicate (`PHONE_ALREADY_REGISTERED`).
Sign-in stays generic.

**Login lock is per identifier kind.** The `phone:` and `email:` buckets are separate.
`StudentsService.setPassword` clears both.

**Never sleep server-side on unauthenticated paths.** The old exponential login delay held
a socket for each failed attempt, which made it a DoS tool. Return 429 with `Retry-After`
immediately.

**Throttler.** A bare `@SkipThrottle()` skips nothing, because there is no `default`
bucket. Name the buckets.

**`as never` stubs hide renames.** After renaming a service method, grep `apps/api/src`
for the old name and run each touched spec file alone. A crashed jest worker reads as
"suite failed to run" with an unrelated stack.

**`audit_log`** is INSERT-only. Write it only through `AuditService.record` or `recordTx`
(inside transactions). Seed audit rows freely and never delete them (error 42501). To ask
"was this ever banned/changed", use `EXISTS` over `(resource_type, resource_id)`.

**Ordering.** Use `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]`. Without the id
tiebreak, pagination duplicates or drops rows.

**Timestamps.** `z.coerce.date()` reads a naive string in the container's timezone, so
send `…Z`. Cairo-day helpers already exist in `analytics-shared.ts`; a bare
`AT TIME ZONE` on `timestamp(3)` is wrong.

**Redis fails in two opposite ways, on purpose.** The throttler fails closed; the Next
cache handler fails open. Choose explicitly for any new consumer.

**`fs.rm` on a volume mount point deletes nothing** (EBUSY is swallowed). Delete the
contents entry by entry, and never `.catch(() => undefined)` a recovery step.

**`MediaService.usage()`** only scans `site_settings` and `home_blocks.props`. A new table
holding asset ids is invisible to it, and `destroy()` deletes the bytes anyway.

**New admin screen traps:**
- `perPage` must be one of `PAGE_SIZES = [10,20,50,100]`; anything else is a 400.
- A `'use server'` file may export only async functions.
- A backtick inside `Prisma.sql\`…\``, even in a SQL comment, closes the template.

**Grep before you build.** These already exist:
- avatars: `resolveAvatarSrc`, `POST /api/me/profile/avatar`
- ranking: `StudentAnalyticsService.list`
- the asset picker: `asset-picker.tsx`, `media-key-field.tsx`
- cities: static, in `packages/contracts/src/cities.ts`

The backend is usually ahead of the admin UI. Look for a hardcoded `null` in the server
action.

---

## Frontend / Next

**`cacheComponents` hides segments instead of unmounting them.** Leaving a route keeps
its DOM inside `<Activity>`, so effects re-run on the same nodes.
- Re-sync imperative state at effect setup.
- Pause videos, rAF loops and observers in teardown.
- A WebGL canvas whose context was lost returns the same dead, *opaque* context.
- Destroy resources only on a real unmount (`queueMicrotask` + `isConnected`).
- Keep decorative full-viewport layers below the nav (z ≤ 30).
- To check a "blank page", sample rendered pixels; `elementFromPoint` sees through
  `pointer-events: none`.

**Hot pages must not use a bare `apiGet` for reference data.** It runs live on every
render, shares one rate-limit identity, and throws on 429, which produces a 500 with an
opaque digest. Wrap the call in `'use cache'`, with the `try` inside the cached body
(`lib/taxonomy.ts`).

**`next build` has no API.** `'use cache'` readers bake empty fallbacks at build time. A
setting that decides whether a page or feature *exists* must be read uncached
(`getWhatsappChannelFresh()` pattern), but only on cold paths.

**Checkout reads live prices.** `SubscribePanel` fetches the catalog and public settings in
the browser on open; its props are only a `cached*` fallback.

**API writes skip Next revalidation.** Only web server actions call `updateTag`. After a
curl write, the public catalog stays stale for hours. Priced course pages never list
lesson titles to unsubscribed visitors, and that is intended, not stale.

**No uploads through Server Actions.** The 1 MB body cap fails silently. Use
`lib/upload-client.ts`, and test with files over 1 MB.

**`'server-only'` is the only real guard.** A comment saying "server only" proves nothing;
DOMPurify shipped to the client for months. Verify with
`grep -rl <lib> apps/web/.next/static/chunks/`.

**Turbopack:**
- Side effects in a re-export-only module never run.
- Module ids are path-derived, so adding an export to an existing client module can break
  tabs left open across a deploy. Put new exports in new modules.
- A `TypeError` at module evaluation is a deploy artefact first.

**Route params differ by caller.** `generateMetadata` gets the param decoded; the page gets
it percent-encoded. Decode before you encode (`lib/news.ts` `newsPostPath`).

**`router.refresh()`.** A browser-side write rendered by another route needs it. Quiz
attempt pages use `unstable_dynamicStaleTime = 0` instead. Never set `staleTimes.static`.

**Permissions-Policy** in `proxy.ts` denies the camera, microphone and similar APIs
everywhere except `/admin`. A new feature that uses one must add it in the same PR;
otherwise it fails as if the user had refused the prompt.

**WebKit `history` limit.** More than 100 `pushState` calls in 10 s throw `SecurityError`.
Wrap history calls made inside effects (`packages/ui/src/hooks/use-back-dismiss.ts`).
"Broken on phone, fine on laptop" usually means a WebKit-only limit.

**next/font eats Arabic.** Set `adjustFontFallback: false` on any `localFont` without
Arabic glyphs.

**Radix modals unstick the shell** because of `html{overflow-x:clip}`. Dropdowns default
to `modal={false}`, and new overlays without a backdrop need the same.

**Layout:**
- In `(app)` and `(admin)`, content width is the viewport minus `--rail-w` (296 px), so
  choose breakpoints about one Tailwind step later than looks right.
- A `truncate`/nowrap item inside an `auto` grid track widens the whole page; add
  `min-w-0`.
- Never name hand-written classes after Tailwind utilities.

**Dark mode.** An accent at low alpha turns brown over navy. Define washes as local custom
properties and swap them under both dark selectors.

**Toasts.** Toast only when `document.visibilityState === 'visible'`, and give recurring
toasts a stable `id`. A hidden admin tab once grew until it crashed.

**Structured data** (JSON-LD, markdown twins, `llms.txt`) must say exactly what the page
shows, no more and no less. The GEO layer is complete; audit it for falsehoods, not gaps.

**Measuring animation.** Use a production build, a foregrounded tab and a headed browser.
Headless, occluded and `next dev` runs all fake lag. For the `#years` dragon, every state
cue must use the same `onStage()` predicate, and you cancel `requestVideoFrameCallback`
with `cancelVideoFrameCallback`.

**YouTube player.** The IFrame API script can be silently blocked, so keep both watchdogs
and the plain-embed fallback. `controls:0` still draws YouTube UI. Keyboard handling must
not depend on focus being inside the iframe.

---

## Video pipeline

- **Direct upload is the live path.** It is a real encode: one at a time, `nice`,
  `threads: 2`, `UPLOAD_CRF = 23`, `-preset medium`. Don't parallelise it.
- The YouTube mirror (remux) is blocked on the VPS by YouTube's bot check.
- `master.m3u8` is rewritten from measured segment sizes (CRF otherwise advertises the
  ceiling bandwidth). Keep that step.
- New uploads are **AES-128 MPEG-TS**. The key is HMAC-derived from `BETTER_AUTH_SECRET`,
  so **rotating that secret breaks every encrypted lecture**.
- The video origin must be in both `media-src` and `connect-src`, plus `blob:`.
- S3 presigning needs `forcePathStyle: true`.
- The bucket needs CORS `ExposeHeaders: ETag` and a rule that aborts incomplete multipart
  uploads.
- `NEXT_PUBLIC_VIDEO_ORIGIN` is runtime-only, so get playlist URLs from a server action.
- Mirror env vars: set all five or none.
- A 24 fps source is smooth only at 24/12/8/6 fps. Measure judder with ffmpeg before
  touching player code.

---

## Testing

- **Run `pnpm test` from the root** (turbo). Contracts, ui and config have suites that CI
  runs.
- **Local DB lies:**
  - The audit chain is broken, so two audit specs are red locally.
  - Full-suite contention: re-run the failing spec alone.
  - Unapplied migrations: run `prisma migrate status`.
  - Postgres may be dead: run `pg_isready`; a stale `postmaster.pid` blocks restart.
  - Parallel suites fill the disk (error `53100`).
  - Thousands of fixture admins inflate every notify.
- **Prisma errors.** An enum-value type error means a stale client: run `prisma generate`.
  "Column does not exist" means the DB is behind.
- **Applying a migration by hand.** Use `DIRECT_DATABASE_URL` (owner role) and strip
  `?schema=app` for psql. Then run `prisma migrate resolve --applied <name>`.
- **Spec teardown order:** course → conversation → notification → user (CHECK
  `conversations_outreach_has_owner`). Never delete `audit_log`.
- **E2E gates must not name skeleton classes.** `loading.tsx` renders `.dash-hero` too, so
  gate on child elements only the real component renders. Use `expect.poll`, not a fixed
  wait.
- **Local e2e:**
  - Set `CI=1`, run `pnpm build` first, and free ports 3200 and 3300.
  - Kill servers by listener (`lsof -iTCP:<port> -sTCP:LISTEN`).
  - `next dev` doesn't pick up contracts edits; restart it.
- **Assert the effect, not the mechanism.** CSP host lists, CSV quoting, `@SkipThrottle`
  and throttler identity were all inert while their tests stayed green.
- **Report-only CSP proves nothing.** Check the live response headers and the browser
  console before calling CSP a security boundary.
- **Fresh worktree:**
  - Copy `.env` and `apps/api/.env`, then run `prisma generate`.
  - A borrowed `node_modules` may resolve `@ayman/*` to another checkout.
  - Turbopack refuses a symlinked `node_modules`.
- **Don't trust `npm view pkg@range`.** It lists versions without resolving them.

---

## Security rules to keep

- Phone OTP routes stay closed (`OTP_PATHS_WITHOUT_DELIVERY`) until `sendOTP` actually
  delivers.
- Client IP = `cf-connecting-ip` (forwarded by `lib/client-ip.ts`). Never key on
  `request.ip`. IPv6 is bucketed to /64.
- Staff assistants share the `owner` role with deny rows. Any action on a staff account
  must pass `refuseIfOutranked` or the subset check in `roles.controller.writeUser`.
- Turnstile keys are both or neither, per stack.
- HTML stripping must not eat math. Use `MARKUP` in `contracts/quiz/rich-text.ts`, not
  `/<[^>]*>/g`.
- Free vs paid must never be misrepresented in either direction.
- Never use a password in the Dokploy login form while the panel is unhealthy. It falls
  back to a GET and puts the password in the URL.

---

## Content and copy

- **Landing copy is in the DB** (`app.home_blocks`). To change it live, write a migration
  with `REPLACE(props::text, '"old"', '"new"')`, matching the JSON quotes. Run it twice
  inside `BEGIN…ROLLBACK`; the second run must report `UPDATE 0`.
- **Seed data is the opposite**: the file wins on every boot.
- **No gendered address** on student *and* admin screens.
- **Textbook content:** quote the ministry book verbatim first and keep any paraphrase
  separate. In lecture decks, «المحاضرة N» means year 2 unless told otherwise.
- **Question-bank books map to lectures by order** (`book-lesson-links.ts`). Adding or
  deleting a lesson shifts every later mapping.
