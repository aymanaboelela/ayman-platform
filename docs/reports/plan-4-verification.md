# Plan 4 — Course Player & Progress: end-to-end verification

Recorded by hand, driving a real browser (chrome-devtools MCP) plus `psql` and `curl`, against
`apps/api` freshly built and run on port **3302** (ports 3300/3301 were already held by
pre-existing `dist/main` processes not started by this session — a third instance was started per
the task's own instructions rather than killing a process that wasn't mine) and `apps/web` on port
**3200** with `API_ORIGIN` pointed at 3302. Both processes were killed at the end of this session.

Every line below is an observation, not an expectation — where something did not work as
specified, that is called out explicitly, including one real bug found and fixed during this pass.

## 1. Enrol, open a lesson, the player renders

Registered `verify-plan4@example.com` through the real `/register` → `/onboarding` flow (بكالوريا،
الصف الثاني، مسار الهندسة وعلوم الحاسب، البرمجة وعلوم الحاسب), landed on `/dashboard` showing the
correctly designed empty states ("لسه مش مشترك في أي كورس", "لسه مفيش نتائج"). Enrolled in the one
pre-existing published course, **أساسيات البرمجة بالبايثون** (`python-basics`), via
`POST /api/courses/:courseId/enroll` (201) called from the browser (Plan 3's endpoint; Plan 4 has
no enrol UI of its own).

Opened `/courses/python-basics/lessons/<video-lesson-id>`. Observed:
- The player renders: title, breadcrumb eyebrow "09 / المشغّل", the RTL-native outline sidebar, the
  manual finish button, and the video facade with the poster image.
- **The outline sidebar renders on the visual left, the video content on the visual right** — i.e.
  the content column starts at the inline start (right, in `dir=rtl`) and the outline sits after it
  — confirmed in a screenshot at 1440×900. This is RTL-native, not a mirrored LTR layout.
- The poster image loaded from `https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg` — the
  `youTubeThumbnailUrl()` fallback (Task 7) firing correctly because this lesson's `posterKey` is
  unset; no request to `i.ytimg.com` would have happened had a real poster been uploaded.

## 2. Lazy loading and CLS

- **Network panel, before pressing play:** zero requests to any `youtube.com` or
  `youtube-nocookie.com` host. Confirmed on two separate fresh loads.
- **After pressing the facade's play button:** the YouTube IFrame API script loads, then a
  `youtube-nocookie.com/embed/...` iframe is injected directly into the already-reserved
  `aspect-video` box.
- **Measured CLS (Performance trace, `performance_start_trace`/`performance_stop_trace`, reload +
  play click both captured in one recording):**

  ```
  CLS: 0.00, event ts 58761729194
  ```

  The `CLSCulprits` insight was queried explicitly rather than trusting the rounded top-line number.
  It reports one real (tiny) shift cluster:

  ```
  score: 0.0003, cause: a font swap (ibm_plex_mono_latin_400/600 loading over the network)
  ```

  **This is not the video box.** It is a pre-existing, unrelated mono-webfont swap from Plan 1's
  font loading, affecting the `mono`/`eyebrow` text elsewhere on the page. Rounded to two decimals
  it reports as the `0.00` Chrome itself surfaces. Zero shift is attributable to the reserved
  `aspect-video` box or to the iframe's injection on the play click — that box measured at its
  final size on every frame of the recording, both before and after the click.
- LCP 473 ms, INP 104 ms on the same trace (not requested, recorded for completeness).

## 3. Heartbeats: interval, shape, and the anti-scrub proof

**Interval and shape.** With the video actually playing (clicked the real facade, then the real
YouTube player's own play button inside the iframe), the Network panel showed
`POST /api/lessons/:id/heartbeat` firing roughly every 10 seconds. One captured request body,
verbatim:

```
Request:  {"position":66,"delta":10}
Response: {"progress":{"state":"in_progress","completion":0.2233,"watchedSeconds":67,
           "maxPositionSeconds":66,...},"justCompleted":false,"courseProgressPercent":0}
```

No heartbeat body ever contains anything but `{position, delta}` — confirmed by inspecting the
actual wire request in DevTools, not by reading the client source.

**The anti-scrub proof, end to end, in the real browser session.** Two complementary experiments:

1. **Seek via the real YouTube player, then keep playing.** Called the IFrame API's own
   `postMessage({event:'command', func:'seekTo', args:[19, true]})` against the live embedded
   player (the exact mechanism `YT.Player.seekTo()` uses internally — not a bypass of anything the
   real player API does), immediately after starting playback of a lesson whose stored duration was
   temporarily set to 20 s for a fast, deterministic test. Because the video kept *playing* after
   the seek, genuine watch time continued to accrue and the lesson correctly auto-completed ~14
   real seconds later — this demonstrates the watched-time gate is what actually gates completion,
   not the position number alone.
2. **The isolating case — scrub, then stop, in the same second, via the real network path.**
   Reset progress, called `POST /api/lessons/:id/open` (sets `first_opened_at` to "now"), then
   *immediately* called `POST /api/lessons/:id/heartbeat` with `{"position":19,"delta":15}` — a
   claimed 15-second delta the instant after opening, i.e. exactly what a scrubbed-to-the-end drag
   looks like over the wire. Response, verbatim:

   ```json
   {"progress":{"state":"in_progress","completion":0.1,"watchedSeconds":2,
     "maxPositionSeconds":19,"completedAt":null,"completedVia":null},
    "justCompleted":false,"courseProgressPercent":50}
   ```

   Database row immediately after:

   ```
    watched_seconds | max_position_seconds | completion |    state    | completed_via
   -----------------+----------------------+------------+-------------+---------------
                  2 |                   19 |     0.1000 | in_progress |
   ```

   **A high `max_position_seconds` (19, at the 95% gate), a near-zero `watched_seconds` (2, clamped
   to the server's own wall-clock grace window), `state = in_progress`, `completed_via = NULL`.**
   The claimed 15-second delta bought nothing beyond the 2-second grace constant. This is the
   textbook anti-scrub proof, verified against the real running server through the real
   cookie/CSRF/session path, not a unit test double.
3. **Then the manual button, on the SAME still-incomplete lesson.** Reloaded the page (UI still
   showed "أنهيت الدرس · التالي", not "تم" — confirming the client faithfully mirrors the server's
   "not complete" state rather than any client-side guess), clicked it. Result:

   ```
    watched_seconds | max_position_seconds | completion |   state   | completed_via
   -----------------+----------------------+------------+-----------+---------------
                  2 |                   19 |     1.0000 | completed | manual
   ```

   Completed instantly regardless of the near-zero watch time — the manual path is independent of
   watch progress, and `completed_via = 'manual'` is distinguishable from `'auto'`.
4. **`completed_via = 'dwell'` also observed**, unprompted: the course's text lesson
   auto-completed via the 5-second dwell timer while it was open during unrelated investigation —
   `SELECT completed_via FROM lesson_progress` showed `dwell` with `watched_seconds = 0`,
   `max_position_seconds = 0`, confirming the third completion source fires independently of video
   playback signals entirely.

## 4. A real bug found and fixed during this pass

`POST /api/lessons/:id/heartbeat` **500'd** the first time a heartbeat was sent against a lesson
that had already been completed via the manual button (or dwell). Root cause, confirmed from the
Postgres error surfaced through the API log:

```
Database error. Code: 23514. Message: new row for relation "lesson_progress" violates check
constraint "lesson_progress_completed_is_full"
```

`heartbeat.service.ts`'s `update` branch recomputed `completion` via `videoCompletionFraction(snapshot)`
from *that heartbeat's own* watched/position values on every call, including when the row was
already `completed_at IS NOT NULL` from a manual or dwell completion whose watched/position values
never came anywhere near the auto-complete thresholds (by design — that's the whole point of those
two completion sources). The recomputed fraction landed below 1 while `completed_at` stayed set,
violating the CHECK constraint that a completed row's `completion` must equal 1. This is a live,
reachable bug: a student reopening an already-finished video lesson and pressing play sends
ordinary heartbeats, which would 500 every time.

**Fix:** `completion` is now pinned to `1` whenever `isComplete` is true (i.e. `wasComplete ||
justCompleted`), never re-derived from the current snapshot once a lesson is already done. Added a
regression test (`heartbeat.service.spec.ts`, "never regresses completion below 1 on a heartbeat
after a manual/dwell completion") that reproduces the exact scenario and asserts the row stays
`completion = 1`, `completed_via = 'manual'`. Re-verified against the live server after rebuilding:
the previously-500ing request now returns 201 with the completed state intact.

This fix lives in `apps/api/src/modules/progress/heartbeat.service.ts` (a Task 5 file) and its spec
— outside Task 12's own file list, but committed alongside Task 12's changes since it was found and
is required by this task's own verification pass.

## 5. Authorization matrix — every cell, actual status codes

Four identities: anonymous (no cookie), a fresh student never enrolled in `python-basics`
(`verify-notenrolled@example.com`), the enrolled student from §1, and a fresh admin
(`verify-admin@example.com`, promoted via `UPDATE users SET role='admin'` — no admin-signup flow
exists yet, same precedent as Plan 3's own verification) who was **also enrolled** in the course
before being tested.

| Route | anonymous | student, not enrolled | student, enrolled | admin (enrolled) |
|---|---|---|---|---|
| `GET /api/courses/:slug/outline` | 401 | 404 | 200 | 200 |
| `GET /api/lessons/:id/player` | 401 | 404 | 200 | 200 |
| `POST /api/lessons/:id/open` | 401 | 404 | 201 | 201 |
| `POST /api/lessons/:id/heartbeat` | 401 | 404 | 201 | 201 |
| `POST /api/lessons/:id/dwell` (called on a VIDEO lesson) | 401 | 404 | 400 | — |
| `POST /api/lessons/:id/dwell` (called on a TEXT lesson) | — | — | 201 | — |
| `POST /api/lessons/:id/complete` | 401 | 404 | 201 | 201 |
| `GET /api/lessons/:id/attachments/:aid` | 401 | 404 | 302 | 302 |
| `GET /api/me/dashboard` | 401 | 200 (empty) | 200 | 200 |
| `POST /api/courses/:slug/enroll` | 401 | 201 | 201 (idempotent) | 201 |

**Not one cell is 403.** The 400 on dwell-against-a-video-lesson is `lesson-progress.service.ts`
correctly rejecting dwell completion for a lesson kind it doesn't apply to (video lessons complete
via the heartbeat/auto path or the manual button, never dwell) — an explicitly allowed outcome per
this task's own matrix ("200/400").

**One nuance worth recording precisely.** `admin` holding the `'*'` permission wildcard is a
**permission** fact (the guard lets every admin request through); it is **not** an ownership fact.
`PlayerService.outline`/`LessonAccessService.require` compile ownership into the query via a real
`Enrollment` row regardless of role — an admin who has never enrolled in a course gets the same 404
a non-enrolled student gets. Verified directly: before enrolling the admin test account, every one
of its GETs against the course/lesson also returned 404; after enrolling it (the same
`enroll` endpoint any student uses), they became 200. This matches Global Constraint 9 exactly
("ownership is compiled into the query") and is not a bug — it is the deliberate absence of an
admin ownership bypass anywhere in Plan 4's services. No such bypass exists in this codebase today.

## 6. Light / dark mode, no shadows

Toggled `data-theme` via `localStorage.setItem('theme', ...)` (the mechanism `THEME_SCRIPT`
reads) and reloaded — both `/dashboard` and the lesson player render correctly in each mode:
flat amber accent, no gradients, no glassmorphism, RTL-correct alignment, at a real 1440×900
viewport (see the two full-page screenshots taken during this session).

**Computed style, not visual guess:** `getComputedStyle(card).boxShadow` on all three visible
`Card` elements on `/dashboard` in dark mode:

```
rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, ... (×5 layers, all transparent)
```

i.e. effectively no shadow — `--shadow-sm`/`-md`/`-lg` all resolve to `0 0 0 transparent` under
`[data-theme='dark']` (`packages/ui/src/tokens/color.css`). No green appears anywhere in the player
or dashboard; the only `ok`/`err` tone usage is `RecentScores`' quiz-score badge, which had no data
to render in this session (empty state shown instead) — deliberately deferred to the quiz plan.

## 7. CSP — one real violation found and fixed

With the report-only policy active, pressing play the first time produced a genuine (not
false-positive) console violation:

```
Loading the script 'https://www.youtube.com/iframe_api' violates the following Content Security
Policy directive: "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
```

**Root cause:** `/courses/:slug/lessons/:lessonId` was not in `proxy.ts`'s `isProtectedRoute`, so it
received the **public** CSP policy (`buildPublicCsp`, no `'strict-dynamic'`) rather than the
**authenticated** one (`buildAuthenticatedCsp`, `'strict-dynamic'`). `loadYouTubeIframeApi()`'s own
design comment assumes `'strict-dynamic'` propagates trust to the injected `<script>` tag — true
only under the authenticated policy. Under the public policy's plain `'unsafe-inline'` script-src,
an external `src` is not covered at all, so the load was a genuine, observed violation.

**Fix:** added `PROTECTED_LESSON_PATTERN = /^\/courses\/[^/]+\/lessons(?:\/|$)/` to
`isProtectedRoute` in `apps/web/proxy.ts` — the course *player* now gets the authenticated,
nonce'd, `'strict-dynamic'` policy (and, as a direct consequence, anonymous visitors are now
redirected to `/login` for this route, matching every other protected surface — previously they
would render a `notFound()` page instead). `/courses` and `/courses/:slug` (the public catalog and
course detail page) remain unprotected; verified `isProtectedRoute('/courses/lessons-101')` stays
`false` so a course whose *slug* happens to contain "lessons" cannot false-match.

**Re-verified after the fix:** reloaded, pressed play — console showed **zero** CSP violations.
The only remaining console message across this entire session was one harmless, YouTube-internal
`postMessage` origin-mismatch warning emitted by the embedded widget itself (not our page, not our
CSP, not actionable from this codebase).

```
content-security-policy-report-only: script-src 'self' 'nonce-...' 'strict-dynamic'
  'sha256-...' 'unsafe-eval'; ... frame-src https://www.youtube-nocookie.com;
  img-src 'self' blob: data: https://i.ytimg.com; ...
```

`frame-src` and `img-src` already carried the `youtube-nocookie.com` / `i.ytimg.com` entries this
plan needs — added preemptively by Plan 2 Task 8. No other CSP directive changes were required.

## 8. Dashboard: continue-watching and real progress

After the completions in §3, `/dashboard` showed, verbatim (screenshot taken at 1440×900):

- **"أكمل من حيث وقفت"** naming **"شرح نظري"** — the exact last lesson opened (the text lesson,
  landed on via the manual-complete button's auto-navigation from the video lesson) — with a 100%
  progress bar and a working **"كمّل"** link back to that exact lesson.
- **"كورساتي"**: أساسيات البرمجة بالبايثون at 100%, **"2 درس مكتمل من 2"** — both published lessons
  counted, Western tabular digits.
- **"آخر النتائج"**: the designed empty state (no quiz attempts exist yet) — not a blank area.

`enrollment.lastLessonId` resume was also confirmed against an unpublish/republish cycle earlier at
the API layer (Task 8's own test suite covers this exact case — "drops a stale `last_lesson_id`
that now points at an unpublished lesson" — re-run and passing as part of the full suite below).

## 9. Full gates

```
pnpm lint       → 0 errors across all 5 packages (1 pre-existing, unrelated React-compiler warning
                   in onboarding-form.tsx)
pnpm typecheck  → clean across all 5 packages
pnpm test       → 466 tests passed, 0 failed
                   (config 1, contracts 120, ui 24, web 61, api 260)
```

Baseline going into this batch was 439 (api 241, contracts 120, web 53, ui 24, config 1). This
batch added 27: 19 in `apps/api` (11 player.service + 7 dashboard.service + 1 heartbeat regression),
8 in `apps/web` (6 format.test + 2 proxy.test).

Zero `ayman/no-physical-direction` lint errors, zero inline disables of the rule, anywhere in this
batch's new code.

## Not run / deliberately out of scope

- **Redis-backed throttler storage** — still in-memory (Plan 7 Task 9's concern); not exercised
  under multi-replica conditions.
- **A second concurrent browser tab** heartbeating the same lesson (the `SELECT … FOR UPDATE` row
  lock's actual contention behaviour) — not driven in this session; covered by
  `heartbeat.service.spec.ts`'s existing unit-level coverage only.
- **Playwright/axe** — Plan 7 Task 14's concern, not this plan's.
- **A real uploaded poster image** (`MEDIA_BASE_URL` origin) — no media library exists yet (Plan 6);
  the `i.ytimg.com` fallback path was exercised instead, which is the only path currently reachable.
