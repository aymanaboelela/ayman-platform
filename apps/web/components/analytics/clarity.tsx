'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * The project id is PUBLIC by design — it ships inside the tag URL in every
 * visitor's HTML, so it is an identifier, not a secret. It is still read from
 * the environment rather than hardcoded so a fork, a staging build, or a
 * second project does not silently write into this dashboard.
 *
 * ⚠️ `NEXT_PUBLIC_*` is burned into the bundle at BUILD time (see
 * `apps/web/Dockerfile`). Unset at build → the tag never ships, and no amount
 * of setting it at runtime brings it back without a rebuild. That is also the
 * reason nothing loads in local development: `.env.example` leaves it empty.
 */
const PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

type ClarityApi = (command: 'start' | 'stop', ...args: unknown[]) => void;

/**
 * Microsoft Clarity — session recordings + heatmaps.
 *
 * Mounted once, in the ROOT layout, so it covers the marketing pages a student
 * lands on first as well as the signed-in surface. Renders nothing.
 *
 * ## Why `/admin` is excluded
 *
 * Clarity records the rendered DOM. The admin screens put real students'
 * names, emails, grades and attempt answers on screen — a recording of one is
 * a copy of that data sitting in a third-party dashboard, and no heatmap of a
 * single-operator back office is worth that. Clarity's own text masking is a
 * default, not a guarantee, so this does not rely on it.
 *
 * The check has two halves because a client-side navigation does not reload
 * the page:
 *
 *  · The tag is not INJECTED when the entry point is already `/admin`.
 *  · `clarity('stop')` fires when a session walks into `/admin` from
 *    somewhere else, and `('start')` when it walks back out. Without the
 *    stop, one visit to `/dashboard` first would keep the recorder running
 *    through the whole admin session.
 *
 * `next/script` de-duplicates by `id`, so the tag is fetched and executed at
 * most once per page load however many times this component remounts.
 *
 * ## Why `afterInteractive` and not `lazyOnload`
 *
 * `lazyOnload` waits for `window.load`, which on an Egyptian phone connection
 * can be many seconds after the page is usable — and a student who taps
 * through before it fires is a session that was never recorded at all.
 * `afterInteractive` still runs after hydration and still loads async, so it
 * competes with nothing on the critical path.
 */
export function Clarity() {
  const pathname = usePathname();
  const onAdmin = pathname?.startsWith('/admin') ?? false;

  useEffect(() => {
    // Absent until the tag has loaded — on `/admin` as an entry point it never
    // loads, which is the intended outcome and not a case to handle.
    const clarity = (window as unknown as { clarity?: ClarityApi }).clarity;
    if (typeof clarity !== 'function') return;
    clarity(onAdmin ? 'stop' : 'start');
  }, [onAdmin]);

  if (!PROJECT_ID || onAdmin) return null;

  return (
    <Script
      id="ms-clarity"
      strategy="afterInteractive"
      src={`https://www.clarity.ms/tag/${encodeURIComponent(PROJECT_ID)}`}
    />
  );
}
