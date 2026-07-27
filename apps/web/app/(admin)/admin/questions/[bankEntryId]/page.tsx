import { z } from 'zod';
import { QuestionInputSchema, copy } from '@ayman/contracts';
import { apiGetAuthed } from '@/lib/api-server';
import { PublishQuestionButton } from '@/components/admin/quiz/publish-question-button';
import { QuestionForm } from '@/components/admin/quiz/question-form';

const CategorySchema = z.object({ id: z.string(), name: z.string() });

const HydratedSchema = z.object({
  bankEntryId: z.string(),
  versionId: z.string(),
  version: z.number(),
  // See the identical comment in `admin/questions/page.tsx` — Prisma's
  // `QuestionStatus` also has `hidden` (a retired question), and omitting it
  // here throws a `ZodError` on `apiGetAuthed` for that entry.
  status: z.enum(['draft', 'ready', 'hidden']),
  input: QuestionInputSchema,
});

export const metadata = { title: copy.quizAdmin.editQuestion };

export default async function EditQuestionPage({
  params,
}: {
  params: Promise<{ bankEntryId: string }>;
}) {
  const { bankEntryId } = await params;
  const [hydrated, categories] = await Promise.all([
    apiGetAuthed(`/api/admin/questions/${bankEntryId}`, HydratedSchema),
    apiGetAuthed('/api/admin/questions/categories', z.array(CategorySchema)),
  ]);

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold">{copy.quizAdmin.editQuestion}</h1>
        {hydrated.status === 'ready' ? (
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{copy.quizAdmin.published}</p>
        ) : (
          <PublishQuestionButton versionId={hydrated.versionId} />
        )}
      </div>
      <QuestionForm categories={categories} bankEntryId={hydrated.bankEntryId} defaultValues={hydrated.input} />
    </>
  );
}
