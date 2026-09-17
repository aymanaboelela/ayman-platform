import { describe, expect, it } from 'vitest';
import { sitemapLoc } from './sitemap-url';

describe('sitemapLoc', () => {
  /**
   * The case the function exists for. `NewsSlugSchema` rejects slashes, dots
   * and whitespace and nothing else, so an ampersand reaches `<loc>` intact —
   * and an unescaped one makes the whole document unparseable, taking every
   * other URL in it down with it.
   */
  it('escapes the five XML entities', () => {
    expect(sitemapLoc('https://x.test/news/a&b')).toBe('https://x.test/news/a&amp;b');
    expect(sitemapLoc('https://x.test/news/<b>')).toBe('https://x.test/news/&lt;b&gt;');
    expect(sitemapLoc(`https://x.test/news/"a'b`)).toBe('https://x.test/news/&quot;a&apos;b');
  });

  /** `&` has to go first, or the entities the others introduce get re-escaped. */
  it('does not double-escape the entities it just wrote', () => {
    expect(sitemapLoc('https://x.test/a&<b')).toBe('https://x.test/a&amp;&lt;b');
    expect(sitemapLoc('https://x.test/a&amp;b')).toBe('https://x.test/a&amp;amp;b');
  });

  /**
   * ⚠️ Arabic slugs are published RAW in the canonical, the BreadcrumbList and
   * `/llms.txt`. Percent-encoding them here would make the sitemap's URL a
   * different string from the one every other surface names.
   */
  it('leaves an ordinary Arabic slug exactly as it is', () => {
    const url = 'https://aymanaboelela.com/news/قاموس-مصطلحات-البرمجة';
    expect(sitemapLoc(url)).toBe(url);
  });
});
