import { copy } from '@ayman/contracts';
import { CODE_LANGS, codeBlockMinHeight, highlightCode, type CodeLang } from '@/lib/shiki';
import { CodeReveal } from './code-reveal';

/**
 * An async Server Component.
 *
 * Shiki never crosses the client boundary: the highlighted markup is produced
 * here and streamed as HTML, so crawlers get real code text and the browser gets
 * zero bytes of highlighter. The only client code involved is `CodeReveal`,
 * which is ~1kB on top of the already-loaded Motion `m` runtime.
 */
export async function CodeBlock({
  code,
  lang,
  title,
}: {
  code: string;
  lang: CodeLang;
  title?: string;
}) {
  if (!CODE_LANGS.includes(lang)) {
    // Fail loudly at render time rather than silently emitting unhighlighted
    // markup that nobody notices until a screenshot review.
    throw new Error(`Unsupported code language: ${lang}`);
  }

  const html = await highlightCode(code, lang);

  return (
    <figure className="my-8">
      {title ? (
        <figcaption className="mono flex items-center gap-2 rounded-t-lg border border-b-0 border-line px-4 py-2 text-[length:var(--fs-mono-label)] text-fg-muted">
          {title}
        </figcaption>
      ) : null}
      <CodeReveal
        html={html}
        minHeight={codeBlockMinHeight(code)}
        label={copy.code.label}
        rounded={title ? 'bottom' : 'all'}
      />
    </figure>
  );
}
