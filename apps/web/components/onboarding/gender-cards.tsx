import Image from 'next/image';
import { Check } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { copy } from '@ayman/contracts/copy';

/**
 * «النوع» as two pictures you tap, instead of a `<select>` with two words in it.
 *
 * Ayman sent a competitor's step with a boy and a girl side by side and asked
 * for the same idea. It is also simply the better control for a two-way
 * choice: both answers are visible at once, the target is a whole card rather
 * than a 40px row, and nobody has to open a menu to find out what is in it.
 *
 * Real radio inputs, visually hidden, inside `<label>`s — so it is still one
 * radio group to a screen reader and to react-hook-form (`register` works on
 * radios as-is), arrow keys move between the two, and the card state is pure
 * CSS off `:has(:checked)` with no component state to drift from the form's.
 *
 * `alt=""` on the art: the label under it says the same thing in words, and
 * announcing «صورة ولد» before «ذكر» would make every option say it twice.
 */
const OPTIONS = [
  { value: 'male', label: copy.onboarding.genderMale, src: '/avatars/student-boy.webp' },
  { value: 'female', label: copy.onboarding.genderFemale, src: '/avatars/student-girl.webp' },
] as const;

export function GenderCards({
  registration,
  errorMessage,
}: {
  registration: UseFormRegisterReturn<'gender'>;
  errorMessage?: string;
}) {
  const errorId = errorMessage ? 'gender-error' : undefined;

  return (
    <fieldset className="gender-pick" aria-describedby={errorId}>
      <legend className="field__label">{copy.onboarding.gender}</legend>
      <div className="gender-pick__grid">
        {OPTIONS.map((option) => (
          <label key={option.value} className="gender-pick__card">
            <input
              type="radio"
              value={option.value}
              className="sr-only"
              aria-invalid={errorMessage ? true : undefined}
              {...registration}
            />
            <Image
              src={option.src}
              alt=""
              width={320}
              height={320}
              // Both are above the fold on the step that shows them, and
              // there are exactly two — not worth a lazy-load round trip.
              priority
              className="gender-pick__art"
            />
            <span className="gender-pick__label">{option.label}</span>
            {/* Shown only on the chosen card (CSS, off `:checked`) — the
                border alone is a colour-only signal. */}
            <span className="gender-pick__tick" aria-hidden="true">
              <Check className="size-3.5" strokeWidth={3} />
            </span>
          </label>
        ))}
      </div>
      {errorMessage && (
        <p id={errorId} role="alert" className="field__error">
          {errorMessage}
        </p>
      )}
    </fieldset>
  );
}
