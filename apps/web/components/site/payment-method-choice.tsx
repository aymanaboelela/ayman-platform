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
 * targets on their own screen make that order impossible to get backwards.
 *
 * ## The rules that hold this up
 *
 * ⚠️ **One tap, no «التالي».** The button used to sit under the cards as a
 * confirm step and it was pure friction: the tap IS the choice, the next screen
 * is the feedback, and «غيّر طريقة التحويل» is the undo. A second press to
 * agree with the press before it is a step people resent on the screen where
 * they are deciding to spend money.
 *
 * ⚠️ **Nothing is preselected**, and with the confirm gone that matters more,
 * not less: there is no default to drift through, because nothing happens until
 * a finger lands on one of the two.
 *
 * ⚠️ **These are BUTTONS, not radios.** They were `role="radio"` while a
 * «التالي» existed — a question with two answers, submitted separately. A
 * control that acts the moment it is pressed is a button, and calling it a
 * radio would promise a screen reader an answer it can change before
 * committing, which is no longer true.
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
  available,
}: {
  value: PaymentRail | null;
  /** Picks the rail AND moves on — the tap is the choice. */
  onChange: (rail: PaymentRail) => void;
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

      <div className="pay-choice__grid">
        {rails.map(({ rail, label }) => {
          const enabled = available[rail];
          const selected = value === rail;
          return (
            <button
              key={rail}
              type="button"
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

    </div>
  );
}
