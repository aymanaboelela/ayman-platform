/**
 * Turns what the student typed into the document the preview frame writes.
 *
 * Pure string work with no DOM, so it runs (and is tested) outside a browser.
 * The frame itself is `public/html-preview.html`; its isolation is documented
 * in `lib/html-preview.ts`.
 *
 * ## What gets added, and why every addition is on ONE line
 *
 * Two things go into the student's page: the bootstrap below, and the
 * `style.css` tab as a `<style>` block. Both are inserted WITHOUT a single
 * newline, so line 7 of `index.html` is still line 7 of the document the
 * browser parses — which is what makes «غلطة في سطر ٧» in the console panel
 * point at the line the student can actually see. CSS is whitespace-insensitive
 * outside strings, and a raw newline inside a CSS string is already invalid, so
 * folding it onto one line changes nothing about what it means.
 */

/** Cap on what one run can push into the console panel. */
export const PREVIEW_CONSOLE_LIMIT = 300;

/**
 * Runs first inside the student's page. ES5 and a plain string on purpose: a
 * function stringified from this module would be whatever the bundler turned
 * it into, possibly calling helpers that exist in OUR bundle and not in theirs.
 *
 * - `console.*`, uncaught errors and rejected promises are posted to the
 *   playground, so a `<script>` that prints something prints it where the
 *   student is looking rather than into a devtools panel on a phone.
 * - `alert()` becomes a console line. The frame has no `allow-modals`, so the
 *   real one would be silently ignored — and a loop of real dialogs is a tab
 *   nobody can close.
 * - A click on a link is stopped and reported. Following it would navigate the
 *   frame away from the student's page to somewhere that is not their code.
 *   In-page `#anchors` still scroll, because that is a thing pages do.
 * - Whatever the policy refuses (an `<img src="https://…">`, a CDN script) is
 *   reported by name. Otherwise the picture is simply missing and the only
 *   explanation is a console the student cannot open on a phone.
 *
 * Replies go to `location.origin` — this URL's origin, i.e. the site — never
 * `*`: the only window that should hear them is the playground that framed it.
 */
const BOOT = [
  '(function(){',
  'var T=__TOKEN__,H=location.origin,n=0;',
  'function s(v){if(typeof v==="string")return v;try{return typeof v==="object"&&v!==null?JSON.stringify(v):String(v)}catch(e){return String(v)}}',
  'function p(l,a){if(n>=__LIMIT__)return;n++;var t;try{t=[].map.call(a,s).join(" ")}catch(e){t=String(a)}',
  'try{parent.postMessage({type:"pg:console",token:T,level:l,text:String(t).slice(0,2000)},H)}catch(e){}}',
  '["log","info","warn","error"].forEach(function(l){var o=console[l];console[l]=function(){p(l,arguments);try{o.apply(console,arguments)}catch(e){}}});',
  'window.alert=function(m){p("alert",[m===undefined?"":m])};',
  'window.addEventListener("error",function(e){p("error",[(e.message||"Error")+(e.lineno?" @"+e.lineno:"")])});',
  'window.addEventListener("unhandledrejection",function(e){var r=e.reason;p("error",[r&&r.message?r.message:String(r)])});',
  'document.addEventListener("click",function(e){var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;',
  'if(!a)return;var h=a.getAttribute("href")||"";if(h.charAt(0)==="#")return;e.preventDefault();p("link",[h])},true);',
  'document.addEventListener("securitypolicyviolation",function(e){p("blocked",[e.blockedURI||e.effectiveDirective])});',
  '})();',
].join('');

/**
 * `</script` or `</style` inside the text would close OUR wrapper early and
 * spill the rest into the page as markup. Escaping the slash is inert in both
 * languages: `<\/style` is the same characters to a CSS parser that never sees
 * the tag, and a JS string with `\/` is just `/`.
 */
function escapeClosing(text: string, tag: 'script' | 'style'): string {
  return text.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);
}

export function previewBootScript(token: string): string {
  const source = BOOT.replace('__TOKEN__', JSON.stringify(token)).replace(
    '__LIMIT__',
    String(PREVIEW_CONSOLE_LIMIT),
  );
  return `<script>${escapeClosing(source, 'script')}</script>`;
}

/** The `style.css` tab, folded onto one line — see the module comment. */
export function inlineStylesheet(css: string): string {
  const oneLine = css.replace(/\r?\n/g, ' ').trim();
  return oneLine ? `<style>${escapeClosing(oneLine, 'style')}</style>` : '';
}

/**
 * Where the additions go, in order of preference:
 *
 *   1. right after `<head …>`       — a full document, the usual case
 *   2. a new `<head>` after `<html …>` — a document that skipped the head
 *   3. right after `<!doctype …>`   — a doctype and then straight into body
 *   4. a whole document around it   — a fragment like `<h1>أهلاً</h1>`
 *
 * The fragment gets `dir="rtl"` and `lang="ar"`: a student's first `<p>`
 * is almost always Arabic, and without a direction it renders flush left
 * with its punctuation on the wrong side, which reads as "HTML is broken".
 * Everything the student DID write about direction is left alone.
 *
 * Every case starts with a doctype. Without one the page renders in quirks
 * mode, where box sizes and table fonts quietly differ from every tutorial.
 */
export function composePreviewDocument({
  html,
  css,
  token,
}: {
  html: string;
  css: string;
  token: string;
}): string {
  const inject = previewBootScript(token) + inlineStylesheet(css);

  const head = /<head\b[^>]*>/i.exec(html);
  if (head) return withDoctype(splice(html, head.index + head[0].length, inject));

  const root = /<html\b[^>]*>/i.exec(html);
  if (root) return withDoctype(splice(html, root.index + root[0].length, `<head>${inject}</head>`));

  const doctype = /<!doctype[^>]*>/i.exec(html);
  if (doctype) return splice(html, doctype.index + doctype[0].length, `<head>${inject}</head>`);

  return (
    '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `${inject}</head><body>${html}</body></html>`
  );
}

function splice(text: string, at: number, insert: string): string {
  return text.slice(0, at) + insert + text.slice(at);
}

function withDoctype(doc: string): string {
  return /^\s*<!doctype/i.test(doc) ? doc : `<!doctype html>${doc}`;
}

/**
 * Whether the student's page runs code — which decides if it may auto-refresh.
 * A `<script>`, or an `on…=` handler inside a tag (`<img onerror=…>` runs the
 * moment the page renders). Prose like «one = two» is not a handler.
 */
export function hasScript(html: string): boolean {
  return /<script\b/i.test(html) || /<[a-z][^>]*\son[a-z]+\s*=/i.test(html);
}
