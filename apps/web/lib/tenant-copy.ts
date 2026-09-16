import { copy } from '@ayman/contracts/copy';
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
 * early return means no future edit to `NAME_FORMS` can make that stop being
 * true for him.
 *
 * ## ⚠️ IT ONLY SWAPS THE SPELLINGS IT KNOWS
 *
 * This is a substring replacement over the three name forms the copy table
 * itself publishes. A sentence that spells the name any other way — the
 * hamza-less «ايمن ابو العلا» that `ai-catalog.json` carries for search, a
 * first name on its own, a Latin transliteration — passes through untouched
 * and leaks silently, because nothing here can fail loudly.
 *
 * That is why `tenant-copy.test.ts` does not test this function against
 * invented input. It tests it against THE EXACT STRINGS the call sites pass —
 * the privacy note, the link-hub description, the `/about` title and FAQ — and
 * asserts that no form of the name survives in any of them. Adding a call site
 * means adding its string to that list; if the sentence spells him differently,
 * the test goes red instead of the page going wrong.
 */

/**
 * Every form of the name the copy table publishes, longest first.
 *
 * ⚠️ THE ORDER IS LOAD-BEARING. «منصة أيمن أبو العلا» and «المهندس أيمن أبو
 * العلا» both CONTAIN «أيمن أبو العلا», so replacing the bare name first would
 * leave «منصة محمد حسن» sitting behind the word «منصة» that was already there
 * — «منصة منصة محمد حسن» — and would leave «المهندس» stranded in front of a
 * name that is not an engineer's. Sorting by length descending means the most
 * specific form always matches first, and it keeps working when a fourth form
 * is added to `copy.site`.
 */
const NAME_FORMS: readonly string[] = [
  copy.site.platformName,
  copy.site.instructor,
  copy.site.name,
].sort((a, b) => b.length - a.length);

/**
 * One sentence from the copy table, with his name swapped for this
 * deployment's.
 *
 * Returns the argument untouched on his stack. Anywhere else every known form
 * of the name becomes `TENANT_DISPLAY_NAME`, or «المنصة» when a deployment has
 * not set one — the same two answers `tenantName()` gives, so a page that mixes
 * the two calls cannot end up saying two different names.
 */
export function tenantSentence(sentence: string): string {
  if (IS_AYMAN) return sentence;
  let out = sentence;
  for (const form of NAME_FORMS) {
    // `split`/`join` rather than `replaceAll`: the forms are data from the copy
    // table, and `replace` with a string needle only swaps the FIRST match —
    // `aboutPageDescription` opens with «مين أيمن أبو العلا؟» and names him
    // again further in.
    out = out.split(form).join(tenantName(form));
  }
  return out;
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
