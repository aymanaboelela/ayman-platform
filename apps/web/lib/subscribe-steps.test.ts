import { describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts';
import { subscribeFaqRows, subscribeRails, subscribeSteps } from './subscribe-steps';

/**
 * ⚠️ The three rules on `copy.subscribePage` are the whole design of this page,
 * and each one is a thing a well-meaning edit would add back. They are asserted
 * here rather than trusted to the comment.
 */
describe('what the subscribe page must never say', () => {
  const everything = [
    ...subscribeSteps().flatMap((step) => [step.title, step.body]),
    ...subscribeFaqRows(['إنستاباي']).flatMap((row) => [row.questionAr, row.answerAr]),
    copy.subscribePage.lead,
    copy.subscribePage.metaDescription,
  ].join(' ');

  /** It is Ayman's personal wallet, and an indexed page carrying a payment
   *  destination is the template every scam clone wants. */
  it('publishes no destination number', () => {
    expect(everything).not.toMatch(/\d{8,}/u);
    expect(everything).not.toMatch(/01[0-9]/u);
  });

  /** `subscribe.success` names no window for the reason recorded there: a
   *  stated window becomes a complaint the moment it slips. */
  it('promises no turnaround time', () => {
    // Alternation, not a character class: «فورًا» is a letter plus a combining
    // tanween, and a class over combined characters is the lint rule
    // `no-misleading-character-class` exists for.
    expect(everything).not.toMatch(/ساع|يوم|دقيق|فورا|فورًا|فوري/u);
  });

  /** Nothing public states a refund policy and /terms is silent, so writing
   *  one here would invent policy on the instructor's behalf. */
  it('states no refund or cancellation policy', () => {
    expect(everything).not.toMatch(/استرجاع|استرداد|إلغاء الاشتراك|فلوسك ترجع/u);
  });
});

describe('subscribeRails', () => {
  /** Same rule as `PaymentMethodChoice`'s `available`: offer a rail only when
   *  the admin has configured its destination. */
  it('offers only the rails that are configured', () => {
    expect(subscribeRails({ instapay: 'x@instapay', vodafoneCash: null })).toEqual([
      copy.subscribe.railInstapay,
    ]);
    expect(subscribeRails({ instapay: null, vodafoneCash: '+201000000000' })).toEqual([
      copy.subscribe.railVodafoneCash,
    ]);
  });

  it('offers none when the admin has configured none', () => {
    expect(subscribeRails({})).toEqual([]);
  });
});

describe('subscribeFaqRows', () => {
  /**
   * ⚠️ `faqPageJsonLd` requires the answer text to be text the page shows. Every
   * answer is a step body printed on the page, not a paraphrase of one.
   */
  it('answers with the page own sentences', () => {
    const rows = subscribeFaqRows([copy.subscribe.railInstapay]);
    const bodies = subscribeSteps().map((step) => step.body);

    expect(rows).toHaveLength(3);
    expect(rows[0]?.answerAr).toContain(bodies[0]);
    expect(rows[0]?.answerAr).toContain(bodies[3]);
    expect(rows[2]?.answerAr).toContain(bodies[6]);
  });

  it('says what is configured when asked what is accepted', () => {
    expect(subscribeFaqRows([copy.subscribe.railInstapay])[1]?.answerAr).toBe(
      copy.subscribe.railInstapay,
    );
    expect(subscribeFaqRows([])[1]?.answerAr).toBe(copy.subscribePage.railsNone);
  });
});
