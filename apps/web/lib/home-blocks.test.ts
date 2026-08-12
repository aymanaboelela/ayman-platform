import { describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts';
import { FaqPropsSchema } from '@ayman/contracts/admin/home-blocks';
import { DEFAULT_HOME_BLOCKS } from './home-blocks';

/**
 * `DEFAULT_HOME_BLOCKS` is the page a site with an empty `home_blocks` table
 * serves, and nothing else asserts what is in it.
 *
 * It is easy to read the FAQ rows here as decoration — the live site usually
 * renders the admin's composed blocks instead, so an omission costs nothing
 * visible on a machine whose database has rows. It costs the whole section on
 * a fresh install, and `faqPageJsonLd` publishes whatever this list holds, so
 * a row dropped here is a row that silently stops being an answer an assistant
 * can quote.
 */
const faqBlock = DEFAULT_HOME_BLOCKS.find((block) => block.props.type === 'faq');

describe('the shipped FAQ block', () => {
  it('is present and satisfies the contract the admin writes through', () => {
    expect(faqBlock).toBeDefined();
    // The same schema `/admin/home` validates against — a default the composer
    // would reject is a default nobody can edit without first repairing it.
    expect(() => FaqPropsSchema.parse(faqBlock?.props)).not.toThrow();
  });

  /**
   * The three rows added for how the question reaches an assistant rather than
   * a visitor already on the page. They are the reason this file has a test.
   */
  it.each([
    ['faq8', copy.landing.faq8Q, copy.landing.faq8A],
    ['faq9', copy.landing.faq9Q, copy.landing.faq9A],
    ['faq10', copy.landing.faq10Q, copy.landing.faq10A],
  ])('ships %s as a question paired with its own answer', (_key, question, answer) => {
    /**
     * ⚠️ These two assertions are the point of the test, not preamble.
     *
     * Without them this case passes when the copy keys DO NOT EXIST: an absent
     * `copy.landing.faq8Q` is `undefined`, the block's row is `undefined` too,
     * and `toContainEqual({questionAr: undefined, answerAr: undefined})`
     * happily matches. Observed on 2026-08-13, when a copy refactor briefly
     * dropped these three rows — every `it.each` case here reported green
     * while the content was gone, which is the exact regression this file
     * exists to catch.
     */
    expect(typeof question).toBe('string');
    expect(typeof answer).toBe('string');

    const items = faqBlock?.props.type === 'faq' ? faqBlock.props.items : [];
    expect(items).toContainEqual({ questionAr: question, answerAr: answer });
  });

  /** Guards the pairing itself: a copy/paste that reuses one answer for two
   *  questions reads fine on the page and publishes two identical answers. */
  it('pairs every row with a distinct question and answer', () => {
    const items = faqBlock?.props.type === 'faq' ? faqBlock.props.items : [];
    expect(items.length).toBeGreaterThanOrEqual(10);
    expect(new Set(items.map((row) => row.questionAr)).size).toBe(items.length);
    expect(new Set(items.map((row) => row.answerAr)).size).toBe(items.length);
  });
});
