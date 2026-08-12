import DOMPurify from 'isomorphic-dompurify';

/**
 * The SECOND sanitization pass. The first ran on write (apps/api's
 * sanitizeRichText), so the row in Postgres is already clean — this exists
 * because a single sanitizer is a single point of failure, and because rows
 * written before a future allowlist change would otherwise render under the
 * old rules.
 *
 * This is a Server Component: DOMPurify and its jsdom dependency never
 * reach the browser, and the sanitized markup is in the SSR'd HTML for
 * crawlers.
 */
export function RichText({ html, className }: { html: string; className?: string }) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'h2', 'h3', 'blockquote', 'code', 'pre', 'a'],
    ALLOWED_ATTR: ['href', 'title', 'rel', 'target'],
    // Belt and braces: even if the tag list above ever widens, these stay out.
    FORBID_TAGS: ['iframe', 'script', 'style', 'object', 'embed', 'form'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  });

  // The wrap rule lives HERE, not at the call sites, because the allowlist
  // above is what creates the hazard: `<a>` and `<code>` are permitted, so an
  // instructor can paste a Drive or YouTube URL as its own link text, or write
  // an inline `<code>ArrayIndexOutOfBoundsException</code>` — routine on a
  // computer-science platform with a Python playground. Either is one
  // ~60-character unbreakable Latin run, ~450px at 15px, against a ~288px
  // column on a 360px phone. globals.css gives `pre` an `overflow-x: auto` so
  // FENCED code is safe; inline `<code>` and a bare `<a>` are not. And because
  // globals.css:105-108 sets `html, body { overflow-x: clip }`, the page will
  // not scroll to reveal the overflow — the run is simply cut at the viewport
  // edge. In an RTL line box the LTR run starts at the inline-start (right)
  // edge and extends past the LEFT one, so it is the BEGINNING of the token
  // that disappears: the student sees the tail of a URL and no way to reach the
  // head of it. Every caller inherits the fix; none of them had a wrap rule of
  // its own, including the whole lesson body via player/text-lesson.tsx.
  //
  // `anywhere`, not `break-all`: it only breaks a word that genuinely cannot
  // fit the line, so ordinary Arabic prose is untouched. It is the same value
  // study.css already uses for `.badge__title`, `.lesson-row__title` and
  // `.attempt-row__title`.
  //
  // The one thing to know about `anywhere` over `break-word`: it IS considered
  // when computing min-content size, so a RichText block inside a flex or grid
  // item can now shrink narrower than its longest word. Every call site was
  // checked — each is full-width or sits in a `min-w-0` column — and
  // admin/quiz/item-analysis-table.tsx passes `truncate`, where the
  // `white-space: nowrap` wins and this rule is inert.
  //
  // `clean` is a DOMPurify output, sanitized a second time against the same
  // allowlist the API's write-side sanitizer already enforced.
  return (
    <div
      className={`[overflow-wrap:anywhere] ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
