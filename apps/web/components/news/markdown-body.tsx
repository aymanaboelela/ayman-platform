import Link from 'next/link';
import {
  headingId,
  inlineText,
  type InlineNode,
  type MarkdownBlock,
} from '@/lib/news/markdown';

/**
 * Renders the block tree from `lib/news/markdown.ts` as React elements.
 *
 * ⚠️ There is no `dangerouslySetInnerHTML` in this file and there must never
 * be one. Every string below reaches the DOM as a React text child, which
 * React escapes — so `<script>` in an article body renders as the four visible
 * characters `<scr…` rather than executing. That property is the whole reason
 * the parser produces DATA instead of an HTML string, and adding a raw-HTML
 * escape hatch here would quietly undo it.
 *
 * `href`s have already been through `safeHref`; an unsafe one never becomes a
 * `link` node in the first place, so this file has no URL decisions to make.
 */

function Inline({ nodes }: { nodes: readonly InlineNode[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        const key = `${node.kind}-${index}`;

        if (node.kind === 'strong') return <strong key={key}>{node.value}</strong>;
        if (node.kind === 'code') return <code key={key} className="article__code">{node.value}</code>;

        if (node.kind === 'link') {
          // Internal links go through `next/link` so they prefetch and stay
          // client-side; external ones are plain anchors with `rel` set,
          // because `next/link` gives an off-site URL nothing but overhead.
          return node.href.startsWith('/') ? (
            <Link key={key} href={node.href} className="article__link">
              {node.value}
            </Link>
          ) : (
            <a
              key={key}
              href={node.href}
              className="article__link"
              // `noopener` severs `window.opener`; `nofollow ugc` stops an
              // article's outbound links from passing this domain's ranking to
              // whatever it cites.
              rel="noopener noreferrer nofollow ugc"
              target="_blank"
            >
              {node.value}
            </a>
          );
        }

        return <span key={key}>{node.value}</span>;
      })}
    </>
  );
}

export function MarkdownBody({ blocks }: { blocks: readonly MarkdownBlock[] }) {
  return (
    <div className="article__body">
      {blocks.map((block, index) => {
        const key = `${block.kind}-${index}`;

        switch (block.kind) {
          case 'heading': {
            // The id has to be computed the same way `tableOfContents` does,
            // from the same index — otherwise the contents links point at
            // anchors that do not exist. Both call `headingId(text, index)`.
            const id = headingId(inlineText(block.text), index);
            return block.level === 2 ? (
              <h2 key={key} id={id} className="article__h2">
                <Inline nodes={block.text} />
              </h2>
            ) : (
              <h3 key={key} id={id} className="article__h3">
                <Inline nodes={block.text} />
              </h3>
            );
          }

          case 'paragraph':
            return (
              <p key={key} className="article__p">
                <Inline nodes={block.text} />
              </p>
            );

          case 'quote':
            return (
              <blockquote key={key} className="article__quote">
                <Inline nodes={block.text} />
              </blockquote>
            );

          case 'list':
            return block.ordered ? (
              <ol key={key} className="article__list article__list--ordered">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <Inline nodes={item} />
                  </li>
                ))}
              </ol>
            ) : (
              <ul key={key} className="article__list">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <Inline nodes={item} />
                  </li>
                ))}
              </ul>
            );

          case 'code':
            return (
              /**
               * ⚠️ `dir="ltr"` is not decoration. The page is RTL, and code in
               * an RTL container renders with its punctuation reordered —
               * `x = arr[0];` comes out visually mangled and a student copying
               * it gets something that does not run. Code is always LTR,
               * whatever language the prose around it is in.
               */
              <pre key={key} className="article__pre" dir="ltr">
                <code data-language={block.language ?? undefined}>{block.value}</code>
              </pre>
            );
        }
      })}
    </div>
  );
}
