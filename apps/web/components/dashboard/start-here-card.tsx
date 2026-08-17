import Link from 'next/link';
import { Check } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import type { StartStep } from '@/lib/dashboard-view';
import { ChevronForward } from '@/components/player/icons';

/**
 * The first-run card: three steps, ticked from data the dashboard already has.
 *
 * ## Why exactly one step carries the AMBER button
 *
 * Three accent CTAs stacked in a card is three decisions, and a student who
 * has just finished onboarding has no basis for making any of them. Only the
 * first outstanding step gets the amber fill; the ones after it are plainly
 * not the next thing to do.
 *
 * ## …and why the other two are no longer dead
 *
 * They used to render nothing at all — no control, no body text — so two of
 * the three rows on the very first screen of the product looked exactly like
 * the third and did absolutely nothing when pressed. On a phone that is not
 * read as "not yet", it is read as broken: «مش عايز إن هو يضغط على حاجة وما
 * يبقاش ليه استجابة».
 *
 * So an outstanding step is always pressable, and there are two kinds:
 *
 *   · takeable now → a link, straight to where the label says
 *   · blocked      → a quiet chip that opens a dialog naming what comes first
 *                    and offering to go there. «أقول له بعد إذنك اتفرج على
 *                    الكورس الأول».
 *
 * Completed steps stay unclickable and carry a tick — a «تمّت» that navigates
 * somewhere is a button that punishes reading.
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
        {steps.map((step, index) => {
          const isNext = step.id === nextId;

          return (
            /*
             * Stacks below `sm`, and that is not a nicety.
             *
             * This was one flex ROW at every width: marker, text, then a
             * `shrink-0` call-to-action. On a 360px phone the button («شوف
             * الكورسات») took its full width out of the row first, and the
             * text — the only part that can give — was left about ninety pixels
             * to wrap in. Measured against production on a Galaxy S9+: the
             * step's title rendered ONE WORD PER LINE, eight lines tall, and
             * its body another eleven. The first thing a new student sees, and
             * it looked broken.
             *
             * So on a phone the action drops beneath the text it belongs to,
             * where it has the whole width; from `sm` up the row is unchanged.
             */
            <li
              key={step.id}
              className={cn(
                'flex flex-col gap-3 rounded-md border p-3 transition-colors duration-[160ms] ease-out',
                'sm:flex-row sm:items-start',
                isNext ? 'border-line-strong bg-surface-2' : 'border-transparent',
              )}
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <StepMarker done={step.done} position={index + 1} />

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
                    <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
                      {step.body}
                    </p>
                  ) : null}
                </div>
              </div>

              {step.done ? (
                // `ms-8` on a phone lines the word up under the title rather
                // than under the marker, so a stacked step still reads as one
                // block. The margin is dropped once the row is a row again.
                <span className="mono ms-8 shrink-0 text-[length:var(--fs-mono-label)] text-fg-faint sm:ms-0">
                  {c.stepDone}
                </span>
              ) : step.blockedBy ? (
                /* Not its turn — but it answers. See `StepBlockedDialog`. */
                <StepBlockedDialog step={step} blockedBy={step.blockedBy} />
              ) : (
                <Link
                  href={step.href}
                  className={cn(
                    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm px-3 py-2',
                    'text-[length:var(--fs-text-sm)] font-medium',
                    // AMBER only for the one step that is next. A takeable-but-
                    // not-next step is possible (a student who opened a lesson
                    // before enrolling ticked anything) and it takes the quiet
                    // chip, so the card still has exactly one primary action.
                    isNext
                      ? 'bg-accent text-[#1A1206] hover:bg-accent-hover'
                      : 'border border-line-strong text-fg hover:bg-surface-3',
                    // Full width on a phone — a lone button floating at the
                    // inline start of an otherwise empty line reads as a
                    // leftover, and this is the one thing on the card to press.
                    'w-full sm:w-auto sm:py-1.5',
                    'transition-colors duration-[160ms] ease-out',
                  )}
                >
                  {step.cta}
                  <ChevronForward />
                </Link>
              )}
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
 *
 * ## Why an outstanding step shows a NUMBER and not an empty circle
 *
 * It used to render the same `<Check>` in both states, transparent when the
 * step was outstanding — so an unfinished step was an empty round outline
 * beside a label, which is the universal drawing of a checkbox. On a card
 * whose other two rows carry ticks, that reads as "tick this when you have
 * done it", and tapping it does nothing, because it is not a control and never
 * was.
 *
 * A numeral cannot be mistaken for a control, and it says something the tick
 * cannot: where this step sits in the sequence. The list is an `<ol>` and this
 * is its marker made visible.
 */
function StepMarker({ done, position }: { done: boolean; position: number }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'mono mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border',
        'text-[length:var(--fs-mono-label)] tabular',
        done
          ? 'border-[color-mix(in_oklch,var(--ok),transparent_60%)] bg-[color-mix(in_oklch,var(--ok),transparent_88%)] text-[color:var(--ok)]'
          : 'border-line-strong text-fg-muted',
      )}
    >
      {done ? <Check className="size-3" /> : position}
    </span>
  );
}

/**
 * A step that is not its turn yet, and the dialog that says why.
 *
 * The alternative shapes were both worse. A `disabled` button is unfocusable
 * and still says nothing. A tooltip does not exist on a touch screen. And
 * rendering nothing at all — which is what this replaces — leaves a row that
 * looks identical to the actionable one and answers a press with silence.
 *
 * The same shape `<LessonLockDialog>` uses one route over, deliberately: a
 * student who has learned that pressing a quiet grey chip explains something
 * on the course page should find the same thing true on their dashboard.
 */
function StepBlockedDialog({
  step,
  blockedBy,
}: {
  step: StartStep;
  blockedBy: NonNullable<StartStep['blockedBy']>;
}) {
  return (
    <Dialog>
      <DialogTrigger
        className={cn(
          'inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-sm px-3 py-2',
          'border border-line text-[length:var(--fs-text-sm)] text-fg-muted',
          'transition-colors duration-[160ms] ease-out hover:bg-surface-3 hover:text-fg',
          'sm:w-auto sm:py-1.5',
        )}
      >
        {step.cta}
      </DialogTrigger>

      <DialogContent closeLabel={copy.common.close}>
        <DialogHeader>
          <DialogTitle>{copy.dashboard.stepBlockedTitle}</DialogTitle>
          <DialogDescription>{blockedBy.reason}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {/* The way FORWARD is the primary control, not the dismiss. The whole
              point of this dialog is that a blocked step still ends in
              somewhere to go. */}
          <Link
            href={blockedBy.href}
            className={cn(
              'inline-flex h-10 items-center justify-center rounded-sm bg-accent px-4',
              'text-[length:var(--fs-text-base)] font-medium text-[#1A1206]',
              'transition-colors duration-[160ms] ease-out hover:bg-accent-hover',
            )}
          >
            {blockedBy.cta}
          </Link>
          <DialogClose asChild>
            <Button variant="secondary">{copy.common.close}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
