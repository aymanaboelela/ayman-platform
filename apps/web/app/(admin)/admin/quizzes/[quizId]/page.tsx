import Link from 'next/link';
import { z } from 'zod';
import { QuizSettingsSchema, copy, formatCopy } from '@ayman/contracts';
import { apiGetAuthed } from '@/lib/api-server';
import { PaperTabs } from '@/components/admin/quiz/paper-tabs';
import { PublishQuizButton } from '@/components/admin/quiz/publish-quiz-button';
import { QuizSettingsForm } from '@/components/admin/quiz/quiz-settings-form';

const HydratedQuizSchema = z.object({
  id: z.string(),
  lessonId: z.string(),
  /** True iff `Course.examLessonId` points at this quiz's lesson. */
  isCourseExam: z.boolean(),
  isPublished: z.boolean(),
  sumMarks: z.number(),
  improvementSumMarks: z.number(),
  settings: QuizSettingsSchema,
  slots: z.array(
    z.object({
      id: z.string(),
      paper: z.enum(['original', 'improvement']),
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
        <QuizSettingsForm
          lessonId={quiz.lessonId}
          defaultValues={quiz.settings}
          isCourseExam={quiz.isCourseExam}
        />
      </section>

      {/*
        `PaperTabs` owns the slot list because the ADD dialogs have to know
        which paper they are adding to — a server component cannot hold the
        selected tab, and passing it down from here would mean lifting the
        whole section into client state anyway.
      */}
      <PaperTabs
        quizId={quiz.id}
        slots={quiz.slots}
        allowsImprovement={quiz.settings.allowsImprovement}
        sumMarks={quiz.sumMarks}
        improvementSumMarks={quiz.improvementSumMarks}
      />

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
