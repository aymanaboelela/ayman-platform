import Link from 'next/link';
import { Check } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import type { StartStep } from '@/lib/dashboard-view';
import { ChevronForward } from '@/components/player/icons';

/**
 * The first-run card: three steps, ticked from data the dashboard already has.
 *
 * ## Why exactly one step carries a button
 *
 * Three CTAs stacked in a card is three decisions, and a student who has just
 * finished onboarding has no basis for making any of them. Only the FIRST
 * outstanding step gets a button; the ones after it are visible so the path is
 * legible, but they are plainly not the next thing to do. Completed steps
 * carry a tick and nothing clickable — a "تمّت" that navigates somewhere is a
 * button that punishes reading.
 *
 * ## `tone`
 *
 * `hero` is the accent-tinted treatment used when this card IS the top of the
 * page — a brand-new student with nothing to resume. `plain` is for the case
 * where `<ContinueWatchingCard>` is above it and already owns the page's one
 * accent surface; two accent-tinted cards stacked would leave neither reading
 * as primary.
 */
export function StartHereCard({
  steps,
  tone = 'hero',
}: {
  steps: readonly StartStep[];
  tone?: 'hero' | 'plain';
}) {
  const done = steps.filter((step) => step.done).length;
  const nextId = steps.find((step) => !step.done)?.id;
  const c = copy.dashboard;

  return (
    <section
      aria-labelledby="start-here-title"
      className={cn(
        'relative isolate overflow-hidden rounded-lg border p-5 sm:p-6',
        tone === 'hero'
          ? 'hero-bloom border-[color-mix(in_oklch,var(--a-9),transparent_72%)] bg-[color-mix(in_oklch,var(--a-9),var(--n-2)_92%)]'
          : 'border-line bg-surface-2',
      )}
    >
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h2
          id="start-here-title"
          className="text-[length:var(--fs-title-3)] font-medium text-fg"
        >
          {c.startHereTitle}
        </h2>
        <p className="mono tabular shrink-0 text-[length:var(--fs-mono-label)] text-fg-muted">
          {c.startHereProgress.replace('{done}', String(done)).replace('{total}', String(steps.length))}
        </p>
      </div>

      <ol className="flex flex-col gap-3">
        {steps.map((step) => {
          const isNext = step.id === nextId;

          return (
            <li
              key={step.id}
              className={cn(
                'flex items-start gap-3 rounded-md border p-3 transition-colors duration-[160ms] ease-out',
                isNext ? 'border-line-strong bg-surface-2' : 'border-transparent',
              )}
            >
              <StepMarker done={step.done} />

              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'text-[length:var(--fs-text-sm)] font-medium',
                    step.done ? 'text-fg-muted' : 'text-fg',
                  )}
                >
                  {step.title}
                </p>
                {/* The explanation is only worth its vertical space on the step
                    the student is actually meant to act on. Rendering all three
                    turns a nudge into a wall of instructions. */}
                {isNext ? (
                  <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{step.body}</p>
                ) : null}
              </div>

              {step.done ? (
                <span className="mono shrink-0 text-[length:var(--fs-mono-label)] text-fg-faint">
                  {c.stepDone}
                </span>
              ) : isNext ? (
                <Link
                  href={step.href}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-accent px-3 py-1.5',
                    'text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]',
                    'transition-colors duration-[160ms] ease-out hover:bg-accent-hover',
                  )}
                >
                  {step.cta}
                  <ChevronForward />
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>

      <p className="mt-5 border-t border-line-subtle pt-4 text-[length:var(--fs-text-sm)] text-fg-muted">
        {c.startHereNote}
      </p>
    </section>
  );
}

/**
 * `aria-hidden` on both branches: the row's own text already says whether the
 * step is done (the "تمّت" chip) or is next (it carries the only button). A
 * tick announced as "علامة صح" before every completed title is noise.
 */
function StepMarker({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border',
        done
          ? 'border-[color-mix(in_oklch,var(--ok),transparent_60%)] bg-[color-mix(in_oklch,var(--ok),transparent_88%)] text-[color:var(--ok)]'
          : 'border-line-strong text-transparent',
      )}
    >
      <Check className="size-3" />
    </span>
  );
}
