/**
 * Which public routes have a markdown twin, and how a request asks for one.
 *
 * ⚠️ Deliberately DEPENDENCY-FREE — no `copy`, no catalog, no `SITE_URL`.
 * `proxy.ts` imports this to decide, on every single request, whether to
 * rewrite; the rendering half (`markdown-render.ts`) pulls in the entire
 * Arabic string table and has no business in that bundle. This is the same
 * separation `proxy.ts` already makes when it re-declares `API_ORIGIN` rather
 * than importing it from `lib/api.ts`.
 *
 * Two ways to ask for markdown, both supported because agents in the wild use
 * both:
 *   1. `Accept: text/markdown` on the ordinary URL — Cloudflare's
 *      "Markdown for Agents" convention, and the one the readiness scanner
 *      checks.
 *   2. A `.md` suffix on the URL — the llmstxt.org convention, and the only
 *      one that survives being pasted into a chat box, which is how most of
 *      these links actually travel.
 * Both land on the same renderer.
 */

/**
 * The internal route that actually renders markdown (`app/md/[[...slug]]`).
 * A rewrite target has to be a real, routable path — an underscore-prefixed
 * folder would be private to the App Router and 404 here.
 */
const MARKDOWN_RENDER_PREFIX = '/md';

/** `/` has no bare-name `.md` twin, so it gets the conventional one. */
const HOME_MARKDOWN_PATH = '/index.md';

/**
 * Static public routes with a markdown rendering, and the ONLY ones.
 *
 * ⚠️ Every entry must be a route that is public in `proxy.ts` — a path in this
 * list that is also in `PROTECTED_PREFIXES` would serve, as plain text and
 * without a session, exactly the content the redirect matrix exists to gate.
 * `markdown-routes.test.ts` asserts the two lists cannot overlap, because
 * "someone will remember" is not a control.
 */
const STATIC_MARKDOWN_ROUTES = ['/', '/about', '/courses', '/essentials', '/news'] as const;

/** `/years/1`, `/years/2`, `/years/3` — `parseYear` on the page rejects the rest. */
const YEAR_PATTERN = /^\/years\/([123])$/;

/**
 * `/courses/<slug>` and nothing deeper. The negative lookahead is the whole
 * point: `/courses/x/lessons/y` is the PLAYER, which is protected
 * (`PROTECTED_LESSON_PATTERN` in `proxy.ts`) and must never be reachable as
 * markdown. A slug may not contain a slash, so one segment is the rule.
 */
const COURSE_PATTERN = /^\/courses\/([^/]+)$/;

/** `/news/<slug>` and nothing deeper. Arabic slugs are normal here. */
const ARTICLE_PATTERN = /^\/news\/([^/]+)$/;

export type MarkdownRoute =
  | { kind: 'home' }
  | { kind: 'about' }
  | { kind: 'courses' }
  | { kind: 'essentials' }
  | { kind: 'news' }
  | { kind: 'year'; year: 1 | 2 | 3 }
  | { kind: 'course'; slug: string }
  | { kind: 'article'; slug: string };

/** Does this ordinary public path have a markdown twin? */
export function isMarkdownablePath(pathname: string): boolean {
  return (
    (STATIC_MARKDOWN_ROUTES as readonly string[]).includes(pathname) ||
    YEAR_PATTERN.test(pathname) ||
    COURSE_PATTERN.test(pathname) ||
    ARTICLE_PATTERN.test(pathname)
  );
}

/**
 * The URL an agent can fetch to get this page as markdown — advertised as
 * `rel="alternate"; type="text/markdown"` in the `Link` header. `null` for
 * anything without a markdown rendering, so the header never points at a 404.
 */
export function markdownTwinPath(pathname: string): string | null {
  if (!isMarkdownablePath(pathname)) return null;
  return pathname === '/' ? HOME_MARKDOWN_PATH : `${pathname}.md`;
}

/** `/courses/x.md` → `/courses/x`; `/index.md` → `/`. `null` if not a `.md` URL. */
export function pathFromMarkdownSuffix(pathname: string): string | null {
  if (pathname === HOME_MARKDOWN_PATH) return '/';
  if (!pathname.endsWith('.md')) return null;
  return pathname.slice(0, -'.md'.length);
}

/** Where `proxy.ts` rewrites to: `/` → `/md`, `/courses/x` → `/md/courses/x`. */
export function markdownRenderPath(pathname: string): string {
  return pathname === '/' ? MARKDOWN_RENDER_PREFIX : `${MARKDOWN_RENDER_PREFIX}${pathname}`;
}

/**
 * The reverse, for `app/md/[[...slug]]/route.ts`: catch-all segments back
 * into a route. Returns `null` for anything unrecognised so the handler can
 * 404 rather than render an empty document.
 */
export function resolveMarkdownRoute(slug: readonly string[] | undefined): MarkdownRoute | null {
  const segments = slug ?? [];
  const pathname = segments.length === 0 ? '/' : `/${segments.join('/')}`;

  if (pathname === '/') return { kind: 'home' };
  if (pathname === '/about') return { kind: 'about' };
  if (pathname === '/courses') return { kind: 'courses' };
  if (pathname === '/essentials') return { kind: 'essentials' };
  if (pathname === '/news') return { kind: 'news' };

  // `?.[1]` rather than `[1]!` throughout: the capture group is guaranteed by
  // the pattern, but `noUncheckedIndexedAccess` is on for a reason and a
  // non-null assertion here would be the one place it is switched off.
  const year = YEAR_PATTERN.exec(pathname)?.[1];
  if (year) return { kind: 'year', year: Number(year) as 1 | 2 | 3 };

  const courseSlug = COURSE_PATTERN.exec(pathname)?.[1];
  if (courseSlug) return { kind: 'course', slug: courseSlug };

  const articleSlug = ARTICLE_PATTERN.exec(pathname)?.[1];
  if (articleSlug) return { kind: 'article', slug: articleSlug };

  return null;
}

/**
 * Does the client actually PREFER markdown?
 *
 * ⚠️ The naive check — `accept.includes('text/markdown')` — is wrong in the
 * one direction that matters. Every browser sends an `Accept` that ends in a
 * catch-all wildcard (`text/html, application/xhtml+xml, ... , q=0.8` on the
 * wildcard), and matching that wildcard would serve plain text to a student on
 * a phone. So markdown is chosen only when it is named EXPLICITLY — a wildcard
 * never counts — and only when its q-value is at least that of HTML: a client
 * that says `text/markdown;q=0.5, text/html` is asking for HTML and gets HTML.
 *
 * RFC 9110 §12.5.1: absent `q` means 1, and `q=0` means "not acceptable".
 */
export function acceptsMarkdown(accept: string | null | undefined): boolean {
  if (!accept) return false;

  let markdownQ = 0;
  let htmlQ = 0;

  for (const raw of accept.split(',')) {
    const [mediaType, ...params] = raw.split(';').map((part) => part.trim().toLowerCase());
    if (!mediaType) continue;

    const qParam = params.find((param) => param.startsWith('q='));
    const parsed = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
    const q = Number.isFinite(parsed) ? parsed : 1;

    if (mediaType === 'text/markdown') markdownQ = Math.max(markdownQ, q);
    // `application/xhtml+xml` counts as HTML: it is what Safari and Firefox
    // rank alongside `text/html`, and treating it as "not HTML" would make
    // markdown win on those browsers the moment anything requested both.
    if (mediaType === 'text/html' || mediaType === 'application/xhtml+xml') {
      htmlQ = Math.max(htmlQ, q);
    }
  }

  return markdownQ > 0 && markdownQ >= htmlQ;
}

/**
 * `x-markdown-tokens`, and honestly an ESTIMATE — this app does not ship a
 * tokenizer and will not add one to compute a response header.
 *
 * The divisor is 3, not the ~4 chars/token quoted for English. This content is
 * Arabic, and Arabic is materially worse off in every byte-pair vocabulary in
 * use: its letters sit outside the Latin range, so a word that is one token in
 * English is routinely three or four here. Three is measured-ish and
 * deliberately conservative — an agent budgeting context should over-reserve,
 * not under-reserve.
 */
export function estimateMarkdownTokens(markdown: string): number {
  return Math.max(1, Math.ceil(markdown.length / 3));
}
