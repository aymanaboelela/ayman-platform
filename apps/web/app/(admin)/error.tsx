'use client';

import { copy } from '@ayman/contracts/copy/admin';
import { useErrorReport } from '@/lib/report-error';

/**
 * The staff error boundary — the course builder, the question bank, the
 * «نيوز» editor, the settings screens.
 *
 * Terser than the student and visitor ones, and allowed to be: the audience
 * is the person who can go and read the server log. So it drops the
 * reassurance those two need and spends the space on the one thing an editor
 * actually has to decide — whether the write they were in the middle of
 * landed. `copy.admin.error.body` refuses to guess: a render can throw AFTER a
 * Server Action has already committed, so "nothing was saved" would be a lie
 * as often as not. It says to reload and check.
 *
 * Two structural differences from `(app)/error.tsx`, both from the layout
 * above it:
 *
 * - No `<main>` here. `(admin)/layout.tsx` renders its own
 *   (`<main className="min-w-0 flex-1 p-4 md:p-6">`) around `children`, unlike
 *   the student and site shells which leave the landmark to each page. A
 *   second one would put two `<main>` elements on the document, which is
 *   invalid and makes landmark navigation ambiguous.
 * - No page padding of its own, for the same reason: the frame is already
 *   there.
 *
 * `@ayman/contracts/copy/admin`, not `@ayman/contracts/copy` — the admin
 * string table is a separate module precisely so it never lands in a student
 * chunk, and this file is admin-only. `copy.errors.digestLabel` still resolves
 * from it: that module spreads the whole student table in, which is what keeps
 * both surfaces calling this number the same thing.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useErrorReport(error);

  return (
    <div className="mx-auto w-full max-w-[76rem]">
      <div className="panel space-y-3 p-5 sm:p-6">
        <h1 className="text-[length:var(--fs-title-3)] font-medium text-fg">
          {copy.admin.error.title}
        </h1>
        <p className="max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] leading-relaxed text-fg-muted">
          {copy.admin.error.body}
        </p>

        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-[length:var(--fs-text-sm)] font-medium text-[#1A1206] transition-colors duration-[160ms] hover:bg-accent-hover"
          >
            {copy.common.retry}
          </button>

          {/*
            Plain `<a>` for the reason the other boundaries record: a soft
            navigation to the route that just threw can be answered from the
            router cache and do nothing visible. It matters more here than
            anywhere else, because the admin is never cached on the server
            either (`(admin)/layout.tsx` reads `headers()`), so a document load
            is the only thing that produces a genuinely fresh render.

            `/admin`, labelled the way the sidebar labels it.
          */}
          <a
            href="/admin"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-line px-4 text-[length:var(--fs-text-sm)] text-fg transition-colors duration-[160ms] hover:bg-surface-3"
          >
            {copy.admin.nav.overview}
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
