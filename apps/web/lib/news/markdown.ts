/**
 * A deliberately small markdown subset, parsed into a block tree.
 *
 * ## Why this exists instead of a library
 *
 * Two reasons, and the second is the real one.
 *
 * 1. There is no markdown renderer anywhere in this repo, so adding one means
 *    a new dependency (plus a sanitiser, because every general-purpose
 *    renderer passes raw HTML through by default) on the critical path of a
 *    public page. That is a supply-chain surface for a feature that needs
 *    headings, paragraphs, lists, links and code.
 *
 * 2. ⚠️ **No HTML, ever.** This parser produces DATA, and `<Markdown>` renders
 *    that data as React elements. There is no `dangerouslySetInnerHTML`
 *    anywhere in the path, so an article body containing `<script>` renders as
 *    the literal text `<script>` — React escapes it — rather than executing.
 *    Article bodies are author-supplied text on a public, cacheable page; that
 *    is precisely the shape of an XSS sink, and the only reliable defence is
 *    not having an HTML path at all.
 *
 * Anything unrecognised degrades to a paragraph. A malformed article renders
 * plainly; it never fails to render.
 */

export type InlineNode =
  | { kind: 'text'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'strong'; value: string }
  /** `href` is validated — see `safeHref`. */
  | { kind: 'link'; value: string; href: string };

export type MarkdownBlock =
  | { kind: 'heading'; level: 2 | 3; text: InlineNode[] }
  | { kind: 'paragraph'; text: InlineNode[] }
  | { kind: 'list'; ordered: boolean; items: InlineNode[][] }
  | { kind: 'code'; language: string | null; value: string }
  | { kind: 'quote'; text: InlineNode[] };

/**
 * ⚠️ The allowlist that stops `[كلام](javascript:alert(1))` from becoming a
 * working link. Only three shapes survive:
 *
 *   · `/path`  — internal, which is what almost every article link is
 *   · `https://…`
 *   · `mailto:…`
 *
 * Anything else — `javascript:`, `data:`, a protocol-relative `//host` that
 * silently leaves the origin — returns `null` and the link renders as plain
 * text. Failing closed is right here: a dead link is a cosmetic bug, a live
 * `javascript:` URL in a published article is not.
 */
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (href.length === 0) return null;
  // `//evil.com` is protocol-relative and leaves the site. It starts with `/`,
  // so it must be rejected before the internal-path check below.
  if (href.startsWith('//')) return null;
  if (href.startsWith('/')) return href;
  if (/^https:\/\/[^\s]+$/i.test(href)) return href;
  if (/^mailto:[^\s]+$/i.test(href)) return href;
  return null;
}

/** `**bold**`, `` `code` ``, `[text](href)`, in one pass. */
export function parseInline(source: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let cursor = 0;

  for (let match = pattern.exec(source); match !== null; match = pattern.exec(source)) {
    if (match.index > cursor) {
      nodes.push({ kind: 'text', value: source.slice(cursor, match.index) });
    }

    const [full, strong, code, linkText, linkHref] = match;

    if (strong !== undefined) {
      nodes.push({ kind: 'strong', value: strong });
    } else if (code !== undefined) {
      nodes.push({ kind: 'code', value: code });
    } else if (linkText !== undefined && linkHref !== undefined) {
      const href = safeHref(linkHref);
      // Rejected protocol → the label survives as text. The reader still gets
      // the sentence; they just do not get a link they should not have had.
      nodes.push(href ? { kind: 'link', value: linkText, href } : { kind: 'text', value: linkText });
    }

    cursor = match.index + full.length;
  }

  if (cursor < source.length) {
    nodes.push({ kind: 'text', value: source.slice(cursor) });
  }

  return nodes.length > 0 ? nodes : [{ kind: 'text', value: source }];
}

const ORDERED_ITEM = /^\d+[.)]\s+(.*)$/;
const UNORDERED_ITEM = /^[-*]\s+(.*)$/;

/**
 * Line-based, not a full CommonMark parser — the supported grammar is:
 *
 *   ## heading      ### subheading
 *   > quote
 *   - item          1. item
 *   ```lang … ```
 *   everything else → paragraph (blank line separates)
 *
 * `#` (h1) is deliberately NOT supported: the page renders the article title
 * as its only `<h1>`, and a second one in the body is an SEO defect that is
 * invisible to whoever wrote it.
 */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');

  let paragraph: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: 'paragraph', text: parseInline(paragraph.join(' ').trim()) });
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      flushParagraph();
      continue;
    }

    // Fenced code. Consumes until the closing fence, or to the end of the
    // document if the author never closed it — an unterminated fence renders
    // as one long code block rather than swallowing the parse.
    if (trimmed.startsWith('```')) {
      flushParagraph();
      const language = trimmed.slice(3).trim() || null;
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? '').trim().startsWith('```')) {
        body.push(lines[index] ?? '');
        index += 1;
      }
      blocks.push({ kind: 'code', language, value: body.join('\n') });
      continue;
    }

    if (trimmed.startsWith('### ')) {
      flushParagraph();
      blocks.push({ kind: 'heading', level: 3, text: parseInline(trimmed.slice(4).trim()) });
      continue;
    }

    if (trimmed.startsWith('## ')) {
      flushParagraph();
      blocks.push({ kind: 'heading', level: 2, text: parseInline(trimmed.slice(3).trim()) });
      continue;
    }

    if (trimmed.startsWith('> ')) {
      flushParagraph();
      blocks.push({ kind: 'quote', text: parseInline(trimmed.slice(2).trim()) });
      continue;
    }

    const ordered = ORDERED_ITEM.exec(trimmed);
    const unordered = UNORDERED_ITEM.exec(trimmed);
    if (ordered || unordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      const items: InlineNode[][] = [];

      // Gather the whole run of adjacent items of the SAME kind, so a bullet
      // list immediately followed by a numbered one stays two lists.
      let cursor = index;
      while (cursor < lines.length) {
        const candidate = (lines[cursor] ?? '').trim();
        const match = isOrdered ? ORDERED_ITEM.exec(candidate) : UNORDERED_ITEM.exec(candidate);
        if (!match) break;
        items.push(parseInline((match[1] ?? '').trim()));
        cursor += 1;
      }

      blocks.push({ kind: 'list', ordered: isOrdered, items });
      index = cursor - 1;
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  return blocks;
}

/**
 * The article's own table of contents, and the anchor ids the headings render
 * with. Extracted from the same block tree the body renders from, so a heading
 * can never appear in one and not the other.
 */
export interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

/** Flattens inline nodes back to plain text — for headings, titles, and the TOC. */
export function inlineText(nodes: readonly InlineNode[]): string {
  return nodes.map((node) => node.value).join('');
}

/**
 * ⚠️ Arabic headings produce Arabic ids, and that is fine — a fragment is
 * percent-encoded in the URL bar and works everywhere. What is NOT fine is a
 * space or a `#`, so both are stripped.
 *
 * The index suffix guarantees uniqueness: two sections legitimately called
 * «مثال» would otherwise collide and the second anchor would jump to the first.
 */
export function headingId(text: string, index: number): string {
  const base = text
    .trim()
    .replace(/[#?/\\%]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return base.length > 0 ? `${base}-${index}` : `section-${index}`;
}

export function tableOfContents(blocks: readonly MarkdownBlock[]): TocEntry[] {
  return blocks.flatMap((block, index) =>
    block.kind === 'heading'
      ? [{ id: headingId(inlineText(block.text), index), text: inlineText(block.text), level: block.level }]
      : [],
  );
}
