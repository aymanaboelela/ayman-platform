'use client';

// ⚠️ The SUBPATH, not the root barrel. This is a `'use client'` component and
// `lib/client-barrel.test.ts` fails the build on a root-barrel import from one —
// see [[contracts-root-barrel-breaks-api-runtime]] for the outage that guard
// exists to prevent.
import { copy } from '@ayman/contracts/copy';
import { cn } from '@ayman/ui/lib/cn';
import { PaymentBrand, type PaymentRail } from './payment-brand';

const c = copy.subscribe;

/**
 * «هتدفع إزاي؟» — the first step of every checkout on the platform.
 *
 * ## Why a step at all
 *
 * There is one number on the screen and it belongs to one rail. Before this,
 * that rail was InstaPay and a student who only has a Vodafone Cash wallet had
 * no way to say so — they either gave up or sent money to a destination the
 * screen was not describing. Asking first costs one tap and removes the entire
 * class of "paid to the wrong place".
 *
 * ## Why it is a separate step and not a dropdown beside the number
 *
 * Because the number changes with the answer. A `<select>` above a number that
 * silently rewrites itself is exactly the interaction a distracted person gets
 * wrong — they read the number first and change the method after. Two big
 * targets and a «التالي» makes the order impossible to get backwards, and it
 * is the shape every payment sheet a student has already used takes.
 *
 * ## The rules that hold this up
 *
 * ⚠️ **Nothing is preselected.** A default choice is a choice the student did
 * not make, and here it decides where their money goes. `value` starts null and
 * «التالي» is inert until they touch one.
 *
 * ⚠️ **A rail with no number is offered as UNAVAILABLE, never hidden.** An
 * admin who has not filled `contact.vodafoneCash` yet leaves a student staring
 * at a screen with one option and no explanation; the disabled card with
 * «مش متاح دلوقتي» says which of the two facts is true. Hiding it also makes
 * the gap invisible on the admin side, which is how it stays unfilled.
 *
 * ⚠️ **The choice is reversible from the next screen.** `onBack` there returns
 * here with the previous answer still selected — see the panels.
 */
export function PaymentMethodChoice({
  value,
  onChange,
  onNext,
  available,
}: {
  value: PaymentRail | null;
  onChange: (rail: PaymentRail) => void;
  onNext: () => void;
  /** Which rails the admin has actually configured a number for. */
  available: Record<PaymentRail, boolean>;
}) {
  const rails: { rail: PaymentRail; label: string }[] = [
    { rail: 'instapay', label: c.railInstapay },
    { rail: 'vodafoneCash', label: c.railVodafoneCash },
  ];

  return (
    <div className="pay-choice">
      <p className="pay-choice__question">{c.railQuestion}</p>

      {/*
        `radiogroup`, not a list of buttons. These are one question with two
        answers, and the difference is what an arrow key does: in a radio group
        it moves between the options, which is how someone on a keyboard expects
        to answer a question. `aria-checked` is what makes the lit card mean
        "selected" to a screen reader rather than just "coloured".
      */}
      <div className="pay-choice__grid" role="radiogroup" aria-label={c.railQuestion}>
        {rails.map(({ rail, label }) => {
          const enabled = available[rail];
          const selected = value === rail;
          return (
            <button
              key={rail}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!enabled}
              onClick={() => onChange(rail)}
              className={cn('pay-choice__card', selected && 'pay-choice__card--on')}
            >
              <PaymentBrand rail={rail} className="pay-choice__logo" />
              <span className="pay-choice__label">{label}</span>
              {/* The disabled reason, on the card rather than in a footnote —
                  a greyed-out option with no explanation reads as a bug. */}
              {enabled ? null : <span className="pay-choice__off">{c.railUnavailable}</span>}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={value === null}
        className="course-subscribe__submit pay-choice__next"
      >
        {c.railNext}
      </button>
    </div>
  );
}
