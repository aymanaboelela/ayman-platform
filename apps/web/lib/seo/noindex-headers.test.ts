import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

/**
 * The `X-Robots-Tag: noindex` rules in `next.config.ts`, checked through Next's
 * own matcher rather than by reading the source strings — a `:path*` that
 * silently fails to match is exactly the bug a string comparison would miss.
 *
 * Both directions matter. A file left out stays in Search Console's
 * «لم تتم فهرستها»; a rule that catches a PAGE de-indexes a page that sells a
 * course, and nothing on the page itself would show it.
 */

async function robotsFor(pathname: string): Promise<string | undefined> {
  const rules = (await nextConfig.headers?.()) ?? [];
  for (const rule of rules) {
    const match = getPathMatch(rule.source, { strict: true, removeUnnamedParams: true });
    if (!match(pathname)) continue;
    const header = rule.headers.find((h) => h.key.toLowerCase() === 'x-robots-tag');
    if (header) return header.value;
  }
  return undefined;
}

describe('noindex on non-page files', () => {
  // Every web-app URL from the Search Console report of 2026-09-25, minus the
  // favicon and the brand image (left out on purpose, see next.config.ts) and
  // `/api/health` (served by Nest, see apps/api/src/main.ts).
  it.each([
    '/.well-known/agent-skills/index.json',
    '/.well-known/api-catalog',
    '/llms.txt',
    '/sitemap.xml',
    '/docs/api',
    '/openapi.json',
    '/_next/static/media/ibm_plex_sans_arabic_600_normal-s.p.2jzf714wbn4iw.woff2',
    '/_next/static/chunks/app/layout-0a1b2c3d.js',
    '/AGENTS.md',
    '/auth.md',
    '/books.md',
    '/index.md',
    '/courses/programming-2026.md',
  ])('%s is noindex', async (pathname) => {
    expect(await robotsFor(pathname)).toBe('noindex');
  });

  it.each([
    '/',
    '/courses',
    '/courses/programming-2026',
    '/books',
    '/news',
    '/news/some-article',
    '/about',
    '/years/3',
    '/honor-board',
    '/docs',
    '/favicon.ico',
    '/brand/ayman-mark-2.webp',
  ])('%s is left indexable', async (pathname) => {
    expect(await robotsFor(pathname)).toBeUndefined();
  });

  it('never adds nofollow — llms.txt and the catalogs exist to be followed', async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const values = rules.flatMap((r) =>
      r.headers.filter((h) => h.key.toLowerCase() === 'x-robots-tag').map((h) => h.value),
    );
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) expect(value).not.toMatch(/nofollow|none/);
  });
});
