import { copy } from '@ayman/contracts/copy';
import { cn } from '@ayman/ui/lib/cn';

/**
 * Where you are in the form, as segments rather than a percentage.
 *
 * The steps here are a genuine sequence, not four boxes in an arbitrary
 * order — the track list cannot be offered before a system and a year are
 * known, so "which step am I on" is real information about what the form can
 * even ask next. That is the only reason this exists; a progress bar on a
 * form whose parts are independent would be decoration.
 *
 * Segments, not a percentage: four steps means the honest readings are 0/25/
 * 50/75/100, and a bar that only ever lands on those five values is a worse
 * version of four marks. The count is also small enough to show directly.
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
  return (
    <div className="space-y-2">
      <div
        role="progressbar"
        aria-label={copy.onboarding.progressLabel}
        aria-valuemin={1}
        aria-valuemax={totalSteps}
        aria-valuenow={currentStep}
        // The position is exposed through the ARIA values above, so the
        // segments themselves carry no text and need none.
        className="flex gap-1.5"
      >
        {Array.from({ length: totalSteps }, (_, index) => (
          <span
            key={index}
            className={cn(
              'h-1 flex-1 rounded-xs transition-colors duration-[var(--d-hover)] ease-[var(--ease)]',
              index < currentStep ? 'bg-accent' : 'bg-surface-4',
            )}
          />
        ))}
      </div>
      <p className="text-[length:var(--fs-mono-label)] text-fg-muted mono">{title}</p>
    </div>
  );
}
