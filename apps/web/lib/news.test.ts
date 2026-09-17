import { describe, expect, it, vi } from 'vitest';

/*
 * `news.ts` calls `cacheLife`/`cacheTag` at the top of its cached readers.
 * Neither runs in this file — `newsPostPath` is pure — but the import has to
 * resolve, and `next/cache` throws outside a Next render.
 */
vi.mock('next/cache', () => ({
  cacheLife: () => {},
  cacheTag: () => {},
}));

const { newsPostPath } = await import('./news');

/**
 * The regression this file exists for.
 *
 * 24 Arabic-slugged articles went live, were listed by `GET /api/news`, showed
 * on `/news`, and appeared in the sitemap — and every one of their own pages
 * answered 200 with an empty body, because `/news/[slug]` hands the page
 * component a still-percent-encoded param while `generateMetadata` gets it
 * decoded. `encodeURIComponent` on the encoded spelling double-encodes it, the
 * API 404s, the page calls `notFound()`, and the title in the `<head>` is
 * correct the whole time — the article looks published from every angle except
 * the one that matters.
 *
 * A soft 404 is worse than a hard one for the section's entire purpose: a
 * crawler indexes the empty page instead of dropping it.
 */
describe('newsPostPath', () => {
  const slug = 'فخاخ-امتحان-البرمجة-بكالوريا';
  const encoded = encodeURIComponent(slug);

  it('sends the same request whether the param arrives decoded or encoded', () => {
    expect(newsPostPath(slug)).toBe(`/api/news/${encoded}`);
    expect(newsPostPath(encoded)).toBe(`/api/news/${encoded}`);
  });

  it('never double-encodes — the byte the API 404s on is `%25`', () => {
    expect(newsPostPath(encoded)).not.toContain('%25');
  });

  it('leaves an ASCII slug untouched, which is why this hid for so long', () => {
    expect(newsPostPath('zz-encoding-probe')).toBe('/api/news/zz-encoding-probe');
  });

  /**
   * `NewsSlugSchema` forbids `/`, `.` and whitespace — it does NOT forbid `%`.
   * A slug ending in a bare `%` makes `decodeURIComponent` throw `URIError`,
   * and an uncaught throw here would 500 the article page rather than 404 it.
   */
  it('survives a slug that is not valid percent-encoding', () => {
    expect(newsPostPath('100%')).toBe(`/api/news/${encodeURIComponent('100%')}`);
  });
});
