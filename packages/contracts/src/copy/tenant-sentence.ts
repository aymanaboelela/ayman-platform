import { copy } from './ar';

/**
 * The substitution itself, with no opinion about which stack is running.
 *
 * ## Why it lives in `contracts` and not beside a gate
 *
 * There are two gates — `apps/web/lib/tenant-copy.ts` for anything a page
 * renders, and `apps/api/src/common/tenant-copy.ts` for the answers المساعد
 * composes on the server — and they cannot share a module: the web one is
 * `@/lib/*` under Next's build-time env inlining, the API one boots from Nest.
 * The repo's answer to that split is normally to state the rule twice (see the
 * two `tenant.ts` files), and that is fine for six lines of `process.env`.
 *
 * It is NOT fine here. What would be duplicated is not a rule, it is a
 * SEARCH — an ordered list of spellings and the loop that walks it — and the
 * failure mode of two copies drifting is silent by construction: the copy that
 * lost a form does not throw, it hands the sentence back with the name still
 * in it. Exactly the shape of the leak this whole module exists to close. So
 * the search lives once, in the package that owns the name in the first place,
 * and each side wraps it with its own `IS_AYMAN` / `TENANT_DISPLAY_NAME`.
 *
 * Nothing here reads `process.env`, which is the reason it CAN live in
 * `contracts`: the package is imported by scripts and by the edge, and a
 * module that decided the tenant would decide it at the wrong moment.
 */

/**
 * Every spelling to look for, longest first.
 *
 * ⚠️ THE ORDER IS LOAD-BEARING, and the copy table's `nameForms` docblock
 * explains what each form is for. Sorting here rather than trusting the table
 * to stay sorted means a form appended to the end of that list still matches
 * in the right order — and «المهندس أيمن أبو العلا» must be consumed before
 * «أيمن أبو العلا», which must be consumed before «أيمن», or a swap leaves a
 * fragment of the old name sitting in front of the new one.
 */
export const INSTRUCTOR_NAME_FORMS: readonly string[] = [...copy.site.nameForms].sort(
  (a, b) => b.length - a.length,
);

/**
 * One sentence with every known spelling of the instructor's name replaced.
 *
 * `split`/`join` rather than `replace`: the needles are data from the copy
 * table, and `replace` with a string needle swaps only the FIRST match —
 * `landing.aboutPageDescription` opens with «مين أيمن أبو العلا؟» and names
 * him again further in.
 *
 * ⚠️ It can only find the spellings `nameForms` publishes. A sentence that
 * writes the name some other way passes through untouched and leaks silently,
 * because nothing here can fail loudly. That is what `tenant-copy.test.ts` and
 * the consumer sweep in `tenant-identity-leak.spec.ts` are for: the first
 * checks the swap against THE REAL STRINGS the call sites pass, the second
 * refuses to let a call site exist without passing through a gate at all.
 */
export function swapInstructorName(sentence: string, replacement: string): string {
  let out = sentence;
  for (const form of INSTRUCTOR_NAME_FORMS) out = out.split(form).join(replacement);
  return joinLam(out, replacement);
}

/**
 * «لالمنصة» → «للمنصة», and «للالمنصة» → «للمنصة» too.
 *
 * The copy glues the preposition straight onto the name, and it does so in TWO
 * spellings, because Arabic writes ل + a definite noun as a single «لل» with
 * the alif dropped:
 *
 *     «بوصّلك لأيمن»            ل + a bare proper noun  → the form starts at «أ»
 *     «رسالة للمهندس أيمن»      ل + «المهندس أيمن»      → the form starts at «م»
 *
 * The second one is the trap. `nameForms` carries «مهندس أيمن», not
 * «المهندس أيمن», so the match begins AFTER the elided article and the swap
 * leaves both lams sitting in front of whatever went in. Neither result is a
 * word: «لل» + «المنصة» reads «لللمنصة» once the first rule below has had its
 * turn, and «لل» + «محمد صبري» reads «للمحمد صبري».
 *
 * So each case is put back the way it is actually written — ل + a definite
 * replacement is one «لل», ل + an indefinite one is a single «ل»:
 *
 *     لل + المنصة       → للمنصة
 *     لل + محمد صبري    → لمحمد صبري
 *     ل  + المنصة       → للمنصة
 *     ل  + محمد صبري    → لمحمد صبري      (already right, nothing to do)
 *
 * ⚠️ THE «لل» RULE RUNS FIRST AND HAS TO. «لل» + «المنصة» spelled out is
 * «للالمنصة», which CONTAINS «لالمنصة» — run the bare rule first and it eats
 * the inner half, leaving «لللمنصة» with no «لل»+replacement left for the
 * second rule to find. Reversed, the two cannot collide: «للمنصة» contains no
 * «لالمنصة».
 *
 * Only a «ل» sitting IMMEDIATELY before the string this function just inserted
 * is touched, so nothing else in the sentence can be caught by it — a space
 * between the two is a different word and is left alone, and the needles all
 * end in the replacement, which the Arabic copy table never contains on its
 * own.
 *
 * `course.lockedError` («الكورس ده مقفول دلوقتي. رسالة للمهندس أيمن وهيفتحه»)
 * is the only string in the table written the elided way today, and nothing
 * renders it — the 403 branch that did now opens `<SubscribePanel>` instead.
 * It is handled anyway because the consumer sweep in
 * `tenant-identity-leak.spec.ts` will REQUIRE whoever wires it up next to wrap
 * it in a gate, and a gate that hands them «لللمنصة» is worse than none.
 */
function joinLam(sentence: string, replacement: string): string {
  const definite = replacement.startsWith('ال');
  const out = sentence
    .split(`لل${replacement}`)
    .join(`ل${definite ? replacement.slice(1) : replacement}`);
  if (!definite) return out;
  return out.split(`ل${replacement}`).join(`ل${replacement.slice(1)}`);
}
