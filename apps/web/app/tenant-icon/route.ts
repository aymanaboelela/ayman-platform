import { connection } from 'next/server';

/**
 * «مفيش أيقونة» — the endpoint a non-Ayman deployment's icon requests land on.
 *
 * ## The problem this exists to solve, because nothing else could solve it
 *
 * `app/favicon.ico`, `app/icon.png` and `app/apple-icon.png` are all three
 * crops of the same photograph of Ayman's face — `icon.png` is md5-identical to
 * `public/icons/icon-192.png`, which `app/manifest.ts` gates behind `IS_AYMAN`
 * and admits to in its own docblock. Those three files are Next FILE
 * CONVENTIONS: they are picked up BY FILENAME, compiled into routes, and linked
 * into every page's `<head>` with no module anywhere that a gate could sit in.
 * There is no `if` to write. `manifest.ts` says so, and stops there.
 *
 * Three things were tried on paper first and do not work:
 *
 * 1. **Declaring `icons` in the root metadata.** It does suppress the
 *    file-convention `icon.png` and `apple-icon.png` (`resolve-metadata.js`
 *    only falls back to the static files `if (!resolvedMetadata.icons)`) — but
 *    `favicon.ico` is special-cased and `unshift`ed into the list REGARDLESS,
 *    a few lines further down the same file. His face stays in the head.
 * 2. **A second `<link rel="icon">` from the layout.** Which of several
 *    declared icons a browser picks is not specified and differs between
 *    Chrome, Firefox and Safari. "Probably wins the tie-break" is not a gate.
 * 3. **Nothing at all in the head.** Browsers probe the bare `/favicon.ico` on
 *    their own when a document declares no icon, so removing every link still
 *    ends with his face in the tab.
 *
 * All three miss the same thing: the leak is not in the HTML, it is that THOSE
 * THREE URLS SERVE HIS FACE. So the gate goes on the URLs. `next.config.ts`
 * rewrites all three here — `beforeFiles`, which is the only phase that runs
 * ahead of a filesystem route — and only when `TENANT_KEY` is not `ayman`. On
 * his stack no rewrite exists at all and the three files are served exactly as
 * they are today, byte for byte, hashed query string and all.
 *
 * ## Why 204 and not a substitute icon
 *
 * Because there is no honest substitute to ship. `app/manifest.ts` made this
 * argument first and this follows it deliberately: the icons are per-person by
 * construction, this repository ships no generic mark (`brandAssets.logo` is
 * still commented out), and an invented placeholder is a brand nobody chose,
 * installed on a student's phone.
 *
 * `204 No Content` is the machine-readable form of "this deployment has not
 * been given an icon". Every browser treats a non-image response to an icon
 * request as no icon and falls back to its own default — which in Chrome is a
 * letter tile drawn from the page title, and the page title is already gated,
 * so a tenant's tab shows the TENANT's initial. Firefox and Safari draw their
 * neutral globe. A 404 would do the same job and lie about the cause; a 1×1
 * transparent PNG would look like a broken image rather than an absent one.
 *
 * ## What a tenant does to get a real one
 *
 * `/admin/settings` → favicon, which has worked since long before any of this:
 * `app/layout.tsx` emits `<link rel="icon" href={mediaUrl(branding.faviconKey)}>`
 * the moment one is uploaded, from the media origin, per deployment. This route
 * is the state BEFORE that upload, not a replacement for it.
 *
 * A future version could read the settings row here and 302 to the uploaded
 * favicon, so that the browser's implicit `/favicon.ico` probe resolved too.
 * Deliberately not done yet: it would put a settings fetch (and its failure
 * modes) on a request that must never be able to fail, to fix a probe that the
 * `<link>` in the head already answers.
 */
/*
 * ⚠️ NOT prerendered, and that is the whole reason this line exists.
 *
 * This handler takes no input, so Next treats it as static and runs it at
 * BUILD time, then replays the result. The replay reconstructs the response —
 * and it hands the constructor an empty body rather than `null`, which for a
 * 204 is illegal:
 *
 *     TypeError: Response constructor: Invalid response status code 204
 *
 * That is not a warning. The export step fails, retries three times, and takes
 * the whole `next build` down with it — so the Docker image never builds and
 * all four Playwright shards die on a missing app, five red checks pointing at
 * a route nobody touched.
 *
 * It is invisible everywhere cheap: `next dev` runs the handler per request and
 * never replays it, the unit suites import nothing from here, and typecheck has
 * no opinion. Only a real production build reaches it.
 *
 * `await connection()` and NOT `export const dynamic = 'force-dynamic'`:
 * `next.config.ts` sets `cacheComponents: true`, and that rejects the segment
 * config outright — «Route segment config "dynamic" is not compatible with
 * `nextConfig.cacheComponents`» — so the obvious spelling trades one failed
 * build for another. `llms.txt/route.ts` hit this first and says the same.
 *
 * It costs nothing measurable — the handler returns a constant with no I/O —
 * and the caching that matters is untouched: `next.config.ts` sets
 * `max-age=31536000` on the icon paths by REQUEST path, so a browser still
 * asks once a year whether this is computed per request or baked.
 */
export async function GET(): Promise<Response> {
  await connection();

  return new Response(null, {
    status: 204,
    headers: {
      /*
       * An hour — and MEASURED, not assumed: `next.config.ts` wins and the 204
       * goes out with its `max-age=31536000` instead. A configured header
       * matches the REQUEST path (`/favicon.ico`), so it is decided without
       * reference to what the rewrite resolved to, and these three paths are
       * exactly the ones its icon rule names.
       *
       * The hour is kept for the only case where this value is the one that
       * ships — a direct hit on `/tenant-icon` — and because a cached «no
       * icon» is the one thing here that could outlive the reason for it. It
       * holds nothing up either way: a tenant that wants an icon uploads one in
       * /admin/settings, and the root layout then links it from the media
       * origin, which is a different URL and a different cache entry.
       */
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
