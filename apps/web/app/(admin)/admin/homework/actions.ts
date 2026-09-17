'use server';

import { revalidatePath } from 'next/cache';
import { z } from '@ayman/contracts/zod';
import { HomeworkReviewSchema, HomeworkWriteSchema } from '@ayman/contracts/homework';
import { adminGet, adminSend, adminSendVoid } from '@/lib/admin-api';

export type HomeworkActionResult = { ok: true } | { ok: false; message: string };

/**
 * «مقبول» / «يفكّر تاني ويبعته».
 *
 * ⚠️ `adminSendVoid`, never `adminSend`. The route answers 204, and `adminSend`
 * ends with `schema.parse(await response.json())` — which throws on an empty
 * body AFTER the student has been marked, told, and (on accept) had their
 * photographs deleted. That is exactly how the inbox reply shipped once: the
 * work was done and the instructor was told it had failed.
 *
 * `revalidatePath`, not `updateTag`: every read on these screens goes through
 * `adminGet`, which is `cache: 'no-store'` precisely so an admin never sees a
 * stale row. What has to be dropped is the ROUTER cache — the client-side RSC
 * snapshot — or the queue re-renders with the submission still sitting in
 * «مستني مراجعة» after it has been decided.
 */
export async function reviewHomeworkAction(
  id: string,
  input: { decision: 'accepted' | 'needs_work'; grade: number | null; message: string },
): Promise<HomeworkActionResult> {
  try {
    // Parsed against the contract before it leaves, even though the API
    // validates again — including the refusal of a grade on `needs_work`, so a
    // form bug cannot put a mark on work that is coming back.
    const body = HomeworkReviewSchema.parse(input);
    await adminSendVoid('POST', `/api/admin/homework/${id}/review`, body);
    revalidatePath('/admin/homework');
    revalidatePath(`/admin/homework/${id}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/* ── authoring a واجب from the queue ──────────────────────────────────────
 *
 * The queue used to be read-only: the only way to SET a واجب was the lesson
 * panel, four clicks deep inside `/admin/courses/[id]`, on a screen opened for
 * a different reason entirely. «أضيف واجب» started here, so the entry point is
 * here too.
 *
 * Both actions below call endpoints that already exist and already carry
 * `lesson:write` — this adds no route and no schema. What it adds is the two
 * lookups a picker needs (which course, then which lecture) and a write that
 * lands on the lesson he chose.
 * ───────────────────────────────────────────────────────────────────────── */

const LessonPickSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  kind: z.string(),
  isPublished: z.boolean(),
  /** Already has one — the picker badges these and the form opens FILLED from
   *  it. A blank field over existing questions is a field the instructor
   *  overwrites without ever being shown what was there. */
  homework: z
    .object({ body: z.string(), maxImages: z.number().int(), isPublished: z.boolean() })
    .nullable(),
});
type HomeworkLessonPick = z.infer<typeof LessonPickSchema>;

const CourseOutlineSchema = z.object({
  sections: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      isPublished: z.boolean(),
      lessons: z.array(LessonPickSchema),
    }),
  ),
});

/**
 * The lectures of one course, flattened for the second picker.
 *
 * ONE request, not one per lesson: `GET /api/admin/courses/:id` already
 * returns the whole section→lesson outline with each lesson's `homework` block
 * on it, so the picker can badge "already has one" and prefill without a
 * second round trip.
 *
 * ⚠️ Lessons of EVERY kind, not just video. A واجب is not a lesson kind — it
 * hangs off any lecture, and the common case is a video the instructor also
 * sets an exercise on. Filtering by kind here would hide most of the list.
 */
export async function loadCourseLessonsAction(
  courseId: string,
): Promise<
  { ok: true; sections: { id: string; title: string; lessons: HomeworkLessonPick[] }[] } | { ok: false; message: string }
> {
  try {
    const course = await adminGet(`/api/admin/courses/${courseId}`, CourseOutlineSchema);
    return {
      ok: true,
      sections: course.sections
        .map((section) => ({ id: section.id, title: section.title, lessons: section.lessons }))
        // A section with no lectures in it is a heading over nothing.
        .filter((section) => section.lessons.length > 0),
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/**
 * Writes the واجب onto the chosen lecture.
 *
 * ⚠️ All THREE fields, every time. `HomeworkWriteSchema` carries `.default()`s,
 * so a body that omits one silently REFILLS it — sending only `body` would
 * reset `maxImages` to 4 and unpublish the exercise. Same trap the course
 * editor's own action documents.
 */
export async function createHomeworkAction(
  lessonId: string,
  input: { body: string; maxImages: number; isPublished: boolean },
): Promise<HomeworkActionResult> {
  try {
    const body = HomeworkWriteSchema.parse(input);
    await adminSend('PUT', `/api/admin/lessons/${lessonId}/homework`, body, z.object({ lessonId: z.uuid() }));
    // The queue itself does not list exercises, but it is where he came from
    // and where the «فيه X مستنيين» counts live; the course editor is the other
    // screen showing this exact row.
    revalidatePath('/admin/homework');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}
