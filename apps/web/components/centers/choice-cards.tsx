import { Check, type LucideIcon } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';

/**
 * A two-way (or three-way) answer as cards you tap — `GenderCards` without the
 * pictures, generalised: each option brings its own icon and its own hue.
 *
 * Same mechanics as `GenderCards`, for the same reasons: real radios, visually
 * hidden, inside `<label>`s — one radio group to a screen reader, arrow keys
 * between options, and the selected look is CSS off `:has(:checked)`.
 *
 * Two ways to wire it:
 *   · `registration` — uncontrolled, straight from `register()`. The one to
 *     use when the answer can come back from the wizard's `sessionStorage`
 *     draft: react-hook-form writes it into the DOM after hydration, so the
 *     server's markup and the client's first render agree.
 *   · `value` / `onChange` — controlled, for a question that only exists once
 *     the browser has fetched something (so there is no server markup to
 *     disagree with) and whose answer the parent needs to re-render on.
 */
export interface ChoiceOption<V extends string> {
  value: V;
  label: string;
  hint?: string;
  icon: LucideIcon;
  /** Which `--viz-*` slot tints the icon — see `.ctr-choice__card[data-hue]`. */
  hue: 1 | 2 | 3 | 4 | 5 | 6;
}

type Wiring<V extends string> =
  | { registration: UseFormRegisterReturn; name?: never; value?: never; onChange?: never }
  | { registration?: never; name: string; value: V | null | undefined; onChange: (value: V) => void };

export function ChoiceCards<V extends string>({
  legend,
  options,
  errorId,
  errorMessage,
  ...wiring
}: {
  legend: string;
  options: ReadonlyArray<ChoiceOption<V>>;
  /** Unique on the page — the `aria-describedby` target for the error. */
  errorId: string;
  errorMessage?: string;
} & Wiring<V>) {
  return (
    <fieldset className="ctr-choice" aria-describedby={errorMessage ? errorId : undefined}>
      <legend>{legend}</legend>
      <div className="ctr-choice__grid">
        {options.map((option) => {
          const Icon = option.icon;
          const input =
            wiring.registration !== undefined
              ? wiring.registration
              : {
                  name: wiring.name,
                  checked: wiring.value === option.value,
                  onChange: () => wiring.onChange(option.value),
                };
          return (
            <label key={option.value} className="ctr-choice__card" data-hue={option.hue}>
              <input
                type="radio"
                value={option.value}
                className="sr-only"
                aria-invalid={errorMessage ? true : undefined}
                {...input}
              />
              <span className="ctr-choice__icon" aria-hidden="true">
                <Icon className="size-6" strokeWidth={1.75} />
              </span>
              <span className="ctr-choice__label">{option.label}</span>
              {option.hint ? <span className="ctr-choice__hint">{option.hint}</span> : null}
              {/* The border alone would be a colour-only signal. */}
              <span className="ctr-choice__tick" aria-hidden="true">
                <Check className="size-3.5" strokeWidth={3} />
              </span>
            </label>
          );
        })}
      </div>
      {errorMessage ? (
        <p id={errorId} role="alert" className="field__error">
          {errorMessage}
        </p>
      ) : null}
    </fieldset>
  );
}
