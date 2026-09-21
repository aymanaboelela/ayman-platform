import { copy } from '@ayman/contracts/copy';
import { swapInstructorName } from '@ayman/contracts/copy/tenant-sentence';
import { IS_AYMAN, tenantName } from './tenant';

/**
 * The server-side half of `apps/web/lib/tenant-copy.ts` — a whole SENTENCE
 * from the copy table, with his name swapped for this deployment's.
 *
 * ## Why the API needed one of its own
 *
 * `tenantName()` alone was enough for everything the API printed until
 * المساعد's corpus was looked at properly. That corpus is not names; it is
 * paragraphs a human wrote, with the name welded into the middle of them —
 * «الأسئلة المقالية بيصحّحها أيمن بنفسه», «رسالة لأيمن ومعاها اسم الدرس» —
 * and `assistant-knowledge.ts` handed all of them to the model, and to the
 * corpus-only fallback path, exactly as written.
 *
 * That is the worst place in the product for this to happen. Everywhere else
 * a leaked name is a line of page copy somebody can proof-read; here it is an
 * ANSWER, stated as fact, in the platform's own voice, to a student who asked
 * a question — and on a stack with no model key `matchKnowledge` returns the
 * paragraph verbatim, so there is not even a paraphrase between the table and
 * the student.
 *
 * ## Why it does not import the web's module
 *
 * Same reason `tenant.ts` is stated twice: `@/lib/*` is inside the Next app
 * and reads `process.env` under build-time inlining. What is NOT duplicated is
 * the search — the ordered list of spellings and the loop over it live once,
 * in `@ayman/contracts/copy/tenant-sentence`, because two copies of a list
 * that drift do not throw; they hand the sentence back with the name in it.
 */
export function tenantSentence(sentence: string): string {
  if (IS_AYMAN) return sentence;
  return swapInstructorName(sentence, tenantName(copy.site.name));
}
