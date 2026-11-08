'use client';

import { copy } from '@ayman/contracts/copy/admin';
import { reservationsCopy } from '@ayman/contracts/copy/center-reservations';
import { useErrorReport } from '@/lib/report-error';
import { useErrorRetry } from '@/lib/use-error-retry';

/**
 * The centre panel's boundary — the montage shell's shape, with the way back
 * pointed at `/center`: a centre owner has no `/admin` to go to.
 */
export default function CenterError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useErrorReport(error);
  const { retry, retrying, waiting } = useErrorRetry(error, reset);

  return (
    <div className="mx-auto w-full max-w-[76rem]">
      <div className="panel space-y-3 p-5 sm:p-6">
        <h1 className="text-[length:var(--fs-title-3)] font-medium text-fg">{copy.admin.error.title}</h1>
        <p className="max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] leading-relaxed text-fg-muted">
          {copy.admin.error.body}
        </p>
        {waiting ? (
          <p role="status" className="text-[length:var(--fs-text-sm)] text-fg-muted">
            {waiting === 'network' ? copy.errors.reconnecting : copy.errors.retryingSoon}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={retry}
            disabled={retrying}
            aria-busy={retrying}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-[length:var(--fs-text-sm)] font-medium text-[color:var(--on-accent-ink)] transition-colors duration-[160ms] hover:bg-accent-hover disabled:cursor-wait disabled:opacity-70"
          >
            {copy.common.retry}
          </button>
          <a
            href="/center"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-line px-4 text-[length:var(--fs-text-sm)] text-fg transition-colors duration-[160ms] hover:bg-surface-3"
          >
            {reservationsCopy.portal.title}
          </a>
        </div>
        {error.digest ? (
          <p className="pt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
            {copy.errors.digestLabel}:{' '}
            <span dir="ltr" className="font-mono">
              {error.digest}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
