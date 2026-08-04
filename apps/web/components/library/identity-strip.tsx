import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import type { LibraryIdentity } from '@/lib/library';

const c = copy.library;

/**
 * "You are in الصف الثاني بكالوريا, لغات" — the line that explains why the
 * courses below are the ones on screen.
 *
 * Without it the filtering is invisible: a student who sees four courses under
 * «كورساتك» has no way to tell whether that is everything published, or
 * everything published FOR THEM. Naming the cut is what turns a filtered list
 * into an understandable one.
 *
 * A year with no track renders the year alone rather than "الصف الأول · —".
 * Tracks are chosen at the start of year 2 (`Track.minYear`), so for a year-1
 * student the empty half is correct, not missing.
 *
 * ## Why it is violet and not a `.panel`
 *
 * It was a `.panel`, which made it the same object as the course cards below
 * it — a raised rectangle in the same fill, first in a column of them. That
 * reads as "here is a card, and here are some more cards", when what it
 * actually says is "everything under here is filtered by this". The violet
 * tint is the study surface's word for chrome: a container, a category, a
 * statement about structure. Set against it, the cards are the content and the
 * strip is plainly not one of them.
 */
export function IdentityStrip({
  identity,
  onboardingCompleted,
}: {
  identity: LibraryIdentity | null;
  onboardingCompleted: boolean;
}) {
  if (!identity) {
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-study-line bg-study-tint p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[length:var(--fs-title-4)] font-medium text-fg">
            {c.identityMissing}
          </p>
          <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
            {c.identityMissingHint}
          </p>
        </div>
        {/*
          Which destination depends on which of two different states this is.
          `year` is optional in `OnboardingSchema` (§5.2 — a first-year student
          legitimately has not chosen yet), so a student can be fully onboarded
          and still have no year. `proxy.ts`'s matrix bounces that student
          straight back out of /onboarding, so they get the section editor —
          which is the screen that can actually fix it. Only someone who never
          finished the wizard is sent to the wizard.
        */}
        <Link
          href={onboardingCompleted ? '/settings/section' : '/onboarding'}
          className={cn(
            'inline-flex h-10 shrink-0 items-center justify-center rounded-sm bg-accent px-4',
            'text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]',
            'transition-colors duration-[160ms] ease-out hover:bg-accent-hover',
          )}
        >
          {c.identityMissingCta}
        </Link>
      </section>
    );
  }

  const label = identity.trackLabelAr
    ? c.identity.replace('{year}', identity.yearLabelAr).replace('{track}', identity.trackLabelAr)
    : identity.yearLabelAr;

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-lg border border-study-line bg-study-tint p-4">
      {/* Solid violet against the tint, so the disc has a shape of its own on
          a surface that is already violet. `--ink-fg` is the study surface's
          "text on a violet fill" step — the same one `.stage__title` uses —
          rather than a bare `white`, which inverts wrong in light mode. */}
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-stage text-[color:var(--ink-fg)]"
      >
        <GraduationCap size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="eyebrow text-fg-muted">{c.identityLabel}</p>
        <p className="truncate text-[length:var(--fs-title-4)] font-medium text-fg">{label}</p>
      </div>
      {/* Quiet, not accent: this is a link a student takes once a term, and
          the accent on this screen belongs to «كمّل» on the course they are
          part-way through. `.chip--quiet` IS that weight, spelled once — the
          hand-rolled outline button this replaced was the same idea drawn
          slightly differently. */}
      <Link href="/settings/section" className="chip chip--quiet">
        {c.identityEdit}
      </Link>
    </section>
  );
}
