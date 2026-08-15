import Link from 'next/link';
import { z } from 'zod';
import { QuizSettingsSchema, formatCopy } from '@ayman/contracts';
import { QuestionTypeSchema } from '@ayman/contracts/quiz/question';
import { copy } from '@ayman/contracts/copy/admin';
import { apiGetAuthed } from '@/lib/api-server';
import { PaperTabs } from '@/components/admin/quiz/paper-tabs';
import { PublishQuizButton } from '@/components/admin/quiz/publish-quiz-button';
import { QuizSettingsForm } from '@/components/admin/quiz/quiz-settings-form';

/** Only what `NewQuestionDialog`'s embedded editor needs to fill its select. */
const CategorySchema = z.object({ id: z.string(), name: z.string() });

/** Exported for `page.test.ts`, which parses one slot of every question type
 *  the contract knows about — the check the literal list below used to fail
 *  silently, in production, on the first exam that used a new type. */
export const HydratedQuizSchema = z.object({
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
      /** Null on a pool slot — see the service's own note on the field. */
      bankEntryId: z.string().nullable(),
      /**
       * `QuestionTypeSchema`, NOT a hand-written list of the same strings.
       *
       * The literal list this replaces predated `ordering` and silently did
       * not include it, so the FIRST exam anyone put an ordering question in
       * would have failed this parse — the builder page for that quiz throws
       * rather than rendering, and the only exam affected is the one the
       * instructor was in the middle of building. TypeScript cannot catch it:
       * an array of string literals typechecks perfectly while being wrong
       * about which types exist.
       *
       * The enum is exported from the same contract the API serialises from.
       * A seventh question type now reaches this page by existing, which is
       * the only way it should ever have.
       */
      type: QuestionTypeSchema.nullable(),
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
  /*
   * Two independent reads, so they are issued together. The categories are for
   * the «اكتب سؤال جديد» dialog, which embeds the question bank's own editor —
   * fetching them from inside the dialog would leave an empty category select
   * on a form the instructor has already started typing into.
   */
  const [quiz, categories] = await Promise.all([
    apiGetAuthed(`/api/admin/quizzes/${quizId}`, HydratedQuizSchema),
    apiGetAuthed('/api/admin/questions/categories', z.array(CategorySchema)),
  ]);

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
        categories={categories}
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
