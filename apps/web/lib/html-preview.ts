/**
 * Where the HTML playground's preview document lives, and the policy it runs
 * under.
 *
 * Same shape as `lib/js-runner.ts`, and for the same reason: `proxy.ts` matches
 * this path to decide which response gets `HTML_PREVIEW_CSP`, and the
 * playground points its `<iframe>` at it. If the two strings ever drift, the
 * frame loads a path the proxy does not recognise, gets the site's own
 * `frame-ancestors 'none'` and `X-Frame-Options: DENY`, and the preview is a
 * blank rectangle — in every environment, but with nothing in the UI to say
 * why. One constant, imported by both, is what removes that. No imports here,
 * so it is safe on both sides.
 *
 * ## Why a dedicated document and not `srcdoc`
 *
 * A `srcdoc` (or `blob:`) frame INHERITS the embedding page's policy container.
 * Today that policy has `'unsafe-inline'` in `script-src` and `style-src`, so a
 * student's `<style>` and `<script>` would happen to run — but only for as long
 * as nobody tightens the site's policy. The comment on `buildAuthenticatedCsp`
 * spells out the plan to get a nonce and `'strict-dynamic'` back one day; the
 * morning that lands, every preview on the platform would go silently unstyled
 * with nothing but a console line to explain it. That is the exact failure the
 * JavaScript runner already had once (`public/js-runner.js` documents it).
 *
 * A same-origin URL takes its policy from its OWN response instead, so the
 * preview's rules are written once, here, and do not move when the site's do.
 */

/** Served from `public/html-preview.html`. */
export const HTML_PREVIEW_PATH = '/html-preview.html';

/**
 * The `sandbox` attribute on the preview `<iframe>`.
 *
 * ⚠️ NEVER add `allow-same-origin`. Without it the framed document runs in an
 * OPAQUE origin: `document.cookie`, `localStorage` and `parent.document` all
 * throw, and a request to `/api/…` is a cross-origin request with no
 * credentials and no CORS — so a snippet pasted off the internet cannot act as
 * the signed-in student. `allow-scripts` together with `allow-same-origin` on a
 * same-origin URL is the one combination that lets the framed page remove its
 * own sandbox; that is why the pair is forbidden here and asserted in tests.
 *
 * `allow-forms` is here because a student's `<form onsubmit>` should reach
 * their own handler: without it the browser drops the submission BEFORE the
 * `submit` event fires, so the handler never runs and nothing says why. The
 * navigation a form would then make is refused by `form-action 'none'` below.
 *
 * Deliberately absent: `allow-modals` (the preview's bootstrap forwards
 * `alert()` to the console panel instead of letting a loop of dialogs trap the
 * tab), `allow-popups` and every `allow-top-navigation*` (the page cannot open
 * or replace anything outside its rectangle).
 */
export const HTML_PREVIEW_SANDBOX = 'allow-scripts allow-forms';

/**
 * The preview document's own policy. Enforced, never report-only.
 *
 * - `sandbox` repeats the iframe attribute AS A HEADER, so the document is in an
 *   opaque origin even when nobody framed it: opening `/html-preview.html`
 *   directly in a tab gets the same jail as the playground's frame does.
 * - `default-src 'none'` — no fetch, no WebSocket, no external script,
 *   stylesheet, font, image or frame. Nothing the student writes can make a
 *   network request, and nothing can be pulled from a CDN.
 * - `'unsafe-inline'` for scripts and styles is the product itself: the
 *   student's `<style>` and `<script>` ARE the page. It is safe here precisely
 *   because of the two lines above — inline code in an opaque origin with no
 *   network reaches nothing.
 * - `img-src data: blob:` lets an inline SVG or a data-URI picture render, and
 *   nothing else.
 * - `frame-ancestors 'self'` — only this site may frame it. The site's own
 *   pages carry `frame-ancestors 'none'`; this response is the one exception,
 *   and it is exactly as wide as the playground needs.
 */
export const HTML_PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
  'sandbox allow-scripts allow-forms',
].join('; ');
