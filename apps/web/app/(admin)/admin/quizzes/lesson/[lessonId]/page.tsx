import { redirect } from 'next/navigation';
import { z } from 'zod';
import { DEFAULT_REVIEW_OPTIONS_PRACTICE, QuizSettingsSchema } from '@ayman/contracts';
import { ApiRequestError } from '@/lib/api';
import { apiGetAuthed, apiSend } from '@/lib/api-server';

/**
 * A quiz is 1:1 with its lesson. This is the ONLY entry point that creates
 * one — get-or-create, never re-upsert an already-customised quiz. Re-running
 * `upsertForLesson` on every visit would silently reset an instructor's
 * settings back to the practice defaults each time they clicked in.
 */
export default async function QuizForLessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;

  let quizId: string;
  try {
    const existing = await apiGetAuthed(`/api/admin/quizzes/lesson/${lessonId}`, z.object({ id: z.string() }));
    quizId = existing.id;
  } catch (error) {
    if (!(error instanceof ApiRequestError) || error.status !== 404) throw error;
    const defaults = QuizSettingsSchema.parse({ reviewOptions: DEFAULT_REVIEW_OPTIONS_PRACTICE });
    const created = await apiSend(
      'PUT',
      `/api/admin/quizzes/lesson/${lessonId}`,
      z.object({ id: z.string() }),
      defaults,
    );
    quizId = created.id;
  }

  redirect(`/admin/quizzes/${quizId}`);
}
