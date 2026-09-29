import { z } from 'zod';
import { copy } from '@ayman/contracts/copy/admin';
import { apiGetAuthed } from '@/lib/api-server';
import { QuestionForm } from '@/components/admin/quiz/question-form';

const CategorySchema = z.object({ id: z.string(), name: z.string() });

export const metadata = { title: copy.quizAdmin.newQuestion };

/**
 * `?category=` بيختار التصنيف مقدّمًا — «سؤال جديد» من «أسئلة الألعاب» بيفتح
 * على تصنيف الدرس نفسه بدل أول تصنيف في البنك. التصنيف بيتحط أول القايمة
 * (الفورم بياخد أول واحد افتراضي)، ولو مش موجود القايمة زي ما هي.
 */
export default async function NewQuestionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { category } = await searchParams;
  const categories = await apiGetAuthed('/api/admin/questions/categories', z.array(CategorySchema));
  const wanted = typeof category === 'string' ? categories.find((entry) => entry.id === category) : undefined;
  const ordered = wanted ? [wanted, ...categories.filter((entry) => entry.id !== wanted.id)] : categories;
  return (
    <>
      <h1 className="mb-6 text-[length:var(--fs-title-2)] font-semibold">{copy.quizAdmin.newQuestion}</h1>
      <QuestionForm categories={ordered} />
    </>
  );
}
