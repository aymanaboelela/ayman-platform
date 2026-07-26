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

  // `clean` is a DOMPurify output, sanitized a second time against the same
  // allowlist the API's write-side sanitizer already enforced.
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}
