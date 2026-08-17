/**
 * Renders markup that has ALREADY been sanitized. It does no sanitizing of its
 * own, deliberately — see `@/lib/sanitize-html`.
 *
 * ⚠️ `html` must have come from `sanitizeRichText`. Nothing here checks, and
 * nothing can: this component exists precisely so that the sanitizer does not
 * have to be reachable from the browser, which means it cannot run here. Every
 * caller is a client component whose props were produced by a Server Component
 * that parsed the payload through Zod and sanitized it in the same breath.
 *
 * No `'use client'` directive and no imports: it is a plain function, so it
 * compiles into whichever graph imports it and adds nothing to either.
 *
 * ## The wrap rule
 *
 * Lives HERE, not at the call sites, because the sanitizer's allowlist is what
 * creates the hazard: `<a>` and `<code>` are permitted, so an instructor can
 * paste a Drive or YouTube URL as its own link text, or write an inline
 * `<code>ArrayIndexOutOfBoundsException</code>` — routine on a computer-science
 * platform with a Python playground. Either is one ~60-character unbreakable
 * Latin run, ~450px at 15px, against a ~288px column on a 360px phone.
 * globals.css gives `pre` an `overflow-x: auto` so FENCED code is safe; inline
 * `<code>` and a bare `<a>` are not. And because globals.css:105-108 sets
 * `html, body { overflow-x: clip }`, the page will not scroll to reveal the
 * overflow — the run is simply cut at the viewport edge. In an RTL line box the
 * LTR run starts at the inline-start (right) edge and extends past the LEFT
 * one, so it is the BEGINNING of the token that disappears: the student sees
 * the tail of a URL and no way to reach the head of it.
 *
 * `anywhere`, not `break-all`: it only breaks a word that genuinely cannot fit
 * the line, so ordinary Arabic prose is untouched. It is the same value
 * study.css already uses for `.badge__title`, `.lesson-row__title` and
 * `.attempt-row__title`.
 *
 * The one thing to know about `anywhere` over `break-word`: it IS considered
 * when computing min-content size, so a block inside a flex or grid item can
 * shrink narrower than its longest word. Every call site was checked — each is
 * full-width or sits in a `min-w-0` column — and
 * admin/quiz/item-analysis-table.tsx passes `truncate`, where the
 * `white-space: nowrap` wins and this rule is inert.
 */
export function SafeHtml({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={`[overflow-wrap:anywhere] ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
