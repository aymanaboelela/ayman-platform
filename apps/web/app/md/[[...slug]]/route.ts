import { getCatalogOrEmpty, getCourse } from '@/lib/catalog';
import { getNewsListOrEmpty, getNewsPost } from '@/lib/news';
import { estimateMarkdownTokens, resolveMarkdownRoute } from '@/lib/agents/markdown-routes';
import {
  renderAboutMarkdown,
  renderCourseMarkdown,
  renderCoursesMarkdown,
  renderEssentialsMarkdown,
  renderHomeMarkdown,
  renderNewsIndexMarkdown,
  renderNewsPostMarkdown,
  renderYearMarkdown,
} from '@/lib/agents/markdown-render';

/**
 * Markdown for Agents.
 *
 * Reached three ways, all of which end up here:
 *   · `GET /` with `Accept: text/markdown`  — rewritten by `proxy.ts`
 *   · `GET /courses/python-basics.md`       — rewritten by `proxy.ts`
 *   · `GET /md/courses/python-basics`       — directly, which is why this is
 *     a real public route rather than a private rewrite target
 *
 * The route is a catch-all so ONE handler covers every public page; the
 * mapping from segments back to a page lives in `markdown-routes.ts`, next to
 * the mapping that got us here, so the two cannot drift.
 */

/**
 * `Vary: Accept` is load-bearing, not hygiene. `/` and `/` -with-markdown are
 * the same URL and every cache between us and the agent — Cloudflare included
 * — will otherwise serve whichever it saw first to whoever asks next. Without
 * it, one agent's markdown request poisons the homepage for real students.
 */
const MARKDOWN_HEADERS = {
  'Content-Type': 'text/markdown; charset=utf-8',
  Vary: 'Accept',
  /**
   * Short, and shorter than the pages themselves: the content here is built
   * from `'use cache'`d catalog reads that already have their own lifetimes,
   * so this only bounds how stale an edge copy may get.
   */
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
} as const;

function markdownResponse(markdown: string): Response {
  return new Response(markdown, {
    headers: {
      ...MARKDOWN_HEADERS,
      // Cloudflare's convention, so an agent can budget context before it
      // spends any. An estimate — see `estimateMarkdownTokens`.
      'x-markdown-tokens': String(estimateMarkdownTokens(markdown)),
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug?: string[] }> },
): Promise<Response> {
  const { slug } = await params;
  const route = resolveMarkdownRoute(slug);

  if (!route) {
    return new Response(null, { status: 404 });
  }

  switch (route.kind) {
    case 'home': {
      const { courses } = await getCatalogOrEmpty();
      return markdownResponse(renderHomeMarkdown(courses));
    }
    case 'about':
      return markdownResponse(renderAboutMarkdown());
    case 'essentials':
      return markdownResponse(renderEssentialsMarkdown());
    case 'courses': {
      const { courses } = await getCatalogOrEmpty();
      return markdownResponse(renderCoursesMarkdown(courses));
    }
    case 'year': {
      const { courses } = await getCatalogOrEmpty();
      return markdownResponse(renderYearMarkdown(route.year, courses));
    }
    case 'news': {
      const { posts } = await getNewsListOrEmpty();
      return markdownResponse(renderNewsIndexMarkdown(posts));
    }
    case 'article': {
      // Same 404 as the HTML page for a draft or an unknown slug — the
      // markdown twin must not become a way to confirm a draft exists.
      const post = await getNewsPost(route.slug);
      if (!post) return new Response(null, { status: 404 });
      return markdownResponse(renderNewsPostMarkdown(post));
    }
    case 'course': {
      // `getCourse` returns null for an unpublished or unknown slug — the same
      // 404 the HTML page gives, so the markdown twin cannot become a way to
      // confirm a draft course exists.
      const course = await getCourse(route.slug);
      if (!course) return new Response(null, { status: 404 });
      return markdownResponse(renderCourseMarkdown(course));
    }
  }
}
