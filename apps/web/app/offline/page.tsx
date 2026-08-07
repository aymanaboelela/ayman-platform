import type { Metadata } from 'next';
import Link from 'next/link';
import { copy } from '@ayman/contracts';
import { RetryButton } from './retry-button';

/**
 * The page the service worker serves when a navigation fails.
 *
 * ⚠️ Everything on it must render with NO network. That is not a style
 * preference, it is the entire premise: it is precached at install time and
 * handed back at the one moment the device cannot reach the server. So no
 * `getBranding()`, no API read, no remote font or image — anything that has to
 * be fetched would leave a hole in the only page guaranteed to be shown while
 * offline. The mark is `/icons/icon-192.png`, precached alongside this page by
 * `sw.js` for exactly this reason.
 *
 * It is deliberately outside the `(site)` and `(app)` groups: both of their
 * layouts read from the API, which is the one thing unavailable here.
 */
export const metadata: Metadata = {
  title: copy.offline.title,
  // Nothing to index — it exists only as a failure state.
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      {/*
        A plain `<img>`, deliberately, and it has to be one.

        `next/image` serves through `/_next/image`, a server route — and this
        page renders precisely when no server route can be reached. An
        optimised image here would be a broken image on the only screen
        guaranteed to be shown while offline. The `src` points at the file
        `sw.js` precaches alongside this page for exactly that reason.

        (There is no `eslint-disable` above this: `@next/next/no-img-element`
        is not among the rules this repo registers, and disabling a rule that
        does not exist is itself a lint error.)
      */}
      <img
        src="/icons/icon-192.png"
        alt=""
        width={72}
        height={72}
        className="rounded-full"
        aria-hidden="true"
      />

      <div className="space-y-2">
        <h1 className="text-[length:var(--fs-title-3)] font-semibold text-fg">{copy.offline.title}</h1>
        <p className="text-[length:var(--fs-text-sm)] leading-relaxed text-fg-muted">
          {copy.offline.body}
        </p>
      </div>

      <div className="flex w-full flex-col gap-2">
        <RetryButton label={copy.offline.retry} />
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-[160ms] hover:bg-surface-3 hover:text-fg"
        >
          {copy.offline.home}
        </Link>
      </div>
    </main>
  );
}
