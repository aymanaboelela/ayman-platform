'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, BookOpen, Layers, Loader2, Play, Sparkles } from 'lucide-react';
import { ExternalBookPracticeSessionSchema } from '@ayman/contracts/quiz/external-books';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { cn } from '@ayman/ui/lib/cn';
import { apiPost } from '@/lib/api';

export interface PracticeStartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId: string;
  courseSlug: string;
  scope: 'book' | 'unit' | 'lesson';
  scopeId: string;
  scopeTitle: string;
  availableCount: number;
}

export function PracticeStartDialog({
  open,
  onOpenChange,
  bookId,
  courseSlug,
  scope,
  scopeId,
  scopeTitle,
  availableCount,
}: PracticeStartDialogProps) {
  const router = useRouter();

  // الخيارات المقترحة لعدد الأسئلة
  const defaultCount = Math.min(10, Math.max(1, availableCount));
  const [count, setCount] = useState<number>(defaultCount);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // إعداد قائمة الخيارات المتاحة حسب عدد الأسئلة المتوفرة
  const countOptions = [5, 10, 15, 20].filter((n) => n <= availableCount);
  if (!countOptions.includes(availableCount) && availableCount > 0) {
    countOptions.push(availableCount);
  }
  if (countOptions.length === 0 && availableCount > 0) {
    countOptions.push(availableCount);
  }

  const handleStart = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const session = await apiPost(
        `/api/me/external-books/${encodeURIComponent(bookId)}/practice`,
        ExternalBookPracticeSessionSchema,
        {
          scope,
          scopeId,
          count,
        },
      );

      onOpenChange(false);
      router.push(
        `/library/${encodeURIComponent(courseSlug)}/books/${encodeURIComponent(bookId)}/practice/${encodeURIComponent(session.sessionId)}`,
      );
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'تعذر بدء الاختبار حالياً، يرجى المحاولة مرة أخرى.',
      );
      setLoading(false);
    }
  };

  const scopeLabel =
    scope === 'book'
      ? 'امتحان شامل على الكتاب'
      : scope === 'unit'
        ? 'اختبار على الوحدة'
        : 'اختبار على الدرس';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel="إغلاق" className="max-w-[28rem] rounded-2xl border-line bg-surface p-6 shadow-xl sm:max-w-[32rem]">
        <DialogHeader className="text-start">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface-2 text-accent">
              <BookOpen size={22} aria-hidden="true" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1 text-[length:var(--fs-text-xs)] font-medium text-accent">
                <Sparkles size={12} aria-hidden="true" />
                {scopeLabel}
              </span>
              <DialogTitle className="text-[length:var(--fs-title-4)] font-bold text-fg">
                {scopeTitle}
              </DialogTitle>
            </div>
          </div>

          <DialogDescription className="text-[length:var(--fs-text-sm)] text-fg-muted">
            اختر عدد الأسئلة التي ترغب في حلها. سيتم سحب الأسئلة عشوائياً من بنك أسئلة هذا القسم، مع
            تصحيح ومراجعة كاملة للإجابات والتفسيرات بعد الانتهاء.
          </DialogDescription>
        </DialogHeader>

        <div className="my-4 space-y-4">
          <div>
            <label className="mb-2 block text-[length:var(--fs-text-sm)] font-medium text-fg">
              عدد أسئلة الاختبار (متوفر {availableCount} سؤال):
            </label>
            <div className="grid grid-cols-4 gap-2">
              {countOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setCount(opt)}
                  className={cn(
                    'flex h-11 items-center justify-center rounded-lg border text-[length:var(--fs-text-sm)] font-semibold transition-all',
                    count === opt
                      ? 'border-accent bg-accent font-bold text-[#1A1206] shadow-xs'
                      : 'border-line bg-surface-2 text-fg hover:border-line-hover hover:bg-surface-3',
                  )}
                >
                  {opt === availableCount ? `الكل (${opt})` : `${opt} أسئلة`}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface-2 p-3.5 text-[length:var(--fs-text-xs)] text-fg-muted">
            <div className="flex items-center gap-2 font-medium text-fg">
              <Layers size={14} className="text-accent" />
              <span>نظام الاختبار:</span>
            </div>
            <ul className="mt-1.5 list-inside list-disc space-y-1">
              <li>يمكنك التنقل بين الأسئلة وتعديل إجاباتك بحرية.</li>
              <li>عند الانتهاء والتسليم، ستظهر نتيجتك وتقييم مستواك فوراً.</li>
              <li>ستتمكن من مراجعة كل سؤال مع الإجابة الصحيحة وشرح المعلم.</li>
            </ul>
          </div>

          {error ? (
            <div className="flex items-center gap-2 rounded-lg border border-err/30 bg-err/10 p-3 text-[length:var(--fs-text-xs)] text-err">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-row items-center justify-end gap-2 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            إلغاء
          </Button>
          <Button
            type="button"
            onClick={handleStart}
            disabled={loading || availableCount === 0}
            className="gap-2 bg-accent text-[#1A1206] hover:bg-accent-hover"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>جاري تحضير الأسئلة...</span>
              </>
            ) : (
              <>
                <Play size={15} className="fill-current" />
                <span>ابدأ الاختبار الآن ({count} أسئلة)</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
