import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@ayman/ui/lib/cn';

/**
 * A titled band of the dashboard, with an optional "go to the rows" link.
 *
 * The overview was a flat grid of eleven cards. Every card was individually
 * legible and the SCREEN was not: nothing said which numbers belonged to the
 * same question, so the reader had to infer the grouping from the titles.
 * Four named bands — who is here, did they watch, did they sit the exam, and
 * who exactly — turn it into an argument that can be read in order.
 *
 * The `href` is the section's own escape hatch: a heading that names a subject
 * should be able to take you to it.
 */
export function Section({
  title,
  lead,
  href,
  linkLabel,
  children,
  className,
}: {
  title: string;
  lead?: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mb-8', className)}>
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 className="text-[length:var(--fs-title-4)] font-semibold text-fg">{title}</h2>
          {lead ? (
            <p className="mt-1 max-w-[var(--w-prose)] text-[length:var(--fs-text-xs)] text-fg-muted">
              {lead}
            </p>
          ) : null}
        </div>
        {href && linkLabel ? (
          <Link
            href={href}
            className={cn(
              'group inline-flex shrink-0 items-center gap-1 text-[length:var(--fs-text-sm)]',
              'text-accent-text transition-colors duration-[160ms] ease-out hover:text-fg',
            )}
          >
            {linkLabel}
            {/* Leftward is forward in RTL — see `StatTile`. */}
            <ChevronLeft
              className="size-3.5 shrink-0 transition-transform duration-[160ms] ease-out group-hover:-translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}
