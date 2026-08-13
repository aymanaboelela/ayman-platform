/**
 * The pathname hand-off from `proxy.ts` to the server tree.
 *
 * ## Why a header, of all things
 *
 * A Server Component cannot ask which URL it is rendering. `usePathname()` is a
 * client hook; `params` only reaches the segment that declares them; and
 * `(app)/layout.tsx` sits above every route in the group, so the one fact it
 * cannot have is the one it needs in order to stop building chrome that
 * `components/app/student-shell.tsx` is about to discard on the attempt route.
 *
 * `proxy.ts` runs on all of those paths already and knows the pathname exactly.
 * Stamping it onto the REQUEST headers is the whole mechanism.
 *
 * ## Why the name lives here and not in either end
 *
 * Both ends need it and neither may import the other. Reaching into `proxy.ts`
 * from a Server Component drags `next/server` and the whole redirect matrix
 * into the RSC graph for one string; reaching the other way drags
 * `next/headers` into the middleware bundle. This module imports nothing, so it
 * is free from both sides — the same arrangement `lib/csrf.ts` uses for the
 * cookie name, and for the same reason: two files spelling one header
 * differently fails silently, in this case as chrome that never stops
 * rendering, with nothing anywhere to grep for.
 */
export const PATHNAME_HEADER = 'x-pathname';

/**
 * The incoming headers with the pathname stamped on, ready for
 * `NextResponse.next({ request: { headers } })`.
 *
 * ⚠️ It CLONES rather than building a fresh `Headers`, and that is not a
 * courtesy — it is the whole safety of the call. Next treats the object
 * middleware hands back as the COMPLETE request: `resolve-routes.js` walks the
 * real request and deletes every header whose name is absent from it
 * ("Delete headers", right before it applies the overrides). So
 * `new Headers({ [PATHNAME_HEADER]: pathname })` would strip `cookie` from the
 * request the page then renders with — every authenticated read on every
 * signed-in page 401s, and nothing in the proxy looks wrong.
 *
 * `set`, not `append`: an inbound `x-pathname` is always overwritten, so a
 * request cannot choose which pathname the server tree believes it is on. The
 * worst a forged one can still do is on the routes this is NOT called for (see
 * `pathnameFromHeaders`), where it costs the sender their own rail and nobody
 * else anything.
 */
export function stampPathname(incoming: Headers, pathname: string): Headers {
  const forwarded = new Headers(incoming);
  forwarded.set(PATHNAME_HEADER, pathname);
  return forwarded;
}

/**
 * The pathname `proxy.ts` stamped, or `null`.
 *
 * `null` is an ordinary answer rather than an error, and callers must read it
 * as "render normally". It happens on every path the proxy deliberately leaves
 * untouched:
 *
 *  · public routes — the proxy's public branch mutates no request headers at
 *    all, on purpose, so those responses stay cacheable and keep their static
 *    optimization. `/notifications` renders in `(app)` and is one of them.
 *  · Next's own prefetches — the proxy's matcher skips them (`missing:
 *    next-router-prefetch`), so the proxy never runs and never stamps.
 *
 * None of those is an attempt route, which is why failing open is the correct
 * failure: the chrome renders, exactly as it did before this existed.
 */
export function pathnameFromHeaders(incoming: Headers): string | null {
  return incoming.get(PATHNAME_HEADER) || null;
}
