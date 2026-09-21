import { copy } from '@ayman/contracts/copy';
import { swapInstructorName } from '@ayman/contracts/copy/tenant-sentence';
import { IS_AYMAN, tenantName } from '@/lib/tenant';

/**
 * The gate for copy that was written AROUND his name instead of next to it.
 *
 * ## Why `tenantName()` is not enough on its own
 *
 * `tenantName(fallback)` swaps a whole string, and that is the right shape for
 * the places the name IS the string — a wordmark, an `<h1>` that is a profile
 * card's subject, an `aria-label` on a brand link. Half the leaks left on the
 * public pages are not that shape. They are sentences with the name welded
 * into the middle of them, and there is nothing for a whole-string swap to
 * return:
 *
 *   · «بياناتك محفوظة عند أيمن أبو العلا وبس، ومابتتباعش ولا بتتشارك مع حد.»
 *   · «مين أيمن أبو العلا؟ مهندس بيدرّس البرمجة وعلوم الحاسب…»
 *   · «ليه أذاكر البرمجة والذكاء الاصطناعي مع أيمن أبو العلا بالذات؟»
 *
 * `lib/seo/metadata.ts` hit this first and answered it by COMPOSING a
 * replacement sentence for `SITE_DESCRIPTION` — which is right there, because
 * a meta description has a fixed job and a one-clause substitute does it. It
 * does not generalise to the six strings above: composing each of them by hand
 * means six Arabic sentences living in six components, each a second copy of a
 * line that already exists in `copy/ar.ts` and each free to drift from it the
 * next time an editor rewrites the original. The privacy note is the one that
 * makes that unacceptable — it is a legal disclosure, it was written after
 * Google flagged the domain under «الصفحات المضلّلة», and a stale second copy
 * of it is a promise nobody proof-read.
 *
 * So the sentence stays in the copy table, exactly once, and the NAME inside it
 * is swapped on the way out.
 *
 * ## His stack returns before any of it runs
 *
 * `IS_AYMAN` short-circuits on the first line, so his deployment hands back the
 * identical string object it was given — not a rebuilt one that happens to
 * match. That is deliberate belt and braces: the replacement below is a no-op
 * on his stack by construction anyway (`tenantName(x)` IS `x` there), and the
 * early return means no future edit to `nameForms` can make that stop being
 * true for him.
 *
 * ## ⚠️ IT ONLY SWAPS THE SPELLINGS `copy.site.nameForms` LISTS
 *
 * This is a substring replacement over a list, and a sentence that spells the
 * name some way the list does not carry passes through untouched and leaks
 * silently, because nothing here can fail loudly. That is not a hypothetical:
 * the list held three WORDMARK forms for a year — «أيمن أبو العلا» and its two
 * dressed-up cousins — while the copy students actually read says «بوصّلك
 * لأيمن» and «عند مهندس أيمن للتصحيح». Thirty-odd sentences ran through this
 * function, matched nothing, and rendered his name on somebody else's domain.
 * The honorific and bare-first-name forms were added to `copy.site.nameForms`
 * because of it; its docblock is where the reasoning lives.
 *
 * Two checks stand behind that, and they answer different questions.
 * `tenant-copy.test.ts` asks whether the swap WORKS, against the exact strings
 * the call sites pass rather than invented input. The consumer sweep in
 * `packages/contracts/src/tenant-identity-leak.spec.ts` asks the other half —
 * whether a call site exists that never calls this at all — by deriving every
 * copy key whose value carries the name and failing on any read of one that is
 * not wrapped in a gate. The first cannot see a missing call site; the second
 * cannot see a missing spelling.
 */

/**
 * One sentence from the copy table, with his name swapped for this
 * deployment's.
 *
 * Returns the argument untouched on his stack. Anywhere else every spelling
 * `copy.site.nameForms` publishes becomes `TENANT_DISPLAY_NAME`, or «المنصة»
 * when a deployment has not set one — the same two answers `tenantName()`
 * gives, so a page that mixes the two calls cannot end up saying two different
 * names.
 *
 * The ordered list and the loop itself live in
 * `@ayman/contracts/copy/tenant-sentence`, shared with the API's gate. What
 * stays here is the only thing that differs between the two: which stack this
 * is.
 */
export function tenantSentence(sentence: string): string {
  if (IS_AYMAN) return sentence;
  return swapInstructorName(sentence, tenantName(copy.site.name), copy.site.nameForms);
}

/**
 * The same swap over a question/answer pair, for `copy.landing.aboutFaq`.
 *
 * It exists because that array is rendered TWICE from one page — as visible
 * rows by `<SiteFaq>` and as `FAQPage` structured data by `faqPageJsonLd()` —
 * and `/about` carries a warning in as many words that the two must be handed
 * the SAME list. Mapping in one place is what keeps a search result from
 * quoting a question the page no longer asks.
 */
export function tenantFaq(
  rows: readonly { questionAr: string; answerAr: string }[],
): { questionAr: string; answerAr: string }[] {
  return rows.map((row) => ({
    questionAr: tenantSentence(row.questionAr),
    answerAr: tenantSentence(row.answerAr),
  }));
}
