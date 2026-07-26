import Link from 'next/link';
import { z } from 'zod';
import { QuizSettingsSchema, copy, formatCopy } from '@ayman/contracts';
import { apiGetAuthed } from '@/lib/api-server';
import { AddPoolDialog } from '@/components/admin/quiz/add-pool-dialog';
import { AddSlotDialog } from '@/components/admin/quiz/add-slot-dialog';
import { PublishQuizButton } from '@/components/admin/quiz/publish-quiz-button';
import { QuizSettingsForm } from '@/components/admin/quiz/quiz-settings-form';
import { RemovableSlotList } from '@/components/admin/quiz/removable-slot-list';

const HydratedQuizSchema = z.object({
  id: z.string(),
  lessonId: z.string(),
  isPublished: z.boolean(),
  sumMarks: z.number(),
  settings: QuizSettingsSchema,
  slots: z.array(
    z.object({
      id: z.string(),
      position: z.number(),
      maxMark: z.number(),
      kind: z.enum(['question', 'pool']),
      type: z.enum(['mcq_single', 'mcq_multi', 'true_false', 'short_answer', 'essay']).nullable(),
      stemHtml: z.string().nullable(),
      poolName: z.string().nullable(),
      poolPickCount: z.number().nullable(),
    }),
  ),
});

export const metadata = { title: copy.quizAdmin.quizTitle };

/** Not cached — an editor must see their own just-added slot immediately. */
export default async function QuizBuilderPage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const quiz = await apiGetAuthed(`/api/admin/quizzes/${quizId}`, HydratedQuizSchema);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[length:var(--fs-title-2)] font-semibold">{copy.quizAdmin.quizTitle}</h1>
          <p className="mono mt-1 text-[length:var(--fs-mono-label)] text-fg-muted">
            {formatCopy(copy.quiz.totalMarks, { marks: quiz.sumMarks })}
          </p>
        </div>
        <PublishQuizButton quizId={quiz.id} isPublished={quiz.isPublished} />
      </div>

      <section>
        <QuizSettingsForm lessonId={quiz.lessonId} defaultValues={quiz.settings} />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-[length:var(--fs-title-4)] font-semibold">{copy.quizAdmin.slots}</h2>
          <div className="flex gap-2">
            <AddSlotDialog quizId={quiz.id} />
            <AddPoolDialog quizId={quiz.id} />
          </div>
        </div>

        {quiz.slots.length === 0 ? (
          <p className="text-fg-muted">{copy.quizAdmin.slotsEmpty}</p>
        ) : (
          <RemovableSlotList quizId={quiz.id} slots={quiz.slots} />
        )}
      </section>

      <div className="flex gap-4">
        <Link href={`/admin/quizzes/${quiz.id}/attempts`} className="text-[length:var(--fs-text-sm)] text-fg-muted underline">
          {copy.quizAdmin.attemptsTitle}
        </Link>
        <Link href={`/admin/quizzes/${quiz.id}/analytics`} className="text-[length:var(--fs-text-sm)] text-fg-muted underline">
          {copy.quizAdmin.analyticsTitle}
        </Link>
      </div>

      <Link href="/admin/questions" className="text-[length:var(--fs-text-sm)] text-fg-muted underline">
        {copy.quizAdmin.bankTitle}
      </Link>
    </div>
  );
}
