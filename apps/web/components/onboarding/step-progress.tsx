import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';

/**
 * Where you are in the form, as numbered stations on a rail.
 *
 * The steps here are a genuine sequence, not four boxes in an arbitrary
 * order — the track list cannot be offered before a system and a year are
 * known, so "which step am I on" is real information about what the form can
 * even ask next. That is the only reason this exists; a progress bar on a
 * form whose parts are independent would be decoration.
 *
 * Stations rather than the four thin segments it used to be: Ayman sent a
 * competitor's wizard — a numbered disc per step on a thick rail, a tick on
 * the ones behind you, «الخطوة n» under each — and asked for the same idea in
 * this platform's colours. Four is still small enough to show every one.
 *
 * `role="progressbar"` stays on the rail and the stations are `aria-hidden`:
 * the position is carried by `aria-valuenow`/`aria-valuemax`, exactly as
 * before, so a screen reader hears one control rather than four numbers.
 */
export function StepProgress({
  currentStep,
  totalSteps,
  title,
}: {
  currentStep: number;
  totalSteps: number;
  title: string;
}) {
  // How far the filled part of the rail reaches, as a fraction of the
  // distance between the first and last disc — 0 on step 1, 1 on the last.
  const reach = totalSteps > 1 ? (currentStep - 1) / (totalSteps - 1) : 1;

  return (
    <div className="stepper">
      <div
        role="progressbar"
        aria-label={copy.onboarding.progressLabel}
        aria-valuemin={1}
        aria-valuemax={totalSteps}
        aria-valuenow={currentStep}
        className="stepper__rail"
        style={{ '--stepper-count': totalSteps, '--stepper-reach': reach } as CSSProperties}
      >
        {Array.from({ length: totalSteps }, (_, index) => {
          const step = index + 1;
          const state = step < currentStep ? 'done' : step === currentStep ? 'current' : 'todo';
          return (
            <div key={step} className="stepper__station" data-state={state} aria-hidden="true">
              <span className="stepper__disc">
                {state === 'done' ? <Check className="size-4" strokeWidth={3} /> : digits(step)}
              </span>
              <span className="stepper__label">
                {copy.onboarding.stepLabel.replace('{n}', digits(step))}
              </span>
            </div>
          );
        })}
      </div>
      <p className="stepper__title">{title}</p>
    </div>
  );
}

/** Arabic-Indic, like «خطوة ١ من ٣» everywhere else in the product's copy. */
function digits(value: number): string {
  return value.toLocaleString('ar-EG');
}
