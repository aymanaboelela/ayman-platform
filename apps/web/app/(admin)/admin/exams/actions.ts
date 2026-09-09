'use server';

import { revalidatePath } from 'next/cache';
import { z } from '@ayman/contracts/zod';
import {
  AdminExamCreateSchema,
  AdminExamDuplicateSchema,
  AdminExamPatchSchema,
  ExamLessonPickerSchema,
  type ExamLessonPicker,
} from '@ayman/contracts/admin/exams';
import { AdminApiError, adminGet, adminSend } from '@/lib/admin-api';
import {
  examFailureFromPayload,
  type ExamFailure,
} from '@/components/admin/exams/exam-errors';

/**
 * The writes behind `/admin/exams`.
 *
 * ## They return a FAILURE KIND, never a message
 *
 * `AdminApiError.message` is `PATCH /api/admin/exams/… failed with 400:
 * {"statusCode":400,…}` — an internal route, an HTTP status and a raw JSON body.
 * Rendering that inside the Arabic RTL admin UI is a mistake this repo has
 * already made and documented (see `AdminApiError`'s own header), so nothing
 * here ever puts an `error.message` on screen. Each action answers with an
 * `ExamFailure` slug and the component picks the copy string for it, next to
 * the control that caused it.
 *
 * ## `revalidatePath`, not `updateTag`
 *
 * Every read on these screens goes through `adminGet`, which is `cache:
 * 'no-store'` precisely so an admin never sees a stale row. What has to be
 * dropped is the ROUTER cache — the client-side RSC snapshot — or the list
 * re-renders with the exam still «لسه مسودة» after it has been published. Same
 * reasoning `homework/actions.ts` records for the same shape.
 *
 * ## Bodies go out through the CONTRACT schema
 *
 * Not for validation — the API validates again — but because
 * `AdminExamCreateSchema` is `.strict()` and carries the two `.default()`s
 * (`gradeOutOf`, `passPercent`). Parsing here is what turns a form's strings
 * into the exact object the route accepts, and what makes a field this app
 * forgot to send a visible failure here rather than a silent one there.
 *
 * ⚠️ `AdminExamPatchSchema` is a hand-written all-optional object and is NOT
 * `AdminExamCreateSchema.partial()` — see its own note. It has no defaults, so
 * a PATCH carrying only the fields the edit form actually holds cannot inject
 * `gradeOutOf: 100` over whatever he set. The edit form sends all of them
 * anyway, because every one of them is on screen and filled.
 */
export type ExamActionResult =
  | { ok: true }
  | { ok: false; failure: ExamFailure };

/** The create action also hands back where to go next — the new exam has no
 *  questions in it yet, and «حط الأسئلة» is the only useful next step. */
export type ExamCreateResult =
  | { ok: true; lessonId: string }
  | { ok: false; failure: ExamFailure };

/** Every refusal that is a decision arrives as a 4xx. A 5xx is a fault and must
 *  not be dressed up as one of the five — it stays `unknown`, which reads as
 *  «مقدرناش نحفظ — نجرّب تاني». */
function failureOf(error: unknown): ExamFailure {
  if (error instanceof AdminApiError) {
    return examFailureFromPayload(error.payload) ?? 'unknown';
  }
  return 'unknown';
}

/** Both list pages, plus the one the caller is standing on. Cheap, and the
 *  alternative is an exam that was just published still reading «لسه مسودة». */
function refreshExams(lessonId?: string): void {
  revalidatePath('/admin/exams');
  if (lessonId) revalidatePath(`/admin/exams/${lessonId}`);
}

export async function createExamAction(input: unknown): Promise<ExamCreateResult> {
  try {
    const body = AdminExamCreateSchema.parse(input);
    const created = await adminSend(
      'POST',
      '/api/admin/exams',
      body,
      z.object({ lessonId: z.uuid() }),
    );
    refreshExams();
    return { ok: true, lessonId: created.lessonId };
  } catch (error) {
    return { ok: false, failure: failureOf(error) };
  }
}

export async function patchExamAction(
  lessonId: string,
  input: unknown,
): Promise<ExamActionResult> {
  try {
    const body = AdminExamPatchSchema.parse(input);
    await adminSend(
      'PATCH',
      `/api/admin/exams/${encodeURIComponent(lessonId)}`,
      body,
      z.object({ ok: z.boolean() }),
    );
    refreshExams(lessonId);
    return { ok: true };
  } catch (error) {
    return { ok: false, failure: failureOf(error) };
  }
}

/**
 * Publish AND unpublish, through the one route that does both.
 *
 * The API deliberately exposes a single `PUT :lessonId/published` rather than
 * two endpoints, because publishing an exam is two writes — the quiz and its
 * lesson — and a client doing them separately can leave a live quiz on an
 * invisible lesson. Nothing here may split them back apart.
 */
export async function setExamPublishedAction(
  lessonId: string,
  published: boolean,
): Promise<ExamActionResult> {
  try {
    await adminSend(
      'PUT',
      `/api/admin/exams/${encodeURIComponent(lessonId)}/published`,
      { published },
      z.object({ published: z.boolean() }),
    );
    refreshExams(lessonId);
    return { ok: true };
  } catch (error) {
    return { ok: false, failure: failureOf(error) };
  }
}

/**
 * ⚠️ The irreversible one. It cascades the quiz, every attempt and every
 * coverage row, and the API refuses it outright once anyone has sat the exam.
 *
 * The UI's job is to make sure this is almost never the button he reaches for:
 * an exam that must come off the dashboard before it opens is UNPUBLISHED, and
 * `ExamRowActions` only offers delete at all when `attemptCount` is zero.
 */
export async function deleteExamAction(lessonId: string): Promise<ExamActionResult> {
  try {
    await adminSend(
      'DELETE',
      `/api/admin/exams/${encodeURIComponent(lessonId)}`,
      undefined,
      z.object({ ok: z.boolean() }),
    );
    revalidatePath('/admin/exams');
    return { ok: true };
  } catch (error) {
    return { ok: false, failure: failureOf(error) };
  }
}

/** «كرر الامتحان ده على باقي الكورسات» — the window, the duration and the marks
 *  are copied; each target names its own lessons, because the parts do not line
 *  up. The questions are NOT copied: each paper is his to write. */
export async function duplicateExamAction(
  lessonId: string,
  input: unknown,
): Promise<ExamActionResult> {
  try {
    const body = AdminExamDuplicateSchema.parse(input);
    await adminSend(
      'POST',
      `/api/admin/exams/${encodeURIComponent(lessonId)}/duplicate`,
      body,
      z.object({ lessonIds: z.array(z.uuid()) }),
    );
    revalidatePath('/admin/exams');
    return { ok: true };
  } catch {
    // Duplicate can only fail in ways the dialog cannot name a field for — a
    // source exam with no window, a target course that does not exist. One
    // honest «مقدرناش نحفظ» is the whole vocabulary here.
    return { ok: false, failure: 'unknown' };
  }
}

/**
 * A course's lessons, grouped by section, for the coverage picker.
 *
 * A Server Action rather than a client `fetch`, for the same reason
 * `loadCourseLessonsAction` is one on الواجبات: the browser has no session
 * cookie to send to the API host and no CSRF header to put on it — `adminGet`
 * forwards both. It also keeps the API origin out of the client bundle.
 *
 * The route excludes exam shelves and quiz lessons already, so an exam can
 * never be on another exam.
 */
export async function loadExamLessonsAction(
  courseId: string,
): Promise<{ ok: true; sections: ExamLessonPicker['sections'] } | { ok: false }> {
  try {
    const picker = await adminGet(
      `/api/admin/exams/courses/${encodeURIComponent(courseId)}/lessons`,
      ExamLessonPickerSchema,
    );
    // A section with no lessons in it is a heading over nothing — same trim
    // الواجبات's picker makes.
    return { ok: true, sections: picker.sections.filter((s) => s.lessons.length > 0) };
  } catch {
    return { ok: false };
  }
}
