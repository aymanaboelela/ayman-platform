import Link from 'next/link';
import { ArrowRight, ClipboardPaste, PenLine } from 'lucide-react';
import { z } from 'zod';
import { copy } from '@ayman/contracts/copy/admin';
import { apiGetAuthed } from '@/lib/api-server';
import { BulkImportDialog } from '@/components/admin/quiz/bulk-import-dialog';
import { QuestionForm } from '@/components/admin/quiz/question-form';
import '@/components/admin/quiz/question-bank.css';

const c = copy.quizAdmin.bank;

const CategorySchema = z.object({ id: z.string(), name: z.string() });

export const metadata = { title: copy.quizAdmin.newQuestion };

/**
 * `?category=` بيختار التصنيف مقدّمًا — «سؤال جديد» من «أسئلة الألعاب» بيفتح
 * على تصنيف الدرس نفسه بدل أول تصنيف في البنك. التصنيف بيتحط أول القايمة
 * (الفورم بياخد أول واحد افتراضي)، ولو مش موجود القايمة زي ما هي.
 *
 * والصفحة بتقول من فوق إن فيه طريقتين: سؤال واحد بالفورم اللي تحت، أو أسئلة
 * كتير بلصقة واحدة — نفس نافذة «لصق أسئلة كتير» بتاعة البنك، على نفس التصنيف.
 * و«حفظ ونشر» بيرجّع للبنك على التصنيف ده، والسؤال أول صف فيه.
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
      <Link href={wanted ? `/admin/questions?category=${encodeURIComponent(wanted.id)}` : '/admin/questions'} className="qpage-crumb">
        <ArrowRight className="size-4" aria-hidden="true" />
        {c.backToBank}
      </Link>
      <h1 className="mb-5 text-[length:var(--fs-title-2)] font-semibold">{copy.quizAdmin.newQuestion}</h1>

      <div className="qnew-ways">
        <div className="qnew-way qnew-way--here">
          <span className="qnew-way__well" aria-hidden="true">
            <PenLine className="size-5" />
          </span>
          <span>
            <span className="qnew-way__title block">{c.newWriteTitle}</span>
            <span className="qnew-way__hint block">{c.newWriteHint}</span>
          </span>
        </div>
        <div className="qnew-way">
          <span className="qnew-way__well" aria-hidden="true">
            <ClipboardPaste className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="qnew-way__title block">{c.newPasteTitle}</span>
            <span className="qnew-way__hint block">{c.newPasteHint}</span>
          </span>
          <span className="qnew-way__action">
            <BulkImportDialog categories={ordered} defaultCategoryId={wanted?.id} />
          </span>
        </div>
      </div>

      <QuestionForm categories={ordered} publishOnSave />
    </>
  );
}
