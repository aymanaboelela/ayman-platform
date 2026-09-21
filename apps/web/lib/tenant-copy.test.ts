import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy';

/**
 * `tenantSentence()` swaps the spellings it knows and nothing else, so the only
 * assertion worth making is against THE REAL STRINGS the call sites hand it.
 *
 * A test built on invented input («… أيمن أبو العلا …») would pass forever while
 * the privacy note quietly started spelling him some other way. Every string
 * below is read out of `copy` at the same path the component reads it, so
 * rewording any of them in `copy/ar.ts` re-runs this check against the new
 * wording — which is the only thing standing between a reworded sentence and a
 * stranger's name on a legal disclosure.
 *
 * `IS_AYMAN` is decided at MODULE LOAD, so each case resets the registry and
 * re-imports — the same shape `home-blocks-tenant.test.ts` uses.
 */
const KEYS = ['TENANT_KEY', 'TENANT_DISPLAY_NAME'] as const;

async function loadWith(env: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  vi.resetModules();
  return import('./tenant-copy');
}

let saved: Partial<Record<(typeof KEYS)[number], string | undefined>>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
});

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

/** A second instructor's stack, configured the way `deploy/tenant.env.example` says to. */
const OTHER = { TENANT_KEY: 'mohamed-sabry', TENANT_DISPLAY_NAME: 'منصة محمد صبري' };

/**
 * EVERY sentence in the copy table that carries his name, found by walking the
 * table rather than by listing paths.
 *
 * ## The hand-kept list this replaces, and what it cost
 *
 * There were five entries here — the privacy note, two link-hub strings and
 * two `/about` strings — under a warning reading «⚠️ ADD A LINE HERE WHEN YOU
 * ADD A CALL SITE». Nobody did. The assistant, the quiz results, the homework
 * card, the notification feed, the course meta description and the three
 * agent-facing markdown documents were all gated or written afterwards, and
 * none of their sentences were ever checked by anything. The list was accurate
 * about the five and silent about the rest, which is the failure mode of every
 * inventory somebody has to remember to update.
 *
 * So it is derived. A string that gains the name joins this set the same day,
 * a string that loses it leaves, and the only way to be missing from it is to
 * not contain the name at all.
 *
 * ## What this proves and what it does not
 *
 * It proves the SWAP works — that `nameForms` knows every spelling the table
 * actually uses. It cannot prove a call site calls it; nothing on the web side
 * can see that. The consumer sweep in
 * `packages/contracts/src/tenant-identity-leak.spec.ts` is the other half, and
 * it fails on a read that never reaches this function at all.
 */
const NAMED_SENTENCES: readonly { where: string; text: string }[] = (function collect(
  node: unknown,
  path: string[],
): { where: string; text: string }[] {
  if (typeof node === 'string') {
    return /أيمن/.test(node) ? [{ where: path.join('.'), text: node }] : [];
  }
  if (node === null || typeof node !== 'object') return [];
  return Object.entries(node).flatMap(([key, value]) => collect(value, [...path, key]));
})(copy, []);

/**
 * The needles, derived from the copy table rather than typed out.
 *
 * The bare first word («أيمن») is the strict one and the reason this is not
 * just `includes(copy.site.name)`: a sentence that says «مع أيمن» with no
 * surname would sail past a full-name check and still name him. Typing the
 * needles as literals instead would put them in this file, and
 * `tenant-identity-leak.spec.ts` skips test files — so the value would be
 * legal here and unverified everywhere.
 */
const NAME_NEEDLES = [
  copy.site.platformName,
  copy.site.instructor,
  copy.site.name,
  copy.site.name.split(' ')[0] ?? copy.site.name,
];

describe('tenantSentence on Ayman’s own stack', () => {
  it('hands every sentence back untouched', async () => {
    const { tenantSentence } = await loadWith({});
    for (const { where, text } of NAMED_SENTENCES) {
      expect(tenantSentence(text), where).toBe(text);
    }
  });

  it('hands the /about FAQ back row for row', async () => {
    const { tenantFaq } = await loadWith({});
    expect(tenantFaq(copy.landing.aboutFaq)).toEqual(
      copy.landing.aboutFaq.map((row) => ({ questionAr: row.questionAr, answerAr: row.answerAr })),
    );
  });
});

describe('tenantSentence on any other stack', () => {
  it('leaves no spelling of the name in any gated sentence', async () => {
    const { tenantSentence } = await loadWith(OTHER);
    for (const { where, text } of NAMED_SENTENCES) {
      const rendered = tenantSentence(text);
      for (const needle of NAME_NEEDLES) {
        expect(
          rendered.includes(needle),
          `${where} still says «${needle}» — the sentence spells the name in a ` +
            `form NAME_FORMS does not carry, so the swap missed it: ${rendered}`,
        ).toBe(false);
      }
    }
  });

  it('leaves no spelling of the name in the /about FAQ, question or answer', async () => {
    const { tenantFaq } = await loadWith(OTHER);
    for (const row of tenantFaq(copy.landing.aboutFaq)) {
      for (const needle of NAME_NEEDLES) {
        expect(row.questionAr.includes(needle), row.questionAr).toBe(false);
        expect(row.answerAr.includes(needle), row.answerAr).toBe(false);
      }
    }
  });

  it('prints the deployment’s own name in the privacy promise', async () => {
    // Not just "his name is gone" — the sentence still has to say whose the data
    // is. A disclosure that dropped the name would be a different, quieter bug.
    const { tenantSentence } = await loadWith(OTHER);
    expect(tenantSentence(copy.onboarding.privacyNote)).toContain(OTHER.TENANT_DISPLAY_NAME);
  });

  it('says «المنصة» when the deployment has not set a display name', async () => {
    const { tenantSentence } = await loadWith({ TENANT_KEY: 'mohamed-sabry' });
    const rendered = tenantSentence(copy.onboarding.privacyNote);
    expect(rendered).toContain('المنصة');
    for (const needle of NAME_NEEDLES) expect(rendered.includes(needle)).toBe(false);
  });

  it('leaves no honorific stranded in front of the new name', async () => {
    /*
     * The other half of «the swap worked»: it has to READ.
     *
     * The copy says «رد مهندس أيمن», «أكلّم م. أيمن», «منصة أ. أيمن أبو
     * العلا» — the title is part of the phrase, not decoration around it. A
     * list that knew only the bare first name would swap inside those and
     * leave «رد مهندس منصة محمد صبري»: grammatical nonsense, and a second
     * title in front of a display name that usually carries one already. That
     * is why `copy.site.nameForms` lists the honorific forms at all, and this
     * is that reasoning as an assertion rather than as a comment.
     */
    const { tenantSentence } = await loadWith(OTHER);
    const stranded = new RegExp(`(?:المهندس|مهندس|م\\.|أ\\.)\\s*${OTHER.TENANT_DISPLAY_NAME}`);
    for (const { where, text } of NAMED_SENTENCES) {
      const rendered = tenantSentence(text);
      expect(
        stranded.test(rendered),
        `${where} reads «${rendered}» — the honorific in front of the name was ` +
          `not part of the form that matched, so it is now a title attached to ` +
          `somebody else's. Add the whole phrase to copy.site.nameForms.`,
      ).toBe(false);
    }
  });

  it('does not double the preposition the copy glues onto the name', async () => {
    /*
     * The swap has to leave a WORD behind, and «ل» is the one letter in this
     * table that is written as part of the next one.
     *
     * Two spellings reach the swap. «بوصّلك لأيمن» is ل + a bare name, and
     * putting «المنصة» there writes «لالمنصة». «رسالة للمهندس أيمن» is ل +
     * «المهندس أيمن» with the alif already elided, and because `nameForms`
     * matches from «مهندس» onwards the swap lands INSIDE the «لل» and writes
     * «لللمنصة». The first was found and fixed; the second was still there,
     * behind the one string in the table nothing renders today.
     *
     * Asserted over every named sentence and for both replacement shapes — one
     * that carries the definite article and one that does not — because which
     * of the two a deployment gets is decided by whether an environment
     * variable was set.
     */
    for (const display of [OTHER.TENANT_DISPLAY_NAME, 'المنصة']) {
      const { tenantSentence } = await loadWith(
        display === 'المنصة' ? { TENANT_KEY: 'mohamed-sabry' } : OTHER,
      );
      for (const { where, text } of NAMED_SENTENCES) {
        const rendered = tenantSentence(text);
        for (const artefact of [`لل${display}`, ...(display.startsWith('ال') ? [`ل${display}`] : [])]) {
          expect(
            rendered.includes(artefact),
            `${where} reads «${rendered}» — the preposition was already glued to ` +
              `the old name and the replacement was dropped in behind it, so the ` +
              `sentence now carries «${artefact}», which is not a word.`,
          ).toBe(false);
        }
      }
    }
  });

  it('swaps the longest form first, so no fragment of the old name is left behind', async () => {
    /*
     * «منصة أيمن أبو العلا» CONTAINS «أيمن أبو العلا». Replacing the bare name
     * first would leave the «منصة» that was already there in front of a
     * display name that usually starts with «منصة» too — «منصة منصة محمد
     * صبري». This is the ordering in `NAME_FORMS` asserted as behaviour rather
     * than trusted as a comment.
     */
    const { tenantSentence } = await loadWith(OTHER);
    expect(tenantSentence(copy.site.platformName)).toBe(OTHER.TENANT_DISPLAY_NAME);
    expect(tenantSentence(copy.site.instructor)).toBe(OTHER.TENANT_DISPLAY_NAME);
  });
});
