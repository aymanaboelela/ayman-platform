'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  CourseCreateSchema,
  CourseExamPatchSchema,
  CourseStatusPatchSchema,
  CourseUpdateSchema,
  ReorderSchema,
  copy,
} from '@ayman/contracts';
import { headers } from 'next/headers';
import { apiSend } from '@/lib/api-server';
import { resolve } from '@/lib/api';
import { CSRF_COOKIE, CSRF_HEADER } from '@/lib/csrf';
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
    coverKey: null,
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
    });

    await apiSend('PATCH', `/api/admin/courses/${courseId}`, CourseRowSchema, parsed);

    // Per-entity ONLY. Editing a title must not evict the other 40 courses.
    // updateTag (not revalidateTag) so the editor's next read is their own write.
    updateTag(courseTag(courseId));
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function setCourseStatusAction(
  courseId: string,
  status: 'draft' | 'published' | 'archived',
): Promise<ActionResult> {
  try {
    const body = CourseStatusPatchSchema.parse({ status });
    await apiSend('PATCH', `/api/admin/courses/${courseId}/status`, CourseRowSchema, body);

    // Publishing changes LIST MEMBERSHIP, so the coarse tag has to go too —
    // this is the one operation that legitimately invalidates the catalog.
    updateTag(courseTag(courseId));
    updateTag(TAG_COURSES);
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
    updateTag(courseTag(courseId));
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
    updateTag(courseTag(courseId));
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
    updateTag(courseTag(courseId));
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
    updateTag(courseTag(courseId));
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
    updateTag(courseTag(courseId));
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
    updateTag(courseTag(courseId));
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
    updateTag(courseTag(courseId));
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
    updateTag(courseTag(courseId));
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function setLessonVideoAction(
  courseId: string,
  lessonId: string,
  input: { url: string; durationSeconds: number },
): Promise<ActionResult> {
  try {
    await apiSend(
      'PUT',
      `/api/admin/lessons/${lessonId}/video`,
      z.object({ lessonId: z.uuid() }),
      { provider: 'youtube', url: input.url, durationSeconds: input.durationSeconds, posterKey: null },
    );
    updateTag(courseTag(courseId));
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
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
    updateTag(courseTag(courseId));
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
    updateTag(courseTag(courseId));
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
    updateTag(courseTag(courseId));
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
    updateTag(courseTag(courseId));
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
    updateTag(courseTag(courseId));
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

const UploadedDocumentSchema = z.object({
  storageKey: z.string(),
  filename: z.string(),
  mime: z.string(),
  sizeBytes: z.number().int().positive(),
});

export type UploadedDocument = z.infer<typeof UploadedDocumentSchema>;

export type UploadResult =
  | { ok: true; document: UploadedDocument }
  | { ok: false; message: string };

/**
 * Multipart, so it builds its own request rather than going through `apiSend`
 * — that helper always `JSON.stringify`s its body, which a `File` cannot
 * survive. Same shape as `uploadMediaAction`, pointed at the DOCUMENT
 * pipeline (`POST /api/media/documents`), which does not run sharp.
 *
 * Returns the storage key for the caller to put into `addResourceAction`. The
 * browser never chooses a key: it is minted server-side from a UUID, and the
 * original filename never touches a path.
 */
export async function uploadResourceDocumentAction(formData: FormData): Promise<UploadResult> {
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { ok: false, message: 'no file selected' };
  }

  try {
    const incoming = await headers();
    const cookie = incoming.get('cookie');
    const csrf = cookie
      ?.split('; ')
      .find((entry) => entry.startsWith(`${CSRF_COOKIE}=`))
      ?.slice(CSRF_COOKIE.length + 1);

    const upstream = new FormData();
    upstream.set('file', file, file.name);

    const response = await fetch(resolve('/api/media/documents'), {
      method: 'POST',
      headers: {
        ...(cookie ? { cookie } : {}),
        [CSRF_HEADER]: csrf ?? 'server-action',
      },
      body: upstream,
      cache: 'no-store',
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `POST /api/media/documents failed with ${response.status}: ${detail.slice(0, 200)}`,
      );
    }

    return { ok: true, document: UploadedDocumentSchema.parse(await response.json()) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/**
 * Designates (or clears, with `null`) the course's final exam. The API
 * validates that the lesson belongs to this course and is a quiz lesson; the
 * composite FK behind it is what holds against a direct write.
 */
export async function setCourseExamAction(
  courseId: string,
  examLessonId: string | null,
): Promise<ActionResult> {
  try {
    const body = CourseExamPatchSchema.parse({ examLessonId });
    await apiSend('PUT', `/api/admin/courses/${courseId}/exam`, CourseRowSchema, body);
    updateTag(courseTag(courseId));
    updateTag(TAG_COURSES);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}
