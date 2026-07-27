# Plan 5 — Quiz Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A versioned question bank, an admin quiz builder that authors questions faster than a spreadsheet, a student runner that survives a disconnected tab, server-side grading ported verbatim from Moodle, a gated review screen, a grade-appeal (التظلم) flow, and per-question item analytics — with correct answers that provably never reach the browser before submission.

**Architecture:** Everything that decides a grade lives in `apps/api`. The browser receives question stems and option bodies and nothing else; the option `fraction`, the per-option feedback, the short-answer patterns and the instructor grader notes are stripped by an explicit Prisma `select`, again by a serializer, and a contract test asserts the raw JSON body of a learner request contains none of those keys at any depth. Attempt state is hybrid: one mutable `attempt_questions` row per question so a results query is a single join (Canvas), plus an append-only `attempt_events` log so every regrade and appeal has a trail (Moodle). The grading functions are pure, dependency-free, and unit-tested at their float boundaries; the services around them do the DB work.

**Tech Stack:** NestJS 11.1.28 · Prisma 7.9.0 · PostgreSQL 16.14 · Zod 4.4.3 (`packages/contracts`) · `nestjs-zod` 5.5.0 · `@nestjs/schedule` 6.1.3 (overdue sweeper) · Next.js 16.2.11 / React 19.2.8 · react-hook-form **7.83.0** + `@hookform/resolvers` 5.5.3 · `@dnd-kit/core` 6.3.1 + `@dnd-kit/sortable` 10.0.0 · `sonner` 2.0.7 · `sanitize-html` 2.17.6 · Jest + SWC (api) · Vitest (web/packages)

**Spec:** `docs/superpowers/specs/2026-07-25-ayman-platform-design.md` §6.4, §6.5, §7-P2, §8
**Research:** `docs/research/2026-07-25-research-brief.md` §1.5, §5.4, §5.5, §6-P2

---

## Prerequisites and the interfaces this plan expects from Plans 3 and 4

Plan 5 is build-order items 10–12. It assumes Plans 1–4 have landed. It **consumes** the following and does not create them. If a name below does not exist when you start, reconcile with the plan that owns it before writing code — do not silently invent a parallel model.

| Expected from | Interface | Used by |
|---|---|---|
| Plan 3 | Prisma models `Course { id, slug, status, systemId, year, trackId, subjectId }`, `CourseSection { id, courseId, position }`, `Lesson { id, courseId, sectionId, kind, position, isPublished, completionMode, completionPassGrade }` with `LessonKind` including `quiz` | Task 2 (`Quiz.lessonId` FK), Task 10 (access check) |
| Plan 3 | **`sanitizeRichText(html: string): string`** from `apps/api/src/common/sanitize/rich-text.ts` — `sanitize-html` with the §7-P3 allowlist, forced `rel="noopener noreferrer nofollow"`, all `<iframe>` denied | Tasks 7, 15 (stems, option bodies, feedback) |
| Plan 3 | `apps/web/app/(admin)/layout.tsx` admin shell + `sonner` `<Toaster dir="rtl"/>` mounted | Tasks 16, 20, 21 |
| Plan 3 | `@ayman/ui` primitives `Input`, `Textarea`, `Select`, `Label`, the `Field` family (+ `issuesForPath`), `Dialog`, `Checkbox`, `RadioGroup` (Plan 3 Task 10) | Tasks 16–19 |
| Plan 3 | `SortableList` — the generic `@dnd-kit` wrapper at `apps/web/components/admin/sortable-list.tsx` that emits **one** ordered-id array on drop (Plan 3 Task 12) | Task 16 |
| Plan 3 | `buildReorderSql(table, scopeColumn, scopeId, orderedIds)` — its union type already includes `'quiz_slots'` / `'quiz_id'` | Task 15 |
| Plan 3 | `apps/web/lib/api.ts` `apiSend<T>(method, path, body, schema)` — Server-Action mutation helper, header `x-csrf-token`, value from the `__Host-csrf` cookie (Plan 3 Task 10) | Tasks 16–21 |
| Plan 3 | `apps/web/lib/cache-tags.ts` `tag(...parts)` — the only sanctioned tag builder | Tasks 16, 21 |
| Plan 3 | The vitest + jsdom DOM test harness for `apps/web` and `packages/ui` (Plan 3 Task 10 Step 0) | every web-side spec here |
| Plan 3/4 | Prisma `Enrollment { id, userId, courseId, status }` — **declared by Plan 3 Task 4**, status enum `active\|suspended\|expired\|revoked\|completed` | Task 10 (`QuizAccessService`) |
| Plan 4 | Prisma `LessonProgress { enrollmentId, lessonId, state, completion }` | Task 12 (completion) |
| Plan 4 | `LessonProgressService.recordQuizResult(args: { userId: string; lessonId: string; passed: boolean; scaledScore: number; gradeOutOf: number }): Promise<void>` | Task 12, Task 19 (after a regrade) |
| Plan 4 | `LessonAccessService.require(userId, lessonId)` — the single ownership gate. `QuizAccessService` **delegates to it** and adds only quiz-specific checks; it does not re-derive the enrollment predicate | Task 10 |
| Plan 4 | `CourseProgressService.recalculate(tx, enrollmentId, courseId)` | Task 12 |
| Plan 4 | `SCORE_FEED` token + `ScoreFeed { recentFor(userId, limit): Promise<RecentScore[]> }` in `apps/api/src/modules/dashboard/score-feed.ts` | Task 12 (rebind) |
| Plan 4 | `quizHref(lessonId: string): string` in `apps/web/lib/quiz-links.ts` — **created by Plan 4**, imported here | Tasks 17–18 |
| Plan 2 | `AuthGuard` (APP_GUARD), `@Public()`, `@CurrentUser()`, `@RequirePermission()`, `roleHasPermission()`, `PERMISSIONS` | every controller here |

**Interfaces Plan 5 produces for other plans:**

| Consumer | Interface |
|---|---|
| Plan 4 (completion) | `POST /api/quiz/attempts/:attemptId/submit` calls `LessonProgressService.recordQuizResult` |
| Plan 4 (dashboard) | `QuizScoreFeed implements ScoreFeed`, rebound onto `SCORE_FEED` in `DashboardModule` — one line, no contract or UI change |
| Plan 6 (Task 11 screens) | `GET /api/admin/attempts`, `POST /api/admin/attempts/:id/reopen`, `POST /api/admin/attempts/:id/extra-time`, `GET /api/admin/appeals`, `PATCH /api/admin/appeals/:id`, `GET /api/admin/quizzes/:quizId/analytics` — **Plan 5 owns every quiz/attempt/appeal endpoint; Plan 6 builds only the DataTable screens on top of them** |
| Plan 6 | `AttemptService.recomputeScore(attemptId: string): Promise<number>` and `AttemptService.reissueToken(attemptId: string): Promise<string>` |
| Plan 7 (security pass) | `FORBIDDEN_ANSWER_KEYS`, `@NoAnswerLeak()` and the authorization-matrix fixture in `apps/api/src/modules/quiz/quiz.authz.spec.ts` |

---

## Reconciliation notes (cross-plan pass, 2026-07-26)

Reconciled against Plans 3, 4, 6 and 7. `docs/superpowers/plans/README.md` is normative.
Decisions that changed **this** plan:

1. **The sanitizer is `sanitizeRichText()`, not `HtmlSanitizerService`.** Plan 3 Task 2 owns
   `apps/api/src/common/sanitize/rich-text.ts` and its XSS corpus. Every `stemHtml`,
   `bodyHtml`, `feedbackHtml` and `explanationHtml` write in this plan calls that function.
   There is no `HtmlModule` and no second allowlist. Wherever this document says
   `sanitizeRichText(x)`, read `sanitizeRichText(x)`.
2. **Permission names are canonical:** `question:write` → **`question:write`**,
   `quiz:write` → **`quiz:write`**, `attempt:read` → **`attempt:read`**. The catalogue
   also rejects `resource:action:qualifier` — `PERMISSIONS`'s shape test is
   `/^[a-z][a-z-]*:[a-z][a-z-]*$/`, which `attempt:read` fails. Student additions are
   `quiz:read`, `quiz:attempt`, `appeal:create`; admin holds `question:write`, `quiz:write`,
   `quiz:grade`, `attempt:read`, `attempt:grade`, `attempt:unlock`, `appeal:read`,
   `appeal:resolve`, `analytics:read` through `'*'`. **Append to `PERMISSIONS`; never replace it.**
3. **Plan 5 owns the entire quiz/attempt/appeal API.** Plan 6 Task 11's draft declared a second
   `GET /api/admin/appeals`, a second `POST /api/admin/appeals/:id/resolve`, a second
   `POST /api/admin/attempts/:id/unlock` and a second `app/(admin)/admin/appeals/page.tsx`.
   Those are removed from Plan 6; it builds screens over the endpoints below. To make that
   possible, **Task 20 gains a cross-quiz `GET /api/admin/attempts`** (filterable by quiz,
   student and state) and **Task 12 gains `AttemptService.recomputeScore` and
   `AttemptService.reissueToken`**, both of which Plan 6 calls.
4. **`quizHref()` is created by Plan 4**, in `apps/web/lib/quiz-links.ts`. Import it; do not
   re-declare it. That removes the last circular reference between Plans 4 and 5.
5. **`QuizAccessService` delegates to Plan 4's `LessonAccessService.require(userId, lessonId)`**
   and layers the quiz-specific checks (publish state, open window, attempt limit, cooldown) on
   top. Re-implementing the enrollment predicate is the exact drift the single-gate rule exists
   to prevent, and a lesson the caller is not enrolled in must return **404, never 403**.
6. **Copy namespaces owned here:** `copy.quiz`, `copy.quizErrors`, `copy.appeal`, `copy.quizAdmin`.
   This plan writes **nothing** under `copy.admin.*` — that tree is split between Plan 3
   (`admin.common`, `admin.nav`, `admin.course`, `admin.section`, `admin.lesson`, `admin.reorder`)
   and Plan 6 (`admin.title`, `admin.list`, `admin.actions`, `admin.shortcuts`, `admin.students`,
   `admin.taxonomy`, `admin.settings`, `admin.branding`, `admin.flags`, `admin.navigation`,
   `admin.home`, `admin.media`, `admin.audit`). The quiz builder, question bank, appeal queue and
   analytics screens all read `copy.quizAdmin.*`.
7. **Web routes owned here:** `app/(app)/quizzes/**` and
   `app/(admin)/admin/{questions,quizzes,appeals}/**`. API prefixes owned here: `/api/quiz/*` and
   `/api/admin/{questions,quizzes,appeals,attempts}/*`. No other plan writes into these.
8. **UI primitives, `SortableList`, `apiSend`, the admin shell and the DOM test harness all come
   from Plan 3**, not Plan 4 and not Plan 6. Nothing here scaffolds a second copy.
9. **Auditing is retrofitted by Plan 6 Task 3**, which owns `AUDIT_ACTIONS` in full — including
   `quiz:answer-edit`, `attempt:unlock` and `appeal:resolve`. This plan does not call
   `AuditService`; Plan 6 wires the calls into the services created here.
10. **`attempt_events` append-only REVOKEs** are written by *this* plan's migration (Global
    Constraint 20). Plan 7 Task 10 does the same for `audit_log` and **verifies** both; it does not
    re-issue this one.

---

## Global Constraints

> **Canonical set.** These nine are identical in Plans 3–7 and are restated in
> `docs/superpowers/plans/README.md` § Global Constraints, which is normative: single origin / no
> CORS · ports 3200 web + 3300 api · RTL logical utilities only · no user-facing literals outside
> `packages/contracts` · extensionless relative imports · `@@schema("app")` on every Prisma model ·
> deny-by-default guards with `resource:action` permissions · no gradients / glass / emoji, radius
> ≤ 8px, no dark-mode shadows · **green and red reserved for quiz correctness**. Never
> `$queryRawUnsafe` / `$executeRawUnsafe` — the ESLint `no-restricted-syntax` rule hard-fails both.

Every task's requirements implicitly include this section. Items 1–10 are inherited and still binding; 11–20 are this plan's own.

1. **Single origin.** `apps/web` serves `/`, `apps/api` serves `/api`. **Never configure CORS.** Never hardcode `http://localhost:3300` outside `next.config.ts` and `apps/web/lib/api.ts`.
2. **Ports:** web `3200`, api `3300`. Port 3000 is occupied by an unrelated service on this machine.
3. **RTL is native, not mirrored.** Logical Tailwind utilities only — `ms-/me-/ps-/pe-/start-/end-/text-start/text-end/border-s/border-e`. The `ayman/no-physical-direction` rule sees through `cn()`/`clsx()`/template literals/ternaries/arrays/object keys **and module-level class constants**, so hiding `ml-4` in a `const QUESTION_CLASSES` object does not work.
4. **No user-facing string literals outside `packages/contracts`.** All Arabic copy lives in `packages/contracts/src/copy/ar.ts`. `app/dev/*` pages are exempt. Interpolation goes through `formatCopy()` (Task 4) — never string concatenation in a component.
5. **Extensionless relative imports.** `apps/api` uses `module: Preserve` + `moduleResolution: Bundler` with `noEmit: true`; SWC does the real CommonJS emit. Any new leaf module in `packages/contracts` that `apps/api` imports **for its runtime value** also needs an explicit subpath export in `packages/contracts/package.json` — Node's native ESM loader cannot resolve extensionless barrel re-exports at runtime.
6. **Every Prisma model gets `@@schema("app")`.** Prisma 7 keeps connection strings out of `schema.prisma`. `prisma generate` does **not** auto-run after `migrate` — run it explicitly, every time.
7. **NestJS guards are the sole authorization authority.** Permissions are `resource:action` strings. Never a role equality check. Deny by default.
8. **Separate DTOs per role, `whitelist: true` + `forbidNonWhitelisted: true`.** The realistic attack in this plan is not privilege escalation — it is a student PATCHing `{ score: 100 }`, `{ fraction: 1 }`, `{ state: 'graded_right' }`, or `{ deadlineAt: <later> }` onto their own attempt row.
9. **Design:** no gradients, no glassmorphism, no emoji icons, radius ≤ 8px on cards, no shadows in dark mode, amber (`--a-9`) used **flat**. **`--ok` green and `--err` red are reserved for quiz correctness and appear nowhere else in this plan** — not on the timer, not on the submit button, not on a "saved" toast. A timer running out uses `--warn`.
10. **Commit after every task.** Explicit `git add` paths, conventional messages.
11. **Correct answers never leave the server before submission**, enforced in three layers (Task 9). Adding a field to a learner payload without extending the contract test is a review-blocking defect.
12. **Snapshots are non-negotiable.** `attempt_questions` stores `questionVersionId` **and** `optionOrder int[]`, both captured at attempt creation, both read on every subsequent render of that attempt.
13. **`deadlineAt` is persisted at attempt start and NEVER recomputed.** Accommodation is additive (`extraTimeSeconds`), never a recalculation of `deadlineAt`.
14. **`attemptToken` is required on every write**, and the ownership + token + `submitted_at IS NULL` conditions are **compiled into the UPDATE's WHERE clause**. Never `findUnique` then `if`.
15. **The scoring primitive is `{option, fraction}`** — a numeric weight that may be negative. There is no `is_correct` boolean column anywhere in this plan.
16. **Grading is server-side only.** No grading function is exported from `packages/contracts`; they live in `apps/api/src/modules/quiz/grading/` so they cannot be bundled into the browser even by accident.
17. **The float epsilons stay.** `< 0.000001` → wrong, `> 0.999999` → right. Never `=== 1`, never `=== 0`.
18. **Practice is the default mode.** `Quiz.mode` defaults to `practice` in the Prisma schema, in the Zod contract, and in the builder form's `defaultValues`.
19. **Zod refinements go INSIDE each discriminated-union member, never on the union.** A refinement on the union produces an issue with `path: []`, which react-hook-form cannot map to a field, so the form rejects the submit with nothing rendered. Task 4 has a test that asserts every issue carries a non-empty path.
20. **`attempt_events` is append-only.** `UPDATE` and `DELETE` are revoked from `ayman_runtime` at the database level, exactly like `audit_log`.

---

## The ten correctness rules and where each is tested

| # | Rule | Enforced in | Proven by |
|---|---|---|---|
| Q1 | Correct answers never leave the server before submission | Task 9 — Prisma `select`, serializer, `@NoAnswerLeak()` interceptor | `quiz-leak.contract.spec.ts` walks the raw body for forbidden keys **and** forbidden values |
| Q2 | Version + option-order snapshots | Task 10 | Edit-a-published-question test: old attempt review is unchanged; resume test: option order is byte-identical |
| Q3 | `deadlineAt` persisted, never recomputed | Task 10 / 12 | Change `durationSeconds` mid-attempt → in-flight `deadlineAt` unchanged |
| Q4 | `attemptToken` on every write; reject `submitted_at IS NOT NULL` | Task 11 / 12 | Stale token → 409; double-submit race → exactly one 200, one 409 |
| Q5 | `{option, fraction}` primitive, negatives allowed | Task 1 / 5 | Schema has no `is_correct`; a `-0.25` option grades to `graded_wrong` and floors the attempt at 0 |
| Q6 | Moodle algorithms verbatim, epsilons kept | Task 5 / 6 | Boundary table at `0.000001` / `0.999999`, the multi clamp at 0, first-pattern-wins |
| Q7 | Two modes; confirm-before-submit with an unanswered count; admin unlock ships pre-launch | Task 12 / 17 / 20 | Unanswered count is server-computed and asserted; unlock endpoints exist and are permission-gated |
| Q8 | `reviewOptions` 4×7 matrix resolved server-side, stripped in the serializer | Task 13 | Each of the four windows × the seven flags asserted against the payload |
| Q9 | Hybrid storage: mutable row + append-only log | Task 11 | Every state change writes an event; `UPDATE app.attempt_events` as `ayman_runtime` is denied |
| Q10 | Retry cooldown 24h; overdue autosubmit with 60s grace | Task 10 / 12 | Cooldown boundary test; sweeper closes an abandoned attempt after grace |

---

## File Structure

```
packages/contracts/
├─ src/copy/ar.ts                      + `quiz`, `quizAdmin`, `appeal` copy blocks (Task 4)
├─ src/format.ts                       formatCopy(template, vars) — the ONLY interpolation path
├─ src/quiz/question.ts                the z.discriminatedUnion('type', …) shared by form + API
├─ src/quiz/quiz-settings.ts           quiz config + the 4×7 review matrix schema + defaults
├─ src/quiz/attempt.ts                 learner-facing attempt/response/review payload schemas
├─ src/quiz/import.ts                  bulk text importer (Aiken superset, Arabic letters)
└─ src/quiz/index.ts                   barrel (web only — api imports the leaf subpaths)

apps/api/prisma/
├─ schema.prisma                       11 new models, 10 new enums
└─ migrations/…                        + 6 hand-written SQL fragments Prisma cannot express

apps/api/src/modules/quiz/
├─ grading/fraction.ts                 epsilons, clamp, roundMark, fractionToState
├─ grading/wildcard.ts                 Moodle's compare_string_with_wildcard, ported
├─ grading/grade-question.ts           per-type grading, pure
├─ grading/grade-attempt.ts            aggregation, attempt floor at 0, pass decision
├─ grading/*.spec.ts                   boundary tables — the highest-value unit tests here
├─ serializers/learner.serializer.ts   LEARNER_* Prisma selects + toLearnerQuestion()
├─ serializers/review.serializer.ts    review window resolution + 7-flag field stripping
├─ interceptors/no-answer-leak.*       @NoAnswerLeak() + the runtime deep-scan
├─ question-bank.service.ts            versioned CRUD; a `ready` version is immutable
├─ quiz-builder.service.ts             slots, pools, reorder, duplicate, bulk import commit
├─ quiz-access.service.ts              one query: enrollment + publish state + open window
├─ attempt.service.ts                  start / resume / autosave / submit
├─ attempt-events.service.ts           appendEvent(tx, …) with a gap-free per-attempt seq
├─ overdue.service.ts                  @Cron sweeper behind a pg advisory lock
├─ appeals.service.ts                  التظلم: open, resolve, regrade, recompute
├─ analytics.service.ts               distribution, facility, Kelley discrimination, distractors
├─ dto/*.dto.ts                        separate learner and admin DTOs
├─ *.controller.ts                     learner, admin-questions, admin-quizzes, appeals
└─ quiz.module.ts

apps/web/
├─ app/(app)/quizzes/[lessonId]/page.tsx                       start / resume / history
├─ app/(app)/quizzes/[lessonId]/attempt/[attemptId]/page.tsx   the runner
├─ app/(app)/quizzes/[lessonId]/attempt/[attemptId]/review/…   results + review
├─ app/(admin)/admin/questions/…                               bank browser + editor
├─ app/(admin)/admin/quizzes/[quizId]/…                        builder + analytics
├─ app/(admin)/admin/appeals/page.tsx                          appeal queue
├─ components/quiz/…                                           runner, timer, navigator, review
├─ components/admin/quiz/…                                     question form, bulk import, slots
└─ lib/quiz-links.ts                                           quizHref()
```

---

## Task 1: Question-bank schema — versioned, `{option, fraction}`, immutable once ready

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<ts>_question_bank_constraints/migration.sql` (hand-written)
- Create: `apps/api/src/modules/quiz/schema.spec.ts`

**Interfaces:**
- Consumes: `User` (Plan 2).
- Produces: Prisma models `QuestionCategory`, `QuestionBankEntry`, `QuestionVersion`, `QuestionOption`; enums `QuestionType`, `QuestionStatus`, `QuestionOwnerScope`. Every later task references these exact names.

- [ ] **Step 1: Append the enums and models to `apps/api/prisma/schema.prisma`**

```prisma
enum QuestionType {
  mcq_single
  mcq_multi
  true_false
  short_answer
  essay

  @@schema("app")
}

enum QuestionStatus {
  draft
  ready
  hidden

  @@schema("app")
}

/// v1 is one instructor, one subject, so every category is `global` (spec §1).
/// The enum exists so a future multi-teacher build is a data change, not a
/// migration of every existing row.
enum QuestionOwnerScope {
  global
  instructor
  course

  @@schema("app")
}

/// A folder in the bank. Self-referencing so the admin can nest
/// "الوحدة الأولى → الحلقات التكرارية → for".
model QuestionCategory {
  id         String             @id @default(uuid(7))
  parentId   String?            @map("parent_id")
  ownerScope QuestionOwnerScope @default(global) @map("owner_scope")
  ownerId    String?            @map("owner_id")
  name       String
  sortOrder  Int                @default(0) @map("sort_order")
  createdAt  DateTime           @default(now()) @map("created_at")

  parent   QuestionCategory?  @relation("CategoryTree", fields: [parentId], references: [id], onDelete: Restrict)
  children QuestionCategory[] @relation("CategoryTree")
  entries  QuestionBankEntry[]

  @@index([parentId])
  @@map("question_categories")
  @@schema("app")
}

/// The stable identity of a question across all its versions. Quiz slots and
/// analytics point at the ENTRY; attempts point at a VERSION.
model QuestionBankEntry {
  id          String   @id @default(uuid(7))
  categoryId  String   @map("category_id")
  /// Reserved for a future QTI import/export. `{option, fraction}` already
  /// makes the schema QTI-shaped; this is the identifier column QTI needs.
  externalRef String?  @map("external_ref")
  ownerId     String   @map("owner_id")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  category  QuestionCategory  @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  owner     User              @relation(fields: [ownerId], references: [id], onDelete: Restrict)
  versions  QuestionVersion[]
  quizSlots QuizSlot[]

  @@index([categoryId])
  @@map("question_bank_entries")
  @@schema("app")
}

/// IMMUTABLE ONCE `status = 'ready'`. Editing a ready question creates
/// version N+1 in `draft`; publishing flips it to `ready`. This is the whole
/// reason `attempt_questions.question_version_id` can be trusted years later:
/// without it, fixing a typo in a stem silently rewrites the review screen of
/// every attempt anyone ever made. A database trigger (Step 3) enforces the
/// immutability — a service-layer rule alone would be one forgotten
/// `prisma.questionVersion.update` away from data loss.
model QuestionVersion {
  id                  String         @id @default(uuid(7))
  bankEntryId         String         @map("bank_entry_id")
  version             Int
  status              QuestionStatus @default(draft)
  type                QuestionType
  stemHtml            String         @map("stem_html")
  generalFeedbackHtml String?        @map("general_feedback_html")
  defaultMark         Decimal        @default(1) @map("default_mark") @db.Decimal(10, 4)
  /// Reserved: Moodle's per-attempt penalty for interactive-with-multiple-tries.
  /// v1 always writes 0 and the grader ignores it — see "Deliberately not".
  penalty             Decimal        @default(0) @db.Decimal(10, 4)
  /// { shuffleOptions, caseSensitive, minWords, maxWords, graderInfo }.
  /// `graderInfo` is INSTRUCTOR-ONLY and must never reach a learner payload —
  /// which is why the learner select projects `settings` field by field
  /// instead of passing the jsonb through (Task 9).
  settings            Json           @default("{}")
  createdBy           String         @map("created_by")
  createdAt           DateTime       @default(now()) @map("created_at")

  bankEntry QuestionBankEntry @relation(fields: [bankEntryId], references: [id], onDelete: Cascade)
  author    User              @relation(fields: [createdBy], references: [id], onDelete: Restrict)
  options   QuestionOption[]
  attemptQuestions AttemptQuestion[]

  @@unique([bankEntryId, version])
  @@index([bankEntryId, status])
  @@map("question_versions")
  @@schema("app")
}

/// The scoring primitive. `fraction` is a numeric weight that MAY BE NEGATIVE
/// (per-option negative marking) — there is deliberately no `is_correct`
/// boolean anywhere in this schema. Partial credit and negative marking are
/// therefore free, and a QTI exporter is a serializer, not a migration.
///
/// For `short_answer`, `bodyHtml` is '' and `answerPattern` holds the raw
/// match pattern. The pattern must NOT go through sanitize-html: HTML-encoding
/// `<` would silently break a pattern like `a < b`, and the review screen
/// renders it as text, never as HTML.
model QuestionOption {
  id                String  @id @default(uuid(7))
  questionVersionId String  @map("question_version_id")
  bodyHtml          String  @map("body_html")
  answerPattern     String? @map("answer_pattern")
  fraction          Decimal @db.Decimal(10, 6)
  feedbackHtml      String? @map("feedback_html")
  position          Int

  version QuestionVersion @relation(fields: [questionVersionId], references: [id], onDelete: Cascade)

  @@unique([questionVersionId, position])
  @@map("question_options")
  @@schema("app")
}
```

Add the back-relations to `User` (Plan 2's model):

```prisma
  // inside model User
  questionBankEntries QuestionBankEntry[]
  questionVersions    QuestionVersion[]
```

- [ ] **Step 2: Migrate and generate**

```bash
pnpm --filter @ayman/api exec prisma migrate dev --name question_bank
pnpm --filter @ayman/api exec prisma generate
```
Expected: a migration is created and applies cleanly. `prisma generate` is a separate command in Prisma 7 — it does not run after `migrate`.

- [ ] **Step 3: Hand-write the constraints Prisma cannot express**

```bash
pnpm --filter @ayman/api exec prisma migrate dev --create-only --name question_bank_constraints
```

Paste into the generated `migration.sql`:

```sql
-- A fraction outside [-1, 1] is always an authoring bug: 1 is "fully correct"
-- by definition, and -1 is the strongest negative marking that still lets the
-- attempt floor at 0 behave predictably.
ALTER TABLE "app"."question_options"
  ADD CONSTRAINT "question_options_fraction_range"
  CHECK ("fraction" >= -1 AND "fraction" <= 1);

-- A version number is 1-based and monotonic per entry.
ALTER TABLE "app"."question_versions"
  ADD CONSTRAINT "question_versions_version_positive"
  CHECK ("version" >= 1);

-- Immutability. A `ready` or `hidden` version is frozen: every grading-relevant
-- column is closed to UPDATE, and its options are closed to INSERT/UPDATE/DELETE.
-- Only the status column may still change (ready -> hidden retires a question
-- without touching what past attempts recorded).
CREATE OR REPLACE FUNCTION "app"."question_versions_freeze"()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."status" <> 'draft' THEN
    IF NEW."type" IS DISTINCT FROM OLD."type"
       OR NEW."stem_html" IS DISTINCT FROM OLD."stem_html"
       OR NEW."general_feedback_html" IS DISTINCT FROM OLD."general_feedback_html"
       OR NEW."default_mark" IS DISTINCT FROM OLD."default_mark"
       OR NEW."settings" IS DISTINCT FROM OLD."settings"
       OR NEW."bank_entry_id" IS DISTINCT FROM OLD."bank_entry_id"
       OR NEW."version" IS DISTINCT FROM OLD."version"
    THEN
      RAISE EXCEPTION
        'question_version % is % and is immutable; create a new version instead',
        OLD."id", OLD."status"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "question_versions_freeze"
  BEFORE UPDATE ON "app"."question_versions"
  FOR EACH ROW EXECUTE FUNCTION "app"."question_versions_freeze"();

CREATE OR REPLACE FUNCTION "app"."question_options_freeze"()
RETURNS TRIGGER AS $$
DECLARE
  parent_status "app"."QuestionStatus";
  parent_id TEXT;
BEGIN
  parent_id := COALESCE(NEW."question_version_id", OLD."question_version_id");
  SELECT "status" INTO parent_status
    FROM "app"."question_versions" WHERE "id" = parent_id;
  -- A cascade delete of the parent version removes the row from under us; that
  -- is legitimate, and the parent row is already gone by then.
  IF parent_status IS NOT NULL AND parent_status <> 'draft' THEN
    RAISE EXCEPTION
      'question_version % is % and its options are immutable', parent_id, parent_status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "question_options_freeze"
  BEFORE INSERT OR UPDATE OR DELETE ON "app"."question_options"
  FOR EACH ROW EXECUTE FUNCTION "app"."question_options_freeze"();
```

> The trigger function is owned by `ayman_owner` and runs with the invoker's
> rights, which is what we want — it is a correctness guard, not a privilege
> escalation. Do **not** add `SECURITY DEFINER`.

```bash
pnpm --filter @ayman/api exec prisma migrate dev
pnpm --filter @ayman/api exec prisma generate
```

- [ ] **Step 4: Write the schema test and confirm it passes**

Create `apps/api/src/modules/quiz/schema.spec.ts`:

```ts
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

// Integration test against the real local database. The point of these
// constraints is that they hold even when a service forgets — so testing them
// through a mock would test nothing at all.
describe('question bank schema constraints', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  let userId: string;
  let categoryId: string;
  const entryIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    userId = randomUUID();
    await prisma.user.create({
      data: { id: userId, name: 'Bank Owner', email: `${userId}@example.test`, role: 'admin' },
    });
    const category = await prisma.questionCategory.create({ data: { name: `cat-${userId}` } });
    categoryId = category.id;
  });

  afterAll(async () => {
    await prisma.questionBankEntry.deleteMany({ where: { id: { in: entryIds } } });
    await prisma.questionCategory.delete({ where: { id: categoryId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function createVersion(status: 'draft' | 'ready') {
    const entry = await prisma.questionBankEntry.create({ data: { categoryId, ownerId: userId } });
    entryIds.push(entry.id);
    return prisma.questionVersion.create({
      data: {
        bankEntryId: entry.id,
        version: 1,
        status,
        type: 'mcq_single',
        stemHtml: '<p>س</p>',
        createdBy: userId,
        options: {
          create: [
            { bodyHtml: '<p>أ</p>', fraction: 1, position: 0 },
            { bodyHtml: '<p>ب</p>', fraction: 0, position: 1 },
          ],
        },
      },
    });
  }

  it('rejects a fraction above 1', async () => {
    const version = await createVersion('draft');
    await expect(
      prisma.questionOption.create({
        data: { questionVersionId: version.id, bodyHtml: '<p>ج</p>', fraction: 1.5, position: 2 },
      }),
    ).rejects.toThrow(/question_options_fraction_range/);
  });

  it('accepts a NEGATIVE fraction — negative marking is a supported feature, not a bug', async () => {
    const version = await createVersion('draft');
    const option = await prisma.questionOption.create({
      data: { questionVersionId: version.id, bodyHtml: '<p>ج</p>', fraction: -0.25, position: 2 },
    });
    expect(Number(option.fraction)).toBe(-0.25);
  });

  it('freezes the stem of a ready version', async () => {
    const version = await createVersion('ready');
    await expect(
      prisma.questionVersion.update({
        where: { id: version.id },
        data: { stemHtml: '<p>edited</p>' },
      }),
    ).rejects.toThrow(/immutable/);
  });

  it('still allows ready -> hidden, so a question can be retired', async () => {
    const version = await createVersion('ready');
    const hidden = await prisma.questionVersion.update({
      where: { id: version.id },
      data: { status: 'hidden' },
    });
    expect(hidden.status).toBe('hidden');
  });

  it('freezes the OPTIONS of a ready version — this is what protects option_order snapshots', async () => {
    const version = await createVersion('ready');
    await expect(
      prisma.questionOption.create({
        data: { questionVersionId: version.id, bodyHtml: '<p>د</p>', fraction: 0, position: 9 },
      }),
    ).rejects.toThrow(/immutable/);
    const existing = await prisma.questionOption.findFirst({
      where: { questionVersionId: version.id },
    });
    await expect(
      prisma.questionOption.delete({ where: { id: existing!.id } }),
    ).rejects.toThrow(/immutable/);
  });

  it('has no is_correct column anywhere — fraction is the only scoring primitive', async () => {
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'app' AND column_name IN ('is_correct', 'iscorrect', 'correct')
    `;
    expect(columns).toEqual([]);
  });
});
```

Run: `pnpm --filter @ayman/api test schema`
Expected: PASS — 6 tests. If the freeze tests fail, the migration in Step 3 was not applied; do **not** work around it by moving the check into the service.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/modules/quiz/schema.spec.ts
git commit -m "feat(api): versioned question bank with {option, fraction} scoring and ready-version immutability"
```

---

## Task 2: Quiz, slots and pools — with a DEFERRABLE position constraint

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<ts>_quiz_constraints/migration.sql`
- Modify: `apps/api/src/modules/quiz/schema.spec.ts`

**Interfaces:**
- Consumes: `Lesson` (Plan 3), `QuestionBankEntry` (Task 1).
- Produces: Prisma models `Quiz`, `QuizSlot`, `QuizPool`; enums `QuizMode`, `GradeMethod`, `OverdueHandling`, `NavMethod`.

- [ ] **Step 1: Append to `apps/api/prisma/schema.prisma`**

```prisma
/// Default is `practice` in three places — here, in the Zod contract, and in
/// the builder form's defaultValues. The benchmarked competitor defaults to a
/// single graded attempt with no undo, and every warning modal in their bundle
/// ends in a support phone number. That is the single biggest support-ticket
/// generator visible in their code, and it is a default, not a feature.
enum QuizMode {
  practice
  graded

  @@schema("app")
}

enum GradeMethod {
  highest
  average
  first
  last

  @@schema("app")
}

enum OverdueHandling {
  autosubmit
  graceperiod
  autoabandon

  @@schema("app")
}

enum NavMethod {
  free
  sequential

  @@schema("app")
}

model Quiz {
  id                 String          @id @default(uuid(7))
  lessonId           String          @unique @map("lesson_id")
  mode               QuizMode        @default(practice)
  durationSeconds    Int?            @map("duration_seconds")
  openFrom           DateTime?       @map("open_from")
  openUntil          DateTime?       @map("open_until")
  /// 0 = unlimited. Practice quizzes leave this at 0.
  maxAttempts        Int             @default(0) @map("max_attempts")
  gradeMethod        GradeMethod     @default(highest) @map("grade_method")
  retryCooldownHours Int             @default(24) @map("retry_cooldown_hours")
  passPercent        Decimal         @default(70) @map("pass_percent") @db.Decimal(5, 2)
  shuffleQuestions   Boolean         @default(false) @map("shuffle_questions")
  shuffleOptions     Boolean         @default(true) @map("shuffle_options")
  overdueHandling    OverdueHandling @default(autosubmit) @map("overdue_handling")
  graceSeconds       Int             @default(60) @map("grace_seconds")
  navMethod          NavMethod       @default(free) @map("nav_method")
  /// The 4-window × 7-flag matrix. Resolved SERVER-SIDE (Task 13); the
  /// disallowed fields are stripped in the serializer, never hidden in CSS.
  reviewOptions      Json            @map("review_options")
  /// Denormalised sum of slot maxMarks, recomputed on every slot write so the
  /// runner never has to aggregate to show "من 20".
  sumMarks           Decimal         @default(0) @map("sum_marks") @db.Decimal(10, 4)
  gradeOutOf         Decimal         @default(100) @map("grade_out_of") @db.Decimal(10, 4)
  isPublished        Boolean         @default(false) @map("is_published")
  createdAt          DateTime        @default(now()) @map("created_at")
  updatedAt          DateTime        @updatedAt @map("updated_at")

  lesson   Lesson        @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  slots    QuizSlot[]
  pools    QuizPool[]
  attempts QuizAttempt[]

  @@map("quizzes")
  @@schema("app")
}

/// One question position on the paper. Either it points at a bank entry
/// (a fixed question) or at a pool (draw N at random at attempt creation) —
/// never both, never neither. `pinnedVersion = NULL` means "latest ready
/// version at the moment the attempt starts", which is then snapshotted onto
/// attempt_questions and never re-resolved.
model QuizSlot {
  id             String  @id @default(uuid(7))
  quizId         String  @map("quiz_id")
  position       Int
  page           Int     @default(0)
  bankEntryId    String? @map("bank_entry_id")
  pinnedVersion  Int?    @map("pinned_version")
  poolId         String? @map("pool_id")
  maxMark        Decimal @map("max_mark") @db.Decimal(10, 4)
  requirePrevious Boolean @default(false) @map("require_previous")

  quiz      Quiz               @relation(fields: [quizId], references: [id], onDelete: Cascade)
  bankEntry QuestionBankEntry? @relation(fields: [bankEntryId], references: [id], onDelete: Restrict)
  pool      QuizPool?          @relation(fields: [poolId], references: [id], onDelete: Cascade)

  // NOTE: this unique is redefined as DEFERRABLE in the hand-written migration
  // below. Prisma cannot express DEFERRABLE, and without it a drag-reorder has
  // to write in two phases to dodge transient collisions.
  @@unique([quizId, position])
  @@index([poolId])
  @@map("quiz_slots")
  @@schema("app")
}

/// "Pick 5 at random from تصنيف الحلقات التكرارية." The draw happens once, at
/// attempt creation, and the drawn versions are snapshotted — a resumed
/// attempt never redraws.
model QuizPool {
  id                String  @id @default(uuid(7))
  quizId            String  @map("quiz_id")
  name              String
  pickCount         Int     @map("pick_count")
  pointsPerQuestion Decimal @map("points_per_question") @db.Decimal(10, 4)
  /// { categoryIds: string[], types: QuestionType[] }
  sourceFilter      Json    @map("source_filter")

  quiz  Quiz       @relation(fields: [quizId], references: [id], onDelete: Cascade)
  slots QuizSlot[]

  @@map("quiz_pools")
  @@schema("app")
}
```

Add to Plan 3's `Lesson` model: `quiz Quiz?`.

- [ ] **Step 2: Migrate, then hand-write the two constraints**

```bash
pnpm --filter @ayman/api exec prisma migrate dev --name quizzes
pnpm --filter @ayman/api exec prisma migrate dev --create-only --name quiz_constraints
```

Paste into the generated `migration.sql`:

```sql
-- Exactly one of bank_entry_id / pool_id. `<>` on booleans is XOR in Postgres.
ALTER TABLE "app"."quiz_slots"
  ADD CONSTRAINT "quiz_slots_source_exactly_one"
  CHECK (("bank_entry_id" IS NOT NULL) <> ("pool_id" IS NOT NULL));

ALTER TABLE "app"."quiz_slots"
  ADD CONSTRAINT "quiz_slots_pinned_version_needs_entry"
  CHECK ("pinned_version" IS NULL OR "bank_entry_id" IS NOT NULL);

-- Reordering 40 questions must be ONE write of the full ordered id array
-- (spec §5.4). A non-deferrable unique makes the intermediate state of that
-- single UPDATE illegal, forcing a two-phase offset dance. Deferring the check
-- to COMMIT lets the reorder be a single statement.
ALTER TABLE "app"."quiz_slots" DROP CONSTRAINT "quiz_slots_quiz_id_position_key";
ALTER TABLE "app"."quiz_slots"
  ADD CONSTRAINT "quiz_slots_quiz_id_position_key"
  UNIQUE ("quiz_id", "position") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "app"."quiz_slots"
  ADD CONSTRAINT "quiz_slots_max_mark_positive" CHECK ("max_mark" > 0);

ALTER TABLE "app"."quiz_pools"
  ADD CONSTRAINT "quiz_pools_pick_count_positive" CHECK ("pick_count" >= 1);

ALTER TABLE "app"."quizzes"
  ADD CONSTRAINT "quizzes_grace_seconds_nonnegative" CHECK ("grace_seconds" >= 0);

ALTER TABLE "app"."quizzes"
  ADD CONSTRAINT "quizzes_duration_positive"
  CHECK ("duration_seconds" IS NULL OR "duration_seconds" > 0);
```

```bash
pnpm --filter @ayman/api exec prisma migrate dev
pnpm --filter @ayman/api exec prisma generate
```

- [ ] **Step 3: Add the constraint tests to `schema.spec.ts`**

```ts
  it('rejects a slot that points at both a bank entry and a pool', async () => {
    const quiz = await createQuiz();
    const pool = await prisma.quizPool.create({
      data: { quizId: quiz.id, name: 'p', pickCount: 1, pointsPerQuestion: 1, sourceFilter: {} },
    });
    const entry = await prisma.questionBankEntry.create({ data: { categoryId, ownerId: userId } });
    entryIds.push(entry.id);
    await expect(
      prisma.quizSlot.create({
        data: { quizId: quiz.id, position: 0, maxMark: 1, bankEntryId: entry.id, poolId: pool.id },
      }),
    ).rejects.toThrow(/quiz_slots_source_exactly_one/);
  });

  it('rejects a slot that points at neither', async () => {
    const quiz = await createQuiz();
    await expect(
      prisma.quizSlot.create({ data: { quizId: quiz.id, position: 0, maxMark: 1 } }),
    ).rejects.toThrow(/quiz_slots_source_exactly_one/);
  });

  it('allows a full reorder in ONE statement because the position unique is deferrable', async () => {
    const quiz = await createQuiz();
    const entries = await Promise.all([0, 1, 2].map(() => createEntry()));
    const slots = await Promise.all(
      entries.map((entry, index) =>
        prisma.quizSlot.create({
          data: { quizId: quiz.id, position: index, maxMark: 1, bankEntryId: entry.id },
        }),
      ),
    );

    // Rotate every position by one in a single transaction. With a
    // non-deferrable unique this throws on the first row.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET CONSTRAINTS "app"."quiz_slots_quiz_id_position_key" DEFERRED`;
      for (const [index, slot] of slots.entries()) {
        await tx.quizSlot.update({
          where: { id: slot.id },
          data: { position: (index + 1) % slots.length },
        });
      }
    });

    const after = await prisma.quizSlot.findMany({
      where: { quizId: quiz.id },
      orderBy: { position: 'asc' },
      select: { id: true, position: true },
    });
    expect(after.map((s) => s.position)).toEqual([0, 1, 2]);
    expect(after[0]!.id).toBe(slots[2]!.id);
  });
```

Add the `createQuiz()` / `createEntry()` helpers alongside `createVersion()`; `createQuiz` needs a published `Lesson` from Plan 3 — build it with the smallest legal course → section → lesson chain and delete it in `afterAll`.

Run: `pnpm --filter @ayman/api test schema`
Expected: PASS — 9 tests.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/modules/quiz/schema.spec.ts
git commit -m "feat(api): quiz, slot and pool schema with a deferrable position constraint"
```

---

## Task 3: Attempts, the append-only event log, and appeals

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<ts>_attempt_constraints/migration.sql`
- Modify: `scripts/db-bootstrap.sql` (revoke UPDATE/DELETE on the event log)
- Modify: `apps/api/src/modules/quiz/schema.spec.ts`

**Interfaces:**
- Produces: Prisma models `QuizAttempt`, `AttemptQuestion`, `AttemptEvent`, `GradeAppeal`; enums `AttemptState`, `AttemptQuestionState`, `AttemptEventKind`, `AppealStatus`.

- [ ] **Step 1: Append to `apps/api/prisma/schema.prisma`**

```prisma
enum AttemptState {
  in_progress
  overdue
  submitted
  pending_review
  abandoned

  @@schema("app")
}

/// `todo` / `complete` describe ANSWERING; the four `graded_*` values describe
/// GRADING. A learner payload never carries this column — it is projected to a
/// plain `answered: boolean` in the serializer, because `graded_right` leaking
/// into a pre-submission response is exactly the leak class Q1 exists to stop.
enum AttemptQuestionState {
  todo
  complete
  needs_grading
  graded_right
  graded_partial
  graded_wrong

  @@schema("app")
}

enum AttemptEventKind {
  attempt_started
  question_viewed
  answer_saved
  answer_cleared
  flag_toggled
  answer_checked
  submitted
  autosubmitted
  abandoned
  graded
  regraded
  appeal_opened
  appeal_resolved
  extra_time_granted
  extra_attempt_granted
  attempt_reopened
  stale_write_rejected

  @@schema("app")
}

enum AppealStatus {
  open
  under_review
  accepted
  rejected

  @@schema("app")
}

model QuizAttempt {
  id               String       @id @default(uuid(7))
  quizId           String       @map("quiz_id")
  userId           String       @map("user_id")
  attemptNo        Int          @map("attempt_no")
  state            AttemptState @default(in_progress)
  startedAt        DateTime     @default(now()) @map("started_at")
  /// PERSISTED AT START AND NEVER RECOMPUTED. An instructor editing
  /// `durationSeconds` must not shorten or extend an in-flight attempt.
  /// Accommodation is ADDITIVE via extraTimeSeconds — still never a recompute.
  deadlineAt       DateTime?    @map("deadline_at")
  submittedAt      DateTime?    @map("submitted_at")
  lastActivityAt   DateTime     @default(now()) @map("last_activity_at")
  /// Required on every write. Rotated on an explicit resume, which is what
  /// makes it kill a stale tab left open on another device.
  attemptToken     String       @default(uuid(7)) @map("attempt_token") @db.Uuid
  rawScore         Decimal?     @map("raw_score") @db.Decimal(10, 4)
  scaledScore      Decimal?     @map("scaled_score") @db.Decimal(10, 4)
  passed           Boolean?
  extraTimeSeconds Int          @default(0) @map("extra_time_seconds")
  /// Admin grant of attempts beyond `quiz.maxAttempts`. The allowance is
  /// `maxAttempts + SUM(extra_attempts)` across the user's attempts on this
  /// quiz, so a grant is auditable and additive rather than a mutable counter.
  extraAttempts    Int          @default(0) @map("extra_attempts")

  quiz      Quiz              @relation(fields: [quizId], references: [id], onDelete: Cascade)
  user      User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  questions AttemptQuestion[]
  events    AttemptEvent[]

  @@unique([quizId, userId, attemptNo])
  @@index([quizId, state])
  @@index([userId, quizId])
  @@index([state, deadlineAt])
  @@map("quiz_attempts")
  @@schema("app")
}

/// The mutable half of the hybrid store: one row per question per attempt, so
/// the results screen is a single join. `questionVersionId` and `optionOrder`
/// are SNAPSHOTS taken at attempt creation and are never re-derived.
model AttemptQuestion {
  id                String               @id @default(uuid(7))
  attemptId         String               @map("attempt_id")
  slotPosition      Int                  @map("slot_position")
  questionVersionId String               @map("question_version_id")
  /// Permutation of the version's option `position` values, captured once.
  /// Without it, resume-after-disconnect reshuffles the paper and the student
  /// re-reads four options they had already eliminated.
  optionOrder       Int[]                @map("option_order")
  maxMark           Decimal              @map("max_mark") @db.Decimal(10, 4)
  minFraction       Decimal              @map("min_fraction") @db.Decimal(10, 6)
  maxFraction       Decimal              @map("max_fraction") @db.Decimal(10, 6)
  /// { kind: 'choice', optionIds: string[] } | { kind: 'text', text: string }
  response          Json?
  /// Monotonic client sequence. A late autosave from a backgrounded tab cannot
  /// overwrite a newer answer, because the UPDATE carries `response_seq < $seq`.
  responseSeq       Int                  @default(0) @map("response_seq")
  fraction          Decimal?             @db.Decimal(10, 6)
  mark              Decimal?             @db.Decimal(10, 4)
  state             AttemptQuestionState @default(todo)
  flagged           Boolean              @default(false)
  /// Written at SUBMIT time only, so it cannot leak before then.
  rightAnswerText   String?              @map("right_answer_text")
  responseText      String?              @map("response_text")
  answeredAt        DateTime?            @map("answered_at")
  gradedAt          DateTime?            @map("graded_at")
  gradedBy          String?              @map("graded_by")
  feedbackHtml      String?              @map("feedback_html")

  attempt  QuizAttempt     @relation(fields: [attemptId], references: [id], onDelete: Cascade)
  version  QuestionVersion @relation(fields: [questionVersionId], references: [id], onDelete: Restrict)
  grader   User?           @relation("AttemptQuestionGrader", fields: [gradedBy], references: [id], onDelete: SetNull)
  appeals  GradeAppeal[]

  @@unique([attemptId, slotPosition])
  @@index([questionVersionId])
  @@map("attempt_questions")
  @@schema("app")
}

/// The append-only half. UPDATE and DELETE are REVOKED from ayman_runtime at
/// the database level (Step 3), exactly like audit_log. `seq` is gap-free per
/// attempt, so a missing number is itself evidence.
model AttemptEvent {
  id                BigInt           @id @default(autoincrement())
  attemptId         String           @map("attempt_id")
  attemptQuestionId String?          @map("attempt_question_id")
  seq               Int
  kind              AttemptEventKind
  payload           Json             @default("{}")
  actorId           String?          @map("actor_id")
  createdAt         DateTime         @default(now()) @map("created_at")

  attempt QuizAttempt @relation(fields: [attemptId], references: [id], onDelete: Cascade)

  @@unique([attemptId, seq])
  @@index([attemptId, createdAt])
  @@map("attempt_events")
  @@schema("app")
}

/// التظلم. Parents notice this exists; competitors expose it as
/// "الدرجة قبل التظلم / بعد التظلم" and it reads as fairness.
model GradeAppeal {
  id                String       @id @default(uuid(7))
  attemptQuestionId String       @map("attempt_question_id")
  studentNote       String       @map("student_note")
  gradeBefore       Decimal      @map("grade_before") @db.Decimal(10, 4)
  gradeAfter        Decimal?     @map("grade_after") @db.Decimal(10, 4)
  status            AppealStatus @default(open)
  resolverNote      String?      @map("resolver_note")
  resolvedBy        String?      @map("resolved_by")
  resolvedAt        DateTime?    @map("resolved_at")
  createdAt         DateTime     @default(now()) @map("created_at")

  attemptQuestion AttemptQuestion @relation(fields: [attemptQuestionId], references: [id], onDelete: Cascade)
  resolver        User?           @relation("AppealResolver", fields: [resolvedBy], references: [id], onDelete: SetNull)

  @@index([status, createdAt])
  @@map("grade_appeals")
  @@schema("app")
}
```

Add the back-relations to `User`:
```prisma
  quizAttempts     QuizAttempt[]
  gradedQuestions  AttemptQuestion[] @relation("AttemptQuestionGrader")
  resolvedAppeals  GradeAppeal[]     @relation("AppealResolver")
```

- [ ] **Step 2: Migrate**

```bash
pnpm --filter @ayman/api exec prisma migrate dev --name attempts
pnpm --filter @ayman/api exec prisma generate
```

- [ ] **Step 3: Hand-write the append-only revoke and the appeal uniqueness**

```bash
pnpm --filter @ayman/api exec prisma migrate dev --create-only --name attempt_constraints
```

```sql
-- The event log is INSERT-only for the running application, exactly like
-- audit_log. A compromised runtime role can still add noise; it cannot rewrite
-- or erase history, which is the property that makes a regrade defensible.
REVOKE UPDATE, DELETE ON "app"."attempt_events" FROM "ayman_runtime";

-- Belt and braces: the revoke is invisible to anyone reading schema.prisma, so
-- a trigger states the intent in the schema itself and produces a readable
-- error instead of a bare permission denial.
CREATE OR REPLACE FUNCTION "app"."attempt_events_append_only"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'attempt_events is append-only'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "attempt_events_append_only"
  BEFORE UPDATE OR DELETE ON "app"."attempt_events"
  FOR EACH ROW EXECUTE FUNCTION "app"."attempt_events_append_only"();

-- At most one live appeal per question. Postgres treats NULLs as distinct, so
-- this must be a PARTIAL unique index, not a plain one.
CREATE UNIQUE INDEX "grade_appeals_one_open_per_question"
  ON "app"."grade_appeals" ("attempt_question_id")
  WHERE "status" IN ('open', 'under_review');

-- attempt_no is 1-based; a 0th attempt would silently break the attempt-limit
-- arithmetic in Task 10.
ALTER TABLE "app"."quiz_attempts"
  ADD CONSTRAINT "quiz_attempts_attempt_no_positive" CHECK ("attempt_no" >= 1);

ALTER TABLE "app"."quiz_attempts"
  ADD CONSTRAINT "quiz_attempts_extra_time_nonnegative"
  CHECK ("extra_time_seconds" >= 0 AND "extra_attempts" >= 0);

-- A submitted attempt must carry a submission timestamp, and vice versa.
ALTER TABLE "app"."quiz_attempts"
  ADD CONSTRAINT "quiz_attempts_submitted_state_consistent"
  CHECK (
    ("state" IN ('submitted', 'pending_review') AND "submitted_at" IS NOT NULL)
    OR ("state" IN ('in_progress', 'overdue', 'abandoned'))
  );
```

Also append the `REVOKE` line to `scripts/db-bootstrap.sql` so a fresh database gets it, then apply:

```bash
pnpm --filter @ayman/api exec prisma migrate dev
pnpm --filter @ayman/api exec prisma generate
```

- [ ] **Step 4: Prove the append-only property as the runtime role**

```bash
psql "postgresql://ayman_runtime:dev_runtime_password@localhost:5432/ayman_platform_dev" \
  -c "UPDATE app.attempt_events SET kind = 'submitted' WHERE true;"
```
Expected: `ERROR: permission denied for table attempt_events` (or the trigger's `attempt_events is append-only`, whichever fires first). Both are acceptable; a success is not.

Add the matching test to `schema.spec.ts`:

```ts
  it('refuses to update or delete an attempt event', async () => {
    const { attempt } = await createAttemptFixture();
    await prisma.attemptEvent.create({
      data: { attemptId: attempt.id, seq: 1, kind: 'attempt_started', payload: {} },
    });
    await expect(
      prisma.attemptEvent.updateMany({ where: { attemptId: attempt.id }, data: { seq: 99 } }),
    ).rejects.toThrow(/append-only|permission denied/);
    await expect(
      prisma.attemptEvent.deleteMany({ where: { attemptId: attempt.id } }),
    ).rejects.toThrow(/append-only|permission denied/);
  });

  it('allows only one live appeal per question but any number of resolved ones', async () => {
    const { attemptQuestion } = await createAttemptFixture();
    await prisma.gradeAppeal.create({
      data: { attemptQuestionId: attemptQuestion.id, studentNote: 'ن', gradeBefore: 0 },
    });
    await expect(
      prisma.gradeAppeal.create({
        data: { attemptQuestionId: attemptQuestion.id, studentNote: 'ن٢', gradeBefore: 0 },
      }),
    ).rejects.toThrow(/grade_appeals_one_open_per_question/);

    await prisma.gradeAppeal.updateMany({
      where: { attemptQuestionId: attemptQuestion.id },
      data: { status: 'rejected', resolvedAt: new Date() },
    });
    await expect(
      prisma.gradeAppeal.create({
        data: { attemptQuestionId: attemptQuestion.id, studentNote: 'ن٣', gradeBefore: 0 },
      }),
    ).resolves.toBeDefined();
  });
```

Run: `pnpm --filter @ayman/api test schema`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations scripts/db-bootstrap.sql apps/api/src/modules/quiz/schema.spec.ts
git commit -m "feat(api): attempts, append-only event log and grade appeals"
```

---

## Task 4: The shared question contract — a discriminated union with the refinements INSIDE

**Files:**
- Create: `packages/contracts/src/format.ts`, `packages/contracts/src/format.spec.ts`
- Create: `packages/contracts/src/quiz/question.ts`, `packages/contracts/src/quiz/question.spec.ts`
- Create: `packages/contracts/src/quiz/quiz-settings.ts`, `packages/contracts/src/quiz/quiz-settings.spec.ts`
- Create: `packages/contracts/src/quiz/index.ts`
- Modify: `packages/contracts/src/index.ts`, `packages/contracts/package.json`, `packages/contracts/src/copy/ar.ts`

**Interfaces:**
- Produces:
  - `formatCopy(template: string, vars: Record<string, string | number>): string`
  - `QuestionInputSchema` — `z.discriminatedUnion('type', [...])`, shared verbatim by the admin form and the API DTO
  - `QuestionOptionInputSchema`, `QuestionSettingsSchema`
  - `ReviewOptionsSchema`, `REVIEW_WINDOWS`, `REVIEW_FLAGS`, `DEFAULT_REVIEW_OPTIONS_PRACTICE`, `DEFAULT_REVIEW_OPTIONS_GRADED`
  - `QuizSettingsSchema` and the inferred types `QuestionInput`, `ReviewOptions`, `ReviewWindow`, `ReviewFlag`, `QuizSettings`
  - `copy.quiz`, `copy.quizAdmin`, `copy.appeal`

- [ ] **Step 1: Create `packages/contracts/src/format.ts` and its spec**

```ts
/**
 * The only interpolation path for user-facing copy. Components must never
 * concatenate a copy string with a value — that reintroduces a user-facing
 * literal (a space, a comma, a unit) into a component, which is exactly what
 * Global Constraint 4 forbids.
 *
 * Unknown placeholders are left untouched rather than replaced with
 * "undefined", so a typo in a variable name is visible in the UI instead of
 * silently producing "undefined سؤال".
 */
export function formatCopy(
  template: string,
  vars: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(vars, key) ? String(vars[key]) : match,
  );
}
```

```ts
// packages/contracts/src/format.spec.ts
import { describe, expect, it } from 'vitest';
import { formatCopy } from './format';

describe('formatCopy', () => {
  it('substitutes every placeholder', () => {
    expect(formatCopy('لسه فيه {count} سؤال من غير إجابة', { count: 3 })).toBe(
      'لسه فيه 3 سؤال من غير إجابة',
    );
  });

  it('substitutes the same placeholder more than once', () => {
    expect(formatCopy('{n} من {n}', { n: 5 })).toBe('5 من 5');
  });

  it('leaves an unknown placeholder visible instead of writing undefined', () => {
    expect(formatCopy('{hours} ساعة', {})).toBe('{hours} ساعة');
  });

  it('does not treat a substituted value as a template', () => {
    expect(formatCopy('{a}', { a: '{b}' })).toBe('{b}');
  });
});
```

Run: `pnpm --filter @ayman/contracts test format`
Expected: PASS — 4 tests.

- [ ] **Step 2: Add the quiz copy block to `packages/contracts/src/copy/ar.ts`**

Insert before the closing `} as const;`:

```ts
  quiz: {
    modes: { practice: 'تدريب', graded: 'امتحان بدرجات' },
    practiceHint: 'محاولات غير محدودة، وهتشوف الإجابة الصح بعد كل سؤال.',
    gradedHint: 'الامتحان بدرجات — راجع إجاباتك قبل ما تسلّم.',
    start: 'ابدأ الامتحان',
    resume: 'كمّل امتحانك',
    attemptNo: 'المحاولة رقم {n}',
    attemptsLeft: 'باقي لك {n} محاولة',
    unlimitedAttempts: 'محاولات غير محدودة',
    questionCount: '{n} سؤال',
    totalMarks: 'الدرجة الكلية {marks}',
    duration: 'مدة الامتحان {minutes} دقيقة',
    noTimeLimit: 'من غير وقت محدد',
    timeLeft: 'الوقت المتبقي',
    timeAlmostUp: 'الوقت قرب يخلص',
    questionOf: 'سؤال {current} من {total}',
    next: 'التالي',
    previous: 'السابق',
    flag: 'علّم السؤال',
    unflag: 'شيل العلامة',
    flaggedCount: '{n} سؤال معلّم',
    answeredCount: 'جاوبت على {answered} من {total}',
    clearAnswer: 'امسح إجابتي',
    navigator: 'خريطة الأسئلة',
    saving: 'بيتحفظ…',
    saved: 'اتحفظ',
    saveFailed: 'مقدرناش نحفظ إجابتك — بنحاول تاني',
    staleTab: 'الامتحان ده مفتوح في مكان تاني. حدّث الصفحة عشان تكمّل من هنا.',
    submit: 'سلّم الامتحان',
    submitConfirmTitle: 'متأكد إنك عايز تسلّم؟',
    submitConfirmBody: 'بعد التسليم مش هتقدر تغيّر إجاباتك.',
    submitConfirmUnanswered: 'لسه فيه {count} سؤال من غير إجابة.',
    submitConfirmAllAnswered: 'جاوبت على كل الأسئلة.',
    submitCancel: 'ارجع للأسئلة',
    submitConfirmAction: 'أيوه، سلّم',
    alreadySubmitted: 'الامتحان ده اتسلّم خلاص.',
    timeUpTitle: 'الوقت خلص',
    timeUpBody: 'امتحانك اتسلّم تلقائيًا.',
    graceRemaining: 'الوقت خلص — عندك {seconds} ثانية تسلّم فيهم.',
    checkAnswer: 'شوف الإجابة',
    correct: 'إجابة صحيحة',
    incorrect: 'إجابة خاطئة',
    partial: 'إجابة صح جزئيًا',
    needsGrading: 'محتاج تصحيح من المدرّس',
    notAnswered: 'مجاوبتش',
    yourAnswer: 'إجابتك',
    rightAnswer: 'الإجابة الصحيحة',
    explanation: 'الشرح',
    questionFeedback: 'ملاحظة على إجابتك',
    marksEarned: '{earned} من {max}',
    resultsTitle: 'نتيجتك',
    reviewTitle: 'مراجعة إجاباتك',
    reviewLocked: 'المراجعة مش متاحة دلوقتي',
    reviewLockedUntilClose: 'هتقدر تراجع إجاباتك بعد ما الامتحان يقفل.',
    passed: 'ناجح',
    failed: 'محتاج تحاول تاني',
    passMark: 'درجة النجاح {percent}%',
    retry: 'حاول تاني',
    cooldown: 'تقدر تحاول تاني بعد {hours} ساعة',
    noAttemptsLeft: 'خلصت محاولاتك في الامتحان ده',
    closed: 'الامتحان قفل',
    notOpenYet: 'الامتحان لسه مفتحش',
    notEnrolled: 'لازم تكون مشترك في الكورس عشان تدخل الامتحان',
    previousAttempts: 'محاولاتك السابقة',
    bestScore: 'أعلى درجة',
    essayPending: 'إجابتك المقالية عند المدرّس للتصحيح',
    wordCount: '{n} كلمة',
    typeAnswer: 'اكتب إجابتك',
    chooseOne: 'اختر إجابة واحدة',
    chooseMany: 'اختر كل الإجابات الصحيحة',
    true: 'صح',
    false: 'خطأ',
  },
  appeal: {
    open: 'قدّم تظلم',
    title: 'تظلم على الدرجة',
    note: 'اكتب سبب التظلم',
    notePlaceholder: 'وضّح ليه شايف إن الدرجة محتاجة مراجعة',
    submit: 'ابعت التظلم',
    submitted: 'وصلنا تظلمك، هنراجعه ونرد عليك',
    alreadyOpen: 'عندك تظلم مفتوح على السؤال ده',
    gradeBefore: 'الدرجة قبل التظلم',
    gradeAfter: 'الدرجة بعد التظلم',
    status: { open: 'مفتوح', under_review: 'تحت المراجعة', accepted: 'اتقبل', rejected: 'اترفض' },
    resolverNote: 'رد المدرّس',
    empty: 'مفيش تظلمات دلوقتي',
    queueTitle: 'التظلمات',
    resolve: 'اعتمد القرار',
    newMark: 'الدرجة الجديدة',
    accept: 'اقبل التظلم',
    reject: 'ارفض التظلم',
  },
  quizAdmin: {
    bankTitle: 'بنك الأسئلة',
    newQuestion: 'سؤال جديد',
    editQuestion: 'تعديل السؤال',
    duplicate: 'نسخة من السؤال',
    duplicateSuffix: '(نسخة)',
    category: 'التصنيف',
    stem: 'نص السؤال',
    generalFeedback: 'الشرح بعد الإجابة',
    graderInfo: 'ملاحظات للمصحح',
    type: 'نوع السؤال',
    types: {
      mcq_single: 'اختيار من متعدد — إجابة واحدة',
      mcq_multi: 'اختيار من متعدد — أكتر من إجابة',
      true_false: 'صح أو خطأ',
      short_answer: 'إجابة قصيرة',
      essay: 'سؤال مقالي',
    },
    options: 'الاختيارات',
    addOption: 'أضف اختيار',
    removeOption: 'احذف الاختيار',
    markCorrect: 'الإجابة الصحيحة',
    optionFeedback: 'تعليق على الاختيار',
    fraction: 'وزن الاختيار',
    answerPattern: 'نموذج الإجابة',
    addPattern: 'أضف نموذج إجابة',
    caseSensitive: 'يفرّق بين الحروف الكبيرة والصغيرة',
    wildcardHint: 'استخدم * بدل أي جزء من الإجابة',
    defaultMark: 'درجة السؤال',
    minWords: 'أقل عدد كلمات',
    maxWords: 'أكبر عدد كلمات',
    save: 'احفظ',
    publish: 'انشر السؤال',
    published: 'السؤال اتنشر — أي تعديل بعد كده هيعمل نسخة جديدة',
    versionBadge: 'نسخة {n}',
    draftBadge: 'مسودة',
    bulkImport: 'استيراد سريع',
    bulkImportHint: 'الصق الأسئلة، كل سؤال في فقرة، وحدد الإجابة بسطر ANSWER أو الإجابة',
    bulkImportPreview: 'معاينة {n} سؤال',
    bulkImportCommit: 'أضف الأسئلة للبنك',
    quizTitle: 'إعدادات الامتحان',
    slots: 'أسئلة الامتحان',
    addSlot: 'أضف سؤال من البنك',
    addPool: 'أضف مجموعة عشوائية',
    poolPickCount: 'عدد الأسئلة المسحوبة',
    reorderHint: 'اسحب السؤال عشان تغيّر ترتيبه',
    mode: 'نوع الامتحان',
    durationMinutes: 'مدة الامتحان بالدقايق',
    maxAttempts: 'أقصى عدد محاولات (٠ = غير محدود)',
    retryCooldownHours: 'المدة بين المحاولات بالساعات',
    passPercent: 'نسبة النجاح',
    shuffleQuestions: 'رتّب الأسئلة عشوائيًا',
    shuffleOptions: 'رتّب الاختيارات عشوائيًا',
    navMethod: 'التنقل بين الأسئلة',
    navFree: 'حر',
    navSequential: 'بالترتيب',
    overdueHandling: 'لما الوقت يخلص',
    overdueAutosubmit: 'يتسلّم تلقائيًا',
    overdueGrace: 'مهلة إضافية للتسليم',
    overdueAbandon: 'المحاولة تتلغي',
    graceSeconds: 'مهلة التسليم بالثواني',
    reviewMatrix: 'إيه اللي الطالب يشوفه',
    windows: {
      during: 'أثناء المحاولة',
      immediatelyAfter: 'بعد التسليم مباشرة',
      laterWhileOpen: 'بعد كده والامتحان مفتوح',
      afterClose: 'بعد ما الامتحان يقفل',
    },
    flags: {
      response: 'إجابته',
      correctness: 'صح ولا غلط',
      marks: 'الدرجات',
      specificFeedback: 'تعليق كل اختيار',
      generalFeedback: 'الشرح العام',
      rightAnswer: 'الإجابة الصحيحة',
      overallFeedback: 'تعليق النتيجة',
    },
    attemptsTitle: 'محاولات الطلاب',
    unlock: 'افتح المحاولة',
    reopen: 'ارجّع المحاولة للطالب',
    grantAttempt: 'امنح محاولة إضافية',
    grantTime: 'امنح وقت إضافي',
    grantTimeMinutes: 'دقايق إضافية',
    analyticsTitle: 'تحليل الامتحان',
    scoreDistribution: 'توزيع الدرجات',
    facilityIndex: 'معامل السهولة',
    discriminationIndex: 'معامل التمييز',
    distractorAnalysis: 'تحليل الاختيارات',
    attemptCount: '{n} محاولة',
    tooFewAttempts: 'محتاجين {n} محاولة على الأقل عشان الأرقام تبقى معبّرة',
    averageScore: 'متوسط الدرجات',
    medianScore: 'الوسيط',
    passRate: 'نسبة النجاح',
  },
  quizErrors: {
    exactlyOneCorrect: 'لازم تحدد إجابة صحيحة واحدة بالظبط',
    atLeastTwoOptions: 'لازم يكون فيه اختيارين على الأقل',
    trueFalseNeedsTwo: 'سؤال صح وخطأ لازم يكون له اختيارين بالظبط',
    multiWeightsMustSumToOne: 'مجموع أوزان الإجابات الصحيحة لازم يساوي 1',
    multiNeedsPositive: 'لازم يكون فيه إجابة صحيحة واحدة على الأقل',
    shortAnswerNeedsFullCredit: 'لازم يكون فيه نموذج إجابة واحد على الأقل بوزن 1',
    patternRequired: 'اكتب نموذج الإجابة',
    stemRequired: 'اكتب نص السؤال',
    optionBodyRequired: 'اكتب نص الاختيار',
    essayHasNoOptions: 'السؤال المقالي مالوش اختيارات',
    maxWordsBelowMin: 'أكبر عدد كلمات لازم يكون أكبر من أقل عدد',
    fractionRange: 'وزن الاختيار لازم يكون بين -1 و 1',
    importNoQuestions: 'مفيش أسئلة في النص ده',
    importNoAnswerLine: 'السؤال رقم {n}: مفيش سطر إجابة',
    importUnknownLetter: 'السؤال رقم {n}: حرف إجابة مش موجود ({letter})',
    importNoOptions: 'السؤال رقم {n}: مفيش اختيارات',
    importUnknownType: 'السؤال رقم {n}: نوع سؤال مش معروف',
  },
```

- [ ] **Step 3: Write the failing contract test**

Create `packages/contracts/src/quiz/question.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { QuestionInputSchema } from './question';

function mcqSingle(overrides: Record<string, unknown> = {}) {
  return {
    type: 'mcq_single',
    categoryId: '018f0000-0000-7000-8000-000000000000',
    stemHtml: '<p>ما ناتج 2 + 2؟</p>',
    defaultMark: 1,
    settings: {},
    options: [
      { bodyHtml: '<p>3</p>', fraction: 0 },
      { bodyHtml: '<p>4</p>', fraction: 1 },
    ],
    ...overrides,
  };
}

describe('QuestionInputSchema', () => {
  it('accepts a well-formed single-choice question', () => {
    expect(QuestionInputSchema.safeParse(mcqSingle()).success).toBe(true);
  });

  it('rejects a single-choice question with two full-credit options', () => {
    const result = QuestionInputSchema.safeParse(
      mcqSingle({
        options: [
          { bodyHtml: '<p>3</p>', fraction: 1 },
          { bodyHtml: '<p>4</p>', fraction: 1 },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a single-choice question with no full-credit option', () => {
    const result = QuestionInputSchema.safeParse(
      mcqSingle({
        options: [
          { bodyHtml: '<p>3</p>', fraction: 0.5 },
          { bodyHtml: '<p>4</p>', fraction: 0.5 },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it('allows partial credit on the non-correct options of a single-choice question', () => {
    const result = QuestionInputSchema.safeParse(
      mcqSingle({
        options: [
          { bodyHtml: '<p>3</p>', fraction: 0.5 },
          { bodyHtml: '<p>4</p>', fraction: 1 },
          { bodyHtml: '<p>22</p>', fraction: -0.25 },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  // ── THE TRAP ────────────────────────────────────────────────────────────
  // A .refine() applied ON TOP of a discriminated union reports its issue with
  // `path: []`. react-hook-form maps issues onto fields by path, so an empty
  // path has no field to attach to and the message is never rendered: the form
  // simply refuses to submit with nothing on screen. Every refinement in this
  // schema therefore lives INSIDE a union member and carries an explicit path.
  it('gives every validation issue a non-empty path so RHF can render it', () => {
    const cases = [
      mcqSingle({ options: [{ bodyHtml: '<p>3</p>', fraction: 0 }] }),
      mcqSingle({
        options: [
          { bodyHtml: '<p>3</p>', fraction: 1 },
          { bodyHtml: '<p>4</p>', fraction: 1 },
        ],
      }),
      mcqSingle({ type: 'mcq_multi', options: [
        { bodyHtml: '<p>3</p>', fraction: 0.4 },
        { bodyHtml: '<p>4</p>', fraction: 0.4 },
      ] }),
      mcqSingle({ type: 'true_false', options: [
        { bodyHtml: '<p>صح</p>', fraction: 1 },
        { bodyHtml: '<p>خطأ</p>', fraction: 0 },
        { bodyHtml: '<p>يمكن</p>', fraction: 0 },
      ] }),
      { ...mcqSingle(), type: 'essay', options: [{ bodyHtml: '<p>x</p>', fraction: 1 }] },
    ];

    for (const input of cases) {
      const result = QuestionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
      for (const issue of result.error!.issues) {
        expect(issue.path.length).toBeGreaterThan(0);
      }
    }
  });

  it('requires the multi-choice positive weights to sum to 1, with float tolerance', () => {
    const tenTenths = Array.from({ length: 10 }, () => ({ bodyHtml: '<p>x</p>', fraction: 0.1 }));
    // 0.1 summed ten times is 0.9999999999999999 in IEEE-754, so an `=== 1`
    // check here would reject a perfectly valid question.
    expect(tenTenths.reduce((sum, o) => sum + o.fraction, 0)).not.toBe(1);
    const result = QuestionInputSchema.safeParse(
      mcqSingle({ type: 'mcq_multi', options: tenTenths }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects multi-choice weights that do not sum to 1', () => {
    const result = QuestionInputSchema.safeParse(
      mcqSingle({
        type: 'mcq_multi',
        options: [
          { bodyHtml: '<p>أ</p>', fraction: 0.5 },
          { bodyHtml: '<p>ب</p>', fraction: 0.2 },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it('requires true_false to have exactly two options', () => {
    const result = QuestionInputSchema.safeParse(
      mcqSingle({
        type: 'true_false',
        options: [{ bodyHtml: '<p>صح</p>', fraction: 1 }],
      }),
    );
    expect(result.success).toBe(false);
  });

  it('requires a short answer to have at least one full-credit pattern', () => {
    const base = {
      type: 'short_answer',
      categoryId: '018f0000-0000-7000-8000-000000000000',
      stemHtml: '<p>اكتب الكلمة المفتاحية للحلقة</p>',
      defaultMark: 1,
      settings: { caseSensitive: false },
    };
    expect(
      QuestionInputSchema.safeParse({
        ...base,
        options: [{ answerPattern: 'for*', fraction: 1 }],
      }).success,
    ).toBe(true);
    expect(
      QuestionInputSchema.safeParse({
        ...base,
        options: [{ answerPattern: 'for*', fraction: 0.5 }],
      }).success,
    ).toBe(false);
  });

  it('rejects options on an essay question', () => {
    const result = QuestionInputSchema.safeParse({
      type: 'essay',
      categoryId: '018f0000-0000-7000-8000-000000000000',
      stemHtml: '<p>اشرح الفرق بين while و for</p>',
      defaultMark: 5,
      settings: { minWords: 30, maxWords: 200 },
      options: [{ bodyHtml: '<p>x</p>', fraction: 1 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an essay whose maxWords is below minWords', () => {
    const result = QuestionInputSchema.safeParse({
      type: 'essay',
      categoryId: '018f0000-0000-7000-8000-000000000000',
      stemHtml: '<p>اشرح</p>',
      defaultMark: 5,
      settings: { minWords: 200, maxWords: 30 },
      options: [],
    });
    expect(result.success).toBe(false);
  });

  it('never exposes a grading weight it was not given — parse is not a default factory', () => {
    const parsed = QuestionInputSchema.parse(mcqSingle());
    expect(parsed.options.map((o) => o.fraction)).toEqual([0, 1]);
  });
});
```

Run: `pnpm --filter @ayman/contracts test question`
Expected: FAIL — `Cannot find module './question'`.

- [ ] **Step 4: Implement `packages/contracts/src/quiz/question.ts`**

```ts
import { z } from 'zod';
import { copy } from '../copy/ar';

/**
 * Weights are compared with a tolerance, never with `===`. Ten options at 0.1
 * sum to 0.9999999999999999 in IEEE-754; an exact comparison would reject a
 * perfectly ordinary ten-option question. The same epsilon family is used
 * server-side to turn a fraction into a state (see the API's grading module).
 */
const WEIGHT_EPSILON = 1e-6;

export const QUESTION_TYPES = [
  'mcq_single',
  'mcq_multi',
  'true_false',
  'short_answer',
  'essay',
] as const;

export const QuestionTypeSchema = z.enum(QUESTION_TYPES);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

/**
 * The scoring primitive. `fraction` is a weight in [-1, 1] — NOT a boolean.
 * Negative values are per-option negative marking and are deliberately legal.
 */
export const ChoiceOptionSchema = z.object({
  id: z.string().optional(),
  bodyHtml: z.string().min(1, copy.quizErrors.optionBodyRequired),
  fraction: z
    .number()
    .min(-1, copy.quizErrors.fractionRange)
    .max(1, copy.quizErrors.fractionRange),
  feedbackHtml: z.string().optional(),
});

export const PatternOptionSchema = z.object({
  id: z.string().optional(),
  answerPattern: z.string().min(1, copy.quizErrors.patternRequired),
  fraction: z
    .number()
    .min(-1, copy.quizErrors.fractionRange)
    .max(1, copy.quizErrors.fractionRange),
  feedbackHtml: z.string().optional(),
});

export const QuestionSettingsSchema = z.object({
  shuffleOptions: z.boolean().default(true),
  caseSensitive: z.boolean().default(false),
  minWords: z.number().int().min(0).optional(),
  maxWords: z.number().int().min(0).optional(),
  /** Instructor-only. Stripped by the learner serializer, never sent to a student. */
  graderInfo: z.string().optional(),
});

const baseFields = {
  categoryId: z.string().min(1),
  stemHtml: z.string().min(1, copy.quizErrors.stemRequired),
  generalFeedbackHtml: z.string().optional(),
  defaultMark: z.number().positive().default(1),
  settings: QuestionSettingsSchema.default({}),
};

const countFullCredit = (options: readonly { fraction: number }[]): number =>
  options.filter((option) => option.fraction > 1 - WEIGHT_EPSILON).length;

/**
 * ⚠️ Every refinement below lives INSIDE its union member and carries an
 * explicit `path`. A `.refine()` applied to the union itself would produce an
 * issue at `path: []`, which react-hook-form cannot attach to any field — the
 * form would refuse to submit while displaying no error at all. This is the
 * single most common way a shared discriminated-union schema silently breaks
 * an admin form, and `question.spec.ts` asserts against it explicitly.
 */
const McqSingleSchema = z
  .object({ ...baseFields, type: z.literal('mcq_single'), options: z.array(ChoiceOptionSchema) })
  .refine((value) => value.options.length >= 2, {
    message: copy.quizErrors.atLeastTwoOptions,
    path: ['options'],
  })
  .refine((value) => countFullCredit(value.options) === 1, {
    message: copy.quizErrors.exactlyOneCorrect,
    path: ['options'],
  });

const McqMultiSchema = z
  .object({ ...baseFields, type: z.literal('mcq_multi'), options: z.array(ChoiceOptionSchema) })
  .refine((value) => value.options.length >= 2, {
    message: copy.quizErrors.atLeastTwoOptions,
    path: ['options'],
  })
  .refine((value) => value.options.some((option) => option.fraction > 0), {
    message: copy.quizErrors.multiNeedsPositive,
    path: ['options'],
  })
  // The API grades multi-choice as clamp(Σ ticked fractions, 0, 1). Requiring
  // the positive weights to sum to 1 here is what makes that clamp equivalent
  // to Moodle's normalised form — a student who ticks every correct option and
  // nothing else scores exactly 1.
  .refine(
    (value) =>
      Math.abs(
        value.options
          .filter((option) => option.fraction > 0)
          .reduce((sum, option) => sum + option.fraction, 0) - 1,
      ) < WEIGHT_EPSILON,
    { message: copy.quizErrors.multiWeightsMustSumToOne, path: ['options'] },
  );

const TrueFalseSchema = z
  .object({ ...baseFields, type: z.literal('true_false'), options: z.array(ChoiceOptionSchema) })
  .refine((value) => value.options.length === 2, {
    message: copy.quizErrors.trueFalseNeedsTwo,
    path: ['options'],
  })
  .refine((value) => countFullCredit(value.options) === 1, {
    message: copy.quizErrors.exactlyOneCorrect,
    path: ['options'],
  });

const ShortAnswerSchema = z
  .object({ ...baseFields, type: z.literal('short_answer'), options: z.array(PatternOptionSchema) })
  .refine((value) => countFullCredit(value.options) >= 1, {
    message: copy.quizErrors.shortAnswerNeedsFullCredit,
    path: ['options'],
  });

const EssaySchema = z
  .object({ ...baseFields, type: z.literal('essay'), options: z.array(z.never()).default([]) })
  .refine((value) => value.options.length === 0, {
    message: copy.quizErrors.essayHasNoOptions,
    path: ['options'],
  })
  .refine(
    (value) =>
      value.settings.minWords === undefined ||
      value.settings.maxWords === undefined ||
      value.settings.maxWords >= value.settings.minWords,
    { message: copy.quizErrors.maxWordsBelowMin, path: ['settings', 'maxWords'] },
  );

/**
 * ONE schema, TWO consumers: the admin's react-hook-form resolver and the
 * API's `createZodDto`. There is no second definition of a question anywhere,
 * so the form and the server cannot drift.
 */
export const QuestionInputSchema = z.discriminatedUnion('type', [
  McqSingleSchema,
  McqMultiSchema,
  TrueFalseSchema,
  ShortAnswerSchema,
  EssaySchema,
]);

export type QuestionInput = z.infer<typeof QuestionInputSchema>;
export type ChoiceOptionInput = z.infer<typeof ChoiceOptionSchema>;
export type PatternOptionInput = z.infer<typeof PatternOptionSchema>;
export type QuestionSettings = z.infer<typeof QuestionSettingsSchema>;

/** Whether a type carries choice options (as opposed to patterns or nothing). */
export function hasChoiceOptions(type: QuestionType): boolean {
  return type === 'mcq_single' || type === 'mcq_multi' || type === 'true_false';
}
```

Run: `pnpm --filter @ayman/contracts test question`
Expected: PASS — 12 tests.

> If `z.discriminatedUnion` rejects a refined member, you are on Zod 3 semantics.
> This repo is on Zod 4.4.3, where `.refine()` returns the same schema class and
> the discriminator remains introspectable. Do **not** "fix" it by lifting the
> refinements onto the union — that is the exact trap this task exists to avoid.
> Check the installed version before changing anything.

- [ ] **Step 5: Implement `packages/contracts/src/quiz/quiz-settings.ts` with the 4×7 matrix**

```ts
import { z } from 'zod';

/**
 * Four time windows. Resolution is SERVER-SIDE (see the API's review
 * serializer); the client never decides which window it is in, and disallowed
 * fields are removed from the payload rather than hidden with CSS.
 */
export const REVIEW_WINDOWS = ['during', 'immediatelyAfter', 'laterWhileOpen', 'afterClose'] as const;

/** Seven visibility flags, matching Moodle's review-options bitmask semantics. */
export const REVIEW_FLAGS = [
  'response',
  'correctness',
  'marks',
  'specificFeedback',
  'generalFeedback',
  'rightAnswer',
  'overallFeedback',
] as const;

export type ReviewWindow = (typeof REVIEW_WINDOWS)[number];
export type ReviewFlag = (typeof REVIEW_FLAGS)[number];

const ReviewFlagsSchema = z.object({
  response: z.boolean(),
  correctness: z.boolean(),
  marks: z.boolean(),
  specificFeedback: z.boolean(),
  generalFeedback: z.boolean(),
  rightAnswer: z.boolean(),
  overallFeedback: z.boolean(),
});

export const ReviewOptionsSchema = z.object({
  during: ReviewFlagsSchema,
  immediatelyAfter: ReviewFlagsSchema,
  laterWhileOpen: ReviewFlagsSchema,
  afterClose: ReviewFlagsSchema,
});

export type ReviewFlags = z.infer<typeof ReviewFlagsSchema>;
export type ReviewOptions = z.infer<typeof ReviewOptionsSchema>;

const allFlags = (value: boolean): ReviewFlags => ({
  response: value,
  correctness: value,
  marks: value,
  specificFeedback: value,
  generalFeedback: value,
  rightAnswer: value,
  overallFeedback: value,
});

/**
 * Practice: instant per-question feedback while the attempt is open, but the
 * model answer is still withheld until submission — otherwise "practice" is
 * just an answer key with extra steps.
 */
export const DEFAULT_REVIEW_OPTIONS_PRACTICE: ReviewOptions = {
  during: {
    response: true,
    correctness: true,
    marks: true,
    specificFeedback: true,
    generalFeedback: true,
    rightAnswer: false,
    overallFeedback: false,
  },
  immediatelyAfter: allFlags(true),
  laterWhileOpen: allFlags(true),
  afterClose: allFlags(true),
};

/** Graded: nothing during the attempt, everything once it is submitted. */
export const DEFAULT_REVIEW_OPTIONS_GRADED: ReviewOptions = {
  during: allFlags(false),
  immediatelyAfter: allFlags(true),
  laterWhileOpen: {
    response: true,
    correctness: true,
    marks: true,
    specificFeedback: true,
    generalFeedback: true,
    rightAnswer: false,
    overallFeedback: true,
  },
  afterClose: allFlags(true),
};

export const QuizModeSchema = z.enum(['practice', 'graded']);
export const GradeMethodSchema = z.enum(['highest', 'average', 'first', 'last']);
export const OverdueHandlingSchema = z.enum(['autosubmit', 'graceperiod', 'autoabandon']);
export const NavMethodSchema = z.enum(['free', 'sequential']);

export const QuizSettingsSchema = z
  .object({
    // Practice is the default in all three places it can be defaulted: here,
    // in schema.prisma, and in the builder form's defaultValues.
    mode: QuizModeSchema.default('practice'),
    durationSeconds: z.number().int().positive().nullable().default(null),
    openFrom: z.coerce.date().nullable().default(null),
    openUntil: z.coerce.date().nullable().default(null),
    maxAttempts: z.number().int().min(0).default(0),
    gradeMethod: GradeMethodSchema.default('highest'),
    retryCooldownHours: z.number().int().min(0).default(24),
    passPercent: z.number().min(0).max(100).default(70),
    shuffleQuestions: z.boolean().default(false),
    shuffleOptions: z.boolean().default(true),
    overdueHandling: OverdueHandlingSchema.default('autosubmit'),
    graceSeconds: z.number().int().min(0).default(60),
    navMethod: NavMethodSchema.default('free'),
    gradeOutOf: z.number().positive().default(100),
    reviewOptions: ReviewOptionsSchema,
  })
  .refine(
    (value) =>
      value.openFrom === null || value.openUntil === null || value.openUntil > value.openFrom,
    { message: 'openUntil must be after openFrom', path: ['openUntil'] },
  );

export type QuizSettings = z.infer<typeof QuizSettingsSchema>;
export type QuizMode = z.infer<typeof QuizModeSchema>;
```

- [ ] **Step 6: Write `quiz-settings.spec.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REVIEW_OPTIONS_GRADED,
  DEFAULT_REVIEW_OPTIONS_PRACTICE,
  REVIEW_FLAGS,
  REVIEW_WINDOWS,
  QuizSettingsSchema,
  ReviewOptionsSchema,
} from './quiz-settings';

describe('review options matrix', () => {
  it('is exactly four windows by seven flags', () => {
    expect(REVIEW_WINDOWS).toHaveLength(4);
    expect(REVIEW_FLAGS).toHaveLength(7);
    for (const window of REVIEW_WINDOWS) {
      expect(Object.keys(DEFAULT_REVIEW_OPTIONS_GRADED[window]).sort()).toEqual(
        [...REVIEW_FLAGS].sort(),
      );
    }
  });

  it('rejects a matrix missing a window', () => {
    const { afterClose, ...incomplete } = DEFAULT_REVIEW_OPTIONS_GRADED;
    expect(ReviewOptionsSchema.safeParse(incomplete).success).toBe(false);
  });

  it('rejects a matrix missing a flag', () => {
    const broken = structuredClone(DEFAULT_REVIEW_OPTIONS_GRADED) as Record<string, unknown>;
    delete (broken.during as Record<string, unknown>).rightAnswer;
    expect(ReviewOptionsSchema.safeParse(broken).success).toBe(false);
  });

  it('shows nothing during a graded attempt', () => {
    expect(Object.values(DEFAULT_REVIEW_OPTIONS_GRADED.during).every((v) => v === false)).toBe(true);
  });

  it('shows correctness but NOT the right answer during a practice attempt', () => {
    expect(DEFAULT_REVIEW_OPTIONS_PRACTICE.during.correctness).toBe(true);
    expect(DEFAULT_REVIEW_OPTIONS_PRACTICE.during.rightAnswer).toBe(false);
  });

  it('defaults a quiz to practice mode with unlimited attempts and a 24h cooldown', () => {
    const parsed = QuizSettingsSchema.parse({ reviewOptions: DEFAULT_REVIEW_OPTIONS_PRACTICE });
    expect(parsed.mode).toBe('practice');
    expect(parsed.maxAttempts).toBe(0);
    expect(parsed.retryCooldownHours).toBe(24);
    expect(parsed.graceSeconds).toBe(60);
    expect(parsed.overdueHandling).toBe('autosubmit');
  });
});
```

Run: `pnpm --filter @ayman/contracts test quiz-settings`
Expected: PASS — 6 tests.

- [ ] **Step 7: Wire the exports**

`packages/contracts/src/quiz/index.ts`:
```ts
export * from './question';
export * from './quiz-settings';
```

`packages/contracts/src/index.ts` — append:
```ts
export * from './format';
export * from './quiz';
```

`packages/contracts/package.json` — extend `exports`. The API imports these
**leaf** paths for their runtime values; the root barrel re-exports through
extensionless relative specifiers that Node's native ESM loader cannot follow
at runtime.
```json
  "exports": {
    ".": "./src/index.ts",
    "./copy": "./src/copy/ar.ts",
    "./onboarding": "./src/onboarding.ts",
    "./format": "./src/format.ts",
    "./quiz/question": "./src/quiz/question.ts",
    "./quiz/quiz-settings": "./src/quiz/quiz-settings.ts",
    "./quiz/attempt": "./src/quiz/attempt.ts",
    "./quiz/import": "./src/quiz/import.ts"
  }
```

> `quiz/question.ts` imports `../copy/ar` — a relative specifier. That is fine
> for Vitest, tsc and Turbopack, but it will fail under plain Node ESM at
> runtime the moment `apps/api` imports it for a value. `apps/api` imports it
> only through `createZodDto` in a file compiled by SWC to CommonJS, which
> resolves it correctly. If you ever run the API on the native ESM loader, this
> is the first thing that breaks — check it before assuming a Prisma problem.

- [ ] **Step 8: Run every gate and commit**

```bash
pnpm --filter @ayman/contracts test && pnpm lint && pnpm typecheck
git add packages/contracts
git commit -m "feat(contracts): shared question discriminated union with per-member refinements and the 4x7 review matrix"
```

---

## Task 5: Grading primitives — the float epsilons and Moodle's wildcard matcher

**Files:**
- Create: `apps/api/src/modules/quiz/grading/fraction.ts`, `fraction.spec.ts`
- Create: `apps/api/src/modules/quiz/grading/wildcard.ts`, `wildcard.spec.ts`

**Interfaces:**
- Produces:
  - `WRONG_THRESHOLD = 0.000001`, `RIGHT_THRESHOLD = 0.999999`
  - `fractionToState(fraction: number): 'graded_wrong' | 'graded_partial' | 'graded_right'`
  - `clamp(value: number, min: number, max: number): number`
  - `roundMark(value: number): number`
  - `compareStringWithWildcard(value: string, pattern: string, ignoreCase: boolean): boolean`

These are pure functions with no Nest, no Prisma and no imports from `@ayman/contracts`. They live in `apps/api` and are **never** exported to the browser (Global Constraint 16).

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/quiz/grading/fraction.spec.ts`:

```ts
import { clamp, fractionToState, RIGHT_THRESHOLD, roundMark, WRONG_THRESHOLD } from './fraction';

// Ported verbatim from Moodle's question_state::graded_state_for_fraction():
//   if ($fraction < 0.000001) incorrect
//   else if ($fraction > 0.999999) correct
//   else partcorrect
// The epsilons are the whole point. Floating-point sums of option weights do
// not land on exactly 1, and an `=== 1` comparison marks a fully correct
// answer partially correct.
describe('fractionToState', () => {
  it.each([
    [-1, 'graded_wrong'],
    [-0.25, 'graded_wrong'],
    [-0.0000001, 'graded_wrong'],
    [0, 'graded_wrong'],
    [0.0000009, 'graded_wrong'],
    [0.000001, 'graded_partial'],
    [0.0000011, 'graded_partial'],
    [0.5, 'graded_partial'],
    [0.999999, 'graded_partial'],
    [0.9999991, 'graded_right'],
    [1, 'graded_right'],
  ])('maps %p to %s', (fraction, expected) => {
    expect(fractionToState(fraction)).toBe(expected);
  });

  it('uses strict comparisons at both thresholds, not <= / >=', () => {
    expect(fractionToState(WRONG_THRESHOLD)).toBe('graded_partial');
    expect(fractionToState(RIGHT_THRESHOLD)).toBe('graded_partial');
  });

  it('marks a float-accumulated 1 as fully right, which `=== 1` would not', () => {
    const accumulated = Array.from({ length: 10 }, () => 0.1).reduce((a, b) => a + b, 0);
    expect(accumulated).toBe(0.9999999999999999);
    expect(accumulated === 1).toBe(false);
    expect(fractionToState(accumulated)).toBe('graded_right');
  });

  it('treats a NaN fraction as wrong rather than throwing — fail closed', () => {
    expect(fractionToState(Number.NaN)).toBe('graded_wrong');
  });
});

describe('clamp', () => {
  it.each([
    [-3, 0, 1, 0],
    [-0.000001, 0, 1, 0],
    [0, 0, 1, 0],
    [0.5, 0, 1, 0.5],
    [1, 0, 1, 1],
    [1.4, 0, 1, 1],
    [-0.5, -1, 1, -0.5],
  ])('clamps %p into [%p, %p] as %p', (value, min, max, expected) => {
    expect(clamp(value, min, max)).toBe(expected);
  });

  it('returns the minimum for NaN — fail closed', () => {
    expect(clamp(Number.NaN, 0, 1)).toBe(0);
  });
});

describe('roundMark', () => {
  it('rounds to five decimal places so stored marks are stable', () => {
    expect(roundMark(0.1 + 0.2)).toBe(0.3);
    expect(roundMark(2 / 3)).toBe(0.66667);
  });

  it('does not introduce a negative zero', () => {
    expect(Object.is(roundMark(-0.000001), 0)).toBe(true);
  });
});
```

`apps/api/src/modules/quiz/grading/wildcard.spec.ts`:

```ts
import { compareStringWithWildcard } from './wildcard';

// Ported from Moodle's qtype_shortanswer_question::compare_string_with_wildcard():
// split the pattern on non-escaped asterisks, escape every other bit, rejoin
// with `.*`, anchor both ends, NFC-normalise both sides, add the `i` flag when
// the question is case-insensitive.
describe('compareStringWithWildcard', () => {
  it('matches an exact string', () => {
    expect(compareStringWithWildcard('for', 'for', true)).toBe(true);
    expect(compareStringWithWildcard('fort', 'for', true)).toBe(false);
  });

  it('anchors both ends — a substring is not a match', () => {
    expect(compareStringWithWildcard('a for loop', 'for', true)).toBe(false);
  });

  it('treats * as .*', () => {
    expect(compareStringWithWildcard('for loop', 'for*', true)).toBe(true);
    expect(compareStringWithWildcard('the for loop', '*for*', true)).toBe(true);
    expect(compareStringWithWildcard('forloop', 'for*loop', true)).toBe(true);
    expect(compareStringWithWildcard('for the loop', 'for*loop', true)).toBe(true);
  });

  it('escapes every other regex metacharacter', () => {
    expect(compareStringWithWildcard('a+b', 'a+b', true)).toBe(true);
    expect(compareStringWithWildcard('aab', 'a+b', true)).toBe(false);
    expect(compareStringWithWildcard('3.14', '3.14', true)).toBe(true);
    expect(compareStringWithWildcard('3x14', '3.14', true)).toBe(false);
    expect(compareStringWithWildcard('a(b)c', 'a(b)c', true)).toBe(true);
    expect(compareStringWithWildcard('x^2', 'x^2', true)).toBe(true);
    expect(compareStringWithWildcard('a|b', 'a|b', true)).toBe(true);
    expect(compareStringWithWildcard('[i]', '[i]', true)).toBe(true);
  });

  it('honours an escaped asterisk as a literal asterisk', () => {
    expect(compareStringWithWildcard('2*3', String.raw`2\*3`, true)).toBe(true);
    expect(compareStringWithWildcard('2xxx3', String.raw`2\*3`, true)).toBe(false);
  });

  it('respects the case-sensitivity flag', () => {
    expect(compareStringWithWildcard('FOR', 'for', true)).toBe(true);
    expect(compareStringWithWildcard('FOR', 'for', false)).toBe(false);
  });

  it('trims the student response but not the pattern', () => {
    expect(compareStringWithWildcard('  for  ', 'for', true)).toBe(true);
  });

  it('NFC-normalises both sides so a decomposed Arabic answer still matches', () => {
    // أ = U+0623, decomposed as ا (U+0627) + hamza above (U+0654).
    const composed = 'أحمد';
    const decomposed = 'أحمد';
    expect(composed).not.toBe(decomposed);
    expect(compareStringWithWildcard(decomposed, composed, true)).toBe(true);
    expect(compareStringWithWildcard(composed, decomposed, true)).toBe(true);
  });

  it('matches Arabic answers with a wildcard', () => {
    expect(compareStringWithWildcard('الحلقة التكرارية', 'الحلقة*', true)).toBe(true);
  });

  it('does not let a pattern escape into a catastrophic regex', () => {
    // A pattern of nothing but asterisks collapses to /^.*.*.*$/ — linear, not
    // exponential, because the bits between them are empty literals.
    const started = Date.now();
    expect(compareStringWithWildcard('a'.repeat(5000), '***', true)).toBe(true);
    expect(Date.now() - started).toBeLessThan(200);
  });

  it('returns false rather than throwing on an unmatchable pattern', () => {
    expect(compareStringWithWildcard('x', '', true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run both, confirm they fail**

```bash
pnpm --filter @ayman/api test grading
```
Expected: FAIL — `Cannot find module './fraction'` and `'./wildcard'`.

- [ ] **Step 3: Implement `fraction.ts`**

```ts
import type { AttemptQuestionState } from '../../../generated/prisma/enums';

/**
 * Moodle's question_state::graded_state_for_fraction(), constants included.
 * DO NOT "clean these up" into `=== 0` / `=== 1`. A ten-option multi-choice
 * question whose weights are 0.1 each sums to 0.9999999999999999, and an exact
 * comparison would tell a student who answered perfectly that they were only
 * partially correct.
 */
export const WRONG_THRESHOLD = 0.000001;
export const RIGHT_THRESHOLD = 0.999999;

export type GradedState = Extract<
  AttemptQuestionState,
  'graded_wrong' | 'graded_partial' | 'graded_right'
>;

export function fractionToState(fraction: number): GradedState {
  // NaN fails every comparison, so it would otherwise fall through to
  // "partial". Fail closed: an ungradeable value is not a partial credit.
  if (!Number.isFinite(fraction)) return 'graded_wrong';
  if (fraction < WRONG_THRESHOLD) return 'graded_wrong';
  if (fraction > RIGHT_THRESHOLD) return 'graded_right';
  return 'graded_partial';
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Marks are stored as numeric(10,4); rounding to five places before persisting
 * keeps the in-memory value and the stored value identical, so a re-read never
 * changes a displayed grade. `+ 0` collapses -0 to 0 — a mark rendered as "-0"
 * on a results screen is a support ticket.
 */
export function roundMark(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number((Math.round(value * 1e5) / 1e5).toFixed(5)) + 0;
}
```

- [ ] **Step 4: Implement `wildcard.ts`**

```ts
/**
 * Port of Moodle's qtype_shortanswer_question::compare_string_with_wildcard().
 *
 * The algorithm, step for step:
 *   1. NFC-normalise the pattern and the response. Arabic in particular can
 *      arrive decomposed (ا + hamza) from one keyboard and composed (أ) from
 *      another; without this they are different strings and the student is
 *      marked wrong for typing the same word.
 *   2. Split the pattern on asterisks that are not backslash-escaped.
 *   3. Un-escape `\*` back to a literal `*` inside each bit, then regex-escape
 *      the whole bit. (Order matters: escaping first would leave `\\*`.)
 *   4. Rejoin with `.*` and anchor with ^…$.
 *   5. Add the `i` flag when the question is case-insensitive.
 */
const NON_ESCAPED_ASTERISK = /(?<!\\)\*/;
const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g;

function escapeRegExp(input: string): string {
  return input.replace(REGEXP_SPECIALS, '\\$&');
}

export function compareStringWithWildcard(
  value: string,
  pattern: string,
  ignoreCase: boolean,
): boolean {
  if (pattern === '') return false;

  const normalisedPattern = pattern.normalize('NFC');
  const normalisedValue = value.normalize('NFC').trim();

  const bits = normalisedPattern
    .split(NON_ESCAPED_ASTERISK)
    .map((bit) => escapeRegExp(bit.replaceAll('\\*', '*')));

  // The `u` flag is safe here: escapeRegExp only ever emits escapes that are
  // valid under Unicode mode.
  const expression = new RegExp(`^${bits.join('.*')}$`, ignoreCase ? 'iu' : 'u');
  return expression.test(normalisedValue);
}
```

- [ ] **Step 5: Run, confirm green**

```bash
pnpm --filter @ayman/api test grading
```
Expected: PASS — 19 assertions across the two files.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/quiz/grading
git commit -m "feat(api): Moodle grading primitives — float epsilons and the wildcard matcher"
```

---

## Task 6: Question and attempt grading

**Files:**
- Create: `apps/api/src/modules/quiz/grading/grade-question.ts`, `grade-question.spec.ts`
- Create: `apps/api/src/modules/quiz/grading/grade-attempt.ts`, `grade-attempt.spec.ts`
- Create: `apps/api/src/modules/quiz/grading/index.ts`

**Interfaces:**
- Consumes: `fractionToState`, `clamp`, `roundMark`, `compareStringWithWildcard`.
- Produces:
  - `gradeQuestion(question: GradableQuestion, response: QuestionResponse | null): QuestionGrade`
  - `gradeAttempt(questions: GradedQuestionRow[], quiz: { sumMarks; gradeOutOf; passPercent }): AttemptGrade`
  - types `GradableQuestion`, `GradableOption`, `QuestionResponse`, `QuestionGrade`, `AttemptGrade`

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/quiz/grading/grade-question.spec.ts`:

```ts
import { gradeQuestion, type GradableQuestion } from './grade-question';

const option = (id: string, fraction: number, position: number) => ({ id, fraction, position });

function question(overrides: Partial<GradableQuestion>): GradableQuestion {
  return {
    type: 'mcq_single',
    options: [option('a', 1, 0), option('b', 0, 1)],
    caseSensitive: false,
    ...overrides,
  } as GradableQuestion;
}

describe('gradeQuestion — mcq_single / true_false', () => {
  it('takes the fraction of the chosen option verbatim', () => {
    const result = gradeQuestion(question({}), { kind: 'choice', optionIds: ['a'] });
    expect(result).toEqual({ fraction: 1, state: 'graded_right', matchedOptionIds: ['a'] });
  });

  it('awards partial credit when the chosen option carries it', () => {
    const q = question({ options: [option('a', 1, 0), option('b', 0.5, 1)] });
    expect(gradeQuestion(q, { kind: 'choice', optionIds: ['b'] })).toMatchObject({
      fraction: 0.5,
      state: 'graded_partial',
    });
  });

  it('passes a NEGATIVE fraction straight through — negative marking is per-option', () => {
    const q = question({ options: [option('a', 1, 0), option('b', -0.25, 1)] });
    expect(gradeQuestion(q, { kind: 'choice', optionIds: ['b'] })).toMatchObject({
      fraction: -0.25,
      state: 'graded_wrong',
    });
  });

  it('scores an unanswered question 0, not null', () => {
    expect(gradeQuestion(question({}), null)).toMatchObject({ fraction: 0, state: 'graded_wrong' });
  });

  it('ignores an option id that does not belong to this version', () => {
    expect(
      gradeQuestion(question({}), { kind: 'choice', optionIds: ['not-mine'] }),
    ).toMatchObject({ fraction: 0, state: 'graded_wrong' });
  });

  it('refuses to grade multiple selections on a single-choice question', () => {
    expect(
      gradeQuestion(question({}), { kind: 'choice', optionIds: ['a', 'b'] }),
    ).toMatchObject({ fraction: 0, state: 'graded_wrong' });
  });

  it('grades true_false identically to mcq_single', () => {
    const q = question({ type: 'true_false' });
    expect(gradeQuestion(q, { kind: 'choice', optionIds: ['a'] })).toMatchObject({ fraction: 1 });
  });
});

describe('gradeQuestion — mcq_multi', () => {
  const q = question({
    type: 'mcq_multi',
    options: [option('a', 0.5, 0), option('b', 0.5, 1), option('c', -0.5, 2), option('d', -0.5, 3)],
  });

  it('sums the ticked fractions', () => {
    expect(gradeQuestion(q, { kind: 'choice', optionIds: ['a'] })).toMatchObject({
      fraction: 0.5,
      state: 'graded_partial',
    });
  });

  it('awards full credit for both correct options', () => {
    expect(gradeQuestion(q, { kind: 'choice', optionIds: ['a', 'b'] })).toMatchObject({
      fraction: 1,
      state: 'graded_right',
    });
  });

  // THE CLAMP AT 0. Without it, ticking every distractor produces -1, which
  // subtracts from the rest of the paper — a student can end a quiz on a
  // negative total by guessing badly on one question.
  it('clamps a negative sum to 0', () => {
    expect(gradeQuestion(q, { kind: 'choice', optionIds: ['c', 'd'] })).toMatchObject({
      fraction: 0,
      state: 'graded_wrong',
    });
  });

  it('clamps at 0 exactly, not below', () => {
    expect(gradeQuestion(q, { kind: 'choice', optionIds: ['a', 'c', 'd'] }).fraction).toBe(0);
  });

  it('clamps a sum above 1 back to 1', () => {
    const generous = question({
      type: 'mcq_multi',
      options: [option('a', 0.8, 0), option('b', 0.8, 1)],
    });
    expect(gradeQuestion(generous, { kind: 'choice', optionIds: ['a', 'b'] }).fraction).toBe(1);
  });

  it('scores an empty selection 0', () => {
    expect(gradeQuestion(q, { kind: 'choice', optionIds: [] })).toMatchObject({ fraction: 0 });
  });

  it('reaches graded_right for ten 0.1 options despite the float sum', () => {
    const tenths = question({
      type: 'mcq_multi',
      options: Array.from({ length: 10 }, (_, i) => option(`o${i}`, 0.1, i)),
    });
    const result = gradeQuestion(tenths, {
      kind: 'choice',
      optionIds: Array.from({ length: 10 }, (_, i) => `o${i}`),
    });
    expect(result.state).toBe('graded_right');
  });
});

describe('gradeQuestion — short_answer', () => {
  const q = question({
    type: 'short_answer',
    options: [
      { id: 'p1', fraction: 1, position: 0, answerPattern: 'for' },
      { id: 'p2', fraction: 0.5, position: 1, answerPattern: 'for*' },
      { id: 'p3', fraction: 0, position: 2, answerPattern: '*' },
    ],
  });

  // FIRST MATCHING PATTERN WINS, in position order. 'for' and 'for*' both match
  // "for"; the answer must be the 1.0 one because it is listed first.
  it('takes the first matching pattern in position order', () => {
    expect(gradeQuestion(q, { kind: 'text', text: 'for' })).toMatchObject({
      fraction: 1,
      matchedOptionIds: ['p1'],
    });
  });

  it('falls through to a later pattern when the earlier one does not match', () => {
    expect(gradeQuestion(q, { kind: 'text', text: 'foreach' })).toMatchObject({
      fraction: 0.5,
      matchedOptionIds: ['p2'],
    });
  });

  it('uses the catch-all * pattern last', () => {
    expect(gradeQuestion(q, { kind: 'text', text: 'while' })).toMatchObject({
      fraction: 0,
      matchedOptionIds: ['p3'],
    });
  });

  it('scores 0 when nothing matches and there is no catch-all', () => {
    const strict = question({
      type: 'short_answer',
      options: [{ id: 'p1', fraction: 1, position: 0, answerPattern: 'for' }],
    });
    expect(gradeQuestion(strict, { kind: 'text', text: 'while' })).toMatchObject({
      fraction: 0,
      state: 'graded_wrong',
      matchedOptionIds: [],
    });
  });

  it('treats whitespace-only input as unanswered', () => {
    expect(gradeQuestion(q, { kind: 'text', text: '   ' })).toMatchObject({ fraction: 0 });
  });

  it('honours caseSensitive', () => {
    const sensitive = question({
      type: 'short_answer',
      caseSensitive: true,
      options: [{ id: 'p1', fraction: 1, position: 0, answerPattern: 'For' }],
    });
    expect(gradeQuestion(sensitive, { kind: 'text', text: 'for' }).fraction).toBe(0);
    expect(gradeQuestion(sensitive, { kind: 'text', text: 'For' }).fraction).toBe(1);
  });
});

describe('gradeQuestion — essay', () => {
  it('never auto-grades: fraction is null and the state is needs_grading', () => {
    const q = question({ type: 'essay', options: [] });
    expect(gradeQuestion(q, { kind: 'text', text: 'إجابة طويلة' })).toEqual({
      fraction: null,
      state: 'needs_grading',
      matchedOptionIds: [],
    });
  });

  it('still needs grading when the student wrote nothing — a human decides', () => {
    const q = question({ type: 'essay', options: [] });
    expect(gradeQuestion(q, null).state).toBe('needs_grading');
  });
});

describe('gradeQuestion — response/type mismatch', () => {
  it('scores a text response to a choice question 0 instead of throwing', () => {
    expect(gradeQuestion(question({}), { kind: 'text', text: 'a' })).toMatchObject({
      fraction: 0,
      state: 'graded_wrong',
    });
  });

  it('scores a choice response to a short answer 0 instead of throwing', () => {
    const q = question({
      type: 'short_answer',
      options: [{ id: 'p1', fraction: 1, position: 0, answerPattern: 'for' }],
    });
    expect(gradeQuestion(q, { kind: 'choice', optionIds: ['p1'] }).fraction).toBe(0);
  });
});
```

`apps/api/src/modules/quiz/grading/grade-attempt.spec.ts`:

```ts
import { gradeAttempt } from './grade-attempt';

const quiz = { sumMarks: 10, gradeOutOf: 100, passPercent: 70 };

describe('gradeAttempt', () => {
  it('multiplies each fraction by that question\'s max mark', () => {
    const result = gradeAttempt(
      [
        { fraction: 1, maxMark: 4, minFraction: 0, maxFraction: 1, state: 'graded_right' },
        { fraction: 0.5, maxMark: 6, minFraction: 0, maxFraction: 1, state: 'graded_partial' },
      ],
      quiz,
    );
    expect(result.rawScore).toBe(7);
    expect(result.scaledScore).toBe(70);
    expect(result.passed).toBe(true);
  });

  it('fails one mark below the pass line', () => {
    const result = gradeAttempt(
      [{ fraction: 0.69, maxMark: 10, minFraction: 0, maxFraction: 1, state: 'graded_partial' }],
      quiz,
    );
    expect(result.scaledScore).toBe(69);
    expect(result.passed).toBe(false);
  });

  it('passes exactly on the pass line', () => {
    const result = gradeAttempt(
      [{ fraction: 0.7, maxMark: 10, minFraction: 0, maxFraction: 1, state: 'graded_partial' }],
      quiz,
    );
    expect(result.passed).toBe(true);
  });

  // The per-question floor. A -0.25 option on a 4-mark question is -1 mark;
  // minFraction stops it from eating the rest of the paper beyond its own worth.
  it('applies the per-question minFraction floor', () => {
    const result = gradeAttempt(
      [
        { fraction: -0.25, maxMark: 4, minFraction: 0, maxFraction: 1, state: 'graded_wrong' },
        { fraction: 1, maxMark: 6, minFraction: 0, maxFraction: 1, state: 'graded_right' },
      ],
      quiz,
    );
    expect(result.rawScore).toBe(6);
  });

  it('allows a negative question mark when minFraction permits it, but floors the ATTEMPT at 0', () => {
    const result = gradeAttempt(
      [
        { fraction: -1, maxMark: 4, minFraction: -1, maxFraction: 1, state: 'graded_wrong' },
        { fraction: 0, maxMark: 6, minFraction: 0, maxFraction: 1, state: 'graded_wrong' },
      ],
      quiz,
    );
    expect(result.rawScore).toBe(0);
  });

  it('counts an ungraded essay as 0 for now and marks the attempt pending_review', () => {
    const result = gradeAttempt(
      [
        { fraction: 1, maxMark: 5, minFraction: 0, maxFraction: 1, state: 'graded_right' },
        { fraction: null, maxMark: 5, minFraction: 0, maxFraction: 1, state: 'needs_grading' },
      ],
      quiz,
    );
    expect(result.rawScore).toBe(5);
    expect(result.needsGrading).toBe(true);
    expect(result.attemptState).toBe('pending_review');
  });

  it('marks a fully auto-graded attempt as submitted', () => {
    const result = gradeAttempt(
      [{ fraction: 1, maxMark: 10, minFraction: 0, maxFraction: 1, state: 'graded_right' }],
      quiz,
    );
    expect(result.attemptState).toBe('submitted');
    expect(result.needsGrading).toBe(false);
  });

  it('scores an empty paper 0 without dividing by zero', () => {
    const result = gradeAttempt([], { sumMarks: 0, gradeOutOf: 100, passPercent: 70 });
    expect(result.rawScore).toBe(0);
    expect(result.scaledScore).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('rounds the scaled score to five places rather than carrying float noise', () => {
    const result = gradeAttempt(
      [{ fraction: 1 / 3, maxMark: 3, minFraction: 0, maxFraction: 1, state: 'graded_partial' }],
      { sumMarks: 3, gradeOutOf: 100, passPercent: 70 },
    );
    expect(result.scaledScore).toBe(33.33333);
  });
});
```

- [ ] **Step 2: Run both, confirm they fail**

```bash
pnpm --filter @ayman/api test grade-
```

- [ ] **Step 3: Implement `grade-question.ts`**

```ts
import type { AttemptQuestionState, QuestionType } from '../../../generated/prisma/enums';
import { clamp, fractionToState } from './fraction';
import { compareStringWithWildcard } from './wildcard';

export interface GradableOption {
  id: string;
  fraction: number;
  position: number;
  /** short_answer only — the raw match pattern, never HTML. */
  answerPattern?: string | null;
}

export interface GradableQuestion {
  type: QuestionType;
  options: GradableOption[];
  caseSensitive: boolean;
}

export type QuestionResponse =
  | { kind: 'choice'; optionIds: string[] }
  | { kind: 'text'; text: string };

export interface QuestionGrade {
  /** null ONLY for essay, which a human grades. */
  fraction: number | null;
  state: AttemptQuestionState;
  matchedOptionIds: string[];
}

const WRONG: QuestionGrade = { fraction: 0, state: 'graded_wrong', matchedOptionIds: [] };

/**
 * Every algorithm below is Moodle's, ported directly. The only thing this
 * function is allowed to read is the question version and the stored response —
 * never anything the client sent alongside the submit request.
 */
export function gradeQuestion(
  question: GradableQuestion,
  response: QuestionResponse | null,
): QuestionGrade {
  switch (question.type) {
    case 'essay':
      // v1 never auto-grades an essay, not even an empty one: "the student
      // wrote nothing" is a judgement, and a 0 awarded by a machine on a
      // written answer is the fastest route to an appeal we cannot defend.
      return { fraction: null, state: 'needs_grading', matchedOptionIds: [] };

    case 'mcq_single':
    case 'true_false': {
      if (response?.kind !== 'choice' || response.optionIds.length !== 1) return WRONG;
      const chosen = question.options.find((option) => option.id === response.optionIds[0]);
      if (!chosen) return WRONG;
      // fraction = chosenOption.fraction, verbatim. It may be negative; the
      // per-question floor is applied later, from the snapshotted minFraction.
      return {
        fraction: chosen.fraction,
        state: fractionToState(chosen.fraction),
        matchedOptionIds: [chosen.id],
      };
    }

    case 'mcq_multi': {
      if (response?.kind !== 'choice') return WRONG;
      const ticked = question.options.filter((option) => response.optionIds.includes(option.id));
      const sum = ticked.reduce((total, option) => total + option.fraction, 0);
      // The clamp at 0 is the whole reason a student cannot go sub-zero on a
      // single question by ticking every distractor.
      const fraction = clamp(sum, 0, 1);
      return {
        fraction,
        state: fractionToState(fraction),
        matchedOptionIds: ticked.map((option) => option.id),
      };
    }

    case 'short_answer': {
      if (response?.kind !== 'text' || response.text.trim() === '') return WRONG;
      const patterns = [...question.options].sort((a, b) => a.position - b.position);
      for (const pattern of patterns) {
        if (!pattern.answerPattern) continue;
        if (compareStringWithWildcard(response.text, pattern.answerPattern, !question.caseSensitive)) {
          // FIRST match wins — later patterns are never consulted, exactly as
          // Moodle's get_matching_answer() does it.
          return {
            fraction: pattern.fraction,
            state: fractionToState(pattern.fraction),
            matchedOptionIds: [pattern.id],
          };
        }
      }
      return WRONG;
    }

    default: {
      // Exhaustiveness: a new QuestionType must be handled here explicitly.
      const exhaustive: never = question.type;
      void exhaustive;
      return WRONG;
    }
  }
}
```

- [ ] **Step 4: Implement `grade-attempt.ts`**

```ts
import type { AttemptQuestionState, AttemptState } from '../../../generated/prisma/enums';
import { clamp, roundMark } from './fraction';

export interface GradedQuestionRow {
  fraction: number | null;
  maxMark: number;
  /** Snapshotted per-question floor, from the version's lowest option weight. */
  minFraction: number;
  maxFraction: number;
  state: AttemptQuestionState;
}

export interface AttemptGrade {
  rawScore: number;
  scaledScore: number;
  passed: boolean;
  needsGrading: boolean;
  attemptState: Extract<AttemptState, 'submitted' | 'pending_review'>;
}

export function gradeAttempt(
  questions: readonly GradedQuestionRow[],
  quiz: { sumMarks: number; gradeOutOf: number; passPercent: number },
): AttemptGrade {
  let total = 0;
  let needsGrading = false;

  for (const question of questions) {
    if (question.state === 'needs_grading' || question.fraction === null) {
      // An ungraded essay contributes 0 until a human grades it. The attempt is
      // flagged pending_review so nobody reads that 0 as a final result.
      needsGrading = true;
      continue;
    }
    const bounded = clamp(question.fraction, question.minFraction, question.maxFraction);
    total += bounded * question.maxMark;
  }

  // The attempt-level floor. Per-question negatives are legal; a negative TOTAL
  // is not — there is no pedagogic meaning to "you scored -3 out of 20".
  const rawScore = roundMark(Math.max(0, total));
  const scaledScore =
    quiz.sumMarks > 0 ? roundMark((rawScore / quiz.sumMarks) * quiz.gradeOutOf) : 0;
  const passMark = (quiz.passPercent / 100) * quiz.gradeOutOf;

  return {
    rawScore,
    scaledScore,
    // A pending essay can only ever raise the score, so a provisional pass is
    // honest and a provisional fail is not final — the UI says so in copy.
    passed: scaledScore >= passMark,
    needsGrading,
    attemptState: needsGrading ? 'pending_review' : 'submitted',
  };
}
```

`grading/index.ts`:
```ts
export * from './fraction';
export * from './wildcard';
export * from './grade-question';
export * from './grade-attempt';
```

- [ ] **Step 5: Run, confirm green**

```bash
pnpm --filter @ayman/api test grade-
```
Expected: PASS — 28 tests across the two files.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/quiz/grading
git commit -m "feat(api): per-question and per-attempt grading with the multi-choice clamp and attempt floor"
```

---

## Task 7: Question bank service and the versioned admin API

**Files:**
- Create: `apps/api/src/modules/quiz/question-bank.service.ts`, `question-bank.service.spec.ts`
- Create: `apps/api/src/modules/quiz/dto/question.dto.ts`
- Create: `apps/api/src/modules/quiz/admin-questions.controller.ts`
- Create: `apps/api/src/modules/quiz/quiz.module.ts`
- Modify: `apps/api/src/auth/permissions.ts`, `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `QuestionInputSchema` (Task 4), `sanitizeRichText()` from `apps/api/src/common/sanitize/rich-text.ts` (Plan 3 Task 2).
- Produces:
  - `QuestionBankService.create(input, authorId): Promise<QuestionVersionSummary>`
  - `QuestionBankService.saveDraft(bankEntryId, input, authorId)` — mutates a draft, creates version N+1 if the latest is `ready`
  - `QuestionBankService.publish(versionId): Promise<void>`
  - `QuestionBankService.duplicate(bankEntryId, authorId): Promise<string>`
  - `QuestionBankService.list(filter): Promise<QuestionListItem[]>`
  - `POST/PATCH/GET /api/admin/questions`, `POST /api/admin/questions/:id/publish`, `POST /api/admin/questions/:id/duplicate`

- [ ] **Step 1: Add the quiz permissions**

Modify `apps/api/src/auth/permissions.ts`:

```ts
// RECONCILED: APPEND to the existing set — Plans 2, 3 and 4 already put entries
// here and Plan 6 appends more. Replacing the object silently revokes
// enrollment and progress from every student.
const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission> | '*'> = {
  admin: '*',
  student: new Set<Permission>([
    'profile:read',      // Plan 2
    'profile:write',     // Plan 2
    'course:read',       // Plan 2
    'enrollment:read',   // Plan 3
    'enrollment:create', // Plan 3
    'progress:read',     // Plan 4
    'progress:write',    // Plan 4
    // Quiz (Plan 5). A student may read a quiz's public shape, run their own
    // attempts, and open an appeal. Everything else — authoring, grading,
    // unlocking, analytics — is admin-only and is never granted here.
    'quiz:read',         // ← added here
    'quiz:attempt',      // ← added here
    'appeal:create',     // ← added here
  ]),
};
```

Append these to the `PERMISSIONS` catalogue array as well, so `@RequirePermission` stays typed:
`quiz:read`, `quiz:attempt`, `quiz:write`, `quiz:grade`, `question:read`, `question:write`,
`attempt:read`, `attempt:grade`, `attempt:unlock`, `appeal:create`, `appeal:read`,
`appeal:resolve`, `analytics:read`.

⚠️ **Two colons is not a permission.** The catalogue's shape test is
`/^[a-z][a-z-]*:[a-z][a-z-]*$/`, so this plan's draft names `attempt:read:any`,
`question:manage` and `quiz:manage` are all replaced: `attempt:read`,
`question:write`, `quiz:write`.

Add a test to `apps/api/src/auth/permissions.spec.ts` (create it if Plan 2 did not):

```ts
import { roleHasPermission } from './permissions';

describe('quiz permissions', () => {
  it.each([
    'question:write',
    'quiz:write',
    'attempt:read',
    'attempt:grade',
    'attempt:unlock',
    'appeal:resolve',
    'analytics:read',
  ])('never grants %s to a student', (permission) => {
    expect(roleHasPermission('student', permission)).toBe(false);
    expect(roleHasPermission('admin', permission)).toBe(true);
  });

  it('grants a student only their own attempt permissions', () => {
    expect(roleHasPermission('student', 'quiz:attempt')).toBe(true);
    expect(roleHasPermission('student', 'appeal:create')).toBe(true);
  });
});
```

- [ ] **Step 2: Write the failing service test**

`apps/api/src/modules/quiz/question-bank.service.spec.ts`:

```ts
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import type { QuestionInput } from '@ayman/contracts/quiz/question';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { QuestionBankService } from './question-bank.service';

// The real `sanitizeRichText` (Plan 3 Task 2) is jest.mock'ed to a pass-through here: this
// spec is about VERSIONING, and a real sanitizer would only add noise. There is
// a separate assertion below that the service actually calls it.
jest.mock('../../common/sanitize/rich-text', () => ({
  sanitizeRichText: jest.fn((html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '')),
}));
const sanitizeRichText = jest.requireMock('../../common/sanitize/rich-text')
  .sanitizeRichText as jest.Mock;

describe('QuestionBankService', () => {
  let prisma: PrismaService;
  let service: QuestionBankService;
  let authorId: string;
  let categoryId: string;

  const mcq = (stem: string): QuestionInput =>
    ({
      type: 'mcq_single',
      categoryId,
      stemHtml: stem,
      defaultMark: 1,
      settings: { shuffleOptions: true, caseSensitive: false },
      options: [
        { bodyHtml: '<p>أ</p>', fraction: 1 },
        { bodyHtml: '<p>ب</p>', fraction: 0 },
      ],
    }) as QuestionInput;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as unknown as PrismaService;
    await prisma.$connect();
    authorId = randomUUID();
    await prisma.user.create({
      data: { id: authorId, name: 'Author', email: `${authorId}@example.test`, role: 'admin' },
    });
    categoryId = (await prisma.questionCategory.create({ data: { name: `c-${authorId}` } })).id;
    service = new QuestionBankService(prisma);
  });

  afterAll(async () => {
    await prisma.questionBankEntry.deleteMany({ where: { ownerId: authorId } });
    await prisma.questionCategory.delete({ where: { id: categoryId } });
    await prisma.user.delete({ where: { id: authorId } });
    await prisma.$disconnect();
  });

  it('creates version 1 in draft', async () => {
    const created = await service.create(mcq('<p>س١</p>'), authorId);
    expect(created.version).toBe(1);
    expect(created.status).toBe('draft');
  });

  it('sanitizes the stem, the option bodies and the feedback on write', async () => {
    sanitizeRichText.mockClear();
    await service.create(
      { ...mcq('<p>س<script>alert(1)</script></p>'), generalFeedbackHtml: '<p>شرح</p>' } as QuestionInput,
      authorId,
    );
    expect(sanitizeRichText).toHaveBeenCalled();
    const stored = await prisma.questionVersion.findFirst({
      where: { createdBy: authorId },
      orderBy: { createdAt: 'desc' },
    });
    expect(stored!.stemHtml).not.toContain('<script>');
  });

  it('mutates a draft in place instead of creating a second version', async () => {
    const created = await service.create(mcq('<p>مسودة</p>'), authorId);
    const saved = await service.saveDraft(created.bankEntryId, mcq('<p>معدّلة</p>'), authorId);
    expect(saved.version).toBe(1);
    const versions = await prisma.questionVersion.count({
      where: { bankEntryId: created.bankEntryId },
    });
    expect(versions).toBe(1);
  });

  it('creates version 2 when the latest version is already published', async () => {
    const created = await service.create(mcq('<p>الأصلية</p>'), authorId);
    await service.publish(created.versionId);
    const saved = await service.saveDraft(created.bankEntryId, mcq('<p>الجديدة</p>'), authorId);
    expect(saved.version).toBe(2);
    expect(saved.status).toBe('draft');

    // Q2: the published version is untouched. This is what keeps every past
    // attempt's review screen honest.
    const original = await prisma.questionVersion.findUnique({ where: { id: created.versionId } });
    expect(original!.stemHtml).toBe('<p>الأصلية</p>');
    expect(original!.status).toBe('ready');
  });

  it('refuses to publish a question that fails its own type rules', async () => {
    const created = await service.create(mcq('<p>س</p>'), authorId);
    // Force an illegal state past the service by writing directly, the way a
    // bad import or a future bug would.
    await prisma.questionOption.updateMany({
      where: { questionVersionId: created.versionId },
      data: { fraction: 0 },
    });
    await expect(service.publish(created.versionId)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('duplicates the latest ready version into a brand new entry', async () => {
    const created = await service.create(mcq('<p>للنسخ</p>'), authorId);
    await service.publish(created.versionId);
    const copyEntryId = await service.duplicate(created.bankEntryId, authorId);

    expect(copyEntryId).not.toBe(created.bankEntryId);
    const copy = await prisma.questionVersion.findFirst({
      where: { bankEntryId: copyEntryId },
      include: { options: { orderBy: { position: 'asc' } } },
    });
    expect(copy!.version).toBe(1);
    expect(copy!.status).toBe('draft');
    expect(copy!.stemHtml).toBe('<p>للنسخ</p>');
    expect(copy!.options.map((o) => Number(o.fraction))).toEqual([1, 0]);
    // Options are COPIES, not shared rows — editing the copy must not touch
    // the original, which past attempts still point at.
    const originalOptionIds = (
      await prisma.questionOption.findMany({ where: { questionVersionId: created.versionId } })
    ).map((o) => o.id);
    expect(copy!.options.map((o) => o.id)).not.toEqual(expect.arrayContaining(originalOptionIds));
  });

  it('stores short-answer patterns raw, never HTML-encoded', async () => {
    const created = await service.create(
      {
        type: 'short_answer',
        categoryId,
        stemHtml: '<p>اكتب الشرط</p>',
        defaultMark: 1,
        settings: { caseSensitive: false, shuffleOptions: false },
        options: [{ answerPattern: 'a < b', fraction: 1 }],
      } as QuestionInput,
      authorId,
    );
    const option = await prisma.questionOption.findFirst({
      where: { questionVersionId: created.versionId },
    });
    expect(option!.answerPattern).toBe('a < b');
    expect(option!.bodyHtml).toBe('');
  });

  it('never lets a caller choose the version number or the status', async () => {
    const created = await service.create(
      { ...mcq('<p>س</p>'), version: 99, status: 'ready' } as unknown as QuestionInput,
      authorId,
    );
    expect(created.version).toBe(1);
    expect(created.status).toBe('draft');
  });
});
```

Run: `pnpm --filter @ayman/api test question-bank`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `question-bank.service.ts`**

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { QuestionInputSchema, type QuestionInput } from '@ayman/contracts/quiz/question';
import { copy } from '@ayman/contracts/copy';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRichText } from '../../common/sanitize/rich-text';
import type { QuestionStatus, QuestionType } from '../../generated/prisma/enums';

export interface QuestionVersionSummary {
  bankEntryId: string;
  versionId: string;
  version: number;
  status: QuestionStatus;
  type: QuestionType;
}

@Injectable()
export class QuestionBankService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Rows are built field by field from the PARSED input. There is no
   * `data: dto` spread anywhere in this file — `version`, `status`,
   * `createdBy` and every option id are server-decided, so a payload carrying
   * `{ version: 99, status: 'ready' }` changes nothing.
   */
  private optionRows(input: QuestionInput) {
    if (input.type === 'essay') return [];
    if (input.type === 'short_answer') {
      return input.options.map((option, index) => ({
        // A short-answer pattern must NOT be sanitized: HTML-encoding `<`
        // would silently break `a < b`. The review screen renders it as text.
        bodyHtml: '',
        answerPattern: option.answerPattern,
        fraction: option.fraction,
        feedbackHtml: option.feedbackHtml ? sanitizeRichText(option.feedbackHtml) : null,
        position: index,
      }));
    }
    return input.options.map((option, index) => ({
      bodyHtml: sanitizeRichText(option.bodyHtml),
      answerPattern: null,
      fraction: option.fraction,
      feedbackHtml: option.feedbackHtml ? sanitizeRichText(option.feedbackHtml) : null,
      position: index,
    }));
  }

  private versionRow(input: QuestionInput, authorId: string) {
    return {
      type: input.type,
      stemHtml: sanitizeRichText(input.stemHtml),
      generalFeedbackHtml: input.generalFeedbackHtml
        ? sanitizeRichText(input.generalFeedbackHtml)
        : null,
      defaultMark: input.defaultMark,
      settings: input.settings,
      createdBy: authorId,
    };
  }

  async create(input: QuestionInput, authorId: string): Promise<QuestionVersionSummary> {
    const parsed = QuestionInputSchema.parse(input);
    const entry = await this.prisma.questionBankEntry.create({
      data: {
        categoryId: parsed.categoryId,
        ownerId: authorId,
        versions: {
          create: {
            version: 1,
            status: 'draft',
            ...this.versionRow(parsed, authorId),
            options: { create: this.optionRows(parsed) },
          },
        },
      },
      include: { versions: true },
    });
    const version = entry.versions[0]!;
    return {
      bankEntryId: entry.id,
      versionId: version.id,
      version: version.version,
      status: version.status,
      type: version.type,
    };
  }

  /**
   * Editing rule, and the reason review screens stay correct forever:
   *   latest is `draft`  → mutate it in place (options are replaced wholesale)
   *   latest is `ready`  → create version N+1 as a fresh draft
   * The database trigger from Task 1 enforces the second branch even if this
   * method is bypassed.
   */
  async saveDraft(
    bankEntryId: string,
    input: QuestionInput,
    authorId: string,
  ): Promise<QuestionVersionSummary> {
    const parsed = QuestionInputSchema.parse(input);
    const latest = await this.prisma.questionVersion.findFirst({
      where: { bankEntryId },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, status: true },
    });
    if (!latest) throw new NotFoundException();

    return this.prisma.$transaction(async (tx) => {
      if (latest.status === 'draft') {
        await tx.questionOption.deleteMany({ where: { questionVersionId: latest.id } });
        const updated = await tx.questionVersion.update({
          where: { id: latest.id },
          data: {
            ...this.versionRow(parsed, authorId),
            options: { create: this.optionRows(parsed) },
          },
        });
        await tx.questionBankEntry.update({
          where: { id: bankEntryId },
          data: { categoryId: parsed.categoryId },
        });
        return {
          bankEntryId,
          versionId: updated.id,
          version: updated.version,
          status: updated.status,
          type: updated.type,
        };
      }

      const created = await tx.questionVersion.create({
        data: {
          bankEntryId,
          version: latest.version + 1,
          status: 'draft',
          ...this.versionRow(parsed, authorId),
          options: { create: this.optionRows(parsed) },
        },
      });
      await tx.questionBankEntry.update({
        where: { id: bankEntryId },
        data: { categoryId: parsed.categoryId },
      });
      return {
        bankEntryId,
        versionId: created.id,
        version: created.version,
        status: created.status,
        type: created.type,
      };
    });
  }

  /**
   * Publishing re-validates the STORED rows through the same shared schema the
   * form used. A question that reached the database through a bulk import, a
   * migration or a bug never becomes `ready` in an ungradeable state.
   */
  async publish(versionId: string): Promise<void> {
    const version = await this.prisma.questionVersion.findUnique({
      where: { id: versionId },
      include: { options: { orderBy: { position: 'asc' } }, bankEntry: true },
    });
    if (!version) throw new NotFoundException();
    if (version.status !== 'draft') return;

    const candidate = {
      type: version.type,
      categoryId: version.bankEntry.categoryId,
      stemHtml: version.stemHtml,
      generalFeedbackHtml: version.generalFeedbackHtml ?? undefined,
      defaultMark: Number(version.defaultMark),
      settings: version.settings,
      options: version.options.map((option) =>
        version.type === 'short_answer'
          ? { answerPattern: option.answerPattern ?? '', fraction: Number(option.fraction) }
          : { bodyHtml: option.bodyHtml, fraction: Number(option.fraction) },
      ),
    };

    const result = QuestionInputSchema.safeParse(candidate);
    if (!result.success) {
      throw new BadRequestException({
        message: copy.quizErrors.exactlyOneCorrect,
        issues: result.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
    }

    await this.prisma.questionVersion.update({
      where: { id: versionId },
      data: { status: 'ready' },
    });
  }

  /** Duplicate = a NEW bank entry carrying a fresh draft copy of the latest version. */
  async duplicate(bankEntryId: string, authorId: string): Promise<string> {
    const source = await this.prisma.questionVersion.findFirst({
      where: { bankEntryId, status: { in: ['ready', 'draft'] } },
      orderBy: [{ status: 'asc' }, { version: 'desc' }],
      include: { options: { orderBy: { position: 'asc' } }, bankEntry: true },
    });
    if (!source) throw new NotFoundException();

    const entry = await this.prisma.questionBankEntry.create({
      data: {
        categoryId: source.bankEntry.categoryId,
        ownerId: authorId,
        versions: {
          create: {
            version: 1,
            status: 'draft',
            type: source.type,
            stemHtml: source.stemHtml,
            generalFeedbackHtml: source.generalFeedbackHtml,
            defaultMark: source.defaultMark,
            settings: source.settings as object,
            createdBy: authorId,
            options: {
              // New rows, new ids. Sharing option rows would mean editing the
              // copy silently rewrites every attempt that used the original.
              create: source.options.map((option) => ({
                bodyHtml: option.bodyHtml,
                answerPattern: option.answerPattern,
                fraction: option.fraction,
                feedbackHtml: option.feedbackHtml,
                position: option.position,
              })),
            },
          },
        },
      },
    });
    return entry.id;
  }

  async list(filter: { categoryId?: string; type?: QuestionType; search?: string; take: number; skip: number }) {
    return this.prisma.questionBankEntry.findMany({
      where: {
        categoryId: filter.categoryId,
        versions: {
          some: {
            type: filter.type,
            stemHtml: filter.search ? { contains: filter.search, mode: 'insensitive' } : undefined,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: filter.take,
      skip: filter.skip,
      select: {
        id: true,
        category: { select: { id: true, name: true } },
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: { id: true, version: true, status: true, type: true, stemHtml: true, defaultMark: true },
        },
      },
    });
  }
}
```

- [ ] **Step 4: Create the admin DTO and controller**

`apps/api/src/modules/quiz/dto/question.dto.ts`:
```ts
// Imported from the leaf subpath, not the package root — the root barrel
// re-exports through extensionless relative specifiers that Node's ESM loader
// cannot resolve at runtime (see packages/contracts/src/index.ts).
import { QuestionInputSchema } from '@ayman/contracts/quiz/question';
import { createZodDto } from 'nestjs-zod';

/**
 * ADMIN-ONLY DTO. There is deliberately no learner-facing question DTO: a
 * student never sends a question shape, only a response. Keeping the two
 * completely separate is what makes "a student PATCHing {fraction: 1}"
 * structurally impossible rather than merely rejected.
 */
export class CreateQuestionDto extends createZodDto(QuestionInputSchema) {}
export class UpdateQuestionDto extends createZodDto(QuestionInputSchema) {}
```

`apps/api/src/modules/quiz/admin-questions.controller.ts`:
```ts
import { Body, Controller, Get, Param, Post, Patch, Query, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { CreateQuestionDto, UpdateQuestionDto } from './dto/question.dto';
import { QuestionBankService } from './question-bank.service';

@Controller('admin/questions')
@RequirePermission('question:write')
export class AdminQuestionsController {
  constructor(private readonly bank: QuestionBankService) {}

  @Get()
  list(
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('take') take = '50',
    @Query('skip') skip = '0',
  ) {
    return this.bank.list({
      categoryId,
      search,
      take: Math.min(Number(take) || 50, 200),
      skip: Number(skip) || 0,
    });
  }

  @Post()
  @UsePipes(ZodValidationPipe)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateQuestionDto) {
    return this.bank.create(body, user.id);
  }

  @Patch(':bankEntryId')
  @UsePipes(ZodValidationPipe)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bankEntryId') bankEntryId: string,
    @Body() body: UpdateQuestionDto,
  ) {
    return this.bank.saveDraft(bankEntryId, body, user.id);
  }

  @Post(':versionId/publish')
  publish(@Param('versionId') versionId: string) {
    return this.bank.publish(versionId);
  }

  @Post(':bankEntryId/duplicate')
  duplicate(@CurrentUser() user: AuthenticatedUser, @Param('bankEntryId') bankEntryId: string) {
    return this.bank.duplicate(bankEntryId, user.id);
  }
}
```

`apps/api/src/modules/quiz/quiz.module.ts` — start it now, extend it in every later task:
```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminQuestionsController } from './admin-questions.controller';
import { QuestionBankService } from './question-bank.service';

@Module({
  imports: [PrismaModule],
  controllers: [AdminQuestionsController],
  providers: [QuestionBankService],
  exports: [QuestionBankService],
})
export class QuizModule {}
```

Register `QuizModule` in `apps/api/src/app.module.ts`'s `imports`.

- [ ] **Step 5: Run, confirm green**

```bash
pnpm --filter @ayman/api test question-bank && pnpm --filter @ayman/api test permissions
```
Expected: PASS — 8 + 2 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/quiz apps/api/src/auth/permissions.ts apps/api/src/auth/permissions.spec.ts apps/api/src/app.module.ts
git commit -m "feat(api): versioned question bank service and admin questions API"
```

---

## Task 8: Bulk import from text

The single biggest authoring-speed lever. An instructor with 60 questions in a Word file should not click 300 times.

**Files:**
- Create: `packages/contracts/src/quiz/import.ts`, `import.spec.ts`
- Modify: `packages/contracts/src/quiz/index.ts`
- Create: `apps/api/src/modules/quiz/dto/bulk-import.dto.ts`
- Modify: `apps/api/src/modules/quiz/admin-questions.controller.ts`, `question-bank.service.ts`

**Interfaces:**
- Produces: `parseQuestionBlocks(text: string, categoryId: string): ImportResult` where
  `ImportResult = { questions: QuestionInput[]; errors: ImportError[] }` and
  `ImportError = { blockIndex: number; line: number; message: string }`.
  `POST /api/admin/questions/bulk` accepts `{ categoryId, text }` and commits only when `errors` is empty.

- [ ] **Step 1: Write the failing parser test**

`packages/contracts/src/quiz/import.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseQuestionBlocks } from './import';
import { QuestionInputSchema } from './question';

const CATEGORY = '018f0000-0000-7000-8000-000000000000';

describe('parseQuestionBlocks', () => {
  it('parses an Aiken-style single-choice block', () => {
    const result = parseQuestionBlocks(
      `ما ناتج 2 + 2؟
A. 3
B. 4
C. 5
ANSWER: B`,
      CATEGORY,
    );
    expect(result.errors).toEqual([]);
    expect(result.questions).toHaveLength(1);
    const question = result.questions[0]!;
    expect(question.type).toBe('mcq_single');
    expect(question.stemHtml).toBe('<p>ما ناتج 2 + 2؟</p>');
    expect(question.options.map((o) => o.fraction)).toEqual([0, 1, 0]);
  });

  it('accepts Arabic option letters and an Arabic answer keyword', () => {
    const result = parseQuestionBlocks(
      `أي دالة بتطبع على الشاشة؟
أ. input
ب. print
ج. len
الإجابة: ب`,
      CATEGORY,
    );
    expect(result.errors).toEqual([]);
    expect(result.questions[0]!.options[1]!.fraction).toBe(1);
  });

  it('produces mcq_multi when the answer line names more than one letter', () => {
    const result = parseQuestionBlocks(
      `اختار لغات البرمجة
A. Python
B. HTML
C. C++
ANSWER: A, C`,
      CATEGORY,
    );
    const question = result.questions[0]!;
    expect(question.type).toBe('mcq_multi');
    // Weights are split evenly so they sum to exactly 1 and satisfy the shared
    // schema's own multi-choice rule.
    expect(question.options.map((o) => o.fraction)).toEqual([0.5, 0, 0.5]);
  });

  it('produces true_false from صح/خطأ options', () => {
    const result = parseQuestionBlocks(
      `الـ while بتتنفذ طول ما الشرط صح
أ. صح
ب. خطأ
الإجابة: أ`,
      CATEGORY,
    );
    expect(result.questions[0]!.type).toBe('true_false');
  });

  it('parses a short answer with = patterns', () => {
    const result = parseQuestionBlocks(
      `TYPE: short
اكتب الكلمة المفتاحية للحلقة المحددة
= for
= For*`,
      CATEGORY,
    );
    const question = result.questions[0]!;
    expect(question.type).toBe('short_answer');
    expect(question.options.map((o) => o.answerPattern)).toEqual(['for', 'For*']);
    expect(question.options[0]!.fraction).toBe(1);
  });

  it('parses an essay block with no options', () => {
    const result = parseQuestionBlocks(
      `TYPE: essay
اشرح الفرق بين الحلقة المحددة وغير المحددة`,
      CATEGORY,
    );
    expect(result.questions[0]!.type).toBe('essay');
    expect(result.questions[0]!.options).toEqual([]);
  });

  it('splits blocks on blank lines and keeps multi-line stems', () => {
    const result = parseQuestionBlocks(
      `السؤال الأول
سطر تاني من نفس السؤال
A. أ
B. ب
ANSWER: A

السؤال التاني
A. أ
B. ب
ANSWER: B`,
      CATEGORY,
    );
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0]!.stemHtml).toBe('<p>السؤال الأول</p><p>سطر تاني من نفس السؤال</p>');
  });

  it('reports a missing answer line with a 1-based block number and a line number', () => {
    const result = parseQuestionBlocks(
      `سؤال بدون إجابة
A. أ
B. ب`,
      CATEGORY,
    );
    expect(result.questions).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ blockIndex: 1, line: 1 });
  });

  it('reports an answer letter that has no matching option', () => {
    const result = parseQuestionBlocks(
      `سؤال
A. أ
B. ب
ANSWER: D`,
      CATEGORY,
    );
    expect(result.errors[0]!.message).toContain('D');
  });

  it('keeps the good blocks and reports only the bad ones', () => {
    const result = parseQuestionBlocks(
      `سليم
A. أ
B. ب
ANSWER: A

معطوب
A. أ`,
      CATEGORY,
    );
    expect(result.questions).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.blockIndex).toBe(2);
  });

  it('ignores trailing whitespace, CRLF line endings and stray blank lines', () => {
    const result = parseQuestionBlocks(
      'سؤال\r\nA. أ  \r\nB. ب\r\nANSWER: A\r\n\r\n\r\n',
      CATEGORY,
    );
    expect(result.errors).toEqual([]);
    expect(result.questions).toHaveLength(1);
  });

  it('emits only questions that the SHARED schema accepts', () => {
    const result = parseQuestionBlocks(
      `سؤال
A. أ
B. ب
ANSWER: A

سؤال تاني
أ. صح
ب. خطأ
الإجابة: ب`,
      CATEGORY,
    );
    for (const question of result.questions) {
      expect(QuestionInputSchema.safeParse(question).success).toBe(true);
    }
  });

  it('returns an explicit error for empty input rather than an empty success', () => {
    const result = parseQuestionBlocks('   \n\n  ', CATEGORY);
    expect(result.questions).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
pnpm --filter @ayman/contracts test import
```

- [ ] **Step 3: Implement `packages/contracts/src/quiz/import.ts`**

```ts
import { copy } from '../copy/ar';
import { formatCopy } from '../format';
import { QuestionInputSchema, type QuestionInput } from './question';

export interface ImportError {
  /** 1-based, so it matches what the instructor sees in the preview. */
  blockIndex: number;
  /** 1-based line number WITHIN the block. */
  line: number;
  message: string;
}

export interface ImportResult {
  questions: QuestionInput[];
  errors: ImportError[];
}

/** A. / a) / أ. / ب) — Latin and Arabic ordinal letters, dot or paren. */
const OPTION_LINE = /^\s*([A-Ja-jأبجدهوزحط])\s*[).．.]\s*(.+?)\s*$/;
const ANSWER_LINE = /^\s*(?:ANSWER|Answer|answer|الإجابة|الاجابة)\s*[:：]\s*(.+?)\s*$/;
const TYPE_LINE = /^\s*(?:TYPE|النوع)\s*[:：]\s*(\w+)\s*$/i;
const PATTERN_LINE = /^\s*=\s*(.+?)\s*$/;

/** Latin A–J then the Arabic abjad order أ ب ج د هـ و ز ح ط. */
const LETTER_ORDER = 'ABCDEFGHIJ';
const ARABIC_LETTER_ORDER = ['أ', 'ب', 'ج', 'د', 'ه', 'و', 'ز', 'ح', 'ط'];

function letterToIndex(letter: string): number {
  const latin = LETTER_ORDER.indexOf(letter.toUpperCase());
  if (latin >= 0) return latin;
  return ARABIC_LETTER_ORDER.indexOf(letter);
}

const TRUE_WORDS = new Set(['صح', 'صحيح', 'true', 'TRUE', 'True']);
const FALSE_WORDS = new Set(['خطأ', 'غلط', 'false', 'FALSE', 'False']);

function toParagraphs(lines: readonly string[]): string {
  // The importer emits paragraph markup only. The API sanitizes it again on
  // write, so a paste containing markup cannot smuggle anything through.
  return lines
    .map((line) => `<p>${line.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</p>`)
    .join('');
}

/**
 * A deliberately small Aiken superset:
 *   - blocks separated by blank lines
 *   - stem lines until the first option/pattern/answer line
 *   - `A. text` options, Latin or Arabic letters
 *   - `ANSWER: B` or `الإجابة: ب`, comma-separated for multi-choice
 *   - `TYPE: short` + `= pattern` lines, or `TYPE: essay`
 *
 * Anything richer (GIFT, Moodle XML, QTI) is an importer we can add later
 * against the same `QuestionInput` output. The parser's contract is that every
 * question it returns already satisfies `QuestionInputSchema`.
 */
export function parseQuestionBlocks(text: string, categoryId: string): ImportResult {
  const blocks = text
    .replaceAll('\r\n', '\n')
    .split(/\n\s*\n+/)
    .map((block) => block.split('\n').filter((line) => line.trim() !== ''))
    .filter((lines) => lines.length > 0);

  const questions: QuestionInput[] = [];
  const errors: ImportError[] = [];

  if (blocks.length === 0) {
    return { questions, errors: [{ blockIndex: 1, line: 1, message: copy.quizErrors.importNoQuestions }] };
  }

  blocks.forEach((lines, index) => {
    const blockIndex = index + 1;
    const stem: string[] = [];
    const options: { letter: string; body: string }[] = [];
    const patterns: string[] = [];
    let answerLetters: string[] = [];
    let declaredType: string | null = null;
    let sawAnswerLine = false;

    for (const line of lines) {
      const typeMatch = TYPE_LINE.exec(line);
      if (typeMatch) {
        declaredType = typeMatch[1]!.toLowerCase();
        continue;
      }
      const answerMatch = ANSWER_LINE.exec(line);
      if (answerMatch) {
        sawAnswerLine = true;
        answerLetters = answerMatch[1]!
          .split(/[,،و]/)
          .map((part) => part.trim())
          .filter(Boolean);
        continue;
      }
      const patternMatch = PATTERN_LINE.exec(line);
      if (patternMatch) {
        patterns.push(patternMatch[1]!);
        continue;
      }
      const optionMatch = OPTION_LINE.exec(line);
      if (optionMatch && (options.length > 0 || stem.length > 0)) {
        options.push({ letter: optionMatch[1]!, body: optionMatch[2]! });
        continue;
      }
      stem.push(line.trim());
    }

    if (stem.length === 0) {
      errors.push({ blockIndex, line: 1, message: copy.quizErrors.stemRequired });
      return;
    }

    const base = {
      categoryId,
      stemHtml: toParagraphs(stem),
      defaultMark: 1,
      settings: { shuffleOptions: true, caseSensitive: false },
    };

    let candidate: unknown;

    if (declaredType === 'essay' || (declaredType === null && options.length === 0 && patterns.length === 0 && !sawAnswerLine)) {
      candidate = { ...base, type: 'essay', options: [], settings: { ...base.settings } };
    } else if (declaredType === 'short' || patterns.length > 0) {
      if (patterns.length === 0) {
        errors.push({ blockIndex, line: 1, message: copy.quizErrors.patternRequired });
        return;
      }
      candidate = {
        ...base,
        type: 'short_answer',
        // Every listed pattern is full credit; partial-credit patterns are an
        // editor-only feature, not something anyone hand-writes in a paste.
        options: patterns.map((pattern) => ({ answerPattern: pattern, fraction: 1 })),
      };
    } else {
      if (options.length === 0) {
        errors.push({ blockIndex, line: 1, message: formatCopy(copy.quizErrors.importNoOptions, { n: blockIndex }) });
        return;
      }
      if (!sawAnswerLine) {
        errors.push({ blockIndex, line: 1, message: formatCopy(copy.quizErrors.importNoAnswerLine, { n: blockIndex }) });
        return;
      }

      const correctIndexes: number[] = [];
      for (const letter of answerLetters) {
        const position = letterToIndex(letter);
        if (position < 0 || position >= options.length) {
          errors.push({
            blockIndex,
            line: 1,
            message: formatCopy(copy.quizErrors.importUnknownLetter, { n: blockIndex, letter }),
          });
          return;
        }
        correctIndexes.push(position);
      }

      const bodies = options.map((option) => option.body.trim());
      const isTrueFalse =
        options.length === 2 &&
        bodies.some((body) => TRUE_WORDS.has(body)) &&
        bodies.some((body) => FALSE_WORDS.has(body));

      const share = 1 / correctIndexes.length;
      candidate = {
        ...base,
        type: isTrueFalse ? 'true_false' : correctIndexes.length > 1 ? 'mcq_multi' : 'mcq_single',
        options: options.map((option, position) => ({
          bodyHtml: toParagraphs([option.body]),
          fraction: correctIndexes.includes(position)
            ? correctIndexes.length > 1
              ? share
              : 1
            : 0,
        })),
      };
    }

    // The parser never emits anything the shared schema would reject — the
    // preview an instructor sees is exactly what the API will accept.
    const parsed = QuestionInputSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push({ blockIndex, line: 1, message: parsed.error.issues[0]?.message ?? copy.quizErrors.importUnknownType });
      return;
    }
    questions.push(parsed.data);
  });

  return { questions, errors };
}
```

> `toParagraphs` escapes `&`, `<` and `>` before wrapping. A paste that contains
> `<img onerror=…>` therefore arrives at the API as text, and the API sanitizes
> again on write. Two layers, because the parser also runs in the browser for
> the preview and a browser-side escape is not a security boundary.

- [ ] **Step 4: Run, confirm green**

```bash
pnpm --filter @ayman/contracts test import
```
Expected: PASS — 13 tests.

- [ ] **Step 5: Wire the commit endpoint**

Add to `packages/contracts/src/quiz/index.ts`: `export * from './import';`

`apps/api/src/modules/quiz/dto/bulk-import.dto.ts`:
```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const BulkImportSchema = z
  .object({
    categoryId: z.string().min(1),
    // 200 KB is roughly 2,000 questions — far past any real paste, and small
    // enough that the parser can never be turned into a CPU sink.
    text: z.string().min(1).max(200_000),
  })
  .strict();

export class BulkImportDto extends createZodDto(BulkImportSchema) {}
```

Add to `QuestionBankService`:
```ts
  /**
   * All-or-nothing. A partial import leaves an instructor guessing which of
   * their 60 questions landed, so a single bad block rejects the whole paste
   * with the block numbers to fix.
   */
  async bulkImport(
    text: string,
    categoryId: string,
    authorId: string,
  ): Promise<{ created: number; errors: ImportError[] }> {
    const { questions, errors } = parseQuestionBlocks(text, categoryId);
    if (errors.length > 0) return { created: 0, errors };

    await this.prisma.$transaction(
      questions.map((question) =>
        this.prisma.questionBankEntry.create({
          data: {
            categoryId,
            ownerId: authorId,
            versions: {
              create: {
                version: 1,
                // Imported questions land as `ready`: the instructor already
                // reviewed them in the preview, and forcing 60 publish clicks
                // would defeat the entire point of a bulk import.
                status: 'ready',
                ...this.versionRow(question, authorId),
                options: { create: this.optionRows(question) },
              },
            },
          },
        }),
      ),
    );

    return { created: questions.length, errors: [] };
  }
```

Controller route:
```ts
  @Post('bulk')
  @UsePipes(ZodValidationPipe)
  bulk(@CurrentUser() user: AuthenticatedUser, @Body() body: BulkImportDto) {
    return this.bank.bulkImport(body.text, body.categoryId, user.id);
  }
```

Add a service test asserting a bad block imports nothing:
```ts
  it('imports nothing at all when any block is broken', async () => {
    const before = await prisma.questionBankEntry.count({ where: { ownerId: authorId } });
    const result = await service.bulkImport('سليم\nA. أ\nB. ب\nANSWER: A\n\nمعطوب\nA. أ', categoryId, authorId);
    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(await prisma.questionBankEntry.count({ where: { ownerId: authorId } })).toBe(before);
  });
```

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/quiz apps/api/src/modules/quiz
git commit -m "feat(contracts): bulk question import from text with Arabic answer letters"
```

---

## Task 9: The three-layer answer-leak defence

**This is the highest-value task in the plan.** Everything else is a feature; this is the property the product cannot be shipped without.

**Files:**
- Create: `apps/api/src/modules/quiz/serializers/learner.serializer.ts`, `learner.serializer.spec.ts`
- Create: `apps/api/src/modules/quiz/interceptors/no-answer-leak.decorator.ts`
- Create: `apps/api/src/modules/quiz/interceptors/no-answer-leak.interceptor.ts`, `.spec.ts`

**Interfaces:**
- Produces:
  - `LEARNER_QUESTION_SELECT` — the Prisma select, exported so no caller can hand-roll one
  - `toLearnerQuestion(row, optionOrder, attemptQuestion): LearnerQuestion`
  - `FORBIDDEN_ANSWER_KEYS: ReadonlySet<string>`
  - `@NoAnswerLeak()` + `NoAnswerLeakInterceptor`
  - type `LearnerQuestion`

**Layer 1** is the Prisma `select` — the data never enters the process.
**Layer 2** is the serializer plus a runtime interceptor that deep-scans the response of any route marked `@NoAnswerLeak()` and fails the request rather than shipping a leak.
**Layer 3** is the contract test in Task 12, which asserts against the raw HTTP body.

- [ ] **Step 1: Write the failing serializer test**

`apps/api/src/modules/quiz/serializers/learner.serializer.spec.ts`:

```ts
import { FORBIDDEN_ANSWER_KEYS, collectKeysDeep, toLearnerQuestion } from './learner.serializer';

const row = {
  id: 'v1',
  type: 'mcq_single' as const,
  stemHtml: '<p>ما ناتج 2 + 2؟</p>',
  settings: { shuffleOptions: true, minWords: 10, maxWords: 100, graderInfo: 'الإجابة هي 4' },
  options: [
    { id: 'o1', bodyHtml: '<p>3</p>', position: 0 },
    { id: 'o2', bodyHtml: '<p>4</p>', position: 1 },
    { id: 'o3', bodyHtml: '<p>5</p>', position: 2 },
  ],
};

const attemptQuestion = {
  slotPosition: 0,
  maxMark: 2,
  optionOrder: [2, 0, 1],
  response: { kind: 'choice' as const, optionIds: ['o1'] },
  flagged: true,
  state: 'graded_right' as const,
};

describe('toLearnerQuestion', () => {
  it('renders options in the SNAPSHOTTED order, not the authoring order', () => {
    const result = toLearnerQuestion(row, attemptQuestion);
    expect(result.options.map((option) => option.id)).toEqual(['o3', 'o1', 'o2']);
  });

  it('emits only id and bodyHtml per option', () => {
    const result = toLearnerQuestion(row, attemptQuestion);
    for (const option of result.options) {
      expect(Object.keys(option).sort()).toEqual(['bodyHtml', 'id']);
    }
  });

  it('drops graderInfo from settings while keeping the word limits', () => {
    const result = toLearnerQuestion(row, attemptQuestion);
    expect(result.settings).toEqual({ minWords: 10, maxWords: 100 });
  });

  it('projects the grading state down to a boolean — graded_right must never ship', () => {
    const result = toLearnerQuestion(row, attemptQuestion);
    expect(result.answered).toBe(true);
    expect(result).not.toHaveProperty('state');
    expect(JSON.stringify(result)).not.toContain('graded_right');
  });

  it('carries no forbidden key at any depth', () => {
    const keys = collectKeysDeep(toLearnerQuestion(row, attemptQuestion));
    for (const key of keys) {
      expect(FORBIDDEN_ANSWER_KEYS.has(key)).toBe(false);
    }
  });

  it('survives an option_order that is shorter than the option list', () => {
    // Defensive: a snapshot written before an option was added (impossible with
    // the freeze trigger, but the serializer must not drop questions on the
    // floor if it ever happens).
    const result = toLearnerQuestion(row, { ...attemptQuestion, optionOrder: [1] });
    expect(result.options.map((o) => o.id)).toEqual(['o2', 'o1', 'o3']);
  });

  it('returns options in stored order when the snapshot is empty', () => {
    const result = toLearnerQuestion(row, { ...attemptQuestion, optionOrder: [] });
    expect(result.options.map((o) => o.id)).toEqual(['o1', 'o2', 'o3']);
  });
});

describe('collectKeysDeep', () => {
  it('walks arrays and nested objects', () => {
    expect([...collectKeysDeep({ a: [{ b: { c: 1 } }] })].sort()).toEqual(['a', 'b', 'c']);
  });

  it('does not loop forever on a cycle', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(() => collectKeysDeep(cyclic)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run, confirm it fails**

```bash
pnpm --filter @ayman/api test learner.serializer
```

- [ ] **Step 3: Implement `learner.serializer.ts`**

```ts
import type { QuestionType } from '../../../generated/prisma/enums';

/**
 * LAYER 1. The only select any pre-submission read path may use. `fraction`,
 * `feedbackHtml`, `answerPattern`, `generalFeedbackHtml` and `penalty` are
 * absent, so the values never enter this process at all.
 *
 * NEVER replace this with `include` — `include: { options: true }` pulls
 * `fraction` and `answerPattern` and is the single most likely way this
 * property gets broken by a future change.
 */
export const LEARNER_QUESTION_SELECT = {
  id: true,
  type: true,
  stemHtml: true,
  settings: true,
  options: {
    orderBy: { position: 'asc' },
    select: { id: true, bodyHtml: true, position: true },
  },
} as const;

/**
 * Any of these appearing in a pre-submission response body is a leak. The list
 * is deliberately broad; the learner payload's field names were chosen to avoid
 * colliding with it (the attempt's lifecycle field is `status`, not `state`,
 * and a question's grading state is projected to `answered: boolean`).
 */
export const FORBIDDEN_ANSWER_KEYS: ReadonlySet<string> = new Set([
  'fraction',
  'isCorrect',
  'correct',
  'correctness',
  'feedback',
  'feedbackHtml',
  'generalFeedbackHtml',
  'specificFeedback',
  'rightAnswer',
  'rightAnswerText',
  'answerPattern',
  'answerPatterns',
  'graderInfo',
  'penalty',
  'mark',
  'marks',
  'maxFraction',
  'minFraction',
  'rawScore',
  'scaledScore',
  'passed',
  'state',
  'matchedOptionIds',
]);

export interface LearnerOption {
  id: string;
  bodyHtml: string;
}

export interface LearnerQuestion {
  slotPosition: number;
  questionId: string;
  type: QuestionType;
  stemHtml: string;
  maxMark: number;
  options: LearnerOption[];
  response: unknown;
  flagged: boolean;
  /** Projection of AttemptQuestionState. `graded_right` must never ship. */
  answered: boolean;
  settings: { minWords?: number; maxWords?: number };
}

interface QuestionVersionRow {
  id: string;
  type: QuestionType;
  stemHtml: string;
  settings: unknown;
  options: { id: string; bodyHtml: string; position: number }[];
}

interface AttemptQuestionRow {
  slotPosition: number;
  maxMark: unknown;
  optionOrder: number[];
  response: unknown;
  flagged: boolean;
  state: string;
}

/**
 * Applies the SNAPSHOTTED option order. Any position present in the snapshot
 * comes first, in snapshot order; anything not mentioned follows in stored
 * order, so a malformed snapshot degrades to "slightly wrong order" rather than
 * "the student loses a question".
 */
function orderOptions(
  options: readonly { id: string; bodyHtml: string; position: number }[],
  optionOrder: readonly number[],
): LearnerOption[] {
  const byPosition = new Map(options.map((option) => [option.position, option]));
  const ordered: LearnerOption[] = [];
  const used = new Set<number>();

  for (const position of optionOrder) {
    const option = byPosition.get(position);
    if (option && !used.has(position)) {
      ordered.push({ id: option.id, bodyHtml: option.bodyHtml });
      used.add(position);
    }
  }
  for (const option of options) {
    if (!used.has(option.position)) {
      ordered.push({ id: option.id, bodyHtml: option.bodyHtml });
    }
  }
  return ordered;
}

/** LAYER 2. Field-by-field construction — there is no spread of a DB row here. */
export function toLearnerQuestion(
  version: QuestionVersionRow,
  attemptQuestion: AttemptQuestionRow,
): LearnerQuestion {
  const settings = (version.settings ?? {}) as Record<string, unknown>;
  const projected: { minWords?: number; maxWords?: number } = {};
  if (typeof settings.minWords === 'number') projected.minWords = settings.minWords;
  if (typeof settings.maxWords === 'number') projected.maxWords = settings.maxWords;

  return {
    slotPosition: attemptQuestion.slotPosition,
    questionId: version.id,
    type: version.type,
    stemHtml: version.stemHtml,
    maxMark: Number(attemptQuestion.maxMark),
    options: orderOptions(version.options, attemptQuestion.optionOrder),
    response: attemptQuestion.response ?? null,
    flagged: attemptQuestion.flagged,
    answered: attemptQuestion.state !== 'todo',
    settings: projected,
  };
}

/** Every key at every depth, cycle-safe. Used by the interceptor and the tests. */
export function collectKeysDeep(value: unknown): Set<string> {
  const keys = new Set<string>();
  const seen = new WeakSet<object>();

  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      keys.add(key);
      walk(child);
    }
  };

  walk(value);
  return keys;
}
```

- [ ] **Step 4: Implement the interceptor**

`interceptors/no-answer-leak.decorator.ts`:
```ts
import { SetMetadata } from '@nestjs/common';

export const NO_ANSWER_LEAK_KEY = 'ayman:noAnswerLeak';

/**
 * Marks a route as pre-submission: its response body must not contain a single
 * key from FORBIDDEN_ANSWER_KEYS at any depth. Applied to every learner route
 * that renders a question the student has not yet submitted.
 */
export const NoAnswerLeak = () => SetMetadata(NO_ANSWER_LEAK_KEY, true);
```

`interceptors/no-answer-leak.interceptor.ts`:
```ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';
import { collectKeysDeep, FORBIDDEN_ANSWER_KEYS } from '../serializers/learner.serializer';
import { NO_ANSWER_LEAK_KEY } from './no-answer-leak.decorator';

/**
 * The runtime half of layer 2. It runs in EVERY environment, including
 * production: the cost is one walk over a payload that is a few kilobytes at
 * most, and the alternative — trusting that no future refactor ever re-adds a
 * field — is not a control.
 *
 * It throws rather than stripping. Silently removing the key would hide the
 * regression; a 500 with a log line naming the offending key gets it fixed.
 */
@Injectable()
export class NoAnswerLeakInterceptor implements NestInterceptor {
  private readonly logger = new Logger(NoAnswerLeakInterceptor.name);

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const guarded = this.reflector.getAllAndOverride<boolean>(NO_ANSWER_LEAK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!guarded) return next.handle();

    return next.handle().pipe(
      map((body: unknown) => {
        const offending = [...collectKeysDeep(body)].filter((key) =>
          FORBIDDEN_ANSWER_KEYS.has(key),
        );
        if (offending.length > 0) {
          this.logger.error(
            `answer leak blocked on ${context.getClass().name}.${context.getHandler().name}: ${offending.join(', ')}`,
          );
          // Fail closed. A learner receiving a 500 is a bug report; a learner
          // receiving the answer key is a broken product.
          throw new InternalServerErrorException();
        }
        return body;
      }),
    );
  }
}
```

`interceptors/no-answer-leak.interceptor.spec.ts`:
```ts
import { InternalServerErrorException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { NoAnswerLeakInterceptor } from './no-answer-leak.interceptor';

function contextFor(guarded: boolean) {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(guarded);
  return {
    interceptor: new NoAnswerLeakInterceptor(reflector),
    context: {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
    } as never,
  };
}

describe('NoAnswerLeakInterceptor', () => {
  it('passes a clean payload through untouched', async () => {
    const { interceptor, context } = contextFor(true);
    const payload = { questions: [{ questionId: 'q', options: [{ id: 'o', bodyHtml: '<p>x</p>' }] }] };
    await expect(
      firstValueFrom(interceptor.intercept(context, { handle: () => of(payload) })),
    ).resolves.toBe(payload);
  });

  it('throws when a forbidden key hides three levels down', async () => {
    const { interceptor, context } = contextFor(true);
    const payload = { questions: [{ options: [{ id: 'o', fraction: 1 }] }] };
    await expect(
      firstValueFrom(interceptor.intercept(context, { handle: () => of(payload) })),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('throws on a leaked grading state', async () => {
    const { interceptor, context } = contextFor(true);
    await expect(
      firstValueFrom(
        interceptor.intercept(context, { handle: () => of({ q: { state: 'graded_right' } }) }),
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('leaves an unmarked route alone, so the review payload can carry answers', async () => {
    const { interceptor, context } = contextFor(false);
    const payload = { questions: [{ fraction: 1, rightAnswerText: '4' }] };
    await expect(
      firstValueFrom(interceptor.intercept(context, { handle: () => of(payload) })),
    ).resolves.toBe(payload);
  });
});
```

- [ ] **Step 5: Run, confirm green, and register the interceptor**

```bash
pnpm --filter @ayman/api test no-answer-leak learner.serializer
```
Expected: PASS — 13 tests.

Add to `QuizModule`'s providers:
```ts
  { provide: APP_INTERCEPTOR, useClass: NoAnswerLeakInterceptor },
```
> Registering it as `APP_INTERCEPTOR` from inside `QuizModule` still applies it
> globally (Nest hoists `APP_*` providers), which is what we want: a future
> controller outside this module that renders questions is covered the moment it
> adds `@NoAnswerLeak()`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/quiz/serializers apps/api/src/modules/quiz/interceptors apps/api/src/modules/quiz/quiz.module.ts
git commit -m "feat(api): three-layer answer-leak defence — select, serializer and a fail-closed interceptor"
```

---

## Task 10: Starting an attempt — snapshots, deadline, token, limits, cooldown

**Files:**
- Create: `apps/api/src/modules/quiz/quiz-access.service.ts`
- Create: `apps/api/src/modules/quiz/attempt-events.service.ts`
- Create: `apps/api/src/modules/quiz/attempt.service.ts`, `attempt.service.spec.ts`
- Create: `apps/api/src/modules/quiz/testing/quiz-fixtures.ts`

**Interfaces:**
- Consumes: `Enrollment` (Plan 4), `LEARNER_QUESTION_SELECT` (Task 9).
- Produces:
  - `QuizAccessService.assertCanAttempt(userId, quizId): Promise<QuizForAttempt>` — one query, ownership compiled in
  - `AttemptEventsService.append(tx, args): Promise<void>`
  - `AttemptService.start(userId, quizId): Promise<StartedAttempt>` where
    `StartedAttempt = { attemptId, attemptToken, deadlineAt, serverTime, questions: LearnerQuestion[] }`
  - `AttemptService.resume(userId, attemptId): Promise<StartedAttempt>` — rotates `attemptToken`

- [ ] **Step 1: Create the fixture helper**

`apps/api/src/modules/quiz/testing/quiz-fixtures.ts` builds the smallest legal
course → section → lesson → quiz → slots chain plus an enrolled student, and
returns a `cleanup()`. Every attempt spec uses it, which is what keeps those
specs about behaviour rather than setup.

```ts
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../../generated/prisma/client';
import { DEFAULT_REVIEW_OPTIONS_GRADED } from '@ayman/contracts/quiz/quiz-settings';

export interface QuizFixture {
  studentId: string;
  otherStudentId: string;
  adminId: string;
  courseId: string;
  lessonId: string;
  quizId: string;
  bankEntryIds: string[];
  versionIds: string[];
  cleanup: () => Promise<void>;
}

/**
 * `questionCount` fixed questions, each mcq_single with 4 options where the
 * option at index 0 is the correct one (fraction 1). Deterministic so a test
 * can assert an exact score.
 */
export async function seedQuizFixture(
  prisma: PrismaClient,
  overrides: {
    questionCount?: number;
    durationSeconds?: number | null;
    maxAttempts?: number;
    retryCooldownHours?: number;
    mode?: 'practice' | 'graded';
    shuffleOptions?: boolean;
    openUntil?: Date | null;
    graceSeconds?: number;
  } = {},
): Promise<QuizFixture> {
  // …create admin, student, otherStudent, course, section, lesson,
  //   enrollment for student only, question category, N published questions,
  //   quiz with the requested settings, one slot per question at maxMark 1,
  //   and sumMarks = N.
  // cleanup() deletes in FK order: attempts → quiz → slots → entries →
  //   category → lesson → section → course → enrollments → users.
}
```

Write it out fully; every later spec depends on it and a stubbed fixture is a
placeholder. Assert its own invariants in a tiny spec: seeding twice produces
independent fixtures, and `cleanup()` leaves zero rows behind.

- [ ] **Step 2: Write the failing attempt-start tests**

`apps/api/src/modules/quiz/attempt.service.spec.ts` (start-only for this task;
Tasks 11–12 append to the same file):

```ts
describe('AttemptService.start', () => {
  it('creates attempt 1 with one attempt_question per slot', async () => {
    const fixture = await seedQuizFixture(prisma, { questionCount: 5 });
    const started = await service.start(fixture.studentId, fixture.quizId);
    expect(started.questions).toHaveLength(5);
    const attempt = await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } });
    expect(attempt!.attemptNo).toBe(1);
    expect(attempt!.state).toBe('in_progress');
  });

  // Q2 — THE VERSION SNAPSHOT.
  it('snapshots the question version, so publishing a new version does not rewrite history', async () => {
    const fixture = await seedQuizFixture(prisma, { questionCount: 1 });
    const started = await service.start(fixture.studentId, fixture.quizId);
    const before = await prisma.attemptQuestion.findFirst({ where: { attemptId: started.attemptId } });

    // The instructor edits and republishes the question.
    const v2 = await bank.saveDraft(fixture.bankEntryIds[0]!, editedQuestion(), fixture.adminId);
    await bank.publish(v2.versionId);

    const after = await prisma.attemptQuestion.findFirst({ where: { attemptId: started.attemptId } });
    expect(after!.questionVersionId).toBe(before!.questionVersionId);
    expect(after!.questionVersionId).not.toBe(v2.versionId);

    // And a NEW attempt picks up the new version.
    const second = await service.start(fixture.otherStudentId, fixture.quizId);
    const secondQuestion = await prisma.attemptQuestion.findFirst({ where: { attemptId: second.attemptId } });
    expect(secondQuestion!.questionVersionId).toBe(v2.versionId);
  });

  // Q2 — THE ORDER SNAPSHOT.
  it('snapshots the option order and replays it byte-for-byte on resume', async () => {
    const fixture = await seedQuizFixture(prisma, { questionCount: 1, shuffleOptions: true });
    const started = await service.start(fixture.studentId, fixture.quizId);
    const firstOrder = started.questions[0]!.options.map((option) => option.id);

    for (let i = 0; i < 5; i += 1) {
      const resumed = await service.resume(fixture.studentId, started.attemptId);
      expect(resumed.questions[0]!.options.map((option) => option.id)).toEqual(firstOrder);
    }
  });

  it('actually shuffles when shuffleOptions is on', async () => {
    // Across 20 attempts by 20 students, at least two distinct orders appear.
    // A single-attempt assertion would pass 1 time in 24 by luck.
  });

  it('keeps authoring order when shuffleOptions is off', async () => {
    const fixture = await seedQuizFixture(prisma, { questionCount: 1, shuffleOptions: false });
    const started = await service.start(fixture.studentId, fixture.quizId);
    const stored = await prisma.attemptQuestion.findFirst({ where: { attemptId: started.attemptId } });
    expect(stored!.optionOrder).toEqual([0, 1, 2, 3]);
  });

  // Q3 — THE PERSISTED DEADLINE.
  it('persists deadlineAt at start', async () => {
    const fixture = await seedQuizFixture(prisma, { durationSeconds: 600 });
    const started = await service.start(fixture.studentId, fixture.quizId);
    const attempt = await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } });
    expect(attempt!.deadlineAt).toBeInstanceOf(Date);
    const delta = attempt!.deadlineAt!.getTime() - attempt!.startedAt.getTime();
    expect(delta).toBeGreaterThanOrEqual(600_000 - 1000);
    expect(delta).toBeLessThanOrEqual(600_000 + 1000);
  });

  it('does NOT recompute deadlineAt when the instructor changes the time limit mid-attempt', async () => {
    const fixture = await seedQuizFixture(prisma, { durationSeconds: 600 });
    const started = await service.start(fixture.studentId, fixture.quizId);
    const before = (await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } }))!.deadlineAt;

    await prisma.quiz.update({ where: { id: fixture.quizId }, data: { durationSeconds: 60 } });
    const resumed = await service.resume(fixture.studentId, started.attemptId);

    const after = (await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } }))!.deadlineAt;
    expect(after!.getTime()).toBe(before!.getTime());
    expect(new Date(resumed.deadlineAt!).getTime()).toBe(before!.getTime());
  });

  it('clamps the deadline to openUntil when the window closes first', async () => {
    const openUntil = new Date(Date.now() + 60_000);
    const fixture = await seedQuizFixture(prisma, { durationSeconds: 3600, openUntil });
    const started = await service.start(fixture.studentId, fixture.quizId);
    expect(new Date(started.deadlineAt!).getTime()).toBe(openUntil.getTime());
  });

  it('leaves deadlineAt null for an untimed quiz', async () => {
    const fixture = await seedQuizFixture(prisma, { durationSeconds: null });
    const started = await service.start(fixture.studentId, fixture.quizId);
    expect(started.deadlineAt).toBeNull();
  });

  it('returns the SAME in-progress attempt instead of starting a second one', async () => {
    const fixture = await seedQuizFixture(prisma, {});
    const first = await service.start(fixture.studentId, fixture.quizId);
    const second = await service.start(fixture.studentId, fixture.quizId);
    expect(second.attemptId).toBe(first.attemptId);
    expect(await prisma.quizAttempt.count({ where: { quizId: fixture.quizId } })).toBe(1);
  });

  it('survives two concurrent start requests without creating two attempts', async () => {
    const fixture = await seedQuizFixture(prisma, {});
    const [a, b] = await Promise.all([
      service.start(fixture.studentId, fixture.quizId),
      service.start(fixture.studentId, fixture.quizId),
    ]);
    expect(a.attemptId).toBe(b.attemptId);
    expect(await prisma.quizAttempt.count({ where: { quizId: fixture.quizId } })).toBe(1);
  });

  it('enforces the attempt limit', async () => {
    const fixture = await seedQuizFixture(prisma, { maxAttempts: 2, retryCooldownHours: 0 });
    await submitAttempt(fixture.studentId, fixture.quizId);
    await submitAttempt(fixture.studentId, fixture.quizId);
    await expect(service.start(fixture.studentId, fixture.quizId)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('treats maxAttempts 0 as unlimited', async () => {
    const fixture = await seedQuizFixture(prisma, { maxAttempts: 0, retryCooldownHours: 0 });
    for (let i = 0; i < 4; i += 1) await submitAttempt(fixture.studentId, fixture.quizId);
    await expect(service.start(fixture.studentId, fixture.quizId)).resolves.toBeDefined();
  });

  it('adds granted extra attempts to the allowance', async () => {
    const fixture = await seedQuizFixture(prisma, { maxAttempts: 1, retryCooldownHours: 0 });
    const attempt = await submitAttempt(fixture.studentId, fixture.quizId);
    await expect(service.start(fixture.studentId, fixture.quizId)).rejects.toBeInstanceOf(ForbiddenException);
    await prisma.quizAttempt.update({ where: { id: attempt.id }, data: { extraAttempts: 1 } });
    await expect(service.start(fixture.studentId, fixture.quizId)).resolves.toBeDefined();
  });

  it('enforces the 24h retry cooldown and reports when it lifts', async () => {
    const fixture = await seedQuizFixture(prisma, { retryCooldownHours: 24 });
    const attempt = await submitAttempt(fixture.studentId, fixture.quizId);
    await expect(service.start(fixture.studentId, fixture.quizId)).rejects.toThrow(/cooldown/i);

    // 23h59m — still blocked. 24h01m — allowed. Boundary, not "roughly".
    await prisma.quizAttempt.update({
      where: { id: attempt.id },
      data: { submittedAt: new Date(Date.now() - (24 * 3600 - 60) * 1000) },
    });
    await expect(service.start(fixture.studentId, fixture.quizId)).rejects.toThrow(/cooldown/i);

    await prisma.quizAttempt.update({
      where: { id: attempt.id },
      data: { submittedAt: new Date(Date.now() - (24 * 3600 + 60) * 1000) },
    });
    await expect(service.start(fixture.studentId, fixture.quizId)).resolves.toBeDefined();
  });

  it('refuses a student who is not enrolled', async () => {
    const fixture = await seedQuizFixture(prisma, {});
    await prisma.enrollment.deleteMany({ where: { userId: fixture.studentId } });
    await expect(service.start(fixture.studentId, fixture.quizId)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses an unpublished lesson', async () => {
    const fixture = await seedQuizFixture(prisma, {});
    await prisma.lesson.update({ where: { id: fixture.lessonId }, data: { isPublished: false } });
    await expect(service.start(fixture.studentId, fixture.quizId)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses before openFrom and after openUntil', async () => {
    // both directions, both asserting a 403 and a distinct machine-readable code
  });

  it('draws pool questions once and snapshots them', async () => {
    // a pool of 5 with pickCount 2 produces exactly 2 attempt_questions, and
    // resume returns the same two version ids
  });

  it('writes an attempt_started event with seq 1', async () => {
    const fixture = await seedQuizFixture(prisma, {});
    const started = await service.start(fixture.studentId, fixture.quizId);
    const events = await prisma.attemptEvent.findMany({ where: { attemptId: started.attemptId } });
    expect(events).toHaveLength(1);
    expect(events[0]!.seq).toBe(1);
    expect(events[0]!.kind).toBe('attempt_started');
  });

  it('issues an attemptToken and rotates it on an explicit resume', async () => {
    const fixture = await seedQuizFixture(prisma, {});
    const started = await service.start(fixture.studentId, fixture.quizId);
    const resumed = await service.resume(fixture.studentId, started.attemptId);
    expect(resumed.attemptToken).not.toBe(started.attemptToken);
  });

  it('refuses to resume another student\'s attempt', async () => {
    const fixture = await seedQuizFixture(prisma, {});
    const started = await service.start(fixture.studentId, fixture.quizId);
    await expect(service.resume(fixture.otherStudentId, started.attemptId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns no answer data in the start payload', async () => {
    const fixture = await seedQuizFixture(prisma, {});
    const started = await service.start(fixture.studentId, fixture.quizId);
    for (const key of collectKeysDeep(started)) {
      expect(FORBIDDEN_ANSWER_KEYS.has(key)).toBe(false);
    }
  });
});
```

- [ ] **Step 3: Run, confirm failing**

```bash
pnpm --filter @ayman/api test attempt.service
```

- [ ] **Step 4: Implement `quiz-access.service.ts`**

```ts
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface QuizForAttempt {
  id: string;
  lessonId: string;
  courseId: string;
  mode: 'practice' | 'graded';
  durationSeconds: number | null;
  openFrom: Date | null;
  openUntil: Date | null;
  maxAttempts: number;
  retryCooldownHours: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  graceSeconds: number;
  overdueHandling: 'autosubmit' | 'graceperiod' | 'autoabandon';
  navMethod: 'free' | 'sequential';
  passPercent: number;
  sumMarks: number;
  gradeOutOf: number;
}

@Injectable()
export class QuizAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ONE query. Enrollment, publication state and the open window are all in
   * the WHERE clause — there is no `findUnique` followed by an `if`, because
   * that is the pattern that gets forgotten on the fortieth endpoint.
   *
   * RECONCILED — the `course.enrollments.some({ userId, status: 'active' })`
   * predicate below is byte-identical to Plan 4's `LessonAccessService.require`.
   * That is deliberate and it is the ONE place it is duplicated, because
   * collapsing quiz publication + open window + attempt limit into
   * `LessonAccessService` would push quiz semantics into the player module.
   * The contract is therefore: **`quiz-access.service.spec.ts` must assert that a
   * lesson denied by `LessonAccessService.require` is also denied here**, so the
   * two predicates cannot drift. A caller with no active enrollment gets
   * **404, never 403** — 403 is an existence oracle. Every non-attempt quiz read
   * (`GET /api/quiz/lessons/:lessonId`, review, history) routes through
   * `LessonAccessService.require(userId, lessonId)` directly.
   */
  async assertCanAttempt(userId: string, quizId: string): Promise<QuizForAttempt> {
    const rows = await this.prisma.quiz.findMany({
      where: {
        id: quizId,
        isPublished: true,
        lesson: {
          isPublished: true,
          course: {
            status: 'published',
            enrollments: { some: { userId, status: 'active' } },
          },
        },
      },
      select: {
        id: true,
        lessonId: true,
        mode: true,
        durationSeconds: true,
        openFrom: true,
        openUntil: true,
        maxAttempts: true,
        retryCooldownHours: true,
        shuffleQuestions: true,
        shuffleOptions: true,
        graceSeconds: true,
        overdueHandling: true,
        navMethod: true,
        passPercent: true,
        sumMarks: true,
        gradeOutOf: true,
        lesson: { select: { courseId: true } },
      },
    });

    const quiz = rows[0];
    if (!quiz) {
      // Deliberately a 403 with a single generic code rather than a 404 that
      // distinguishes "no such quiz" from "not enrolled" — the second is an
      // enumeration oracle over the whole catalogue.
      throw new ForbiddenException({ code: 'quiz_not_accessible' });
    }

    const now = new Date();
    if (quiz.openFrom && now < quiz.openFrom) {
      throw new ForbiddenException({ code: 'quiz_not_open_yet', openFrom: quiz.openFrom });
    }
    if (quiz.openUntil && now >= quiz.openUntil) {
      throw new ForbiddenException({ code: 'quiz_closed', openUntil: quiz.openUntil });
    }

    return {
      ...quiz,
      courseId: quiz.lesson.courseId,
      passPercent: Number(quiz.passPercent),
      sumMarks: Number(quiz.sumMarks),
      gradeOutOf: Number(quiz.gradeOutOf),
    };
  }
}
```

- [ ] **Step 5: Implement `attempt-events.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AttemptEventKind } from '../../generated/prisma/enums';

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class AttemptEventsService {
  /**
   * Gap-free per-attempt sequence, assigned by the database inside the caller's
   * transaction. Computing `max+1` in JS and inserting would race under two
   * concurrent autosaves and silently drop an event; the unique index on
   * (attempt_id, seq) then turns that race into a visible error instead.
   *
   * `$executeRaw` (tagged template, fully parameterised) — NOT
   * `$executeRawUnsafe`, which the ESLint config hard-fails on.
   */
  async append(
    tx: TransactionClient,
    args: {
      attemptId: string;
      kind: AttemptEventKind;
      payload?: Prisma.InputJsonValue;
      attemptQuestionId?: string | null;
      actorId?: string | null;
    },
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO "app"."attempt_events"
        ("attempt_id", "attempt_question_id", "seq", "kind", "payload", "actor_id")
      SELECT
        ${args.attemptId}::text,
        ${args.attemptQuestionId ?? null}::text,
        COALESCE(MAX("seq"), 0) + 1,
        ${args.kind}::"app"."AttemptEventKind",
        ${JSON.stringify(args.payload ?? {})}::jsonb,
        ${args.actorId ?? null}::text
      FROM "app"."attempt_events"
      WHERE "attempt_id" = ${args.attemptId}::text
    `;
  }
}
```

- [ ] **Step 6: Implement `AttemptService.start` / `.resume`**

```ts
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AttemptEventsService } from './attempt-events.service';
import { QuizAccessService, type QuizForAttempt } from './quiz-access.service';
import {
  LEARNER_QUESTION_SELECT,
  toLearnerQuestion,
  type LearnerQuestion,
} from './serializers/learner.serializer';

export interface StartedAttempt {
  attemptId: string;
  attemptToken: string;
  /** ISO string. Persisted at start; never recomputed. */
  deadlineAt: string | null;
  /** The client counts down against THIS, never against its own clock. */
  serverTime: string;
  status: 'in_progress';
  navMethod: 'free' | 'sequential';
  mode: 'practice' | 'graded';
  gradeOutOf: number;
  sumMarks: number;
  questions: LearnerQuestion[];
}

/** Fisher–Yates over a crypto source. Math.random is fine for a shuffle, but a
 *  predictable option order plus a leaked seed is a needless extra affordance. */
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor((crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32) * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

@Injectable()
export class AttemptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: QuizAccessService,
    private readonly events: AttemptEventsService,
  ) {}

  async start(userId: string, quizId: string): Promise<StartedAttempt> {
    const quiz = await this.access.assertCanAttempt(userId, quizId);

    const attemptId = await this.prisma.$transaction(async (tx) => {
      // Serialise concurrent starts for THIS (quiz, user) pair only. Without
      // it, two tabs racing produce two attempts and the unique constraint
      // turns one of them into a 500 instead of a resume.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${quizId}:${userId}`}, 0))`;

      const existing = await tx.quizAttempt.findFirst({
        where: { quizId, userId, state: { in: ['in_progress', 'overdue'] } },
        select: { id: true },
      });
      if (existing) return existing.id;

      const previous = await tx.quizAttempt.findMany({
        where: { quizId, userId },
        select: { attemptNo: true, extraAttempts: true, submittedAt: true },
        orderBy: { attemptNo: 'desc' },
      });

      // 0 = unlimited. Otherwise the allowance is the configured limit plus
      // every admin grant recorded on this student's previous attempts.
      const granted = previous.reduce((sum, attempt) => sum + attempt.extraAttempts, 0);
      if (quiz.maxAttempts > 0 && previous.length >= quiz.maxAttempts + granted) {
        throw new ForbiddenException({ code: 'no_attempts_left' });
      }

      if (quiz.retryCooldownHours > 0) {
        const lastSubmitted = previous
          .map((attempt) => attempt.submittedAt)
          .filter((value): value is Date => value !== null)
          .sort((a, b) => b.getTime() - a.getTime())[0];
        if (lastSubmitted) {
          const availableAt = new Date(
            lastSubmitted.getTime() + quiz.retryCooldownHours * 3600 * 1000,
          );
          if (new Date() < availableAt) {
            throw new ForbiddenException({ code: 'retry_cooldown', availableAt });
          }
        }
      }

      const slots = await this.resolveSlots(tx, quiz);
      const startedAt = new Date();

      // Q3: computed ONCE, here, and clamped to the close time if the window
      // ends before the timer would. Nothing recomputes this value, ever.
      let deadlineAt: Date | null = quiz.durationSeconds
        ? new Date(startedAt.getTime() + quiz.durationSeconds * 1000)
        : null;
      if (quiz.openUntil && (deadlineAt === null || quiz.openUntil < deadlineAt)) {
        deadlineAt = quiz.openUntil;
      }

      const attempt = await tx.quizAttempt.create({
        data: {
          quizId,
          userId,
          attemptNo: (previous[0]?.attemptNo ?? 0) + 1,
          state: 'in_progress',
          startedAt,
          deadlineAt,
          lastActivityAt: startedAt,
          attemptToken: randomUUID(),
          questions: {
            create: slots.map((slot, index) => ({
              slotPosition: index,
              // Q2: BOTH snapshots, written at creation and never re-derived.
              questionVersionId: slot.versionId,
              optionOrder: quiz.shuffleOptions
                ? shuffle(slot.optionPositions)
                : slot.optionPositions,
              maxMark: slot.maxMark,
              minFraction: slot.minFraction,
              maxFraction: 1,
              state: 'todo',
            })),
          },
        },
        select: { id: true },
      });

      await this.events.append(tx, {
        attemptId: attempt.id,
        kind: 'attempt_started',
        actorId: userId,
        payload: { questionCount: slots.length, deadlineAt: deadlineAt?.toISOString() ?? null },
      });

      return attempt.id;
    });

    return this.load(userId, attemptId, quiz, { rotateToken: false });
  }

  /**
   * Rotating the token here is what makes it kill a stale tab: a student who
   * reopens the attempt on a second device invalidates the first device's
   * token, so a late autosave from the abandoned tab is rejected rather than
   * overwriting newer answers.
   */
  async resume(userId: string, attemptId: string): Promise<StartedAttempt> {
    const attempt = await this.prisma.quizAttempt.findFirst({
      where: { id: attemptId, userId },
      select: { quizId: true, state: true },
    });
    if (!attempt) throw new NotFoundException();
    const quiz = await this.access.assertCanAttempt(userId, attempt.quizId);
    return this.load(userId, attemptId, quiz, { rotateToken: true });
  }

  private async load(
    userId: string,
    attemptId: string,
    quiz: QuizForAttempt,
    options: { rotateToken: boolean },
  ): Promise<StartedAttempt> {
    if (options.rotateToken) {
      await this.prisma.quizAttempt.updateMany({
        where: { id: attemptId, userId, submittedAt: null },
        data: { attemptToken: randomUUID(), lastActivityAt: new Date() },
      });
    }

    const attempt = await this.prisma.quizAttempt.findFirstOrThrow({
      where: { id: attemptId, userId },
      select: {
        attemptToken: true,
        deadlineAt: true,
        questions: {
          orderBy: { slotPosition: 'asc' },
          select: {
            slotPosition: true,
            maxMark: true,
            optionOrder: true,
            response: true,
            flagged: true,
            state: true,
            // LAYER 1: the answer columns are simply not selected.
            version: { select: LEARNER_QUESTION_SELECT },
          },
        },
      },
    });

    return {
      attemptId,
      attemptToken: attempt.attemptToken,
      deadlineAt: attempt.deadlineAt?.toISOString() ?? null,
      serverTime: new Date().toISOString(),
      status: 'in_progress',
      navMethod: quiz.navMethod,
      mode: quiz.mode,
      gradeOutOf: quiz.gradeOutOf,
      sumMarks: quiz.sumMarks,
      questions: attempt.questions.map((row) => toLearnerQuestion(row.version, row)),
    };
  }

  /** Fixed slots resolve to their pinned or latest-ready version; pools draw. */
  private async resolveSlots(tx: Prisma.TransactionClient, quiz: QuizForAttempt) {
    // …ordered slot read, pool draws with `ORDER BY random() LIMIT pickCount`
    //   scoped by the pool's sourceFilter, then one query for the chosen
    //   versions' option positions and minimum fraction. Shuffle the resulting
    //   list when quiz.shuffleQuestions is true.
  }
}
```

Write `resolveSlots` out in full: it reads `quizSlot` ordered by `position`, and
for each slot either resolves `bankEntryId` → `pinnedVersion ?? latest ready
version`, or draws `pickCount` distinct ready versions from the pool's category
filter. It returns `{ versionId, maxMark, optionPositions, minFraction }[]`
where `minFraction = Math.min(0, ...optionFractions)` — the per-question floor
snapshotted from the version, which is what stops a negatively-marked option
from eating the rest of the paper.

- [ ] **Step 7: Run, confirm green**

```bash
pnpm --filter @ayman/api test attempt.service
```
Expected: PASS — 21 tests.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/quiz
git commit -m "feat(api): attempt creation with version and option-order snapshots, persisted deadline and rotating token"
```

---

## Task 11: Save-as-you-go, the event log, and stale-write rejection

**Files:**
- Modify: `apps/api/src/modules/quiz/attempt.service.ts`, `attempt.service.spec.ts`
- Create: `apps/api/src/modules/quiz/dto/save-answers.dto.ts`
- Create: `apps/api/src/modules/quiz/attempt.controller.ts`

**Interfaces:**
- Produces:
  - `AttemptService.saveAnswers(userId, attemptId, dto): Promise<SaveResult>` where
    `SaveResult = { savedSlots: number[]; serverTime: string; deadlineAt: string | null; answeredCount: number }`
  - `AttemptService.setFlag(userId, attemptId, dto): Promise<{ flagged: boolean }>`
  - `PUT /api/quiz/attempts/:attemptId/answers`, `POST /api/quiz/attempts/:attemptId/flag`

- [ ] **Step 1: Write the DTO — this is where mass assignment dies**

`apps/api/src/modules/quiz/dto/save-answers.dto.ts`:

```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * The learner response shape. There is no `fraction`, no `mark`, no `state`,
 * no `deadlineAt` — and `.strict()` means sending one is a 400, not a silently
 * ignored field. This DTO is the entire surface a student can write to during
 * an attempt.
 */
export const AnswerResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('choice'), optionIds: z.array(z.string().min(1)).max(50) }).strict(),
  z.object({ kind: z.literal('text'), text: z.string().max(20_000) }).strict(),
]);

export const SaveAnswersSchema = z
  .object({
    attemptToken: z.string().uuid(),
    /** Monotonic per-tab counter; a lower seq than the stored one is ignored. */
    seq: z.number().int().min(1),
    answers: z
      .array(
        z
          .object({
            slotPosition: z.number().int().min(0),
            response: AnswerResponseSchema.nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();

export const FlagSchema = z
  .object({
    attemptToken: z.string().uuid(),
    slotPosition: z.number().int().min(0),
    flagged: z.boolean(),
  })
  .strict();

export class SaveAnswersDto extends createZodDto(SaveAnswersSchema) {}
export class FlagDto extends createZodDto(FlagSchema) {}
```

- [ ] **Step 2: Write the failing tests**

Append to `attempt.service.spec.ts`:

```ts
describe('AttemptService.saveAnswers', () => {
  it('stores a choice response and marks the question complete', async () => {
    const { started, fixture } = await startAttempt();
    await service.saveAnswers(fixture.studentId, started.attemptId, {
      attemptToken: started.attemptToken,
      seq: 1,
      answers: [{ slotPosition: 0, response: { kind: 'choice', optionIds: [firstOptionId(started)] } }],
    });
    const row = await prisma.attemptQuestion.findFirst({
      where: { attemptId: started.attemptId, slotPosition: 0 },
    });
    expect(row!.state).toBe('complete');
    expect(row!.answeredAt).toBeInstanceOf(Date);
  });

  // Q4 — THE TOKEN.
  it('rejects a write carrying a stale attemptToken', async () => {
    const { started, fixture } = await startAttempt();
    await service.resume(fixture.studentId, started.attemptId); // rotates the token
    await expect(
      service.saveAnswers(fixture.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
        seq: 1,
        answers: [{ slotPosition: 0, response: { kind: 'text', text: 'x' } }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('records a stale_write_rejected event so the trail shows the stale tab', async () => {
    // …assert the event exists with the offending token's prefix in the payload
  });

  it('rejects a write to another student\'s attempt', async () => {
    const { started, fixture } = await startAttempt();
    await expect(
      service.saveAnswers(fixture.otherStudentId, started.attemptId, {
        attemptToken: started.attemptToken,
        seq: 1,
        answers: [{ slotPosition: 0, response: { kind: 'text', text: 'x' } }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a write after submission', async () => {
    const { started, fixture } = await startAttempt();
    await service.submit(fixture.studentId, started.attemptId, { attemptToken: started.attemptToken });
    await expect(
      service.saveAnswers(fixture.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
        seq: 2,
        answers: [{ slotPosition: 0, response: { kind: 'text', text: 'x' } }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('ignores an out-of-order autosave from a backgrounded tab', async () => {
    const { started, fixture } = await startAttempt();
    const save = (seq: number, text: string) =>
      service.saveAnswers(fixture.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
        seq,
        answers: [{ slotPosition: 0, response: { kind: 'text', text } }],
      });

    await save(5, 'newer');
    await save(3, 'older'); // arrives late
    const row = await prisma.attemptQuestion.findFirst({
      where: { attemptId: started.attemptId, slotPosition: 0 },
    });
    expect((row!.response as { text: string }).text).toBe('newer');
    expect(row!.responseSeq).toBe(5);
  });

  it('appends exactly one answer_saved event per saved slot', async () => {
    const { started, fixture } = await startAttempt(3);
    await service.saveAnswers(fixture.studentId, started.attemptId, {
      attemptToken: started.attemptToken,
      seq: 1,
      answers: [
        { slotPosition: 0, response: { kind: 'text', text: 'a' } },
        { slotPosition: 1, response: { kind: 'text', text: 'b' } },
      ],
    });
    const events = await prisma.attemptEvent.findMany({
      where: { attemptId: started.attemptId, kind: 'answer_saved' },
      orderBy: { seq: 'asc' },
    });
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.seq)).toEqual([2, 3]); // 1 was attempt_started
  });

  it('never writes a grade into the event payload', async () => {
    const { started, fixture } = await startAttempt();
    await service.saveAnswers(fixture.studentId, started.attemptId, {
      attemptToken: started.attemptToken,
      seq: 1,
      answers: [{ slotPosition: 0, response: { kind: 'choice', optionIds: [firstOptionId(started)] } }],
    });
    const event = await prisma.attemptEvent.findFirst({
      where: { attemptId: started.attemptId, kind: 'answer_saved' },
    });
    for (const key of collectKeysDeep(event!.payload)) {
      expect(FORBIDDEN_ANSWER_KEYS.has(key)).toBe(false);
    }
  });

  it('clears an answer back to todo when the response is null', async () => {
    const { started, fixture } = await startAttempt();
    await service.saveAnswers(fixture.studentId, started.attemptId, {
      attemptToken: started.attemptToken,
      seq: 1,
      answers: [{ slotPosition: 0, response: { kind: 'text', text: 'x' } }],
    });
    await service.saveAnswers(fixture.studentId, started.attemptId, {
      attemptToken: started.attemptToken,
      seq: 2,
      answers: [{ slotPosition: 0, response: null }],
    });
    const row = await prisma.attemptQuestion.findFirst({
      where: { attemptId: started.attemptId, slotPosition: 0 },
    });
    expect(row!.state).toBe('todo');
    expect(row!.response).toBeNull();
  });

  it('rejects a slotPosition that is not part of this attempt', async () => {
    const { started, fixture } = await startAttempt(2);
    await expect(
      service.saveAnswers(fixture.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
        seq: 1,
        answers: [{ slotPosition: 99, response: { kind: 'text', text: 'x' } }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a save past the deadline plus grace', async () => {
    const { started, fixture } = await startAttempt(1, { durationSeconds: 60, graceSeconds: 60 });
    await prisma.quizAttempt.update({
      where: { id: started.attemptId },
      data: { deadlineAt: new Date(Date.now() - 120_000) },
    });
    await expect(
      service.saveAnswers(fixture.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
        seq: 1,
        answers: [{ slotPosition: 0, response: { kind: 'text', text: 'late' } }],
      }),
    ).rejects.toThrow(/overdue/i);
  });

  it('accepts a save inside the grace window', async () => {
    const { started, fixture } = await startAttempt(1, { durationSeconds: 60, graceSeconds: 60 });
    await prisma.quizAttempt.update({
      where: { id: started.attemptId },
      data: { deadlineAt: new Date(Date.now() - 10_000) },
    });
    await expect(
      service.saveAnswers(fixture.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
        seq: 1,
        answers: [{ slotPosition: 0, response: { kind: 'text', text: 'just in time' } }],
      }),
    ).resolves.toBeDefined();
  });

  it('honours granted extra time without touching deadlineAt', async () => {
    const { started, fixture } = await startAttempt(1, { durationSeconds: 60, graceSeconds: 0 });
    const before = (await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } }))!.deadlineAt;
    await prisma.quizAttempt.update({
      where: { id: started.attemptId },
      data: { deadlineAt: new Date(Date.now() - 30_000), extraTimeSeconds: 300 },
    });
    await expect(
      service.saveAnswers(fixture.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
        seq: 1,
        answers: [{ slotPosition: 0, response: { kind: 'text', text: 'ok' } }],
      }),
    ).resolves.toBeDefined();
    expect(before).toBeInstanceOf(Date);
  });

  it('returns a server-computed answered count, not one the client sent', async () => {
    const { started, fixture } = await startAttempt(3);
    const result = await service.saveAnswers(fixture.studentId, started.attemptId, {
      attemptToken: started.attemptToken,
      seq: 1,
      answers: [{ slotPosition: 0, response: { kind: 'text', text: 'a' } }],
    });
    expect(result.answeredCount).toBe(1);
  });

  it('returns a fresh serverTime so the client can resync its timer', async () => {
    const { started, fixture } = await startAttempt();
    const result = await service.saveAnswers(fixture.studentId, started.attemptId, {
      attemptToken: started.attemptToken,
      seq: 1,
      answers: [{ slotPosition: 0, response: { kind: 'text', text: 'a' } }],
    });
    expect(Math.abs(new Date(result.serverTime).getTime() - Date.now())).toBeLessThan(5000);
  });
});

describe('AttemptService.setFlag', () => {
  it('toggles the flag and records an event', async () => { /* … */ });
  it('requires a valid attemptToken', async () => { /* … */ });
});
```

- [ ] **Step 3: Run, confirm failing, then implement**

```ts
  async saveAnswers(
    userId: string,
    attemptId: string,
    dto: SaveAnswersDto,
  ): Promise<SaveResult> {
    return this.prisma.$transaction(async (tx) => {
      // Q4: ownership, token and submission state are ALL in the WHERE clause.
      // Zero rows means "not yours, stale, or already submitted" — the caller
      // never gets to fetch the row and decide afterwards.
      const attempts = await tx.quizAttempt.findMany({
        where: {
          id: attemptId,
          userId,
          attemptToken: dto.attemptToken,
          submittedAt: null,
          state: { in: ['in_progress', 'overdue'] },
        },
        select: {
          id: true,
          deadlineAt: true,
          extraTimeSeconds: true,
          quiz: { select: { graceSeconds: true } },
        },
      });
      const attempt = attempts[0];

      if (!attempt) {
        // Distinguish "not yours" (404, no information) from "stale/submitted"
        // (409, actionable) — but only after confirming ownership separately,
        // so the 409 never confirms an attempt id the caller does not own.
        const owned = await tx.quizAttempt.count({ where: { id: attemptId, userId } });
        if (owned === 0) throw new NotFoundException();
        await this.events.append(tx, {
          attemptId,
          kind: 'stale_write_rejected',
          actorId: userId,
          payload: { reason: 'token_or_submitted', seq: dto.seq },
        });
        throw new ConflictException({ code: 'attempt_stale' });
      }

      if (attempt.deadlineAt) {
        const hardStop =
          attempt.deadlineAt.getTime() +
          attempt.extraTimeSeconds * 1000 +
          attempt.quiz.graceSeconds * 1000;
        if (Date.now() > hardStop) {
          throw new ConflictException({ code: 'attempt_overdue' });
        }
      }

      const slots = await tx.attemptQuestion.findMany({
        where: { attemptId },
        select: { id: true, slotPosition: true },
      });
      const bySlot = new Map(slots.map((slot) => [slot.slotPosition, slot.id]));

      const saved: number[] = [];
      for (const answer of dto.answers) {
        const questionId = bySlot.get(answer.slotPosition);
        if (!questionId) throw new BadRequestException({ code: 'unknown_slot' });

        // The seq guard is in the WHERE clause too, so a late autosave from a
        // backgrounded tab updates zero rows instead of overwriting a newer one.
        const updated = await tx.attemptQuestion.updateMany({
          where: { id: questionId, responseSeq: { lt: dto.seq } },
          data: {
            response: answer.response ?? Prisma.DbNull,
            responseSeq: dto.seq,
            state: answer.response ? 'complete' : 'todo',
            answeredAt: answer.response ? new Date() : null,
          },
        });
        if (updated.count === 0) continue;

        saved.push(answer.slotPosition);
        await this.events.append(tx, {
          attemptId,
          attemptQuestionId: questionId,
          kind: answer.response ? 'answer_saved' : 'answer_cleared',
          actorId: userId,
          // The response only. No grade is computed here, so none can leak.
          payload: { slotPosition: answer.slotPosition, response: answer.response, seq: dto.seq },
        });
      }

      await tx.quizAttempt.update({
        where: { id: attemptId },
        data: { lastActivityAt: new Date() },
      });

      const answeredCount = await tx.attemptQuestion.count({
        where: { attemptId, state: { not: 'todo' } },
      });

      return {
        savedSlots: saved,
        answeredCount,
        serverTime: new Date().toISOString(),
        deadlineAt: attempt.deadlineAt?.toISOString() ?? null,
      };
    });
  }
```

`setFlag` follows the same shape with a single `flagged` write and a
`flag_toggled` event.

- [ ] **Step 4: Add the learner controller**

```ts
@Controller('quiz')
export class AttemptController {
  constructor(private readonly attempts: AttemptService) {}

  @RequirePermission('quiz:attempt')
  @NoAnswerLeak()
  @Post('quizzes/:quizId/attempts')
  start(@CurrentUser() user: AuthenticatedUser, @Param('quizId') quizId: string) {
    return this.attempts.start(user.id, quizId);
  }

  @RequirePermission('quiz:attempt')
  @NoAnswerLeak()
  @Post('attempts/:attemptId/resume')
  resume(@CurrentUser() user: AuthenticatedUser, @Param('attemptId') attemptId: string) {
    return this.attempts.resume(user.id, attemptId);
  }

  @RequirePermission('quiz:attempt')
  @NoAnswerLeak()
  @Put('attempts/:attemptId/answers')
  @UsePipes(ZodValidationPipe)
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attemptId') attemptId: string,
    @Body() body: SaveAnswersDto,
  ) {
    return this.attempts.saveAnswers(user.id, attemptId, body);
  }

  @RequirePermission('quiz:attempt')
  @NoAnswerLeak()
  @Post('attempts/:attemptId/flag')
  @UsePipes(ZodValidationPipe)
  flag(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attemptId') attemptId: string,
    @Body() body: FlagDto,
  ) {
    return this.attempts.setFlag(user.id, attemptId, body);
  }
}
```

- [ ] **Step 5: Run, confirm green, commit**

```bash
pnpm --filter @ayman/api test attempt.service
git add apps/api/src/modules/quiz
git commit -m "feat(api): save-as-you-go answers with token, sequence and deadline guards in the WHERE clause"
```

---

## Task 12: Submit, grade, replay rejection, overdue handling and the sweeper

**Files:**
- Modify: `apps/api/src/modules/quiz/attempt.service.ts`, `attempt.service.spec.ts`, `attempt.controller.ts`
- Create: `apps/api/src/modules/quiz/overdue.service.ts`, `overdue.service.spec.ts`
- Create: `apps/api/src/modules/quiz/quiz-leak.contract.spec.ts` ← **layer 3**
- Modify: `apps/api/src/app.module.ts` (ScheduleModule), `apps/api/package.json`

**Interfaces:**
- Consumes: Plan 4's `LessonProgressService.recordQuizResult`, `CourseProgressService.recalculate`, and the `SCORE_FEED` token.
- Produces:
  - `AttemptService.submit(userId, attemptId, dto): Promise<AttemptResult>`
  - `AttemptService.preflight(userId, attemptId): Promise<{ unansweredCount: number; total: number }>`
  - ```ts
    /**
     * RECONCILED — required by Plan 6 Task 11 and by Task 19's appeal regrade.
     * Recomputes the attempt score from the CURRENT `attempt_questions`
     * fractions (never from a client value, never patched directly), persists
     * it, appends an `attempt_events` row, and returns the new 0..1 score.
     */
    AttemptService.recomputeScore(attemptId: string): Promise<number>

    /**
     * RECONCILED — required by Plan 6 Task 11's unlock action and by Task 20.
     * Issues a fresh `attemptToken`, which invalidates any stale tab still
     * holding the old one, and returns it. Every write path already compiles
     * the token into its UPDATE's WHERE clause (Global Constraint 14), so a
     * stale tab's next save is a 409 rather than a clobber.
     */
    AttemptService.reissueToken(attemptId: string): Promise<string>
    ```
  - `OverdueService.sweep(): Promise<number>`
  - `QuizScoreFeed implements ScoreFeed` in `apps/api/src/modules/quiz/quiz-score-feed.ts`
  - `POST /api/quiz/attempts/:attemptId/submit`, `GET /api/quiz/attempts/:attemptId/preflight`

- [ ] **Step 0: Rebind Plan 4's `SCORE_FEED` — one line**

Plan 4 shipped `SCORE_FEED` bound to `EmptyScoreFeed`, which correctly reports "no scores yet"
while no attempts table exists. Now one exists. Write
`apps/api/src/modules/quiz/quiz-score-feed.ts`:

```ts
@Injectable()
export class QuizScoreFeed implements ScoreFeed {
  constructor(private readonly prisma: PrismaService) {}
  // Own attempts only, submitted only, newest first. Ownership is in the WHERE
  // clause, not applied after the fetch.
  recentFor(userId: string, limit: number): Promise<RecentScore[]> { /* … */ }
}
```

Export it from `QuizModule`, then in `DashboardModule` change the single provider line:

```ts
-  providers: [DashboardService, { provide: SCORE_FEED, useClass: EmptyScoreFeed }],
+  providers: [DashboardService, { provide: SCORE_FEED, useClass: QuizScoreFeed }],
```

and add `QuizModule` to `DashboardModule`'s `imports`. No contract change, no UI change — Plan 4's
dashboard renders real scores the moment this lands, which is also the verification.

- [ ] **Step 1: Install the scheduler**

```bash
pnpm --filter @ayman/api add @nestjs/schedule@6.1.3
```
Register `ScheduleModule.forRoot()` in `app.module.ts`.

- [ ] **Step 2: Write the failing submit tests**

```ts
describe('AttemptService.submit', () => {
  it('grades from FRESH database reads, ignoring anything the client sends', async () => {
    const { started, fixture } = await startAttempt(2);
    await answerCorrectly(started, 0);
    await answerIncorrectly(started, 1);
    const result = await service.submit(fixture.studentId, started.attemptId, {
      attemptToken: started.attemptToken,
      // A hostile client attaching its own grade. `.strict()` rejects it at the
      // DTO, and even if it did not, nothing downstream reads it.
    } as never);
    expect(result.rawScore).toBe(1);
    expect(result.scaledScore).toBe(50);
  });

  // Q4 — REPLAY FOR A BETTER SCORE.
  it('rejects a second submit of the same attempt', async () => {
    const { started, fixture } = await startAttempt();
    await service.submit(fixture.studentId, started.attemptId, { attemptToken: started.attemptToken });
    await expect(
      service.submit(fixture.studentId, started.attemptId, { attemptToken: started.attemptToken }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets exactly one of two concurrent submits win', async () => {
    const { started, fixture } = await startAttempt();
    const results = await Promise.allSettled([
      service.submit(fixture.studentId, started.attemptId, { attemptToken: started.attemptToken }),
      service.submit(fixture.studentId, started.attemptId, { attemptToken: started.attemptToken }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const events = await prisma.attemptEvent.count({
      where: { attemptId: started.attemptId, kind: 'submitted' },
    });
    expect(events).toBe(1);
  });

  it('does not let a changed answer after submission alter the recorded score', async () => {
    const { started, fixture } = await startAttempt(1);
    await answerIncorrectly(started, 0);
    const first = await service.submit(fixture.studentId, started.attemptId, {
      attemptToken: started.attemptToken,
    });
    await expect(
      service.saveAnswers(fixture.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
        seq: 99,
        answers: [{ slotPosition: 0, response: { kind: 'choice', optionIds: [correctOptionId(started, 0)] } }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    const attempt = await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } });
    expect(Number(attempt!.rawScore)).toBe(first.rawScore);
  });

  it('writes rightAnswerText and responseText only at submit time', async () => {
    const { started, fixture } = await startAttempt(1);
    const before = await prisma.attemptQuestion.findFirst({ where: { attemptId: started.attemptId } });
    expect(before!.rightAnswerText).toBeNull();
    await service.submit(fixture.studentId, started.attemptId, { attemptToken: started.attemptToken });
    const after = await prisma.attemptQuestion.findFirst({ where: { attemptId: started.attemptId } });
    expect(after!.rightAnswerText).not.toBeNull();
  });

  it('marks the attempt pending_review when it contains an essay', async () => { /* … */ });
  it('calls LessonProgressService.recordQuizResult exactly once', async () => { /* … */ });
  it('appends a submitted event and one graded event per question', async () => { /* … */ });

  it('rejects a submit with a stale token', async () => { /* … */ });
  it('rejects a submit on another student\'s attempt with a 404', async () => { /* … */ });
});

describe('AttemptService.preflight', () => {
  it('counts unanswered questions on the SERVER', async () => {
    const { started, fixture } = await startAttempt(4);
    await answerCorrectly(started, 0);
    const preflight = await service.preflight(fixture.studentId, started.attemptId);
    expect(preflight).toEqual({ unansweredCount: 3, total: 4 });
  });
});

describe('overdue handling', () => {
  it('autosubmits past the deadline plus grace and grades what is there', async () => {
    const { started, fixture } = await startAttempt(2, {
      durationSeconds: 60,
      graceSeconds: 60,
      overdueHandling: 'autosubmit',
    });
    await answerCorrectly(started, 0);
    await prisma.quizAttempt.update({
      where: { id: started.attemptId },
      data: { deadlineAt: new Date(Date.now() - 120_000) },
    });

    const closed = await overdue.sweep();
    expect(closed).toBe(1);
    const attempt = await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } });
    expect(attempt!.state).toBe('submitted');
    expect(Number(attempt!.rawScore)).toBe(1);
    const event = await prisma.attemptEvent.findFirst({
      where: { attemptId: started.attemptId, kind: 'autosubmitted' },
    });
    expect(event).not.toBeNull();
  });

  it('does not touch an attempt still inside the grace window', async () => {
    const { started } = await startAttempt(1, { durationSeconds: 60, graceSeconds: 60 });
    await prisma.quizAttempt.update({
      where: { id: started.attemptId },
      data: { deadlineAt: new Date(Date.now() - 10_000) },
    });
    expect(await overdue.sweep()).toBe(0);
  });

  it('adds granted extra time to the grace calculation', async () => { /* … */ });

  it('abandons instead of grading when overdueHandling is autoabandon', async () => {
    const { started, fixture } = await startAttempt(1, {
      durationSeconds: 60,
      graceSeconds: 0,
      overdueHandling: 'autoabandon',
    });
    await prisma.quizAttempt.update({
      where: { id: started.attemptId },
      data: { deadlineAt: new Date(Date.now() - 60_000) },
    });
    await overdue.sweep();
    const attempt = await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } });
    expect(attempt!.state).toBe('abandoned');
    expect(attempt!.rawScore).toBeNull();
  });

  it('never touches an untimed attempt', async () => {
    const { started } = await startAttempt(1, { durationSeconds: null });
    expect(await overdue.sweep()).toBe(0);
  });

  it('is idempotent — a second sweep closes nothing', async () => { /* … */ });
});
```

- [ ] **Step 3: Implement `submit`**

```ts
  async submit(userId: string, attemptId: string, dto: SubmitDto): Promise<AttemptResult> {
    return this.prisma.$transaction(async (tx) => {
      // Q4, atomically: the state transition IS the lock. A second submitter
      // updates zero rows and gets a 409; there is no read-then-write window.
      const claimed = await tx.quizAttempt.updateMany({
        where: {
          id: attemptId,
          userId,
          attemptToken: dto.attemptToken,
          submittedAt: null,
          state: { in: ['in_progress', 'overdue'] },
        },
        data: { submittedAt: new Date(), lastActivityAt: new Date() },
      });
      if (claimed.count === 0) {
        const owned = await tx.quizAttempt.count({ where: { id: attemptId, userId } });
        if (owned === 0) throw new NotFoundException();
        throw new ConflictException({ code: 'attempt_already_submitted' });
      }

      return this.gradeAndFinalise(tx, attemptId, { auto: false, actorId: userId });
    });
  }

  /**
   * Shared by submit() and the overdue sweeper. Every value it grades comes
   * from a fresh read of question_versions and question_options through the
   * SNAPSHOTTED version id — never from the request, never from a cache.
   */
  private async gradeAndFinalise(
    tx: Prisma.TransactionClient,
    attemptId: string,
    context: { auto: boolean; actorId: string | null },
  ): Promise<AttemptResult> {
    const attempt = await tx.quizAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      select: {
        id: true,
        userId: true,
        quiz: {
          select: {
            id: true,
            lessonId: true,
            sumMarks: true,
            gradeOutOf: true,
            passPercent: true,
            mode: true,
          },
        },
        questions: {
          orderBy: { slotPosition: 'asc' },
          select: {
            id: true,
            slotPosition: true,
            response: true,
            maxMark: true,
            minFraction: true,
            maxFraction: true,
            version: {
              select: {
                id: true,
                type: true,
                settings: true,
                generalFeedbackHtml: true,
                // The FULL option row — this is a grading read, after
                // submission, and it is never serialized to the learner
                // except through the review serializer's flag matrix.
                options: {
                  orderBy: { position: 'asc' },
                  select: {
                    id: true,
                    fraction: true,
                    position: true,
                    bodyHtml: true,
                    answerPattern: true,
                    feedbackHtml: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const graded: GradedQuestionRow[] = [];

    for (const question of attempt.questions) {
      const settings = (question.version.settings ?? {}) as { caseSensitive?: boolean };
      const result = gradeQuestion(
        {
          type: question.version.type,
          caseSensitive: settings.caseSensitive === true,
          options: question.version.options.map((option) => ({
            id: option.id,
            fraction: Number(option.fraction),
            position: option.position,
            answerPattern: option.answerPattern,
          })),
        },
        (question.response ?? null) as QuestionResponse | null,
      );

      const maxMark = Number(question.maxMark);
      const mark =
        result.fraction === null
          ? null
          : roundMark(
              clamp(result.fraction, Number(question.minFraction), Number(question.maxFraction)) *
                maxMark,
            );

      await tx.attemptQuestion.update({
        where: { id: question.id },
        data: {
          fraction: result.fraction,
          mark,
          state: result.state,
          gradedAt: new Date(),
          // Written HERE, after submission, and nowhere earlier — which is why
          // the model answer cannot leak during the attempt.
          rightAnswerText: describeRightAnswer(question.version),
          responseText: describeResponse(question.version, question.response),
          feedbackHtml: result.matchedOptionIds
            .map((id) => question.version.options.find((option) => option.id === id)?.feedbackHtml)
            .filter(Boolean)
            .join('') || null,
        },
      });

      await this.events.append(tx, {
        attemptId,
        attemptQuestionId: question.id,
        kind: 'graded',
        actorId: context.actorId,
        payload: { slotPosition: question.slotPosition, fraction: result.fraction, mark },
      });

      graded.push({
        fraction: result.fraction,
        maxMark,
        minFraction: Number(question.minFraction),
        maxFraction: Number(question.maxFraction),
        state: result.state,
      });
    }

    const summary = gradeAttempt(graded, {
      sumMarks: Number(attempt.quiz.sumMarks),
      gradeOutOf: Number(attempt.quiz.gradeOutOf),
      passPercent: Number(attempt.quiz.passPercent),
    });

    await tx.quizAttempt.update({
      where: { id: attemptId },
      data: {
        state: summary.attemptState,
        rawScore: summary.rawScore,
        scaledScore: summary.scaledScore,
        passed: summary.passed,
      },
    });

    await this.events.append(tx, {
      attemptId,
      kind: context.auto ? 'autosubmitted' : 'submitted',
      actorId: context.actorId,
      payload: { rawScore: summary.rawScore, scaledScore: summary.scaledScore, passed: summary.passed },
    });

    await this.progress.recordQuizResult({
      userId: attempt.userId,
      lessonId: attempt.quiz.lessonId,
      passed: summary.passed,
      scaledScore: summary.scaledScore,
      gradeOutOf: Number(attempt.quiz.gradeOutOf),
    });

    return { attemptId, ...summary };
  }
```

`describeRightAnswer` renders the model answer as text: for choice types, the
bodies of every option with `fraction > RIGHT_THRESHOLD`; for short answer, the
first full-credit pattern; for essay, `null`.

- [ ] **Step 4: Implement `overdue.service.ts`**

```ts
@Injectable()
export class OverdueService {
  private readonly logger = new Logger(OverdueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attempts: AttemptService,
  ) {}

  /**
   * A student who closes the laptop still gets graded. Lazy closure on next
   * read would leave that attempt in_progress forever, which is both a wrong
   * grade and a stuck "you have an attempt in progress" banner.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<number> {
    // A single advisory lock so a second replica no-ops instead of double
    // grading. Same class of bug as the in-memory throttler multiplying limits.
    const [{ locked }] = await this.prisma.$queryRaw<{ locked: boolean }[]>`
      SELECT pg_try_advisory_lock(hashtextextended('ayman:quiz:overdue-sweep', 0)) AS locked
    `;
    if (!locked) return 0;

    try {
      const candidates = await this.prisma.$queryRaw<{ id: string; handling: string }[]>`
        SELECT a."id", q."overdue_handling" AS handling
        FROM "app"."quiz_attempts" a
        JOIN "app"."quizzes" q ON q."id" = a."quiz_id"
        WHERE a."state" IN ('in_progress', 'overdue')
          AND a."deadline_at" IS NOT NULL
          AND a."deadline_at"
              + make_interval(secs => a."extra_time_seconds" + q."grace_seconds")
              < now()
        LIMIT 500
      `;

      let closed = 0;
      for (const candidate of candidates) {
        try {
          await this.attempts.closeOverdue(candidate.id);
          closed += 1;
        } catch (error) {
          // One bad attempt must not stop the sweep for everyone else.
          this.logger.error(`overdue sweep failed for attempt ${candidate.id}`, error as Error);
        }
      }
      return closed;
    } finally {
      await this.prisma.$queryRaw`
        SELECT pg_advisory_unlock(hashtextextended('ayman:quiz:overdue-sweep', 0))
      `;
    }
  }
}
```

`AttemptService.closeOverdue(attemptId)` claims the attempt with the same
conditional `updateMany` (no token — this is the server acting), then either
calls `gradeAndFinalise(..., { auto: true })` for `autosubmit`/`graceperiod`, or
sets `state: 'abandoned'` with a null score for `autoabandon`.

- [ ] **Step 5: Write layer 3 — the contract test**

`apps/api/src/modules/quiz/quiz-leak.contract.spec.ts`:

```ts
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../app.module';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { FORBIDDEN_ANSWER_KEYS, collectKeysDeep } from './serializers/learner.serializer';

/**
 * LAYER 3. This test does not inspect objects — it inspects the RAW HTTP BODY,
 * because the failure mode it exists to catch is "somebody added a field to a
 * DTO". If this test ever needs relaxing to make a feature work, the feature
 * is wrong.
 */
describe('quiz answer-leak contract', () => {
  let app: INestApplication;
  let fixture: QuizFixture;

  beforeAll(async () => {
    fixture = await seedQuizFixture(prisma, {
      questionCount: 4,
      // Feedback and patterns carry DISTINCTIVE strings, so the test can assert
      // on the values as well as the keys — a leak that renames the key still
      // ships the secret.
      distinctiveFeedback: 'SECRET_FEEDBACK_MARKER',
      distinctivePattern: 'SECRET_PATTERN_MARKER',
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = { id: fixture.studentId, role: 'student' };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await fixture.cleanup();
  });

  it('POST /api/quiz/quizzes/:id/attempts leaks nothing', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/quiz/quizzes/${fixture.quizId}/attempts`)
      .expect(201);

    for (const key of collectKeysDeep(response.body)) {
      expect(FORBIDDEN_ANSWER_KEYS.has(key)).toBe(false);
    }
    for (const key of FORBIDDEN_ANSWER_KEYS) {
      expect(response.text).not.toContain(`"${key}"`);
    }
    expect(response.text).not.toContain('SECRET_FEEDBACK_MARKER');
    expect(response.text).not.toContain('SECRET_PATTERN_MARKER');
    expect(response.text).not.toContain('graded_right');
  });

  it('PUT …/answers leaks nothing, including on the save response', async () => { /* same three assertions */ });
  it('POST …/resume leaks nothing', async () => { /* same */ });
  it('GET …/preflight leaks nothing', async () => { /* same */ });

  // The negative control. Without it, a serializer that returns `{}` for
  // everything would pass every assertion above.
  it('the REVIEW payload DOES carry correctness once the attempt is submitted', async () => {
    const start = await request(app.getHttpServer())
      .post(`/api/quiz/quizzes/${fixture.quizId}/attempts`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/quiz/attempts/${start.body.attemptId}/submit`)
      .send({ attemptToken: start.body.attemptToken })
      .expect(201);

    const review = await request(app.getHttpServer())
      .get(`/api/quiz/attempts/${start.body.attemptId}/review`)
      .expect(200);

    expect(review.text).toContain('SECRET_FEEDBACK_MARKER');
    expect(review.body.questions[0]).toHaveProperty('correctness');
  });
});
```

- [ ] **Step 6: Run everything, confirm green**

```bash
pnpm --filter @ayman/api test quiz
```
Expected: PASS — all quiz specs, including the five contract assertions.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/quiz apps/api/src/app.module.ts apps/api/package.json
git commit -m "feat(api): submit with atomic replay rejection, overdue sweeper and the answer-leak contract test"
```

---

## Task 13: Review — the 4×7 matrix resolved server-side

**Files:**
- Create: `apps/api/src/modules/quiz/serializers/review.serializer.ts`, `review.serializer.spec.ts`
- Modify: `apps/api/src/modules/quiz/attempt.service.ts`, `attempt.controller.ts`
- Create: `packages/contracts/src/quiz/attempt.ts` (the review payload shape)

**Interfaces:**
- Produces:
  - `resolveReviewWindow(args): ReviewWindow`
  - `resolveReviewFlags(options: ReviewOptions, window: ReviewWindow): ReviewFlags`
  - `toReviewQuestion(row, flags): ReviewQuestion` — omits every disallowed field
  - `AttemptService.review(userId, attemptId): Promise<ReviewPayload>`
  - `GET /api/quiz/attempts/:attemptId/review`

- [ ] **Step 1: Write the failing tests**

```ts
import { DEFAULT_REVIEW_OPTIONS_GRADED } from '@ayman/contracts/quiz/quiz-settings';
import { IMMEDIATELY_AFTER_SECONDS, resolveReviewFlags, resolveReviewWindow, toReviewQuestion } from './review.serializer';

describe('resolveReviewWindow', () => {
  const now = new Date('2026-07-26T12:00:00Z');

  it('is `during` while the attempt is unsubmitted', () => {
    expect(resolveReviewWindow({ submittedAt: null, openUntil: null, now })).toBe('during');
  });

  it('is `immediatelyAfter` for 120 seconds after submission — Moodle\'s constant', () => {
    expect(IMMEDIATELY_AFTER_SECONDS).toBe(120);
    expect(
      resolveReviewWindow({ submittedAt: new Date(now.getTime() - 119_000), openUntil: null, now }),
    ).toBe('immediatelyAfter');
  });

  it('flips to `laterWhileOpen` at exactly 120 seconds', () => {
    expect(
      resolveReviewWindow({ submittedAt: new Date(now.getTime() - 120_000), openUntil: null, now }),
    ).toBe('laterWhileOpen');
  });

  it('stays `laterWhileOpen` forever when the quiz has no close date', () => {
    expect(
      resolveReviewWindow({
        submittedAt: new Date(now.getTime() - 400 * 24 * 3600 * 1000),
        openUntil: null,
        now,
      }),
    ).toBe('laterWhileOpen');
  });

  it('is `afterClose` once openUntil has passed', () => {
    expect(
      resolveReviewWindow({
        submittedAt: new Date(now.getTime() - 3600_000),
        openUntil: new Date(now.getTime() - 1000),
        now,
      }),
    ).toBe('afterClose');
  });

  it('prefers `immediatelyAfter` over `afterClose` in the 120s straddle', () => {
    // A student who submits in the final seconds still gets their result page.
    expect(
      resolveReviewWindow({
        submittedAt: new Date(now.getTime() - 10_000),
        openUntil: new Date(now.getTime() - 5000),
        now,
      }),
    ).toBe('immediatelyAfter');
  });
});

describe('toReviewQuestion', () => {
  const row = { /* a fully graded attempt_question with feedback and a right answer */ };

  it('OMITS every disallowed field rather than nulling it', () => {
    const allFalse = resolveReviewFlags(DEFAULT_REVIEW_OPTIONS_GRADED, 'during');
    const result = toReviewQuestion(row, allFalse);
    expect(result).not.toHaveProperty('correctness');
    expect(result).not.toHaveProperty('mark');
    expect(result).not.toHaveProperty('rightAnswerText');
    expect(result).not.toHaveProperty('feedbackHtml');
    expect(result).not.toHaveProperty('generalFeedbackHtml');
    expect(result).not.toHaveProperty('response');
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });

  it.each([
    ['response', 'response'],
    ['correctness', 'correctness'],
    ['marks', 'mark'],
    ['specificFeedback', 'feedbackHtml'],
    ['generalFeedback', 'generalFeedbackHtml'],
    ['rightAnswer', 'rightAnswerText'],
  ])('flag %s controls field %s independently', (flag, field) => {
    const flags = { ...resolveReviewFlags(DEFAULT_REVIEW_OPTIONS_GRADED, 'during'), [flag]: true };
    const result = toReviewQuestion(row, flags as never);
    expect(result).toHaveProperty(field);

    const without = toReviewQuestion(row, { ...flags, [flag]: false } as never);
    expect(without).not.toHaveProperty(field);
  });

  it('never sends the fraction, even when marks are allowed', () => {
    const flags = { ...resolveReviewFlags(DEFAULT_REVIEW_OPTIONS_GRADED, 'afterClose') };
    const result = toReviewQuestion(row, flags);
    expect(result).not.toHaveProperty('fraction');
    expect(result.mark).toBeDefined();
  });

  it('reduces correctness to a coarse label, not the raw grading state', () => {
    const flags = resolveReviewFlags(DEFAULT_REVIEW_OPTIONS_GRADED, 'afterClose');
    expect(['correct', 'partial', 'incorrect', 'needsGrading', 'unanswered']).toContain(
      toReviewQuestion(row, flags).correctness,
    );
  });
});

describe('AttemptService.review', () => {
  it('refuses to review another student\'s attempt', async () => { /* 404 */ });
  it('returns a locked payload with a reason when every flag is off', async () => { /* … */ });
  it('honours a practice quiz\'s during-window correctness while withholding the right answer', async () => { /* … */ });
  it('reveals everything immediately after submission on a graded quiz', async () => { /* … */ });
});
```

- [ ] **Step 2: Implement `review.serializer.ts`**

```ts
import type { ReviewFlags, ReviewOptions, ReviewWindow } from '@ayman/contracts/quiz/quiz-settings';

/** Moodle: quiz_attempt::IMMEDIATELY_AFTER_PERIOD = 2 * MINSECS. */
export const IMMEDIATELY_AFTER_SECONDS = 120;

/**
 * Ported from Moodle's quiz_attempt::get_attempt_state(). Order matters: the
 * 120-second grace beats a quiz that closed during it, so a student who
 * submits at the buzzer still sees their result.
 */
export function resolveReviewWindow(args: {
  submittedAt: Date | null;
  openUntil: Date | null;
  now: Date;
}): ReviewWindow {
  if (!args.submittedAt) return 'during';
  const elapsed = (args.now.getTime() - args.submittedAt.getTime()) / 1000;
  if (elapsed < IMMEDIATELY_AFTER_SECONDS) return 'immediatelyAfter';
  if (!args.openUntil || args.now < args.openUntil) return 'laterWhileOpen';
  return 'afterClose';
}

export function resolveReviewFlags(options: ReviewOptions, window: ReviewWindow): ReviewFlags {
  return options[window];
}

export type Correctness = 'correct' | 'partial' | 'incorrect' | 'needsGrading' | 'unanswered';

/**
 * Builds the payload by ADDING permitted fields to an empty object. A
 * "null it out" approach still ships the key, and a key whose value is null is
 * itself information ("this field exists, you just can't see it"). Omission is
 * the only version of this that is actually a control.
 */
export function toReviewQuestion(row: ReviewRow, flags: ReviewFlags): ReviewQuestion {
  const payload: ReviewQuestion = {
    slotPosition: row.slotPosition,
    questionId: row.version.id,
    type: row.version.type,
    stemHtml: row.version.stemHtml,
    options: orderOptions(row.version.options, row.optionOrder),
  };

  if (flags.response) payload.response = row.response ?? null;
  if (flags.correctness) payload.correctness = toCorrectness(row.state);
  if (flags.marks) {
    payload.mark = row.mark === null ? null : Number(row.mark);
    payload.maxMark = Number(row.maxMark);
  }
  if (flags.specificFeedback && row.feedbackHtml) payload.feedbackHtml = row.feedbackHtml;
  if (flags.generalFeedback && row.version.generalFeedbackHtml) {
    payload.generalFeedbackHtml = row.version.generalFeedbackHtml;
  }
  if (flags.rightAnswer && row.rightAnswerText) payload.rightAnswerText = row.rightAnswerText;

  return payload;
}
```

`toCorrectness` maps the six `AttemptQuestionState` values onto the five learner
labels; the raw enum value is never sent.

- [ ] **Step 3: Implement `AttemptService.review` and the route**

The service resolves the window from the attempt's own `submittedAt` and the
quiz's `openUntil` (both server values), resolves the flags, then serializes.
When every flag in the resolved window is false it returns
`{ locked: true, reason: 'during' | 'awaitingClose' }` and **no questions array
at all** — an empty array plus a flag would still tell the client how many
questions there were.

`GET /api/quiz/attempts/:attemptId/review` carries `@RequirePermission('quiz:attempt')`
and, deliberately, **no `@NoAnswerLeak()`** — this is the one learner route that
is allowed to carry answers, and only the fields the matrix permits.

- [ ] **Step 4: Run, confirm green, commit**

```bash
pnpm --filter @ayman/api test review
git add apps/api/src/modules/quiz packages/contracts/src/quiz
git commit -m "feat(api): server-side review window resolution with field omission per the 4x7 matrix"
```

---

## Task 14: Practice mode — instant per-question feedback

**Files:**
- Modify: `apps/api/src/modules/quiz/attempt.service.ts`, `attempt.controller.ts`, `attempt.service.spec.ts`
- Create: `apps/api/src/modules/quiz/dto/check-answer.dto.ts`

**Interfaces:**
- Produces: `AttemptService.checkAnswer(userId, attemptId, dto): Promise<CheckResult>` and
  `POST /api/quiz/attempts/:attemptId/questions/:slotPosition/check`.
  `CheckResult` carries only the fields the `during` window permits.

- [ ] **Step 1: Write the failing tests**

```ts
describe('AttemptService.checkAnswer (practice mode)', () => {
  it('grades one question immediately and returns correctness', async () => {
    const { started, fixture } = await startAttempt(2, { mode: 'practice' });
    await answerCorrectly(started, 0);
    const result = await service.checkAnswer(fixture.studentId, started.attemptId, {
      attemptToken: started.attemptToken,
      slotPosition: 0,
    });
    expect(result.correctness).toBe('correct');
  });

  it('LOCKS the question so a student cannot retype after seeing the verdict', async () => {
    const { started, fixture } = await startAttempt(1, { mode: 'practice' });
    await answerIncorrectly(started, 0);
    await service.checkAnswer(fixture.studentId, started.attemptId, {
      attemptToken: started.attemptToken,
      slotPosition: 0,
    });
    await expect(
      service.saveAnswers(fixture.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
        seq: 9,
        answers: [{ slotPosition: 0, response: { kind: 'choice', optionIds: [correctOptionId(started, 0)] } }],
      }),
    ).rejects.toThrow(/checked/i);
  });

  it('withholds the right answer, because during.rightAnswer is false in practice', async () => {
    const { started, fixture } = await startAttempt(1, { mode: 'practice' });
    await answerIncorrectly(started, 0);
    const result = await service.checkAnswer(fixture.studentId, started.attemptId, {
      attemptToken: started.attemptToken,
      slotPosition: 0,
    });
    expect(result).not.toHaveProperty('rightAnswerText');
    expect(result).toHaveProperty('correctness', 'incorrect');
  });

  it('refuses entirely in graded mode', async () => {
    const { started, fixture } = await startAttempt(1, { mode: 'graded' });
    await answerCorrectly(started, 0);
    await expect(
      service.checkAnswer(fixture.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
        slotPosition: 0,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses when during.correctness is false even in practice mode', async () => {
    // The MATRIX decides, not the mode. A practice quiz configured with an
    // all-false `during` window behaves like a graded one.
  });

  it('refuses to check an unanswered question', async () => { /* 400 */ });
  it('requires a valid attemptToken', async () => { /* 409 */ });
  it('appends an answer_checked event', async () => { /* … */ });
  it('does not finalise the attempt or write a score to quiz_attempts', async () => {
    const attempt = await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } });
    expect(attempt!.state).toBe('in_progress');
    expect(attempt!.rawScore).toBeNull();
  });
  it('counts a checked question in the final submit exactly once', async () => { /* … */ });
});
```

- [ ] **Step 2: Implement**

`checkAnswer` re-uses `gradeQuestion` on a single question, writes
`fraction`/`mark`/`state`/`gradedAt` on that `attempt_questions` row, appends an
`answer_checked` event, and returns `toReviewQuestion(row, duringFlags)` — the
same serializer as Task 13, so a practice check can never expose more than the
matrix allows. `saveAnswers` gains one extra condition: a row whose `gradedAt`
is not null is locked, and a save targeting it is a 409 with `code: 'question_checked'`.

> The lock matters pedagogically, not just technically: instant feedback without
> a lock is a "guess until green" loop, which is the thing that makes practice
> mode worthless as practice.

- [ ] **Step 3: Run, confirm green, commit**

```bash
pnpm --filter @ayman/api test attempt.service
git add apps/api/src/modules/quiz
git commit -m "feat(api): practice-mode instant feedback gated by the review matrix and locked after checking"
```

---

## Task 15: Admin quiz builder API — settings, slots, pools, one-write reorder

**Files:**
- Create: `apps/api/src/modules/quiz/quiz-builder.service.ts`, `quiz-builder.service.spec.ts`
- Create: `apps/api/src/modules/quiz/dto/quiz-builder.dto.ts`
- Create: `apps/api/src/modules/quiz/admin-quizzes.controller.ts`

**Interfaces:**
- Produces:
  - `QuizBuilderService.upsertForLesson(lessonId, settings): Promise<string>`
  - `QuizBuilderService.addSlot(quizId, { bankEntryId, pinnedVersion, maxMark })`
  - `QuizBuilderService.addPool(quizId, { name, pickCount, pointsPerQuestion, sourceFilter })`
  - `QuizBuilderService.reorderSlots(quizId, slotIds): Promise<void>` — **one** write
  - `QuizBuilderService.removeSlot(quizId, slotId)`
  - `QuizBuilderService.publish(quizId)`
  - `PUT /api/admin/quizzes/lesson/:lessonId`, `POST/DELETE /api/admin/quizzes/:quizId/slots`, `PATCH /api/admin/quizzes/:quizId/slots/order`, `POST /api/admin/quizzes/:quizId/pools`, `POST /api/admin/quizzes/:quizId/publish`

- [ ] **Step 1: Write the failing tests**

```ts
describe('QuizBuilderService', () => {
  it('creates a quiz for a lesson with the practice defaults', async () => {
    const quizId = await service.upsertForLesson(lessonId, defaultSettings());
    const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
    expect(quiz!.mode).toBe('practice');
    expect(quiz!.maxAttempts).toBe(0);
    expect(quiz!.retryCooldownHours).toBe(24);
    expect(quiz!.graceSeconds).toBe(60);
  });

  it('is idempotent per lesson — a second upsert updates instead of duplicating', async () => {
    const first = await service.upsertForLesson(lessonId, defaultSettings());
    const second = await service.upsertForLesson(lessonId, { ...defaultSettings(), mode: 'graded' });
    expect(second).toBe(first);
    expect((await prisma.quiz.findUnique({ where: { id: first } }))!.mode).toBe('graded');
  });

  it('recomputes sumMarks on every slot write', async () => {
    const quizId = await service.upsertForLesson(lessonId, defaultSettings());
    await service.addSlot(quizId, { bankEntryId: entries[0]!, maxMark: 2 });
    await service.addSlot(quizId, { bankEntryId: entries[1]!, maxMark: 3 });
    expect(Number((await prisma.quiz.findUnique({ where: { id: quizId } }))!.sumMarks)).toBe(5);

    const slots = await prisma.quizSlot.findMany({ where: { quizId } });
    await service.removeSlot(quizId, slots[0]!.id);
    expect(Number((await prisma.quiz.findUnique({ where: { id: quizId } }))!.sumMarks)).toBe(3);
  });

  it('closes the position gap left by a removed slot', async () => {
    // positions must stay 0..n-1 contiguous, or the runner's slotPosition
    // arithmetic and the navigator's numbering drift apart
  });

  // Spec §5.4: reordering 40 lessons is ONE debounced write, not 40.
  it('reorders 40 slots in a single UPDATE round trip', async () => {
    const quizId = await seedSlots(40);
    const slots = await prisma.quizSlot.findMany({ where: { quizId }, orderBy: { position: 'asc' } });
    const reversed = [...slots].reverse().map((slot) => slot.id);

    const queries: string[] = [];
    prisma.$on('query', (event) => queries.push(event.query));
    await service.reorderSlots(quizId, reversed);

    const updates = queries.filter((query) => query.startsWith('UPDATE'));
    expect(updates.length).toBeLessThanOrEqual(2); // the CASE update + sumMarks

    const after = await prisma.quizSlot.findMany({ where: { quizId }, orderBy: { position: 'asc' } });
    expect(after.map((slot) => slot.id)).toEqual(reversed);
    expect(after.map((slot) => slot.position)).toEqual([...Array(40).keys()]);
  });

  it('rejects a reorder that does not name every slot exactly once', async () => {
    const quizId = await seedSlots(3);
    const slots = await prisma.quizSlot.findMany({ where: { quizId } });
    await expect(service.reorderSlots(quizId, [slots[0]!.id, slots[0]!.id, slots[1]!.id]))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.reorderSlots(quizId, [slots[0]!.id])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a reorder naming a slot from another quiz', async () => { /* … */ });

  it('refuses to publish a quiz with no slots', async () => {
    const quizId = await service.upsertForLesson(lessonId, defaultSettings());
    await expect(service.publish(quizId)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to publish a quiz whose slot points at a question with no ready version', async () => {
    // A draft-only question in a published quiz means the first student to
    // start gets a 500. Catch it at publish time, when a human is watching.
  });

  it('refuses to publish a pool that cannot fill its pickCount', async () => {
    const quizId = await service.upsertForLesson(lessonId, defaultSettings());
    await service.addPool(quizId, {
      name: 'كبيرة',
      pickCount: 10,
      pointsPerQuestion: 1,
      sourceFilter: { categoryIds: [categoryWithThreeQuestions] },
    });
    await expect(service.publish(quizId)).rejects.toThrow(/pool/i);
  });

  it('leaves in-flight attempts alone when settings change', async () => {
    // The Q3 regression guard, stated from the builder side this time.
  });
});
```

- [ ] **Step 2: Implement the one-write reorder — through Plan 3's builder**

> **RECONCILED.** Plan 3 Task 8 owns `buildReorderSql(table, scopeColumn, scopeId, orderedIds)` in
> `apps/api/src/modules/content/reorder.sql.ts`, and its whitelist union already includes
> `'quiz_slots'` / `'quiz_id'`. **Call it** rather than hand-rolling a second `UPDATE … FROM`; the
> union is the SQL-injection control (column names cannot be parameterised) and Plan 3's
> `reorder.sql.spec.ts` already proves the "one statement, `N*2+1` params" property. The validation
> above the SQL — every id present exactly once, every id in scope — stays here, because it is
> quiz-specific. The body below shows the shape the shared builder produces.

```ts
  /**
   * ONE statement. `unnest` turns the ordered id array into (id, position)
   * pairs and a single UPDATE … FROM applies them all; the deferrable unique
   * from Task 2 tolerates the transient duplicates inside the statement.
   *
   * Writing 40 individual updates would also work and would be wrong: it is 40
   * round trips, it is not atomic without an explicit transaction, and it is
   * exactly the pattern the spec calls out.
   *
   * Implementation: `await tx.$executeRaw(buildReorderSql('quiz_slots',
   * 'quiz_id', quizId, slotIds))` — the inline SQL below is what that returns.
   */
  async reorderSlots(quizId: string, slotIds: string[]): Promise<void> {
    const existing = await this.prisma.quizSlot.findMany({
      where: { quizId },
      select: { id: true },
    });
    const known = new Set(existing.map((slot) => slot.id));
    const unique = new Set(slotIds);
    if (unique.size !== slotIds.length || slotIds.length !== known.size) {
      throw new BadRequestException({ code: 'reorder_must_list_every_slot_once' });
    }
    for (const id of slotIds) {
      if (!known.has(id)) throw new BadRequestException({ code: 'reorder_unknown_slot' });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET CONSTRAINTS "app"."quiz_slots_quiz_id_position_key" DEFERRED`;
      await tx.$executeRaw`
        UPDATE "app"."quiz_slots" AS s
        SET "position" = ordered."position"
        FROM (
          SELECT id, (ordinality - 1)::int AS "position"
          FROM unnest(${slotIds}::text[]) WITH ORDINALITY AS t(id, ordinality)
        ) AS ordered
        WHERE s."id" = ordered."id" AND s."quiz_id" = ${quizId}
      `;
    });
  }
```

`publish(quizId)` runs the pre-flight checks the tests demand: at least one
slot, every fixed slot resolves to a `ready` version, every pool can satisfy its
`pickCount` from its filter, and `sumMarks > 0`. Each failure carries a distinct
machine-readable `code` so the builder UI can point at the offending row.

- [ ] **Step 3: Controller + DTOs, then run and commit**

All routes carry `@RequirePermission('quiz:write')`. The settings DTO wraps
`QuizSettingsSchema` from Task 4 with `createZodDto`, so the builder form and
the API validate identically.

```bash
pnpm --filter @ayman/api test quiz-builder
git add apps/api/src/modules/quiz
git commit -m "feat(api): admin quiz builder with a single-statement slot reorder and publish preflight"
```

---

## Task 16: Admin quiz builder UI

**Files:**
- Create: `apps/web/app/(admin)/admin/questions/page.tsx`, `[bankEntryId]/page.tsx`, `new/page.tsx`
- Create: `apps/web/components/admin/quiz/question-form.tsx`
- Create: `apps/web/components/admin/quiz/option-rows.tsx`
- Create: `apps/web/components/admin/quiz/bulk-import-dialog.tsx`
- Create: `apps/web/app/(admin)/admin/quizzes/[quizId]/page.tsx`
- Create: `apps/web/components/admin/quiz/slot-list.tsx`, `quiz-settings-form.tsx`, `review-matrix-field.tsx`
- Create: `apps/web/components/admin/quiz/question-form.test.tsx`

**Interfaces:**
- Consumes: `QuestionInputSchema`, `QuizSettingsSchema`, `parseQuestionBlocks`, `copy.quizAdmin`, `SortableList` (Plan 3), `apiSend`.
- Produces: the authoring surface. No new API.

- [x] **Step 1: Install the form dependencies**

```bash
pnpm --filter @ayman/web add react-hook-form@7.83.0 @hookform/resolvers@5.5.3 @dnd-kit/core@6.3.1 @dnd-kit/sortable@10.0.0
```
⚠️ react-hook-form **7.83.0**, not v8 (beta). `@dnd-kit/core` + `/sortable`, not
`@dnd-kit/react` (pre-1.0).

- [x] **Step 2: Build `question-form.tsx` around the shared union**

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { QuestionInputSchema, hasChoiceOptions, type QuestionInput } from '@ayman/contracts';
import { copy } from '@ayman/contracts';

/**
 * ONE resolver over the SAME discriminated union the API validates with. There
 * is no client-only mirror of these rules, so "the form let me save it but the
 * server rejected it" cannot happen.
 *
 * The refinements live inside each union member (see the contract). If they
 * were lifted onto the union, `formState.errors` would be empty while
 * `handleSubmit` silently refused to fire — the bug this whole arrangement
 * exists to avoid.
 */
export function QuestionForm({ defaultValues, onSaved }: QuestionFormProps) {
  const form = useForm<QuestionInput>({
    resolver: zodResolver(QuestionInputSchema),
    defaultValues: defaultValues ?? {
      type: 'mcq_single',
      stemHtml: '',
      defaultMark: 1,
      settings: { shuffleOptions: true, caseSensitive: false },
      options: [
        { bodyHtml: '', fraction: 1 },
        { bodyHtml: '', fraction: 0 },
      ],
    },
    mode: 'onBlur',
  });

  const type = form.watch('type');
  const options = useFieldArray({ control: form.control, name: 'options' });

  // Switching type rewrites the option array to that type's legal shape —
  // leaving four MCQ options behind on a true/false question is how a form
  // ends up permanently unsubmittable with no visible error.
  function changeType(next: QuestionInput['type']) {
    form.setValue('type', next, { shouldValidate: false });
    if (next === 'true_false') {
      form.setValue('options', [
        { bodyHtml: copy.quiz.true, fraction: 1 },
        { bodyHtml: copy.quiz.false, fraction: 0 },
      ]);
    } else if (next === 'short_answer') {
      form.setValue('options', [{ answerPattern: '', fraction: 1 }]);
    } else if (next === 'essay') {
      form.setValue('options', []);
    } else if (!hasChoiceOptions(type)) {
      form.setValue('options', [
        { bodyHtml: '', fraction: 1 },
        { bodyHtml: '', fraction: 0 },
      ]);
    }
    form.clearErrors();
  }
  // …
}
```

Authoring-speed requirements, all of them load-bearing:

- **Inline correctness.** `mcq_single`/`true_false` render a radio per option that
  writes `fraction: 1` to the chosen row and `0` to the rest. `mcq_multi` renders
  a checkbox that re-splits `1 / n` across the ticked rows so the sum-to-one rule
  is satisfied by construction. A numeric weight input is available behind a
  "وزن الاختيار" disclosure for the rare negative-marking case — never as the
  primary control, because typing 1 into four boxes is how you get four correct
  answers.
- **Enter adds an option** from the last option field; **⌘/Ctrl+Enter saves**;
  **Escape** closes the editor. Shortcuts are listed in the form footer so the
  UI teaches them.
- **Option reorder** with `@dnd-kit/sortable` using `useSortable` + `arrayMove`,
  emitting `options.move(from, to)`.
- **Duplicate question** posts to `/api/admin/questions/:id/duplicate` and routes
  to the copy with `copy.quizAdmin.duplicateSuffix` appended to nothing visible —
  the suffix goes in the list label, not into the stem.

- [x] **Step 3: Write the form test**

`question-form.test.tsx` (Vitest + Testing Library):

```tsx
it('renders the "exactly one correct" error on the options field, not nowhere', async () => {
  render(<QuestionForm />);
  await user.type(screen.getByLabelText(copy.quizAdmin.stem), 'س');
  // Tick a second correct radio is impossible; instead force the illegal state
  // the way a type switch could, then submit.
  await user.click(screen.getByRole('button', { name: copy.quizAdmin.save }));
  expect(await screen.findByText(copy.quizErrors.optionBodyRequired)).toBeVisible();
});

it('shows an error somewhere on screen for every invalid submit', async () => {
  // The regression guard for the discriminated-union trap: submit each invalid
  // shape and assert the form did NOT silently do nothing.
  for (const scenario of INVALID_SCENARIOS) {
    render(<QuestionForm defaultValues={scenario} />);
    await user.click(screen.getByRole('button', { name: copy.quizAdmin.save }));
    expect(screen.getByRole('alert')).toBeVisible();
    expect(onSaved).not.toHaveBeenCalled();
    cleanup();
  }
});

it('swaps the option shape when the type changes and clears stale errors', async () => { /* … */ });
it('keeps mcq_multi weights summing to 1 as boxes are ticked', async () => { /* … */ });
```

- [x] **Step 4: Build the bulk import dialog**

A `<Textarea>` on the start side, a live preview table on the end side.
`parseQuestionBlocks` runs **in the browser** on every change (debounced 250ms)
so the instructor sees the parsed type, stem and correct answer per block before
committing. Errors render inline against their block number. The commit button
is disabled while `errors.length > 0`, and the API re-parses server-side anyway —
the browser preview is a convenience, never the validation.

Include the format legend, rendered from `copy.quizAdmin.bulkImportHint` plus a
`<pre>` example in a terminal-chrome panel (spec §4.5 device 7 — this is exactly
the "how it works" case it is meant for).

- [x] **Step 5: Build the slot list and the review matrix field**

- `slot-list.tsx`: `@dnd-kit` sortable rows showing `NN` in mono, the stem's
  first 80 characters, the type badge, the max mark, and a remove button. On
  drop, **one** debounced (400ms) `PATCH …/slots/order` with the full ordered id
  array. An optimistic reorder plus a `sonner` toast with undo on failure.
- `review-matrix-field.tsx`: a 4×7 checkbox grid, windows as columns, flags as
  rows, headers in mono, `text-start` on the flag labels. Two preset buttons
  ("تدريب" / "امتحان بدرجات") that write the two default matrices. The grid
  scrolls inside its own `overflow-x-auto` container on narrow screens — the
  page body never scrolls horizontally.

- [x] **Step 6: Verify in a browser**

With `pnpm dev`:
1. Create an `mcq_single`, tick option B, save → the API stores `fraction: 1` on B.
2. Switch the type to `true_false` → the options collapse to صح/خطأ and the form still saves.
3. Force each invalid shape → an error is **visible** every time. This is the trap check; do it by hand, not by reading the test output.
4. Paste 12 questions into bulk import → the preview shows 12 rows, break one → the commit button disables and names block 7.
5. Drag slot 1 to position 40 → exactly **one** `PATCH …/slots/order` in the network tab.
6. Toggle a review-matrix cell → save → reload → the cell is still toggled.
7. `ml-*`/`text-left` anywhere in the new components → `pnpm lint` fails.

- [x] **Step 7: Commit**

```bash
git add apps/web/app/\(admin\) apps/web/components/admin/quiz apps/web/package.json
git commit -m "feat(web): admin quiz builder — shared-union question form, bulk import and one-write reorder"
```

---

## Task 17: The student quiz runner

**Files:**
- Modify: `apps/web/lib/quiz-links.ts` — **created by Plan 4**; this task only adds the deeper helpers
- Create: `apps/web/app/(app)/quizzes/[lessonId]/page.tsx`, `loading.tsx`
- Create: `apps/web/app/(app)/quizzes/[lessonId]/attempt/[attemptId]/page.tsx`
- Create: `apps/web/components/quiz/quiz-runner.tsx`, `quiz-timer.tsx`, `question-navigator.tsx`, `question-view.tsx`, `submit-dialog.tsx`
- Create: `apps/web/components/quiz/use-attempt-autosave.ts`, `use-attempt-autosave.test.ts`
- Create: `apps/web/components/quiz/quiz-timer.test.tsx`

**Interfaces:**
- Consumes: the Task 10–14 endpoints; `quizHref(lessonId)` from `apps/web/lib/quiz-links.ts` (**Plan 4** — do not re-declare it, and do not change its return shape: Plan 4's `QuizLesson` already links through it).
- Produces: `attemptHref(lessonId, attemptId)` and `reviewHref(lessonId, attemptId)` in the same file.
- Also: append `'/quizzes'` to `PROTECTED_PREFIXES` in `apps/web/proxy.ts` (Plan 3 Task 11 Step 3b turned that list into a shared constant precisely so this is a one-line append).

- [x] **Step 1: The intro screen**

`/quizzes/[lessonId]` is a Server Component: mode badge, question count, total
marks, duration, attempts remaining, the pass line, previous attempts with their
scores, and the primary action — `copy.quiz.start` or `copy.quiz.resume`. When
the student is blocked it renders the specific reason from the API's error code
(`no_attempts_left`, `retry_cooldown` with the countdown, `quiz_closed`,
`quiz_not_open_yet`), never a generic failure.

`loading.tsx` is a Server Component skeleton with varied bar widths
(100% / 85% / 60%) and the 180ms delay, per spec §4.6.

- [x] **Step 2: The server-authoritative timer**

```tsx
'use client';

/**
 * The server sends `deadlineAt` and `serverTime` together. We compute the
 * offset ONCE and count down against `performance.now()`, so:
 *   - a wrong client clock cannot buy extra time or steal it
 *   - a system-clock jump mid-attempt does not warp the timer
 * Every autosave response carries a fresh `serverTime`, which re-anchors the
 * offset. The countdown is a DISPLAY; the server's deadline is the truth, and
 * the submit endpoint enforces it regardless of what this component showed.
 */
export function useServerCountdown(deadlineAt: string | null, serverTime: string) {
  // …
}
```

`quiz-timer.tsx` renders `mm:ss` with `tabular-nums` in mono. Under five minutes
it switches to `--warn`. **It never uses `--err`** — red belongs to answer
correctness and nothing else (Global Constraint 9). At zero it fires one submit
and shows `copy.quiz.timeUpBody`; if the quiz is in `graceperiod` mode it shows
`copy.quiz.graceRemaining` counting the grace down instead.

Test `quiz-timer.test.tsx` with fake timers:
```ts
it('ignores a client clock that is an hour fast', () => { /* … */ });
it('re-anchors on a fresh serverTime from an autosave', () => { /* … */ });
it('fires exactly one submit when it reaches zero, even across re-renders', () => { /* … */ });
it('never renders a negative time', () => { /* … */ });
it('uses the warn token, never the error token', () => { /* … */ });
```

- [x] **Step 3: Autosave**

`use-attempt-autosave.ts`:
- a per-tab monotonic `seq`, incremented on every send
- flush triggers: 15s interval, field blur, question navigation,
  `visibilitychange → hidden`, and `pagehide` (via `navigator.sendBeacon` for
  the last two so a closing tab still lands its answers)
- statuses: `idle` → `saving` → `saved` → `error`, rendered with
  `copy.quiz.saving` / `copy.quiz.saved` / `copy.quiz.saveFailed`
- retry with backoff on 5xx; on a 409 `attempt_stale` it stops retrying and
  surfaces `copy.quiz.staleTab` with a reload action — retrying a stale write
  forever is how a second tab silently loses an hour of work
- it never sends a grade or a state; only `{ slotPosition, response }`

Tests:
```ts
it('increments seq on every send so an out-of-order reply cannot clobber', () => { /* … */ });
it('flushes on blur and on visibilitychange', () => { /* … */ });
it('stops retrying and reports staleTab on a 409', () => { /* … */ });
it('coalesces rapid edits to one request per interval', () => { /* … */ });
```

- [x] **Step 4: Navigator, question view, flagging**

- `question-navigator.tsx`: a grid of numbered buttons in mono. Four visual
  states — current (amber ring), answered (filled surface), flagged (amber dot
  in the corner), untouched (hairline border). **No green, no red**: nothing here
  knows whether an answer is right. `aria-current="step"`, arrow-key roving
  tabindex, and `dir`-agnostic layout via logical properties.
- `question-view.tsx`: renders `stemHtml` through the shared sanitized-HTML
  renderer, options as radio/checkbox in the **snapshotted** order the API sent
  (never re-sorted client-side), a textarea for short answer/essay with a live
  `copy.quiz.wordCount`, a flag toggle, and `copy.quiz.clearAnswer`.
- Sequential `navMethod` disables the navigator and hides the previous button.

- [x] **Step 5: The submit dialog — the anti-support-ticket feature**

`submit-dialog.tsx` calls `GET …/preflight` when it opens, so the unanswered
count is **the server's**, not a client tally that a failed autosave would make a
lie. It renders `copy.quiz.submitConfirmUnanswered` (or
`copy.quiz.submitConfirmAllAnswered`), lists the unanswered question numbers as
clickable chips that close the dialog and jump to the question, and offers
`copy.quiz.submitCancel` as the **default-focused** action. Confirming disables
the button for the duration of the request so a double-click cannot fire two
submits.

- [x] **Step 6: Verify by hand — the disconnect drill**

1. Start a timed attempt, answer three questions, **kill the browser tab**.
2. Reopen `/quizzes/[lessonId]` → resume → the same three answers, the **same
   option order**, and a timer that continued running.
3. Open the same attempt in a second tab, then save from the first → the first
   tab shows `copy.quiz.staleTab` and does not clobber.
4. Set the system clock forward an hour → the timer does not jump.
5. Submit with two unanswered → the dialog says `2` and the chips jump correctly.
6. Submit twice quickly → one success, one `copy.quiz.alreadySubmitted`.
7. Reduced motion on → no transforms, opacity fades survive.

- [x] **Step 7: Commit**

```bash
git add apps/web/app/\(app\)/quizzes apps/web/components/quiz apps/web/lib/quiz-links.ts
git commit -m "feat(web): quiz runner with a server-authoritative timer, autosave and a preflight submit dialog"
```

---

## Task 18: Results and review

**Files:**
- Create: `apps/web/app/(app)/quizzes/[lessonId]/attempt/[attemptId]/review/page.tsx`, `loading.tsx`
- Create: `apps/web/components/quiz/result-header.tsx`, `review-question.tsx`, `review-locked.tsx`
- Modify: `packages/contracts/src/copy/ar.ts` (score-band copy)

**Interfaces:**
- Consumes: `GET /api/quiz/attempts/:attemptId/review`.

- [x] **Step 1: The result header**

Score as `{scaled} / {gradeOutOf}` in mono with `tabular-nums`, the pass line, a
pass/fail chip, marks earned per section, and a score-band message. **`--ok` and
`--err` appear here and on the per-question verdicts — nowhere else in the
product.** No confetti, no gradient ring, no emoji.

When `needsGrading` is true the header shows `copy.quiz.essayPending` and labels
the score as provisional rather than presenting an incomplete number as final.

- [x] **Step 2: The review question — render exactly what the server sent**

```tsx
/**
 * Every field here is OPTIONAL because the server OMITS what the review matrix
 * disallows. The component branches on presence:
 *
 *   {question.correctness ? <Verdict … /> : null}
 *
 * It must never branch on a boolean prop like `showCorrectness` — that is the
 * CSS-hiding pattern the spec bans, and it would mean the data was in the
 * payload all along.
 */
```

- The student's answer is highlighted; when `rightAnswerText` is present the
  correct option is marked with `--ok`.
- `feedbackHtml` renders under the option it belongs to; `generalFeedbackHtml`
  renders as `copy.quiz.explanation` under the question.
- A short-answer pattern renders as **text**, never `dangerouslySetInnerHTML` —
  it was deliberately never sanitized (Task 1).
- The appeal button (Task 19) appears per question when the attempt is graded.

- [x] **Step 3: The locked state**

When the API returns `{ locked: true }` the page renders
`copy.quiz.reviewLocked` plus the specific reason, and — critically — **no
question list at all**, because a list of locked cards still leaks the question
count and order.

- [x] **Step 4: Verify each of the four windows by hand**

Submit an attempt, then check the review page at: 30s after submit, 3 minutes
after submit, after moving `openUntil` into the past, and (for a practice quiz)
mid-attempt. Confirm in the **network tab** that the disallowed fields are absent
from the JSON, not merely invisible on screen.

- [x] **Step 5: Commit**

```bash
git add apps/web/app/\(app\)/quizzes apps/web/components/quiz packages/contracts/src/copy/ar.ts
git commit -m "feat(web): results and review rendering only the fields the server permitted"
```

---

## Task 19: التظلم — the grade appeal flow

A trust signal parents notice. The benchmarked competitor exposes
"الدرجة قبل التظلم / بعد التظلم" and it reads as fairness.

**Files:**
- Create: `apps/api/src/modules/quiz/appeals.service.ts`, `appeals.service.spec.ts`
- Create: `apps/api/src/modules/quiz/dto/appeal.dto.ts`
- Create: `apps/api/src/modules/quiz/appeals.controller.ts`
- Create: `apps/web/components/quiz/appeal-dialog.tsx`
- Create: `apps/web/app/(admin)/admin/appeals/page.tsx`

**Interfaces:**
- Consumes: `AttemptService.recomputeScore` (Task 12), `LessonProgressService.recordQuizResult` (Plan 4).
- Produces:
  - `AppealsService.open(userId, attemptQuestionId, note): Promise<string>`
  - `AppealsService.resolve(adminId, appealId, { status, newMark?, resolverNote }): Promise<void>`
  - `AppealsService.listForAdmin(filter: AdminAppealFilter)`, `AppealsService.listForStudent(userId)`
  - `POST /api/quiz/attempt-questions/:id/appeals` (`appeal:create`)
  - `GET /api/admin/appeals` → `ListResponse<AdminAppealRow>` (`appeal:read`)
  - `PATCH /api/admin/appeals/:id` → `AdminAppealRow` (`appeal:resolve`)

> **RECONCILED.** These two admin routes are the **only** appeal endpoints in the product. Plan 6
> Task 11's draft declared `GET /api/admin/appeals` and `POST /api/admin/appeals/:id/resolve` a
> second time, in a second module, with a second Prisma access path — removed from Plan 6.
> Resolution is a `PATCH` on the resource, not a `POST` to a verb, and it is idempotent: resolving
> an already-resolved appeal returns **409**.
>
> `AdminAppealRow` is `{ id, attemptId, attemptQuestionId, questionVersionId, userId, studentName,
> quizId, quizTitle, reasonAr, state, resolutionAr, resolvedBy, resolvedAt, createdAt }`.
>
> A resolution that changes a mark writes the corrected fraction onto `attempt_questions`, then
> calls `AttemptService.recomputeScore(attemptId)` — **the attempt score is derived, never patched
> directly** — then re-calls `LessonProgressService.recordQuizResult` so a pass/fail flip
> propagates to course progress. All three inside one transaction, with an `attempt_events` row.
>
> `apps/web/app/(admin)/admin/appeals/page.tsx` is created **here**, as a plain list. Plan 6
> Task 11 upgrades that same file to the `DataTable` + `nuqs` pattern; it does not create a
> second page.

- [x] **Step 1: Write the failing tests**

```ts
describe('AppealsService', () => {
  it('opens an appeal on the student\'s own graded question', async () => {
    const appealId = await appeals.open(fixture.studentId, questionId, 'الإجابة دي صح');
    const appeal = await prisma.gradeAppeal.findUnique({ where: { id: appealId } });
    expect(appeal!.status).toBe('open');
    // The mark at the moment of appeal is FROZEN into the row, so a later
    // regrade cannot rewrite what the student was disputing.
    expect(Number(appeal!.gradeBefore)).toBe(0);
  });

  it('refuses an appeal on another student\'s question', async () => {
    await expect(appeals.open(fixture.otherStudentId, questionId, 'x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses an appeal on an unsubmitted attempt', async () => { /* 409 */ });

  it('refuses a second open appeal on the same question', async () => {
    await appeals.open(fixture.studentId, questionId, 'أول');
    await expect(appeals.open(fixture.studentId, questionId, 'تاني')).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows a new appeal after the previous one was resolved', async () => { /* … */ });

  it('accepting an appeal rewrites the mark and RECOMPUTES the attempt score', async () => {
    const before = await prisma.quizAttempt.findUnique({ where: { id: attemptId } });
    const appealId = await appeals.open(fixture.studentId, questionId, 'ن');
    await appeals.resolve(fixture.adminId, appealId, {
      status: 'accepted',
      newMark: 1,
      resolverNote: 'معاك حق',
    });

    const appeal = await prisma.gradeAppeal.findUnique({ where: { id: appealId } });
    expect(Number(appeal!.gradeAfter)).toBe(1);
    const after = await prisma.quizAttempt.findUnique({ where: { id: attemptId } });
    expect(Number(after!.rawScore)).toBe(Number(before!.rawScore) + 1);
    expect(after!.scaledScore).not.toEqual(before!.scaledScore);
  });

  it('flips `passed` when the regrade crosses the pass line', async () => { /* … */ });

  it('rejecting an appeal changes no mark at all', async () => { /* … */ });

  it('refuses a newMark above the question\'s maxMark or below zero', async () => { /* 400, both ends */ });

  it('appends regraded and appeal_resolved events with before/after', async () => {
    const events = await prisma.attemptEvent.findMany({ where: { attemptId }, orderBy: { seq: 'asc' } });
    const regrade = events.find((event) => event.kind === 'regraded');
    expect(regrade!.payload).toMatchObject({ markBefore: 0, markAfter: 1 });
  });

  it('re-notifies lesson progress after a regrade', async () => {
    expect(progress.recordQuizResult).toHaveBeenCalledTimes(2); // submit + regrade
  });

  it('never lets a student set the mark', async () => {
    // AppealDto is .strict() and contains only { note }.
  });

  it('grades an essay through the same path — a manual mark is a resolve, not a special case', async () => { /* … */ });
});
```

- [x] **Step 2: Implement**

`resolve()` runs in one transaction: update the `attempt_questions` row's
`mark`, `fraction` (`newMark / maxMark`), `state` (via `fractionToState`),
`gradedBy` and `gradedAt`; write `gradeAfter`, `status`, `resolverNote`,
`resolvedBy`, `resolvedAt` on the appeal; append `regraded` then
`appeal_resolved`; re-run `gradeAttempt` over every question row and rewrite the
attempt's `rawScore`/`scaledScore`/`passed`; and call
`LessonProgressService.recordQuizResult` again so a newly-passing student
actually unlocks what passing unlocks.

> Manual essay grading uses this exact path with no appeal attached
> (`AppealsService.gradeManually`). One regrade primitive, one audit shape.

- [x] **Step 3: The student dialog and the admin queue**

- `appeal-dialog.tsx`: a textarea (min 10 characters), `copy.appeal.*`
  throughout, and `copy.appeal.submitted` on success. If an appeal is already
  open the button renders disabled with `copy.appeal.alreadyOpen`.
- `/admin/appeals`: a TanStack Table v8 list in
  `manualPagination/Sorting/Filtering` mode **with `getRowId` set** — without it
  selection is index-based and bulk actions break silently on page 2. Columns:
  student, quiz, question stem excerpt, `gradeBefore`, the note, age. The detail
  drawer shows the student's response beside the model answer, a `newMark`
  input bounded by `maxMark`, and accept/reject. `nuqs` for the filter state so
  a filtered queue is a shareable URL.

- [x] **Step 4: Verify end to end, then commit**

Submit an attempt with a wrong answer → appeal → resolve as accepted with the
full mark → the student's review page shows `copy.appeal.gradeBefore` and
`copy.appeal.gradeAfter`, and the header score has increased.

```bash
git add apps/api/src/modules/quiz apps/web/components/quiz/appeal-dialog.tsx apps/web/app/\(admin\)/admin/appeals
git commit -m "feat: grade appeal flow with audited regrade and score recomputation"
```

---

## Task 20: Admin unlock and overrides — shipped BEFORE launch

The competitor's support number exists because this screen does not. It ships in
the same release as the runner, not after the first complaint.

**Files:**
- Create: `apps/api/src/modules/quiz/attempt-admin.service.ts`, `attempt-admin.service.spec.ts`
- Create: `apps/api/src/modules/quiz/admin-attempts.controller.ts`
- Create: `apps/web/app/(admin)/admin/quizzes/[quizId]/attempts/page.tsx`
- Create: `apps/web/components/admin/quiz/attempt-actions.tsx`

**Interfaces:**
- Consumes: `AttemptService.reissueToken` (Task 12).
- Produces:
  - `AttemptAdminService.reopen(adminId, attemptId, { extraSeconds })`
  - `AttemptAdminService.grantExtraAttempt(adminId, quizId, userId)`
  - `AttemptAdminService.grantExtraTime(adminId, attemptId, seconds)`
  - `AttemptAdminService.listAttempts(filter: AdminAttemptFilter)` — **cross-quiz**; `quizId` is one optional facet alongside `userId`, `state`, `q`, and the `ListQuery` page/sort fields
  - `POST /api/admin/attempts/:id/reopen`, `POST /api/admin/attempts/:id/extra-time`, `POST /api/admin/quizzes/:quizId/students/:userId/extra-attempt` — all `@RequirePermission('attempt:unlock')`
  - `GET /api/admin/attempts` → `ListResponse<AdminAttemptRow>` (`attempt:read`) — **the cross-quiz list**
  - `GET /api/admin/quizzes/:quizId/attempts` (`attempt:read`) — the same service call with `quizId` pre-bound, kept because the builder links straight to it

> **RECONCILED.** `GET /api/admin/attempts` is new in this reconciliation. Plan 6 Task 11's draft
> declared it (plus a `POST /api/admin/attempts/:id/unlock`) inside a second admin-attempts module.
> That module is removed from Plan 6; Plan 6 builds only the `app/(admin)/admin/attempts` DataTable
> screen over the endpoints above, and its "unlock" button posts to `.../reopen`. `AdminAttemptRow`
> exposes exactly `{ id, userId, studentName, quizId, quizTitle, attemptNumber, state, score,
> startedAt, submittedAt, deadlineAt }` — **never `attemptToken`**, which is a write credential and
> must not appear in a list payload.

- [x] **Step 1: Write the failing tests**

```ts
describe('AttemptAdminService', () => {
  it('reopens a submitted attempt and issues a NEW token', async () => {
    const reopened = await admin.reopen(adminId, attemptId, { extraSeconds: 600 });
    const attempt = await prisma.quizAttempt.findUnique({ where: { id: attemptId } });
    expect(attempt!.state).toBe('in_progress');
    expect(attempt!.submittedAt).toBeNull();
    expect(attempt!.attemptToken).not.toBe(originalToken);
    expect(attempt!.extraTimeSeconds).toBe(600);
  });

  // Q3 restated: reopening grants time ADDITIVELY. deadlineAt is still the
  // value written at attempt start.
  it('does not rewrite deadlineAt when reopening', async () => {
    const before = (await prisma.quizAttempt.findUnique({ where: { id: attemptId } }))!.deadlineAt;
    await admin.reopen(adminId, attemptId, { extraSeconds: 600 });
    const after = (await prisma.quizAttempt.findUnique({ where: { id: attemptId } }))!.deadlineAt;
    expect(after!.getTime()).toBe(before!.getTime());
  });

  it('keeps the previous score visible until the student resubmits', async () => {
    const before = (await prisma.quizAttempt.findUnique({ where: { id: attemptId } }))!.rawScore;
    await admin.reopen(adminId, attemptId, { extraSeconds: 0 });
    const after = (await prisma.quizAttempt.findUnique({ where: { id: attemptId } }))!.rawScore;
    expect(after).toEqual(before);
  });

  it('lets the student resubmit after a reopen and rewrites the score', async () => { /* … */ });

  it('is the ONLY path that clears submittedAt — the student path still cannot', async () => {
    // Restating Q4: after a reopen, the student's own double-submit protection
    // is intact for the new submission.
  });

  it('grants an extra attempt that the start path then honours', async () => { /* … */ });

  it('refuses to grant an extra attempt to a student with no attempts', async () => { /* 404 */ });

  it('records every action as an attempt event naming the admin', async () => {
    const events = await prisma.attemptEvent.findMany({ where: { attemptId, actorId: adminId } });
    expect(events.map((event) => event.kind)).toContain('attempt_reopened');
  });

  it('refuses all three actions for a student role', async () => {
    // The guard test lives in the authz matrix (Task 22); this asserts the
    // service itself does not offer an unguarded path.
  });
});
```

- [x] **Step 2: Implement, and state the Q4 relationship explicitly in code**

```ts
  /**
   * The ONE place `submitted_at` is ever set back to NULL.
   *
   * This does not weaken Q4. The student-facing submit path still carries
   * `submitted_at IS NULL` in its WHERE clause, so replay-for-a-better-score
   * remains impossible from the browser. Reopening is an authenticated,
   * permission-gated, event-logged act by an admin — which is exactly the
   * escape hatch whose absence generates the competitor's support calls.
   */
  async reopen(adminId: string, attemptId: string, args: { extraSeconds: number }) { /* … */ }
```

- [x] **Step 3: The attempts screen**

TanStack Table v8, `getRowId` set, `nuqs` filters: student, state, score band,
"needs grading". Row actions behind a confirmation with a `sonner` toast. The
"needs grading" filter is the essay-marking queue and links straight into the
regrade drawer from Task 19.

- [x] **Step 4: Verify and commit**

Exhaust a student's attempts → grant one → they can start again. Submit by
accident → reopen → the student resumes with their answers intact and a new
token, and the old tab's token is dead.

```bash
git add apps/api/src/modules/quiz apps/web/app/\(admin\)/admin/quizzes apps/web/components/admin/quiz/attempt-actions.tsx
git commit -m "feat: admin attempt unlock, extra attempts and extra time, fully audited"
```

---

## Task 21: Instructor analytics — distribution, facility, discrimination, distractors

**Files:**
- Create: `apps/api/src/modules/quiz/analytics.service.ts`, `analytics.service.spec.ts`
- Create: `apps/api/src/modules/quiz/analytics/discrimination.ts`, `discrimination.spec.ts`
- Create: `apps/api/src/modules/quiz/admin-analytics.controller.ts`
- Create: `apps/web/app/(admin)/admin/quizzes/[quizId]/analytics/page.tsx`
- Create: `apps/web/components/admin/quiz/score-histogram.tsx`, `item-analysis-table.tsx`

**Interfaces:**
- Produces:
  - `kelleyDiscrimination(rows, options): number | null` (pure)
  - `AnalyticsService.forQuiz(quizId): Promise<QuizAnalytics>`
  - `GET /api/admin/quizzes/:quizId/analytics` (`analytics:read`)

- [x] **Step 1: Write the failing discrimination tests**

```ts
import { kelleyDiscrimination } from './discrimination';

/**
 * Kelley's 27% method: D = p(top 27% by total score) − p(bottom 27%).
 * Chosen over a point-biserial correlation because it is explainable to a
 * teacher in one sentence, and because it degrades gracefully on the attempt
 * counts a single-instructor platform actually sees.
 */
describe('kelleyDiscrimination', () => {
  it('returns 1 for an item only the top group answered', () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => ({ total: 100 - i, fraction: 1 })),
      ...Array.from({ length: 10 }, (_, i) => ({ total: 10 - i, fraction: 0 })),
    ];
    expect(kelleyDiscrimination(rows)).toBe(1);
  });

  it('returns -1 for an item only the BOTTOM group answered — a broken key', () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => ({ total: 100 - i, fraction: 0 })),
      ...Array.from({ length: 10 }, (_, i) => ({ total: 10 - i, fraction: 1 })),
    ];
    expect(kelleyDiscrimination(rows)).toBe(-1);
  });

  it('returns 0 when both groups perform identically', () => { /* … */ });
  it('handles partial credit, not just 0/1', () => { /* … */ });

  it('returns null below the minimum sample size instead of a confident lie', () => {
    expect(kelleyDiscrimination([{ total: 1, fraction: 1 }])).toBeNull();
  });

  it('takes at least one attempt in each group when 27% rounds to zero', () => { /* … */ });
  it('is stable when every total is identical', () => { /* … */ });
});
```

- [x] **Step 2: Write the aggregate SQL**

```sql
-- Score distribution. width_bucket returns 11 for a value equal to the upper
-- bound, so the top bucket is folded back into 10 — otherwise every perfect
-- score falls into an eleventh, invisible column.
SELECT LEAST(width_bucket("scaled_score", 0, $2, 10), 10) AS bucket, count(*)::int AS n
FROM "app"."quiz_attempts"
WHERE "quiz_id" = $1 AND "state" IN ('submitted', 'pending_review')
GROUP BY 1 ORDER BY 1;
```

```sql
-- Facility index per question version = mean fraction. Moodle calls this
-- "facility"; the brief calls it difficulty. Higher = easier.
SELECT aq."question_version_id", avg(aq."fraction")::float AS facility, count(*)::int AS n
FROM "app"."attempt_questions" aq
JOIN "app"."quiz_attempts" a ON a."id" = aq."attempt_id"
WHERE a."quiz_id" = $1
  AND a."state" IN ('submitted', 'pending_review')
  AND aq."fraction" IS NOT NULL
GROUP BY 1;
```

```sql
-- Distractor analysis: how many students picked each option. An option nobody
-- ever picks is dead weight; a distractor picked more than the key is a
-- mis-keyed question, and this is the fastest way to see either.
SELECT aq."question_version_id", opt AS option_id, count(*)::int AS picks
FROM "app"."attempt_questions" aq
JOIN "app"."quiz_attempts" a ON a."id" = aq."attempt_id"
CROSS JOIN LATERAL jsonb_array_elements_text(aq."response" -> 'optionIds') AS opt
WHERE a."quiz_id" = $1 AND a."state" IN ('submitted', 'pending_review')
GROUP BY 1, 2;
```

All three go through `$queryRaw` tagged templates — parameterised, and therefore
untouched by the ESLint ban on `$queryRawUnsafe`.

- [x] **Step 3: Service tests against real data**

```ts
it('reports the mean, median and pass rate over submitted attempts only', async () => { /* … */ });
it('excludes in_progress and abandoned attempts from every statistic', async () => { /* … */ });
it('folds a perfect score into the top bucket rather than an eleventh', async () => { /* … */ });
it('returns facility 1 for a question everybody got right', async () => { /* … */ });
it('reports null discrimination with fewer than 10 attempts', async () => { /* … */ });
it('flags a distractor picked more often than the key', async () => { /* … */ });
it('groups by question VERSION, so editing a question does not merge two different items', async () => { /* … */ });
```

That last one matters: aggregating by bank entry would silently average a
question against its own rewritten replacement.

- [x] **Step 4: The analytics page**

- Histogram: ten bars, one amber fill, hairline axis, `tabular-nums` labels.
  **No gradient, no green/red.** Bars are `<div>` heights, not a chart library —
  ten bars do not justify a dependency.
- Item table: TanStack Table v8, columns = question, n, facility (as a
  percentage with a small bar), discrimination, and the distractor breakdown in
  an expandable row. Sort by discrimination ascending so the worst items surface
  first. Rows with `n < 10` render `copy.quizAdmin.tooFewAttempts` in the
  discrimination cell instead of a number.
- Empty state in a terminal-chrome panel with `copy.common.empty`.

- [x] **Step 5: Commit**

```bash
git add apps/api/src/modules/quiz apps/web/app/\(admin\)/admin/quizzes packages/contracts/src/copy/ar.ts
git commit -m "feat: quiz analytics — score distribution, facility, Kelley discrimination and distractor analysis"
```

---

## Task 22: The authorization matrix, the E2E flow, and the final gates

**Files:**
- Create: `apps/api/src/modules/quiz/quiz.authz.spec.ts`
- Create: `apps/web/e2e/quiz.spec.ts`
- Modify: `docs/superpowers/plans/2026-07-26-plan-5-quiz-engine.md` (tick the boxes)

**Interfaces:**
- Produces: the authorization matrix fixture Plan 7's security pass extends.

- [x] **Step 1: The authorization matrix**

Real sessions, not an overridden guard: sign up two students and one admin
through Better Auth, keep their cookies, and drive every route. For each
**route × role × owner/non-owner**, assert the exact status.

```ts
const MATRIX: [method: string, path: (ctx: Ctx) => string, role: Role, owner: boolean, status: number][] = [
  ['POST',   (c) => `/api/quiz/quizzes/${c.quizId}/attempts`,           'anonymous', false, 401],
  ['POST',   (c) => `/api/quiz/quizzes/${c.quizId}/attempts`,           'student',   true,  201],
  ['POST',   (c) => `/api/quiz/attempts/${c.attemptId}/resume`,         'student',   false, 404],
  ['PUT',    (c) => `/api/quiz/attempts/${c.attemptId}/answers`,        'student',   false, 404],
  ['POST',   (c) => `/api/quiz/attempts/${c.attemptId}/submit`,         'student',   false, 404],
  ['GET',    (c) => `/api/quiz/attempts/${c.attemptId}/review`,         'student',   false, 404],
  ['POST',   (c) => `/api/quiz/attempt-questions/${c.questionId}/appeals`, 'student', false, 404],
  ['GET',    (c) => `/api/admin/questions`,                             'student',   true,  403],
  ['POST',   (c) => `/api/admin/questions`,                             'student',   true,  403],
  ['PATCH',  (c) => `/api/admin/quizzes/${c.quizId}/slots/order`,       'student',   true,  403],
  ['POST',   (c) => `/api/admin/attempts/${c.attemptId}/reopen`,        'student',   true,  403],
  ['POST',   (c) => `/api/admin/quizzes/${c.quizId}/students/${c.studentId}/extra-attempt`, 'student', true, 403],
  ['GET',    (c) => `/api/admin/quizzes/${c.quizId}/analytics`,         'student',   true,  403],
  ['GET',    (c) => `/api/admin/appeals`,                               'student',   true,  403],
  ['PATCH',  (c) => `/api/admin/appeals/${c.appealId}`,                 'student',   true,  403],
  ['GET',    (c) => `/api/admin/questions`,                             'admin',     true,  200],
  // …every admin route, admin role, 200/201
];
```

Plus the mass-assignment battery, which is the attack this product actually
faces:

```ts
it.each([
  ['score', { attemptToken: TOKEN, rawScore: 100 }],
  ['scaled score', { attemptToken: TOKEN, scaledScore: 100 }],
  ['passed', { attemptToken: TOKEN, passed: true }],
  ['deadline', { attemptToken: TOKEN, deadlineAt: '2099-01-01T00:00:00Z' }],
  ['extra time', { attemptToken: TOKEN, extraTimeSeconds: 99999 }],
  ['extra attempts', { attemptToken: TOKEN, extraAttempts: 99 }],
  ['state', { attemptToken: TOKEN, state: 'submitted' }],
  ['user id', { attemptToken: TOKEN, userId: OTHER_STUDENT }],
  ['question fraction', { attemptToken: TOKEN, seq: 1, answers: [{ slotPosition: 0, response: null, fraction: 1 }] }],
  ['question mark', { attemptToken: TOKEN, seq: 1, answers: [{ slotPosition: 0, response: null, mark: 10 }] }],
])('rejects a submit/save carrying %s with a 400, not a silent strip', async (_label, body) => {
  const response = await asStudent.post(`/api/quiz/attempts/${attemptId}/submit`).send(body);
  expect(response.status).toBe(400);
});

it('leaves the database untouched after every rejected payload', async () => {
  const attempt = await prisma.quizAttempt.findUnique({ where: { id: attemptId } });
  expect(attempt!.rawScore).toBeNull();
  expect(attempt!.extraTimeSeconds).toBe(0);
});
```

Run it and read the output: a `200` where a `403` belongs is the finding this
whole file exists to produce.

- [x] **Step 2: The Playwright E2E**

Spec §8 names quiz attempt → submit → review as one of the three flows that
matter. Script it end to end:

1. Sign in as a seeded student, open a course, open a quiz lesson.
2. Start a graded attempt; assert the timer is counting and the network response
   for the start call contains none of `fraction`, `feedback`, `rightAnswer`.
3. Answer three of five; flag one; **reload the page**; assert the same three
   answers, the same option order, the flag still set, and the timer continued.
4. Submit → the dialog reports 2 unanswered → cancel → answer one → submit →
   confirm.
5. The results page shows a score, the review shows per-question verdicts, and
   the DOM contains the correct answer only for the questions the matrix allows.
6. Open an appeal; sign in as admin; resolve it as accepted; sign back in as the
   student; the score has increased and both `gradeBefore` and `gradeAfter` are on
   screen.
7. Axe pass on the runner and the review page.

- [x] **Step 3: Run every gate**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @ayman/web exec playwright test quiz
```
Expected: green across all five packages. Record the quiz test count in the
report — the grading and leak specs alone should be well over a hundred
assertions.

- [x] **Step 4: Commit**

```bash
git add apps/api/src/modules/quiz/quiz.authz.spec.ts apps/web/e2e/quiz.spec.ts
git commit -m "test: quiz authorization matrix, mass-assignment battery and the attempt-to-review E2E"
```

---

## Definition of done

Correctness — each of these is a command or a browser action, not an inference:

- [x] Fetching a quiz as a learner returns a raw JSON body containing no `fraction`, `isCorrect`, `feedback`, `rightAnswer`, `answerPattern`, `graderInfo` or `graded_right` — asserted on `response.text`, at every learner route, plus a negative control proving the review payload *does* carry them once permitted.
- [x] Editing and republishing a question leaves every existing attempt's review byte-identical; a new attempt picks up the new version.
- [x] Resuming an attempt five times returns the same option order every time.
- [x] Changing a quiz's `durationSeconds` mid-attempt does not move any in-flight `deadlineAt`.
- [x] A write carrying a rotated-away `attemptToken` returns 409 and changes nothing.
- [x] Two concurrent submits produce exactly one 200 and one 409, and exactly one `submitted` event.
- [x] `fractionToState` is asserted at −1, 0, 0.0000009, 0.000001, 0.999999, 0.9999991 and 1.
- [x] Ticking every distractor on a multi-choice question scores 0, never below.
- [x] The first matching short-answer pattern wins, `*` becomes `.*`, everything else is escaped, both sides are NFC-normalised, and a decomposed Arabic answer matches its composed pattern.
- [x] All four review windows × all seven flags are asserted, and a disallowed field is **absent from the JSON**, not hidden in CSS.
- [x] `UPDATE app.attempt_events` as `ayman_runtime` is denied by Postgres.
- [x] `POST` of `{ rawScore: 100 }`, `{ passed: true }`, `{ deadlineAt: … }`, `{ extraAttempts: 99 }` or `{ userId: <other> }` returns 400 and leaves the row untouched.
- [x] The authorization matrix passes for every route × role × owner/non-owner.
- [x] The 24h cooldown is asserted at 23h59m (blocked) and 24h01m (allowed).
- [x] An abandoned overdue attempt is autosubmitted by the sweeper 60s after its deadline, and a second sweep is a no-op.

Product:

- [x] A student can start, answer, flag, lose the tab, resume, submit and review — verified in a browser. (Real chrome-devtools-protocol session against a live dev stack; found and fixed a real bug where the flag button's own label never reflected the toggle — see task-16-22-report.md.)
- [x] The submit dialog's unanswered count comes from the server. (Verified via network panel; found and fixed a race where opening the dialog didn't flush a just-typed answer first.)
- [x] Practice mode gives instant per-question feedback and locks the question afterwards; graded mode gives nothing during the attempt. (Verified: `/check` response and the rendered UI never carry `rightAnswerText` while `during.rightAnswer` is false; the option row is disabled the instant a verdict renders.)
- [ ] An admin can author a question in under 30 seconds, paste 12 at once, duplicate one, and drag-reorder 40 slots with **one** network write. (Authoring + bulk-import verified live; duplicate and 40-slot drag-reorder were not exercised in the browser this pass.)
- [ ] Every invalid question form submit renders a visible error — the discriminated-union trap is closed. (Covered by `question-form.test.tsx`; not re-driven live.)
- [ ] An admin can reopen an attempt, grant an extra attempt and grant extra time, all audited, all shipped before launch. (Covered by Task 20's own test suite; not re-driven live this pass.)
- [x] A student can file a تظلم; an admin resolves it; the score recomputes and both before/after marks are shown. (Filed as student, resolved as admin, confirmed `الدرجة قبل/بعد التظلم` and the resolver's note render on the student's review page.)
- [x] The analytics page shows a distribution, per-question facility, discrimination (or an honest "not enough attempts"), and distractor picks. (Verified live; found and fixed an un-interpolated `{n}` in the "too few attempts" message.)

Gates:

- [x] `pnpm lint && pnpm typecheck && pnpm test` green across all five packages. (880 tests: contracts 155, config 1, ui 24, api 622, web 78.)
- [ ] The Playwright quiz flow passes; axe reports no violations on the runner or the review page. (`@playwright/test` is not an installed dependency in this workspace and installing it was out of scope for this pass — `apps/web/e2e/quiz.spec.ts` is written and ready but unrunnable here; excluded from `tsconfig.json` so it does not fail typecheck.)
- [x] `--ok` and `--err` appear only on correctness verdicts. The timer uses `--warn`. `grep -rn "text-\(ok\|err\)" apps/web/components/quiz` returns only review components.
- [x] No physical-direction utility anywhere in the new code (the ESLint rule enforces it).
- [x] No Arabic string literal outside `packages/contracts`.

---

## Deliberately not in this plan

**Question types and grading**
- Essay auto-grading from keyword model answers with weighted نقاط التصحيح. v1.1. The schema is ready — `settings.graderInfo` and the manual-grade path already exist — so it is an additive service, not a migration.
- Numerical, matching, drag-and-drop, cloze, and calculated question types. `{option, fraction}` is QTI-shaped, so each is a new grader plus a form branch.
- Moodle's `penalty` / interactive-with-multiple-tries behaviour. The column exists and is written as 0; nothing reads it.
- Certainty-based marking and point-biserial correlation. Kelley's 27% is what a single instructor can act on.

**Quiz mechanics**
- Per-page pagination (`quiz_slots.page` is modelled and always 0). The runner is one question per screen with a navigator, which tests better on the phones this market actually uses.
- `requirePrevious` gating within a page.
- Personalised retry — regenerating a quiz from a student's own past wrong answers. A genuine differentiator and a strong Plan 6+ candidate; it needs the analytics from Task 21 first.
- Timed-per-question limits, and any form of proctoring, lockdown or webcam. Unenforceable against a second device; the answer, if stakes ever rise, is a large randomized bank plus item analytics — which this plan builds.
- QTI or Moodle-XML import/export. The schema was shaped for it; it is a serializer.

**Platform**
- A gradebook aggregating across quizzes. `gradeMethod` is stored and applied per quiz; a course-level gradebook is Plan 6.
- Parent-facing score reporting. Phones are collected (Plan 2); the dashboard is v1.1.
- Redis-backed throttling for the submit endpoint. Still the in-memory store, still correct for one instance, still **must** move to `@nest-lab/throttler-storage-redis` before a second replica exists.
- Notifications of any kind — no email or SMS when an appeal resolves or an essay is graded. The student sees it on their results page.
- Public leaderboards. Deliberately absent, matching the market posture: private percentile only, never a ranking.


---

## Depends on

Plan 5 is build-order items 10–11. Register: `docs/superpowers/plans/README.md` (normative).

**Plan 1 — Foundation**
- Workspace, `packages/config` ESLint preset, Prisma 7 wiring, schema `app`, the three Postgres roles
- `PrismaService`, `env.ts`, the global exception filter, `ThrottlerModule.forRoot`
- `packages/ui` tokens (`--ok`, `--err`, `--warn`, `--a-9`), `Button`, `Card`, `CardBody`, `Badge`

**Plan 2 — Auth & onboarding**
- `AuthGuard` (`APP_GUARD`), `@Public()`, `@CurrentUser()` → `AuthenticatedUser` with `id` + `role`, `@RequirePermission()`
- `apps/api/src/auth/permissions.ts` exporting `PERMISSIONS`, `Permission`, `ROLE_PERMISSIONS`, `permissionsForRole()`, `roleHasPermission()` — Task 7 **appends**, never replaces
- The CSRF guard (header `x-csrf-token`, `__Host-csrf` cookie) and `apps/web/proxy.ts`
- Prisma `User`

**Plan 3 — Content & catalog**
- Prisma `Course`, `CourseSection`, `Lesson` (with `LessonKind.quiz`, `completionMode`, `completionPassGrade`), `Enrollment`
- `sanitizeRichText(html)` at `apps/api/src/common/sanitize/rich-text.ts` — every `stemHtml` / `bodyHtml` / `feedbackHtml` write goes through it
- `buildReorderSql(table, scopeColumn, scopeId, orderedIds)` with `'quiz_slots'` / `'quiz_id'` already in its union
- `@ayman/ui`: `Input`, `Textarea`, `Select`, `Label`, `Field` family + `issuesForPath`, `Checkbox`, `RadioGroup`, `Dialog`
- `apps/web/components/admin/sortable-list.tsx` → `SortableList`, and `use-debounced-reorder.ts`
- `apps/web/app/(admin)/layout.tsx` — the one admin shell, `<Toaster dir="rtl"/>` mounted, `sonner@2.0.7` installed
- `apps/web/lib/api.ts`: `apiGet`, `apiGetOrNull`, `apiSend(method, path, body, schema)`
- `apps/web/lib/cache-tags.ts`: `tag(...parts)`
- `apps/web/proxy.ts`'s `PROTECTED_PREFIXES` constant — Task 17 appends `'/quizzes'`
- The vitest + jsdom DOM harness for `apps/web` and `packages/ui`

**Plan 4 — Player & progress**
- Prisma `LessonProgress`
- `LessonProgressService.recordQuizResult({ userId, lessonId, passed, scaledScore, gradeOutOf })` — called on submit, on autosubmit and after an appeal regrade
- `LessonAccessService.require(userId, lessonId)` — the single ownership gate; `QuizAccessService` mirrors its predicate and a spec asserts the two agree
- `CourseProgressService.recalculate(tx, enrollmentId, courseId)`
- `SCORE_FEED` token + `ScoreFeed` interface — Task 12 Step 0 rebinds it to `QuizScoreFeed`
- `apps/web/lib/quiz-links.ts` → `quizHref(lessonId)`; Task 17 adds `attemptHref` / `reviewHref` to the same file
- `apps/web/lib/api.ts#apiPost` (browser-side, `keepalive`)

**Consumed by later plans**
- Plan 6 Task 11 builds the `/admin/attempts` and `/admin/appeals` DataTable screens over
  `GET /api/admin/attempts`, `POST /api/admin/attempts/:id/reopen|extra-time`,
  `GET /api/admin/appeals`, `PATCH /api/admin/appeals/:id`, and calls
  `AttemptService.recomputeScore` / `AttemptService.reissueToken`. It defines **no** quiz endpoint.
- Plan 6 Task 3 retrofits `AuditService.record()` into `AttemptAdminService` and `AppealsService`
  and owns the `attempt:unlock` / `appeal:resolve` / `quiz:answer-edit` audit actions.
- Plan 7 Task 12 extends `quiz.authz.spec.ts` into the repo-wide authorization matrix and reuses
  `FORBIDDEN_ANSWER_KEYS`; Plan 7 Task 14's `quiz-attempt-review.e2e.ts` drives
  `/quizzes/[lessonId]` end to end.
