'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { copy } from '@ayman/contracts/copy/admin';
import { AdminApiError, adminSend } from '@/lib/admin-api';
import { TAG_COURSES, courseTag } from '@/lib/cache-tags';
import { revalidatePath } from '@/lib/revalidate-screen';

export type VideoActionResult = { ok: true } | { ok: false; message: string };

const DeletedSchema = z.object({ videoId: z.string(), lessonIds: z.array(z.string()) });

/**
 * Delete one uploaded video — its files, and the lesson rows still pointing at
 * it.
 *
 * `courseId` is the course the row was shown under, or `null` for a leftover
 * no lesson uses. With one, the course's cache and the catalog are busted the
 * way `removeLessonVideoAction` does: the lecture just lost its video, and the
 * public lesson page must stop offering a player for files that are gone.
 *
 * The API's own refusal is shown when it is Arabic — «لسه بيترفع…» names the
 * fix — and anything else becomes the generic line.
 */
export async function deleteVideoAction(
  videoId: string,
  courseId: string | null,
): Promise<VideoActionResult> {
  try {
    await adminSend('DELETE', `/api/admin/videos/${encodeURIComponent(videoId)}`, undefined, DeletedSchema);
  } catch (error) {
    const body = error instanceof AdminApiError ? error.payload : null;
    const message =
      body !== null && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : '';
    return {
      ok: false,
      message: /[\u0600-\u06FF]/.test(message) ? message : copy.admin.videos.errorGeneric,
    };
  }

  if (courseId !== null) {
    updateTag(courseTag(courseId));
    updateTag(TAG_COURSES);
    revalidatePath(`/admin/courses/${courseId}`);
  }
  revalidatePath('/admin/videos');
  return { ok: true };
}

/**
 * «رجّعه لمحاضرة» — put a kept video back on a video lesson. Whatever that
 * lesson plays now is kept in its place by the API, never deleted.
 */
export async function restoreVideoAction(videoId: string, lessonId: string): Promise<VideoActionResult> {
  try {
    await adminSend(
      'POST',
      `/api/admin/videos/${encodeURIComponent(videoId)}/restore`,
      { lessonId },
      z.object({ videoId: z.string(), lessonId: z.string() }),
    );
  } catch (error) {
    const body = error instanceof AdminApiError ? error.payload : null;
    const message =
      body !== null && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : '';
    return { ok: false, message: /[\u0600-\u06FF]/.test(message) ? message : copy.admin.videos.errorGeneric };
  }
  // The lesson's course is not known here; the catalog tag covers every card.
  updateTag(TAG_COURSES);
  revalidatePath('/admin/videos');
  return { ok: true };
}
