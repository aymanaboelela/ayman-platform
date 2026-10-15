'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CheckCircle,
  ChevronDown,
  Layers,
  Play,
} from 'lucide-react';
import type { StudentExternalBookDetail } from '@ayman/contracts/quiz/external-books';
import { cn } from '@ayman/ui/lib/cn';
import { PracticeStartDialog } from './practice-start-dialog';

interface ExternalBookDetailViewProps {
  book: StudentExternalBookDetail;
  courseSlug: string;
}

interface ActiveDialogState {
  scope: 'book' | 'unit' | 'lesson';
  scopeId: string;
  scopeTitle: string;
  availableCount: number;
}

export function ExternalBookDetailView({ book, courseSlug }: ExternalBookDetailViewProps) {
  // تتبع الوحدات المفتوحة في الأكورديون (الافتراضي فتح أول وحدة)
  const [openUnitIds, setOpenUnitIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (book.units[0]) {
      initial.add(book.units[0].id);
    }
    return initial;
  });

  const [dialogState, setDialogState] = useState<ActiveDialogState | null>(null);

  const toggleUnit = (unitId: string) => {
    setOpenUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  };

  const openPractice = (
    scope: 'book' | 'unit' | 'lesson',
    scopeId: string,
    scopeTitle: string,
    availableCount: number,
  ) => {
    if (availableCount <= 0) return;
    setDialogState({
      scope,
      scopeId,
      scopeTitle,
      availableCount,
    });
  };

  return (
    <div className="mx-auto w-full max-w-[var(--w-shell)] px-4 py-8 md:px-6 md:py-12">
      {/* رابط العودة إلى الكورس */}
      <div className="mb-6">
        <Link
          href={`/library/${encodeURIComponent(courseSlug)}`}
          className="inline-flex items-center gap-1.5 text-[length:var(--fs-text-sm)] font-medium text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowRight size={16} aria-hidden="true" />
          <span>العودة إلى {book.courseTitle}</span>
        </Link>
      </div>

      {/* بطاقة رأس الكتاب */}
      <section className="mb-8 overflow-hidden rounded-2xl border border-line bg-surface-2 p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface-3 text-accent shadow-xs">
              <BookOpen size={32} aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-accent/20 bg-accent/10 px-2 py-0.5 text-[length:var(--fs-text-xs)] font-semibold text-accent">
                  كتاب خارجي معتمد
                </span>
                <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
                  {book.courseTitle}
                </span>
              </div>
              <h1 className="mt-1 text-[length:var(--fs-title-3)] font-extrabold text-fg md:text-[length:var(--fs-title-2)]">
                {book.title}
              </h1>
              <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
                بنك أسئلة واختبارات تفاعلية مقسمة حسب وحدات ودروس المنهج، مع تصحيح فوري وشرح تفصيلي
                للإجابات.
              </p>
            </div>
          </div>

          {/* إحصائيات وزر الامتحان الشامل */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center md:flex-col md:items-end">
            <div className="flex items-center gap-4 text-[length:var(--fs-text-sm)] font-medium text-fg-muted">
              <span className="flex items-center gap-1.5">
                <CheckCircle size={15} className="text-ok" />
                <strong className="text-fg">{book.totalReady}</strong> سؤال جاهز
              </span>
              <span className="flex items-center gap-1.5">
                <Layers size={15} className="text-accent" />
                <strong className="text-fg">{book.units.length}</strong> وحدات
              </span>
            </div>

            <button
              type="button"
              onClick={() =>
                openPractice('book', book.id, `امتحان شامل: ${book.title}`, book.totalReady)
              }
              disabled={book.totalReady === 0}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3',
                'text-[length:var(--fs-text-base)] font-bold text-[#1A1206] shadow-sm transition-all',
                'hover:bg-accent-hover hover:shadow-md active:scale-[0.98]',
                'disabled:pointer-events-none disabled:opacity-50',
              )}
            >
              <Play size={17} className="fill-current" />
              <span>امتحان شامل على الكتاب كله</span>
            </button>
          </div>
        </div>
      </section>

      {/* فهرس الوحدات والدروس */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[length:var(--fs-title-4)] font-bold text-fg">فهرس وحدات ودروس الكتاب</h2>
          <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
            اختر درساً أو وحدة كاملة للبدء في الاختبار
          </span>
        </div>

        {book.units.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface-2 p-8 text-center text-fg-muted">
            <Layers size={32} className="mx-auto mb-2 text-fg-muted/50" />
            <p>لا توجد وحدات مسجلة في هذا الكتاب بعد.</p>
          </div>
        ) : (
          book.units.map((unit, unitIdx) => {
            const isOpen = openUnitIds.has(unit.id);
            return (
              <div
                key={unit.id}
                className={cn(
                  'overflow-hidden rounded-xl border bg-surface transition-all duration-200',
                  isOpen ? 'border-accent/40 shadow-sm' : 'border-line hover:border-line-hover',
                )}
              >
                {/* رأس الوحدة */}
                <div
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-3 p-4 md:p-5',
                    'cursor-pointer transition-colors select-none',
                    isOpen ? 'bg-surface-2/80' : 'bg-surface hover:bg-surface-2/50',
                  )}
                  onClick={() => toggleUnit(unit.id)}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm font-bold transition-transform duration-200',
                        isOpen
                          ? 'border-accent/30 bg-accent text-[#1A1206]'
                          : 'border-line bg-surface-3 text-fg-muted',
                      )}
                    >
                      {unitIdx + 1}
                    </span>
                    <div>
                      <h3 className="text-[length:var(--fs-text-base)] font-bold text-fg">
                        {unit.name}
                      </h3>
                      <div className="mt-0.5 flex items-center gap-3 text-[length:var(--fs-text-xs)] text-fg-muted">
                        <span>{unit.lessons.length} دروس</span>
                        <span>·</span>
                        <span className="text-ok font-medium">{unit.totalReady} سؤال متاح</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() =>
                        openPractice(
                          'unit',
                          unit.id,
                          `اختبار الوحدة: ${unit.name}`,
                          unit.totalReady,
                        )
                      }
                      disabled={unit.totalReady === 0}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5',
                        'text-[length:var(--fs-text-xs)] font-semibold text-fg transition-colors',
                        'hover:border-accent hover:bg-accent hover:text-[#1A1206]',
                        'disabled:pointer-events-none disabled:opacity-40',
                      )}
                    >
                      <Play size={13} className="fill-current" />
                      <span>امتحان على الوحدة كاملة</span>
                    </button>

                    <button
                      type="button"
                      aria-label={isOpen ? 'طي الوحدة' : 'فتح الوحدة'}
                      onClick={() => toggleUnit(unit.id)}
                      className="p-1 text-fg-muted hover:text-fg"
                    >
                      <ChevronDown
                        size={18}
                        className={cn(
                          'transition-transform duration-200',
                          isOpen ? 'rotate-180 text-accent' : '',
                        )}
                      />
                    </button>
                  </div>
                </div>

                {/* قائمة دروس الوحدة */}
                {isOpen ? (
                  <div className="border-t border-line/60 bg-surface/50 divide-y divide-line/40">
                    {/* إذا كانت هناك أسئلة على الوحدة نفسها مباشرة */}
                    {unit.ready > 0 ? (
                      <div className="flex items-center justify-between p-3.5 px-5 transition-colors hover:bg-surface-2/40">
                        <div className="flex items-center gap-2.5">
                          <span className="h-2 w-2 rounded-full bg-accent" />
                          <span className="text-[length:var(--fs-text-sm)] font-medium text-fg">
                            أسئلة عامة على الوحدة
                          </span>
                          <span className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                            {unit.ready} سؤال
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            openPractice(
                              'unit',
                              unit.id,
                              `أسئلة عامة: ${unit.name}`,
                              unit.ready,
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2.5 py-1 text-[length:var(--fs-text-xs)] font-medium text-fg hover:bg-accent hover:text-[#1A1206]"
                        >
                          <Play size={11} className="fill-current" />
                          <span>امتحن عليها</span>
                        </button>
                      </div>
                    ) : null}

                    {unit.lessons.length === 0 && unit.ready === 0 ? (
                      <div className="p-4 text-center text-[length:var(--fs-text-xs)] text-fg-muted">
                        لا توجد دروس أو أسئلة مسجلة في هذه الوحدة حالياً.
                      </div>
                    ) : (
                      unit.lessons.map((lesson) => (
                        <div
                          key={lesson.id}
                          className="flex items-center justify-between p-3.5 px-5 transition-colors hover:bg-surface-2/60"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-[length:var(--fs-text-sm)] font-medium text-fg">
                              {lesson.name}
                            </span>
                            <span
                              className={cn(
                                'rounded-md px-2 py-0.5 text-[length:var(--fs-text-xs)] font-semibold',
                                lesson.ready > 0
                                  ? 'border border-ok/20 bg-ok/10 text-ok'
                                  : 'border border-line bg-surface-2 text-fg-muted',
                              )}
                            >
                              {lesson.ready} سؤال
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              openPractice(
                                'lesson',
                                lesson.id,
                                `اختبار الدرس: ${lesson.name}`,
                                lesson.ready,
                              )
                            }
                            disabled={lesson.ready === 0}
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5',
                              'text-[length:var(--fs-text-xs)] font-semibold text-fg transition-colors',
                              'hover:border-accent hover:bg-accent hover:text-[#1A1206]',
                              'disabled:pointer-events-none disabled:opacity-40',
                            )}
                          >
                            <Play size={12} className="fill-current" />
                            <span>امتحن على الدرس</span>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </section>

      {/* نافذة تحديد عدد الأسئلة وبدء الاختبار */}
      {dialogState ? (
        <PracticeStartDialog
          open={Boolean(dialogState)}
          onOpenChange={(open) => {
            if (!open) setDialogState(null);
          }}
          bookId={book.id}
          courseSlug={courseSlug}
          scope={dialogState.scope}
          scopeId={dialogState.scopeId}
          scopeTitle={dialogState.scopeTitle}
          availableCount={dialogState.availableCount}
        />
      ) : null}
    </div>
  );
}
