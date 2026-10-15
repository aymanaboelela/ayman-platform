import { copy, formatCopy, formatMark } from '@ayman/contracts';
import { tenantSentence } from '@/lib/tenant-copy';
import { Badge } from '@ayman/ui';
import { cn } from '@ayman/ui/lib/cn';
import { AlertCircle, Clock, Sparkles, ThumbsUp, Trophy } from 'lucide-react';

export interface ResultHeaderProps {
  scaledScore: number | null;
  gradeOutOf: number;
  passPercent: number;
  passed: boolean | null;
  /** Derived by the review page from `questions.some(q => q.correctness === 'needsGrading')`. */
  needsGrading: boolean;
  /**
   * Marks still with the instructor, out of `gradeOutOf` — `0` on a finished
   * paper. Server-computed (`mark-split.ts`), never inferred here from the
   * questions array: the review matrix can hide `maxMark` entirely, and a
   * screen that silently drops the "٥٠ درجة جاية" line in that window is the
   * bug this component exists to fix.
   */
  pendingOutOf: number;
  /** What the marked part is worth. Sums with `pendingOutOf` to `gradeOutOf`. */
  gradedOutOf: number;
}

/**
 * Result header showing score, percentage gauge, and custom evaluative
 * feedback based on student performance.
 */
export function ResultHeader({
  scaledScore,
  gradeOutOf,
  passPercent,
  passed,
  needsGrading,
  pendingOutOf,
  gradedOutOf,
}: ResultHeaderProps) {
  /*
   * `pendingOutOf > 0` is the authority, and `needsGrading` is kept as a
   * fallback for the one window where it is the only evidence there is.
   */
  const pending = pendingOutOf > 0;
  const outstanding = pending || needsGrading;

  // The total the headline is over. Not a cosmetic choice — see the header.
  const outOf = pending ? gradedOutOf : gradeOutOf;
  const scorePercent =
    scaledScore !== null && outOf > 0 ? Math.round((scaledScore / outOf) * 100) : null;

  const isExcellent = !outstanding && scorePercent !== null && scorePercent >= 85;
  const isGood = !outstanding && !isExcellent && scorePercent !== null && scorePercent >= 70;
  const isNeedsWork =
    !outstanding && ((scorePercent !== null && scorePercent < 70) || passed === false);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface-2 p-5 md:p-6 shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">{pending ? copy.quiz.pendingEyebrow : copy.quiz.resultsTitle}</p>
        {outstanding ? (
          <Badge tone="accent" className="flex items-center gap-1.5 py-1 px-3">
            <Clock className="size-3.5" aria-hidden="true" />
            <span>{copy.quiz.pendingNotFinal}</span>
          </Badge>
        ) : passed !== null ? (
          <Badge
            tone={passed ? 'ok' : 'err'}
            className="flex items-center gap-1.5 py-1 px-3 text-[length:var(--fs-text-sm)] font-semibold"
          >
            {passed ? copy.quiz.passed : copy.quiz.failed}
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="mono text-[length:var(--fs-title-1)] font-bold tabular-nums text-fg">
              {scaledScore === null ? '—' : formatMark(scaledScore)}
            </span>
            <span className="mono text-[length:var(--fs-title-3)] text-fg-muted">
              / {formatMark(outOf)}
            </span>
          </div>
          {!outstanding && (
            <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted mt-1">
              {formatCopy(copy.quiz.passMark, { percent: passPercent })}
            </p>
          )}
        </div>

        {scorePercent !== null && (
          <div
            className={cn(
              'flex flex-col items-center justify-center rounded-xl px-4 py-2 border mono',
              isExcellent
                ? 'border-[color-mix(in_oklch,var(--ok),transparent_50%)] bg-[color-mix(in_oklch,var(--ok),transparent_90%)] text-ok'
                : isGood
                  ? 'border-[color-mix(in_oklch,var(--a-9),transparent_50%)] bg-[color-mix(in_oklch,var(--a-9),transparent_90%)] text-accent-text'
                  : 'border-[color-mix(in_oklch,var(--err),transparent_50%)] bg-[color-mix(in_oklch,var(--err),transparent_90%)] text-err',
            )}
          >
            <span className="text-[length:var(--fs-title-3)] font-bold">{scorePercent}%</span>
            <span className="text-[length:var(--fs-text-xs)] opacity-80">النسبة المئوية</span>
          </div>
        )}
      </div>

      {scorePercent !== null && (
        <div className="flex flex-col gap-1 w-full">
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-700 ease-out',
                outstanding
                  ? 'bg-accent'
                  : isExcellent || isGood
                    ? 'bg-ok'
                    : 'bg-err',
              )}
              style={{ width: `${Math.min(100, Math.max(0, scorePercent))}%` }}
            />
          </div>
        </div>
      )}

      {/* Motivational & Evaluative Banner */}
      {isExcellent ? (
        <div className="flex items-start gap-3 rounded-lg border border-[color-mix(in_oklch,var(--ok),transparent_65%)] bg-[color-mix(in_oklch,var(--ok),transparent_93%)] p-4 text-fg">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklch,var(--ok),transparent_80%)] text-ok">
            <Trophy className="size-5" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-bold text-[length:var(--fs-text-base)] text-ok flex items-center gap-1.5">
              <span>فخور بيك وبمستواك الرائع!</span>
              <Sparkles className="size-4" aria-hidden="true" />
            </p>
            <p className="text-[length:var(--fs-text-sm)] text-fg leading-relaxed">
              عاش يا بطل! أداء يشرف ومجهود ممتاز يثبت فهمك وتركيزك العالي. استمر دائمًا على هذا التألق والتفوق! 💪✨
            </p>
          </div>
        </div>
      ) : isGood ? (
        <div className="flex items-start gap-3 rounded-lg border border-[color-mix(in_oklch,var(--a-9),transparent_65%)] bg-[color-mix(in_oklch,var(--a-9),transparent_94%)] p-4 text-fg">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklch,var(--a-9),transparent_80%)] text-accent-text">
            <ThumbsUp className="size-5" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-bold text-[length:var(--fs-text-base)] text-accent-text">
              أداء طيب وخطوة ممتازة للأمام! 👍
            </p>
            <p className="text-[length:var(--fs-text-sm)] text-fg leading-relaxed">
              مستوى جميل ونتيجة كويسة جدًا! عندك شوية نقط وأخطاء بسيطة راجعها في نموذج الإجابة بالأسفل عشان تقفل الدرجة كاملة المرة القادمة 🚀
            </p>
          </div>
        </div>
      ) : isNeedsWork ? (
        <div className="flex items-start gap-3 rounded-lg border border-[color-mix(in_oklch,var(--err),transparent_65%)] bg-[color-mix(in_oklch,var(--err),transparent_93%)] p-4 text-fg">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklch,var(--err),transparent_80%)] text-err">
            <AlertCircle className="size-5" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-bold text-[length:var(--fs-text-base)] text-err">
              لا مش هينفع كده، محتاجين نركز شوية! ⚠️
            </p>
            <p className="text-[length:var(--fs-text-sm)] text-fg leading-relaxed">
              الدرجة دي مش مستواك الحقيقي وإحنا مش هنرضى بأقل من التميز. اقعد راجع إجاباتك تحت بهدوء، واعرف أسباب الأخطاء، وعيد مذاكرة الدرس بجدية وتركيز عشان تعوض وتتعلم منها 🎯
            </p>
          </div>
        </div>
      ) : pending ? (
        <div className="flex items-start gap-3 rounded-lg border border-[color-mix(in_oklch,var(--a-9),transparent_65%)] bg-[color-mix(in_oklch,var(--a-9),transparent_94%)] p-4 text-fg">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklch,var(--a-9),transparent_80%)] text-accent-text">
            <Clock className="size-5" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-bold text-[length:var(--fs-text-base)] text-accent-text">
              باقي الأسئلة المقالية قيد التصحيح
            </p>
            <p className="text-[length:var(--fs-text-sm)] text-fg leading-relaxed">
              {tenantSentence(formatCopy(copy.quiz.pendingRest, { marks: formatMark(pendingOutOf) }))}
            </p>
            <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
              {copy.quiz.pendingWillArrive}
            </p>
          </div>
        </div>
      ) : needsGrading ? (
        <p className="text-fg-muted">{tenantSentence(copy.quiz.essayPending)}</p>
      ) : null}
    </div>
  );
}
