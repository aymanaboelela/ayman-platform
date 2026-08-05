import { describe, expect, it } from 'vitest';
import {
  headingId,
  inlineText,
  parseInline,
  parseMarkdown,
  safeHref,
  tableOfContents,
  type MarkdownBlock,
} from './markdown';

/**
 * `noUncheckedIndexedAccess` is on, and a block union does not narrow through
 * an index. Assert the shape instead of casting through `unknown`.
 */
const textOf = (block: MarkdownBlock | undefined): string => {
  expect(block).toBeDefined();
  if (!block || !('text' in block)) throw new Error('block carries no inline text');
  return inlineText(block.text);
};

/**
 * `safeHref` is the security boundary of the whole articles feature: article
 * bodies are author-supplied text that ends up on a public, cached page, and
 * this function decides which of their links become real `href`s.
 *
 * It fails CLOSED — anything not positively recognised renders as plain text.
 */
describe('safeHref', () => {
  it('accepts internal paths, https and mailto', () => {
    expect(safeHref('/courses')).toBe('/courses');
    expect(safeHref('/news/الحلقات')).toBe('/news/الحلقات');
    expect(safeHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeHref('mailto:someone@example.com')).toBe('mailto:someone@example.com');
  });

  it('rejects every script-bearing scheme', () => {
    for (const href of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      '  javascript:alert(1)  ',
      'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
    ]) {
      expect(safeHref(href), href).toBeNull();
    }
  });

  /**
   * `//evil.com` starts with `/` and would pass a naive "is it internal?"
   * check, while actually navigating off the origin entirely.
   */
  it('rejects protocol-relative URLs that leave the origin', () => {
    expect(safeHref('//evil.com')).toBeNull();
    expect(safeHref('//evil.com/path')).toBeNull();
  });

  it('rejects plain http, so a published article cannot downgrade a reader', () => {
    expect(safeHref('http://example.com')).toBeNull();
  });

  it('rejects empty and whitespace-only hrefs', () => {
    expect(safeHref('')).toBeNull();
    expect(safeHref('   ')).toBeNull();
  });
});

describe('parseInline', () => {
  it('parses bold, code and links', () => {
    expect(parseInline('عادي **غامق** و`كود` و[لينك](/courses)')).toEqual([
      { kind: 'text', value: 'عادي ' },
      { kind: 'strong', value: 'غامق' },
      { kind: 'text', value: ' و' },
      { kind: 'code', value: 'كود' },
      { kind: 'text', value: ' و' },
      { kind: 'link', value: 'لينك', href: '/courses' },
    ]);
  });

  /**
   * The label survives; the dangerous href does not.
   *
   * Asserted as "no link node exists" rather than as an exact node list,
   * because the href pattern stops at the first `)` — so a URL containing
   * parentheses leaves the trailing `)` behind as text. That is a known and
   * accepted limit of this deliberately small parser (a link to a URL with
   * balanced parens renders slightly wrong), and it is NOT what this test is
   * about. What matters is that nothing renders as a clickable
   * `javascript:` URL.
   */
  it('downgrades a rejected link to plain text without losing the words', () => {
    const nodes = parseInline('[اضغط هنا](javascript:alert(1))');

    expect(nodes.some((node) => node.kind === 'link')).toBe(false);
    expect(nodes.map((node) => node.value).join('')).toContain('اضغط هنا');
  });

  it('keeps a safe link clickable', () => {
    expect(parseInline('[الكورسات](/courses)')).toEqual([
      { kind: 'link', value: 'الكورسات', href: '/courses' },
    ]);
  });

  it('never produces an empty node list', () => {
    expect(parseInline('نص عادي')).toEqual([{ kind: 'text', value: 'نص عادي' }]);
  });
});

describe('parseMarkdown', () => {
  it('parses headings, and refuses to emit an h1', () => {
    const blocks = parseMarkdown('## عنوان\n### فرعي\n# مش مدعوم');

    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 2 });
    expect(blocks[1]).toMatchObject({ kind: 'heading', level: 3 });
    // `#` falls through to a paragraph: the page's only h1 is the article
    // title, and a second one in the body is an invisible SEO defect.
    expect(blocks[2]?.kind).toBe('paragraph');
  });

  it('joins wrapped lines into one paragraph and splits on a blank line', () => {
    const blocks = parseMarkdown('سطر أول\nسطر تاني\n\nفقرة تانية');

    expect(blocks).toHaveLength(2);
    expect(textOf(blocks[0])).toBe('سطر أول سطر تاني');
  });

  it('parses fenced code with a language, and keeps its whitespace', () => {
    const blocks = parseMarkdown('```python\nx = 1\n  y = 2\n```');

    expect(blocks[0]).toEqual({ kind: 'code', language: 'python', value: 'x = 1\n  y = 2' });
  });

  it('closes an unterminated fence at the end of the document', () => {
    // An author who forgets the closing fence gets one long code block, not a
    // parser that swallows the rest of the article.
    const blocks = parseMarkdown('نص\n\n```\nكود بلا نهاية');

    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toMatchObject({ kind: 'code', value: 'كود بلا نهاية' });
  });

  it('groups list items, and keeps adjacent lists of different kinds apart', () => {
    const blocks = parseMarkdown('- واحد\n- اتنين\n1. أ\n2. ب');

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ kind: 'list', ordered: false });
    expect((blocks[0] as { items: unknown[] }).items).toHaveLength(2);
    expect(blocks[1]).toMatchObject({ kind: 'list', ordered: true });
    expect((blocks[1] as { items: unknown[] }).items).toHaveLength(2);
  });

  it('parses quotes', () => {
    expect(parseMarkdown('> اقتباس')[0]).toMatchObject({ kind: 'quote' });
  });

  it('renders an empty body as no blocks rather than throwing', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('\n\n   \n')).toEqual([]);
  });

  /**
   * The whole reason this parser produces data instead of HTML: markup in an
   * article body is CONTENT, and must survive as text for React to escape.
   */
  it('treats HTML as text, never as markup', () => {
    const blocks = parseMarkdown('<script>alert(1)</script>');

    expect(blocks[0]?.kind).toBe('paragraph');
    expect(textOf(blocks[0])).toBe('<script>alert(1)</script>');
  });
});

describe('headingId', () => {
  it('keeps Arabic and makes ids unique per position', () => {
    expect(headingId('المتغيرات', 3)).toBe('المتغيرات-3');
    // Two sections legitimately called «مثال» must not collide, or the second
    // anchor silently jumps to the first.
    expect(headingId('مثال', 1)).not.toBe(headingId('مثال', 5));
  });

  it('strips characters that would break a fragment', () => {
    expect(headingId('إيه هي الحلقة؟ #برمجة', 0)).not.toMatch(/[#\s]/);
  });

  it('falls back rather than producing an empty id', () => {
    expect(headingId('###', 2)).toBe('section-2');
    expect(headingId('   ', 4)).toBe('section-4');
  });
});

describe('tableOfContents', () => {
  it('lists only headings, with ids matching what the body renders', () => {
    const blocks = parseMarkdown('## أول\nنص\n### تاني\n## تالت');
    const toc = tableOfContents(blocks);

    expect(toc.map((entry) => entry.text)).toEqual(['أول', 'تاني', 'تالت']);
    expect(toc.map((entry) => entry.level)).toEqual([2, 3, 2]);
    expect(new Set(toc.map((entry) => entry.id)).size).toBe(3);
  });
});
