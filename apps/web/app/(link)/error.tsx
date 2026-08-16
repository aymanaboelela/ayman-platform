'use client';

import { copy } from '@ayman/contracts/copy';
import { useErrorReport } from '@/lib/report-error';
import { useErrorRetry } from '@/lib/use-error-retry';

/**
 * The bio-link surface's boundary — required because `(link)` is a route group
 * with its own `layout.tsx`, and worth more here than the file count suggests.
 *
 * This is the only page in the product reached from someone ELSE's platform: a
 * YouTube description, a Facebook «معلومات», an Instagram bio. The visitor has
 * no account, no session and no history on this domain, and they arrived
 * because they were told these are his real accounts. A failure screen with no
 * links on it sends them back to the search results that made them doubt it.
 *
 * So the escape hatch is `/` and not a retry-only screen — the site's own front
 * door proves the same thing the page they asked for was going to prove.
 *
 * `copy.errors.site.*` rather than a fourth set of strings: the audience is the
 * marketing surface's audience, and inventing a variant of «الصفحة دي وقعت» for
 * one route would be a string nobody maintains.
 */
export default function LinkError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useErrorReport(error);
  const { retry, retrying } = useErrorRetry(error, reset);

  return (
    <main className="linkhub__page linkhub__page--error">
      <h1 className="linkhub__error-title">{copy.errors.site.title}</h1>
      <p className="linkhub__error-body">{copy.errors.site.body}</p>

      <div className="linkhub__error-actions">
        {/* `retry`, never the raw `reset` — see `lib/use-error-retry.ts`: on the
            failure that actually produces this screen (a Server Component that
            threw) `reset()` re-reads the same failed payload and the press does
            nothing. */}
        <button
          type="button"
          onClick={retry}
          disabled={retrying}
          aria-busy={retrying}
          className="linkhub__btn linkhub__btn--solid"
        >
          {copy.common.retry}
        </button>

        {/* A document load, not a `<Link>`: a soft navigation can be answered
            from the router cache and visibly do nothing, which on a recovery
            screen is indistinguishable from a dead button. */}
        <a href="/" className="linkhub__btn linkhub__btn--ghost">
          {copy.nav.home}
        </a>
      </div>

      {error.digest ? (
        <p className="linkhub__error-digest">
          {copy.errors.digestLabel}:{' '}
          <span dir="ltr" className="mono">
            {error.digest}
          </span>
        </p>
      ) : null}
    </main>
  );
}
