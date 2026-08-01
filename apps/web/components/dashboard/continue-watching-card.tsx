import Link from 'next/link';
import { Play } from 'lucide-react';
import { copy, type ContinueWatching } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { formatRemaining } from '@/lib/format';
import { ChevronForward } from '@/components/player/icons';
import { LessonProgressBar } from '@/components/player/lesson-progress-bar';

/**
 * The single most important thing on the dashboard: the one link that puts a
 * returning student back exactly where they stopped. It is the only element
 * here that carries an accent-tinted surface, so it reads as the primary
 * action without a second competing button anywhere on the page.
 *
 * The whole card is the link (`::after` stretched over the card from the CTA),
 * so the click target is the card rather than the small chevron row — but the
 * accessible name still comes from one anchor, not from three nested ones.
 */
export function ContinueWatchingCard({ item }: { item: ContinueWatching }) {
  return (
    <article
      className={cn(
        'relative isolate overflow-hidden rounded-lg border p-5 sm:p-6',
        'border-[color-mix(in_oklch,var(--a-9),transparent_72%)]',
        'bg-[color-mix(in_oklch,var(--a-9),var(--n-2)_92%)]',
        'transition-colors duration-[160ms] ease-out',
        'hover:border-[color-mix(in_oklch,var(--a-9),transparent_52%)]',
        'focus-within:border-[color-mix(in_oklch,var(--a-9),transparent_40%)]',
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-[#1A1206]"
          aria-hidden="true"
        >
          <Play className="size-5 translate-x-px fill-current" />
        </span>

        <div className="min-w-0 flex-1 space-y-2">
          <p className="eyebrow text-accent-text">{copy.dashboard.continueWatching}</p>
          <p className="truncate text-[length:var(--fs-title-3)] font-medium text-fg">
            {item.lessonTitle}
          </p>
          <p className="truncate text-[length:var(--fs-text-sm)] text-fg-muted">
            {item.courseTitle}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          {item.remainingSeconds > 0 ? (
            <span className="mono tabular text-[length:var(--fs-mono-label)] text-fg-muted">
              {copy.dashboard.remaining} {formatRemaining(item.remainingSeconds)}
            </span>
          ) : null}

          <Link
            href={`/courses/${item.courseSlug}/lessons/${item.lessonId}`}
            className={cn(
              'inline-flex items-center gap-2 rounded-sm bg-accent px-4 py-2',
              'text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]',
              'transition-colors duration-[160ms] ease-out hover:bg-accent-hover',
              // Stretches the anchor's hit area over the whole card. `isolate`
              // on the article keeps this overlay from escaping the card.
              'after:absolute after:inset-0 after:content-[""]',
            )}
          >
            {copy.dashboard.continueCta}
            <ChevronForward />
          </Link>
        </div>
      </div>

      <LessonProgressBar
        percent={item.progressPercent}
        label={copy.player.courseProgress}
        className="mt-5"
      />
    </article>
  );
}
