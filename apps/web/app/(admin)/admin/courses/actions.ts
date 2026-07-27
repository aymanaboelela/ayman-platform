'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  CourseCreateSchema,
  CourseStatusPatchSchema,
  CourseUpdateSchema,
  ReorderSchema,
  copy,
} from '@ayman/contracts';
import { apiSend } from '@/lib/api-server';
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
