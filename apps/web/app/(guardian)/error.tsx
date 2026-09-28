'use client';

import { copy } from '@ayman/contracts/copy';
import { useErrorReport } from '@/lib/report-error';
import { useErrorRetry } from '@/lib/use-error-retry';

/**
 * حدود الخطأ بتاعة `/guardian`.
 *
 * نفس `(app)/error.tsx` بس المخرج التاني الرئيسية مش «حسابي»: لينك
 * `/dashboard` هناك، وولي الأمر مالوش حساب — كان هيوديه لصفحة الدخول وكإن
 * الجلسة وقعت.
 */
export default function GuardianError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useErrorReport(error);
  const { retry, retrying } = useErrorRetry(error, reset);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="panel space-y-3 p-5 sm:p-6">
        <h1 className="text-[length:var(--fs-title-3)] font-medium text-fg">
          {copy.errors.guardian.title}
        </h1>
        <p className="text-[length:var(--fs-text-sm)] leading-relaxed text-fg-muted">
          {copy.errors.guardian.body}
        </p>

        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={retry}
            disabled={retrying}
            aria-busy={retrying}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-[length:var(--fs-text-sm)] font-medium text-[#1A1206] transition-colors duration-[160ms] hover:bg-accent-hover disabled:cursor-wait disabled:opacity-70"
          >
            {copy.common.retry}
          </button>
          <a
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-line px-4 text-[length:var(--fs-text-sm)] text-fg transition-colors duration-[160ms] hover:bg-surface-3"
          >
            {copy.nav.home}
          </a>
        </div>

        {error.digest ? (
          <p className="pt-1 text-[length:var(--fs-text-xs)] text-fg-faint">
            {copy.errors.digestLabel}:{' '}
            <span dir="ltr" className="font-mono">
              {error.digest}
            </span>
          </p>
        ) : null}
      </div>
    </main>
  );
}
