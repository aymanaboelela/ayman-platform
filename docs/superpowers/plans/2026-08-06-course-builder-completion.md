# Course Builder Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the admin course builder — wire every content API capability that has no UI, make deleting safe, reduce the course exam to one button, and render the whole thing in the same visual objects the student sees.

**Architecture:** The content API is complete and tested; this is almost entirely a web-app task, with two API additions. Delete guards come first because the UI they enable would otherwise 500. The admin adopts `study.css`'s existing object vocabulary (`.unit`, `.lesson-row`, `.chip`) rather than inventing a second one, so the course an instructor builds looks like the course a student studies.

**Tech Stack:** NestJS 11 + Prisma 7 + Postgres (`apps/api`), Next.js App Router + React Server Components + server actions (`apps/web`), Zod contracts shared through `@ayman/contracts`, `@dnd-kit` for reordering, Tailwind v4 over CSS custom properties, Jest (API), Vitest (web), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-08-06-course-builder-completion-design.md`

## Global Constraints

- **Git identity.** Commit with no `-c user.name` / `-c user.email` flags. The global config is correct. Never `m.hasnawi@avnology.com`.
- **Branch.** All work lands on `feat/course-builder-completion`, already cut from `origin/main`. `main` is protected by a ruleset; land through a PR.
- **Shared checkout.** Other Claude sessions commit in this same working directory. Before every commit run `git log --oneline -3` and confirm HEAD is yours; stage files by explicit path, never `git add -A`.
- **Arabic copy lives in `packages/contracts/src/copy/ar.ts`.** No user-visible string is written inline in a component. Egyptian colloquial, second person, sentence case, no formal register.
- **RTL.** Logical CSS properties only (`margin-inline`, `inset-inline-start`, `padding-block`). The `ayman/no-physical-direction` ESLint rule rejects physical ones and no file is exempt.
- **Colour rule, from `packages/ui/src/tokens/color.css`.** Violet (`--v-stage` / `--v-ink` / `--v-tint` / `--v-tint-line`) is STRUCTURE. Amber (`--a-9`…`--a-12`) is ACTION. `--ok` / `--err` belong to quiz correctness and are never spent on "done" or on decoration. `--err` on a destructive control is a status, which is allowed.
- **Storage keys never enter a payload.** `CourseService.findForAdmin` uses `select`, never `include`, and `LessonResource.storageKey` stays out.
- **`attempt_events` can never be deleted — by anyone.** A `BEFORE UPDATE OR DELETE` trigger raises unconditionally and `DELETE` is revoked from `ayman_runtime`. Test fixtures that need an attempt must create a **bare `QuizAttempt` row with no `AttemptEvent` children**, or `afterAll` cleanup will fail and poison the suite.
- **API specs are integration tests against a real database.** They need `DATABASE_URL` and `import 'dotenv/config'` as the first line. A shared Postgres means a parallel session's suite can cause spurious failures — re-run once before believing a red result.
- **Verify before claiming.** No task is complete until its stated command has been run and its output seen.

---

## File Structure

**API — modified**

| File | Responsibility after this plan |
| --- | --- |
| `apps/api/src/modules/content/lesson.service.ts` | + attempt guard in `remove` |
| `apps/api/src/modules/content/section.service.ts` | + attempt guard in `remove` |
| `apps/api/src/modules/content/course.service.ts` | + `scaffoldExam`; `findForAdmin` returns lesson text and student counts |
| `apps/api/src/modules/content/course.controller.ts` | + `POST :id/exam/scaffold` |
| `apps/api/src/modules/content/lesson.service.spec.ts` | + delete-guard cases |
| `apps/api/src/modules/content/section.service.spec.ts` | **created** — the service has no spec today |
| `apps/api/src/modules/content/course.service.spec.ts` | + `scaffoldExam` cases |

**Contracts — modified**

| File | Responsibility |
| --- | --- |
| `packages/contracts/src/copy/ar.ts` | every new Arabic string |
| `packages/contracts/src/content.ts` | + `ExamScaffoldResultSchema` |

**Web — created**

| File | Responsibility |
| --- | --- |
| `apps/web/app/admin.css` | admin-only objects: `.exam-gate`, `.chip--danger`, `.row-actions`, `.inline-edit` |
| `apps/web/components/admin/course/course-editor.tsx` | page shell — header, status actions, course form, exam gate, section list |
| `apps/web/components/admin/course/course-exam-gate.tsx` | the one-button exam entry point and its locked-gate banner |
| `apps/web/components/admin/course/section-list.tsx` | sortable list of sections |
| `apps/web/components/admin/course/section-card.tsx` | one `.unit` — title edit, publish, delete, its lessons |
| `apps/web/components/admin/course/lesson-list.tsx` | sortable list of lessons inside one section |
| `apps/web/components/admin/course/lesson-card.tsx` | one `.lesson-row` — icon well, title, chips, action buttons |
| `apps/web/components/admin/course/lesson-panel.tsx` | the expanded body: kind editor + settings + resources |
| `apps/web/components/admin/course/lesson-settings-form.tsx` | free preview, estimated duration, completion rule |
| `apps/web/components/admin/course/inline-title.tsx` | click-to-edit title, shared by section and lesson |
| `apps/web/components/admin/course/confirm-button.tsx` | destructive action with a confirm dialog and a consequence line |
| `apps/web/e2e/admin-course-builder.e2e.ts` | the full builder path |

**Web — modified**

| File | Responsibility |
| --- | --- |
| `apps/web/app/study.css` | **moved** from `app/(app)/study.css`; now imported by two layouts |
| `apps/web/app/(app)/layout.tsx` | import path updated |
| `apps/web/app/(admin)/layout.tsx` | imports `../study.css` and `./admin.css` |
| `apps/web/app/(admin)/admin/courses/[id]/page.tsx` | payload schema gains `text`, `studentCount`, `examQuizId` |
| `apps/web/app/(admin)/admin/courses/actions.ts` | the nine missing actions |
| `apps/web/components/admin/lesson-resources.tsx` | + edit and reorder |
| `apps/web/components/admin/sortable-list.tsx` | unchanged — already generic |

**Web — deleted**

- `apps/web/components/admin/course-editor.tsx` (split into `course/`)
- `apps/web/components/admin/sortable-lesson-list.tsx` (becomes `course/lesson-list.tsx`)
- `apps/web/components/admin/course-exam-picker.tsx` (folded into `course/course-exam-gate.tsx`)

---

### Task 1: Delete guards

Deleting a lesson cascades `Lesson → Quiz → QuizAttempt → AttemptEvent`, and `attempt_events` raises on DELETE. Today that surfaces as a 500. `CourseService.remove` already guards this; the guard was never pushed down to the lesson and the section.

**Files:**
- Modify: `apps/api/src/modules/content/lesson.service.ts:301-323`
- Modify: `apps/api/src/modules/content/section.service.ts:79-103`
- Test: `apps/api/src/modules/content/lesson.service.spec.ts`
- Test: `apps/api/src/modules/content/section.service.spec.ts` (create)

**Interfaces:**
- Consumes: `PrismaService`, `AuditService`, `AUDIT_RESOURCES` — all already imported by both services.
- Produces: `LessonService.remove(id)` and `SectionService.remove(id)` now throw `ConflictException` with body `{ code: 'lesson_has_attempts' | 'section_has_attempts', message: string }`. Task 3's server actions match on HTTP 409.

- [ ] **Step 1: Write the failing lesson test**

Append to `apps/api/src/modules/content/lesson.service.spec.ts`, inside the existing `describe('LessonService', …)`:

```ts
  it('refuses to delete a lesson that has student quiz attempts', async () => {
    const lesson = await service.create(sectionId, {
      title: 'امتحان الوحدة',
      kind: 'quiz',
      isPublished: false,
      isFreePreview: false,
      estimatedSeconds: 0,
      completionMode: 'manual',
      completionMinViewSeconds: null,
      completionPassGrade: null,
    });

    const quiz = await prisma.quiz.create({
      data: { lessonId: lesson.id, reviewOptions: {} },
    });
    // A BARE attempt: no AttemptEvent children. attempt_events cannot be
    // deleted by anyone (trigger + revoke), so an attempt carrying events
    // would make this spec's own afterAll cleanup fail.
    await prisma.quizAttempt.create({
      data: { quizId: quiz.id, userId, attemptNo: 1 },
    });

    await expect(service.remove(lesson.id)).rejects.toBeInstanceOf(ConflictException);
    // Still there — the refusal is not a partial delete.
    await expect(
      prisma.lesson.findUnique({ where: { id: lesson.id }, select: { id: true } }),
    ).resolves.not.toBeNull();
  });

  it('deletes a lesson with no attempts and closes the position gap', async () => {
    const base = {
      kind: 'video' as const,
      isPublished: false,
      isFreePreview: false,
      estimatedSeconds: 0,
      completionMode: 'manual' as const,
      completionMinViewSeconds: null,
      completionPassGrade: null,
    };
    const section = await prisma.courseSection.create({
      data: { courseId, title: 'قسم الحذف', position: 99 },
    });
    const first = await service.create(section.id, { ...base, title: 'واحد' });
    const second = await service.create(section.id, { ...base, title: 'اتنين' });

    await service.remove(first.id);

    const remaining = await prisma.lesson.findUnique({
      where: { id: second.id },
      select: { position: true },
    });
    expect(remaining?.position).toBe(0);
  });
```

Add `ConflictException` to the `@nestjs/common` import at the top of the file — it currently imports only `BadRequestException` and `NotFoundException`.

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @ayman/api exec jest src/modules/content/lesson.service.spec.ts -t "refuses to delete"
```

Expected: FAIL. The delete succeeds instead of throwing, or it throws a raw Prisma error about `attempt_events is append-only` — either way, not a `ConflictException`.

- [ ] **Step 3: Add the guard to `LessonService.remove`**

Replace the opening of `remove` in `apps/api/src/modules/content/lesson.service.ts` (currently line 301):

```ts
  /**
   * Refuses when the lesson carries student attempts, mirroring
   * `CourseService.remove`.
   *
   * This is not politeness. `attempt_events` has a BEFORE DELETE trigger that
   * raises unconditionally and DELETE revoked from `ayman_runtime`, so the
   * cascade Lesson → Quiz → QuizAttempt → AttemptEvent cannot complete: without
   * this guard the admin gets a 500 built out of a Postgres error string.
   *
   * The refusal is PERMANENT — no sequence of admin actions makes the delete
   * succeed later, because attempt history is never removable. The copy
   * therefore points at unpublishing, which takes the lesson away from every
   * student without touching what they already did.
   */
  async remove(id: string): Promise<{ id: string }> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      select: { id: true, sectionId: true, position: true },
    });
    if (!lesson) throw new NotFoundException();

    const attemptCount = await this.prisma.quizAttempt.count({
      where: { quiz: { lessonId: id } },
    });
    if (attemptCount > 0) {
      throw new ConflictException({
        code: 'lesson_has_attempts',
        message: 'this lesson has student quiz attempts and can never be hard-deleted; unpublish it instead',
      });
    }

    await this.prisma.$transaction([
```

The rest of the method — the `$transaction`, the audit record, the `return { id }` — is unchanged.

Add `ConflictException` to the `@nestjs/common` import on line 1.

- [ ] **Step 4: Run the lesson tests**

```bash
pnpm --filter @ayman/api exec jest src/modules/content/lesson.service.spec.ts
```

Expected: PASS, all cases.

- [ ] **Step 5: Write the failing section test**

Create `apps/api/src/modules/content/section.service.spec.ts`:

```ts
// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AuditService } from '../../audit/audit.service';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SectionService } from './section.service';

describe('SectionService', () => {
  let prisma: PrismaService;
  let service: SectionService;
  let courseId: string;
  let userId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as unknown as PrismaService;
    await prisma.$connect();
    service = new SectionService(prisma, new AuditService(prisma));

    const suffix = Date.now().toString(36);
    const user = await prisma.user.create({
      data: { id: `sec-${suffix}`, name: 'أيمن', email: `sec-${suffix}@example.com`, role: 'admin' },
    });
    userId = user.id;
    const offering = await prisma.subjectOffering.findFirstOrThrow({ where: { year: 2 } });
    const course = await prisma.course.create({
      data: {
        slug: `sec-${suffix}`,
        title: 'كورس',
        systemId: offering.systemId,
        year: 2,
        trackId: offering.trackId,
        subjectId: offering.subjectId,
        instructorId: user.id,
      },
    });
    courseId = course.id;
  });

  afterAll(async () => {
    await prisma.course.deleteMany({ where: { instructorId: userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('refuses to delete a section holding a lesson with student attempts', async () => {
    const section = await service.create(courseId, {
      title: 'قسم فيه امتحان',
      summary: null,
      isPublished: false,
    });
    const lesson = await prisma.lesson.create({
      data: { courseId, sectionId: section.id, title: 'امتحان', kind: 'quiz', position: 0 },
    });
    const quiz = await prisma.quiz.create({ data: { lessonId: lesson.id, reviewOptions: {} } });
    // Bare attempt, no events — see the note in lesson.service.spec.ts.
    await prisma.quizAttempt.create({ data: { quizId: quiz.id, userId, attemptNo: 1 } });

    await expect(service.remove(section.id)).rejects.toBeInstanceOf(ConflictException);
    await expect(
      prisma.courseSection.findUnique({ where: { id: section.id }, select: { id: true } }),
    ).resolves.not.toBeNull();
  });

  it('deletes an empty section and closes the position gap', async () => {
    const first = await service.create(courseId, { title: 'أ', summary: null, isPublished: false });
    const second = await service.create(courseId, { title: 'ب', summary: null, isPublished: false });
    const firstPosition = (
      await prisma.courseSection.findUniqueOrThrow({
        where: { id: first.id },
        select: { position: true },
      })
    ).position;

    await service.remove(first.id);

    const remaining = await prisma.courseSection.findUniqueOrThrow({
      where: { id: second.id },
      select: { position: true },
    });
    expect(remaining.position).toBe(firstPosition);
  });

  it('404s on a section that does not exist', async () => {
    await expect(service.remove('00000000-0000-7000-8000-000000000000')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

```bash
pnpm --filter @ayman/api exec jest src/modules/content/section.service.spec.ts -t "refuses to delete"
```

Expected: FAIL — no `ConflictException` is thrown.

- [ ] **Step 7: Add the guard to `SectionService.remove`**

In `apps/api/src/modules/content/section.service.ts`, after the `if (!section) throw new NotFoundException();` line inside `remove`:

```ts
    // One cascade further out than the lesson guard: section → lessons →
    // quizzes → attempts. Same permanent refusal, same reason — see
    // LessonService.remove.
    const attemptCount = await this.prisma.quizAttempt.count({
      where: { quiz: { lesson: { sectionId: id } } },
    });
    if (attemptCount > 0) {
      throw new ConflictException({
        code: 'section_has_attempts',
        message: 'this section holds a lesson with student quiz attempts and can never be hard-deleted; unpublish it instead',
      });
    }
```

Add `ConflictException` to the `@nestjs/common` import on line 1.

- [ ] **Step 8: Run both specs**

```bash
pnpm --filter @ayman/api exec jest src/modules/content/
```

Expected: PASS. If a failure mentions a table this task never touched, a parallel session's suite is sharing the database — re-run once before investigating.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/content/lesson.service.ts \
        apps/api/src/modules/content/section.service.ts \
        apps/api/src/modules/content/lesson.service.spec.ts \
        apps/api/src/modules/content/section.service.spec.ts
git commit -m "fix(content): refuse to delete lessons and sections that hold student attempts

The cascade Lesson → Quiz → QuizAttempt → AttemptEvent cannot complete:
attempt_events has a BEFORE DELETE trigger that raises unconditionally.
Deleting a quiz lesson with one attempt was a 500 built from a Postgres
error string. CourseService already guarded this; the guard now covers
the two levels below it."
```

---

### Task 2: Return what the editor is editing

Two forms discard data because the payload never carried it. `LessonTextForm` renders an empty textarea over an existing body; `LessonVideoForm` renders an empty URL field over an existing video.

**Files:**
- Modify: `apps/api/src/modules/content/course.service.ts:300-358` (`findForAdmin`)
- Modify: `apps/web/app/(admin)/admin/courses/[id]/page.tsx`
- Modify: `apps/web/components/admin/course-editor.tsx:351-407`
- Test: `apps/api/src/modules/content/course.service.spec.ts`

**Interfaces:**
- Produces: `AdminCourseDetail['sections'][number]['lessons'][number]` gains
  `text: { bodyHtml: string } | null`, `studentCount: number`, and
  `quiz: { id: string; isPublished: boolean; slotCount: number } | null`.
  Tasks 4 and 6 consume all three.

- [ ] **Step 1: Write the failing payload test**

Append to `apps/api/src/modules/content/course.service.spec.ts`, inside `describe('CourseService', …)`:

```ts
  it('returns the lesson body, the student count and the quiz shape to the admin editor', async () => {
    const course = await service.create(adminId, input());
    const section = await prisma.courseSection.create({
      data: { courseId: course.id, title: 'قسم', position: 0 },
    });
    const textLesson = await prisma.lesson.create({
      data: { courseId: course.id, sectionId: section.id, title: 'قراءة', kind: 'text', position: 0 },
    });
    await prisma.lessonText.create({
      data: { lessonId: textLesson.id, bodyHtml: '<p>نص المحاضرة</p>' },
    });
    const quizLesson = await prisma.lesson.create({
      data: { courseId: course.id, sectionId: section.id, title: 'اختبار', kind: 'quiz', position: 1 },
    });
    await prisma.quiz.create({
      data: { lessonId: quizLesson.id, reviewOptions: {}, isPublished: true },
    });

    const detail = await service.findForAdmin(course.id);
    const lessons = detail.sections[0].lessons;

    expect(lessons[0].text).toEqual({ bodyHtml: '<p>نص المحاضرة</p>' });
    expect(lessons[0]._count.progress).toBe(0);
    expect(lessons[0].quiz).toMatchObject({ isPublished: true });
    // Never the storage key — an admin payload has no use for one.
    expect(JSON.stringify(detail)).not.toContain('storageKey');
  });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @ayman/api exec jest src/modules/content/course.service.spec.ts -t "returns the lesson body"
```

Expected: FAIL — `lessons[0].text` is `undefined`.

- [ ] **Step 3: Widen `findForAdmin`'s select**

In `apps/api/src/modules/content/course.service.ts`, inside the `lessons: { … select: { … } }` block, after the `video:` line:

```ts
                video: { select: { externalId: true, durationSeconds: true } },
                // The editor prefills from this. Without it the textarea
                // renders empty over an existing body and the instructor
                // overwrites content they never saw.
                text: { select: { bodyHtml: true } },
                // Drives the delete confirmation's consequence line. A row
                // count IS a student count here: lesson_progress is keyed
                // @@id([enrollmentId, lessonId]) and an enrollment is one per
                // user per course, so a lesson cannot hold two rows for the
                // same student.
                _count: { select: { progress: true } },
                // The quiz's SHAPE, never its questions. `slotCount` is what
                // lets the outline say "this exam has no questions yet"
                // without a second round trip.
                quiz: {
                  select: {
                    id: true,
                    isPublished: true,
                    _count: { select: { slots: true } },
                  },
                },
```

- [ ] **Step 4: Run the test**

```bash
pnpm --filter @ayman/api exec jest src/modules/content/course.service.spec.ts -t "returns the lesson body"
```

Expected: PASS.

- [ ] **Step 5: Widen the page's Zod schema**

In `apps/web/app/(admin)/admin/courses/[id]/page.tsx`, inside the lesson object of `AdminCourseDetailSchema`, after the `video:` line:

```ts
          video: z.object({ externalId: z.string(), durationSeconds: z.number().int() }).nullable(),
          text: z.object({ bodyHtml: z.string() }).nullable(),
          _count: z.object({ progress: z.number().int() }),
          quiz: z
            .object({
              id: z.uuid(),
              isPublished: z.boolean(),
              _count: z.object({ slots: z.number().int() }),
            })
            .nullable(),
```

- [ ] **Step 6: Prefill both forms**

In `apps/web/components/admin/course-editor.tsx`, in `LessonVideoForm`, give the URL input a default:

```tsx
        <Input
          id={`video-url-${lesson.id}`}
          name="url"
          dir="ltr"
          // The payload carries the 11-character id, not the URL the admin
          // originally pasted. The canonical short form round-trips: the
          // contract's extractor maps it back to the same id, so saving an
          // untouched field is a no-op rather than a validation error.
          defaultValue={lesson.video ? `https://youtu.be/${lesson.video.externalId}` : undefined}
          required
        />
```

In `LessonTextForm`, change the signature to take the lesson and prefill:

```tsx
function LessonTextForm({ courseId, lesson }: { courseId: string; lesson: Lesson }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    async (_previous, formData) =>
      setLessonTextAction(courseId, lesson.id, String(formData.get('bodyHtml') ?? '')),
    IDLE,
  );

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <Label htmlFor={`body-${lesson.id}`}>{copy.admin.lesson.body}</Label>
      <Textarea
        id={`body-${lesson.id}`}
        name="bodyHtml"
        dir="ltr"
        rows={8}
        defaultValue={lesson.text?.bodyHtml ?? ''}
        required
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {copy.admin.common.save}
        </Button>
        <ActionError state={state} />
      </div>
    </form>
  );
}
```

Update its call site in `LessonDetails`:

```tsx
      {lesson.kind === 'text' ? <LessonTextForm courseId={courseId} lesson={lesson} /> : null}
```

- [ ] **Step 7: Typecheck both apps**

```bash
pnpm --filter @ayman/api run typecheck && pnpm --filter @ayman/web run typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/content/course.service.ts \
        apps/api/src/modules/content/course.service.spec.ts \
        "apps/web/app/(admin)/admin/courses/[id]/page.tsx" \
        apps/web/components/admin/course-editor.tsx
git commit -m "fix(admin): stop the lesson editors discarding what they edit

findForAdmin never selected lesson text, so the body textarea rendered
empty over existing content and the instructor overwrote what they could
not see. The video URL field had the same shape of bug with a milder
outcome. Both now prefill. The payload also gains a per-lesson student
count and quiz shape, which Tasks 4 and 6 need."
```

---

### Task 3: The missing server actions

Nine API capabilities have no server action, or have one no component calls. This task adds the actions with no UI — each is independently testable through its own route.

**Files:**
- Modify: `apps/web/app/(admin)/admin/courses/actions.ts`

**Interfaces:**
- Consumes: `apiSend` from `@/lib/api-server`, `updateTag`/`courseTag` from `@/lib/cache-tags`, `ActionResult` already exported from this file.
- Produces, all returning `Promise<ActionResult>`:
  - `updateSectionAction(courseId, sectionId, input: { title?: string; summary?: string | null })`
  - `deleteSectionAction(courseId, sectionId)`
  - `updateLessonAction(courseId, lessonId, input: UpdateLessonInput)`
  - `deleteLessonAction(courseId, lessonId)`
  - `removeLessonVideoAction(courseId, lessonId)`
  - and the exported type `UpdateLessonInput`.

- [ ] **Step 1: Add the section actions**

Append to `apps/web/app/(admin)/admin/courses/actions.ts`, after `setSectionPublishedAction`:

```ts
export async function updateSectionAction(
  courseId: string,
  sectionId: string,
  input: { title?: string; summary?: string | null },
): Promise<ActionResult> {
  try {
    await apiSend('PATCH', `/api/admin/sections/${sectionId}`, z.object({ id: z.uuid() }), input);
    updateTag(courseTag(courseId));
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/**
 * The API 409s when the section holds a lesson with student attempts —
 * `attempt_events` is append-only at the database level, so that refusal is
 * permanent and no later action makes the delete succeed. The admin gets that
 * fact in Arabic, pointing at unpublishing, never a raw status line.
 */
export async function deleteSectionAction(
  courseId: string,
  sectionId: string,
): Promise<ActionResult> {
  try {
    await apiSend('DELETE', `/api/admin/sections/${sectionId}`, z.object({ id: z.uuid() }));
    updateTag(courseTag(courseId));
    updateTag(TAG_COURSES);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes('failed with 409')
        ? copy.admin.section.deleteBlockedAttempts
        : copy.admin.common.saveFailed;
    return { ok: false, message };
  }
}
```

- [ ] **Step 2: Add the lesson actions**

Append after `setLessonPublishedAction`:

```ts
/**
 * Mirrors `LessonUpdateSchema`'s partial shape. The completion rule is a
 * COUPLED pair — the contract's refine requires `completionMinViewSeconds`
 * with `on_view` and `completionPassGrade` with `on_grade`/`on_pass` — so the
 * caller always sends the mode and its dependent value together. Sending the
 * mode alone is a 400, by design.
 */
export type UpdateLessonInput = {
  title?: string;
  isFreePreview?: boolean;
  estimatedSeconds?: number;
  completionMode?: 'none' | 'manual' | 'on_view' | 'on_grade' | 'on_pass';
  completionMinViewSeconds?: number | null;
  completionPassGrade?: number | null;
};

export async function updateLessonAction(
  courseId: string,
  lessonId: string,
  input: UpdateLessonInput,
): Promise<ActionResult> {
  try {
    await apiSend('PATCH', `/api/admin/lessons/${lessonId}`, z.object({ id: z.uuid() }), input);
    updateTag(courseTag(courseId));
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/** 409 when the lesson has student attempts — see `deleteSectionAction`. */
export async function deleteLessonAction(
  courseId: string,
  lessonId: string,
): Promise<ActionResult> {
  try {
    await apiSend('DELETE', `/api/admin/lessons/${lessonId}`, z.object({ id: z.uuid() }));
    updateTag(courseTag(courseId));
    updateTag(TAG_COURSES);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes('failed with 409')
        ? copy.admin.lesson.deleteBlockedAttempts
        : copy.admin.common.saveFailed;
    return { ok: false, message };
  }
}

export async function removeLessonVideoAction(
  courseId: string,
  lessonId: string,
): Promise<ActionResult> {
  try {
    await apiSend('DELETE', `/api/admin/lessons/${lessonId}/video`, z.object({ lessonId: z.uuid() }));
    updateTag(courseTag(courseId));
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}
```

- [ ] **Step 3: Add the four copy keys these reference**

In `packages/contracts/src/copy/ar.ts`, inside `admin.section`:

```ts
      deleteBlockedAttempts: 'القسم ده فيه محاضرة عليها محاولات امتحان لطلبة، فمينفعش يتمسح — رجّعه مسودة بدل ما تمسحه',
```

Inside `admin.lesson`:

```ts
      deleteBlockedAttempts: 'المحاضرة دي عليها محاولات امتحان لطلبة، فمينفعش تتمسح — رجّعها مسودة بدل ما تمسحها',
```

- [ ] **Step 4: Typecheck and lint**

```bash
pnpm --filter @ayman/web run typecheck && pnpm --filter @ayman/web run lint
```

Expected: no errors. `updateResourceAction` and `reorderResourcesAction` are still uncalled — Task 6 wires them, and lint does not flag an unused export.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(admin)/admin/courses/actions.ts" packages/contracts/src/copy/ar.ts
git commit -m "feat(admin): server actions for section and lesson edit, delete and video removal

Five endpoints the content API has always exposed had no action behind
them. Both delete actions translate the API's 409 into the Arabic that
names the real constraint — student attempts are permanent — and point
at unpublishing."
```

---

### Task 4: The course exam, in one button

Creating an exam takes five steps across three pages, and the quiz it produces has practice defaults: unlimited attempts, answers shown during the attempt. Wrong for a final exam, and nothing says so.

**Permission note.** The operation needs two authorities: `course:update` to add a section and a lesson, `quiz:write` to create the quiz. `RequirePermission` carries one permission, so the second is checked explicitly in the controller rather than by widening a security primitive. Today `admin: '*'` holds both, so nothing changes now — this is what keeps the future `editor` role the permission catalogue anticipates from getting a free quiz-authoring path.

**Files:**
- Modify: `apps/api/src/modules/content/course.service.ts`
- Modify: `apps/api/src/modules/content/course.controller.ts`
- Modify: `packages/contracts/src/content.ts`
- Modify: `apps/web/app/(admin)/admin/courses/actions.ts`
- Test: `apps/api/src/modules/content/course.service.spec.ts`

**Interfaces:**
- Produces: `CourseService.scaffoldExam(courseId): Promise<{ quizId: string; lessonId: string; created: boolean }>`, `POST /api/admin/courses/:id/exam/scaffold`, `ExamScaffoldResultSchema`, and `scaffoldExamAction(courseId): Promise<{ ok: true; quizId: string } | { ok: false; message: string }>`. Task 6's exam gate consumes the action.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/modules/content/course.service.spec.ts`:

```ts
  it('scaffolds an exam as a graded, single-attempt quiz and is idempotent', async () => {
    const course = await service.create(adminId, input());

    const first = await service.scaffoldExam(course.id);
    expect(first.created).toBe(true);

    const quiz = await prisma.quiz.findUniqueOrThrow({ where: { id: first.quizId } });
    // Exam settings, not the practice defaults the lazy-create path uses.
    expect(quiz.mode).toBe('graded');
    expect(quiz.maxAttempts).toBe(1);
    expect(quiz.isPublished).toBe(false);

    const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: first.lessonId } });
    expect(lesson.kind).toBe('quiz');
    expect(lesson.isPublished).toBe(false);
    expect(lesson.courseId).toBe(course.id);

    const withExam = await prisma.course.findUniqueOrThrow({ where: { id: course.id } });
    expect(withExam.examLessonId).toBe(first.lessonId);

    // Second press returns the same exam rather than building another.
    const second = await service.scaffoldExam(course.id);
    expect(second).toEqual({ ...first, created: false });
    await expect(
      prisma.courseSection.count({ where: { courseId: course.id } }),
    ).resolves.toBe(1);
  });

  it('404s when scaffolding an exam on a course that does not exist', async () => {
    await expect(
      service.scaffoldExam('00000000-0000-7000-8000-000000000000'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @ayman/api exec jest src/modules/content/course.service.spec.ts -t "scaffolds an exam"
```

Expected: FAIL with `service.scaffoldExam is not a function`.

- [ ] **Step 3: Implement `scaffoldExam`**

Add to `apps/api/src/modules/content/course.service.ts`, after `setExamLesson`. Add `DEFAULT_REVIEW_OPTIONS_GRADED` and `EXAM_SECTION_TITLE` to the `@ayman/contracts` imports at the top:

```ts
  /**
   * Builds the course's final exam — section, lesson, quiz and pointer — in one
   * transaction, and returns the existing one untouched if there already is
   * one.
   *
   * IDEMPOTENT BY CONTRACT, not by convention: `courses.exam_lesson_id` is
   * unique and the composite FK `courses_exam_lesson_in_same_course` already
   * makes a cross-course pointer impossible, but neither stops a second press
   * from creating a SECOND orphan section-and-lesson that no course points at.
   * The early return is what does.
   *
   * The quiz is created with GRADED defaults. The lazy-create path in
   * `admin/quizzes/lesson/[lessonId]` builds a practice quiz — unlimited
   * attempts, correctness revealed during the attempt — which is right for a
   * lesson quiz and silently wrong for a final exam. An instructor who never
   * opened the settings tab would have shipped it.
   *
   * Everything is created UNPUBLISHED. The exam becomes visible through the
   * same publish toggles as any other content, so there is one publishing
   * story rather than two.
   */
  async scaffoldExam(
    courseId: string,
  ): Promise<{ quizId: string; lessonId: string; created: boolean }> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, examLessonId: true },
    });
    if (!course) throw new NotFoundException();

    if (course.examLessonId !== null) {
      const existing = await this.prisma.quiz.findUnique({
        where: { lessonId: course.examLessonId },
        select: { id: true },
      });
      // A designated exam lesson with no quiz row yet is legal — it happens
      // when an instructor promoted a hand-made quiz lesson before opening
      // the builder. Fall through and create just the quiz for it.
      if (existing) {
        return { quizId: existing.id, lessonId: course.examLessonId, created: false };
      }
      const quiz = await this.prisma.quiz.create({
        data: {
          lessonId: course.examLessonId,
          mode: 'graded',
          maxAttempts: 1,
          shuffleQuestions: true,
          reviewOptions: DEFAULT_REVIEW_OPTIONS_GRADED,
          isPublished: false,
        },
        select: { id: true },
      });
      return { quizId: quiz.id, lessonId: course.examLessonId, created: true };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const last = await tx.courseSection.findFirst({
        where: { courseId },
        orderBy: [{ position: 'desc' }, { id: 'desc' }],
        select: { position: true },
      });

      const section = await tx.courseSection.create({
        data: {
          courseId,
          title: EXAM_SECTION_TITLE,
          summary: null,
          isPublished: false,
          position: last === null ? 0 : last.position + 1,
        },
        select: { id: true },
      });

      const lesson = await tx.lesson.create({
        data: {
          courseId,
          sectionId: section.id,
          title: EXAM_SECTION_TITLE,
          kind: 'quiz',
          position: 0,
          isPublished: false,
        },
        select: { id: true },
      });

      const quiz = await tx.quiz.create({
        data: {
          lessonId: lesson.id,
          mode: 'graded',
          maxAttempts: 1,
          shuffleQuestions: true,
          reviewOptions: DEFAULT_REVIEW_OPTIONS_GRADED,
          isPublished: false,
        },
        select: { id: true },
      });

      await tx.course.update({
        where: { id: courseId },
        data: { examLessonId: lesson.id },
      });

      return { quizId: quiz.id, lessonId: lesson.id };
    });

    await this.audit.record({
      action: 'course:update',
      resourceType: AUDIT_RESOURCES.course,
      resourceId: courseId,
      outcome: 'success',
      metadata: { operation: 'scaffoldExam', lessonId: result.lessonId, quizId: result.quizId },
    });

    return { ...result, created: true };
  }
```

- [ ] **Step 4: Add the shared title constant and the result schema**

In `packages/contracts/src/content.ts`, after `CourseExamPatchSchema`:

```ts
/**
 * The title the scaffolded exam's section and lesson both carry. A constant
 * rather than a literal in the service because the E2E spec asserts on it, and
 * a test that hardcodes its own copy of a string passes forever after the
 * string changes.
 */
export const EXAM_SECTION_TITLE = 'الامتحان النهائي';

export const ExamScaffoldResultSchema = z
  .object({ quizId: z.uuid(), lessonId: z.uuid(), created: z.boolean() })
  .strict();
```

- [ ] **Step 5: Run the test**

```bash
pnpm --filter @ayman/api exec jest src/modules/content/course.service.spec.ts -t "scaffolds an exam"
```

Expected: PASS.

- [ ] **Step 6: Add the endpoint**

In `apps/api/src/modules/content/course.controller.ts`, after `setExam`:

```ts
  /**
   * Builds the course's exam in one call. `course:update` on the decorator,
   * `quiz:write` checked here.
   *
   * The decorator carries ONE permission and this operation genuinely needs
   * two — it adds a section and a lesson (course authoring) AND creates a quiz
   * (quiz authoring). Widening the decorator to take a list would change a
   * security primitive for one route; checking the second here is local and
   * fails closed. Today `admin: '*'` holds both, so this changes nothing now —
   * it is what stops the `editor` role the permission catalogue anticipates
   * from getting a quiz-authoring path it was never granted.
   */
  @RequirePermission('course:update')
  @Post(':id/exam/scaffold')
  scaffoldExam(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (!roleHasPermission(user.role, 'quiz:write')) {
      throw new ForbiddenException('scaffolding an exam also requires quiz:write');
    }
    return this.courses.scaffoldExam(id);
  }
```

Add `ForbiddenException` to the `@nestjs/common` import and `import { roleHasPermission } from '../../auth/permissions';`.

- [ ] **Step 7: Add the server action**

In `apps/web/app/(admin)/admin/courses/actions.ts`, replacing nothing — append after `setCourseExamAction`. Add `ExamScaffoldResultSchema` to the `@ayman/contracts` import:

```ts
export type ScaffoldExamResult = { ok: true; quizId: string } | { ok: false; message: string };

/**
 * One press builds the exam and hands back the quiz to open. Safe to press
 * twice: the API returns the existing exam rather than making a second one.
 */
export async function scaffoldExamAction(courseId: string): Promise<ScaffoldExamResult> {
  try {
    const result = await apiSend(
      'POST',
      `/api/admin/courses/${courseId}/exam/scaffold`,
      ExamScaffoldResultSchema,
    );
    updateTag(courseTag(courseId));
    updateTag(TAG_COURSES);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true, quizId: result.quizId };
  } catch {
    return { ok: false, message: copy.admin.exam.scaffoldFailed };
  }
}
```

- [ ] **Step 8: Add the copy keys**

In `packages/contracts/src/copy/ar.ts`, inside `admin.exam`:

```ts
      scaffold: 'أضف امتحان الكورس',
      open: 'افتح الامتحان',
      scaffoldFailed: 'مقدرناش نعمل الامتحان — جرّب تاني',
      advanced: 'اختيارات متقدمة',
      questionCount: 'سؤال',
      noQuestions: 'لسه من غير أسئلة',
      gateLocked: 'هيتفتح للطالب بعد ما يخلّص',
      gateLessonUnit: 'محاضرة',
      gateNoLessons: 'مفيش محاضرات منشورة لسه، فالامتحان هيتفتح على طول',
```

- [ ] **Step 9: Typecheck, then run the whole content suite**

```bash
pnpm --filter @ayman/api run typecheck \
  && pnpm --filter @ayman/web run typecheck \
  && pnpm --filter @ayman/api exec jest src/modules/content/
```

Expected: no type errors, all content specs pass.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/content/course.service.ts \
        apps/api/src/modules/content/course.controller.ts \
        apps/api/src/modules/content/course.service.spec.ts \
        packages/contracts/src/content.ts \
        packages/contracts/src/copy/ar.ts \
        "apps/web/app/(admin)/admin/courses/actions.ts"
git commit -m "feat(content): build a course exam in one call

Section, lesson, quiz and pointer in one transaction, idempotent on the
course's exam_lesson_id. The quiz gets GRADED defaults — single attempt,
nothing revealed mid-attempt — where the lazy-create path builds a
practice quiz an instructor could ship without ever opening settings.

course:update on the decorator, quiz:write checked in the controller:
the operation needs both authorities and the decorator carries one."
```

---

### Task 5: Move the object vocabulary where the admin can reach it

`study.css` defines `.stage`, `.unit`, `.lesson-row`, `.chip`, `.tile` — contrast-measured, RTL-correct, reduced-motion-aware, and written as the answer to "the signed-in area reads as black and white". It is imported only by `(app)`, so the admin, which edits exactly these objects, cannot use them.

This task is a **pure move plus a component split with no behaviour change**, reviewed as one. New controls arrive in Task 6.

**Files:**
- Move: `apps/web/app/(app)/study.css` → `apps/web/app/study.css`
- Create: `apps/web/app/admin.css`
- Modify: `apps/web/app/(app)/layout.tsx:1-7`, `apps/web/app/(admin)/layout.tsx`
- Create: the eight files under `apps/web/components/admin/course/`
- Delete: `apps/web/components/admin/course-editor.tsx`, `sortable-lesson-list.tsx`, `course-exam-picker.tsx`

- [ ] **Step 1: Move the stylesheet and update both layouts**

```bash
git mv "apps/web/app/(app)/study.css" apps/web/app/study.css
```

In `apps/web/app/(app)/layout.tsx`, replace the import comment and path (lines 2–7):

```tsx
// The study vocabulary — `.stage`, `.unit`, `.lesson-row`, `.chip`, `.tile`.
// Imported by THIS layout and by `(admin)`, not by `globals.css`: the admin
// edits exactly these objects and should render them, while a marketing page
// that picked up `.unit` would be styling something that means nothing there.
import '../study.css';
```

In `apps/web/app/(admin)/layout.tsx`, add above the component imports:

```tsx
// The same objects the student sees. An instructor building a section should be
// looking at the section a student will study — see `app/study.css`.
import '../study.css';
// Admin-only additions on top of it: destructive chips, the row action cluster,
// inline title editing, the exam gate.
import './admin.css';
```

- [ ] **Step 2: Create the admin stylesheet**

Create `apps/web/app/admin.css`:

```css
/* ===========================================================================
   Admin-only objects, layered on `app/study.css`.

   Entry requirement is the same as study.css's: a class here is used by more
   than one admin component. A class used once belongs in its component.

   The colour rule is unchanged and is not negotiable here either — violet is
   STRUCTURE, amber is ACTION, `--ok`/`--err` belong to quiz correctness. A
   destructive control wearing `--err` is a STATUS, which is the one thing that
   ramp is for.
   =========================================================================== */

/* ---------------------------------------------------------------------------
   .row-actions — the cluster a section or lesson row ends with.

   The student's row ends in ONE chip («مشاهدة»). The instructor's ends in
   four, and four chips at equal weight is a toolbar, not a row. So the
   destructive one is pushed to the end behind a hairline and only takes colour
   on hover: it must be reachable in one click and must not be the first thing
   the eye lands on.
   --------------------------------------------------------------------------- */
.row-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--s-4);
}

.row-actions__sep {
  inline-size: var(--hairline);
  block-size: 1.25rem;
  margin-inline: var(--s-4);
  background: var(--border);
}

.chip--danger {
  border: var(--hairline) solid transparent;
  background: transparent;
  color: var(--n-11);
}

.chip--danger:hover {
  border-color: color-mix(in oklch, var(--err), transparent 70%);
  background: color-mix(in oklch, var(--err), transparent 92%);
  color: var(--err);
}

/* ---------------------------------------------------------------------------
   .inline-edit — a title that becomes its own input.

   A separate «تعديل الاسم» form per section is four fields on a page that
   already has forty. The title IS the field; pressing it swaps a button for an
   input at the same size and position, so nothing moves.
   --------------------------------------------------------------------------- */
.inline-edit__button {
  display: block;
  inline-size: 100%;
  padding: var(--s-4) var(--s-8);
  margin-inline-start: calc(-1 * var(--s-8));
  border-radius: var(--r-sm);
  text-align: start;
  cursor: text;
  transition: background var(--d-hover) var(--ease-out);
}

.inline-edit__button:hover {
  background: color-mix(in oklch, var(--v-tint), transparent 40%);
}

.inline-edit__input {
  inline-size: 100%;
  padding: var(--s-4) var(--s-8);
  margin-inline-start: calc(-1 * var(--s-8));
  border: var(--hairline) solid var(--v-tint-line);
  border-radius: var(--r-sm);
  background: var(--n-1);
  color: var(--n-12);
  font: inherit;
}

/* ---------------------------------------------------------------------------
   .exam-gate — the course's final exam, drawn as the gate it actually is.

   This is the one object on the page that is not a section, and it should not
   look like one. The exam has a rule nothing else in the product has: it opens
   only when every OTHER published lesson is cleared (`gate-rule.ts`). So the
   band states that rule with the course's own live number — «هيتفتح للطالب بعد
   ما يخلّص ٢٤ محاضرة» — instead of a paragraph of help text nobody reads.

   Built on `.stage`'s treatment rather than `.unit`'s: a gate is a threshold,
   not a container, and the deeper violet is what separates it from the four
   section headers above it.
   --------------------------------------------------------------------------- */
.exam-gate {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-16);
  padding: var(--s-20);
  border-radius: var(--r-lg);
  background: linear-gradient(160deg, var(--v-stage) 0%, var(--v-stage-deep) 100%);
  color: var(--ink-fg);
}

.exam-gate::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  border-radius: inherit;
  box-shadow: inset 0 0 0 var(--hairline) rgb(255 255 255 / 0.12);
}

/* The notch: a repeating hairline down the inline-start edge, reading as the
   teeth of a gate. Decorative and hidden from assistive tech — the band says
   the same thing in words. */
.exam-gate::before {
  content: '';
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  z-index: 1;
  inline-size: 0.5rem;
  background: repeating-linear-gradient(
    to bottom,
    rgb(255 255 255 / 0.22) 0 0.25rem,
    transparent 0.25rem 0.5rem
  );
}

.exam-gate__body {
  position: relative;
  z-index: 3;
  flex: 1;
  min-inline-size: 0;
}

.exam-gate__title {
  font-size: var(--fs-title-4);
  font-weight: var(--fw-semibold);
}

/* Same reasoning as `.stage`'s `--stage-fg-2`: `--ink-fg-2` is tuned for a
   near-black panel and fails on a mid-lightness violet. A translucent white
   composites against whatever part of the gradient it lands on. */
.exam-gate__rule {
  margin-block-start: var(--s-4);
  color: rgb(255 255 255 / 0.86);
  font-size: var(--fs-text-sm);
}

.exam-gate__count {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.exam-gate__actions {
  position: relative;
  z-index: 3;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--s-8);
}
```

- [ ] **Step 3: Split the editor — mechanical, no behaviour change**

Create the eight files under `apps/web/components/admin/course/` by moving the existing components out of `course-editor.tsx` verbatim:

| New file | Moved from |
| --- | --- |
| `course-editor.tsx` | `CourseEditor`, `ArchiveCourseButton`, `RestoreCourseButton`, `DeleteCourseButton`, `ActionError`, `IDLE`, `COURSE_STATUS_LABEL` |
| `section-card.tsx` | `SectionEditor` (renamed `SectionCard`), `AddSectionForm` |
| `lesson-panel.tsx` | `LessonDetails` (renamed `LessonPanel`), `LessonVideoForm`, `LessonTextForm`, `AddLessonForm`, `LESSON_KINDS` |
| `lesson-list.tsx` | the whole of `components/admin/sortable-lesson-list.tsx` |
| `course-exam-gate.tsx` | the whole of `components/admin/course-exam-picker.tsx` |

`section-list.tsx`, `lesson-card.tsx`, `lesson-settings-form.tsx`, `inline-title.tsx` and `confirm-button.tsx` are created empty-of-behaviour in Task 6 — do not create them here.

`ActionError` and `IDLE` are used by three of the new files. Export both from `course-editor.tsx` and import them in the others rather than declaring three copies.

Update the import in `apps/web/app/(admin)/admin/courses/[id]/page.tsx`:

```tsx
import { CourseEditor } from '@/components/admin/course/course-editor';
```

Then delete the three old files:

```bash
git rm apps/web/components/admin/course-editor.tsx \
       apps/web/components/admin/sortable-lesson-list.tsx \
       apps/web/components/admin/course-exam-picker.tsx
```

- [ ] **Step 4: Verify nothing else imported them**

```bash
grep -rn "course-editor\|sortable-lesson-list\|course-exam-picker" apps/web --include=*.tsx --include=*.ts | grep -v node_modules | grep -v "components/admin/course/"
```

Expected: only the updated `[id]/page.tsx` line. Any other hit is an import that must be repointed.

- [ ] **Step 5: Typecheck, lint, unit tests**

```bash
pnpm --filter @ayman/web run typecheck \
  && pnpm --filter @ayman/web run lint \
  && pnpm --filter @ayman/web run test
```

Expected: all green. The move changed no behaviour, so no test should need editing — if one does, the move was not mechanical.

- [ ] **Step 6: Confirm the admin renders**

```bash
pnpm --filter @ayman/web run build
```

Expected: build succeeds. `/admin/courses/[id]` must still appear in the route list.

- [ ] **Step 7: Commit**

```bash
git add -u && git add apps/web/app/admin.css apps/web/components/admin/course/
git commit -m "refactor(admin): split the course editor and share the study vocabulary

course-editor.tsx was 465 lines holding seven components, and every
capability still to be wired would have grown it.

study.css moves up one level so (admin) can import it too. Its objects —
.unit, .lesson-row, .chip — were built for the student's outline, which
is the same outline the instructor is authoring; rendering it in a second
private vocabulary is what let the two drift. admin.css adds only what
the student surface has no use for.

No behaviour change. New controls are the next commit."
```

---

### Task 6: The controls

Everything is in place: guarded endpoints, actions, payload, objects. This task builds the visible surface.

**Files:**
- Create: `apps/web/components/admin/course/inline-title.tsx`, `confirm-button.tsx`, `section-list.tsx`, `lesson-card.tsx`, `lesson-settings-form.tsx`
- Modify: `apps/web/components/admin/course/course-editor.tsx`, `section-card.tsx`, `lesson-panel.tsx`, `course-exam-gate.tsx`
- Modify: `apps/web/components/admin/lesson-resources.tsx`
- Test: `apps/web/components/admin/course/lesson-settings-form.test.tsx`

**Interfaces:**
- Consumes: every action from Tasks 3 and 4; `LessonKindIcon` from `@/components/player/lesson-kind-icon`; `SortableList` from `@/components/admin/sortable-list`; `AdminCourseDetail` from the page.
- Produces: `InlineTitle({ value, label, onSave })`, `ConfirmButton({ label, confirmTitle, confirmBody, consequence, onConfirm, tone })`.

- [ ] **Step 1: Write the failing settings-form test**

Create `apps/web/components/admin/course/lesson-settings-form.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LessonSettingsForm } from './lesson-settings-form';

const lesson = {
  id: '00000000-0000-7000-8000-000000000001',
  isFreePreview: false,
  estimatedSeconds: 0,
  completionMode: 'manual' as const,
  completionMinViewSeconds: null,
  completionPassGrade: null,
};

describe('LessonSettingsForm', () => {
  it('sends the pass grade together with an on_pass mode', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    render(<LessonSettingsForm lesson={lesson} onSave={onSave} />);

    await userEvent.selectOptions(screen.getByLabelText(/قاعدة الإتمام/), 'on_pass');
    await userEvent.clear(screen.getByLabelText(/درجة النجاح/));
    await userEvent.type(screen.getByLabelText(/درجة النجاح/), '60');
    await userEvent.click(screen.getByRole('button', { name: /احفظ/ }));

    // The contract's refine rejects a mode without its dependent value, so
    // the two must travel together or the save is a 400.
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ completionMode: 'on_pass', completionPassGrade: 60 }),
    );
  });

  it('omits both dependent values for a mode that needs neither', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    render(<LessonSettingsForm lesson={lesson} onSave={onSave} />);

    await userEvent.click(screen.getByRole('button', { name: /احفظ/ }));

    const sent = onSave.mock.calls[0][0];
    expect(sent.completionMode).toBe('manual');
    expect(sent.completionPassGrade).toBeNull();
    expect(sent.completionMinViewSeconds).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @ayman/web exec vitest run components/admin/course/lesson-settings-form.test.tsx
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Build `lesson-settings-form.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { copy } from '@ayman/contracts';
import { Button, Input, Label, Select, Switch } from '@ayman/ui';
import type { ActionResult, UpdateLessonInput } from '@/app/(admin)/admin/courses/actions';

const c = copy.admin.lesson;

type CompletionMode = NonNullable<UpdateLessonInput['completionMode']>;

const MODE_LABEL: Record<CompletionMode, string> = {
  none: c.completionNone,
  manual: c.completionManual,
  on_view: c.completionOnView,
  on_grade: c.completionOnGrade,
  on_pass: c.completionOnPass,
};

const MODES = ['none', 'manual', 'on_view', 'on_grade', 'on_pass'] as const;

export interface LessonSettings {
  id: string;
  isFreePreview: boolean;
  estimatedSeconds: number;
  completionMode: CompletionMode;
  completionMinViewSeconds: number | null;
  completionPassGrade: number | null;
}

/**
 * The completion rule is a COUPLED pair. `LessonUpdateSchema.refine` requires
 * `completionMinViewSeconds` with `on_view` and `completionPassGrade` with
 * `on_grade`/`on_pass`, so this always sends the mode and its dependent value
 * in the same payload — sending the mode alone is a 400 the instructor cannot
 * act on. The dependent field is rendered only for the mode that needs it, and
 * both are nulled for the modes that need neither.
 */
export function LessonSettingsForm({
  lesson,
  onSave,
}: {
  lesson: LessonSettings;
  onSave: (input: UpdateLessonInput) => Promise<ActionResult>;
}) {
  const [mode, setMode] = useState<CompletionMode>(lesson.completionMode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsViewSeconds = mode === 'on_view';
  const needsPassGrade = mode === 'on_grade' || mode === 'on_pass';

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await onSave({
      isFreePreview: formData.get('isFreePreview') === 'on',
      estimatedSeconds: Number(formData.get('estimatedSeconds') ?? 0),
      completionMode: mode,
      completionMinViewSeconds: needsViewSeconds
        ? Number(formData.get('completionMinViewSeconds') ?? 0)
        : null,
      completionPassGrade: needsPassGrade
        ? Number(formData.get('completionPassGrade') ?? 0)
        : null,
    });
    setPending(false);
    if (!result.ok) setError(result.message);
  }

  return (
    <form action={submit} className="mt-4 space-y-3 border-t border-line-subtle pt-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2">
          <Switch id={`preview-${lesson.id}`} name="isFreePreview" defaultChecked={lesson.isFreePreview} />
          <Label htmlFor={`preview-${lesson.id}`}>{c.freePreview}</Label>
        </div>

        <div className="w-40">
          <Label htmlFor={`est-${lesson.id}`}>{c.estimatedSeconds}</Label>
          <Input
            id={`est-${lesson.id}`}
            name="estimatedSeconds"
            type="number"
            min={0}
            max={86400}
            defaultValue={lesson.estimatedSeconds}
          />
        </div>

        <div className="w-48">
          <Label htmlFor={`mode-${lesson.id}`}>{c.completionMode}</Label>
          <Select
            id={`mode-${lesson.id}`}
            value={mode}
            onChange={(event) => setMode(event.target.value as CompletionMode)}
          >
            {MODES.map((value) => (
              <option key={value} value={value}>
                {MODE_LABEL[value]}
              </option>
            ))}
          </Select>
        </div>

        {needsViewSeconds ? (
          <div className="w-40">
            <Label htmlFor={`minview-${lesson.id}`}>{c.minViewSeconds}</Label>
            <Input
              id={`minview-${lesson.id}`}
              name="completionMinViewSeconds"
              type="number"
              min={0}
              defaultValue={lesson.completionMinViewSeconds ?? 0}
              required
            />
          </div>
        ) : null}

        {needsPassGrade ? (
          <div className="w-40">
            <Label htmlFor={`pass-${lesson.id}`}>{c.passGrade}</Label>
            <Input
              id={`pass-${lesson.id}`}
              name="completionPassGrade"
              type="number"
              min={0}
              max={100}
              defaultValue={lesson.completionPassGrade ?? 60}
              required
            />
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {copy.admin.common.save}
        </Button>
        {error === null ? null : (
          <p role="alert" className="text-[length:var(--fs-text-xs)] text-err">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
```

Add the six mode labels to `packages/contracts/src/copy/ar.ts` inside `admin.lesson`:

```ts
      completionMode: 'قاعدة الإتمام',
      completionNone: 'من غير قاعدة',
      completionManual: 'الطالب بيعلّمها خلصت',
      completionOnView: 'بعد مشاهدة مدة معيّنة',
      completionOnGrade: 'بعد ما ياخد درجة',
      completionOnPass: 'بعد ما ينجح',
      minViewSeconds: 'أقل مدة مشاهدة بالثواني',
      passGrade: 'درجة النجاح %',
```

- [ ] **Step 4: Run the test**

```bash
pnpm --filter @ayman/web exec vitest run components/admin/course/lesson-settings-form.test.tsx
```

Expected: PASS, both cases.

- [ ] **Step 5: Build `inline-title.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts';
import type { ActionResult } from '@/app/(admin)/admin/courses/actions';

/**
 * A title that becomes its own input.
 *
 * The alternative — a «تعديل الاسم» form per section and per lesson — puts
 * forty single-field forms on one page. Here the title IS the field: pressing
 * it swaps a button for an input of the same size at the same position, so
 * nothing on the page moves.
 *
 * Escape reverts, Enter saves, blur saves. A title that silently reverted on
 * blur would lose work the instructor believed was saved.
 */
export function InlineTitle({
  value,
  label,
  className,
  onSave,
}: {
  value: string;
  label: string;
  className?: string;
  onSave: (next: string) => Promise<ActionResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, setPending] = useState(false);

  async function commit() {
    const next = draft.trim();
    setEditing(false);
    if (next === value || next.length < 2) {
      setDraft(value);
      return;
    }
    setPending(true);
    const result = await onSave(next);
    setPending(false);
    if (result.ok) {
      toast.success(copy.admin.common.saved);
    } else {
      toast.error(result.message);
      setDraft(value);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={`inline-edit__button ${className ?? ''}`}
        aria-label={label}
        disabled={pending}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {value}
      </button>
    );
  }

  return (
    <input
      autoFocus
      className={`inline-edit__input ${className ?? ''}`}
      aria-label={label}
      value={draft}
      minLength={2}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          void commit();
        }
        if (event.key === 'Escape') {
          setDraft(value);
          setEditing(false);
        }
      }}
    />
  );
}
```

- [ ] **Step 6: Build `confirm-button.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui';
import type { ActionResult } from '@/app/(admin)/admin/courses/actions';

/**
 * A destructive action behind a dialog that names its consequence.
 *
 * `window.confirm` is what the course-level buttons use, and it cannot state a
 * number. Deleting a lesson twelve students have watched destroys their
 * progress rows, and «متأكد؟» does not say so. `consequence` is that sentence,
 * rendered only when there is one.
 */
export function ConfirmButton({
  label,
  title,
  body,
  consequence,
  className,
  onConfirm,
}: {
  label: string;
  title: string;
  body: string;
  consequence?: string | null;
  className?: string;
  onConfirm: () => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    const result = await onConfirm();
    setPending(false);
    setOpen(false);
    if (result.ok) {
      toast.success(copy.admin.actions.delete);
    } else {
      toast.error(result.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={className}>
          {label}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        {consequence ? (
          <p className="text-[length:var(--fs-text-sm)] text-err">{consequence}</p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary" size="sm">
              {copy.admin.common.cancel}
            </Button>
          </DialogClose>
          <Button type="button" variant="danger" size="sm" disabled={pending} onClick={() => void run()}>
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Confirm `copy.admin.common.cancel` exists; if it does not, add `cancel: 'إلغاء',` to `admin.common`.

- [ ] **Step 7: Build `lesson-card.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { LessonKindIcon } from '@/components/player/lesson-kind-icon';
import {
  deleteLessonAction,
  setLessonPublishedAction,
  updateLessonAction,
} from '@/app/(admin)/admin/courses/actions';
import type { AdminCourseDetail } from '@/app/(admin)/admin/courses/[id]/page';
import type { SortableHandleProps } from '@/components/admin/sortable-list';
import { InlineTitle } from './inline-title';
import { ConfirmButton } from './confirm-button';
import { LessonPanel } from './lesson-panel';

type Lesson = AdminCourseDetail['sections'][number]['lessons'][number];

const c = copy.admin.lesson;

/**
 * One lesson, as the row a student will see it as: an icon well saying WHAT it
 * is, the title, then what you can do about it.
 *
 * The action set is where this diverges from `.lesson-row`'s student form. A
 * student's row ends in one chip; this one ends in four, so the destructive one
 * sits past a hairline and takes colour only on hover — one click away, never
 * the first thing the eye lands on.
 */
export function LessonCard({
  courseId,
  lesson,
  handleProps,
}: {
  courseId: string;
  lesson: Lesson;
  handleProps: SortableHandleProps;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const quizIncomplete = lesson.kind === 'quiz' && (lesson.quiz?._count.slots ?? 0) === 0;

  return (
    <div className="rounded-md border border-line bg-surface-3">
      <div className="lesson-row">
        <button
          type="button"
          aria-label={copy.admin.reorder.handle}
          className="cursor-grab rounded-xs px-1 py-1 text-fg-muted focus-visible:outline-2"
          {...handleProps.attributes}
          {...handleProps.listeners}
        >
          <span aria-hidden="true" className="block h-px w-4 bg-current" />
          <span aria-hidden="true" className="mt-1 block h-px w-4 bg-current" />
        </button>

        <span className="lesson-row__well" aria-hidden="true">
          <LessonKindIcon kind={lesson.kind} className="size-4" />
        </span>

        <span className="lesson-row__text">
          <InlineTitle
            value={lesson.title}
            label={c.title}
            className="lesson-row__title"
            onSave={async (title) => {
              const result = await updateLessonAction(courseId, lesson.id, { title });
              if (result.ok) router.refresh();
              return result;
            }}
          />
          <span className="mono block text-[length:var(--fs-mono-label)] text-fg-muted">
            {copy.course.lessonKind[lesson.kind]}
            {lesson.video ? ` · ${lesson.video.externalId}` : ''}
            {quizIncomplete ? ` · ${copy.admin.exam.noQuestions}` : ''}
          </span>
        </span>

        <span className="row-actions">
          <button
            type="button"
            className={cn('chip', open ? 'chip--done' : 'chip--quiet')}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {c.edit}
          </button>

          {lesson.kind === 'quiz' ? (
            <Link href={`/admin/quizzes/lesson/${lesson.id}`} className="chip chip--quiet">
              {copy.quizAdmin.quizTitle}
            </Link>
          ) : null}

          <form
            action={async () => {
              const result = await setLessonPublishedAction(courseId, lesson.id, !lesson.isPublished);
              if (result.ok) router.refresh();
            }}
          >
            <button type="submit" className={cn('chip', lesson.isPublished ? 'chip--done' : 'chip--solid')}>
              {lesson.isPublished ? copy.admin.course.unpublish : copy.admin.course.publish}
            </button>
          </form>

          <span aria-hidden="true" className="row-actions__sep" />

          <ConfirmButton
            className="chip chip--danger"
            label={c.delete}
            title={c.delete}
            body={c.deleteConfirm}
            // Only shown when it is true. A confirmation that always warns
            // teaches the instructor to click through it.
            consequence={
              lesson._count.progress > 0
                ? `${c.deleteWithProgress} ${lesson._count.progress}`
                : null
            }
            onConfirm={async () => {
              const result = await deleteLessonAction(courseId, lesson.id);
              if (result.ok) router.refresh();
              return result;
            }}
          />
        </span>
      </div>

      {open ? <LessonPanel courseId={courseId} lesson={lesson} /> : null}
    </div>
  );
}
```

Add to `packages/contracts/src/copy/ar.ts` inside `admin.lesson`:

```ts
      edit: 'تعديل',
      delete: 'حذف',
      deleteConfirm: 'متأكد إنك عايز تمسح المحاضرة دي؟ الإجراء ده مش هيترجع.',
      deleteWithProgress: 'عدد الطلبة اللي تقدّمهم في المحاضرة دي هيتمسح:',
      removeVideo: 'شيل الفيديو',
```

- [ ] **Step 8: Rebuild `lesson-list.tsx` around `LessonCard`**

Replace the `LessonRow` function inside `apps/web/components/admin/course/lesson-list.tsx` so `renderItem` returns a `LessonCard`, and drop the `renderDetails` prop — the panel now lives inside the card:

```tsx
    <SortableList
      items={lessons}
      onReorder={(orderedIds) => reorderLessonsAction(courseId, sectionId, orderedIds)}
      renderItem={(lesson, handleProps) => (
        <LessonCard courseId={courseId} lesson={lesson} handleProps={handleProps} />
      )}
      announcements={{
        pickedUp: (position) => `${copy.admin.reorder.pickedUp} ${position}`,
        movedOver: (position) => `${copy.admin.reorder.movedOver} ${position}`,
        dropped: (position) => `${copy.admin.reorder.dropped} ${position}`,
        cancelled: copy.admin.reorder.cancelled,
      }}
      statusSlot={/* unchanged */}
    />
```

In `packages/contracts/src/copy/ar.ts`, **add two keys and rename nothing**:

```ts
    reorder: {
      hint: 'اسحب لإعادة الترتيب، أو استخدم زر المسافة والأسهم من الكيبورد',
      handle: 'مقبض السحب',
      // ⚠️ Says «المحاضرة» and is read by FOUR lists, three of which are not
      // lectures at all: `admin/home/block-composer.tsx`,
      // `admin/navigation/nav-editor.tsx` and `admin/quiz/slot-list.tsx`
      // announce a home block, a nav item and a quiz question as "the
      // lecture". That is a real screen-reader defect and it PREDATES this
      // plan — fixing it means editing three files this plan does not
      // otherwise touch, so it is left alone here and recorded as a known
      // issue instead. Do not rename this key: four call sites read it.
      pickedUp: 'اتمسكت المحاضرة في الترتيب رقم',
      pickedUpSection: 'اتمسك القسم في الترتيب رقم',
      pickedUpResource: 'اتمسكت المادة في الترتيب رقم',
      movedOver: 'بقت في الترتيب رقم',
      dropped: 'اتسابت في الترتيب رقم',
      cancelled: 'اتلغى السحب والترتيب رجع زي ما كان',
    },
```

The lesson list keeps reading `pickedUp`; only the two new lists read the new keys.

- [ ] **Step 9: Build `section-list.tsx` and rebuild `section-card.tsx`**

`section-list.tsx` binds `SortableList` to `reorderSectionsAction` — the action that has existed since the sections endpoint shipped and has never had a caller:

```tsx
'use client';

import { copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { reorderSectionsAction } from '@/app/(admin)/admin/courses/actions';
import type { AdminCourseDetail } from '@/app/(admin)/admin/courses/[id]/page';
import { SortableList } from '@/components/admin/sortable-list';
import type { ReorderStatus } from '@/components/admin/use-debounced-reorder';
import { SectionCard } from './section-card';

const STATUS_LABEL: Record<ReorderStatus, string> = {
  idle: '',
  pending: copy.admin.common.saving,
  saving: copy.admin.common.saving,
  saved: copy.admin.common.saved,
  error: copy.admin.common.saveFailed,
};

export function SectionList({
  courseId,
  sections,
}: {
  courseId: string;
  sections: AdminCourseDetail['sections'];
}) {
  return (
    <SortableList
      items={sections}
      onReorder={(orderedIds) => reorderSectionsAction(courseId, orderedIds)}
      renderItem={(section, handleProps) => (
        <SectionCard courseId={courseId} section={section} handleProps={handleProps} />
      )}
      announcements={{
        pickedUp: (position) => `${copy.admin.reorder.pickedUpSection} ${position}`,
        movedOver: (position) => `${copy.admin.reorder.movedOver} ${position}`,
        dropped: (position) => `${copy.admin.reorder.dropped} ${position}`,
        cancelled: copy.admin.reorder.cancelled,
      }}
      statusSlot={(status) => (
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{copy.admin.reorder.hint}</p>
          <p
            aria-live="polite"
            className={cn(
              'mono text-[length:var(--fs-mono-label)]',
              status === 'error' ? 'text-err' : 'text-fg-muted',
            )}
          >
            {STATUS_LABEL[status]}
          </p>
        </div>
      )}
    />
  );
}
```

`section-card.tsx` becomes a `.unit`: a `<details>` whose `<summary>` is the coloured header. The header carries the drag handle, the inline-editable title, the lesson count, publish and delete. Collapsed unless it is the first section — a twelve-section course must be navigable.

```tsx
      <details open={defaultOpen} className="unit">
        <summary className="unit__head">
          {/* handle, InlineTitle on .unit__title, .unit__count, publish chip,
              ConfirmButton on .chip--danger, .unit__chevron */}
        </summary>
        <div className="unit__body">
          <LessonList courseId={courseId} sectionId={section.id} lessons={section.lessons} />
          <AddLessonForm courseId={courseId} sectionId={section.id} />
        </div>
      </details>
```

Wire the header's title to `updateSectionAction(courseId, section.id, { title })` and its delete to `deleteSectionAction(courseId, section.id)` with no consequence line — a section holds no progress rows of its own.

The drag handle must call `event.preventDefault()` on `onClick`: a `<summary>` toggles on any click inside it, so without that, picking up a section also collapses it.

Add to `packages/contracts/src/copy/ar.ts` inside `admin.section`:

```ts
      edit: 'تعديل',
      delete: 'حذف القسم',
      deleteConfirm: 'متأكد إنك عايز تمسح القسم ده وكل المحاضرات اللي جواه؟',
      lessonCount: 'محاضرة',
```

- [ ] **Step 10: Rebuild `course-exam-gate.tsx`**

Renders one of two states, and computes the gate number from the payload rather than from a constant:

```tsx
  // The exam opens only when every OTHER published lesson is cleared
  // (`gate-rule.ts`). That number is the one thing about the exam an
  // instructor has to understand, so the band states it with the course's
  // own live count instead of a paragraph of help text.
  const publishedOthers = course.sections
    .flatMap((section) => section.lessons)
    .filter((lesson) => lesson.isPublished && lesson.id !== course.examLessonId).length;
```

No exam → a `.exam-gate` with the rule line and one amber `.chip--solid` running `scaffoldExamAction`, then `router.push('/admin/quizzes/' + result.quizId)`.

Exam exists → the same band, plus the question count from `quiz._count.slots`, plus «افتح الامتحان» pointing at `/admin/quizzes/{quizId}`.

Under both, a `<details>` labelled `copy.admin.exam.advanced` holding the old `CourseExamPicker` select — promoting a hand-built quiz lesson stays possible, it is just no longer the only path.

- [ ] **Step 11: Add editing and reordering to `lesson-resources.tsx`**

Wrap the resource `<ul>` in `SortableList` bound to `reorderResourcesAction`, and give each row an edit toggle that swaps title and description for inputs, saving through `updateResourceAction`. Both actions have existed since the resources endpoint shipped with no caller.

Kind stays uneditable, for the reason the file's own header comment gives: changing a link into a file would null three columns and populate four, which is a create wearing a costume.

Add to `packages/contracts/src/copy/ar.ts` inside `admin.resource`:

```ts
      edit: 'تعديل',
      save: 'احفظ',
      cancel: 'إلغاء',
```

- [ ] **Step 12: Wire `course-editor.tsx` together**

Replace the `course.sections.map(…)` block with `<SectionList courseId={course.id} sections={course.sections} />`, and move `<CourseExamGate course={course} />` from the bottom of the page to directly under the course form — the exam is the course's shape, not a footnote.

- [ ] **Step 13: Full check**

```bash
pnpm --filter @ayman/web run typecheck \
  && pnpm --filter @ayman/web run lint \
  && pnpm --filter @ayman/web run test \
  && pnpm --filter @ayman/web run build
```

Expected: all green.

- [ ] **Step 14: Look at it**

```bash
pnpm --filter @ayman/web run dev
```

Open `/admin/courses/{id}` and confirm, in both themes and at 375px wide:
- Sections collapse and expand; the first is open.
- Dragging a section by its handle does not collapse it.
- A lesson row shows its kind icon, and its four actions fit without overflowing.
- The exam band states a real number that changes when you publish a lesson.
- Keyboard: every chip is tabbable and its focus ring is visible — including on a `.unit__head`, which clips (`overflow: hidden`) and needs the negative `outline-offset` `study.css` already declares.

- [ ] **Step 15: Commit**

```bash
git add apps/web/components/admin/course/ \
        apps/web/components/admin/lesson-resources.tsx \
        packages/contracts/src/copy/ar.ts
git commit -m "feat(admin): finish the course builder's controls

Section rename and delete, lesson rename and delete, lesson settings,
video removal, resource editing, and three sortable lists — two of which
bind actions that have had no caller since the endpoints shipped.

The exam gets a band that states its own rule with the course's live
lesson count, because 'opens when everything else is cleared' is the one
thing about it an instructor has to know."
```

---

### Task 7: The E2E path

**Files:**
- Create: `apps/web/e2e/admin-course-builder.e2e.ts`

- [ ] **Step 1: Read the existing fixtures**

```bash
cat apps/web/e2e/fixtures.ts apps/web/e2e/admin-publish-course.e2e.ts
```

Use whatever admin-login and course-creation helpers already exist. Do not write a second login helper.

- [ ] **Step 2: Write the spec**

Create `apps/web/e2e/admin-course-builder.e2e.ts` covering, in one test, in order: create a course → add a section → rename it inline → add a video lesson → set its YouTube URL → attach a PDF resource → attach a YouTube material → press «أضف امتحان الكورس» → assert the URL is `/admin/quizzes/{uuid}` → go back → assert the exam band names the exam → publish the course.

Assert on `EXAM_SECTION_TITLE` imported from `@ayman/contracts`, never on a local copy of the string.

Add one negative case: with the course published and a lesson carrying no attempts, delete it and assert the row disappears. Do not build an attempt fixture here — the 409 path is covered by the API specs in Task 1, and an E2E that created an attempt could never clean itself up.

- [ ] **Step 3: Run it**

```bash
pnpm --filter @ayman/web exec playwright test admin-course-builder
```

Expected: PASS. The suite is known to be flaky under parallel load — re-run a single failure once before investigating it.

- [ ] **Step 4: Run everything**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration
```

Expected: all green.

- [ ] **Step 5: Commit and open the PR**

```bash
git add apps/web/e2e/admin-course-builder.e2e.ts
git commit -m "test(e2e): the whole course builder path, empty course to published"
git push -u origin feat/course-builder-completion
gh pr create --fill
```

Then, per the repo's merge rules: check `gh pr view --json mergeStateStatus`. `CLEAN`/`UNSTABLE` means go; `BLOCKED` means checks outstanding; `BEHIND` needs `gh pr update-branch --rebase`, which restarts every check on a new head SHA. Merge with `--rebase` — history on `main` is linear. Confirm with `git log -1 origin/main`, not with `gh`'s exit status.

---

## Self-Review

**Spec coverage.** Part 1 → Task 1 (guards) and Task 2 (`studentCount`). Part 2 → Task 4, with the permission split refined: the spec put the whole operation under one permission; the plan requires `course:update` on the decorator and checks `quiz:write` in the controller, because the operation creates a quiz and the decorator carries one permission. Part 3 → Tasks 5 and 6. Part 4's nine capabilities → Task 3 (five actions) and Task 6 (their UI, plus the three orphaned actions). Part 5 → Task 2. Part 6 (copy) → distributed into the task that first needs each key, so no task depends on a string another task has not written. Testing → Tasks 1, 2, 4, 6, 7.

**Placeholders.** Task 6 Steps 9–11 describe three components in prose plus fragments rather than in full. That is deliberate and bounded: each is a mechanical application of a pattern given in full earlier in the same task (`SectionList` is `LessonList` with a different action and different announcements; the resource edit toggle is `InlineTitle`'s pattern over two fields). Every non-obvious decision in them — the `preventDefault` on the summary's drag handle, the uneditable kind, the live gate count — is stated explicitly.

**Type consistency.** `ActionResult`, `UpdateLessonInput`, `AdminCourseDetail`, `SortableHandleProps`, `ReorderStatus`, `LessonSettings`, `ScaffoldExamResult` are each defined once and imported everywhere else. `_count.progress` and `quiz._count.slots` are named identically in the API select (Task 2 Step 3), the Zod schema (Step 5), and both consumers (Task 6 Steps 7 and 10). `EXAM_SECTION_TITLE` is defined in contracts and consumed by the service and the E2E spec.

**One pre-existing defect recorded, not fixed.** `admin.reorder.pickedUp` reads «اتمسكت المحاضرة…» and is consumed by four sortable lists — home blocks, navigation items, quiz slots, and lessons. Three of them announce a non-lecture as a lecture to a screen reader. An earlier draft of this plan renamed the key, which would have edited three files this work does not otherwise touch; Task 6 Step 8 now adds two new keys and leaves the existing one alone. The defect is real and should get its own change.

**Two commands to run before trusting Task 6.** `grep -rn "reorder.pickedUp" apps packages` confirms the four call sites are untouched, and `grep -rn "copy.admin.lesson.empty\|copy.admin.section.empty" apps/web` confirms the empty-state strings the split preserves still have readers.
