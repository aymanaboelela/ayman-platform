import 'server-only';
import DOMPurify from 'isomorphic-dompurify';
import { richTextSanitizeOptions } from './sanitize-options';

/**
 * The SECOND sanitization pass, as a function rather than as a component.
 *
 * The first pass ran on write (apps/api's `sanitizeRichText`), so the row in
 * Postgres is already clean. This exists because a single sanitizer is a
 * single point of failure, and because rows written before a future allowlist
 * change would otherwise render under the old rules. None of that changes
 * here; only WHERE it runs does.
 *
 * ## Why `server-only`, and what it was protecting against
 *
 * `RichText` used to carry this inline and its docblock stated, in good faith,
 * "This is a Server Component: DOMPurify and its jsdom dependency never reach
 * the browser". That had stopped being true. Five `'use client'` modules import
 * `RichText` — `question-view`, `ordering-list`, `text-lesson`, `video-lesson`,
 * and `review-question` transitively through `review-list` — so Next pulled the
 * whole thing across the boundary, `isomorphic-dompurify` resolved through its
 * package.json `browser` condition to plain `dompurify`, and the built output
 * proved it: **28,635 bytes** in one client chunk, listed in the client
 * reference manifest of `/courses/[slug]/lessons/[lessonId]`,
 * `/quizzes/[lessonId]/attempt/[attemptId]` and its `/review` — the three
 * routes a student spends the most time on and the exact pages reported as
 * «بيلاج وأنا بحل الامتحان».
 *
 * Worse than the bytes was the CPU. `DOMPurify.sanitize()` builds a DOM, walks
 * it and serialises it back, and it was called in RENDER: once for the stem and
 * once per option, on every keystroke and every selection, because `QuizRunner`
 * holds the answers at the top of the tree. A twenty-question paper on the
 * review screen paid it (1 + N) × 20 on mount and again on every toggle.
 *
 * `import 'server-only'` is the part that keeps it fixed. A comment saying
 * "this never reaches the browser" is a claim; this is a build error. The next
 * client component that reaches for a sanitizer fails to compile instead of
 * quietly adding 28 KB back.
 *
 * ## What callers do instead
 *
 * Sanitize once, on the server, at the data boundary — the page that already
 * parses the payload through Zod — and pass the clean string to
 * `<SafeHtml>`, which renders it and nothing else. Server components can keep
 * using `<RichText>`, which is this function and that component together.
 */
export function sanitizeRichText(html: string): string {
  return DOMPurify.sanitize(html, richTextSanitizeOptions());
}
