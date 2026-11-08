'use client';

import { copy } from '@ayman/contracts/copy';
import { useErrorReport } from '@/lib/report-error';
import { useErrorRetry } from '@/lib/use-error-retry';

/**
 * The reservation page's boundary — `(reserve)` has its own layout, so it
 * needs its own (`lib/error-boundary-coverage.test.ts`). A visitor here has no
 * account and came from a link, so the way out is `/`, never a dead end.
 */
export default function ReserveError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useErrorReport(error);
  const { retry, retrying, waiting } = useErrorRetry(error, reset);

  return (
    <main className="rsv">
      <section className="rsv-card rsv-state">
        <h1 className="rsv-state__title">{copy.errors.site.title}</h1>
        <p className="rsv-state__body">{waiting === 'network' ? copy.errors.reconnecting : copy.errors.site.body}</p>
        <div className="rsv-actions">
          <button type="button" className="rsv-btn rsv-btn--primary" onClick={retry} disabled={retrying}>
            {copy.common.retry}
          </button>
          <a href="/" className="rsv-btn rsv-btn--ghost">
            {copy.nav.home}
          </a>
        </div>
        {error.digest ? (
          <p className="rsv-state__body">
            {copy.errors.digestLabel}:{' '}
            <span dir="ltr" className="font-mono">
              {error.digest}
            </span>
          </p>
        ) : null}
      </section>
    </main>
  );
}
