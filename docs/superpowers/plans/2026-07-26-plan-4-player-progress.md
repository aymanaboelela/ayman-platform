# Plan 4 — Course Player & Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An enrolled student opens a lesson, watches a YouTube-hosted video inside an RTL-native player shell with a course outline sidebar, and the server — not the client — decides when that lesson is complete. Ending state: a student dashboard showing continue-watching, enrolled courses with real percentages, and a `last_lesson_id` resume that lands them exactly where they stopped.

**Architecture:** The client is a reporter, never an authority. It posts `{position, delta}` heartbeats every 10 seconds to NestJS; NestJS accumulates watched time against its own wall clock, applies the two-threshold completion rule, and returns the authoritative progress row. A client-sent percentage is never accepted, and a client-sent `delta` can never exceed the real time that has elapsed since the previous heartbeat. Course progress is derived from completed lessons, recomputed only on a completion transition.

**Tech Stack:** NestJS 11.1.28 · Prisma 7.9.0 (`numeric(5,4)` completion, hand-written CHECK constraints, `SELECT … FOR UPDATE` inside an interactive transaction) · PostgreSQL 16.14 · Zod 4.4.3 shared rules · Next.js 16.2.11 App Router · React 19.2.8 · YouTube IFrame Player API (lazily loaded, `youtube-nocookie` host) · `@nestjs/throttler` 6.5.0

**Spec:** `docs/superpowers/specs/2026-07-25-ayman-platform-design.md` §5.3, §6.3, §6.6, §7 P1/P3/P4
**Research:** `docs/research/2026-07-25-research-brief.md` §5.3, §5.6
**Prerequisites:** Plan 1 (foundation), Plan 2 (auth + onboarding), Plan 3 (content model + admin CRUD + public catalog). See “Interfaces this plan expects from Plan 3” below — start Task 2 only once those models exist.

---

## Reconciliation notes (cross-plan pass, 2026-07-26)

Reconciled against Plans 3 and 5–7. The ownership register in
`docs/superpowers/plans/README.md` is normative. Decisions that changed **this** plan:

1. **`Enrollment`, `AccessGrant` and their enums are owned by Plan 3 Task 4**, which already ships
   them with the merged field set this plan needs (`source`, `progressPercent`, `lastLessonId`,
   `expiresAt`, `completedAt`, `EnrollmentSource`, `EnrollmentStatus` =
   `active|suspended|expired|revoked|completed`, `GrantSource`, `ScholarshipKind`). **Task 2 below
   declares only `LessonProgress`** plus the enums `LessonProgressState` and `CompletionSource`, and
   the `Enrollment.progress` / `Lesson.progress` back-relations. Names that changed from this plan's
   draft: `AccessSource` → `GrantSource`, `validTo` → `validUntil`, `activatedAt` → `enrolledAt`,
   `Course.accessGrants` → `Course.grants`.
2. **The enroll endpoint is Plan 3's.** `POST /api/courses/:courseId/enroll` (`enrollment:create`)
   and `GET /api/enrollments` (`enrollment:read`) live in Plan 3's `EntitlementModule`. Task 3 below
   no longer creates `POST /api/courses/:slug/enroll` or `GET /api/me/enrollments`; it **enriches**
   Plan 3's `GET /api/enrollments` response with `progressPercent`, `lastLessonId`,
   `completedLessons` and `totalLessons`, and adds only `progress:read` / `progress:write` to the
   student permission set. `enrollment:write` from this plan's draft is dropped in favour of Plan 3's
   `enrollment:create`.
3. **`apps/web/lib/api.ts` is owned by Plan 3 Task 10**, which ships `apiGetOrNull` and
   `apiSend(method, path, body, schema)`. Task 9 below **does not re-add** them; it adds only
   `apiPost` as a thin `apiSend`-based wrapper that additionally accepts `{ keepalive: true }` for
   the `visibilitychange` heartbeat flush.
4. **CSRF is one convention: header `x-csrf-token`, value read from the `__Host-csrf` cookie.**
   This plan's draft read a `csrf_token` cookie; that name is wrong and is corrected in Task 9.
5. **The quiz doorway href is `/quizzes/{lessonId}`**, not `/lessons/{lessonId}/quiz`. Plan 5 owns
   `app/(app)/quizzes/[lessonId]/**` and exports `quizHref(lessonId)` from
   `apps/web/lib/quiz-links.ts`. `QuizLesson` imports that helper rather than templating a path.
6. **Plan 3's course detail page is `app/(site)/courses/[slug]/page.tsx`**, in the `(site)` route
   group. This plan's player is `app/(app)/courses/[slug]/lessons/[lessonId]/page.tsx` in `(app)`.
   Different URLs, different layouts, no route collision.
7. **This plan must export `LessonProgressService.recordQuizResult()`** — Plan 5 Task 12 and Task 19
   call it and cannot ship without it. The exact signature is fixed in Task 6 below.
8. **`ThrottlerModule.forRoot` was created by Plan 1 Task 11.** Task 4 below rewrites it in place to
   add `getTracker: trackerFromRequest`. Plan 7 Task 9 rewrites it again to swap the storage for
   `@nest-lab/throttler-storage-redis` — it must **preserve** `getTracker` on all three named
   throttlers. Neither plan drops the other's change.
9. **Media URL resolution.** This plan owns `MEDIA_BASE_URL` (api-side env, validated in
   `env.ts`) and the `MEDIA_URL_RESOLVER` port at `apps/api/src/common/media/media-url.ts`. Plan 6
   Task 13 owns the upload pipeline (`MEDIA_STORAGE`, `sharp`, magic bytes) and the web-side
   `NEXT_PUBLIC_MEDIA_ORIGIN`. **The two env vars must resolve to the same origin**; Plan 6 adds a
   boot assertion. Attachment *storage* moves onto Plan 6's `MediaStorage` when it lands; the
   read-side port defined here does not change.
10. **Auditing is retrofitted by Plan 6 Task 3.** This plan does not call `AuditService`.

---

## Global Constraints

> **Canonical set.** These nine are identical in Plans 3–7 and are restated in
> `docs/superpowers/plans/README.md` § Global Constraints, which is normative: single origin / no
> CORS · ports 3200 web + 3300 api · RTL logical utilities only · no user-facing literals outside
> `packages/contracts` · extensionless relative imports · `@@schema("app")` on every Prisma model ·
> deny-by-default guards with `resource:action` permissions · no gradients / glass / emoji, radius
> ≤ 8px, no dark-mode shadows · **green and red reserved for quiz correctness**. Never
> `$queryRawUnsafe` / `$executeRawUnsafe` — the ESLint `no-restricted-syntax` rule hard-fails both.

Every task's requirements implicitly include this section. 1–10 are inherited and still binding; 11–16 are this plan's own.

1. **Single origin.** `apps/web` serves `/`, `apps/api` serves `/api`. **Never configure CORS.** The browser only ever calls `/api/...` on its own origin; the API host may appear only in `next.config.ts` and `apps/web/lib/api.ts`.
2. **Ports:** web `3200`, api `3300`. Port 3000 is occupied by an unrelated service on this machine.
3. **RTL is native, not mirrored.** Logical Tailwind utilities only — `ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`, `text-end`, `border-s-*`, `border-e-*`. The `ayman/no-physical-direction` ESLint rule is active and sees through `cn()`/`clsx()`, template literals, ternaries, arrays, object values **and module-level class constants**, so there is no way to smuggle `ml-4` past it. Directional *icons* flip through the `--dir-x` custom property added in Task 10, never through a hardcoded rotation.
4. **No user-facing string literals outside `packages/contracts`.** Every Arabic string in the player and dashboard is added to `packages/contracts/src/copy/ar.ts` in Task 1 and imported. `app/dev/*` pages are exempt.
5. **Extensionless relative imports.** `apps/api` uses `module: Preserve` + `moduleResolution: Bundler` with `noEmit: true`; SWC performs the real CommonJS emit. Leaf modules in `packages/contracts` that `apps/api` imports **as values** also need an explicit subpath in `packages/contracts/package.json#exports`, because Node's native ESM loader cannot resolve extensionless barrel re-exports at runtime. Task 1 adds `"./progress"`.
6. **All Prisma models get `@@schema("app")`**, and every new enum gets `@@map` to a snake_case type name so raw SQL can cast to a predictable identifier. Prisma 7 keeps connection strings out of `schema.prisma`. **`prisma generate` does not run automatically after `migrate`** — run it explicitly.
7. **NestJS guards are the sole authorization authority.** Permissions are `resource:action` strings checked against the role→permission map in `apps/api/src/auth/permissions.ts` — never role equality checks. Deny by default.
8. **Separate DTOs per role, `whitelist: true` + `forbidNonWhitelisted: true`.** The realistic attack in this plan is not privilege escalation, it is a student PATCHing `{completed: true}` or `{score: 100}` onto their *own* row. Every write DTO here is `.strict()`, and the manual-complete endpoint accepts an **empty body object** precisely so that `{completed: true}` is a 400, not a silent no-op.
9. **Ownership is compiled into the query**, never applied after the fetch. Every lesson read and every progress write resolves through `LessonAccessService.require(userId, lessonId)`, whose `where` clause contains `course: { enrollments: { some: { userId, status: 'active' } } }`. A lesson the caller is not enrolled in returns **404, never 403** — 403 is an existence oracle.
10. **Design:** no gradients, no glassmorphism, no emoji icons (inline SVG only), radius ≤ 8px on cards, no shadows in dark mode, amber accent used flat. **Green and red are reserved for quiz correctness** — a completed lesson is marked with the amber accent and a check glyph, *never* green.
11. **The client never decides completion.** `isVideoAutoComplete()` lives in `packages/contracts` and is called by the server as the authority; the client may call it only to mirror state optimistically, and must reconcile to whatever the server returned.
12. **The server accumulates.** `watched_seconds` grows by `min(claimed delta, wall-clock seconds since the previous heartbeat + 2)`. There is no code path in which a client-supplied number is added to the database unchecked.
13. **Auto-complete requires BOTH** `max_position_seconds >= 0.95 × duration` **AND** `watched_seconds >= 0.70 × duration`. Position alone is defeated by dragging the scrubber; there is a test that proves a scrub-to-end does not complete the lesson, and that test is not allowed to be deleted.
14. **A manual “أنهيت الدرس · التالي” button always exists**, on every lesson kind. It is what learners expect commercially. It is recorded as `completed_via = 'manual'` so analytics can always separate earned completions from claimed ones.
15. **CLS is 0 on the player.** The video box reserves its aspect ratio in CSS before any JavaScript runs; the YouTube IFrame API is loaded lazily on user intent and its iframe is injected *into* the already-reserved box.
16. **Commit after every task**, with explicit `git add` paths (never `git add -A` — the repo now contains generated Prisma output) and conventional messages.

---

## Interfaces this plan expects from Plan 3

Task 2 modifies `schema.prisma` in place and assumes these already exist. If any is missing or named differently, reconcile **before** writing the migration.

| Model / value | Fields this plan reads |
|---|---|
| `Course` | `id`, `slug`, `title`, `status` (`draft`\|`published`\|`archived`), `coverKey` |
| `CourseSection` | `id`, `courseId`, `title`, `position`, `isPublished`, relation `lessons` |
| `Lesson` | `id`, `sectionId`, `courseId`, `title`, `kind`, `position`, `isPublished`, `isFreePreview`, `estimatedSeconds` |
| `LessonKind` enum | `video` \| `quiz` \| `attachment` \| `text` |
| `LessonVideo` | `lessonId` (PK), `provider`, `externalId` (the 11-char YouTube id, never a URL), `durationSeconds`, `posterKey` |
| `LessonAttachment` | `id`, `lessonId`, `storageKey`, `filename`, `mime`, `sizeBytes`, `position` |
| `LessonText` | `lessonId` (PK), `bodyHtml` (already `sanitize-html`-ed on write) |
| `Enrollment` | **owned by Plan 3 Task 4** — `id`, `userId`, `courseId`, `source`, `status`, `enrolledAt`, `expiresAt`, `completedAt`, `progressPercent`, `lastLessonId` |
| `AccessGrant` | **owned by Plan 3 Task 4** — `scope`, `source` (`GrantSource`), `validFrom`, `validUntil`, `revokedAt` |
| `EntitlementService` | `resolveCourseAccess(userId, courseId): Promise<CourseAccess>`, `ensurePlatformGrant(userId): Promise<AccessGrantRow>` |
| endpoints | `POST /api/courses/:courseId/enroll`, `GET /api/enrollments` |
| `sanitizeRichText(html: string): string` | `apps/api/src/common/sanitize/rich-text.ts` |
| `apps/web/lib/api.ts` | `apiGet`, `apiGetOrNull`, `apiSend(method, path, body, schema)` |
| `apps/web/lib/cache-tags.ts` | `tag()`, `TAG_COURSES`, `courseTag()` |
| route | `apps/web/app/(site)/courses/[slug]/page.tsx` — the course detail page that links into the player |
| route group | `apps/web/app/(admin)/layout.tsx` — the one admin shell, with `<Toaster/>` mounted |

Plan 4 **adds** exactly one back-relation to those Plan 3 models: `Lesson.progress` (and
`Enrollment.progress`). `Course.enrollments`, `Course.grants` and `Lesson.resumedBy` are already
declared by Plan 3 — do not add them a second time or `prisma validate` fails on a duplicate field.

---

## File Structure

```
packages/contracts/
├─ src/progress.ts                    THE completion rule + every player/dashboard Zod schema.
│                                     Pure, dependency-free except zod. One source of truth
│                                     for thresholds, shared verbatim by server and client.
├─ src/progress.spec.ts               Proves scrub-to-end does not complete a lesson.
├─ src/copy/ar.ts                     + copy.player.*, copy.dashboard.*, copy.enrollment.*
└─ package.json                       + "./progress" subpath export (Global Constraint 5)

apps/api/
├─ prisma/schema.prisma               + Enrollment, LessonProgress, AccessGrant + 5 enums
├─ prisma/migrations/*/migration.sql  + hand-written CHECK constraints Prisma cannot express
├─ src/config/env.ts                  + MEDIA_BASE_URL
├─ src/auth/permissions.ts            + enrollment:*, progress:* for the student role
├─ src/common/throttle/request-identity.ts   session-keyed throttler tracker (not IP-keyed)
├─ src/common/media/media-url.ts             MEDIA_URL_RESOLVER port + env-backed default
└─ src/modules/
   ├─ enrollment/                     enroll, list own enrollments
   ├─ progress/
   │  ├─ lesson-access.service.ts     the single ownership gate; 404 not 403
   │  ├─ progress.mapper.ts           Prisma row → contract DTO (Decimal→number, Date→ISO)
   │  ├─ course-progress.service.ts   recompute enrollment.progressPercent on transitions
   │  ├─ heartbeat.service.ts         the accumulating write — the decisive file
   │  ├─ lesson-progress.service.ts   open / dwell / manual complete
   │  └─ progress.controller.ts       POST open|heartbeat|dwell|complete
   ├─ player/                         GET course outline, GET lesson payload, attachment download
   └─ dashboard/                      GET /api/me/dashboard + the SCORE_FEED port

apps/web/
├─ lib/api.ts                         + apiPost (CSRF header, keepalive support)
├─ lib/youtube.ts                     minimal YT typings + a once-only API loader promise
├─ lib/format.ts                      formatDuration / formatRemaining (Western digits, tabular)
├─ lib/progress-client.ts             typed POSTs for open|heartbeat|dwell|complete
├─ components/player/
│  ├─ course-outline.tsx              RTL-native sticky sidebar
│  ├─ lesson-progress-bar.tsx         inline-size bar, amber, never green
│  ├─ video-lesson.tsx                facade → lazy IFrame API → heartbeats
│  ├─ use-video-heartbeat.ts          the 1s tick / 10s flush / keepalive-on-hide hook
│  ├─ use-dwell-complete.ts           the 5000ms dwell for text + attachment lessons
│  ├─ text-lesson.tsx | attachment-lesson.tsx | quiz-lesson.tsx
│  ├─ lesson-nav.tsx                  prev/next + "أنهيت الدرس · التالي"
│  └─ icons.tsx                       inline SVG only — no emoji, direction-aware chevrons
├─ app/(app)/courses/[slug]/lessons/[lessonId]/{page,loading}.tsx
└─ app/(app)/dashboard/page.tsx       continue-watching · enrolled courses · recent scores

packages/ui/src/tokens/direction.css  --dir-x: 1|-1 and .icon-inline — how icons mirror
```

---

## Task 1: The completion rule and the shared contracts

Everything downstream depends on these numbers. They ship first, as pure functions with no I/O, so the rule is unit-testable in isolation and physically cannot drift between the server that enforces it and the client that displays it.

**Files:**
- Create: `packages/contracts/src/progress.ts`
- Create: `packages/contracts/src/progress.spec.ts`
- Modify: `packages/contracts/src/index.ts`, `packages/contracts/package.json`, `packages/contracts/src/copy/ar.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `isVideoAutoComplete(s: VideoProgressSnapshot): boolean`
  - `videoCompletionFraction(s: VideoProgressSnapshot): number` — 0..1, 4 decimals
  - `allowedHeartbeatSeconds(claimedDelta: number, elapsedSeconds: number): number`
  - Constants `VIDEO_POSITION_THRESHOLD = 0.95`, `VIDEO_WATCHED_THRESHOLD = 0.7`, `HEARTBEAT_INTERVAL_MS = 10_000`, `MAX_HEARTBEAT_DELTA_SECONDS = 15`, `HEARTBEAT_CLOCK_GRACE_SECONDS = 2`, `DWELL_COMPLETE_MS = 5_000`
  - Zod: `HeartbeatRequestSchema`, `HeartbeatResponseSchema`, `LessonProgressSchema`, `CourseOutlineSchema`, `LessonPlayerSchema`, `DashboardSchema`, `EnrollmentSchema` and their inferred types
  - `copy.player.*`, `copy.dashboard.*`, `copy.enrollment.*`

- [ ] **Step 1: Write the failing test**

Create `packages/contracts/src/progress.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  DWELL_COMPLETE_MS,
  HEARTBEAT_CLOCK_GRACE_SECONDS,
  MAX_HEARTBEAT_DELTA_SECONDS,
  VIDEO_POSITION_THRESHOLD,
  VIDEO_WATCHED_THRESHOLD,
  allowedHeartbeatSeconds,
  isVideoAutoComplete,
  videoCompletionFraction,
} from './progress';

const DURATION = 600; // a ten-minute lesson

describe('isVideoAutoComplete', () => {
  // THE test. If this ever goes green for the wrong reason, the whole
  // anti-scrub design is decorative. Do not delete it, do not weaken it.
  it('does NOT complete when the scrubber was dragged to the end', () => {
    expect(
      isVideoAutoComplete({
        durationSeconds: DURATION,
        maxPositionSeconds: DURATION, // dragged all the way to 10:00
        watchedSeconds: 4, // four seconds of actual playback
      }),
    ).toBe(false);
  });

  it('does NOT complete when the video was left playing but never seen to the end', () => {
    expect(
      isVideoAutoComplete({
        durationSeconds: DURATION,
        maxPositionSeconds: 500, // 83% — below the 95% position gate
        watchedSeconds: 500, // plenty of watch time
      }),
    ).toBe(false);
  });

  it('completes when both thresholds are met', () => {
    expect(
      isVideoAutoComplete({
        durationSeconds: DURATION,
        maxPositionSeconds: DURATION * VIDEO_POSITION_THRESHOLD,
        watchedSeconds: DURATION * VIDEO_WATCHED_THRESHOLD,
      }),
    ).toBe(true);
  });

  it('is exclusive one tick below either threshold', () => {
    const atPosition = DURATION * VIDEO_POSITION_THRESHOLD;
    const atWatched = DURATION * VIDEO_WATCHED_THRESHOLD;
    expect(
      isVideoAutoComplete({
        durationSeconds: DURATION,
        maxPositionSeconds: atPosition - 1,
        watchedSeconds: atWatched,
      }),
    ).toBe(false);
    expect(
      isVideoAutoComplete({
        durationSeconds: DURATION,
        maxPositionSeconds: atPosition,
        watchedSeconds: atWatched - 1,
      }),
    ).toBe(false);
  });

  it('never completes a video whose duration is unknown', () => {
    // A zero duration would make every threshold trivially satisfiable.
    expect(
      isVideoAutoComplete({ durationSeconds: 0, maxPositionSeconds: 0, watchedSeconds: 0 }),
    ).toBe(false);
  });
});

describe('videoCompletionFraction', () => {
  it('reports the watched fraction while the lesson is incomplete', () => {
    expect(
      videoCompletionFraction({
        durationSeconds: DURATION,
        maxPositionSeconds: 300,
        watchedSeconds: 300,
      }),
    ).toBe(0.5);
  });

  it('snaps to exactly 1 once the lesson auto-completes', () => {
    expect(
      videoCompletionFraction({
        durationSeconds: DURATION,
        maxPositionSeconds: DURATION,
        watchedSeconds: DURATION * VIDEO_WATCHED_THRESHOLD,
      }),
    ).toBe(1);
  });

  it('never exceeds 1 and never returns more than 4 decimals', () => {
    const value = videoCompletionFraction({
      durationSeconds: 7,
      maxPositionSeconds: 1,
      watchedSeconds: 1,
    });
    expect(value).toBeLessThanOrEqual(1);
    // numeric(5,4) — anything longer would be silently rounded by Postgres.
    expect(value.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
  });

  it('is 0 for an unknown duration rather than NaN or Infinity', () => {
    expect(
      videoCompletionFraction({ durationSeconds: 0, maxPositionSeconds: 99, watchedSeconds: 99 }),
    ).toBe(0);
  });
});

describe('allowedHeartbeatSeconds', () => {
  it('grants the claimed delta when real time actually elapsed', () => {
    expect(allowedHeartbeatSeconds(10, 10)).toBe(10);
  });

  it('refuses to credit more than the wall clock allows', () => {
    // A forged delta of 15s arriving 0s after the previous heartbeat can only
    // ever buy the grace window, never the claim.
    expect(allowedHeartbeatSeconds(15, 0)).toBe(HEARTBEAT_CLOCK_GRACE_SECONDS);
  });

  it('caps a single claim at MAX_HEARTBEAT_DELTA_SECONDS regardless of elapsed time', () => {
    // A tab suspended for an hour cannot come back and claim an hour.
    expect(allowedHeartbeatSeconds(3600, 3600)).toBe(MAX_HEARTBEAT_DELTA_SECONDS);
  });

  it('makes flooding strictly worse than honest watching', () => {
    // The route throttle allows 15 heartbeats per minute. Fired back-to-back
    // with zero elapsed time between them, they buy 15 * 2 = 30 seconds —
    // half of what one honest minute of playback yields.
    const flooded = Array.from({ length: 15 }, () => allowedHeartbeatSeconds(15, 0)).reduce(
      (total, seconds) => total + seconds,
      0,
    );
    expect(flooded).toBe(30);
    expect(flooded).toBeLessThan(60);
  });

  it('clamps negative and fractional inputs instead of trusting them', () => {
    expect(allowedHeartbeatSeconds(-50, 10)).toBe(0);
    expect(allowedHeartbeatSeconds(10, -50)).toBe(HEARTBEAT_CLOCK_GRACE_SECONDS);
    expect(allowedHeartbeatSeconds(9.9, 9.9)).toBe(9);
  });
});

describe('dwell constant', () => {
  it('is the 5000ms the spec fixes for text and attachment lessons', () => {
    expect(DWELL_COMPLETE_MS).toBe(5000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @ayman/contracts test progress
```
Expected: FAIL — `Failed to resolve import "./progress"`.

- [ ] **Step 3: Implement the rule**

Create `packages/contracts/src/progress.ts`:

```ts
import { z } from 'zod';

/* ────────────────────────────────────────────────────────────────────────
 * The completion rule.
 *
 * Auto-completion requires BOTH thresholds. Either one alone is trivially
 * defeated:
 *   • position only  → drag the scrubber to the end (Open edX's
 *     COMPLETION_VIDEO_COMPLETE_PERCENTAGE = 0.95 has exactly this hole)
 *   • watch-time only → leave the tab playing in the background and never
 *     look at it
 * Requiring both means the student must have reached the end AND spent most
 * of the runtime getting there.
 * ──────────────────────────────────────────────────────────────────────── */

export const VIDEO_POSITION_THRESHOLD = 0.95;
export const VIDEO_WATCHED_THRESHOLD = 0.7;

/** The client posts one heartbeat per 10s of playback. */
export const HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * Hard cap on what a single heartbeat may claim. 15 > 10 so a throttled
 * background tab can still report one late tick — and no more than one.
 */
export const MAX_HEARTBEAT_DELTA_SECONDS = 15;

/**
 * Slack added to the server-measured gap between heartbeats, absorbing
 * scheduling jitter and network latency. Deliberately tiny: it is the only
 * thing a flooder can actually harvest, and 15 requests/min × 2s = 30s is
 * strictly worse than the 60s an honest minute of playback yields.
 */
export const HEARTBEAT_CLOCK_GRACE_SECONDS = 2;

/** Text and attachment lessons complete after this much dwell on the page. */
export const DWELL_COMPLETE_MS = 5_000;

export interface VideoProgressSnapshot {
  durationSeconds: number;
  maxPositionSeconds: number;
  watchedSeconds: number;
}

/**
 * The authority. Called by the server on every heartbeat; the client may call
 * it only to mirror the expected outcome, and must reconcile to whatever the
 * server actually returned.
 */
export function isVideoAutoComplete(snapshot: VideoProgressSnapshot): boolean {
  // An unknown duration makes every ratio meaningless — and would make the
  // thresholds trivially satisfiable at 0. Such a lesson can only be finished
  // with the manual button.
  if (snapshot.durationSeconds <= 0) return false;

  const positionOk =
    snapshot.maxPositionSeconds >= VIDEO_POSITION_THRESHOLD * snapshot.durationSeconds;
  const watchedOk = snapshot.watchedSeconds >= VIDEO_WATCHED_THRESHOLD * snapshot.durationSeconds;

  return positionOk && watchedOk;
}

/**
 * 0..1 with at most 4 decimals, matching the `numeric(5,4)` column exactly so
 * what we write is what Postgres stores — no silent rounding surprises when
 * the value is read back and compared.
 */
export function videoCompletionFraction(snapshot: VideoProgressSnapshot): number {
  if (snapshot.durationSeconds <= 0) return 0;
  if (isVideoAutoComplete(snapshot)) return 1;

  const raw = snapshot.watchedSeconds / snapshot.durationSeconds;
  const clamped = Math.min(Math.max(raw, 0), 1);
  return Math.round(clamped * 10_000) / 10_000;
}

/**
 * How many seconds a heartbeat is allowed to add, given how much wall-clock
 * time the SERVER measured since the previous heartbeat on this row.
 *
 * This is what makes "the server accumulates" true rather than aspirational:
 * ten heartbeats fired inside the same second buy ten grace windows, not ten
 * deltas, and no sequence of requests can ever accumulate watch time faster
 * than time itself passes.
 */
export function allowedHeartbeatSeconds(claimedDelta: number, elapsedSeconds: number): number {
  const claimed = Math.min(
    Math.max(Math.floor(claimedDelta), 0),
    MAX_HEARTBEAT_DELTA_SECONDS,
  );
  const wallClock = Math.max(Math.floor(elapsedSeconds), 0) + HEARTBEAT_CLOCK_GRACE_SECONDS;
  return Math.min(claimed, wallClock);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @ayman/contracts test progress
```
Expected: PASS — 14 tests.

- [ ] **Step 5: Append the Zod schemas to `packages/contracts/src/progress.ts`**

```ts
/* ────────────────────────────────────────────────────────────────────────
 * Wire contracts. One schema, two consumers: NestJS validates requests with
 * it through `createZodDto`, and `apiGet`/`apiPost` parse responses with it.
 * ──────────────────────────────────────────────────────────────────────── */

export const LessonKindSchema = z.enum(['video', 'quiz', 'attachment', 'text']);

export const LessonProgressStateSchema = z.enum([
  'not_started',
  'in_progress',
  'completed',
  'passed',
  'failed',
]);

/**
 * How a lesson came to be complete. `auto` earned both video thresholds,
 * `dwell` sat on a text/attachment lesson for 5s, `manual` pressed the
 * button. Keeping them apart is the only way to answer "is our content
 * actually being watched?" — a single boolean would blend the three forever.
 */
export const CompletionSourceSchema = z.enum(['auto', 'manual', 'dwell']);

export const LessonProgressSchema = z.object({
  lessonId: z.string(),
  state: LessonProgressStateSchema,
  completion: z.number().min(0).max(1),
  watchedSeconds: z.number().int().min(0),
  maxPositionSeconds: z.number().int().min(0),
  openCount: z.number().int().min(0),
  completedAt: z.iso.datetime().nullable(),
  completedVia: CompletionSourceSchema.nullable(),
});

/**
 * `.strict()` so `{ completed: true }`, `{ completion: 1 }` or `{ score: 100 }`
 * are 400s, not silently-stripped fields (Global Constraint 8). `delta` is
 * capped at the schema level too — the wall-clock clamp in the service is the
 * real control, this is just the cheapest possible rejection.
 */
export const HeartbeatRequestSchema = z
  .object({
    position: z.number().int().min(0).max(86_400),
    delta: z.number().int().min(0).max(MAX_HEARTBEAT_DELTA_SECONDS),
  })
  .strict();

/** Deliberately empty and strict: the manual button carries no payload. */
export const EmptyBodySchema = z.object({}).strict();

export const HeartbeatResponseSchema = z.object({
  progress: LessonProgressSchema,
  /** Server-decided, this request only. The client mirrors it; it never computes it. */
  justCompleted: z.boolean(),
  courseProgressPercent: z.number().min(0).max(100),
});

export const EnrollmentSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  courseSlug: z.string(),
  // RECONCILED: must match Plan 3's canonical EnrollmentStatus exactly.
  status: z.enum(['active', 'suspended', 'expired', 'revoked', 'completed']),
  progressPercent: z.number().min(0).max(100),
  lastLessonId: z.string().nullable(),
  enrolledAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});

/* ── the player payloads ─────────────────────────────────────────────── */

export const OutlineLessonSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: LessonKindSchema,
  position: z.number().int(),
  estimatedSeconds: z.number().int().nullable(),
  isFreePreview: z.boolean(),
  state: LessonProgressStateSchema,
  completion: z.number().min(0).max(1),
});

export const OutlineSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  position: z.number().int(),
  lessons: z.array(OutlineLessonSchema),
});

export const CourseOutlineSchema = z.object({
  course: z.object({ id: z.string(), slug: z.string(), title: z.string() }),
  sections: z.array(OutlineSectionSchema),
  enrollmentId: z.string(),
  progressPercent: z.number().min(0).max(100),
  lastLessonId: z.string().nullable(),
  completedLessons: z.number().int().min(0),
  totalLessons: z.number().int().min(0),
});

export const PlayerAttachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mime: z.string(),
  sizeBytes: z.number().int().min(0),
  /**
   * Always a same-origin path on OUR api, never a storage URL. The download
   * route re-checks enrollment before redirecting, so a leaked storage key is
   * not by itself an access grant.
   */
  downloadPath: z.string().startsWith('/api/'),
});

export const PlayerVideoSchema = z.object({
  /** The 11-char id only — spec §7 P3. A URL here would reintroduce the SSRF class. */
  youtubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  durationSeconds: z.number().int().min(0),
  posterUrl: z.string().nullable(),
});

export const LessonNeighbourSchema = z
  .object({ id: z.string(), title: z.string(), kind: LessonKindSchema })
  .nullable();

export const LessonPlayerSchema = z.object({
  lesson: z.object({
    id: z.string(),
    courseId: z.string(),
    courseSlug: z.string(),
    courseTitle: z.string(),
    sectionTitle: z.string(),
    title: z.string(),
    kind: LessonKindSchema,
    estimatedSeconds: z.number().int().nullable(),
  }),
  video: PlayerVideoSchema.nullable(),
  text: z.object({ bodyHtml: z.string() }).nullable(),
  attachments: z.array(PlayerAttachmentSchema),
  progress: LessonProgressSchema,
  previous: LessonNeighbourSchema,
  next: LessonNeighbourSchema,
  /** False when the duration is unknown — the manual button is then the only path. */
  autoCompleteAvailable: z.boolean(),
});

/* ── the dashboard ───────────────────────────────────────────────────── */

export const ContinueWatchingSchema = z.object({
  courseId: z.string(),
  courseSlug: z.string(),
  courseTitle: z.string(),
  lessonId: z.string(),
  lessonTitle: z.string(),
  lessonKind: LessonKindSchema,
  progressPercent: z.number().min(0).max(100),
  /** 0 when the lesson is not a video or its duration is unknown. */
  remainingSeconds: z.number().int().min(0),
});

export const RecentScoreSchema = z.object({
  attemptId: z.string(),
  quizTitle: z.string(),
  courseSlug: z.string(),
  scorePercent: z.number().min(0).max(100),
  submittedAt: z.iso.datetime(),
});

export const EnrolledCourseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  progressPercent: z.number().min(0).max(100),
  completedLessons: z.number().int().min(0),
  totalLessons: z.number().int().min(0),
  lastLessonId: z.string().nullable(),
});

export const DashboardSchema = z.object({
  continueWatching: ContinueWatchingSchema.nullable(),
  enrolledCourses: z.array(EnrolledCourseSchema),
  recentScores: z.array(RecentScoreSchema),
});

export type LessonKind = z.infer<typeof LessonKindSchema>;
export type LessonProgressState = z.infer<typeof LessonProgressStateSchema>;
export type CompletionSource = z.infer<typeof CompletionSourceSchema>;
export type LessonProgressDto = z.infer<typeof LessonProgressSchema>;
export type HeartbeatRequest = z.infer<typeof HeartbeatRequestSchema>;
export type HeartbeatResponse = z.infer<typeof HeartbeatResponseSchema>;
export type EnrollmentDto = z.infer<typeof EnrollmentSchema>;
export type OutlineLesson = z.infer<typeof OutlineLessonSchema>;
export type OutlineSection = z.infer<typeof OutlineSectionSchema>;
export type CourseOutline = z.infer<typeof CourseOutlineSchema>;
export type PlayerAttachment = z.infer<typeof PlayerAttachmentSchema>;
export type PlayerVideo = z.infer<typeof PlayerVideoSchema>;
export type LessonNeighbour = z.infer<typeof LessonNeighbourSchema>;
export type LessonPlayer = z.infer<typeof LessonPlayerSchema>;
export type ContinueWatching = z.infer<typeof ContinueWatchingSchema>;
export type RecentScore = z.infer<typeof RecentScoreSchema>;
export type EnrolledCourse = z.infer<typeof EnrolledCourseSchema>;
export type Dashboard = z.infer<typeof DashboardSchema>;
```

- [ ] **Step 6: Export it from the barrel and add the subpath**

`packages/contracts/src/index.ts`:
```ts
// Extensionless relative imports are the repo convention. Turbopack (apps/web)
// cannot remap a `.js` specifier onto a `.ts` source file, so adding extensions
// here breaks the web build. apps/api resolves these via CommonJS/Node10.
export { copy, type Copy } from './copy/ar';
export * from './taxonomy';
export * from './onboarding';
export * from './progress';
```

`packages/contracts/package.json` — add the subpath alongside the existing ones. `progress.ts` imports only the bare `zod` specifier and has no relative imports of its own, so apps/api can import it directly and sidestep the barrel entirely (Global Constraint 5):
```json
  "exports": {
    ".": "./src/index.ts",
    "./copy": "./src/copy/ar.ts",
    "./onboarding": "./src/onboarding.ts",
    "./progress": "./src/progress.ts"
  },
```

- [ ] **Step 7: Add every Arabic string the player and dashboard will need**

In `packages/contracts/src/copy/ar.ts`, insert these keys into the `copy` object after `onboarding`. No component in Tasks 9–11 may contain an Arabic literal.

```ts
  player: {
    eyebrow: '09 / المشغّل',
    outline: 'محتوى الكورس',
    previous: 'الدرس السابق',
    next: 'الدرس التالي',
    markComplete: 'أنهيت الدرس · التالي',
    markCompleteFinal: 'أنهيت الدرس',
    marking: 'بنسجّل…',
    completed: 'تم',
    inProgress: 'جارٍ',
    notStarted: 'لسه',
    play: 'شغّل الفيديو',
    videoUnavailable: 'الفيديو مش متاح دلوقتي',
    attachments: 'الملفات المرفقة',
    download: 'تحميل',
    quizIntro: 'الدرس ده اختبار. ابدأ لما تكون جاهز.',
    quizCta: 'ابدأ الاختبار',
    courseProgress: 'تقدّمك في الكورس',
    lessonsCompleted: 'درس مكتمل من',
    autoCompleteHint: 'الدرس بيتحسب لوحده لما توصل لآخر الفيديو وتكون شُفت معظمه.',
    manualOnlyHint: 'مدة الفيديو مش متسجّلة، فاضغط «أنهيت الدرس» لما تخلّص.',
    saveFailed: 'مش قادرين نسجّل تقدّمك دلوقتي',
  },
  dashboard: {
    eyebrow: '01 / حسابي',
    title: 'حسابي',
    continueWatching: 'أكمل من حيث وقفت',
    continueCta: 'كمّل',
    remaining: 'باقي',
    myCourses: 'كورساتي',
    recentScores: 'آخر النتائج',
    noScoresYet: 'لسه مفيش نتائج. أول اختبار تخلّصه هيظهر هنا.',
    noCoursesYet: 'لسه مش مشترك في أي كورس.',
    browseCourses: 'اتفرّج على الكورسات',
  },
  enrollment: {
    enroll: 'اشترك في الكورس',
    enrolled: 'أنت مشترك',
    enrolling: 'بنشتركك…',
    startCourse: 'ابدأ الكورس',
  },
```

- [ ] **Step 8: Verify the gates and commit**

```bash
pnpm --filter @ayman/contracts test && pnpm --filter @ayman/contracts typecheck && pnpm --filter @ayman/contracts lint
```
Expected: all green.

```bash
git add packages/contracts/src/progress.ts packages/contracts/src/progress.spec.ts \
        packages/contracts/src/index.ts packages/contracts/src/copy/ar.ts \
        packages/contracts/package.json
git commit -m "feat(contracts): dual-threshold video completion rule and player/progress schemas"
```

---

## Task 2: Enrollment, progress and entitlement schema

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_enrollment_and_progress/migration.sql` (generated, then hand-edited)
- Create: `apps/api/src/modules/progress/progress-constraints.spec.ts`

**Interfaces:**
- Consumes: Plan 3's `Course`, `CourseSection`, `Lesson`, `LessonVideo`, `LessonAttachment`, `LessonText`.
- Produces: Prisma model `LessonProgress`; enums `LessonProgressState`, `CompletionSource`; back-relations `Enrollment.progress`, `Lesson.progress`.

> **RECONCILED — read before writing any Prisma.** Plan 3 Task 4 already declares
> `Enrollment`, `AccessGrant`, `EnrollmentStatus`, `EnrollmentSource`, `AccessScope`, `GrantSource`
> and `ScholarshipKind`, with the merged field set this plan needs. **Do not re-declare them** —
> `prisma validate` fails on a duplicate model, and a second `access_grants` migration would drop
> the first. Confirm they exist before starting:
>
> ```bash
> grep -n "model Enrollment\|model AccessGrant\|enum EnrollmentStatus\|enum GrantSource" apps/api/prisma/schema.prisma
> ```
> If any is missing, Plan 3 has not landed — stop and report, do not invent a parallel model.
>
> The `Enrollment`, `AccessGrant`, `EnrollmentSource`, `EnrollmentStatus`, `AccessScope`,
> `AccessSource` and `ScholarshipKind` blocks that follow in Steps 1–3 are **retained for reference
> only** and must NOT be pasted into the schema. Renames applied by the reconciliation:
> `AccessSource` → `GrantSource`, `validTo` → `validUntil`, `activatedAt` → `enrolledAt`,
> `Course.accessGrants` → `Course.grants`. Wherever this document later reads `activatedAt`, the
> column is `enrolledAt`.

- [ ] **Step 1: Add `LessonProgressState` and `CompletionSource` to `apps/api/prisma/schema.prisma`**

These two enums are the only new ones. The rest of this step's code block is reference material
(see the box above).

Every enum carries `@@map` so the Postgres type name is predictable and snake_case — the heartbeat service casts to `app.lesson_progress_state` in raw SQL, and guessing Prisma's default PascalCase type name at runtime is not something to leave to chance.

```prisma
enum EnrollmentSource {
  free
  manual
  purchase
  coupon
  code

  @@map("enrollment_source")
  @@schema("app")
}

enum EnrollmentStatus {
  active
  expired
  revoked
  completed

  @@map("enrollment_status")
  @@schema("app")
}

enum LessonProgressState {
  not_started
  in_progress
  completed
  passed
  failed

  @@map("lesson_progress_state")
  @@schema("app")
}

/// Keeps earned completions separable from claimed ones forever. A single
/// boolean would blend "watched 95% of the video" with "pressed the button
/// after 3 seconds" and there would be no way to unpick it later.
enum CompletionSource {
  auto
  manual
  dwell

  @@map("completion_source")
  @@schema("app")
}

enum AccessScope {
  platform
  course
  subject_teacher
  unassigned

  @@map("access_scope")
  @@schema("app")
}

enum AccessSource {
  free
  manual
  purchase
  coupon
  code
  scholarship

  @@map("access_source")
  @@schema("app")
}

enum ScholarshipKind {
  orphans
  financial
  twinz

  @@map("scholarship_kind")
  @@schema("app")
}
```

- [ ] **Step 2: Add `LessonProgress` — the ONE new model in this task**

`Enrollment` and `AccessGrant` below are reference-only (see the reconciliation box above); paste
only `LessonProgress`.

```prisma
/// §6.6. One row per (student, course). `progressPercent` is DERIVED —
/// completed published lessons ÷ published lessons × 100 — and is recomputed
/// only when a lesson's state transitions into or out of `completed`, never
/// on every heartbeat.
///
/// `status` deliberately stays `active` when a course is finished; only
/// `completedAt` is set. Flipping status to `completed` would drop the
/// enrollment out of every `status: 'active'` ownership filter in this plan,
/// i.e. finishing a course would revoke access to it.
model Enrollment {
  id              String           @id @default(uuid(7))
  userId          String           @map("user_id")
  courseId        String           @map("course_id")
  source          EnrollmentSource @default(free)
  status          EnrollmentStatus @default(active)
  activatedAt     DateTime         @default(now()) @map("activated_at")
  expiresAt       DateTime?        @map("expires_at")
  completedAt     DateTime?        @map("completed_at")
  progressPercent Decimal          @default(0) @map("progress_percent") @db.Decimal(5, 2)
  /// Powers resume + continue-watching. Written on every lesson open.
  lastLessonId    String?          @map("last_lesson_id")
  createdAt       DateTime         @default(now()) @map("created_at")
  updatedAt       DateTime         @updatedAt @map("updated_at")

  user       User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  course     Course           @relation(fields: [courseId], references: [id], onDelete: Cascade)
  lastLesson Lesson?          @relation("EnrollmentLastLesson", fields: [lastLessonId], references: [id], onDelete: SetNull)
  progress   LessonProgress[]

  @@unique([userId, courseId])
  @@index([userId, status])
  @@index([courseId])
  @@map("enrollments")
  @@schema("app")
}

/// §6.6. Note the composite primary key rather than the surrogate `id` in the
/// research sketch: this table is only ever addressed as (enrollment, lesson),
/// the pair is already UNIQUE, and dropping the surrogate lets the heartbeat's
/// `INSERT … ON CONFLICT`/`SELECT … FOR UPDATE` path run without generating a
/// uuid7 outside Prisma's client — which raw SQL cannot do for us.
///
/// `completion` is `numeric(5,4)` (0..1) so partial video progress survives a
/// reload; `watchedSeconds` and `maxPositionSeconds` are the two independent
/// signals the completion rule needs, and neither is ever written from a
/// client-supplied total.
model LessonProgress {
  enrollmentId       String              @map("enrollment_id")
  lessonId           String              @map("lesson_id")
  completion         Decimal             @default(0) @db.Decimal(5, 4)
  state              LessonProgressState @default(not_started)
  watchedSeconds     Int                 @default(0) @map("watched_seconds")
  maxPositionSeconds Int                 @default(0) @map("max_position_seconds")
  openCount          Int                 @default(0) @map("open_count")
  /// Set once, on the first open. The 5000ms dwell rule measures against THIS,
  /// server-side, so no client-reported dwell duration is ever trusted.
  firstOpenedAt      DateTime?           @map("first_opened_at")
  /// The wall-clock anchor for heartbeat accumulation. Separate from
  /// `updatedAt` because `updatedAt` is rewritten by every unrelated write.
  lastHeartbeatAt    DateTime?           @map("last_heartbeat_at")
  completedAt        DateTime?           @map("completed_at")
  completedVia       CompletionSource?   @map("completed_via")
  createdAt          DateTime            @default(now()) @map("created_at")
  updatedAt          DateTime            @updatedAt @map("updated_at")

  enrollment Enrollment @relation(fields: [enrollmentId], references: [id], onDelete: Cascade)
  lesson     Lesson     @relation(fields: [lessonId], references: [id], onDelete: Cascade)

  @@id([enrollmentId, lessonId])
  @@index([lessonId])
  @@index([enrollmentId, state])
  @@map("lesson_progress")
  @@schema("app")
}

/// §6.6. Everything is free in v1, but entitlement is an OBJECT with a scope
/// and a validity window, never a boolean on the enrollment. Retrofitting a
/// boolean into this shape after launch is a data migration across every
/// enrollment row; shipping the shape now costs one table nobody queries yet.
model AccessGrant {
  id              String           @id @default(uuid(7))
  userId          String           @map("user_id")
  scope           AccessScope
  courseId        String?          @map("course_id")
  subjectId       String?          @map("subject_id")
  instructorId    String?          @map("instructor_id")
  source          AccessSource     @default(free)
  scholarshipKind ScholarshipKind? @map("scholarship_kind")
  isPermanent     Boolean          @default(true) @map("is_permanent")
  validFrom       DateTime         @default(now()) @map("valid_from")
  validTo         DateTime?        @map("valid_to")
  createdBy       String?          @map("created_by")
  createdAt       DateTime         @default(now()) @map("created_at")

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  course  Course? @relation(fields: [courseId], references: [id], onDelete: Cascade)
  subject Subject? @relation(fields: [subjectId], references: [id], onDelete: SetNull)

  @@index([userId, scope])
  @@index([courseId])
  @@map("access_grants")
  @@schema("app")
}
```

- [ ] **Step 3: Add the two back-relations `LessonProgress` needs**

Plan 3 already declared `User.enrollments`, `User.accessGrants`, `User.grantsIssued`,
`Subject.accessGrants`, `Course.enrollments`, `Course.grants` and `Lesson.resumedBy`. Adding any of
them again is a duplicate-field error. Add **only** these:

On Plan 3's `Enrollment`, add:
```prisma
  progress LessonProgress[]
```

On Plan 3's `Lesson`, add:
```prisma
  progress LessonProgress[]
```

- [ ] **Step 4: Generate the migration without applying it**

```bash
cd /Users/cairocamerarentals/Documents/GitHub/ayman-platform
pnpm --filter @ayman/api exec prisma migrate dev --name enrollment_and_progress --create-only
```
Expected: a new folder under `apps/api/prisma/migrations/` containing `migration.sql`. Do **not** apply it yet.

- [ ] **Step 5: Hand-append the CHECK constraints Prisma cannot express**

Prisma has no syntax for cross-column or range CHECKs, so they go at the end of the generated `migration.sql` by hand. Each one is a rule the application also enforces — this is the layer that survives a bug in the application.

```sql
-- Completion is a fraction, not a percentage. numeric(5,4) would happily
-- store 9.9999; only this constraint stops a bad write from making a lesson
-- 999% complete and every course average meaningless.
ALTER TABLE app.lesson_progress
  ADD CONSTRAINT lesson_progress_completion_range
  CHECK (completion >= 0 AND completion <= 1);

-- Neither counter can run backwards.
ALTER TABLE app.lesson_progress
  ADD CONSTRAINT lesson_progress_seconds_nonnegative
  CHECK (watched_seconds >= 0 AND max_position_seconds >= 0 AND open_count >= 0);

-- A completed lesson always records HOW it completed, and an incomplete one
-- never carries a source. This is what keeps `completed_via` analytically
-- trustworthy instead of half-populated.
ALTER TABLE app.lesson_progress
  ADD CONSTRAINT lesson_progress_completed_has_source
  CHECK ((completed_at IS NULL) = (completed_via IS NULL));

-- A completed row must actually read as complete.
ALTER TABLE app.lesson_progress
  ADD CONSTRAINT lesson_progress_completed_is_full
  CHECK (completed_at IS NULL OR completion = 1);

ALTER TABLE app.enrollments
  ADD CONSTRAINT enrollments_progress_range
  CHECK (progress_percent >= 0 AND progress_percent <= 100);

-- A course-scoped grant must name a course; a platform-scoped one must not.
ALTER TABLE app.access_grants
  ADD CONSTRAINT access_grants_scope_matches_target
  CHECK (
    (scope = 'course' AND course_id IS NOT NULL)
    OR (scope = 'subject_teacher' AND subject_id IS NOT NULL)
    OR (scope IN ('platform', 'unassigned'))
  );

-- A non-permanent grant has to say when it ends, or it is permanent by accident.
ALTER TABLE app.access_grants
  ADD CONSTRAINT access_grants_expiry_present
  CHECK (is_permanent OR valid_to IS NOT NULL);
```

- [ ] **Step 6: Apply, generate, and confirm**

`prisma generate` does **not** run automatically after `migrate` in Prisma 7 — run it explicitly or the new models will not exist on the client.

```bash
pnpm --filter @ayman/api exec prisma migrate dev
pnpm --filter @ayman/api exec prisma generate
```

Confirm the tables and constraints landed in schema `app`:
```bash
psql "$DIRECT_DATABASE_URL" -c "\dt app.enrollments app.lesson_progress app.access_grants"
psql "$DIRECT_DATABASE_URL" -c \
  "SELECT conname FROM pg_constraint WHERE conrelid = 'app.lesson_progress'::regclass AND contype = 'c' ORDER BY conname;"
```
Expected: three tables; four `lesson_progress_*` check constraints.

- [ ] **Step 7: Write the constraint test**

Create `apps/api/src/modules/progress/progress-constraints.spec.ts`. These assert the *database* rejects bad rows — the point is that they pass even if every service in this plan is deleted.

```ts
import { PrismaClient } from '../../generated/prisma/client';

// Integration test against the real database. A mock here would only prove
// the mock matches itself; the entire value of these constraints is that
// Postgres enforces them.
describe('lesson_progress constraints', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects a completion above 1', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO app.lesson_progress (enrollment_id, lesson_id, completion, state, updated_at)
        VALUES (gen_random_uuid(), gen_random_uuid(), 1.5, 'in_progress', now())
      `,
    ).rejects.toThrow(/lesson_progress_completion_range/);
  });

  it('rejects a negative watched_seconds', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO app.lesson_progress (enrollment_id, lesson_id, watched_seconds, state, updated_at)
        VALUES (gen_random_uuid(), gen_random_uuid(), -1, 'in_progress', now())
      `,
    ).rejects.toThrow(/lesson_progress_seconds_nonnegative/);
  });

  it('rejects a completed row that does not say how it completed', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO app.lesson_progress
          (enrollment_id, lesson_id, completion, state, completed_at, completed_via, updated_at)
        VALUES (gen_random_uuid(), gen_random_uuid(), 1, 'completed', now(), NULL, now())
      `,
    ).rejects.toThrow(/lesson_progress_completed_has_source/);
  });

  it('rejects a completed row whose completion is not 1', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO app.lesson_progress
          (enrollment_id, lesson_id, completion, state, completed_at, completed_via, updated_at)
        VALUES (gen_random_uuid(), gen_random_uuid(), 0.5, 'completed', now(), 'manual', now())
      `,
    ).rejects.toThrow(/lesson_progress_completed_is_full/);
  });
});

describe('enrollments constraints', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects a progress percent above 100', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO app.enrollments (id, user_id, course_id, progress_percent, updated_at)
        VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 101, now())
      `,
    ).rejects.toThrow(/enrollments_progress_range/);
  });
});
```

> The FK violations these inserts would *also* trigger are irrelevant: Postgres
> evaluates CHECK constraints before referential integrity, so the CHECK name is
> what surfaces. If a test ever fails with a foreign-key message instead, the
> CHECK was not created — fix the migration, do not relax the assertion.

- [ ] **Step 8: Run it, then confirm the runtime role still cannot do DDL**

```bash
pnpm --filter @ayman/api test progress-constraints
```
Expected: PASS — 5 tests.

The bootstrap script's `ALTER DEFAULT PRIVILEGES FOR ROLE ayman_owner IN SCHEMA app` already grants DML on tables created later by the owner, so no new GRANT is needed. Prove both halves of that:

```bash
psql "$DATABASE_URL" -c "SELECT count(*) FROM app.enrollments;"
psql "$DATABASE_URL" -c "ALTER TABLE app.enrollments ADD COLUMN hacked text;"
```
Expected: the first returns `0`; the second fails with `must be owner of table enrollments`.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations \
        apps/api/src/modules/progress/progress-constraints.spec.ts
git commit -m "feat(api): enrollments, lesson_progress and access_grants with database-enforced invariants"
```

---

## Task 3: Progress permissions and the enrollment read model

> **RECONCILED.** Plan 3 Task 4 already ships `EntitlementModule` with
> `POST /api/courses/:courseId/enroll` (`enrollment:create`) and `GET /api/enrollments`
> (`enrollment:read`). **This task no longer creates a second enroll endpoint.** It adds the
> progress permissions, and it *enriches* Plan 3's enrollment read model with the derived fields the
> dashboard and the outline need. `EnrollmentService` here is an internal read service registered in
> `EntitlementModule` — it exposes no new route.

**Files:**
- Modify: `apps/api/src/auth/permissions.ts`
- Create: `apps/api/src/modules/enrollment/{enrollment.service.ts,enrollment.module.ts}`
- Create: `apps/api/src/modules/enrollment/enrollment.service.spec.ts`
- Modify: `apps/api/src/modules/entitlement/enrollment.controller.ts` (Plan 3) — widen the `GET /api/enrollments` response
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `roleHasPermission`, `@RequirePermission`, `@CurrentUser`, `PrismaService`, and Plan 3's `EntitlementService.resolveCourseAccess` / `ensurePlatformGrant`.
- Produces:
  - `EnrollmentService.listOwn(userId: string): Promise<EnrollmentDto[]>` — used by Plan 3's existing `GET /api/enrollments` controller and by the dashboard in Task 8
  - `EnrollmentService.requireActive(userId: string, courseId: string): Promise<{ id: string }>` — the enrollment row every progress write resolves through
  - `GET /api/enrollments` response gains `progressPercent`, `lastLessonId`, `completedLessons`, `totalLessons`
  - Student role gains `progress:read`, `progress:write`.

- [ ] **Step 1: Append the progress permissions to the student's set**

In `apps/api/src/auth/permissions.ts`, **append** — never replace the object; Plans 2 and 3 already
put entries there and Plans 5 and 6 will append more. Still a permission set, still never compared
by role name anywhere else:

```ts
const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission> | '*'> = {
  admin: '*',
  student: new Set<Permission>([
    'profile:read',      // Plan 2
    'profile:write',     // Plan 2
    'course:read',       // Plan 2
    'enrollment:read',   // Plan 3
    'enrollment:create', // Plan 3 — self-enrollment only; the service takes the
                         // user id from the session, never from the request, so
                         // holding it does not let a student enroll anybody else
    'progress:read',     // Plan 4  ← added here
    'progress:write',    // Plan 4  ← added here
    // Plan 5 appends 'quiz:read', 'quiz:attempt', 'appeal:create'
  ]),
};
```

Also append `'progress:read'` and `'progress:write'` to the `PERMISSIONS` catalogue array so
`@RequirePermission` stays type-checked.

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/modules/enrollment/enrollment.service.spec.ts`:

```ts
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EnrollmentService } from './enrollment.service';

describe('EnrollmentService', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const service = new EnrollmentService(prisma);

  let studentA = '';
  let studentB = '';
  let courseId = '';
  let courseSlug = '';

  beforeAll(async () => {
    await prisma.$connect();

    const stamp = Date.now();
    courseSlug = `test-course-${stamp}`;

    const [a, b] = await Promise.all([
      prisma.user.create({
        data: { id: `u-a-${stamp}`, name: 'A', email: `a-${stamp}@t.test` },
      }),
      prisma.user.create({
        data: { id: `u-b-${stamp}`, name: 'B', email: `b-${stamp}@t.test` },
      }),
    ]);
    studentA = a.id;
    studentB = b.id;

    const course = await prisma.course.create({
      data: { slug: courseSlug, title: 'كورس اختبار', status: 'published' },
    });
    courseId = course.id;
  });

  afterAll(async () => {
    await prisma.enrollment.deleteMany({ where: { courseId } });
    await prisma.accessGrant.deleteMany({ where: { courseId } });
    await prisma.course.delete({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: { in: [studentA, studentB] } } });
    await prisma.$disconnect();
  });

  it('creates an active enrollment and a matching access grant', async () => {
    const enrollment = await service.enroll(studentA, courseSlug);

    expect(enrollment.courseId).toBe(courseId);
    expect(enrollment.status).toBe('active');
    expect(enrollment.progressPercent).toBe(0);
    expect(enrollment.lastLessonId).toBeNull();

    // Entitlement is a grant OBJECT, not a boolean on the enrollment (§6.6).
    const grants = await prisma.accessGrant.findMany({
      where: { userId: studentA, courseId },
    });
    expect(grants).toHaveLength(1);
    expect(grants[0]?.scope).toBe('course');
    expect(grants[0]?.source).toBe('free');
    expect(grants[0]?.isPermanent).toBe(true);
  });

  it('is idempotent — enrolling twice does not duplicate or reset progress', async () => {
    await prisma.enrollment.update({
      where: { userId_courseId: { userId: studentA, courseId } },
      data: { progressPercent: 42 },
    });

    const again = await service.enroll(studentA, courseSlug);

    expect(again.progressPercent).toBe(42);
    expect(await prisma.enrollment.count({ where: { userId: studentA, courseId } })).toBe(1);
    expect(await prisma.accessGrant.count({ where: { userId: studentA, courseId } })).toBe(1);
  });

  it('refuses to enroll in a course that is not published', async () => {
    const draft = await prisma.course.create({
      data: { slug: `draft-${Date.now()}`, title: 'مسودة', status: 'draft' },
    });

    // 404, not 403: a draft course must not be discoverable through the
    // enrollment endpoint's error codes.
    await expect(service.enroll(studentA, draft.slug)).rejects.toMatchObject({ status: 404 });

    await prisma.course.delete({ where: { id: draft.id } });
  });

  it('lists only the caller-owned enrollments', async () => {
    await service.enroll(studentB, courseSlug);

    const forA = await service.listOwn(studentA);
    expect(forA).toHaveLength(1);
    expect(forA.every((row) => row.courseId === courseId)).toBe(true);

    // The IDOR shape that matters: B's row must never appear in A's list, and
    // the query filters on the session user id, not on anything from a request.
    const rows = await prisma.enrollment.findMany({ where: { courseId } });
    expect(rows).toHaveLength(2);
    expect(forA).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm --filter @ayman/api test enrollment.service
```
Expected: FAIL — `Cannot find module './enrollment.service'`.

- [ ] **Step 4: Implement the service**

Create `apps/api/src/modules/enrollment/enrollment.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import type { EnrollmentDto } from '@ayman/contracts';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Statuses that still grant access. `completed` is included because finishing
 * a course must not revoke it — see the comment on the Enrollment model.
 */
export const ACTIVE_ENROLLMENT_STATUSES = ['active', 'completed'] as const;

const ENROLLMENT_SELECT = {
  id: true,
  courseId: true,
  status: true,
  progressPercent: true,
  lastLessonId: true,
  enrolledAt: true,
  completedAt: true,
  course: { select: { slug: true } },
} as const;

type EnrollmentRow = {
  id: string;
  courseId: string;
  status: string;
  progressPercent: { toNumber(): number };
  lastLessonId: string | null;
  enrolledAt: Date;
  completedAt: Date | null;
  course: { slug: string };
};

function toDto(row: EnrollmentRow): EnrollmentDto {
  return {
    id: row.id,
    courseId: row.courseId,
    courseSlug: row.course.slug,
    status: row.status as EnrollmentDto['status'],
    // Prisma returns Decimal for numeric columns; the contract says number.
    progressPercent: Number(row.progressPercent),
    lastLessonId: row.lastLessonId,
    enrolledAt: row.enrolledAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class EnrollmentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Self-enrollment. `userId` comes from the session and is never read from
   * the request, so this cannot be used to enroll another account no matter
   * what the body or the path says.
   *
   * Idempotent by construction: the (user, course) unique index plus an
   * `update: {}` no-op means a double-click, a retry, or a replayed request
   * all converge on the same single row with its progress untouched.
   */
  async enroll(userId: string, courseSlug: string): Promise<EnrollmentDto> {
    const course = await this.prisma.course.findFirst({
      where: { slug: courseSlug, status: 'published' },
      select: { id: true },
    });
    if (!course) {
      // 404 for both "no such course" and "not published" — a 403 here would
      // confirm the existence of unpublished content to anyone guessing slugs.
      throw new NotFoundException('course not found');
    }

    const [enrollment] = await this.prisma.$transaction([
      this.prisma.enrollment.upsert({
        where: { userId_courseId: { userId, courseId: course.id } },
        create: { userId, courseId: course.id, source: 'free', status: 'active' },
        update: {},
        select: ENROLLMENT_SELECT,
      }),
      // §6.6: entitlement is a grant object with a scope and a validity
      // window, never a boolean. Everything is free now, so the grant is
      // course-scoped, free-sourced and permanent — but the shape is already
      // the one a paid or scholarship grant will use.
      this.prisma.accessGrant.upsert({
        where: {
          userId_scope_courseId: { userId, scope: 'course', courseId: course.id },
        },
        create: {
          userId,
          scope: 'course',
          courseId: course.id,
          source: 'free',
          isPermanent: true,
        },
        update: {},
        select: { id: true },
      }),
    ]);

    return toDto(enrollment as EnrollmentRow);
  }

  /** Own enrollments only — the filter is the session user id, full stop. */
  async listOwn(userId: string): Promise<EnrollmentDto[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: { userId, status: { in: [...ACTIVE_ENROLLMENT_STATUSES] } },
      orderBy: { updatedAt: 'desc' },
      select: ENROLLMENT_SELECT,
    });
    return rows.map((row) => toDto(row as EnrollmentRow));
  }
}
```

The `accessGrant.upsert` needs a unique index to target. Add it to the `AccessGrant` model in `schema.prisma` and create a follow-up migration:

```prisma
  @@unique([userId, scope, courseId], name: "userId_scope_courseId")
```

```bash
pnpm --filter @ayman/api exec prisma migrate dev --name access_grant_course_unique
pnpm --filter @ayman/api exec prisma generate
```

> Postgres treats NULLs as distinct in a unique index, so this constrains
> course-scoped grants (where `course_id` is never NULL) and deliberately does
> not constrain platform-scoped ones — a student may legitimately hold several
> of those over time with different validity windows.

- [ ] **Step 5: Widen Plan 3's controller — do not create a second one**

> **RECONCILED.** Plan 3 Task 4 already created
> `apps/api/src/modules/entitlement/enrollment.controller.ts` carrying
> `POST /api/courses/:courseId/enroll` (`enrollment:create`) and `GET /api/enrollments`
> (`enrollment:read`). Creating `apps/api/src/modules/enrollment/enrollment.controller.ts` here
> would register two Nest routes for the same responsibility with different permissions and
> different path shapes (`:courseId` vs `:slug`). **Delete that file from this task.**

Instead, change Plan 3's `GET /api/enrollments` handler to delegate to this task's
`EnrollmentService.listOwn`, so the response carries the derived progress fields:

```ts
  @RequirePermission('enrollment:read')
  @Get('enrollments')
  listOwn(@CurrentUser() user: AuthenticatedUser): Promise<EnrollmentDto[]> {
    // Plan 4: was a bare Prisma findMany; now returns progressPercent,
    // lastLessonId, completedLessons and totalLessons.
    return this.enrollment.listOwn(user.id);
  }
```

The enroll handler is unchanged and stays on `enrollment:create`. The self-enrollment guarantee is
unchanged too: the user id comes from the session, never the body.

`apps/api/src/modules/enrollment/enrollment.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { EnrollmentController } from './enrollment.controller';
import { EnrollmentService } from './enrollment.service';

@Module({
  controllers: [EnrollmentController],
  providers: [EnrollmentService],
  exports: [EnrollmentService],
})
export class EnrollmentModule {}
```

Register it in `apps/api/src/app.module.ts`'s `imports` array, after `ProfileModule`:
```ts
    EnrollmentModule,
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
pnpm --filter @ayman/api test enrollment.service
```
Expected: PASS — 4 tests.

- [ ] **Step 7: Verify the authorization matrix by hand**

With `pnpm dev` running and a logged-in student cookie jar in `/tmp/student.txt`:

```bash
# anonymous → 401, because the guard denies by default
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3200/api/courses/<course-uuid>/enroll

# student → 201/200 with an enrollment (Plan 3's route: :courseId, not :slug)
curl -s -b /tmp/student.txt -H 'x-csrf-token: 1' \
  -X POST http://localhost:3200/api/courses/<course-uuid>/enroll

# and the enriched read model
curl -s -b /tmp/student.txt http://localhost:3200/api/enrollments | head -c 300
```
Expected: `401` then a JSON enrollment. Record both in your report.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/auth/permissions.ts apps/api/src/modules/enrollment \
        apps/api/src/app.module.ts apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): self-enrollment with a scoped access grant and own-only listing"
```

---

## Task 4: Session-keyed throttling

The heartbeat is about to become the highest-frequency authenticated write in the product. Before it exists, fix the thing that would make rate-limiting it actively harmful: the throttler currently keys on IP, and an Egyptian school behind one NAT is a single bucket. Forty students in a computer lab would lock each other out of their own lessons.

**Files:**
- Create: `apps/api/src/common/throttle/request-identity.ts`
- Create: `apps/api/src/common/throttle/request-identity.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: the session cookie name from `apps/api/src/auth/auth.config.ts` (`session_token` in development, `__Host-session_token` in production).
- Produces: `trackerFromRequest(req: ThrottleRequest): string` — wired as the `getTracker` of all three named throttlers.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/common/throttle/request-identity.spec.ts`:

```ts
import { trackerFromRequest } from './request-identity';

describe('trackerFromRequest', () => {
  it('keys two students behind one NAT separately', () => {
    const shared = '41.33.0.1';
    const a = trackerFromRequest({ ip: shared, headers: { cookie: 'session_token=aaa.sig' } });
    const b = trackerFromRequest({ ip: shared, headers: { cookie: 'session_token=bbb.sig' } });

    expect(a).not.toBe(b);
  });

  it('keys one student across networks into a single bucket', () => {
    const first = trackerFromRequest({ ip: '41.33.0.1', headers: { cookie: 'session_token=aaa.sig' } });
    const second = trackerFromRequest({ ip: '197.1.2.3', headers: { cookie: 'session_token=aaa.sig' } });

    // Same session, different network (wifi → mobile data) — still one bucket.
    expect(first).toBe(second);
  });

  it('never puts a raw session token in the key', () => {
    const tracker = trackerFromRequest({
      ip: '41.33.0.1',
      headers: { cookie: 'session_token=super-secret-value.sig' },
    });

    // Tracker keys end up in logs and in the throttler store. A raw session
    // token in either is a session-hijacking primitive.
    expect(tracker).not.toContain('super-secret-value');
    expect(tracker.startsWith('sess:')).toBe(true);
  });

  it('reads the production __Host- prefixed cookie too', () => {
    const prefixed = trackerFromRequest({
      ip: '41.33.0.1',
      headers: { cookie: '__Host-session_token=aaa.sig' },
    });
    const plain = trackerFromRequest({
      ip: '41.33.0.1',
      headers: { cookie: 'session_token=aaa.sig' },
    });

    expect(prefixed).toBe(plain);
  });

  it('falls back to the IP when there is no session at all', () => {
    expect(trackerFromRequest({ ip: '41.33.0.1', headers: {} })).toBe('ip:41.33.0.1');
  });

  it('falls back to a constant when even the IP is missing, rather than to undefined', () => {
    // An undefined tracker would collapse every anonymous request into one
    // key silently; making it explicit means the behaviour is a decision.
    expect(trackerFromRequest({ headers: {} })).toBe('ip:unknown');
  });

  it('is not confused by another cookie whose name ends in session_token', () => {
    const decoy = trackerFromRequest({
      ip: '41.33.0.1',
      headers: { cookie: 'not_the_session_token=aaa; other=1' },
    });
    expect(decoy).toBe('ip:41.33.0.1');
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
pnpm --filter @ayman/api test request-identity
```
Expected: FAIL — `Cannot find module './request-identity'`.

- [ ] **Step 3: Implement**

Create `apps/api/src/common/throttle/request-identity.ts`:

```ts
import { createHash } from 'node:crypto';

/**
 * Both spellings of the Better Auth session cookie: the `__Host-` prefixed
 * production name and the unprefixed development one (see `auth.config.ts`
 * for why the prefix is conditional). Longest first so the prefixed name is
 * matched before the plain one.
 */
const SESSION_COOKIE_NAMES = ['__Host-session_token', 'session_token'] as const;

export interface ThrottleRequest {
  ip?: string | undefined;
  headers: Record<string, string | string[] | undefined>;
}

function readCookie(cookieHeader: string, name: string): string | undefined {
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    // Trim only the name: a cookie VALUE may legitimately contain '='.
    if (part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return undefined;
}

/**
 * The throttler's identity for a request.
 *
 * IP-only tracking is wrong for this product in both directions: one school's
 * NAT would share a single bucket (40 students in a lab lock each other out of
 * their own lessons), while one student on mobile data changes IP mid-lesson
 * and escapes their own limit. Keying on the session token fixes both.
 *
 * The token is hashed, never stored raw: tracker keys reach the throttler
 * store and, on a miss, the logs — a raw session token in either is a
 * hijacking primitive, and the throttler only needs stable equality.
 */
export function trackerFromRequest(request: ThrottleRequest): string {
  const rawCookie = request.headers['cookie'];
  const cookieHeader = Array.isArray(rawCookie) ? rawCookie.join('; ') : rawCookie;

  if (cookieHeader) {
    for (const name of SESSION_COOKIE_NAMES) {
      const value = readCookie(cookieHeader, name);
      if (value) {
        return `sess:${createHash('sha256').update(value).digest('base64url').slice(0, 22)}`;
      }
    }
  }

  // Anonymous traffic (login, catalog) still needs a bucket, and the IP is
  // the only identity available. `unknown` is explicit rather than letting an
  // undefined tracker silently merge every such request into one key.
  return `ip:${request.ip ?? 'unknown'}`;
}
```

- [ ] **Step 4: Run it, confirm green**

```bash
pnpm --filter @ayman/api test request-identity
```
Expected: PASS — 7 tests.

- [ ] **Step 5: Wire it into all three named throttlers**

In `apps/api/src/app.module.ts`, replace the `ThrottlerModule.forRoot` call:

```ts
    // Layered limits. The in-memory store is per-instance, so this must move to
    // the Redis storage adapter before anything runs more than one replica.
    //
    // `getTracker` is session-keyed rather than IP-keyed — see
    // `./common/throttle/request-identity` for why an IP bucket is actively
    // wrong for a product whose users sit behind school NATs. `trust proxy` is
    // still a hop count (main.ts), never `true`, so the fallback IP cannot be
    // spoofed via X-Forwarded-For.
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'short', ttl: seconds(1), limit: 10, getTracker: trackerFromRequest },
        { name: 'medium', ttl: seconds(60), limit: 60, getTracker: trackerFromRequest },
        { name: 'long', ttl: seconds(3600), limit: 1000, getTracker: trackerFromRequest },
      ],
    }),
```

with the import:
```ts
import { trackerFromRequest } from './common/throttle/request-identity';
```

- [ ] **Step 6: Verify the limiter still fires**

```bash
pnpm --filter @ayman/api dev
for i in $(seq 1 15); do curl -s -o /dev/null -w '%{http_code} ' http://localhost:3300/api/health; done; echo
```
Expected: ten `200`s then `429`s — the `short` throttler at 10/s, now bucketed by IP for this anonymous request.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/common/throttle apps/api/src/app.module.ts
git commit -m "feat(api): key rate limits on the session rather than the IP"
```

---

## Task 5: The heartbeat endpoint

The decisive task. Everything else in this plan is scaffolding around this write.

**Files:**
- Create: `apps/api/src/modules/progress/lesson-access.service.ts`
- Create: `apps/api/src/modules/progress/progress.mapper.ts`
- Create: `apps/api/src/modules/progress/course-progress.service.ts`
- Create: `apps/api/src/modules/progress/heartbeat.service.ts`
- Create: `apps/api/src/modules/progress/heartbeat.dto.ts`
- Create: `apps/api/src/modules/progress/progress.controller.ts`
- Create: `apps/api/src/modules/progress/progress.module.ts`
- Create: `apps/api/src/modules/progress/heartbeat.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `isVideoAutoComplete`, `videoCompletionFraction`, `allowedHeartbeatSeconds`, `HeartbeatRequestSchema` from `@ayman/contracts/progress`; `ACTIVE_ENROLLMENT_STATUSES` from the enrollment service.
- Produces:
  - `LessonAccessService.require(userId: string, lessonId: string): Promise<LessonAccessContext>`
  - `CourseProgressService.recalculate(tx, enrollmentId: string, courseId: string): Promise<number>`
  - `HeartbeatService.record(userId: string, lessonId: string, input: HeartbeatRequest): Promise<HeartbeatResponse>`
  - `POST /api/lessons/:lessonId/heartbeat` → `HeartbeatResponse`

- [ ] **Step 1: Write the failing test — the scrub-to-end proof first**

Create `apps/api/src/modules/progress/heartbeat.service.spec.ts`:

```ts
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseProgressService } from './course-progress.service';
import { HeartbeatService } from './heartbeat.service';
import { LessonAccessService } from './lesson-access.service';

const DURATION = 600; // 10:00

describe('HeartbeatService', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const service = new HeartbeatService(
    prisma,
    new LessonAccessService(prisma),
    new CourseProgressService(),
  );

  let userId = '';
  let courseId = '';
  let lessonId = '';
  let enrollmentId = '';
  let otherUserId = '';

  /** Pretends `seconds` of wall-clock time passed since the last heartbeat. */
  async function rewindClock(seconds: number): Promise<void> {
    await prisma.$executeRaw`
      UPDATE app.lesson_progress
         SET last_heartbeat_at = now() - make_interval(secs => ${seconds}::double precision)
       WHERE enrollment_id = ${enrollmentId}::uuid AND lesson_id = ${lessonId}::uuid
    `;
  }

  async function resetProgress(): Promise<void> {
    await prisma.lessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
      create: {
        enrollmentId,
        lessonId,
        state: 'in_progress',
        openCount: 1,
        firstOpenedAt: new Date(),
        lastHeartbeatAt: new Date(),
      },
      update: {
        completion: 0,
        state: 'in_progress',
        watchedSeconds: 0,
        maxPositionSeconds: 0,
        completedAt: null,
        completedVia: null,
        lastHeartbeatAt: new Date(),
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();

    const user = await prisma.user.create({
      data: { id: `hb-${stamp}`, name: 'طالب', email: `hb-${stamp}@t.test` },
    });
    userId = user.id;

    const other = await prisma.user.create({
      data: { id: `hb-other-${stamp}`, name: 'طالب تاني', email: `hbo-${stamp}@t.test` },
    });
    otherUserId = other.id;

    const course = await prisma.course.create({
      data: { slug: `hb-course-${stamp}`, title: 'كورس', status: 'published' },
    });
    courseId = course.id;

    const section = await prisma.courseSection.create({
      data: { courseId, title: 'الوحدة الأولى', position: 1, isPublished: true },
    });

    const lesson = await prisma.lesson.create({
      data: {
        courseId,
        sectionId: section.id,
        title: 'الدرس الأول',
        kind: 'video',
        position: 1,
        isPublished: true,
        video: {
          create: { provider: 'youtube', externalId: 'dQw4w9WgXcQ', durationSeconds: DURATION },
        },
      },
    });
    lessonId = lesson.id;

    const enrollment = await prisma.enrollment.create({
      data: { userId, courseId, source: 'free', status: 'active' },
    });
    enrollmentId = enrollment.id;
  });

  beforeEach(resetProgress);

  afterAll(async () => {
    await prisma.lessonProgress.deleteMany({ where: { enrollmentId } });
    await prisma.enrollment.deleteMany({ where: { courseId } });
    await prisma.lesson.deleteMany({ where: { courseId } });
    await prisma.courseSection.deleteMany({ where: { courseId } });
    await prisma.course.delete({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prisma.$disconnect();
  });

  // ── THE test ──────────────────────────────────────────────────────────
  it('does not complete a lesson that was scrubbed to the end', async () => {
    // Exactly what dragging the scrubber looks like on the wire: the position
    // jumps to the end, but no playback time is ever reported.
    for (let i = 0; i < 6; i += 1) {
      await rewindClock(10);
      const response = await service.record(userId, lessonId, { position: DURATION, delta: 0 });
      expect(response.justCompleted).toBe(false);
      expect(response.progress.state).toBe('in_progress');
    }

    const row = await prisma.lessonProgress.findUniqueOrThrow({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    });
    expect(row.maxPositionSeconds).toBe(DURATION); // position gate satisfied
    expect(row.watchedSeconds).toBe(0); // watch gate not
    expect(row.completedAt).toBeNull();
    expect(Number(row.completion)).toBe(0);
  });

  it('does not complete a lesson left playing in a background tab to 80%', async () => {
    for (let i = 0; i < 48; i += 1) {
      await rewindClock(10);
      await service.record(userId, lessonId, { position: 10 * (i + 1), delta: 10 });
    }

    const row = await prisma.lessonProgress.findUniqueOrThrow({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    });
    expect(row.watchedSeconds).toBe(480); // 80% watched — over the 70% gate
    expect(row.maxPositionSeconds).toBe(480); // 80% position — under the 95% gate
    expect(row.completedAt).toBeNull();
  });

  it('completes a lesson that was genuinely watched to the end', async () => {
    for (let i = 0; i < 57; i += 1) {
      await rewindClock(10);
      await service.record(userId, lessonId, { position: 10 * (i + 1), delta: 10 });
    }
    await rewindClock(10);
    const final = await service.record(userId, lessonId, { position: DURATION, delta: 10 });

    expect(final.justCompleted).toBe(true);
    expect(final.progress.state).toBe('completed');
    expect(final.progress.completion).toBe(1);
    expect(final.progress.completedVia).toBe('auto');
    expect(final.courseProgressPercent).toBe(100);
  });

  it('reports justCompleted exactly once', async () => {
    for (let i = 0; i < 58; i += 1) {
      await rewindClock(10);
      await service.record(userId, lessonId, { position: 10 * (i + 1), delta: 10 });
    }
    await rewindClock(10);
    const again = await service.record(userId, lessonId, { position: DURATION, delta: 10 });

    expect(again.justCompleted).toBe(false);
    expect(again.progress.state).toBe('completed');
  });

  // ── the accumulator ───────────────────────────────────────────────────
  it('credits no more than the wall clock allows, however fast the client posts', async () => {
    // Thirty heartbeats back to back, each claiming the maximum, with no time
    // passing between them. The grace window is all they can buy.
    for (let i = 0; i < 30; i += 1) {
      await service.record(userId, lessonId, { position: 100, delta: 15 });
    }

    const row = await prisma.lessonProgress.findUniqueOrThrow({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    });
    // 30 × 2s grace, and the real elapsed time of the loop itself — nowhere
    // near the 450s the client claimed.
    expect(row.watchedSeconds).toBeLessThanOrEqual(70);
    expect(row.watchedSeconds).toBeLessThan(30 * 15);
  });

  it('never lets watched time exceed the duration', async () => {
    for (let i = 0; i < 80; i += 1) {
      await rewindClock(15);
      await service.record(userId, lessonId, { position: DURATION, delta: 15 });
    }

    const row = await prisma.lessonProgress.findUniqueOrThrow({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    });
    expect(row.watchedSeconds).toBe(DURATION);
    expect(row.maxPositionSeconds).toBe(DURATION);
  });

  it('clamps a position beyond the end of the video', async () => {
    await rewindClock(10);
    await service.record(userId, lessonId, { position: 999_999, delta: 10 });

    const row = await prisma.lessonProgress.findUniqueOrThrow({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    });
    expect(row.maxPositionSeconds).toBe(DURATION);
  });

  it('never moves max position backwards when the student rewinds', async () => {
    await rewindClock(10);
    await service.record(userId, lessonId, { position: 400, delta: 10 });
    await rewindClock(10);
    await service.record(userId, lessonId, { position: 10, delta: 10 });

    const row = await prisma.lessonProgress.findUniqueOrThrow({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    });
    expect(row.maxPositionSeconds).toBe(400);
    expect(row.watchedSeconds).toBe(20); // rewatching still counts as watching
  });

  // ── authorization ─────────────────────────────────────────────────────
  it('404s for a user who is not enrolled, rather than 403', async () => {
    await expect(
      service.record(otherUserId, lessonId, { position: 10, delta: 10 }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('404s for a lesson that does not exist', async () => {
    await expect(
      service.record(userId, '00000000-0000-7000-8000-000000000000', { position: 1, delta: 1 }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects heartbeats against a non-video lesson', async () => {
    const section = await prisma.courseSection.findFirstOrThrow({ where: { courseId } });
    const textLesson = await prisma.lesson.create({
      data: {
        courseId,
        sectionId: section.id,
        title: 'درس مقروء',
        kind: 'text',
        position: 2,
        isPublished: true,
      },
    });

    await expect(
      service.record(userId, textLesson.id, { position: 1, delta: 1 }),
    ).rejects.toMatchObject({ status: 400 });

    await prisma.lesson.delete({ where: { id: textLesson.id } });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @ayman/api test heartbeat.service
```
Expected: FAIL — `Cannot find module './lesson-access.service'`.

- [ ] **Step 3: Implement the ownership gate**

Create `apps/api/src/modules/progress/lesson-access.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import type { LessonKind } from '@ayman/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_ENROLLMENT_STATUSES } from '../enrollment/enrollment.service';

export interface LessonAccessContext {
  lessonId: string;
  kind: LessonKind;
  courseId: string;
  courseSlug: string;
  enrollmentId: string;
  /** 0 when unknown — auto-completion is then impossible by design. */
  durationSeconds: number;
}

/**
 * The single gate every progress write goes through.
 *
 * Spec §7 P1: ownership is compiled INTO the query. The `where` clause below
 * contains `enrollments: { some: { userId } }`, so an unenrolled caller gets
 * no row at all — there is no fetched object for a later `if` to forget to
 * check. Both "no such lesson" and "not your lesson" resolve to 404: a 403
 * would confirm the existence of unpublished content to anyone iterating ids.
 */
@Injectable()
export class LessonAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async require(userId: string, lessonId: string): Promise<LessonAccessContext> {
    const lesson = await this.prisma.lesson.findFirst({
      where: {
        id: lessonId,
        isPublished: true,
        course: {
          status: 'published',
          enrollments: { some: { userId, status: { in: [...ACTIVE_ENROLLMENT_STATUSES] } } },
        },
      },
      // An explicit select, never an include — nothing leaves this query that
      // was not asked for by name.
      select: {
        id: true,
        kind: true,
        courseId: true,
        course: {
          select: {
            slug: true,
            enrollments: {
              where: { userId, status: { in: [...ACTIVE_ENROLLMENT_STATUSES] } },
              select: { id: true },
              take: 1,
            },
          },
        },
        video: { select: { durationSeconds: true } },
      },
    });

    const enrollmentId = lesson?.course.enrollments[0]?.id;
    if (!lesson || !enrollmentId) {
      throw new NotFoundException('lesson not found');
    }

    return {
      lessonId: lesson.id,
      kind: lesson.kind as LessonKind,
      courseId: lesson.courseId,
      courseSlug: lesson.course.slug,
      enrollmentId,
      durationSeconds: lesson.video?.durationSeconds ?? 0,
    };
  }
}
```

- [ ] **Step 4: Implement the mapper and the course-progress recompute**

Create `apps/api/src/modules/progress/progress.mapper.ts`:

```ts
import type { CompletionSource, LessonProgressDto, LessonProgressState } from '@ayman/contracts';

/** The only columns any progress response is ever built from. */
export const PROGRESS_SELECT = {
  lessonId: true,
  state: true,
  completion: true,
  watchedSeconds: true,
  maxPositionSeconds: true,
  openCount: true,
  completedAt: true,
  completedVia: true,
} as const;

export interface ProgressRow {
  lessonId: string;
  state: string;
  completion: unknown;
  watchedSeconds: number;
  maxPositionSeconds: number;
  openCount: number;
  completedAt: Date | null;
  completedVia: string | null;
}

/** Prisma `Decimal` → number, `Date` → ISO string. Nothing else crosses. */
export function toProgressDto(row: ProgressRow): LessonProgressDto {
  return {
    lessonId: row.lessonId,
    state: row.state as LessonProgressState,
    completion: Number(row.completion),
    watchedSeconds: row.watchedSeconds,
    maxPositionSeconds: row.maxPositionSeconds,
    openCount: row.openCount,
    completedAt: row.completedAt?.toISOString() ?? null,
    completedVia: (row.completedVia as CompletionSource | null) ?? null,
  };
}
```

Create `apps/api/src/modules/progress/course-progress.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';

/** Anything with a `lesson`, `lessonProgress` and `enrollment` delegate — the
 *  PrismaService itself or a transaction client, interchangeably. */
type PrismaLike = Prisma.TransactionClient;

@Injectable()
export class CourseProgressService {
  /**
   * Course progress is "completed published lessons ÷ published lessons",
   * which is the number every Egyptian platform shows and the only one a
   * student can sanity-check against the outline they are looking at.
   *
   * Per-lesson partial `completion` still exists — it drives the continue-
   * watching bar and future analytics — but averaging partials into the
   * course number would make the headline percentage drift every ten seconds
   * for no informational gain, and would force this aggregate to run on every
   * heartbeat instead of only on a state transition.
   */
  async recalculate(tx: PrismaLike, enrollmentId: string, courseId: string): Promise<number> {
    const [totalLessons, completedLessons] = await Promise.all([
      tx.lesson.count({ where: { courseId, isPublished: true } }),
      tx.lessonProgress.count({
        where: {
          enrollmentId,
          state: { in: ['completed', 'passed'] },
          lesson: { courseId, isPublished: true },
        },
      }),
    ]);

    const percent =
      totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 10_000) / 100;
    const finished = totalLessons > 0 && completedLessons === totalLessons;

    await tx.enrollment.update({
      where: { id: enrollmentId },
      data: {
        progressPercent: percent,
        // `status` deliberately stays `active`. Finishing a course must not
        // drop the enrollment out of the ownership filters and revoke access
        // to the very thing that was just completed.
        completedAt: finished ? new Date() : null,
      },
    });

    return percent;
  }
}
```

- [ ] **Step 5: Implement the heartbeat service**

Create `apps/api/src/modules/progress/heartbeat.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import type { HeartbeatRequest, HeartbeatResponse } from '@ayman/contracts';
import {
  allowedHeartbeatSeconds,
  isVideoAutoComplete,
  videoCompletionFraction,
} from '@ayman/contracts/progress';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseProgressService } from './course-progress.service';
import { LessonAccessService } from './lesson-access.service';
import { PROGRESS_SELECT, toProgressDto, type ProgressRow } from './progress.mapper';

interface LockedProgressRow {
  watched_seconds: number;
  max_position_seconds: number;
  state: string;
  completed_at: Date | null;
  elapsed_seconds: number;
}

@Injectable()
export class HeartbeatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LessonAccessService,
    private readonly courseProgress: CourseProgressService,
  ) {}

  /**
   * The highest-frequency authenticated write in the product.
   *
   * Shape: one `SELECT … FOR UPDATE` and one `UPDATE` inside a single
   * interactive transaction. The row lock is what makes the read-modify-write
   * safe against two tabs heartbeating the same lesson — without it, both
   * would read the same `watched_seconds` and the later write would silently
   * discard the earlier one, or worse, double-credit.
   *
   * The rule itself deliberately stays in TypeScript
   * (`@ayman/contracts/progress`) rather than being pushed into the SQL: one
   * tested implementation, called by both the server that enforces it and the
   * client that displays it. Collapsing this into a single
   * `INSERT … ON CONFLICT` is possible — pass the thresholds in as absolute
   * second counts — but it duplicates the rule into SQL, and at roughly 0.2
   * transactions per second per active learner there is nothing here to
   * optimise yet. Measure before trading that away.
   */
  async record(
    userId: string,
    lessonId: string,
    input: HeartbeatRequest,
  ): Promise<HeartbeatResponse> {
    const context = await this.access.require(userId, lessonId);

    if (context.kind !== 'video') {
      throw new BadRequestException('heartbeats are only accepted for video lessons');
    }

    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<LockedProgressRow[]>`
        SELECT watched_seconds,
               max_position_seconds,
               state::text AS state,
               completed_at,
               EXTRACT(
                 EPOCH FROM (now() - COALESCE(last_heartbeat_at, first_opened_at, updated_at))
               )::float8 AS elapsed_seconds
          FROM app.lesson_progress
         WHERE enrollment_id = ${context.enrollmentId}::uuid
           AND lesson_id     = ${context.lessonId}::uuid
           FOR UPDATE
      `;

      const previous = locked[0];

      // The whole anti-forgery control, in one line: the client's claim is
      // intersected with the time the SERVER measured since it last heard
      // from this row. There is no path where `input.delta` is added raw.
      const granted = allowedHeartbeatSeconds(input.delta, previous?.elapsed_seconds ?? 0);

      const duration = context.durationSeconds;
      const cap = duration > 0 ? duration : Number.MAX_SAFE_INTEGER;

      const watchedSeconds = Math.min((previous?.watched_seconds ?? 0) + granted, cap);
      const maxPositionSeconds = Math.max(
        previous?.max_position_seconds ?? 0,
        Math.min(Math.max(input.position, 0), cap),
      );

      const snapshot = { durationSeconds: duration, watchedSeconds, maxPositionSeconds };
      const wasComplete = previous?.completed_at != null;
      const justCompleted = !wasComplete && isVideoAutoComplete(snapshot);
      const isComplete = wasComplete || justCompleted;
      const now = new Date();

      const completionFields = justCompleted
        ? { completedAt: now, completedVia: 'auto' as const }
        : {};

      const row = await tx.lessonProgress.upsert({
        where: {
          enrollmentId_lessonId: {
            enrollmentId: context.enrollmentId,
            lessonId: context.lessonId,
          },
        },
        create: {
          enrollmentId: context.enrollmentId,
          lessonId: context.lessonId,
          completion: videoCompletionFraction(snapshot),
          state: isComplete ? 'completed' : 'in_progress',
          watchedSeconds,
          maxPositionSeconds,
          openCount: 1,
          firstOpenedAt: now,
          lastHeartbeatAt: now,
          ...completionFields,
        },
        update: {
          completion: videoCompletionFraction(snapshot),
          state: isComplete ? 'completed' : 'in_progress',
          watchedSeconds,
          maxPositionSeconds,
          lastHeartbeatAt: now,
          ...completionFields,
        },
        select: PROGRESS_SELECT,
      });

      // The course aggregate only moves on a transition, so the common case
      // — a heartbeat mid-lesson — costs exactly the two statements above.
      const courseProgressPercent = justCompleted
        ? await this.courseProgress.recalculate(tx, context.enrollmentId, context.courseId)
        : Number(
            (
              await tx.enrollment.findUniqueOrThrow({
                where: { id: context.enrollmentId },
                select: { progressPercent: true },
              })
            ).progressPercent,
          );

      return {
        progress: toProgressDto(row as ProgressRow),
        justCompleted,
        courseProgressPercent,
      };
    });
  }
}
```

- [ ] **Step 6: Implement the DTO, controller and module**

`apps/api/src/modules/progress/heartbeat.dto.ts`:
```ts
// Imported from the `./progress` subpath rather than the package root: the
// root barrel re-exports through extensionless relative specifiers that
// plain Node's ESM loader cannot resolve at runtime. `progress.ts` has no
// relative imports of its own, so importing it directly sidesteps the
// barrel — same reasoning as `onboarding.dto.ts`.
import { EmptyBodySchema, HeartbeatRequestSchema } from '@ayman/contracts/progress';
import { createZodDto } from 'nestjs-zod';

/**
 * Global Constraint 8. `HeartbeatRequestSchema` is `.strict()`, so a student
 * posting `{position, delta, completed: true}` — or `{completion: 1}`, or
 * `{score: 100}` — gets a 400, not a silently-stripped field. `delta` is also
 * range-capped here, which is the cheapest possible rejection; the wall-clock
 * clamp in `HeartbeatService` is the control that actually matters.
 */
export class HeartbeatDto extends createZodDto(HeartbeatRequestSchema) {}

/** Deliberately empty and strict — the manual-complete button sends nothing. */
export class EmptyBodyDto extends createZodDto(EmptyBodySchema) {}
```

`apps/api/src/modules/progress/progress.controller.ts`:
```ts
import { Body, Controller, Param, Post, UsePipes } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import type { HeartbeatResponse } from '@ayman/contracts';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { HeartbeatDto } from './heartbeat.dto';
import { HeartbeatService } from './heartbeat.service';

@Controller('lessons')
export class ProgressController {
  constructor(private readonly heartbeat: HeartbeatService) {}

  /**
   * One heartbeat per 10s of playback, so an honest client sends 6/minute.
   *
   * The limits below are per SESSION, not per IP (see
   * `common/throttle/request-identity`) — an IP bucket would put a whole
   * school lab into one counter and lock forty students out of their own
   * lessons. 15/minute leaves room for a remount plus a couple of retries;
   * 500/hour covers continuous watching (360/hour) with headroom.
   *
   * These limits are a resource control, not the anti-cheat: even at the
   * ceiling, 15 requests × the 2s grace = 30s of credit per minute, which is
   * strictly worse than just watching the video.
   */
  @RequirePermission('progress:write')
  @Throttle({
    short: { limit: 2, ttl: seconds(1) },
    medium: { limit: 15, ttl: seconds(60) },
    long: { limit: 500, ttl: seconds(3600) },
  })
  @Post(':lessonId/heartbeat')
  @UsePipes(ZodValidationPipe)
  record(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId') lessonId: string,
    @Body() body: HeartbeatDto,
  ): Promise<HeartbeatResponse> {
    // `user.id` comes from the session; the body carries no identity at all.
    return this.heartbeat.record(user.id, lessonId, body);
  }
}
```

`apps/api/src/modules/progress/progress.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { CourseProgressService } from './course-progress.service';
import { HeartbeatService } from './heartbeat.service';
import { LessonAccessService } from './lesson-access.service';
import { ProgressController } from './progress.controller';

@Module({
  controllers: [ProgressController],
  providers: [LessonAccessService, CourseProgressService, HeartbeatService],
  exports: [LessonAccessService, CourseProgressService],
})
export class ProgressModule {}
```

Register `ProgressModule` in `apps/api/src/app.module.ts`'s `imports`, after `EnrollmentModule`.

- [ ] **Step 7: Run the tests to verify they pass**

```bash
pnpm --filter @ayman/api test heartbeat.service
```
Expected: PASS — 11 tests. If "does not complete a lesson that was scrubbed to the end" is red, **stop and fix it before anything else** — every other guarantee in this plan is downstream of it.

- [ ] **Step 8: Verify the rate limit fires against the running server**

```bash
pnpm dev
for i in $(seq 1 20); do
  curl -s -o /dev/null -w '%{http_code} ' -b /tmp/student.txt -H 'X-CSRF-Token: 1' \
    -H 'content-type: application/json' -d '{"position":10,"delta":10}' \
    http://localhost:3200/api/lessons/<lessonId>/heartbeat
  sleep 0.6
done; echo
```
Expected: fifteen `200`s then `429`s. Record the exact cutover in your report.

Also confirm mass assignment is rejected, not ignored:
```bash
curl -s -b /tmp/student.txt -H 'X-CSRF-Token: 1' -H 'content-type: application/json' \
  -d '{"position":10,"delta":10,"completed":true}' \
  http://localhost:3200/api/lessons/<lessonId>/heartbeat
```
Expected: `400`, with the response naming `completed` as unrecognized.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/progress apps/api/src/app.module.ts
git commit -m "feat(api): server-accumulated heartbeats with the dual-threshold completion rule"
```

---

## Task 6: Open, dwell, and manual completion

Three writes that are not heartbeats: registering that a lesson was opened (which is what makes resume work), the 5000ms dwell that finishes a text or attachment lesson, and the manual button that finishes anything.

**Files:**
- Create: `apps/api/src/modules/progress/lesson-progress.service.ts`
- Create: `apps/api/src/modules/progress/lesson-progress.service.spec.ts`
- Modify: `apps/api/src/modules/progress/progress.controller.ts`, `progress.module.ts`

**Interfaces:**
- Consumes: `LessonAccessService`, `CourseProgressService`, `DWELL_COMPLETE_MS`.
- Produces:
  - `LessonProgressService.open(userId, lessonId): Promise<LessonProgressDto>`
  - `LessonProgressService.completeByDwell(userId, lessonId): Promise<HeartbeatResponse>`
  - `LessonProgressService.completeManually(userId, lessonId): Promise<HeartbeatResponse>`
  - ```ts
    /**
     * RECONCILED — required by Plan 5. Called by Plan 5 Task 12 (submit and
     * autosubmit) and Task 19 (after an appeal regrade). It is the ONLY way a
     * quiz result becomes lesson progress; Plan 5 never writes `lesson_progress`
     * itself.
     *
     * Sets `state` to `passed` or `failed` (never `completed` — a quiz lesson
     * has a pass/fail axis a video lesson does not), writes
     * `completion = scaledScore`, stamps `completedVia = 'auto'` on a pass, and
     * calls `CourseProgressService.recalculate(tx, enrollmentId, courseId)`
     * inside the same transaction so course percentage and lesson state can
     * never disagree. Idempotent: re-recording the same result is a no-op.
     */
    LessonProgressService.recordQuizResult(args: {
      userId: string;
      lessonId: string;
      passed: boolean;
      scaledScore: number;  // 0..1
      gradeOutOf: number;
    }): Promise<void>
    ```
  - `POST /api/lessons/:lessonId/open`, `.../dwell`, `.../complete`

> `recordQuizResult` has **no route** — it is an in-process service call from Plan 5's
> `AttemptService`. Exposing it as an endpoint would let a student POST their own pass.
> `ProgressModule` must therefore `exports: [LessonProgressService, LessonAccessService,
> CourseProgressService]` so `QuizModule` can inject all three.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/progress/lesson-progress.service.spec.ts`:

```ts
import { DWELL_COMPLETE_MS } from '@ayman/contracts/progress';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseProgressService } from './course-progress.service';
import { LessonAccessService } from './lesson-access.service';
import { LessonProgressService } from './lesson-progress.service';

describe('LessonProgressService', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const service = new LessonProgressService(
    prisma,
    new LessonAccessService(prisma),
    new CourseProgressService(),
  );

  let userId = '';
  let courseId = '';
  let enrollmentId = '';
  let textLessonId = '';
  let videoLessonId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();

    const user = await prisma.user.create({
      data: { id: `lp-${stamp}`, name: 'طالب', email: `lp-${stamp}@t.test` },
    });
    userId = user.id;

    const course = await prisma.course.create({
      data: { slug: `lp-course-${stamp}`, title: 'كورس', status: 'published' },
    });
    courseId = course.id;

    const section = await prisma.courseSection.create({
      data: { courseId, title: 'الوحدة', position: 1, isPublished: true },
    });

    const text = await prisma.lesson.create({
      data: {
        courseId,
        sectionId: section.id,
        title: 'ملخص مكتوب',
        kind: 'text',
        position: 1,
        isPublished: true,
        text: { create: { bodyHtml: '<p>محتوى</p>' } },
      },
    });
    textLessonId = text.id;

    const video = await prisma.lesson.create({
      data: {
        courseId,
        sectionId: section.id,
        title: 'فيديو',
        kind: 'video',
        position: 2,
        isPublished: true,
        video: {
          create: { provider: 'youtube', externalId: 'dQw4w9WgXcQ', durationSeconds: 600 },
        },
      },
    });
    videoLessonId = video.id;

    const enrollment = await prisma.enrollment.create({
      data: { userId, courseId, source: 'free', status: 'active' },
    });
    enrollmentId = enrollment.id;
  });

  afterEach(async () => {
    await prisma.lessonProgress.deleteMany({ where: { enrollmentId } });
    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { progressPercent: 0, lastLessonId: null, completedAt: null },
    });
  });

  afterAll(async () => {
    await prisma.enrollment.deleteMany({ where: { courseId } });
    await prisma.lesson.deleteMany({ where: { courseId } });
    await prisma.courseSection.deleteMany({ where: { courseId } });
    await prisma.course.delete({ where: { id: courseId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  describe('open', () => {
    it('creates the row, counts the open, and records the resume point', async () => {
      const progress = await service.open(userId, textLessonId);

      expect(progress.state).toBe('in_progress');
      expect(progress.openCount).toBe(1);

      const enrollment = await prisma.enrollment.findUniqueOrThrow({
        where: { id: enrollmentId },
      });
      expect(enrollment.lastLessonId).toBe(textLessonId);
    });

    it('increments openCount without resetting firstOpenedAt', async () => {
      const first = await service.open(userId, textLessonId);
      const row = await prisma.lessonProgress.findUniqueOrThrow({
        where: { enrollmentId_lessonId: { enrollmentId, lessonId: textLessonId } },
      });
      const originalOpenedAt = row.firstOpenedAt;

      const second = await service.open(userId, textLessonId);

      expect(first.openCount).toBe(1);
      expect(second.openCount).toBe(2);
      const after = await prisma.lessonProgress.findUniqueOrThrow({
        where: { enrollmentId_lessonId: { enrollmentId, lessonId: textLessonId } },
      });
      // Otherwise a student could re-open a text lesson to reset the dwell
      // clock, which is harmless — but it would also erase the real first-open
      // timestamp, which is the only anchor the dwell rule has.
      expect(after.firstOpenedAt?.getTime()).toBe(originalOpenedAt?.getTime());
    });

    it('does not demote a completed lesson back to in_progress', async () => {
      await service.open(userId, textLessonId);
      await service.completeManually(userId, textLessonId);

      const reopened = await service.open(userId, textLessonId);

      expect(reopened.state).toBe('completed');
      expect(reopened.completedVia).toBe('manual');
    });
  });

  describe('completeByDwell', () => {
    it('refuses before 5000ms have actually elapsed', async () => {
      await service.open(userId, textLessonId);

      const response = await service.completeByDwell(userId, textLessonId);

      expect(response.justCompleted).toBe(false);
      expect(response.progress.state).toBe('in_progress');
      expect(response.progress.completedAt).toBeNull();
    });

    it('completes once the SERVER has measured 5000ms since the open', async () => {
      await service.open(userId, textLessonId);
      // Move first_opened_at into the past. The service reads its own clock —
      // there is no client-reported dwell duration to fake instead.
      await prisma.$executeRaw`
        UPDATE app.lesson_progress
           SET first_opened_at = now() - make_interval(secs => ${DWELL_COMPLETE_MS / 1000 + 1}::double precision)
         WHERE enrollment_id = ${enrollmentId}::uuid AND lesson_id = ${textLessonId}::uuid
      `;

      const response = await service.completeByDwell(userId, textLessonId);

      expect(response.justCompleted).toBe(true);
      expect(response.progress.state).toBe('completed');
      expect(response.progress.completion).toBe(1);
      expect(response.progress.completedVia).toBe('dwell');
      expect(response.courseProgressPercent).toBe(50); // one of two lessons
    });

    it('rejects a dwell claim on a video lesson', async () => {
      await service.open(userId, videoLessonId);

      // A video is finished by watching it, not by sitting on the page.
      await expect(service.completeByDwell(userId, videoLessonId)).rejects.toMatchObject({
        status: 400,
      });
    });

    it('404s for a lesson the caller is not enrolled in', async () => {
      const stranger = await prisma.user.create({
        data: { id: `str-${Date.now()}`, name: 'غريب', email: `str-${Date.now()}@t.test` },
      });

      await expect(service.completeByDwell(stranger.id, textLessonId)).rejects.toMatchObject({
        status: 404,
      });

      await prisma.user.delete({ where: { id: stranger.id } });
    });
  });

  describe('completeManually', () => {
    it('completes any lesson kind and records it as manual', async () => {
      await service.open(userId, videoLessonId);

      const response = await service.completeManually(userId, videoLessonId);

      expect(response.justCompleted).toBe(true);
      expect(response.progress.completion).toBe(1);
      expect(response.progress.completedVia).toBe('manual');
      // Watch counters are untouched: the student claimed the lesson, they did
      // not watch it, and blending the two would destroy the only signal we
      // have about whether content is actually being consumed.
      expect(response.progress.watchedSeconds).toBe(0);
    });

    it('is idempotent and does not rewrite completedAt', async () => {
      await service.open(userId, videoLessonId);
      const first = await service.completeManually(userId, videoLessonId);
      const second = await service.completeManually(userId, videoLessonId);

      expect(second.justCompleted).toBe(false);
      expect(second.progress.completedAt).toBe(first.progress.completedAt);
    });

    it('does not downgrade a lesson already earned automatically', async () => {
      await prisma.lessonProgress.create({
        data: {
          enrollmentId,
          lessonId: videoLessonId,
          completion: 1,
          state: 'completed',
          watchedSeconds: 600,
          maxPositionSeconds: 600,
          openCount: 1,
          completedAt: new Date(),
          completedVia: 'auto',
        },
      });

      const response = await service.completeManually(userId, videoLessonId);

      expect(response.progress.completedVia).toBe('auto');
    });

    it('moves the course percentage as lessons complete', async () => {
      await service.open(userId, textLessonId);
      const half = await service.completeManually(userId, textLessonId);
      expect(half.courseProgressPercent).toBe(50);

      await service.open(userId, videoLessonId);
      const full = await service.completeManually(userId, videoLessonId);
      expect(full.courseProgressPercent).toBe(100);

      const enrollment = await prisma.enrollment.findUniqueOrThrow({
        where: { id: enrollmentId },
      });
      expect(enrollment.completedAt).not.toBeNull();
      // Finishing a course must never revoke access to it.
      expect(enrollment.status).toBe('active');
    });
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
pnpm --filter @ayman/api test lesson-progress.service
```
Expected: FAIL — `Cannot find module './lesson-progress.service'`.

- [ ] **Step 3: Implement**

Create `apps/api/src/modules/progress/lesson-progress.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import type { HeartbeatResponse, LessonProgressDto } from '@ayman/contracts';
import { DWELL_COMPLETE_MS } from '@ayman/contracts/progress';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseProgressService } from './course-progress.service';
import { LessonAccessService, type LessonAccessContext } from './lesson-access.service';
import { PROGRESS_SELECT, toProgressDto, type ProgressRow } from './progress.mapper';

/** Kinds a dwell timer may finish. A video is finished by watching it. */
const DWELL_COMPLETABLE_KINDS = new Set(['text', 'attachment']);

@Injectable()
export class LessonProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LessonAccessService,
    private readonly courseProgress: CourseProgressService,
  ) {}

  /**
   * Called once when the player mounts. Two jobs: count the open (a signal
   * admin analytics will want, and the `view_limit` field reserved on
   * `lessons` will eventually enforce against), and write
   * `enrollment.lastLessonId` — which is the entire mechanism behind resume
   * and the dashboard's continue-watching card.
   */
  async open(userId: string, lessonId: string): Promise<LessonProgressDto> {
    const context = await this.access.require(userId, lessonId);
    const now = new Date();

    const [row] = await this.prisma.$transaction([
      this.prisma.lessonProgress.upsert({
        where: {
          enrollmentId_lessonId: {
            enrollmentId: context.enrollmentId,
            lessonId: context.lessonId,
          },
        },
        create: {
          enrollmentId: context.enrollmentId,
          lessonId: context.lessonId,
          state: 'in_progress',
          openCount: 1,
          firstOpenedAt: now,
          lastHeartbeatAt: now,
        },
        update: {
          openCount: { increment: 1 },
          // `firstOpenedAt` is written on create only — it is the dwell rule's
          // one anchor, and re-opening a lesson must not move it.
          lastHeartbeatAt: now,
        },
        select: PROGRESS_SELECT,
      }),
      this.prisma.enrollment.update({
        where: { id: context.enrollmentId },
        data: { lastLessonId: context.lessonId },
        select: { id: true },
      }),
    ]);

    // A completed lesson stays completed when reopened. Prisma has no
    // conditional update expression, so the demotion is avoided by simply
    // never writing `state` on the update branch above; `not_started` rows
    // are moved forward here instead.
    if (row.state === 'not_started') {
      const promoted = await this.prisma.lessonProgress.update({
        where: {
          enrollmentId_lessonId: {
            enrollmentId: context.enrollmentId,
            lessonId: context.lessonId,
          },
        },
        data: { state: 'in_progress' },
        select: PROGRESS_SELECT,
      });
      return toProgressDto(promoted as ProgressRow);
    }

    return toProgressDto(row as ProgressRow);
  }

  /**
   * The 5000ms dwell for text and attachment lessons.
   *
   * Takes no body at all. The elapsed time is measured server-side from
   * `first_opened_at`, so there is no client-reported duration to forge — the
   * fastest possible completion of a text lesson is five real seconds after
   * the open request landed.
   */
  async completeByDwell(userId: string, lessonId: string): Promise<HeartbeatResponse> {
    const context = await this.access.require(userId, lessonId);

    if (!DWELL_COMPLETABLE_KINDS.has(context.kind)) {
      throw new BadRequestException('this lesson kind is not completed by dwelling');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.lessonProgress.findUnique({
        where: {
          enrollmentId_lessonId: {
            enrollmentId: context.enrollmentId,
            lessonId: context.lessonId,
          },
        },
        select: { ...PROGRESS_SELECT, firstOpenedAt: true },
      });

      const openedAt = existing?.firstOpenedAt;
      const elapsedMs = openedAt ? Date.now() - openedAt.getTime() : 0;

      if (!existing || existing.completedAt != null || elapsedMs < DWELL_COMPLETE_MS) {
        // Not an error: the client is allowed to ask early and retry. It just
        // gets the unchanged truth back.
        return this.unchanged(tx, context, existing as ProgressRow | null);
      }

      return this.markComplete(tx, context, 'dwell');
    });
  }

  /**
   * The always-available "أنهيت الدرس · التالي" button (Global Constraint 14).
   *
   * Yes, this lets a student mark a video complete without watching it — and
   * that is deliberate. The point of the dual-threshold rule is not to make
   * completion unreachable, it is to make an *automatic* completion mean
   * something. `completedVia = 'manual'` keeps the two permanently separable,
   * so "how much of this course is actually being watched?" stays answerable.
   */
  async completeManually(userId: string, lessonId: string): Promise<HeartbeatResponse> {
    const context = await this.access.require(userId, lessonId);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.lessonProgress.findUnique({
        where: {
          enrollmentId_lessonId: {
            enrollmentId: context.enrollmentId,
            lessonId: context.lessonId,
          },
        },
        select: PROGRESS_SELECT,
      });

      if (existing?.completedAt != null) {
        // Idempotent: a double-click must not rewrite completedAt or overwrite
        // an `auto` completion with `manual`.
        return this.unchanged(tx, context, existing as ProgressRow);
      }

      return this.markComplete(tx, context, 'manual');
    });
  }

  private async markComplete(
    tx: Prisma.TransactionClient,
    context: LessonAccessContext,
    via: 'manual' | 'dwell',
  ): Promise<HeartbeatResponse> {
    const now = new Date();

    const row = await tx.lessonProgress.upsert({
      where: {
        enrollmentId_lessonId: {
          enrollmentId: context.enrollmentId,
          lessonId: context.lessonId,
        },
      },
      create: {
        enrollmentId: context.enrollmentId,
        lessonId: context.lessonId,
        completion: 1,
        state: 'completed',
        openCount: 1,
        firstOpenedAt: now,
        completedAt: now,
        completedVia: via,
      },
      update: {
        completion: 1,
        state: 'completed',
        completedAt: now,
        completedVia: via,
        // watchedSeconds / maxPositionSeconds are untouched on purpose.
      },
      select: PROGRESS_SELECT,
    });

    const courseProgressPercent = await this.courseProgress.recalculate(
      tx,
      context.enrollmentId,
      context.courseId,
    );

    return { progress: toProgressDto(row as ProgressRow), justCompleted: true, courseProgressPercent };
  }

  private async unchanged(
    tx: Prisma.TransactionClient,
    context: LessonAccessContext,
    row: ProgressRow | null,
  ): Promise<HeartbeatResponse> {
    const enrollment = await tx.enrollment.findUniqueOrThrow({
      where: { id: context.enrollmentId },
      select: { progressPercent: true },
    });

    return {
      progress: row
        ? toProgressDto(row)
        : {
            lessonId: context.lessonId,
            state: 'not_started',
            completion: 0,
            watchedSeconds: 0,
            maxPositionSeconds: 0,
            openCount: 0,
            completedAt: null,
            completedVia: null,
          },
      justCompleted: false,
      courseProgressPercent: Number(enrollment.progressPercent),
    };
  }
}
```

- [ ] **Step 4: Add the three routes**

Append to `apps/api/src/modules/progress/progress.controller.ts`, and add `LessonProgressService` to the constructor:

```ts
  /** Called once when the player mounts. Cheap, and the basis of resume. */
  @RequirePermission('progress:write')
  @Post(':lessonId/open')
  @UsePipes(ZodValidationPipe)
  open(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId') lessonId: string,
    @Body() _body: EmptyBodyDto,
  ): Promise<LessonProgressDto> {
    return this.lessonProgress.open(user.id, lessonId);
  }

  /**
   * The 5000ms dwell. The body is EMPTY and strict — the elapsed time is
   * measured server-side, so there is deliberately nothing here for a client
   * to report or forge.
   */
  @RequirePermission('progress:write')
  @Throttle({ short: { limit: 2, ttl: seconds(1) }, medium: { limit: 20, ttl: seconds(60) } })
  @Post(':lessonId/dwell')
  @UsePipes(ZodValidationPipe)
  dwell(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId') lessonId: string,
    @Body() _body: EmptyBodyDto,
  ): Promise<HeartbeatResponse> {
    return this.lessonProgress.completeByDwell(user.id, lessonId);
  }

  /**
   * "أنهيت الدرس · التالي". `EmptyBodyDto` is `.strict()`, so the realistic
   * mass-assignment attempt — `{completed: true}`, `{score: 100}` — is a 400
   * here rather than a field that silently lands somewhere.
   */
  @RequirePermission('progress:write')
  @Post(':lessonId/complete')
  @UsePipes(ZodValidationPipe)
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId') lessonId: string,
    @Body() _body: EmptyBodyDto,
  ): Promise<HeartbeatResponse> {
    return this.lessonProgress.completeManually(user.id, lessonId);
  }
```

Add `LessonProgressService` to `progress.module.ts`'s `providers` and `exports`.

- [ ] **Step 5: Run the tests, confirm green**

```bash
pnpm --filter @ayman/api test lesson-progress.service
```
Expected: PASS — 11 tests.

- [ ] **Step 6: Prove the mass-assignment rejection on the wire**

```bash
curl -s -b /tmp/student.txt -H 'X-CSRF-Token: 1' -H 'content-type: application/json' \
  -d '{"score":100}' http://localhost:3200/api/lessons/<lessonId>/complete
```
Expected: `400`. Then with `-d '{}'`: a completed progress row. Record both.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/progress
git commit -m "feat(api): lesson open, server-measured dwell completion, and the manual finish button"
```

---

## Task 7: The player payload endpoints

**Files:**
- Create: `apps/api/src/common/media/media-url.ts`
- Create: `apps/api/src/modules/player/{player.service.ts,player.controller.ts,player.module.ts}`
- Create: `apps/api/src/modules/player/player.service.spec.ts`
- Modify: `apps/api/src/config/env.ts`, `apps/api/.env.example`, `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `LessonAccessService`, Plan 3's content models.
- Produces:
  - `PlayerService.outline(userId, courseSlug): Promise<CourseOutline>`
  - `PlayerService.lesson(userId, lessonId): Promise<LessonPlayer>`
  - `GET /api/courses/:slug/outline`, `GET /api/lessons/:lessonId/player`
  - `GET /api/lessons/:lessonId/attachments/:attachmentId` → 302 to storage
  - `MEDIA_URL_RESOLVER` injection token + `EnvMediaUrlResolver`
  - `MEDIA_BASE_URL` env var

- [ ] **Step 1: Add the media URL port**

Create `apps/api/src/common/media/media-url.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { loadEnv } from '../../config/env';

/**
 * Turns a stored object key into a URL. A port rather than a function because
 * the destination is going to change: today it is a static base URL, tomorrow
 * it is a signed, expiring URL from whatever bucket the media library lands
 * on. Everything upstream depends on this interface, not on the mechanism.
 *
 * Storage keys — never full URLs — are what the database holds (§6.7), so the
 * origin is a deployment decision and moving buckets is an env change.
 */
export interface MediaUrlResolver {
  resolve(storageKey: string): string;
}

export const MEDIA_URL_RESOLVER = Symbol('MEDIA_URL_RESOLVER');

@Injectable()
export class EnvMediaUrlResolver implements MediaUrlResolver {
  private readonly base: string;

  constructor() {
    // Spec §7 P6: media is served from a DIFFERENT origin than the app,
    // because a same-origin HTML upload is same-origin XSS regardless of CSP.
    this.base = loadEnv(process.env).MEDIA_BASE_URL.replace(/\/+$/, '');
  }

  resolve(storageKey: string): string {
    return `${this.base}/${storageKey.replace(/^\/+/, '')}`;
  }
}

/** Convenience decorator so consumers do not repeat the token. */
export const InjectMediaUrl = (): ParameterDecorator => Inject(MEDIA_URL_RESOLVER);
```

Add to the Zod schema in `apps/api/src/config/env.ts`:
```ts
  /** Origin that serves uploaded media. Deliberately not the app origin. */
  MEDIA_BASE_URL: z.url().default('http://localhost:3301/media'),
```
and to `.env.example`:
```bash
# ── media ─────────────────────────────────────────────────────────────
# A DIFFERENT origin from the app: a same-origin HTML upload is same-origin XSS.
MEDIA_BASE_URL="http://localhost:3301/media"
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/modules/player/player.service.spec.ts`:

```ts
import { CourseOutlineSchema, LessonPlayerSchema } from '@ayman/contracts/progress';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { PlayerService } from './player.service';

describe('PlayerService', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const service = new PlayerService(prisma, new LessonAccessService(prisma), {
    resolve: (key) => `https://media.test/${key}`,
  });

  let userId = '';
  let strangerId = '';
  let courseId = '';
  let courseSlug = '';
  let enrollmentId = '';
  const lessons: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();
    courseSlug = `pl-course-${stamp}`;

    userId = (
      await prisma.user.create({
        data: { id: `pl-${stamp}`, name: 'طالب', email: `pl-${stamp}@t.test` },
      })
    ).id;
    strangerId = (
      await prisma.user.create({
        data: { id: `pls-${stamp}`, name: 'غريب', email: `pls-${stamp}@t.test` },
      })
    ).id;

    courseId = (
      await prisma.course.create({
        data: { slug: courseSlug, title: 'أساسيات البرمجة', status: 'published' },
      })
    ).id;

    const one = await prisma.courseSection.create({
      data: { courseId, title: 'الوحدة الأولى', position: 1, isPublished: true },
    });
    const two = await prisma.courseSection.create({
      data: { courseId, title: 'الوحدة الثانية', position: 2, isPublished: true },
    });

    const a = await prisma.lesson.create({
      data: {
        courseId,
        sectionId: one.id,
        title: 'مقدمة',
        kind: 'video',
        position: 1,
        isPublished: true,
        estimatedSeconds: 600,
        video: {
          create: {
            provider: 'youtube',
            externalId: 'dQw4w9WgXcQ',
            durationSeconds: 600,
            posterKey: 'posters/a.webp',
          },
        },
        attachments: {
          create: {
            storageKey: 'files/slides.pdf',
            filename: 'slides.pdf',
            mime: 'application/pdf',
            sizeBytes: 1024,
            position: 1,
          },
        },
      },
    });
    const b = await prisma.lesson.create({
      data: {
        courseId,
        sectionId: one.id,
        title: 'ملخص',
        kind: 'text',
        position: 2,
        isPublished: true,
        text: { create: { bodyHtml: '<p>ملخص الوحدة</p>' } },
      },
    });
    const c = await prisma.lesson.create({
      data: {
        courseId,
        sectionId: two.id,
        title: 'اختبار',
        kind: 'quiz',
        position: 1,
        isPublished: true,
      },
    });
    // Unpublished — must never appear in the outline or in neighbour links.
    await prisma.lesson.create({
      data: {
        courseId,
        sectionId: two.id,
        title: 'مسودة',
        kind: 'video',
        position: 2,
        isPublished: false,
      },
    });
    lessons.push(a.id, b.id, c.id);

    enrollmentId = (
      await prisma.enrollment.create({
        data: { userId, courseId, source: 'free', status: 'active' },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.lessonProgress.deleteMany({ where: { enrollmentId } });
    await prisma.enrollment.deleteMany({ where: { courseId } });
    await prisma.lesson.deleteMany({ where: { courseId } });
    await prisma.courseSection.deleteMany({ where: { courseId } });
    await prisma.course.delete({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, strangerId] } } });
    await prisma.$disconnect();
  });

  describe('outline', () => {
    it('matches the shared contract exactly', async () => {
      const outline = await service.outline(userId, courseSlug);
      expect(() => CourseOutlineSchema.parse(outline)).not.toThrow();
    });

    it('orders sections and lessons by position and hides unpublished lessons', async () => {
      const outline = await service.outline(userId, courseSlug);

      expect(outline.sections.map((s) => s.title)).toEqual(['الوحدة الأولى', 'الوحدة الثانية']);
      expect(outline.sections[0]?.lessons.map((l) => l.title)).toEqual(['مقدمة', 'ملخص']);
      expect(outline.sections[1]?.lessons.map((l) => l.title)).toEqual(['اختبار']);
      expect(outline.totalLessons).toBe(3);
    });

    it('reports every lesson as not_started before anything is opened', async () => {
      const outline = await service.outline(userId, courseSlug);
      const states = outline.sections.flatMap((s) => s.lessons.map((l) => l.state));
      expect(states.every((state) => state === 'not_started')).toBe(true);
      expect(outline.completedLessons).toBe(0);
    });

    it('404s for a stranger rather than exposing the structure', async () => {
      await expect(service.outline(strangerId, courseSlug)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('lesson', () => {
    it('matches the shared contract exactly', async () => {
      const payload = await service.lesson(userId, lessons[0]!);
      expect(() => LessonPlayerSchema.parse(payload)).not.toThrow();
    });

    it('returns the bare 11-char YouTube id, never a URL', async () => {
      const payload = await service.lesson(userId, lessons[0]!);
      expect(payload.video?.youtubeId).toBe('dQw4w9WgXcQ');
      expect(payload.video?.youtubeId).not.toContain('http');
      expect(payload.video?.posterUrl).toBe('https://media.test/posters/a.webp');
      expect(payload.autoCompleteAvailable).toBe(true);
    });

    it('serves attachments through an ownership-checked path, not a storage URL', async () => {
      const payload = await service.lesson(userId, lessons[0]!);
      const attachment = payload.attachments[0];

      expect(attachment?.downloadPath).toBe(
        `/api/lessons/${lessons[0]}/attachments/${attachment?.id}`,
      );
      // A leaked storage key must not be an access grant in itself.
      expect(JSON.stringify(payload)).not.toContain('files/slides.pdf');
    });

    it('links neighbours across a section boundary and stops at the ends', async () => {
      const first = await service.lesson(userId, lessons[0]!);
      expect(first.previous).toBeNull();
      expect(first.next?.id).toBe(lessons[1]);

      const middle = await service.lesson(userId, lessons[1]!);
      expect(middle.previous?.id).toBe(lessons[0]);
      // Crosses from الوحدة الأولى into الوحدة الثانية.
      expect(middle.next?.id).toBe(lessons[2]);

      const last = await service.lesson(userId, lessons[2]!);
      expect(last.previous?.id).toBe(lessons[1]);
      // The unpublished draft after it must not become the "next" lesson.
      expect(last.next).toBeNull();
    });

    it('disables auto-completion when the duration is unknown', async () => {
      await prisma.lessonVideo.update({
        where: { lessonId: lessons[0]! },
        data: { durationSeconds: 0 },
      });

      const payload = await service.lesson(userId, lessons[0]!);
      expect(payload.autoCompleteAvailable).toBe(false);

      await prisma.lessonVideo.update({
        where: { lessonId: lessons[0]! },
        data: { durationSeconds: 600 },
      });
    });

    it('never leaks a quiz answer key through the player payload', async () => {
      const payload = await service.lesson(userId, lessons[2]!);
      const raw = JSON.stringify(payload);

      // Contract test, spec §7 P2. It costs nothing now and it is the exact
      // assertion that will matter once the quiz builder lands.
      expect(raw).not.toContain('fraction');
      expect(raw).not.toContain('isCorrect');
      expect(raw).not.toContain('feedback');
      expect(payload.video).toBeNull();
      expect(payload.text).toBeNull();
    });

    it('404s for a stranger', async () => {
      await expect(service.lesson(strangerId, lessons[0]!)).rejects.toMatchObject({ status: 404 });
    });
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

```bash
pnpm --filter @ayman/api test player.service
```
Expected: FAIL — `Cannot find module './player.service'`.

- [ ] **Step 4: Implement the service**

Create `apps/api/src/modules/player/player.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CourseOutline,
  LessonKind,
  LessonPlayer,
  LessonProgressState,
  OutlineSection,
} from '@ayman/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import {
  InjectMediaUrl,
  type MediaUrlResolver,
} from '../../common/media/media-url';
import { ACTIVE_ENROLLMENT_STATUSES } from '../enrollment/enrollment.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { toProgressDto, type ProgressRow } from '../progress/progress.mapper';

interface FlatLesson {
  id: string;
  title: string;
  kind: LessonKind;
}

@Injectable()
export class PlayerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LessonAccessService,
    @InjectMediaUrl() private readonly media: MediaUrlResolver,
  ) {}

  /**
   * The sidebar payload. Fetched once per course and reused across lesson
   * navigations, which is why it is a separate endpoint from the lesson body:
   * moving between lessons must not refetch the whole structure.
   */
  async outline(userId: string, courseSlug: string): Promise<CourseOutline> {
    const course = await this.prisma.course.findFirst({
      where: {
        slug: courseSlug,
        status: 'published',
        enrollments: { some: { userId, status: { in: [...ACTIVE_ENROLLMENT_STATUSES] } } },
      },
      select: {
        id: true,
        slug: true,
        title: true,
        enrollments: {
          where: { userId, status: { in: [...ACTIVE_ENROLLMENT_STATUSES] } },
          select: { id: true, progressPercent: true, lastLessonId: true },
          take: 1,
        },
        sections: {
          where: { isPublished: true },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            title: true,
            position: true,
            lessons: {
              where: { isPublished: true },
              orderBy: [{ position: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                title: true,
                kind: true,
                position: true,
                estimatedSeconds: true,
                isFreePreview: true,
              },
            },
          },
        },
      },
    });

    const enrollment = course?.enrollments[0];
    if (!course || !enrollment) {
      throw new NotFoundException('course not found');
    }

    // One extra query rather than a per-lesson subquery: a course has tens of
    // lessons, and fetching the student's whole progress set at once keeps
    // this endpoint at two round trips regardless of course size.
    const progressRows = await this.prisma.lessonProgress.findMany({
      where: { enrollmentId: enrollment.id },
      select: { lessonId: true, state: true, completion: true },
    });
    const progressByLesson = new Map(progressRows.map((row) => [row.lessonId, row]));

    let completedLessons = 0;
    let totalLessons = 0;

    const sections: OutlineSection[] = course.sections.map((section) => ({
      id: section.id,
      title: section.title,
      position: section.position,
      lessons: section.lessons.map((lesson) => {
        const progress = progressByLesson.get(lesson.id);
        const state = (progress?.state ?? 'not_started') as LessonProgressState;
        totalLessons += 1;
        if (state === 'completed' || state === 'passed') completedLessons += 1;

        return {
          id: lesson.id,
          title: lesson.title,
          kind: lesson.kind as LessonKind,
          position: lesson.position,
          estimatedSeconds: lesson.estimatedSeconds,
          isFreePreview: lesson.isFreePreview,
          state,
          completion: Number(progress?.completion ?? 0),
        };
      }),
    }));

    return {
      course: { id: course.id, slug: course.slug, title: course.title },
      sections,
      enrollmentId: enrollment.id,
      progressPercent: Number(enrollment.progressPercent),
      lastLessonId: enrollment.lastLessonId,
      completedLessons,
      totalLessons,
    };
  }

  /**
   * The lesson body plus its neighbours. Ownership comes from
   * `LessonAccessService` first, so the detailed query below never runs for a
   * caller who has no business seeing it.
   */
  async lesson(userId: string, lessonId: string): Promise<LessonPlayer> {
    const context = await this.access.require(userId, lessonId);

    const [lesson, ordered, progress] = await Promise.all([
      this.prisma.lesson.findUniqueOrThrow({
        where: { id: context.lessonId },
        // Explicit select, never include — spec §7 P2. Nothing that is not
        // named here can ever reach a response, including anything the quiz
        // tables will later hang off this model.
        select: {
          id: true,
          title: true,
          kind: true,
          courseId: true,
          estimatedSeconds: true,
          course: { select: { slug: true, title: true } },
          section: { select: { title: true } },
          video: { select: { externalId: true, durationSeconds: true, posterKey: true } },
          text: { select: { bodyHtml: true } },
          attachments: {
            orderBy: [{ position: 'asc' }, { id: 'asc' }],
            select: { id: true, filename: true, mime: true, sizeBytes: true },
          },
        },
      }),
      this.orderedLessons(context.courseId),
      this.prisma.lessonProgress.findUnique({
        where: {
          enrollmentId_lessonId: {
            enrollmentId: context.enrollmentId,
            lessonId: context.lessonId,
          },
        },
        select: {
          lessonId: true,
          state: true,
          completion: true,
          watchedSeconds: true,
          maxPositionSeconds: true,
          openCount: true,
          completedAt: true,
          completedVia: true,
        },
      }),
    ]);

    const index = ordered.findIndex((entry) => entry.id === context.lessonId);
    const duration = lesson.video?.durationSeconds ?? 0;

    return {
      lesson: {
        id: lesson.id,
        courseId: lesson.courseId,
        courseSlug: lesson.course.slug,
        courseTitle: lesson.course.title,
        sectionTitle: lesson.section.title,
        title: lesson.title,
        kind: lesson.kind as LessonKind,
        estimatedSeconds: lesson.estimatedSeconds,
      },
      video: lesson.video
        ? {
            // §7 P3: the 11-char id is what the database holds and what we
            // emit. The embed URL is reconstructed on the client from this id
            // — a stored URL would reintroduce the whole SSRF class.
            youtubeId: lesson.video.externalId,
            durationSeconds: duration,
            posterUrl: lesson.video.posterKey
              ? this.media.resolve(lesson.video.posterKey)
              : null,
          }
        : null,
      text: lesson.text ? { bodyHtml: lesson.text.bodyHtml } : null,
      attachments: lesson.attachments.map((attachment) => ({
        id: attachment.id,
        filename: attachment.filename,
        mime: attachment.mime,
        sizeBytes: attachment.sizeBytes,
        // Never the storage URL: the download route re-checks enrollment, so
        // a key that leaks is not by itself an access grant.
        downloadPath: `/api/lessons/${lesson.id}/attachments/${attachment.id}`,
      })),
      progress: progress
        ? toProgressDto(progress as ProgressRow)
        : {
            lessonId: lesson.id,
            state: 'not_started',
            completion: 0,
            watchedSeconds: 0,
            maxPositionSeconds: 0,
            openCount: 0,
            completedAt: null,
            completedVia: null,
          },
      previous: index > 0 ? (ordered[index - 1] ?? null) : null,
      next: index >= 0 && index < ordered.length - 1 ? (ordered[index + 1] ?? null) : null,
      // False when the duration is unknown: the thresholds are ratios, so a
      // zero duration would make them meaningless. The manual button carries
      // such a lesson instead.
      autoCompleteAvailable: lesson.kind === 'video' && duration > 0,
    };
  }

  /**
   * Every published lesson of a course in reading order — section position,
   * then lesson position, then id as a stable tie-break (never index-based
   * keys, never a CSV sequence column).
   */
  private async orderedLessons(courseId: string): Promise<FlatLesson[]> {
    const rows = await this.prisma.lesson.findMany({
      where: { courseId, isPublished: true, section: { isPublished: true } },
      orderBy: [{ section: { position: 'asc' } }, { position: 'asc' }, { id: 'asc' }],
      select: { id: true, title: true, kind: true },
    });
    return rows.map((row) => ({ id: row.id, title: row.title, kind: row.kind as LessonKind }));
  }

  /**
   * Resolves an attachment to its storage URL, but only for a caller who is
   * actually enrolled. This is why attachments are not linked directly: the
   * authorization decision has to happen per request, on our origin.
   */
  async attachmentUrl(userId: string, lessonId: string, attachmentId: string): Promise<string> {
    const context = await this.access.require(userId, lessonId);

    const attachment = await this.prisma.lessonAttachment.findFirst({
      where: { id: attachmentId, lessonId: context.lessonId },
      select: { storageKey: true },
    });
    if (!attachment) {
      throw new NotFoundException('attachment not found');
    }

    return this.media.resolve(attachment.storageKey);
  }
}
```

- [ ] **Step 5: Implement the controller and module**

`apps/api/src/modules/player/player.controller.ts`:
```ts
import { Controller, Get, Param, Redirect } from '@nestjs/common';
import type { CourseOutline, LessonPlayer } from '@ayman/contracts';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PlayerService } from './player.service';

@Controller()
export class PlayerController {
  constructor(private readonly player: PlayerService) {}

  @RequirePermission('course:read')
  @Get('courses/:slug/outline')
  outline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
  ): Promise<CourseOutline> {
    return this.player.outline(user.id, slug);
  }

  @RequirePermission('course:read')
  @Get('lessons/:lessonId/player')
  lesson(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId') lessonId: string,
  ): Promise<LessonPlayer> {
    return this.player.lesson(user.id, lessonId);
  }

  /**
   * 302 rather than proxying the bytes: the app process should never sit in
   * the path of a 40MB PDF. The authorization decision still happens here, on
   * our origin, before the redirect is issued.
   */
  @RequirePermission('course:read')
  @Get('lessons/:lessonId/attachments/:attachmentId')
  @Redirect()
  async attachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId') lessonId: string,
    @Param('attachmentId') attachmentId: string,
  ): Promise<{ url: string; statusCode: number }> {
    return {
      url: await this.player.attachmentUrl(user.id, lessonId, attachmentId),
      statusCode: 302,
    };
  }
}
```

`apps/api/src/modules/player/player.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { EnvMediaUrlResolver, MEDIA_URL_RESOLVER } from '../../common/media/media-url';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { ProgressModule } from '../progress/progress.module';
import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';

@Module({
  imports: [ProgressModule, EnrollmentModule],
  controllers: [PlayerController],
  providers: [PlayerService, { provide: MEDIA_URL_RESOLVER, useClass: EnvMediaUrlResolver }],
  exports: [PlayerService, MEDIA_URL_RESOLVER],
})
export class PlayerModule {}
```

Register `PlayerModule` in `app.module.ts`'s `imports`.

- [ ] **Step 6: Run the tests, confirm green**

```bash
pnpm --filter @ayman/api test player.service
```
Expected: PASS — 11 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/player apps/api/src/common/media \
        apps/api/src/config/env.ts apps/api/.env.example apps/api/src/app.module.ts
git commit -m "feat(api): course outline and lesson player payloads with ownership-checked attachments"
```

---

## Task 8: The dashboard endpoint

**Files:**
- Create: `apps/api/src/modules/dashboard/{dashboard.service.ts,dashboard.controller.ts,dashboard.module.ts,score-feed.ts}`
- Create: `apps/api/src/modules/dashboard/dashboard.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Produces:
  - `DashboardService.forUser(userId: string): Promise<Dashboard>`
  - `GET /api/me/dashboard` → `Dashboard`
  - `SCORE_FEED` injection token + `ScoreFeed` interface + `EmptyScoreFeed`

- [ ] **Step 1: Define the score feed port**

Create `apps/api/src/modules/dashboard/score-feed.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { RecentScore } from '@ayman/contracts';

/**
 * Where the dashboard's "آخر النتائج" rail gets its data.
 *
 * Quiz attempts do not exist yet — they arrive with the quiz runner. Rather
 * than leaving a hole in the contract, the dependency is expressed as a port
 * with a correct implementation for the system as it currently is: a student
 * who has taken no quizzes has no recent scores, which is also exactly what a
 * brand-new student will see forever. The empty state is real UI that has to
 * exist regardless.
 *
 * RECONCILED — Plan 5 Task 12 rebinds SCORE_FEED to a `quiz_attempts`-backed
 * implementation. That is ONE line in `DashboardModule`'s providers array:
 *   { provide: SCORE_FEED, useClass: QuizScoreFeed }
 * No contract change, no UI change. The signature below is frozen: Plan 5's
 * `QuizScoreFeed` must implement exactly `recentFor(userId, limit)` returning
 * `RecentScore[]`, and `DashboardModule` must import `QuizModule` to get it.
 */
export interface ScoreFeed {
  recentFor(userId: string, limit: number): Promise<RecentScore[]>;
}

export const SCORE_FEED = Symbol('SCORE_FEED');

@Injectable()
export class EmptyScoreFeed implements ScoreFeed {
  async recentFor(): Promise<RecentScore[]> {
    return [];
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/modules/dashboard/dashboard.service.spec.ts`:

```ts
import { DashboardSchema } from '@ayman/contracts/progress';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardService } from './dashboard.service';
import { EmptyScoreFeed } from './score-feed';

describe('DashboardService', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const service = new DashboardService(prisma, new EmptyScoreFeed());

  let userId = '';
  let strangerId = '';
  let courseId = '';
  let courseSlug = '';
  let enrollmentId = '';
  let videoLessonId = '';
  let secondLessonId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();
    courseSlug = `db-course-${stamp}`;

    userId = (
      await prisma.user.create({
        data: { id: `db-${stamp}`, name: 'طالب', email: `db-${stamp}@t.test` },
      })
    ).id;
    strangerId = (
      await prisma.user.create({
        data: { id: `dbs-${stamp}`, name: 'غريب', email: `dbs-${stamp}@t.test` },
      })
    ).id;

    courseId = (
      await prisma.course.create({
        data: { slug: courseSlug, title: 'كورس البرمجة', status: 'published' },
      })
    ).id;
    const section = await prisma.courseSection.create({
      data: { courseId, title: 'الوحدة', position: 1, isPublished: true },
    });

    videoLessonId = (
      await prisma.lesson.create({
        data: {
          courseId,
          sectionId: section.id,
          title: 'الدرس الأول',
          kind: 'video',
          position: 1,
          isPublished: true,
          video: {
            create: { provider: 'youtube', externalId: 'dQw4w9WgXcQ', durationSeconds: 600 },
          },
        },
      })
    ).id;
    secondLessonId = (
      await prisma.lesson.create({
        data: {
          courseId,
          sectionId: section.id,
          title: 'الدرس الثاني',
          kind: 'text',
          position: 2,
          isPublished: true,
        },
      })
    ).id;

    enrollmentId = (
      await prisma.enrollment.create({
        data: { userId, courseId, source: 'free', status: 'active' },
      })
    ).id;
  });

  afterEach(async () => {
    await prisma.lessonProgress.deleteMany({ where: { enrollmentId } });
    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { lastLessonId: null, progressPercent: 0 },
    });
  });

  afterAll(async () => {
    await prisma.enrollment.deleteMany({ where: { courseId } });
    await prisma.lesson.deleteMany({ where: { courseId } });
    await prisma.courseSection.deleteMany({ where: { courseId } });
    await prisma.course.delete({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, strangerId] } } });
    await prisma.$disconnect();
  });

  it('matches the shared contract exactly', async () => {
    const dashboard = await service.forUser(userId);
    expect(() => DashboardSchema.parse(dashboard)).not.toThrow();
  });

  it('returns an empty dashboard for a student with no enrollments', async () => {
    const dashboard = await service.forUser(strangerId);
    expect(dashboard.enrolledCourses).toEqual([]);
    expect(dashboard.continueWatching).toBeNull();
    expect(dashboard.recentScores).toEqual([]);
  });

  it('has nothing to continue before any lesson is opened', async () => {
    const dashboard = await service.forUser(userId);
    expect(dashboard.enrolledCourses).toHaveLength(1);
    expect(dashboard.continueWatching).toBeNull();
  });

  it('resumes at last_lesson_id with the remaining video time', async () => {
    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { lastLessonId: videoLessonId, progressPercent: 25 },
    });
    await prisma.lessonProgress.create({
      data: {
        enrollmentId,
        lessonId: videoLessonId,
        state: 'in_progress',
        watchedSeconds: 120,
        maxPositionSeconds: 150,
        openCount: 1,
      },
    });

    const dashboard = await service.forUser(userId);

    expect(dashboard.continueWatching?.lessonId).toBe(videoLessonId);
    expect(dashboard.continueWatching?.courseSlug).toBe(courseSlug);
    expect(dashboard.continueWatching?.progressPercent).toBe(25);
    expect(dashboard.continueWatching?.remainingSeconds).toBe(450); // 600 - 150
  });

  it('reports zero remaining for a non-video resume point', async () => {
    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { lastLessonId: secondLessonId },
    });

    const dashboard = await service.forUser(userId);
    expect(dashboard.continueWatching?.lessonKind).toBe('text');
    expect(dashboard.continueWatching?.remainingSeconds).toBe(0);
  });

  it('counts completed lessons per course', async () => {
    await prisma.lessonProgress.createMany({
      data: [
        {
          enrollmentId,
          lessonId: videoLessonId,
          completion: 1,
          state: 'completed',
          completedAt: new Date(),
          completedVia: 'auto',
        },
        { enrollmentId, lessonId: secondLessonId, state: 'in_progress' },
      ],
    });

    const dashboard = await service.forUser(userId);
    const course = dashboard.enrolledCourses[0];

    expect(course?.completedLessons).toBe(1);
    expect(course?.totalLessons).toBe(2);
  });

  it('drops a stale last_lesson_id that now points at an unpublished lesson', async () => {
    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { lastLessonId: videoLessonId },
    });
    await prisma.lesson.update({ where: { id: videoLessonId }, data: { isPublished: false } });

    const dashboard = await service.forUser(userId);
    // Unpublishing a lesson must not strand a student on a dead resume link.
    expect(dashboard.continueWatching).toBeNull();

    await prisma.lesson.update({ where: { id: videoLessonId }, data: { isPublished: true } });
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

```bash
pnpm --filter @ayman/api test dashboard.service
```
Expected: FAIL — `Cannot find module './dashboard.service'`.

- [ ] **Step 4: Implement**

Create `apps/api/src/modules/dashboard/dashboard.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { Dashboard, EnrolledCourse, LessonKind } from '@ayman/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_ENROLLMENT_STATUSES } from '../enrollment/enrollment.service';
import { SCORE_FEED, type ScoreFeed } from './score-feed';

const RECENT_SCORE_LIMIT = 5;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SCORE_FEED) private readonly scores: ScoreFeed,
  ) {}

  async forUser(userId: string): Promise<Dashboard> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        userId,
        status: { in: [...ACTIVE_ENROLLMENT_STATUSES] },
        course: { status: 'published' },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        progressPercent: true,
        lastLessonId: true,
        updatedAt: true,
        course: {
          select: {
            id: true,
            slug: true,
            title: true,
            _count: { select: { lessons: { where: { isPublished: true } } } },
          },
        },
        // The resume target, resolved in the same round trip. `isPublished`
        // is part of the filter, so a lesson unpublished after the student
        // last opened it simply resolves to nothing rather than to a dead link.
        lastLesson: {
          where: { isPublished: true },
          select: {
            id: true,
            title: true,
            kind: true,
            video: { select: { durationSeconds: true } },
          },
        },
      },
    });

    if (enrollments.length === 0) {
      return { continueWatching: null, enrolledCourses: [], recentScores: [] };
    }

    // One grouped query for every course at once, rather than one per course.
    const completedByEnrollment = await this.prisma.lessonProgress.groupBy({
      by: ['enrollmentId'],
      where: {
        enrollmentId: { in: enrollments.map((row) => row.id) },
        state: { in: ['completed', 'passed'] },
        lesson: { isPublished: true },
      },
      _count: { _all: true },
    });
    const completedCounts = new Map(
      completedByEnrollment.map((row) => [row.enrollmentId, row._count._all]),
    );

    const enrolledCourses: EnrolledCourse[] = enrollments.map((row) => ({
      id: row.course.id,
      slug: row.course.slug,
      title: row.course.title,
      progressPercent: Number(row.progressPercent),
      completedLessons: completedCounts.get(row.id) ?? 0,
      totalLessons: row.course._count.lessons,
      lastLessonId: row.lastLesson?.id ?? null,
    }));

    // Most recently touched enrollment that still has a live resume target.
    const resumable = enrollments.find((row) => row.lastLesson != null);

    let continueWatching: Dashboard['continueWatching'] = null;
    if (resumable?.lastLesson) {
      const lesson = resumable.lastLesson;
      const duration = lesson.video?.durationSeconds ?? 0;
      const progress = await this.prisma.lessonProgress.findUnique({
        where: {
          enrollmentId_lessonId: { enrollmentId: resumable.id, lessonId: lesson.id },
        },
        select: { maxPositionSeconds: true },
      });

      continueWatching = {
        courseId: resumable.course.id,
        courseSlug: resumable.course.slug,
        courseTitle: resumable.course.title,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        lessonKind: lesson.kind as LessonKind,
        progressPercent: Number(resumable.progressPercent),
        remainingSeconds:
          duration > 0 ? Math.max(duration - (progress?.maxPositionSeconds ?? 0), 0) : 0,
      };
    }

    return {
      continueWatching,
      enrolledCourses,
      recentScores: await this.scores.recentFor(userId, RECENT_SCORE_LIMIT),
    };
  }
}
```

`apps/api/src/modules/dashboard/dashboard.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';
import type { Dashboard } from '@ayman/contracts';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { DashboardService } from './dashboard.service';

@Controller('me')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @RequirePermission('enrollment:read')
  @Get('dashboard')
  get(@CurrentUser() user: AuthenticatedUser): Promise<Dashboard> {
    // The only identity involved is the session's. There is no id parameter
    // to tamper with, which is the cheapest possible defence against IDOR.
    return this.dashboard.forUser(user.id);
  }
}
```

`apps/api/src/modules/dashboard/dashboard.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { EmptyScoreFeed, SCORE_FEED } from './score-feed';

@Module({
  imports: [EnrollmentModule],
  controllers: [DashboardController],
  providers: [DashboardService, { provide: SCORE_FEED, useClass: EmptyScoreFeed }],
})
export class DashboardModule {}
```

Register `DashboardModule` in `app.module.ts`.

- [ ] **Step 5: Run the tests, confirm green, and run the whole API suite**

```bash
pnpm --filter @ayman/api test dashboard.service
pnpm --filter @ayman/api test
```
Expected: 7 dashboard tests pass; the full suite is green (105 pre-existing plus everything added in Tasks 2–8).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/dashboard apps/api/src/app.module.ts
git commit -m "feat(api): student dashboard with continue-watching and a pluggable score feed"
```

---

## Task 9: Web plumbing — POSTs, formatting, and the lazy YouTube API

No UI yet. This task ships the four pieces the player is built from, each independently testable.

**Files:**
- Modify: `apps/web/lib/api.ts`
- Create: `apps/web/lib/format.ts`, `apps/web/lib/format.test.ts`
- Create: `apps/web/lib/youtube.ts`
- Create: `apps/web/lib/progress-client.ts`
- Create: `packages/ui/src/tokens/direction.css`; Modify: `packages/ui/src/tokens/index.css`

**Interfaces:**
- Consumes: `HeartbeatResponseSchema`, `LessonProgressSchema` from `@ayman/contracts`.
- Produces:
  - `apiPost<T>(path, schema, body?, init?): Promise<T>`
  - `formatDuration(seconds): string`, `formatRemaining(seconds): string`
  - `loadYouTubeIframeApi(): Promise<YouTubeApi>`, `YT_STATE`
  - `postOpen`, `postHeartbeat`, `postDwell`, `postComplete`
  - CSS custom property `--dir-x` and the `.icon-inline` class

- [ ] **Step 1: Add `apiPost` to `apps/web/lib/api.ts`**

> **RECONCILED.** `apps/web/lib/api.ts` is owned by Plan 3 Task 10, which already ships `apiGet`,
> `apiGetOrNull` and `apiSend(method, path, body, schema)` — the Server-Action mutation helper. **Do
> not re-add them.** `apiPost` below is additive: it is the *browser-side* sibling that `apiSend` is
> not, because it must support `keepalive` for the tab-hide heartbeat flush and it reads the CSRF
> cookie from `document.cookie` rather than from `cookies()`. The cookie name is
> **`__Host-csrf`** — Plan 3 established it and this plan's draft named it `csrf_token`, which was
> wrong.

```ts
/**
 * Reads the CSRF token the auth layer sets. The token's VALUE is not the
 * control — sending a custom header at all is, because a cross-site HTML form
 * cannot add one and a cross-origin fetch that tries triggers a preflight we
 * never answer. The value is still echoed so the server can double-submit
 * check it.
 *
 * ⚠️ Cookie name is `__Host-csrf`, matching Plan 2's issuer and Plan 3's
 * `apiSend`. Three files reading three different names is a silent 403 storm.
 */
export const CSRF_COOKIE = '__Host-csrf';
export const CSRF_HEADER = 'x-csrf-token';

function csrfToken(): string {
  if (typeof document === 'undefined') return '';
  for (const part of document.cookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== CSRF_COOKIE) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return '';
}

export interface ApiPostInit extends RequestInit {
  /**
   * Lets the request outlive the page. Required for the final heartbeat on
   * tab-hide or unmount — `sendBeacon` cannot be used here because it cannot
   * set the CSRF header.
   */
  keepalive?: boolean;
}

/**
 * POST and validate. Same rules as `apiGet`: same-origin relative path in the
 * browser, and the response is parsed against the shared schema so a contract
 * change surfaces here rather than as `undefined` deep inside a component.
 */
export async function apiPost<T>(
  path: string,
  schema: ZodType<T>,
  body?: unknown,
  init?: ApiPostInit,
): Promise<T> {
  const response = await fetch(resolve(path), {
    method: 'POST',
    ...init,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-csrf-token': csrfToken(),
      ...init?.headers,
    },
    body: JSON.stringify(body ?? {}),
  });

  if (!response.ok) {
    throw new Error(`POST ${path} failed with ${response.status}`);
  }

  return schema.parse(await response.json());
}
```

- [ ] **Step 2: Write the failing formatting test**

Create `apps/web/lib/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatDuration, formatRemaining } from './format';

describe('formatDuration', () => {
  it('formats under an hour as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(599)).toBe('9:59');
  });

  it('formats an hour or more as h:mm:ss', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3671)).toBe('1:01:11');
  });

  it('uses Western digits, never Arabic-Indic', () => {
    // §4.1: Western digits everywhere, including chrome. This is a
    // programming platform — timers, scores and code all need them.
    expect(formatDuration(75)).toMatch(/^[0-9:]+$/);
  });

  it('never renders NaN or a negative clock', () => {
    expect(formatDuration(-30)).toBe('0:00');
    expect(formatDuration(Number.NaN)).toBe('0:00');
  });
});

describe('formatRemaining', () => {
  it('rounds up to whole minutes above a minute', () => {
    expect(formatRemaining(61)).toBe('2:00');
    expect(formatRemaining(600)).toBe('10:00');
  });

  it('keeps seconds under a minute', () => {
    expect(formatRemaining(45)).toBe('0:45');
  });
});
```

Run it:
```bash
pnpm --filter @ayman/web test format
```
Expected: FAIL — cannot resolve `./format`.

- [ ] **Step 3: Implement the formatters**

Create `apps/web/lib/format.ts`:

```ts
/**
 * Clock formatting. Contains no words, so it is not a copy-table violation —
 * every user-facing *string* still lives in `@ayman/contracts`.
 *
 * Western digits only (§4.1), and callers pair these with the `.tabular`
 * class so a ticking timer does not shift its own layout every second.
 */
function safeSeconds(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

export function formatDuration(totalSeconds: number): string {
  const seconds = safeSeconds(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(rest)}`
    : `${minutes}:${pad(rest)}`;
}

/**
 * "How much is left" reads better rounded up: 61 seconds remaining is "2:00",
 * not "1:01" — nobody thinks of it as one minute and one second.
 */
export function formatRemaining(totalSeconds: number): string {
  const seconds = safeSeconds(totalSeconds);
  if (seconds < 60) return formatDuration(seconds);
  return formatDuration(Math.ceil(seconds / 60) * 60);
}
```

Run again — expected: PASS, 6 tests.

- [ ] **Step 4: Create the lazy YouTube API loader**

Create `apps/web/lib/youtube.ts`:

```ts
/**
 * A hand-written slice of the YouTube IFrame Player API instead of a typings
 * package: this is the entire surface we use, it is stable, and a dependency
 * whose whole job is to describe six methods is not worth the supply chain.
 */
export const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

export interface YouTubePlayer {
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}

export interface YouTubePlayerOptions {
  videoId: string;
  host?: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: { target: YouTubePlayer }) => void;
    onStateChange?: (event: { data: number; target: YouTubePlayer }) => void;
    onError?: (event: { data: number }) => void;
  };
}

export interface YouTubeApi {
  Player: new (element: HTMLElement | string, options: YouTubePlayerOptions) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const API_SRC = 'https://www.youtube.com/iframe_api';

/** Module-level so the script is requested at most once per document. */
let pending: Promise<YouTubeApi> | null = null;

/**
 * Loads the IFrame API on demand — never on page load.
 *
 * The script is ~60kB and only matters once a student presses play, so the
 * player renders a static facade first and calls this from the click handler.
 * That keeps it off the critical path entirely: no third-party request, no
 * main-thread work, and nothing that could shift layout, before the user has
 * asked for a video.
 *
 * CSP note: `strict-dynamic` propagates the trust of the nonce'd bundle that
 * injects this tag, so no `script-src` host entry is needed (and adding one
 * would be a silent no-op — see Task 12). `frame-src` is a different story
 * and DOES need the nocookie host.
 */
export function loadYouTubeIframeApi(): Promise<YouTubeApi> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('the YouTube IFrame API is browser-only'));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (pending) return pending;

  pending = new Promise<YouTubeApi>((resolve, reject) => {
    // The API calls this global exactly once, whoever ends up loading it.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('the YouTube IFrame API loaded without a Player constructor'));
    };

    const script = document.createElement('script');
    script.src = API_SRC;
    script.async = true;
    script.onerror = () => {
      // Let a later attempt retry rather than caching the failure forever —
      // this fires on a flaky connection as readily as on a blocked domain.
      pending = null;
      reject(new Error('failed to load the YouTube IFrame API'));
    };
    document.head.append(script);
  });

  return pending;
}

/**
 * §7 P3: the database stores the 11-char id, never a URL, and the embed is
 * reconstructed here. `youtube-nocookie.com` is passed as the API `host` so
 * the player itself is served from the no-cookie domain.
 */
export const YOUTUBE_NOCOOKIE_HOST = 'https://www.youtube-nocookie.com';
```

- [ ] **Step 5: Create the typed progress client**

Create `apps/web/lib/progress-client.ts`:

```ts
import {
  HeartbeatResponseSchema,
  LessonProgressSchema,
  type HeartbeatResponse,
  type LessonProgressDto,
} from '@ayman/contracts';
import { apiPost } from './api';

export function postOpen(lessonId: string): Promise<LessonProgressDto> {
  return apiPost(`/api/lessons/${lessonId}/open`, LessonProgressSchema, {});
}

/**
 * `position` is where the scrubber is; `delta` is how many seconds of actual
 * playback happened since the last call. The server intersects `delta` with
 * its own measured wall clock, so an inflated value buys nothing — the client
 * simply reports honestly and lets the server be the authority.
 */
export function postHeartbeat(
  lessonId: string,
  body: { position: number; delta: number },
  init?: { keepalive?: boolean },
): Promise<HeartbeatResponse> {
  return apiPost(`/api/lessons/${lessonId}/heartbeat`, HeartbeatResponseSchema, body, init);
}

/** No payload: the 5000ms is measured server-side from the open. */
export function postDwell(lessonId: string): Promise<HeartbeatResponse> {
  return apiPost(`/api/lessons/${lessonId}/dwell`, HeartbeatResponseSchema, {});
}

/** "أنهيت الدرس · التالي". Also no payload — see EmptyBodyDto. */
export function postComplete(lessonId: string): Promise<HeartbeatResponse> {
  return apiPost(`/api/lessons/${lessonId}/complete`, HeartbeatResponseSchema, {});
}
```

- [ ] **Step 6: Add the direction token so icons mirror without physical classes**

Create `packages/ui/src/tokens/direction.css`:

```css
/* Directional icons — chevrons, arrows — must point the other way in RTL.
   Doing that with a hardcoded `rotate-180` bakes the assumption into every
   component and silently breaks the day an English route exists.

   One custom property, set by the document's own `dir`, keeps it declarative:
   the icon says "point toward the inline end" and the writing mode decides
   which way that is. This is also why the ESLint rule never has to reason
   about icon rotations. */
[dir='ltr'] { --dir-x: 1; }
[dir='rtl'] { --dir-x: -1; }

.icon-inline {
  transform: scaleX(var(--dir-x, 1));
}
```

Add the import to `packages/ui/src/tokens/index.css` alongside the others:
```css
@import './direction.css';
```

- [ ] **Step 7: Verify the gates and commit**

```bash
pnpm --filter @ayman/web test && pnpm --filter @ayman/web typecheck && pnpm --filter @ayman/web lint
pnpm --filter @ayman/ui typecheck
```
Expected: all green.

```bash
git add apps/web/lib/api.ts apps/web/lib/format.ts apps/web/lib/format.test.ts \
        apps/web/lib/youtube.ts apps/web/lib/progress-client.ts \
        packages/ui/src/tokens/direction.css packages/ui/src/tokens/index.css
git commit -m "feat(web): lazy YouTube API loader, typed progress client, and direction-aware icon token"
```

---

## Task 10: The player shell

**Files:**
- Create: `apps/web/components/player/icons.tsx`
- Create: `apps/web/components/player/lesson-progress-bar.tsx`
- Create: `apps/web/components/player/course-outline.tsx`
- Create: `apps/web/components/player/use-video-heartbeat.ts`
- Create: `apps/web/components/player/use-dwell-complete.ts`
- Create: `apps/web/components/player/video-lesson.tsx`
- Create: `apps/web/components/player/text-lesson.tsx`
- Create: `apps/web/components/player/attachment-lesson.tsx`
- Create: `apps/web/components/player/quiz-lesson.tsx`
- Create: `apps/web/components/player/lesson-nav.tsx`
- Create: `apps/web/components/player/lesson-player.tsx`
- Create: `apps/web/app/(app)/courses/[slug]/lessons/[lessonId]/page.tsx`
- Create: `apps/web/app/(app)/courses/[slug]/lessons/[lessonId]/loading.tsx`

**Interfaces:**
- Consumes: `GET /api/lessons/:id/player`, `GET /api/courses/:slug/outline`, the Task 9 helpers, `copy.player.*`.
- Produces: the route `/courses/[slug]/lessons/[lessonId]`.

- [ ] **Step 1: Create the icons**

Create `apps/web/components/player/icons.tsx`. Inline SVG only — emoji as icons is on the hard ban list (§4.7), and the directional ones carry `.icon-inline` so they follow the writing mode rather than a hardcoded rotation.

```tsx
import { cn } from '@ayman/ui';

type IconProps = { className?: string };

const BASE = 'h-4 w-4 shrink-0';
const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** Points toward the inline END — "next" in any writing mode. */
export function ChevronForward({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn(BASE, 'icon-inline', className)} {...STROKE}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

/** Points toward the inline START — "previous" in any writing mode. */
export function ChevronBack({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn(BASE, 'icon-inline', className)} {...STROKE}>
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

export function PlayIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn(BASE, className)} fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn(BASE, className)} {...STROKE}>
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

export function DownloadIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn(BASE, className)} {...STROKE}>
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 20h16" />
    </svg>
  );
}

export function DocumentIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn(BASE, className)} {...STROKE}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zm0 0v5h5" />
    </svg>
  );
}

export function QuizIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn(BASE, className)} {...STROKE}>
      <path d="M9 9a3 3 0 1 1 4 2.8c-.6.3-1 .9-1 1.6v.6M12 17.5h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}
```

- [ ] **Step 2: Create the progress bar**

Create `apps/web/components/player/lesson-progress-bar.tsx`:

```tsx
import { cn } from '@ayman/ui';

export interface LessonProgressBarProps {
  /** 0..100. */
  percent: number;
  label: string;
  className?: string;
}

/**
 * Amber, never green. Green and red are load-bearing for quiz correctness
 * (§4.2) — using green for "progress" here would train students to read it as
 * "correct" three screens before the quiz runner does.
 *
 * The fill is sized with `inlineSize` rather than `width` so it grows from the
 * inline start: right-to-left in Arabic, left-to-right the day English exists.
 */
export function LessonProgressBar({ percent, label, className }: LessonProgressBarProps) {
  const clamped = Math.min(Math.max(percent, 0), 100);

  return (
    <div
      className={cn('h-1 w-full overflow-hidden rounded-full bg-surface-3', className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-full bg-accent transition-[inline-size] duration-300 ease-out"
        style={{ inlineSize: `${clamped}%` }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create the RTL-native outline sidebar**

Create `apps/web/components/player/course-outline.tsx`:

```tsx
import Link from 'next/link';
import { copy, type CourseOutline } from '@ayman/contracts';
import { Badge, cn } from '@ayman/ui';
import { formatDuration } from '@/lib/format';
import { CheckIcon } from './icons';
import { LessonProgressBar } from './lesson-progress-bar';

export interface CourseOutlineSidebarProps {
  outline: CourseOutline;
  activeLessonId: string;
}

/**
 * RTL-native, not mirrored. Nothing here knows about left or right:
 *   • the grid column order in the page layout follows the writing mode
 *   • the active marker is `border-s-2` — an inline-START border
 *   • the section number sits at `text-start`, the duration at `text-end`
 * Swapping `dir` would produce a correct LTR sidebar with no code change.
 */
export function CourseOutlineSidebar({ outline, activeLessonId }: CourseOutlineSidebarProps) {
  return (
    <nav
      aria-label={copy.player.outline}
      className={cn(
        'rounded-lg border border-line bg-surface-2',
        // `top-*` is block-axis and therefore not a physical-direction class.
        'lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto',
      )}
    >
      <div className="border-b border-line-subtle px-4 py-4">
        <p className="eyebrow mb-2">{copy.player.outline}</p>
        <LessonProgressBar percent={outline.progressPercent} label={copy.player.courseProgress} />
        <p className="mono mt-2 text-[length:var(--fs-mono-label)] tabular text-fg-muted">
          {outline.completedLessons} {copy.player.lessonsCompleted} {outline.totalLessons}
        </p>
      </div>

      <ol className="py-2">
        {outline.sections.map((section, sectionIndex) => (
          <li key={section.id} className="mb-2">
            <p className="mono px-4 py-2 text-[length:var(--fs-mono-label)] tabular text-fg-muted">
              {String(sectionIndex + 1).padStart(2, '0')} / {section.title}
            </p>

            <ol>
              {section.lessons.map((lesson) => {
                const isActive = lesson.id === activeLessonId;
                const isDone = lesson.state === 'completed' || lesson.state === 'passed';

                return (
                  <li key={lesson.id}>
                    <Link
                      href={`/courses/${outline.course.slug}/lessons/${lesson.id}`}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 border-s-2 px-4 py-2.5 text-[length:var(--fs-text-sm)]',
                        'transition-colors duration-[160ms] ease-out hover:bg-surface-3',
                        isActive
                          ? 'border-accent bg-surface-3 font-medium text-fg'
                          : 'border-transparent text-fg-muted',
                      )}
                    >
                      {/* Amber, not green: green means "correct answer" here. */}
                      <CheckIcon
                        className={cn('h-3.5 w-3.5', isDone ? 'text-accent' : 'text-transparent')}
                      />
                      <span className="min-w-0 flex-1 text-start">{lesson.title}</span>
                      {lesson.estimatedSeconds ? (
                        <span className="mono tabular text-[length:var(--fs-mono-label)] text-fg-muted">
                          {formatDuration(lesson.estimatedSeconds)}
                        </span>
                      ) : null}
                      {lesson.isFreePreview ? <Badge tone="accent">{copy.player.play}</Badge> : null}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>
    </nav>
  );
}
```

- [ ] **Step 4: Create the heartbeat hook**

Create `apps/web/components/player/use-video-heartbeat.ts`:

```ts
'use client';

import { useCallback, useEffect, useRef } from 'react';
import { HEARTBEAT_INTERVAL_MS, MAX_HEARTBEAT_DELTA_SECONDS } from '@ayman/contracts';
import type { HeartbeatResponse } from '@ayman/contracts';
import { postHeartbeat } from '@/lib/progress-client';
import { YT_STATE, type YouTubePlayer } from '@/lib/youtube';

const TICK_MS = 1_000;
const TICKS_PER_FLUSH = HEARTBEAT_INTERVAL_MS / TICK_MS;

/**
 * A seek shows up as the current time jumping by more than one tick. Counting
 * it as watch time would be dishonest reporting; the server would clamp it
 * anyway, but the client should not be the one lying.
 */
const MAX_HONEST_TICK_ADVANCE = 2;

export interface UseVideoHeartbeatOptions {
  lessonId: string;
  player: YouTubePlayer | null;
  onResponse: (response: HeartbeatResponse) => void;
  onError: () => void;
}

/**
 * Ticks once a second while the video is actually PLAYING, and flushes an
 * accumulated `{position, delta}` every ten seconds.
 *
 * The client is a reporter, not an authority: it never computes a percentage,
 * never decides completion, and its `delta` is intersected with the server's
 * own wall clock on arrival. Everything here is about reporting *honestly* —
 * the security property does not depend on it.
 */
export function useVideoHeartbeat({
  lessonId,
  player,
  onResponse,
  onError,
}: UseVideoHeartbeatOptions): void {
  const deltaRef = useRef(0);
  const lastTimeRef = useRef(0);
  const inFlightRef = useRef(false);

  const flush = useCallback(
    async (keepalive: boolean) => {
      if (!player || inFlightRef.current) return;

      const pending = Math.min(Math.round(deltaRef.current), MAX_HEARTBEAT_DELTA_SECONDS);
      const position = Math.max(Math.floor(player.getCurrentTime()), 0);
      if (pending <= 0 && !keepalive) return;

      inFlightRef.current = true;
      // Cleared optimistically so a slow request cannot double-count, and
      // restored below if the POST fails — losing ten seconds of a student's
      // watch time to one flaky request is a real complaint.
      deltaRef.current = 0;

      try {
        const response = await postHeartbeat(lessonId, { position, delta: pending }, { keepalive });
        onResponse(response);
      } catch {
        deltaRef.current = Math.min(
          deltaRef.current + pending,
          MAX_HEARTBEAT_DELTA_SECONDS,
        );
        onError();
      } finally {
        inFlightRef.current = false;
      }
    },
    [lessonId, onError, onResponse, player],
  );

  useEffect(() => {
    if (!player) return;

    lastTimeRef.current = player.getCurrentTime();
    let ticks = 0;

    const interval = window.setInterval(() => {
      const now = player.getCurrentTime();
      const advanced = now - lastTimeRef.current;
      lastTimeRef.current = now;

      if (player.getPlayerState() === YT_STATE.PLAYING) {
        // A jump larger than one tick is a seek, not playback.
        if (advanced > 0 && advanced <= MAX_HONEST_TICK_ADVANCE) {
          deltaRef.current += advanced;
        }
      }

      ticks += 1;
      if (ticks >= TICKS_PER_FLUSH) {
        ticks = 0;
        void flush(false);
      }
    }, TICK_MS);

    /**
     * Flush before the page can go away. `keepalive: true` rather than
     * `navigator.sendBeacon` because beacons cannot set the CSRF header the
     * API requires on every state-changing method.
     */
    const onHidden = () => {
      if (document.visibilityState === 'hidden') void flush(true);
    };
    document.addEventListener('visibilitychange', onHidden);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onHidden);
      void flush(true);
    };
  }, [flush, player]);
}
```

- [ ] **Step 5: Create the dwell hook**

Create `apps/web/components/player/use-dwell-complete.ts`:

```ts
'use client';

import { useEffect } from 'react';
import { DWELL_COMPLETE_MS } from '@ayman/contracts';
import type { HeartbeatResponse } from '@ayman/contracts';
import { postDwell } from '@/lib/progress-client';

export interface UseDwellCompleteOptions {
  lessonId: string;
  /** Skipped when the lesson is already finished — no point re-asking. */
  enabled: boolean;
  onResponse: (response: HeartbeatResponse) => void;
}

/**
 * Text and attachment lessons complete after 5000ms on the page.
 *
 * The timer here only decides WHEN to ask. The server measures the real
 * elapsed time from its own `first_opened_at`, so firing this early — or a
 * hundred times — cannot complete a lesson faster than five real seconds.
 * A single extra attempt covers the case where the page mounted slightly
 * before the open request landed.
 */
export function useDwellComplete({ lessonId, enabled, onResponse }: UseDwellCompleteOptions): void {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let retry: number | undefined;

    const ask = async () => {
      try {
        const response = await postDwell(lessonId);
        if (cancelled) return;
        onResponse(response);
        if (!response.progress.completedAt) {
          // The server said "not yet" — its clock is the one that counts.
          retry = window.setTimeout(() => void ask(), DWELL_COMPLETE_MS);
        }
      } catch {
        // Silent: a failed dwell is not worth interrupting reading for, and
        // the manual button is always available.
      }
    };

    const timer = window.setTimeout(() => void ask(), DWELL_COMPLETE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (retry !== undefined) window.clearTimeout(retry);
    };
  }, [enabled, lessonId, onResponse]);
}
```

- [ ] **Step 6: Create the video lesson component**

Create `apps/web/components/player/video-lesson.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { copy, type HeartbeatResponse, type PlayerVideo } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { formatDuration } from '@/lib/format';
import {
  YOUTUBE_NOCOOKIE_HOST,
  YT_STATE,
  loadYouTubeIframeApi,
  type YouTubePlayer,
} from '@/lib/youtube';
import { PlayIcon } from './icons';
import { useVideoHeartbeat } from './use-video-heartbeat';

export interface VideoLessonProps {
  lessonId: string;
  video: PlayerVideo;
  title: string;
  onProgress: (response: HeartbeatResponse) => void;
  onError: () => void;
}

export function VideoLesson({ lessonId, video, title, onProgress, onError }: VideoLessonProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [player, setPlayer] = useState<YouTubePlayer | null>(null);
  const [activated, setActivated] = useState(false);
  const [failed, setFailed] = useState(false);

  useVideoHeartbeat({ lessonId, player, onResponse: onProgress, onError });

  const activate = useCallback(async () => {
    if (activated || !mountRef.current) return;
    setActivated(true);

    try {
      const api = await loadYouTubeIframeApi();
      if (!mountRef.current) return;

      const instance = new api.Player(mountRef.current, {
        videoId: video.youtubeId,
        // §7 P3 / §1: the no-cookie host, reconstructed from the stored
        // 11-char id. No URL is ever read from the database.
        host: YOUTUBE_NOCOOKIE_HOST,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          hl: 'ar',
          cc_lang_pref: 'ar',
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            playerRef.current = event.target;
            setPlayer(event.target);
          },
          onStateChange: (event) => {
            // ENDED is the one moment worth an immediate extra flush: the
            // student is about to click away and the last ten seconds are
            // exactly the ones that decide the 95% position threshold.
            if (event.data === YT_STATE.ENDED) setPlayer((current) => current);
          },
          onError: () => setFailed(true),
        },
      });
      playerRef.current = instance;
    } catch {
      setFailed(true);
      setActivated(false);
    }
  }, [activated, video.youtubeId]);

  useEffect(() => {
    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  return (
    <div
      className={cn(
        // aspect-video reserves the exact box in CSS before any JS runs, and
        // the iframe is injected INTO it — CLS stays at 0 whether the API
        // loads in 200ms, in four seconds, or never.
        'relative aspect-video w-full overflow-hidden rounded-lg border border-line bg-surface-2',
      )}
    >
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />

      {!activated ? (
        <button
          type="button"
          onClick={() => void activate()}
          aria-label={copy.player.play}
          className={cn(
            'absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-3',
            'bg-surface-2 transition-colors duration-[160ms] ease-out hover:bg-surface-3',
          )}
        >
          {video.posterUrl ? (
            // Absolutely positioned inside the reserved box, so its own
            // intrinsic size can never move anything.
            <img
              src={video.posterUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-60"
            />
          ) : null}

          <span
            className={cn(
              'relative flex h-14 w-14 items-center justify-center rounded-full',
              'border border-line-strong bg-surface-1 text-accent',
            )}
          >
            <PlayIcon className="h-6 w-6" />
          </span>
          <span className="relative text-[length:var(--fs-text-sm)] text-fg-muted">{title}</span>
          {video.durationSeconds > 0 ? (
            <span className="mono tabular relative text-[length:var(--fs-mono-label)] text-fg-muted">
              {formatDuration(video.durationSeconds)}
            </span>
          ) : null}
        </button>
      ) : null}

      {failed ? (
        <p
          className={cn(
            'absolute inset-0 flex items-center justify-center bg-surface-2 px-6 text-center',
            'text-[length:var(--fs-text-sm)] text-fg-muted',
          )}
        >
          {copy.player.videoUnavailable}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 7: Create the text, attachment and quiz lesson bodies**

`apps/web/components/player/text-lesson.tsx`:
```tsx
'use client';

import type { HeartbeatResponse } from '@ayman/contracts';
import { useDwellComplete } from './use-dwell-complete';

export interface TextLessonProps {
  lessonId: string;
  bodyHtml: string;
  alreadyComplete: boolean;
  onProgress: (response: HeartbeatResponse) => void;
}

export function TextLesson({ lessonId, bodyHtml, alreadyComplete, onProgress }: TextLessonProps) {
  useDwellComplete({ lessonId, enabled: !alreadyComplete, onResponse: onProgress });

  return (
    <article
      // `bodyHtml` was produced by sanitize-html on write with a tight
      // allowlist and every <iframe> denied (§7 P3), and the CSP nonce is the
      // backstop. This is the one place in the player that renders stored HTML.
      className="prose-lesson max-w-[var(--w-prose)]"
      dangerouslySetInnerHTML={{ __html: bodyHtml }}
    />
  );
}
```

`apps/web/components/player/attachment-lesson.tsx`:
```tsx
'use client';

import { copy, type HeartbeatResponse, type PlayerAttachment } from '@ayman/contracts';
import { Card, CardBody, cn } from '@ayman/ui';
import { DocumentIcon, DownloadIcon } from './icons';
import { useDwellComplete } from './use-dwell-complete';

export interface AttachmentLessonProps {
  lessonId: string;
  attachments: PlayerAttachment[];
  alreadyComplete: boolean;
  onProgress: (response: HeartbeatResponse) => void;
}

function formatSize(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 1
    ? `${megabytes.toFixed(1)} MB`
    : `${Math.max(Math.round(bytes / 1024), 1)} KB`;
}

export function AttachmentLesson({
  lessonId,
  attachments,
  alreadyComplete,
  onProgress,
}: AttachmentLessonProps) {
  useDwellComplete({ lessonId, enabled: !alreadyComplete, onResponse: onProgress });

  return (
    <Card>
      <CardBody className="p-0">
        <ul>
          {attachments.map((attachment) => (
            <li key={attachment.id} className="border-b border-line-subtle last:border-b-0">
              <a
                href={attachment.downloadPath}
                // Same-origin path that re-checks enrollment server-side
                // before redirecting — never the storage URL itself.
                className={cn(
                  'flex items-center gap-3 px-5 py-4',
                  'transition-colors duration-[160ms] ease-out hover:bg-surface-3',
                )}
              >
                <DocumentIcon className="text-fg-muted" />
                <span className="min-w-0 flex-1 text-start">
                  <span className="block truncate">{attachment.filename}</span>
                  <span className="mono tabular block text-[length:var(--fs-mono-label)] text-fg-muted">
                    {formatSize(attachment.sizeBytes)}
                  </span>
                </span>
                <span className="mono flex items-center gap-1.5 text-[length:var(--fs-mono-label)] text-accent-text">
                  <DownloadIcon className="h-3.5 w-3.5" />
                  {copy.player.download}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
```

`apps/web/components/player/quiz-lesson.tsx`:

> **RECONCILED.** The quiz route is `/quizzes/{lessonId}`, owned by Plan 5
> (`app/(app)/quizzes/[lessonId]/**`). This plan's draft linked to
> `/lessons/{lessonId}/quiz`, which no plan creates. Import Plan 5's
> `quizHref(lessonId)` from `@/lib/quiz-links` rather than templating a path, so the
> two plans cannot drift. **Plan 4 creates `apps/web/lib/quiz-links.ts` containing only**
> `export const quizHref = (lessonId: string): string => \`/quizzes/${lessonId}\`;`
> — Plan 5 then imports it instead of re-declaring it, which is what removes the
> forward dependency entirely.

```tsx
import Link from 'next/link';
import { copy } from '@ayman/contracts';
import { Button, Card, CardBody } from '@ayman/ui';
import { quizHref } from '@/lib/quiz-links';
import { QuizIcon } from './icons';

export interface QuizLessonProps {
  lessonId: string;
}

/**
 * A quiz lesson in the player is a doorway, not a runner. The attempt lives on
 * its own route with its own timer, `deadline_at` and attempt token — running
 * it inside a page the student can navigate away from mid-attempt would be a
 * design mistake, not a shortcut.
 */
export function QuizLesson({ lessonId }: QuizLessonProps) {
  return (
    <Card>
      <CardBody className="flex flex-col items-start gap-4">
        <QuizIcon className="h-6 w-6 text-accent" />
        <p className="max-w-[var(--w-prose)] text-fg-muted">{copy.player.quizIntro}</p>
        <Button asChild>
          <Link href={quizHref(lessonId)}>{copy.player.quizCta}</Link>
        </Button>
      </CardBody>
    </Card>
  );
}
```

> `Button asChild` requires the `asChild` prop on the Plan 1 `Button`. If it
> does not have one, wrap the `Link` in the button's classes instead — do not
> nest a `<button>` inside an `<a>`.

- [ ] **Step 8: Create the navigation bar with the manual complete button**

Create `apps/web/components/player/lesson-nav.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { copy, type HeartbeatResponse, type LessonNeighbour } from '@ayman/contracts';
import { Button, cn } from '@ayman/ui';
import { postComplete } from '@/lib/progress-client';
import { CheckIcon, ChevronBack, ChevronForward } from './icons';

export interface LessonNavProps {
  lessonId: string;
  courseSlug: string;
  previous: LessonNeighbour;
  next: LessonNeighbour;
  isComplete: boolean;
  onProgress: (response: HeartbeatResponse) => void;
}

export function LessonNav({
  lessonId,
  courseSlug,
  previous,
  next,
  isComplete,
  onProgress,
}: LessonNavProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  const finish = async () => {
    setSaving(true);
    try {
      onProgress(await postComplete(lessonId));
      // Advance immediately — "أنهيت الدرس · التالي" is one gesture, and
      // making the student find the next link afterwards is the single most
      // common complaint about these players.
      if (next) {
        startTransition(() => router.push(`/courses/${courseSlug}/lessons/${next.id}`));
      }
    } finally {
      setSaving(false);
    }
  };

  const label = saving
    ? copy.player.marking
    : next
      ? copy.player.markComplete
      : copy.player.markCompleteFinal;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-6">
      <div className="flex items-center gap-2">
        {previous ? (
          <Button variant="ghost" asChild>
            <Link
              href={`/courses/${courseSlug}/lessons/${previous.id}`}
              className="flex items-center gap-2"
            >
              <ChevronBack />
              {copy.player.previous}
            </Link>
          </Button>
        ) : null}
        {next ? (
          <Button variant="ghost" asChild>
            <Link
              href={`/courses/${courseSlug}/lessons/${next.id}`}
              className="flex items-center gap-2"
            >
              {copy.player.next}
              <ChevronForward />
            </Link>
          </Button>
        ) : null}
      </div>

      {/* Always present, on every lesson kind (Global Constraint 14). */}
      <Button onClick={() => void finish()} disabled={saving || isComplete}>
        <span className={cn('flex items-center gap-2')}>
          {isComplete ? <CheckIcon /> : null}
          {isComplete ? copy.player.completed : label}
        </span>
      </Button>
    </div>
  );
}
```

- [ ] **Step 9: Compose the client player**

Create `apps/web/components/player/lesson-player.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { copy, type HeartbeatResponse, type LessonPlayer } from '@ayman/contracts';
import { postOpen } from '@/lib/progress-client';
import { AttachmentLesson } from './attachment-lesson';
import { LessonNav } from './lesson-nav';
import { QuizLesson } from './quiz-lesson';
import { TextLesson } from './text-lesson';
import { VideoLesson } from './video-lesson';

export interface LessonPlayerProps {
  payload: LessonPlayer;
}

export function LessonPlayerView({ payload }: LessonPlayerProps) {
  const [progress, setProgress] = useState(payload.progress);
  const [saveFailed, setSaveFailed] = useState(false);

  // Registers the open (openCount, firstOpenedAt) and — the part students
  // actually notice — writes enrollment.lastLessonId, which is what makes
  // "أكمل من حيث وقفت" land on this exact lesson tomorrow.
  useEffect(() => {
    let cancelled = false;
    void postOpen(payload.lesson.id)
      .then((opened) => {
        if (!cancelled) setProgress(opened);
      })
      .catch(() => {
        /* the lesson is still watchable; progress just is not recorded yet */
      });
    return () => {
      cancelled = true;
    };
  }, [payload.lesson.id]);

  const onProgress = useCallback((response: HeartbeatResponse) => {
    setProgress(response.progress);
    setSaveFailed(false);
  }, []);

  const onError = useCallback(() => setSaveFailed(true), []);
  const isComplete = progress.completedAt != null;

  return (
    <div className="space-y-6">
      {payload.lesson.kind === 'video' && payload.video ? (
        <VideoLesson
          lessonId={payload.lesson.id}
          video={payload.video}
          title={payload.lesson.title}
          onProgress={onProgress}
          onError={onError}
        />
      ) : null}

      {payload.lesson.kind === 'text' && payload.text ? (
        <TextLesson
          lessonId={payload.lesson.id}
          bodyHtml={payload.text.bodyHtml}
          alreadyComplete={isComplete}
          onProgress={onProgress}
        />
      ) : null}

      {payload.lesson.kind === 'attachment' ? (
        <AttachmentLesson
          lessonId={payload.lesson.id}
          attachments={payload.attachments}
          alreadyComplete={isComplete}
          onProgress={onProgress}
        />
      ) : null}

      {payload.lesson.kind === 'quiz' ? <QuizLesson lessonId={payload.lesson.id} /> : null}

      {/* A video lesson can also carry slides; show them below the player. */}
      {payload.lesson.kind !== 'attachment' && payload.attachments.length > 0 ? (
        <section>
          <p className="eyebrow mb-3">{copy.player.attachments}</p>
          <AttachmentLesson
            lessonId={payload.lesson.id}
            attachments={payload.attachments}
            alreadyComplete
            onProgress={onProgress}
          />
        </section>
      ) : null}

      <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
        {payload.autoCompleteAvailable ? copy.player.autoCompleteHint : copy.player.manualOnlyHint}
      </p>

      {saveFailed ? (
        <p role="status" className="text-[length:var(--fs-text-sm)] text-[color:var(--warn)]">
          {copy.player.saveFailed}
        </p>
      ) : null}

      <LessonNav
        lessonId={payload.lesson.id}
        courseSlug={payload.lesson.courseSlug}
        previous={payload.previous}
        next={payload.next}
        isComplete={isComplete}
        onProgress={onProgress}
      />
    </div>
  );
}
```

> The `saveFailed` notice uses `--warn`, not `--err`: red is reserved for a
> wrong quiz answer, and a student who sees red on a page with no questions
> will read it as "you got something wrong".

- [ ] **Step 10: Create the route**

`apps/web/app/(app)/courses/[slug]/lessons/[lessonId]/page.tsx`:
```tsx
import { notFound } from 'next/navigation';
import { CourseOutlineSchema, LessonPlayerSchema, copy } from '@ayman/contracts';
import { apiGet } from '@/lib/api';
import { CourseOutlineSidebar } from '@/components/player/course-outline';
import { LessonPlayerView } from '@/components/player/lesson-player';

export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string; lessonId: string }>;
}) {
  const { slug, lessonId } = await params;

  // Two parallel fetches, not one endpoint: the outline is stable across
  // lesson navigations and the lesson body is not.
  const [outline, payload] = await Promise.all([
    apiGet(`/api/courses/${slug}/outline`, CourseOutlineSchema).catch(() => null),
    apiGet(`/api/lessons/${lessonId}/player`, LessonPlayerSchema).catch(() => null),
  ]);

  // The API already returns 404 for "not enrolled", so this is a single
  // rendering decision rather than an authorization one — the authorization
  // happened server-side, in the guard and the query.
  if (!outline || !payload) notFound();

  return (
    <main className="mx-auto max-w-[var(--w-shell)] px-6 py-10">
      <p className="eyebrow mb-2">{copy.player.eyebrow}</p>
      <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold">{payload.lesson.title}</h1>
      <p className="mono mb-8 text-[length:var(--fs-mono-label)] text-fg-muted">
        {payload.lesson.courseTitle} · {payload.lesson.sectionTitle}
      </p>

      {/* Grid column order follows the writing mode: in RTL the content
          column starts at the inline start (the right) and the outline sits
          after it. No physical direction anywhere. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <LessonPlayerView payload={payload} />
        </div>
        <CourseOutlineSidebar outline={outline} activeLessonId={payload.lesson.id} />
      </div>
    </main>
  );
}
```

`apps/web/app/(app)/courses/[slug]/lessons/[lessonId]/loading.tsx`:
```tsx
import { Skeleton } from '@ayman/ui';

/**
 * A Server Component, so the skeleton is in the SSR'd HTML. The geometry is
 * derived from the real layout — same grid, same aspect-video box — so the
 * swap is invisible and contributes nothing to CLS.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-[var(--w-shell)] px-6 py-10">
      <div className="mb-8 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-7" />
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <div className="aspect-video w-full rounded-lg border border-line bg-surface-2" />
          <Skeleton width="full" />
          <Skeleton width="wide" />
          <Skeleton width="narrow" />
        </div>
        <div className="space-y-3 rounded-lg border border-line bg-surface-2 p-4">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton
              key={index}
              width={index % 3 === 0 ? 'full' : index % 3 === 1 ? 'wide' : 'narrow'}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 11: Verify the lint rule caught nothing, then verify in a browser**

```bash
pnpm --filter @ayman/web lint && pnpm --filter @ayman/web typecheck
```
Expected: zero `ayman/no-physical-direction` errors. If any fire, fix them — do not disable the rule inline.

With `pnpm dev` running, enrolled as a student, open `/courses/<slug>/lessons/<lessonId>` and check all of these:

1. The outline sidebar renders on the **left** of the content in Arabic (because the content column starts at the inline start), and the active lesson's amber marker is on its **right** edge (`border-s-2`).
2. The video box is at its final size before any network request for YouTube — confirm in the Network panel that **no request to `youtube.com` happens until you click play**.
3. After clicking play, the iframe appears inside the same box with **no reflow**.
4. Playing for 30 seconds produces three `POST /api/lessons/:id/heartbeat` calls, ~10s apart, each with a `delta` near 10.
5. Dragging the scrubber to the end and waiting produces heartbeats with `delta` near 0 — and the lesson does **not** complete.
6. Pressing "أنهيت الدرس · التالي" completes the lesson and navigates to the next one.
7. Switching to another tab fires an immediate final heartbeat (visible in the Network panel as a request with `keepalive`).

- [ ] **Step 12: Commit**

```bash
git add apps/web/components/player apps/web/app/\(app\)/courses
git commit -m "feat(web): RTL-native lesson player with a lazy YouTube facade and server-authoritative progress"
```

---

## Task 11: The student dashboard

**Files:**
- Create: `apps/web/components/dashboard/continue-watching-card.tsx`
- Create: `apps/web/components/dashboard/enrolled-course-card.tsx`
- Create: `apps/web/components/dashboard/recent-scores.tsx`
- Modify (create if Plan 2 left a stub): `apps/web/app/(app)/dashboard/page.tsx`
- Create: `apps/web/app/(app)/dashboard/loading.tsx`

**Interfaces:**
- Consumes: `GET /api/me/dashboard`, `DashboardSchema`, `copy.dashboard.*`.

- [ ] **Step 1: Create the continue-watching card**

Create `apps/web/components/dashboard/continue-watching-card.tsx`:

```tsx
import Link from 'next/link';
import { copy, type ContinueWatching } from '@ayman/contracts';
import { Card, CardBody, cn } from '@ayman/ui';
import { formatRemaining } from '@/lib/format';
import { ChevronForward } from '@/components/player/icons';
import { LessonProgressBar } from '@/components/player/lesson-progress-bar';

export function ContinueWatchingCard({ item }: { item: ContinueWatching }) {
  return (
    <Card>
      <CardBody className="space-y-4">
        <p className="eyebrow">{copy.dashboard.continueWatching}</p>

        <div>
          <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
            {item.courseTitle}
          </p>
          <p className="text-[length:var(--fs-title-3)] font-medium">{item.lessonTitle}</p>
        </div>

        <LessonProgressBar percent={item.progressPercent} label={copy.player.courseProgress} />

        <div className="flex items-center justify-between gap-4">
          {item.remainingSeconds > 0 ? (
            <span className="mono tabular text-[length:var(--fs-mono-label)] text-fg-muted">
              {copy.dashboard.remaining} {formatRemaining(item.remainingSeconds)}
            </span>
          ) : (
            <span />
          )}

          <Link
            href={`/courses/${item.courseSlug}/lessons/${item.lessonId}`}
            className={cn(
              'flex items-center gap-2 rounded-md border border-line-strong px-4 py-2',
              'text-[length:var(--fs-text-sm)] font-medium text-accent-text',
              'transition-colors duration-[160ms] ease-out hover:bg-surface-3',
            )}
          >
            {copy.dashboard.continueCta}
            <ChevronForward />
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
```

- [ ] **Step 2: Create the enrolled-course card**

Create `apps/web/components/dashboard/enrolled-course-card.tsx`:

```tsx
import Link from 'next/link';
import { copy, type EnrolledCourse } from '@ayman/contracts';
import { Card, CardBody } from '@ayman/ui';
import { LessonProgressBar } from '@/components/player/lesson-progress-bar';

export function EnrolledCourseCard({ course }: { course: EnrolledCourse }) {
  // Resume where they stopped when we know, otherwise the course page picks
  // the first lesson — never a dead link either way.
  const href = course.lastLessonId
    ? `/courses/${course.slug}/lessons/${course.lastLessonId}`
    : `/courses/${course.slug}`;

  return (
    <Card>
      <CardBody className="space-y-3">
        <Link href={href} className="block text-[length:var(--fs-title-4)] font-medium">
          {course.title}
        </Link>

        <LessonProgressBar percent={course.progressPercent} label={copy.player.courseProgress} />

        <p className="mono tabular text-[length:var(--fs-mono-label)] text-fg-muted">
          {course.completedLessons} {copy.player.lessonsCompleted} {course.totalLessons}
        </p>
      </CardBody>
    </Card>
  );
}
```

- [ ] **Step 3: Create the recent-scores rail with its empty state**

Create `apps/web/components/dashboard/recent-scores.tsx`:

```tsx
import { copy, type RecentScore } from '@ayman/contracts';
import { Badge, Card, CardBody } from '@ayman/ui';

/**
 * The empty state is not a stopgap — a brand-new student sees it forever
 * until they finish their first quiz, so it has to be designed regardless of
 * when the quiz runner lands. Until then `SCORE_FEED` correctly reports that
 * a student with no attempts has no scores.
 */
export function RecentScores({ scores }: { scores: RecentScore[] }) {
  if (scores.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
            {copy.dashboard.noScoresYet}
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="p-0">
        <ul>
          {scores.map((score) => (
            <li
              key={score.attemptId}
              className="flex items-center justify-between gap-4 border-b border-line-subtle px-5 py-3 last:border-b-0"
            >
              <span className="min-w-0 flex-1 truncate text-start">{score.quizTitle}</span>
              {/* `ok` / `err` are legitimate here: this IS quiz correctness,
                  the one thing green and red are reserved for (§4.2). */}
              <Badge tone={score.scorePercent >= 50 ? 'ok' : 'err'}>
                <span className="tabular">{Math.round(score.scorePercent)}%</span>
              </Badge>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
```

- [ ] **Step 4: Build the page**

`apps/web/app/(app)/dashboard/page.tsx`:
```tsx
import Link from 'next/link';
import { DashboardSchema, copy } from '@ayman/contracts';
import { Card, CardBody, cn } from '@ayman/ui';
import { apiGet } from '@/lib/api';
import { ContinueWatchingCard } from '@/components/dashboard/continue-watching-card';
import { EnrolledCourseCard } from '@/components/dashboard/enrolled-course-card';
import { RecentScores } from '@/components/dashboard/recent-scores';

export default async function DashboardPage() {
  const dashboard = await apiGet('/api/me/dashboard', DashboardSchema);

  return (
    <main className="mx-auto max-w-[var(--w-shell)] px-6 py-10">
      <p className="eyebrow mb-2">{copy.dashboard.eyebrow}</p>
      <h1 className="mb-8 text-[length:var(--fs-title-1)] font-semibold">
        {copy.dashboard.title}
      </h1>

      {dashboard.continueWatching ? (
        <section className="mb-10">
          <ContinueWatchingCard item={dashboard.continueWatching} />
        </section>
      ) : null}

      <section className="mb-10">
        <h2 className="mb-4 text-[length:var(--fs-title-3)] font-medium">
          {copy.dashboard.myCourses}
        </h2>

        {dashboard.enrolledCourses.length === 0 ? (
          <Card>
            <CardBody className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-fg-muted">{copy.dashboard.noCoursesYet}</p>
              <Link
                href="/courses"
                className={cn(
                  'rounded-md border border-line-strong px-4 py-2',
                  'text-[length:var(--fs-text-sm)] font-medium text-accent-text',
                  'transition-colors duration-[160ms] ease-out hover:bg-surface-3',
                )}
              >
                {copy.dashboard.browseCourses}
              </Link>
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {dashboard.enrolledCourses.map((course) => (
              <EnrolledCourseCard key={course.id} course={course} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-[length:var(--fs-title-3)] font-medium">
          {copy.dashboard.recentScores}
        </h2>
        <RecentScores scores={dashboard.recentScores} />
      </section>
    </main>
  );
}
```

`apps/web/app/(app)/dashboard/loading.tsx`:
```tsx
import { Skeleton } from '@ayman/ui';

export default function Loading() {
  return (
    <main className="mx-auto max-w-[var(--w-shell)] px-6 py-10">
      <div className="mb-8 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
      </div>
      <div className="mb-10 space-y-3 rounded-lg border border-line bg-surface-2 p-5">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-6" />
        <Skeleton width="full" className="h-1" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-lg border border-line bg-surface-2 p-5">
            <Skeleton width={index % 2 === 0 ? 'wide' : 'narrow'} className="h-5" />
            <Skeleton width="full" className="h-1" />
            <Skeleton width="narrow" className="h-3" />
          </div>
        ))}
      </div>
    </main>
  );
}
```

> ⚠️ `loading.tsx` wraps `page.js` and nested layouts but **not** the
> same-segment `layout.js`. If the `(app)` layout calls `cookies()`, this
> skeleton will appear not to work — that is the #1 cause, and the fix is in
> the layout, not here.

- [ ] **Step 5: Verify in a browser**

With `pnpm dev` running and a student who has opened at least one lesson:

1. `/dashboard` shows "أكمل من حيث وقفت" naming the exact lesson last opened.
2. Clicking "كمّل" lands on that lesson.
3. Each enrolled course shows an amber bar and an `N درس مكتمل من M` counter with Western, tabular digits.
4. "آخر النتائج" shows the designed empty state, not a blank area.
5. A brand-new student with no enrollments sees the "لسه مش مشترك" card with a working link to `/courses`.
6. Toggle to dark mode: **no shadows anywhere**, and no green on the page.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/dashboard apps/web/app/\(app\)/dashboard
git commit -m "feat(web): student dashboard with continue-watching, course progress and the scores rail"
```

---

## Task 12: CSP, CLS, and the verification pass

The player is the first feature that loads a third-party script and a third-party frame. Both need explicit CSP directives, and one of them is a trap.

**Files:**
- Modify: `apps/web/proxy.ts`
- Create: `docs/reports/plan-4-verification.md`

- [ ] **Step 1: Extend the CSP directives**

In `apps/web/proxy.ts`, update the policy builder:

```ts
  // The IFrame API script is injected by our own nonce'd bundle, so
  // 'strict-dynamic' propagates trust to it automatically. Adding
  // https://www.youtube.com to script-src would be a SILENT NO-OP —
  // 'strict-dynamic' makes browsers ignore host allowlists in script-src
  // entirely (spec §7 P5). Do not add it and then believe it did something.
  //
  // frame-src is NOT affected by 'strict-dynamic', so the no-cookie host has
  // to be listed there explicitly or the player renders an empty box.
  "frame-src 'self' https://www.youtube-nocookie.com",
  // Poster images come from MEDIA_BASE_URL; YouTube's own thumbnails are
  // never requested — the facade is built from our tokens, so no request
  // reaches ytimg before the student presses play.
  "img-src 'self' data: blob:",
  "connect-src 'self'",
```

- [ ] **Step 2: Confirm the report-only policy is clean before enforcing**

Load a lesson, press play, and read the console. Every `Content-Security-Policy-Report-Only` violation must be resolved before the policy is switched to enforcing — a strict CSP shipped blind will break the player, and "it works with report-only" proves nothing.

```bash
curl -sI -b /tmp/student.txt http://localhost:3200/courses/<slug>/lessons/<lessonId> \
  | grep -i content-security-policy
```
Expected: the header includes `frame-src` with `https://www.youtube-nocookie.com`.

- [ ] **Step 3: Measure CLS on the player, do not assume it**

In Chrome DevTools, open the lesson page with the network throttled to Slow 4G:

1. Performance panel → record → reload → stop.
2. Read the **Layout Shift** track. Expected: **CLS 0.00**, with no shift entries at all.
3. Repeat, this time pressing play during the recording. The iframe injection must produce **no** shift, because it lands inside the already-reserved `aspect-video` box.
4. In the Network panel, filter on `youtube`. Expected: **zero requests** before the play click.

If a shift appears, find it before moving on — the usual culprit is a poster image without the absolute-inset positioning, or a heading whose font swaps at a different size.

- [ ] **Step 4: Run the full authorization matrix**

For each row, record the actual status code. This is the test that catches IDOR, and inferring it is not the same as running it.

| Route | anonymous | student, not enrolled | student, enrolled | admin |
|---|---|---|---|---|
| `GET /api/courses/:slug/outline` | 401 | 404 | 200 | 200 |
| `GET /api/lessons/:id/player` | 401 | 404 | 200 | 200 |
| `POST /api/lessons/:id/open` | 401 | 404 | 200 | 200 |
| `POST /api/lessons/:id/heartbeat` | 401 | 404 | 200 | 200 |
| `POST /api/lessons/:id/dwell` | 401 | 404 | 200/400 | 200/400 |
| `POST /api/lessons/:id/complete` | 401 | 404 | 200 | 200 |
| `GET /api/lessons/:id/attachments/:aid` | 401 | 404 | 302 | 302 |
| `GET /api/me/dashboard` | 401 | 200 (empty) | 200 | 200 |
| `POST /api/courses/:slug/enroll` | 401 | 200 | 200 | 200 |

**Not one cell may be 403.** A 403 on any of the 404 cells means the endpoint is confirming that a lesson exists to someone who has no right to know.

- [ ] **Step 5: Run the anti-scrub proof end to end, in a real browser**

This is the acceptance criterion the whole plan exists for.

1. Open a video lesson. Immediately drag the scrubber to the last second.
2. Wait 30 seconds, then reload.
3. Expected: the lesson is **not** marked complete; the outline shows no check mark; `progress_percent` on the enrollment is unchanged.
4. Confirm in the database:
   ```bash
   psql "$DATABASE_URL" -c \
     "SELECT watched_seconds, max_position_seconds, completion, state, completed_via
        FROM app.lesson_progress ORDER BY updated_at DESC LIMIT 1;"
   ```
   Expected: a high `max_position_seconds`, a near-zero `watched_seconds`, `state = in_progress`, `completed_via` NULL.
5. Now watch the same lesson properly. Confirm it flips to `completed` with `completed_via = 'auto'`.
6. On a second lesson, press "أنهيت الدرس · التالي" without watching. Confirm `completed_via = 'manual'` — the two are distinguishable, which is the entire point.

- [ ] **Step 6: Run every gate**

```bash
pnpm lint && pnpm typecheck && pnpm test
```
Expected: green across all five packages, with the Plan 1 baseline of 105 tests plus everything added here.

- [ ] **Step 7: Write the verification report**

Create `docs/reports/plan-4-verification.md` containing the measured numbers, not claims: the CLS reading, the authorization matrix with real status codes, the heartbeat rate-limit cutover point, and the four database rows from Step 5. Anything not actually run is reported as not run.

- [ ] **Step 8: Commit**

```bash
git add apps/web/proxy.ts docs/reports/plan-4-verification.md
git commit -m "chore: CSP directives for the YouTube embed and the Plan 4 verification report"
```

---

## Definition of done

- [ ] A student enrolls, opens a lesson, watches it, and the lesson completes **by itself** — verified in a browser.
- [ ] Dragging the scrubber to the end and waiting **does not** complete the lesson, verified in a browser *and* asserted by a test that fails if the rule is weakened.
- [ ] Thirty heartbeats fired back to back accumulate less watch time than thirty seconds of real playback.
- [ ] `{"position":10,"delta":10,"completed":true}` on the heartbeat endpoint returns **400**, not 200 with `completed` ignored.
- [ ] `POST /api/lessons/:id/complete` with `{"score":100}` returns **400**.
- [ ] A text lesson cannot be completed in under five real seconds, no matter how early or how often the client asks.
- [ ] Every "not enrolled" case returns **404**, never 403 — all nine rows of the matrix recorded.
- [ ] The heartbeat endpoint returns 429 after 15 requests in a minute, bucketed **per session**, so two students behind one IP do not share a counter.
- [ ] Postgres rejects `completion = 1.5`, a negative `watched_seconds`, and a completed row with no `completed_via`.
- [ ] CLS on the player measures **0.00** on Slow 4G, and no request reaches `youtube.com` before the play click.
- [ ] `enrollment.lastLessonId` resumes the dashboard's continue-watching card on the exact lesson last opened; unpublishing that lesson makes the card disappear rather than break.
- [ ] `completed_via` distinguishes `auto`, `manual` and `dwell` in the database.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` green across all five packages, with zero `ayman/no-physical-direction` errors and zero inline disables of it.
- [ ] No green anywhere in the player or dashboard except the quiz-score badge; no shadows in dark mode.

## Deliberately not in this plan

**Quizzes** — the question bank, the quiz builder, the runner, grading, review windows and `quiz_attempts` are the next two plans. This plan ships the `SCORE_FEED` port with a correct empty implementation and a quiz-lesson doorway that links to `/quizzes/:lessonId` via `quizHref()` in `apps/web/lib/quiz-links.ts`; the quiz plan rebinds the token and creates the route. Neither requires a contract or UI change here.

**`subject_attempts`** (§6.6) — the التحسين / best-score-wins table. It is a results-and-analytics concern with no consumer until scores exist.

**Access-grant enforcement.** `AccessGrant` rows are written and shaped correctly, but nothing reads them yet: v1 is free for everyone, so enrollment status is the gate. When a paid path appears, the gate moves into `LessonAccessService.require` — one file, one query.

**The reserved `lessons` access controls** — `visible_from`, `visible_to`, `unlocks_after_lesson_id`, `view_limit`, `content_group_id`. The columns exist from Plan 3 and `open_count` now feeds the future `view_limit` check, but no enforcement ships here.

**Notes, bookmarks, playback-speed memory, and captions UI.** All additive.

**Redis-backed throttler storage.** Still the in-memory store, which is correct for a single local instance and **must** move to `@nest-lab/throttler-storage-redis` before a second replica exists — the heartbeat endpoint makes this materially worse than it was, because per-replica limits multiply.

**Offline / resumable heartbeats.** A student who loses connectivity mid-lesson loses at most one 10s window (the hook restores the delta on failure, but only until the next flush). A durable outbox is not worth the complexity at this scale.

---

## Depends on

Plan 4 is build-order item 9. Register: `docs/superpowers/plans/README.md` (normative).

**Plan 1 — Foundation**
- Turborepo/pnpm workspace, `packages/config` ESLint preset (`ayman/no-physical-direction`)
- `packages/ui` tokens + `Button`, `Card`, `CardBody`, `Badge`, `cn()`
- `PrismaService`, schema `app`, the Zod-validated `env.ts` (Task 7 appends `MEDIA_BASE_URL` to it)
- `ThrottlerModule.forRoot` in `app.module.ts` — Task 4 **rewrites it in place** to add `getTracker`
- `apps/web/lib/api.ts#apiGet` and the same-origin `/api` rewrite

**Plan 2 — Auth & onboarding**
- `AuthGuard` (`APP_GUARD`), `@Public()`, `@CurrentUser()` → `AuthenticatedUser` with `id` + `role`, `@RequirePermission()`
- `apps/api/src/auth/permissions.ts` — Task 3 **appends** `progress:read` / `progress:write`
- `apps/web/proxy.ts` with a CSP builder — Task 12 adds `frame-src https://www.youtube-nocookie.com`
- The CSRF guard: header `x-csrf-token`, double-submit value from the `__Host-csrf` cookie
- `apps/web/app/(app)/dashboard/page.tsx` — Task 11 replaces its body (creates it if Plan 2 left a stub)

**Plan 3 — Content & catalog**
- Prisma `Course`, `CourseSection`, `Lesson` (with `kind`, `isPublished`, `isFreePreview`, `estimatedSeconds`, `completionMode`, `completionMinViewSeconds`, `completionPassGrade`), `LessonVideo` (`externalId` = 11-char id, `durationSeconds` **> 0 or auto-completion is impossible**, `posterKey`), `LessonText`, `LessonAttachment`
- Prisma `Enrollment`, `AccessGrant` and the enums `EnrollmentStatus`, `EnrollmentSource`, `AccessScope`, `GrantSource`, `ScholarshipKind` — **Task 2 adds only `LessonProgress`**
- `EntitlementService.resolveCourseAccess(userId, courseId)` / `.ensurePlatformGrant(userId)`
- `POST /api/courses/:courseId/enroll`, `GET /api/enrollments` — Task 3 widens the read model, adds no route
- `@ayman/contracts/video`: `extractYouTubeId`, `youTubeEmbedUrl`, `youTubeThumbnailUrl`, `YOUTUBE_ID_RE`
- `apps/web/lib/api.ts`: `apiGetOrNull`, `apiSend` — Task 9 adds only `apiPost`
- `apps/web/lib/cache-tags.ts`: `tag()`, `TAG_COURSES`, `courseTag()`
- `apps/web/app/(site)/courses/[slug]/page.tsx` — the course detail page `EnrolledCourseCard` links to
- The vitest + jsdom DOM harness for `apps/web` and `packages/ui` (Plan 3 Task 10 Step 0)
- `@ayman/ui`: `Input`, `Textarea`, `Select`, `Label`, `Field` family, `Checkbox`, `RadioGroup`, `Dialog`

**Consumed by later plans — do not change these signatures without updating them**
- Plan 5 calls `LessonProgressService.recordQuizResult({ userId, lessonId, passed, scaledScore, gradeOutOf })`, `LessonAccessService.require(userId, lessonId)` and `CourseProgressService.recalculate(tx, enrollmentId, courseId)`, and rebinds `SCORE_FEED`.
- Plan 5 imports `quizHref()` from `apps/web/lib/quiz-links.ts`, created here.
- Plan 6 Task 13 owns the media **upload** pipeline; the `MEDIA_URL_RESOLVER` read port defined here does not change, and `NEXT_PUBLIC_MEDIA_ORIGIN` must resolve to the same origin as `MEDIA_BASE_URL`.
- Plan 7 Task 9 swaps the throttler storage for Redis and must preserve Task 4's `getTracker`.
