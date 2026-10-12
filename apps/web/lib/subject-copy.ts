import { copy } from '@ayman/contracts/copy';
import { isSubjectSlug, subjectNameAr } from '@ayman/contracts/subjects';
import { fillSubject, subjectCopy } from '@ayman/contracts/copy/subject';
import { tenantName } from '@/lib/tenant';
import { TEACHES_CODE, TENANT_SUBJECT } from '@/lib/tenant-subject';

/**
 * The gate for copy that names the SUBJECT — the same job
 * `lib/tenant-copy.ts` does for the instructor's name, asked about the other
 * half of a stack's identity.
 *
 * ## Why one helper and not a ternary per call site
 *
 * Thirty-odd strings across the title, the meta descriptions, the footer, the
 * about card, the link hub and the agent-facing files say «البرمجة وعلوم
 * الحاسب». A `TEACHES_CODE ? … : …` at each of them is thirty places to write
 * the neutral sentence inline, in a component, where `copy/` is the rule — and
 * thirty chances to forget the `{subject}` fill. So the neutral twins live in
 * `@ayman/contracts/copy/subject`, and every call site is one line:
 *
 *     bySubject(copy.site.tagline, subjectCopy.site.tagline)
 *
 * ## A programming stack returns before any of it runs
 *
 * `TEACHES_CODE` short-circuits on the first line, so Ayman's stack and the
 * first two instructors' get back the identical string object they passed in —
 * not a rebuilt one that happens to match. Nothing about their pages can be
 * changed by an edit to the neutral table.
 *
 * Client-safe on purpose: `lib/tenant-subject.ts` reads the key under
 * `next.config.ts`'s build-time inlining, and the subject list is twenty lines
 * with no dependencies, so `'use client'` trees (`brand-lockup.tsx`,
 * `year-tracks.tsx`) call this exactly as server components do.
 *
 * A NEW module rather than more exports on `lib/tenant-copy.ts`, for the
 * Turbopack reason `lib/tenant-subject.ts` gives.
 */

/**
 * The slug this stack's copy is about. A programming stack is `programming_cs`
 * whatever the environment says — `TEACHES_CODE` already decided that, and
 * Ayman's stack with a stray `TENANT_SUBJECT` must not start naming physics in
 * the one place (`/AGENTS.md`'s audience line on another programming stack)
 * that names the subject on both kinds of stack.
 */
const STACK_SUBJECT = TEACHES_CODE ? 'programming_cs' : TENANT_SUBJECT;

/**
 * The subject's Arabic name, with its article: «الفيزياء», «اللغة العربية».
 *
 * An unknown slug is «المادة», not the default subject's name — which is what
 * `subjectNameAr` would answer, and which would title a mistyped physics stack
 * «البرمجة وعلوم الحاسب» while every programming tool on it was gone.
 */
export const SUBJECT_NAME_AR: string = isSubjectSlug(STACK_SUBJECT)
  ? subjectNameAr(STACK_SUBJECT)
  : subjectCopy.unknownSubject;

/**
 * The programming sentence on a programming stack; its neutral twin, with the
 * subject filled in, everywhere else.
 *
 * `vars` fills any other hole the twin carries (`{name}`, `{year}`, …). They
 * are applied to the neutral template only: the programming original is
 * returned untouched, so a caller that also passes it through `formatCopy` or
 * `tenantSentence` afterwards sees exactly what it saw before this existed.
 */
export function bySubject(
  programming: string,
  neutral: string,
  vars: Readonly<Record<string, string>> = {},
): string {
  if (TEACHES_CODE) return programming;
  return fillSubject(neutral, { subject: SUBJECT_NAME_AR, ...vars });
}

/** `bySubject` over a list — the ai-catalog's query arrays. */
export function bySubjectList(
  programming: readonly string[],
  neutral: readonly string[],
): readonly string[] {
  if (TEACHES_CODE) return programming;
  return neutral.map((line) => fillSubject(line, { subject: SUBJECT_NAME_AR }));
}

/**
 * `copy.site.tagline` through the gate — the one subject line with the most
 * readers: under every wordmark (the footer, the nav fallback, the signed-in
 * brand lockup), in the root `<title>` and description, in the manifest, the
 * JSON-LD `slogan`, `/llms.txt` and the assistant's prompt.
 *
 * Resolved once here rather than at each of those nine reads, so a page whose
 * footer and `<title>` both carry it cannot say two different subjects.
 */
export const SITE_TAGLINE = bySubject(copy.site.tagline, subjectCopy.site.tagline);

/**
 * The glyph a mark shows when there is no picture at all — the signed-in brand
 * lockup and the portrait stand-in on the about card.
 *
 * `</>` is a programmer's monogram and stays one on every stack that teaches
 * code. On any other stack it was the DEFAULT mark (his photograph is gated
 * away, see `brand-lockup.tsx`), so a chemistry teacher's students signed in
 * under a code bracket. The initial of the stack's own name is the answer
 * `<MarkFallback>` in `media-slot.tsx` already gives the marketing nav.
 */
export const STACK_MONOGRAM = TEACHES_CODE ? '</>' : tenantName(copy.site.name).trim().charAt(0);
