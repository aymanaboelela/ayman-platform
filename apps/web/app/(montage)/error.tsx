'use client';

import { copy } from '@ayman/contracts/copy/admin';
import { montageCopy } from '@ayman/contracts/copy/montage';
import { useErrorReport } from '@/lib/report-error';
import { useErrorRetry } from '@/lib/use-error-retry';

/**
 * The hand-over screen's error boundary — the admin one's shape (staff audience, the
 * digest is worth showing), with the way back pointed at `/montage`: an
 * editor has no `/admin` to go to.
 */
export default function MontageError({
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
        <h1 className="text-[length:var(--fs-title-3)] font-medium text-fg">
          {copy.admin.error.title}
        </h1>
        <p className="max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] leading-relaxed text-fg-muted">
          {copy.admin.error.body}
        </p>
        {/* Under the body, not instead of it: «reload and check whether it
            saved» stays true whatever the cause. `lib/auto-retry.ts`. */}
        {waiting ? (
          <p role="status" className="text-[length:var(--fs-text-sm)] text-fg-muted">
            {waiting === 'network' ? copy.errors.reconnecting : copy.errors.retryingSoon}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
          {/* `retry`, not the bare `reset` — see `lib/use-error-retry.ts`. */}
          <button
            type="button"
            onClick={retry}
            disabled={retrying}
            aria-busy={retrying}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-[length:var(--fs-text-sm)] font-medium text-[#1A1206] transition-colors duration-[160ms] hover:bg-accent-hover disabled:cursor-wait disabled:opacity-70"
          >
            {copy.common.retry}
          </button>

          {/* Plain `<a>`: a soft navigation to the route that just threw can be
              answered from the router cache and do nothing visible. */}
          <a
            href="/montage"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-line px-4 text-[length:var(--fs-text-sm)] text-fg transition-colors duration-[160ms] hover:bg-surface-3"
          >
            {montageCopy.title}
          </a>
        </div>

        {/*
          The digest gets a full line and a hint here, where it is short and
          muted on the other three. This is the only surface whose reader can
          do something with it — grep the log — and the only one where naming
          it is not noise.
        */}
        {error.digest ? (
          <div className="space-y-1 pt-1">
            <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
              {copy.errors.digestLabel}:{' '}
              <span dir="ltr" className="font-mono">
                {error.digest}
              </span>
            </p>
            <p className="text-[length:var(--fs-text-xs)] text-fg-faint">
              {copy.admin.error.digestHint}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
