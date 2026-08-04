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
      <section className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[length:var(--fs-title-4)] font-medium text-fg">
            {c.identityMissing}
          </p>
          <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
            {c.identityMissingHint}
          </p>
        </div>
        {/*
          The CTA is conditional on onboarding NOT being finished, and that is
          load-bearing rather than defensive. `year` is optional in
          `OnboardingSchema` (§5.2 — a first-year student legitimately has not
          chosen yet), so "no year" and "no profile" are different states. For
          the first, `proxy.ts`'s matrix sends a completed student straight
          from /onboarding back to /dashboard, and a button that bounces off
          its own destination is worse than no button.
        */}
        {onboardingCompleted ? null : (
          <Link
            href="/onboarding"
            className={cn(
              'inline-flex h-10 shrink-0 items-center justify-center rounded-sm bg-accent px-4',
              'text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]',
              'transition-colors duration-[160ms] ease-out hover:bg-accent-hover',
            )}
          >
            {c.identityMissingCta}
          </Link>
        )}
      </section>
    );
  }

  const label = identity.trackLabelAr
    ? c.identity.replace('{year}', identity.yearLabelAr).replace('{track}', identity.trackLabelAr)
    : identity.yearLabelAr;

  return (
    <section className="panel flex items-center gap-3 p-4">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-3 text-accent-text"
      >
        <GraduationCap size={20} />
      </span>
      <div className="min-w-0">
        <p className="eyebrow text-fg-muted">{c.identityLabel}</p>
        <p className="truncate text-[length:var(--fs-title-4)] font-medium text-fg">{label}</p>
      </div>
    </section>
  );
}
