'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Flag,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import type { ReviewQuestion as ReviewQuestionData } from '@ayman/contracts/quiz/attempt';
import type {
  ExternalBookPracticeResult,
  ExternalBookPracticeSession,
} from '@ayman/contracts/quiz/external-books';
import { ExternalBookPracticeSessionSchema } from '@ayman/contracts/quiz/external-books';
import { ExternalBookPracticeResultSchema } from '@ayman/contracts/quiz/external-books';
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
import type { AnswerResponse } from '../quiz/use-attempt-autosave';
import { QuestionView, type QuestionViewData } from '../quiz/question-view';
import { QuestionNavigator } from '../quiz/question-navigator';
import { ResultHeader } from '../quiz/result-header';
import { ReviewList } from '../quiz/review-list';

interface ExternalBookPracticeRunnerProps {
  session: ExternalBookPracticeSession;
  initialResult?: ExternalBookPracticeResult | null;
  bookId: string;
  courseSlug: string;
}

export function ExternalBookPracticeRunner({
  session,
  initialResult = null,
  bookId,
  courseSlug,
}: ExternalBookPracticeRunnerProps) {
  const router = useRouter();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<string, string[]>>(new Map());
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<ExternalBookPracticeResult | null>(initialResult);
  const [retrying, setRetrying] = useState(false);

  const currentQuestion = session.questions[currentIndex];
  const totalQuestions = session.questions.length;

  const answeredCount = answers.size;
  const unansweredCount = totalQuestions - answeredCount;

  // إعداد بيانات الملاح
  const navigatorQuestions = session.questions.map((q) => ({
    slotPosition: q.slotPosition,
    answered: answers.has(q.questionId) && (answers.get(q.questionId)?.length ?? 0) > 0,
    flagged: flaggedIds.has(q.questionId),
  }));

  const handleAnswerChange = (questionId: string, resp: AnswerResponse | null) => {
    let optionIds: string[] = [];
    if (resp && resp.kind === 'choice') {
      optionIds = resp.optionIds;
    }

    setAnswers((prev) => {
      const next = new Map(prev);
      if (optionIds.length > 0) {
        next.set(questionId, optionIds);
      } else {
        next.delete(questionId);
      }
      return next;
    });
  };

  const handleFlagToggle = (questionId: string) => {
    setFlaggedIds((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  };


  const handleConfirmSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    const formattedAnswers = session.questions.map((q) => ({
      slotPosition: q.slotPosition,
      questionId: q.questionId,
      optionIds: answers.get(q.questionId) ?? [],
    }));

    try {
      const res = await apiPost(
        `/api/me/external-books/practice/${encodeURIComponent(session.sessionId)}/submit`,
        ExternalBookPracticeResultSchema,
        { answers: formattedAnswers },
      );
      setConfirmOpen(false);
      setResult(res);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSubmitError(
        err instanceof Error && err.message
          ? err.message
          : 'تعذر تسليم الاختبار، يرجى المحاولة مرة أخرى.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetakeNew = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      const newSession = await apiPost(
        `/api/me/external-books/${encodeURIComponent(bookId)}/practice`,
        ExternalBookPracticeSessionSchema,
        {
          scope: session.scope,
          scopeId: bookId,
          count: session.totalQuestions,
        },
      );
      router.push(
        `/library/${encodeURIComponent(courseSlug)}/books/${encodeURIComponent(bookId)}/practice/${encodeURIComponent(newSession.sessionId)}`,
      );
    } catch {
      // في حالة الفشل نعود لفهرس الكتاب
      router.push(`/library/${encodeURIComponent(courseSlug)}/books/${encodeURIComponent(bookId)}`);
    }
  };

  // -------------------------------------------------------------
  // شاشة النتيجة والمراجعة بعد تسليم الاختبار
  // -------------------------------------------------------------
  if (result) {
    return (
      <main className="mx-auto w-full max-w-[var(--w-shell)] px-4 py-8 md:px-6 md:py-12">
        {/* رابط العودة لفهرس الكتاب */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href={`/library/${encodeURIComponent(courseSlug)}/books/${encodeURIComponent(bookId)}`}
            className="inline-flex items-center gap-1.5 text-[length:var(--fs-text-sm)] font-medium text-fg-muted transition-colors hover:text-fg"
          >
            <ArrowRight size={16} aria-hidden="true" />
            <span>العودة لفهرس {session.bookTitle}</span>
          </Link>
          <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
            {session.scopeTitle}
          </span>
        </div>

        {/* رأس النتيجة والتقييم المعنوي */}
        <div className="mb-8">
          <ResultHeader
            scaledScore={result.score}
            gradeOutOf={result.maxScore}
            passPercent={50}
            passed={result.passed}
            needsGrading={false}
            pendingOutOf={0}
            gradedOutOf={result.maxScore}
          />
        </div>

        {/* أزرار الإجراءات بعد النتيجة */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-4">
          <div className="flex items-center gap-2">
            <span className="text-[length:var(--fs-text-sm)] font-medium text-fg">
              النتيجة: {result.score} من {result.maxScore} ({result.percentage}%)
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRetakeNew}
              disabled={retrying}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-4 py-2',
                'text-[length:var(--fs-text-sm)] font-semibold text-fg transition-colors hover:border-accent hover:bg-accent hover:text-[#1A1206]',
              )}
            >
              {retrying ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <RotateCcw size={15} />
              )}
              <span>إعادة الاختبار بأسئلة جديدة</span>
            </button>
            <Link
              href={`/library/${encodeURIComponent(courseSlug)}/books/${encodeURIComponent(bookId)}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface-3 px-4 py-2 text-[length:var(--fs-text-sm)] font-medium text-fg hover:bg-surface-2"
            >
              <span>العودة لفهرس الكتاب</span>
            </Link>
          </div>
        </div>

        {/* مراجعة تفصيلية لكل سؤال وتفسيره */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[length:var(--fs-title-4)] font-bold text-fg">
              مراجعة وتفسير إجابات الأسئلة
            </h2>
            <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
              راجع الأخطاء وتفسيراتها لتثبيت المعلومة
            </span>
          </div>

          <ReviewList questions={result.review as unknown as readonly ReviewQuestionData[]} />
        </div>
      </main>
    );
  }

  // -------------------------------------------------------------
  // شاشة أداء الاختبار والتفاعل مع الأسئلة
  // -------------------------------------------------------------
  if (!currentQuestion) {
    return (
      <div className="mx-auto max-w-lg p-10 text-center">
        <p>لا توجد أسئلة في هذه الجلسة.</p>
        <Link
          href={`/library/${encodeURIComponent(courseSlug)}/books/${encodeURIComponent(bookId)}`}
          className="mt-4 inline-block text-accent hover:underline"
        >
          العودة للكتاب
        </Link>
      </div>
    );
  }

  const currentOptionIds = answers.get(currentQuestion.questionId);
  const currentResponse: AnswerResponse | null =
    currentOptionIds && currentOptionIds.length > 0
      ? { kind: 'choice', optionIds: currentOptionIds }
      : null;

  const currentViewData: QuestionViewData = {
    slotPosition: currentQuestion.slotPosition,
    type: currentQuestion.type,
    stemHtml: currentQuestion.stemHtml,
    maxMark: currentQuestion.maxMark,
    options: currentQuestion.options,
    flagged: flaggedIds.has(currentQuestion.questionId),
    settings: currentQuestion.settings ?? {},
  };

  const isLast = currentIndex === totalQuestions - 1;

  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-4 py-6 md:px-6 md:py-10">
      {/* الشريط العلوي: العودة ومعلومات النطاق */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/library/${encodeURIComponent(courseSlug)}/books/${encodeURIComponent(bookId)}`}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface-2 text-fg-muted transition-colors hover:text-fg"
            title="العودة لفهرس الكتاب"
          >
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <div>
            <span className="text-[length:var(--fs-text-xs)] text-accent font-medium">
              {session.bookTitle}
            </span>
            <h1 className="text-[length:var(--fs-title-4)] font-bold text-fg">
              {session.scopeTitle}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleFlagToggle(currentQuestion.questionId)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[length:var(--fs-text-xs)] font-medium transition-colors',
              flaggedIds.has(currentQuestion.questionId)
                ? 'border-accent bg-accent/10 text-accent font-bold'
                : 'border-line bg-surface-2 text-fg-muted hover:text-fg',
            )}
          >
            <Flag size={13} className={flaggedIds.has(currentQuestion.questionId) ? 'fill-current' : ''} />
            <span>{flaggedIds.has(currentQuestion.questionId) ? 'مميّز للمراجعة' : 'تمييز السؤال'}</span>
          </button>

          <Button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="bg-accent font-bold text-[#1A1206] hover:bg-accent-hover"
          >
            تسليم الإجابات ({answeredCount}/{totalQuestions})
          </Button>
        </div>
      </div>

      {/* شريط التقدم بين الأسئلة */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-[length:var(--fs-text-xs)] font-medium text-fg-muted">
          <span>
            السؤال {currentIndex + 1} من {totalQuestions}
          </span>
          <span>{Math.round((answeredCount / totalQuestions) * 100)}% تم الحل</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
        {/* جسم السؤال التفاعلي */}
        <div className="space-y-6">
          <QuestionView
            key={currentQuestion.questionId}
            question={currentViewData}
            number={currentIndex + 1}
            response={currentResponse}
            onChange={(resp) => handleAnswerChange(currentQuestion.questionId, resp)}
            onToggleFlag={() => handleFlagToggle(currentQuestion.questionId)}
            saveStatus={currentResponse ? 'تم تحديد الإجابة' : ''}
          />

          {/* أزرار التنقل التالي والسابق */}
          <div className="flex items-center justify-between border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setCurrentIndex((idx) => Math.max(0, idx - 1))}
              disabled={currentIndex === 0}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-4 py-2',
                'text-[length:var(--fs-text-sm)] font-medium text-fg transition-colors hover:bg-surface-3',
                'disabled:pointer-events-none disabled:opacity-40',
              )}
            >
              <ChevronRight size={17} aria-hidden="true" />
              <span>السابق</span>
            </button>

            {isLast ? (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2 text-[length:var(--fs-text-sm)] font-bold text-[#1A1206] shadow-sm hover:bg-accent-hover"
              >
                <span>إنهاء وتسليم الاختبار</span>
                <CheckCircle size={17} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCurrentIndex((idx) => Math.min(totalQuestions - 1, idx + 1))}
                className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-4 py-2 text-[length:var(--fs-text-sm)] font-medium text-fg hover:bg-surface-3"
              >
                <span>التالي</span>
                <ChevronLeft size={17} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* الملاح الجانبي للأسئلة */}
        <aside className="h-fit rounded-xl border border-line bg-surface-2 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[length:var(--fs-text-sm)] font-bold text-fg">خريطة الأسئلة</p>
            <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
              {answeredCount} / {totalQuestions} محلول
            </span>
          </div>

          <QuestionNavigator
            questions={navigatorQuestions}
            current={currentQuestion.slotPosition}
            onSelect={(slot) => setCurrentIndex(slot - 1)}
          />

          <div className="mt-4 border-t border-line/60 pt-3 text-[length:var(--fs-text-xs)] text-fg-muted space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm border border-line bg-surface-3" />
              <span>لم تتم الإجابة</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm border border-line bg-surface" />
              <span>تمت الإجابة</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-accent" />
              <span>مميّز بعلامة</span>
            </div>
          </div>
        </aside>
      </div>

      {/* نافذة تأكيد تسليم الاختبار */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent closeLabel="إغلاق" className="max-w-[26rem] rounded-2xl border-line bg-surface p-6 shadow-xl">
          <DialogHeader className="text-start">
            <DialogTitle className="text-[length:var(--fs-title-4)] font-bold text-fg">
              تسليم إجابات الاختبار؟
            </DialogTitle>
            <DialogDescription className="text-[length:var(--fs-text-sm)] text-fg-muted">
              {unansweredCount > 0 ? (
                <span className="flex items-center gap-1.5 text-err font-medium mt-1">
                  <AlertTriangle size={15} />
                  لديك {unansweredCount} سؤال لم تجب عليه بعد!
                </span>
              ) : (
                <span className="text-ok font-medium mt-1">
                  أجبت على جميع الأسئلة ({totalQuestions} من {totalQuestions}).
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <p className="my-3 text-[length:var(--fs-text-xs)] text-fg-muted">
            عند تأكيد التسليم، سيتم رصد درجتك فوراً وستفتح لك صفحة المراجعة مع التفسير الكامل لكل
            سؤال.
          </p>

          {submitError ? (
            <p className="mb-2 text-[length:var(--fs-text-xs)] text-err">{submitError}</p>
          ) : null}

          <DialogFooter className="flex-row items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
            >
              متابعة الحل
            </Button>
            <Button
              type="button"
              onClick={handleConfirmSubmit}
              disabled={submitting}
              className="bg-accent font-bold text-[#1A1206] hover:bg-accent-hover"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>جاري التصحيح...</span>
                </>
              ) : (
                <span>نعم، سلّم وصحّح الآن</span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
