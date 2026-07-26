import sanitizeHtml from 'sanitize-html';

/**
 * A tight allowlist, deliberately smaller than "what a WYSIWYG can emit".
 * Anything not on this list is discarded, and the burden of proof is on the
 * tag: we add one when a lesson genuinely needs it, not in anticipation.
 *
 * `iframe` is ABSENT and stays absent. Video embeds go through
 * lesson_videos.external_id, which is an 11-character id validated by a regex
 * and a database CHECK. An HTML iframe would be a second, unvalidated embed
 * path — exactly the kind of parallel road that gets forgotten in review.
 */
export const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'em', 'u',
    'ul', 'ol', 'li',
    'h2', 'h3',
    'blockquote', 'code', 'pre',
    'a',
  ],
  // Only anchors carry attributes. No `style`, no `class`, no `id`, no `on*`.
  allowedAttributes: { a: ['href', 'title', 'rel', 'target'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href'],
  // `//evil.example` inherits the page scheme and is a real phishing vector.
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  /**
   * For these tags, drop the CONTENTS too rather than surfacing them as text.
   * Without `iframe` here, `<iframe>fallback</iframe>` would leak "fallback"
   * into the document; without `style`, a stylesheet would render as prose.
   */
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'iframe'],
  enforceHtmlBoundary: true,
  transformTags: {
    /**
     * Forced, not defaulted. An author-supplied `rel="opener"` is overwritten,
     * because `target="_blank"` without `noopener` hands the opened page a
     * `window.opener` handle back into ours. sanitize-html applies scheme and
     * attribute filtering AFTER this transform, so a `javascript:` href that
     * survives to here is still removed.
     */
    a: (_tagName, attribs) => ({
      tagName: 'a',
      attribs: { ...attribs, rel: 'noopener noreferrer nofollow', target: '_blank' },
    }),
  },
};

/**
 * The single write-side sanitizer. Every path that persists lesson_texts.body_html
 * calls this; nothing writes raw editor output. A second DOMPurify pass runs at
 * render (apps/web/components/content/rich-text.tsx) because defence in depth is
 * cheap here and a single sanitizer is a single point of failure.
 */
export function sanitizeRichText(input: string): string {
  return sanitizeHtml(input, RICH_TEXT_OPTIONS);
}
