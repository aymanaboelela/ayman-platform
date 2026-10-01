import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NotebookPen } from 'lucide-react';
import { MistakeNotebookSchema, type MistakeNotebook } from '@ayman/contracts/mistakes';
import { mistakesCopy } from '@ayman/contracts/copy/mistakes';
import { MistakesApp } from '@/components/mistakes/mistakes-app';
import { ApiRequestError } from '@/lib/api';
import { apiGetAuthed } from '@/lib/api-server';
import { IS_AYMAN } from '@/lib/tenant';
import '@/components/mistakes/mistakes.css';

const c = mistakesCopy;

export const metadata: Metadata = { title: c.meta.title };

/**
 * «دفتر غلطاتي» — كل سؤال غلط فيه الطالب في أي كويز، مجمّع في مكان واحد.
 * نفس شكل `(app)/arena/page.tsx` بالظبط: الدفتر بيترسم هنا، والمراجعة
 * التفاعلية (الإجابة، العداد، التثبيت) في المتصفح (`MistakesApp`).
 *
 * الفلاج مقفول = الـAPI بيرد ٤٠٤. عند أيمن البند موجود في القايمة، فبدل
 * صفحة «مش موجود» بتظهر «الدفتر مقفول دلوقتي»؛ على أي ستاك تاني مفيش بند
 * أصلًا، فـ`notFound()` زي أي فيتشر مش موجودة.
 */
export default async function MistakesPage() {
  let notebook: MistakeNotebook;
  try {
    notebook = await apiGetAuthed('/api/me/mistakes', MistakeNotebookSchema);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      if (!IS_AYMAN) notFound();
      return <MistakesClosed />;
    }
    throw error;
  }

  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-8">
      <MistakesApp notebook={notebook} />
    </main>
  );
}

function MistakesClosed() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-8">
      <section className="panel grid justify-items-center gap-2 px-6 py-10 text-center">
        <NotebookPen className="mb-2 text-fg-muted" aria-hidden="true" />
        <h1 className="text-xl font-bold text-fg">{c.closedTitle}</h1>
        <p className="text-fg-muted">{c.closedBody}</p>
      </section>
    </main>
  );
}
