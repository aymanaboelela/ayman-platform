/**
 * The allowlist. ONE of them, for every sanitizer pass in the web app.
 *
 * It lives in its own module — with no `server-only` and no imports — because
 * it has exactly two consumers and they are on opposite sides of the client
 * boundary:
 *
 *   · `lib/sanitize-html.ts`, which is `server-only` and does all the ordinary
 *     work: every piece of markup that arrives from the API is sanitized on the
 *     server, once, before it crosses to the browser.
 *   · `components/admin/quiz/bulk-import-dialog.tsx`, which cannot use that one
 *     and says so at its call site — it renders a preview of HTML that
 *     `parseQuestionBlocks` produced in the BROWSER from text the instructor
 *     has just pasted, so there is no server in the loop to sanitize it.
 *
 * Two copies of an allowlist is how one of them quietly stops matching the
 * other. Being a plain module with no imports is what makes a single copy
 * possible across that boundary.
 *
 * ## Why a function and not a constant
 *
 * DOMPurify's `Config` types its lists as mutable `string[]`, so a shared
 * `as const` object does not type-check and a shared mutable one would hand
 * every caller a reference to the same arrays. A sanitizer whose allowlist
 * another module can `push()` into is not an allowlist. Each call gets its own.
 */
export function richTextSanitizeOptions() {
  return {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'h2', 'h3', 'blockquote', 'code', 'pre', 'a'],
    ALLOWED_ATTR: ['href', 'title', 'rel', 'target'],
    // Belt and braces: even if the tag list above ever widens, these stay out.
    FORBID_TAGS: ['iframe', 'script', 'style', 'object', 'embed', 'form'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  };
}
