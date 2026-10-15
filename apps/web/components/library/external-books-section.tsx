import Link from 'next/link';
import { BookOpen, CheckCircle, ChevronLeft, Layers, Sparkles } from 'lucide-react';
import type { StudentExternalBookSummary } from '@ayman/contracts/quiz/external-books';
import { cn } from '@ayman/ui';

interface ExternalBooksSectionProps {
  books: StudentExternalBookSummary[];
  courseSlug: string;
}

/**
 * قسم أسئلة الكتب الخارجية في صفحة الكورس للطالب المشترك.
 * يعرض الكتب المرتبطة بالمنهج ويتيح للطالب التدرب واختبار نفسه.
 */
export function ExternalBooksSection({ books, courseSlug }: ExternalBooksSectionProps) {
  if (books.length === 0) return null;

  return (
    <section className="mb-8 overflow-hidden rounded-xl border border-line bg-surface-2 p-5 md:p-6 shadow-[var(--shadow-sm)]">
      {/* رأس القسم */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface-3 text-accent shadow-xs">
            <BookOpen size={20} aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[length:var(--fs-title-4)] font-bold text-fg">
                أسئلة الكتب الخارجية
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[length:var(--fs-text-xs)] font-medium text-accent">
                <Sparkles size={11} aria-hidden="true" />
                متاح لاشتراكك
              </span>
            </div>
            <p className="mt-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
              بنوك أسئلة وتدريبات المنهج لاختبار فهمك بعد كل درس أو وحدة، مع تصحيح فوري وشرح للإجابات.
            </p>
          </div>
        </div>

        <span className="text-[length:var(--fs-text-xs)] font-medium text-fg-muted">
          {books.length} {books.length === 1 ? 'كتاب متاح' : 'كتب متاحة'}
        </span>
      </div>

      {/* شبكة كروت الكتب */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {books.map((book) => (
          <div
            key={book.id}
            className={cn(
              'group relative flex flex-col justify-between rounded-xl border border-line bg-surface p-4 md:p-5',
              'transition-all duration-200 hover:border-line-hover hover:bg-surface-2/80 hover:shadow-md',
            )}
          >
            <div>
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="text-[length:var(--fs-text-base)] font-bold text-fg transition-colors group-hover:text-accent">
                  {book.title}
                </h3>
                <span className="shrink-0 rounded-md border border-ok/30 bg-ok/10 px-2 py-0.5 text-[length:var(--fs-text-xs)] font-semibold text-ok">
                  {book.ready} سؤال
                </span>
              </div>

              <div className="mb-4 flex items-center gap-4 text-[length:var(--fs-text-xs)] text-fg-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Layers size={13} className="text-accent" aria-hidden="true" />
                  {book.unitsCount} وحدات
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle size={13} className="text-ok" aria-hidden="true" />
                  {book.lessonsCount} درس
                </span>
              </div>
            </div>

            <div className="pt-2">
              <Link
                href={`/library/${encodeURIComponent(courseSlug)}/books/${encodeURIComponent(book.id)}`}
                className={cn(
                  'inline-flex w-full items-center justify-between rounded-lg border border-line bg-surface-3 px-3.5 py-2.5',
                  'text-[length:var(--fs-text-sm)] font-medium text-fg transition-colors',
                  'hover:border-accent/50 hover:bg-accent hover:text-[#1A1206]',
                )}
              >
                <span>تصفح الأسئلة وابدأ الاختبار</span>
                <ChevronLeft size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
