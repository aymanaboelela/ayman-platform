import { connection } from 'next/server';

/**
 * «أنا شغّال على أنهي بناء؟» — the server's half of `lib/build-watch.ts`.
 *
 * A tab compares this with the `NEXT_PUBLIC_BUILD_ID` it was served; a
 * difference means a deploy landed while it was open and its next Server
 * Action will fail. `lib/build-watch.ts` has the reasoning, and why the path
 * is neither under `/api/` (Nest's) nor under `/_next/static/` (cached
 * forever by `public/sw.js`).
 *
 * ## Why it is this cheap, and has to be
 *
 * Every visible tab of every student asks every few minutes and on every
 * return to the tab, so it reads nothing: no session, no API round trip, no
 * settings row — a constant the build baked in. The proxy treats it as the
 * public route it is (no auth fetch; see `resolveRedirect`), and it never
 * reaches Nest, so it cannot spend anyone's rate-limit budget.
 *
 * ## Why `await connection()`
 *
 * A handler with no input is prerendered at build time and replayed, with
 * Next's own caching headers rather than the `no-store` below. The value would
 * still be right — it is the same build — but a replayed static response is
 * exactly the kind of thing an edge cache is allowed to keep, and an answer
 * cached from before a deploy is an answer that cannot detect it.
 * `connection()` rather than `dynamic = 'force-dynamic'` because
 * `cacheComponents` rejects the segment config; `tenant-icon/route.ts` records
 * the same trap.
 *
 * `null` when the variable is absent (`next dev`, a build outside the
 * Dockerfile). The client never starts watching in that case, so the null is
 * only ever read by a person with curl.
 */
export async function GET(): Promise<Response> {
  await connection();

  return Response.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID || null },
    {
      headers: {
        'Cache-Control': 'no-store',
        // Not a page, and it must never be one in anyone's index — the same
        // header `next.config.ts` puts on the agent-discovery files.
        'X-Robots-Tag': 'noindex',
      },
    },
  );
}
