/**
 * The translation between what a question STORES and what its editor SHOWS.
 *
 * `stemHtml`, `bodyHtml` and `generalFeedbackHtml` are HTML columns — the
 * student sees them through `RichText`, which sanitizes and injects them as
 * markup. Every read-only admin surface already strips that markup before
 * showing it (`stripHtml` in slot-list.tsx and add-slot-dialog.tsx); the
 * EDITOR was the one place that bound the raw column straight into a form
 * field, so an instructor opening an imported question was shown
 * `<p>Storage ثم RAM ثم Cache ثم CPU</p>` and asked to edit that.
 *
 * On an Arabic page that is worse than merely ugly. The tags are Latin, the
 * content is Arabic, and the bidi algorithm reorders the two runs against each
 * other — so the `<p>` and `</p>` land INSIDE the sentence and the instructor
 * genuinely cannot tell where the text begins, ends, or which way an ordering
 * question reads. The fix is not to style the field: it is to stop putting
 * markup in it.
 *
 * Nothing here sanitizes. `sanitizeRichText` on the API still runs on every
 * write and is the security boundary; this module only decides how a value is
 * SHOWN to the person editing it.
 */

/** `<p>`, `</p>`, `<br>`, `<br/>`, `<br />` — the tags plain text can produce. */
const PARAGRAPH_TAG = /^<\/?(?:p|br)\s*\/?>$/i;
const ANY_TAG = /<[^>]+>/g;

/**
 * A `<` that opens a tag: one followed by a letter, a slash or a bang. A bare
 * `<` with a space or digit after it is a comparison sign, which is ordinary
 * content on a computer-science platform («لو س < 5») and must be escaped
 * rather than passed through as markup.
 */
const MARKUP = /<[a-z!/]/i;

/** True when the value carries markup we must persist verbatim. */
export function isMarkup(value: string): boolean {
  return MARKUP.test(value);
}

/** True when every tag present is one `plainTextToHtml` itself emits. */
function isParagraphOnly(html: string): boolean {
  return (html.match(ANY_TAG) ?? []).every((tag) => PARAGRAPH_TAG.test(tag));
}

/**
 * Text the instructor typed → the paragraph markup the column stores.
 *
 * One paragraph per line, blank lines dropped: `<p></p>` renders as a stray
 * gap and would satisfy the schema's `.min(1)` while carrying no question at
 * all. Text that is entirely whitespace therefore returns '', which is exactly
 * what makes `copy.quizErrors.stemRequired` fire.
 */
export function plainTextToHtml(text: string): string {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => `<p>${escapeText(line)}</p>`)
    .join('');
}

function escapeText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/**
 * The stored markup → the text to put in a form field.
 *
 * `&amp;` is decoded LAST: doing it first would turn the `&amp;lt;` an
 * instructor typed as a literal `&lt;` into a `<`, inventing markup out of
 * their content.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(ANY_TAG, '')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replace(/\n+$/, '');
}

/**
 * What the editor field shows for a stored value.
 *
 * Paragraph-only markup — everything the bulk importer, the seed and this form
 * itself produce — is unwrapped to its text. Anything richer is handed back
 * untouched: unwrapping a `<strong>` or an `<a>` would show the instructor a
 * sentence that quietly loses its emphasis or its link the moment they save.
 */
export function htmlToEditable(html: string): string {
  return isParagraphOnly(html) ? htmlToPlainText(html) : html;
}

/**
 * What a form field's value becomes on the way to the API.
 *
 * The inverse of `htmlToEditable` by construction: a field still holding the
 * rich markup it was shown passes through unchanged, so saving a question
 * nobody edited never rewrites it.
 */
export function editableToHtml(value: string): string {
  return isMarkup(value) ? value : plainTextToHtml(value);
}
