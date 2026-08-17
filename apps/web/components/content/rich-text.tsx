import { sanitizeRichText } from '@/lib/sanitize-html';
import { SafeHtml } from './safe-html';

/**
 * Sanitize-then-render, for SERVER components.
 *
 * This is the shape the component always had; the two halves it was built from
 * are now separable, and that is the whole change:
 *
 *   · `sanitizeRichText` (`@/lib/sanitize-html`) is `server-only`. It carries
 *     `isomorphic-dompurify`, which is 28 KB in a browser bundle and does real
 *     DOM work on every call.
 *   · `SafeHtml` (`./safe-html`) renders an already-clean string and owns the
 *     wrap rule. It is a plain function with no imports.
 *
 * A client component that needs to display rich text takes `SafeHtml` and is
 * handed markup its page sanitized once. It cannot take this component: the
 * `server-only` import is a build error, which is the point — the previous
 * version of this file claimed in a comment that DOMPurify never reached the
 * browser, and five `'use client'` modules had been importing it for months.
 * See `sanitize-html.ts` for the measurement and the symptom.
 *
 * ⚠️ Not `async`, and it must not become so. Several callers render it inside
 * markup that is otherwise synchronous, and `sanitizeRichText` is a pure CPU
 * call — awaiting it would buy nothing and cost every one of them a Suspense
 * boundary.
 */
export function RichText({ html, className }: { html: string; className?: string }) {
  return <SafeHtml html={sanitizeRichText(html)} className={className} />;
}
