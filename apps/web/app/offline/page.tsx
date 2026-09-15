import type { Metadata } from 'next';
import Link from 'next/link';
import { copy } from '@ayman/contracts';
import { IS_AYMAN } from '@/lib/tenant';
import { OfflineMessage } from './offline-message';
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
      {/*
        ⚠️ `/icons/icon-192.png` is a CROP OF AYMAN'S FACE — the PWA icon,
        generated from `public/team/ayman.jpg` by `scripts/build-mobile-icons
        .mjs`. On another instructor's stack it is his photograph on the one
        screen a student is guaranteed to see when the network drops.

        Nothing generic can be swapped in: this page must work with no server,
        so the file has to be one `sw.js` precached, and the only
        per-deployment brand value (the accent) lives in the database rather
        than in `public/` where a precached URL has to resolve.

        So a non-Ayman stack shows no mark at all. The page is a heading, a
        line of body and a retry button — it reads as finished without it,
        because the `gap-6` column simply closes up. An empty circle where a
        logo should be would look like an asset that failed to load, which on
        an offline screen is precisely the wrong thing to suggest.
      */}
      {IS_AYMAN ? (
        <img
          src="/icons/icon-192.png"
          alt=""
          width={72}
          height={72}
          className="rounded-full"
          aria-hidden="true"
        />
      ) : null}

      {/*
        The heading and the body are a Client Component because they depend on
        something only the browser knows: whether this is «مفيش نت» or «المنصة
        مش راضية ترد». The HTML here is precached at install time and is the
        same bytes for everyone, so the question cannot be answered when it is
        rendered — see `OfflineMessage`.
      */}
      <OfflineMessage />

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
