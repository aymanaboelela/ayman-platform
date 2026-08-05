/**
 * Required beside every product `page.tsx` by `lib/loading-coverage.test.ts`.
 *
 * It will almost certainly never be seen: this page is precached and served by
 * the service worker from disk, so there is no round trip to wait on. It exists
 * so the rule holds without an exemption — and for the one case that is not
 * impossible, a direct visit to `/offline` while online.
 */
export default function Loading() {
  return <div className="min-h-[100dvh]" aria-hidden="true" />;
}
