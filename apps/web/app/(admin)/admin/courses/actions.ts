'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  CourseCreateSchema,
  CourseExamPatchSchema,
  CourseStatusPatchSchema,
  CourseUpdateSchema,
  CourseVideoCheckSchema,
  type CourseVideoCheck,
  ExamScaffoldResultSchema,
  PublishAllResultSchema,
  type PublishAllResult,
  ReorderSchema,
  StreamChoiceSchema,
  streamFlagsOf,
} from '@ayman/contracts';
import { VideoEmbedStatusSchema, type VideoEmbedStatus } from '@ayman/contracts/video';
import { copy } from '@ayman/contracts/copy/admin';
import { apiGetAuthed, apiSend } from '@/lib/api-server';
import { TAG_COURSES, courseTag } from '@/lib/cache-tags';

/** The API's course row, as much of it as the admin UI needs back. */
const CourseRowSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  status: z.enum(['draft', 'published', 'archived']),
});

export type ActionResult = { ok: true } | { ok: false; message: string };

function readTrackId(formData: FormData): string | null {
  const value = formData.get('trackId');
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readOptionalText(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * The «المدارس» radios arrive as one of three words; the columns are a pair of
 * booleans. `streamFlagsOf` in the contracts package owns that expansion so
 * the form and this action cannot disagree about what «الاتنين» means.
 *
 * An absent or unrecognised value falls back to `both`, not to a throw: a
 * course reachable by everyone is the same thing every row meant before this
 * field existed, and the schema's own default says the same.
 */
function readStream(formData: FormData): { forGeneral: boolean; forLanguages: boolean } {
  const parsed = StreamChoiceSchema.safeParse(formData.get('stream'));
  return streamFlagsOf(parsed.success ? parsed.data : 'both');
}

/**
 * The «مقفول» checkbox.
 *
 * `getAll`, not `get`: the form submits a hidden `false` and, when ticked, a
 * `true` after it — the standard way to make an unchecked box mean something
 * rather than vanish. So the LAST value is the answer, and a form that somehow
 * sends neither falls back to `false`.
 *
 * Open is the safe fallback in a way `true` would not be: a bug that opened a
 * course wrongly is embarrassing, and one that closed every course would lock
 * every student out of everything.
 */
function readRequiresGrant(formData: FormData): boolean {
  const values = formData.getAll('requiresGrant');
  return values[values.length - 1] === 'true';
}

/**
 * Invalidates BOTH the course and the catalog list. Every write below uses it.
 *
 * ## Why the list, every time
 *
 * `updateCourseAction` used to invalidate only `courseTag(courseId)`, on the
 * reasoning that "editing a title must not evict the other 40 courses". That is
 * exactly backwards: the catalog card RENDERS the title. It also renders the
 * cover, the subtitle, the subject, the year, the track, both stream flags, the
 * lesson count and the total duration — `CatalogCourseSchema` has thirteen
 * public fields and the admin can write eleven of them.
 *
 * So the list was only ever refreshed by publish/unpublish, and every other
 * edit stayed invisible on the public site until the entry aged out on its own:
 * `cacheLife('minutes')` for the landing strip, `cacheLife('hours')` for
 * `/courses`. Reported as «لما بغير صورة الكورس من الداشبورد برضه مش بتتغير برا
 * في الهوم بيدج واللاندينج» — the admin saved, the admin page showed the new
 * cover, and the landing page kept the old one for the rest of the afternoon.
 *
 * ## Why not tag the list per course instead
 *
 * `getCatalog()` explains it: one `cacheTag` call accepts at most 128 tags and
 * silently DROPS the excess with a console warning, so a per-course tag on the
 * list becomes a silent correctness hole the day the catalog passes 128 rows.
 * The coarse tag is the safe shape; the bug was never tagging it.
 *
 * ## What it costs
 *
 * The next visitor after an admin edit re-fetches `/api/catalog/courses` once —
 * one small query, on a page whose edits happen a handful of times a day. That
 * is the entire price of the public site agreeing with what was just saved.
 */
function invalidateCourse(courseId: string): void {
  updateTag(courseTag(courseId));
  updateTag(TAG_COURSES);
}

export async function createCourseAction(formData: FormData): Promise<void> {
  const parsed = CourseCreateSchema.parse({
    slug: formData.get('slug'),
    title: formData.get('title'),
    subtitle: readOptionalText(formData, 'subtitle'),
    description: readOptionalText(formData, 'description'),
    systemId: formData.get('systemId'),
    year: Number(formData.get('year')),
    trackId: readTrackId(formData),
    subjectId: formData.get('subjectId'),
    coverKey: readOptionalText(formData, 'coverKey'),
    ...readStream(formData),
  });

  const course = await apiSend('POST', '/api/admin/courses', CourseRowSchema, parsed);

  // A new draft is not in the public catalog, so no cache tag changes — only
  // the admin list, which is not cached.
  revalidatePath('/admin/courses');
  redirect(`/admin/courses/${course.id}`);
}

export async function updateCourseAction(
  courseId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const parsed = CourseUpdateSchema.parse({
      slug: formData.get('slug'),
      title: formData.get('title'),
      subtitle: readOptionalText(formData, 'subtitle'),
      description: readOptionalText(formData, 'description'),
      systemId: formData.get('systemId'),
      year: Number(formData.get('year')),
      trackId: readTrackId(formData),
      subjectId: formData.get('subjectId'),
      coverKey: readOptionalText(formData, 'coverKey'),
      requiresGrant: readRequiresGrant(formData),
      ...readStream(formData),
    });

    await apiSend('PATCH', `/api/admin/courses/${courseId}`, CourseRowSchema, parsed);

    // `updateTag`, not `revalidateTag`, so the editor's next read is their own
    // write — and the LIST too, because this endpoint writes eleven of the
    // thirteen fields the catalog card renders. See `invalidateCourse`.
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    /*
     * Arabic, because this one is now SHOWN — `<CourseForm>` reads the result
     * and toasts it, where before it dropped it. A Zod issue path or a
     * `PATCH … failed with 409` in the middle of an Arabic screen tells the
     * instructor nothing they can act on.
     *
     * Two failures have a specific cause worth naming, and both are fixable by
     * changing one field: a 409 is always the slug, and a 400 is effectively
     * always `assertOfferingExists` — the taxonomy tuple has no offering row,
     * which is otherwise invisible and makes every save fail forever.
     *
     * The fallback is `autosave.error` rather than `common.saveFailed`. This
     * form saves itself now, and `saveFailed` reads «التغييرات اترجعت زي ما
     * كانت» — which was true of a submit that rolled back and is simply untrue
     * here: the value stays on screen, unsaved, waiting for a retry.
     */
    const message = (): string => {
      if (!(error instanceof Error)) return copy.admin.autosave.error;
      if (error.message.includes('failed with 409')) return copy.admin.course.slugTaken;
      if (error.message.includes('failed with 400')) return copy.admin.course.offeringMissing;
      return copy.admin.autosave.error;
    };
    return { ok: false, message: message() };
  }
}

export async function setCourseStatusAction(
  courseId: string,
  status: 'draft' | 'published' | 'archived',
): Promise<ActionResult> {
  try {
    const body = CourseStatusPatchSchema.parse({ status });
    await apiSend('PATCH', `/api/admin/courses/${courseId}/status`, CourseRowSchema, body);

    // Publishing changes LIST MEMBERSHIP rather than a field on the card. It
    // was once the only operation that touched the catalog tag; it is now one
    // of many, because every other write turned out to change the card too.
    invalidateCourse(courseId);
    revalidatePath('/admin/courses');
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    // A 400 here means the API's "at least one published lesson" rule
    // fired. The admin never sees the raw API string — only the Arabic copy
    // for that exact failure — and a non-400 failure still surfaces as a
    // real (non-silent) error, just the generic one.
    const message =
      error instanceof Error && error.message.includes('failed with 400')
        ? copy.admin.course.publishBlocked
        : copy.admin.common.saveFailed;
    return { ok: false, message };
  }
}

/**
 * The one press that makes a course visible: publishes it AND every lecture in
 * it that a student could actually do.
 *
 * Distinct from `setCourseStatusAction`, which flips the course's own flag and
 * leaves the section and lesson flags exactly where they were — the shape that
 * produced a published course showing students nothing.
 *
 * Returns the report rather than a bare ok, because the useful half is what did
 * NOT go live: «ليه المحاضرة دي مش ظاهرة» is the next question, and this is the
 * only moment anything knows the answer.
 */
export async function publishCourseAction(
  courseId: string,
): Promise<{ ok: true; result: PublishAllResult } | { ok: false; message: string }> {
  try {
    const result = await apiSend(
      'POST',
      `/api/admin/courses/${courseId}/publish-all`,
      PublishAllResultSchema,
      {},
    );

    invalidateCourse(courseId);
    revalidatePath('/admin/courses');
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true, result };
  } catch (error) {
    // A 400 is the "nothing in here can be shown" refusal — the only failure
    // with a cause the instructor can act on.
    const message =
      error instanceof Error && error.message.includes('failed with 400')
        ? copy.admin.course.publishBlocked
        : copy.admin.common.saveFailed;
    return { ok: false, message };
  }
}

/**
 * Asks YouTube about every video in the course, in one press.
 *
 * `apiGetAuthed` and not `apiSend`: it writes nothing. It is slow by nature —
 * one round trip per video, in series on the API so YouTube does not throttle
 * a burst from one IP — so the button that calls it says it is working.
 */
export async function checkCourseVideosAction(
  courseId: string,
): Promise<{ ok: true; result: CourseVideoCheck } | { ok: false; message: string }> {
  try {
    const result = await apiGetAuthed(
      `/api/admin/courses/${courseId}/video-check`,
      CourseVideoCheckSchema,
    );
    return { ok: true, result };
  } catch {
    return { ok: false, message: copy.admin.course.videoCheckFailed };
  }
}

const DeleteCourseResultSchema = z.object({ id: z.uuid() });

/**
 * I4 (audit): the API refuses with a 409 when the course has student quiz
 * attempts — attempt_events is append-only at the DB level, so a course with
 * any attempt can NEVER be hard-deleted, not even after unpublishing. The
 * admin gets that fact, in Arabic, pointing at archiving — never a raw
 * stack trace. A course with no attempts still hard-deletes normally.
 */
export async function deleteCourseAction(courseId: string): Promise<ActionResult> {
  try {
    await apiSend('DELETE', `/api/admin/courses/${courseId}`, DeleteCourseResultSchema);
    // This invalidated NOTHING. A deleted course kept its card on the public
    // catalog — and its detail page kept answering — until the cache entry
    // aged out on its own, which for `/courses` is `cacheLife('hours')`. Of
    // every stale-list case this was the worst: the others showed old data,
    // this one advertised a course that no longer existed.
    invalidateCourse(courseId);
    revalidatePath('/admin/courses');
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes('failed with 409')
        ? copy.admin.course.deleteBlockedAttempts
        : error instanceof Error
          ? error.message
          : 'unknown';
    return { ok: false, message };
  }
}

/** Called once per drag session, after the client-side debounce settles. */
export async function reorderLessonsAction(
  courseId: string,
  sectionId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  try {
    const body = ReorderSchema.parse({ orderedIds });
    await apiSend(
      'PATCH',
      `/api/admin/sections/${sectionId}/lessons/order`,
      z.object({ updated: z.number().int() }),
      body,
    );
    invalidateCourse(courseId);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/** Called once per drag session on the section list of a course. */
export async function reorderSectionsAction(
  courseId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  try {
    const body = ReorderSchema.parse({ orderedIds });
    await apiSend(
      'PATCH',
      `/api/admin/courses/${courseId}/sections/order`,
      z.object({ updated: z.number().int() }),
      body,
    );
    invalidateCourse(courseId);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

const CreateSectionResultSchema = z.object({ id: z.uuid() });

export async function createSectionAction(courseId: string, title: string): Promise<ActionResult> {
  try {
    await apiSend(
      'POST',
      `/api/admin/courses/${courseId}/sections`,
      CreateSectionResultSchema,
      { title, summary: null, isPublished: false },
    );
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function setSectionPublishedAction(
  courseId: string,
  sectionId: string,
  isPublished: boolean,
): Promise<ActionResult> {
  try {
    await apiSend(
      'PATCH',
      `/api/admin/sections/${sectionId}`,
      z.object({ id: z.uuid() }),
      { isPublished },
    );
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function updateSectionAction(
  courseId: string,
  sectionId: string,
  input: { title?: string; summary?: string | null },
): Promise<ActionResult> {
  try {
    await apiSend('PATCH', `/api/admin/sections/${sectionId}`, z.object({ id: z.uuid() }), input);
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/**
 * The API 409s when the section holds a lesson with student attempts.
 *
 * That refusal is PERMANENT — `attempt_events` is append-only at the database
 * level, so no later admin action makes this delete succeed. The Arabic copy
 * therefore names the real constraint and points at unpublishing, which
 * achieves what the admin actually wanted (the section gone from every
 * student's view) without destroying anything.
 *
 * `TAG_COURSES` as well as the per-course tag: deleting a section can remove
 * the last published lesson, which changes the course's own membership of the
 * public catalog.
 */
export async function deleteSectionAction(
  courseId: string,
  sectionId: string,
): Promise<ActionResult> {
  try {
    await apiSend('DELETE', `/api/admin/sections/${sectionId}`, z.object({ id: z.uuid() }));
    invalidateCourse(courseId);
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

const CreateLessonResultSchema = z.object({ id: z.uuid() });

export type CreateLessonInput = {
  title: string;
  kind: 'video' | 'quiz' | 'attachment' | 'text';
};

export async function createLessonAction(
  courseId: string,
  sectionId: string,
  input: CreateLessonInput,
): Promise<ActionResult> {
  try {
    await apiSend('POST', `/api/admin/sections/${sectionId}/lessons`, CreateLessonResultSchema, {
      title: input.title,
      kind: input.kind,
      isPublished: false,
      isFreePreview: false,
      estimatedSeconds: 0,
      completionMode: 'manual',
      completionMinViewSeconds: null,
      completionPassGrade: null,
    });
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function setLessonPublishedAction(
  courseId: string,
  lessonId: string,
  isPublished: boolean,
): Promise<ActionResult> {
  try {
    await apiSend('PATCH', `/api/admin/lessons/${lessonId}`, z.object({ id: z.uuid() }), {
      isPublished,
    });
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/**
 * Mirrors `LessonUpdateSchema`'s partial shape, minus `kind`.
 *
 * `kind` is deliberately absent: changing a video lesson into a quiz lesson
 * would orphan its `LessonVideo` row and leave a quiz lesson with no quiz, and
 * the UI offers delete-and-recreate instead — the same reasoning that keeps a
 * resource's kind uneditable.
 *
 * The completion rule is a COUPLED pair. `LessonUpdateSchema.refine` requires
 * `completionMinViewSeconds` with `on_view`, and `completionPassGrade` with
 * `on_grade`/`on_pass`. Callers must send the mode and its dependent value in
 * the SAME payload; a mode sent alone is a 400 the admin cannot act on.
 */
export type UpdateLessonInput = {
  title?: string;
  isPublished?: boolean;
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
    invalidateCourse(courseId);
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
    invalidateCourse(courseId);
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

/**
 * Detaches the video, leaving the lesson itself in place. The API asserts the
 * lesson is a video lesson first, so this cannot silently no-op on a quiz.
 */
export async function removeLessonVideoAction(
  courseId: string,
  lessonId: string,
): Promise<ActionResult> {
  try {
    await apiSend(
      'DELETE',
      `/api/admin/lessons/${lessonId}/video`,
      z.object({ lessonId: z.uuid() }),
    );
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/**
 * How long the pasted video runs, AND whether YouTube will let it play inside
 * our page — asked of the API the moment a complete id appears in the field, so
 * the admin sees both before saving rather than hearing the second one from a
 * student.
 *
 * Never throws: a probe that fails is a line of text under the field, not a
 * broken form. The save re-asks server-side anyway.
 */
export async function probeVideoDurationAction(
  url: string,
): Promise<{ durationSeconds: number | null; embed: VideoEmbedStatus }> {
  try {
    return await apiGetAuthed(
      `/api/admin/lessons/video-duration?url=${encodeURIComponent(url)}`,
      z.object({
        durationSeconds: z.number().int().positive().nullable(),
        embed: VideoEmbedStatusSchema,
      }),
    );
  } catch {
    // `unknown`, never `ok`. Reporting a check we could not run as a pass is
    // the same silent pass that let unplayable videos reach students already.
    return { durationSeconds: null, embed: 'unknown' };
  }
}

export async function setLessonVideoAction(
  courseId: string,
  lessonId: string,
  /**
   * `durationSeconds` is OPTIONAL and normally absent — the API asks YouTube.
   * It is sent only when the browser already knows the number (its own probe
   * succeeded) or the admin typed one because nothing else could find it.
   */
  input: { url: string; durationSeconds?: number; posterKey: string | null },
): Promise<ActionResult> {
  try {
    await apiSend(
      'PUT',
      `/api/admin/lessons/${lessonId}/video`,
      z.object({ lessonId: z.uuid() }),
      {
        provider: 'youtube',
        url: input.url,
        durationSeconds: input.durationSeconds,
        // Was a hardcoded `null`. The column, the DTO and the player's
        // `posterUrl` all existed; this line is the whole reason a lesson
        // could never have a thumbnail.
        posterKey: input.posterKey,
      },
    );
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    // 422 is the ONE refusal with a human cause: the save carried no duration
    // and the API's own probe came back empty. Surfacing `apiSend`'s message
    // here would print "PUT /api/… failed with 422: {…}" at an instructor.
    if (error instanceof Error && error.message.includes('failed with 422')) {
      return { ok: false, message: copy.admin.lesson.durationUnavailable };
    }
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function setLessonTextAction(
  courseId: string,
  lessonId: string,
  bodyHtml: string,
): Promise<ActionResult> {
  try {
    await apiSend('PUT', `/api/admin/lessons/${lessonId}/text`, z.object({ lessonId: z.uuid() }), {
      bodyHtml,
    });
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/* ── lesson resources ───────────────────────────────────────────────────
 * Materials hang off ANY lesson kind, so these take a lessonId and never
 * inspect the lesson's kind — see `LessonService.addResource` for why the
 * predecessor's `assertKind` gate was the bug, not the safeguard.
 * ─────────────────────────────────────────────────────────────────────── */

const ResourceRowSchema = z.object({ id: z.uuid() });

/**
 * Mirrors `LessonResourceInputSchema`'s INPUT shape (a video carries `url`,
 * not `videoExternalId`). The API's Zod transform is what turns it into
 * columns, so nothing here reconstructs or parses a URL.
 */
export type AddResourceInput =
  | {
      kind: 'presentation' | 'document';
      title: string;
      description: string | null;
      storageKey: string;
      filename: string;
      mime: string;
      sizeBytes: number;
    }
  | { kind: 'video'; title: string; description: string | null; provider: 'youtube'; url: string }
  | { kind: 'link'; title: string; description: string | null; linkUrl: string };

export async function addResourceAction(
  courseId: string,
  lessonId: string,
  input: AddResourceInput,
): Promise<ActionResult> {
  try {
    await apiSend(
      'POST',
      `/api/admin/lessons/${lessonId}/resources`,
      ResourceRowSchema,
      input,
    );
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function updateResourceAction(
  courseId: string,
  resourceId: string,
  input: { title?: string; description?: string | null },
): Promise<ActionResult> {
  try {
    await apiSend('PATCH', `/api/admin/resources/${resourceId}`, ResourceRowSchema, input);
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function removeResourceAction(
  courseId: string,
  resourceId: string,
): Promise<ActionResult> {
  try {
    await apiSend('DELETE', `/api/admin/resources/${resourceId}`, ResourceRowSchema);
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function reorderResourcesAction(
  courseId: string,
  lessonId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  try {
    // Parsed here as well as on the server: a duplicate id in the array is a
    // client bug worth catching before it becomes a 400.
    const body = ReorderSchema.parse({ orderedIds });
    await apiSend(
      'PATCH',
      `/api/admin/lessons/${lessonId}/resources/order`,
      z.object({ updated: z.number() }),
      body,
    );
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/**
 * Designates (or clears, with `null`) the course's final exam. The API
 * validates that the lesson belongs to this course and is a quiz lesson; the
 * composite FK behind it is what holds against a direct write.
 */
export type ScaffoldExamResult = { ok: true; quizId: string } | { ok: false; message: string };

/**
 * One press builds the course's exam and hands back the quiz to open.
 *
 * Safe to press twice — the API returns the existing exam rather than making a
 * second one — which is why the button never needs disabling on a course that
 * already has one, and why a double-click cannot produce two exams.
 */
export async function scaffoldExamAction(courseId: string): Promise<ScaffoldExamResult> {
  try {
    const result = await apiSend(
      'POST',
      `/api/admin/courses/${courseId}/exam/scaffold`,
      ExamScaffoldResultSchema,
    );
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true, quizId: result.quizId };
  } catch {
    return { ok: false, message: copy.admin.exam.scaffoldFailed };
  }
}

export async function setCourseExamAction(
  courseId: string,
  examLessonId: string | null,
): Promise<ActionResult> {
  try {
    const body = CourseExamPatchSchema.parse({ examLessonId });
    await apiSend('PUT', `/api/admin/courses/${courseId}/exam`, CourseRowSchema, body);
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}
