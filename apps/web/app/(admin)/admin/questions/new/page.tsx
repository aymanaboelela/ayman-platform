import { z } from 'zod';
import { copy } from '@ayman/contracts/copy/admin';
import { apiGetAuthed } from '@/lib/api-server';
import { QuestionForm } from '@/components/admin/quiz/question-form';

const CategorySchema = z.object({ id: z.string(), name: z.string() });

export const metadata = { title: copy.quizAdmin.newQuestion };

export default async function NewQuestionPage() {
  const categories = await apiGetAuthed('/api/admin/questions/categories', z.array(CategorySchema));
  return (
    <>
      <h1 className="mb-6 text-[length:var(--fs-title-2)] font-semibold">{copy.quizAdmin.newQuestion}</h1>
      <QuestionForm categories={categories} />
    </>
  );
}
