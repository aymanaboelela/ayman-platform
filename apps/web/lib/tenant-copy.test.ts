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
 * Every sentence in this group that is rendered through the gate, at the path
 * its component reads it from.
 *
 * ⚠️ ADD A LINE HERE WHEN YOU ADD A CALL SITE. A sentence routed through
 * `tenantSentence()` and left off this list is a sentence nothing checks.
 */
const GATED_SENTENCES: readonly { where: string; text: string }[] = [
  // `components/onboarding/onboarding-form.tsx` — the privacy disclosure under
  // every step of the sign-up form. Ranked first here for the same reason it is
  // ranked first in the work: it is the only one that makes a PROMISE about
  // where a minor's phone number goes.
  { where: 'onboarding.privacyNote', text: copy.onboarding.privacyNote },
  // `app/(link)/links/page.tsx` — the `<meta name="description">` of the one URL
  // that goes in a bio, and the `/about` row's title on the same page.
  { where: 'linkhub.description', text: copy.linkhub.description },
  { where: 'linkhub.aboutTitle', text: copy.linkhub.aboutTitle },
  // `app/(site)/about/page.tsx` — the `<title>` and the meta description of the
  // page whose whole subject is the instructor.
  { where: 'landing.aboutPageRoleTitle', text: copy.landing.aboutPageRoleTitle },
  { where: 'landing.aboutPageDescription', text: copy.landing.aboutPageDescription },
];

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
    for (const { where, text } of GATED_SENTENCES) {
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
    for (const { where, text } of GATED_SENTENCES) {
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
