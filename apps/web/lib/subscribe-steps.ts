import { copy } from '@ayman/contracts';

/**
 * The subscribe flow, as data — so the page, its markdown twin and its
 * `FAQPage` graph all render the SAME sentences.
 *
 * ⚠️ This is the whole reason the steps are not inlined in the page. Three
 * surfaces describe this flow, and a hand-written second copy in any of them is
 * the drift that produced «[object Object]» on `/about.md` and a markdown twin
 * telling assistants that free articles were paywalled. One list, three
 * readers.
 *
 * ⚠️ It reads `copy` and nothing else — no settings, no catalog, no `SITE_URL`.
 * `markdown-render.ts` imports it, and that module is on the path of every
 * markdown request.
 */
export interface SubscribeStep {
  title: string;
  body: string;
}

export function subscribeSteps(): readonly SubscribeStep[] {
  const c = copy.subscribePage;
  return [
    { title: c.step1Title, body: c.step1Body },
    { title: c.step2Title, body: c.step2Body },
    { title: c.step3Title, body: c.step3Body },
    { title: c.step4Title, body: c.step4Body },
    { title: c.step5Title, body: c.step5Body },
    { title: c.step6Title, body: c.step6Body },
    { title: c.step7Title, body: c.step7Body },
  ];
}

/**
 * The payment rails the admin has actually configured.
 *
 * ⚠️ Same rule as `PaymentMethodChoice`'s `available`: a rail is offered only
 * when its destination is set. A shipped constant would keep promising
 * فودافون كاش after the number was cleared, on a page whose whole job is to be
 * believed about how to pay.
 *
 * ⚠️ The NAMES come from `copy.subscribe.*`, never retyped here. The
 * screenshot-hint bug was exactly a second hand-written copy of a rail name
 * drifting from the first.
 */
export function subscribeRails(contact: {
  instapay?: string | null;
  vodafoneCash?: string | null;
}): readonly string[] {
  const rails: string[] = [];
  if (contact.instapay) rails.push(copy.subscribe.railInstapay);
  if (contact.vodafoneCash) rails.push(copy.subscribe.railVodafoneCash);
  return rails;
}

/**
 * The three questions, answered with the page's own sentences.
 *
 * ⚠️ `faqPageJsonLd` requires the answer text to be text the page shows, and
 * every answer below is a step body printed above it — not a paraphrase. A FAQ
 * that rewords its own page is two wordings of one fact.
 */
export function subscribeFaqRows(
  rails: readonly string[],
): ReadonlyArray<{ questionAr: string; answerAr: string }> {
  const c = copy.subscribePage;
  const steps = subscribeSteps();

  return [
    {
      questionAr: c.faqQ1,
      // The first four steps, joined — «اعمل حساب، افتح الكورس…»: the shortest
      // complete answer to "how", in the page's own words.
      answerAr: steps
        .slice(0, 4)
        .map((step) => step.body)
        .join(' '),
    },
    {
      questionAr: c.faqQ2,
      answerAr: rails.length > 0 ? rails.join(' — ') : c.railsNone,
    },
    {
      questionAr: c.faqQ3,
      answerAr: `${steps[5]?.body ?? ''} ${steps[6]?.body ?? ''}`.trim(),
    },
  ];
}
