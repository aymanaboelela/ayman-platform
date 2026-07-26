import Link from 'next/link';
import { copy, type ContinueWatching } from '@ayman/contracts';
import { Card, CardBody, cn } from '@ayman/ui';
import { formatRemaining } from '@/lib/format';
import { ChevronForward } from '@/components/player/icons';
import { LessonProgressBar } from '@/components/player/lesson-progress-bar';

export function ContinueWatchingCard({ item }: { item: ContinueWatching }) {
  return (
    <Card>
      <CardBody className="space-y-4">
        <p className="eyebrow">{copy.dashboard.continueWatching}</p>

        <div>
          <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
            {item.courseTitle}
          </p>
          <p className="text-[length:var(--fs-title-3)] font-medium">{item.lessonTitle}</p>
        </div>

        <LessonProgressBar percent={item.progressPercent} label={copy.player.courseProgress} />

        <div className="flex items-center justify-between gap-4">
          {item.remainingSeconds > 0 ? (
            <span className="mono tabular text-[length:var(--fs-mono-label)] text-fg-muted">
              {copy.dashboard.remaining} {formatRemaining(item.remainingSeconds)}
            </span>
          ) : (
            <span />
          )}

          <Link
            href={`/courses/${item.courseSlug}/lessons/${item.lessonId}`}
            className={cn(
              'flex items-center gap-2 rounded-md border border-line-strong px-4 py-2',
              'text-[length:var(--fs-text-sm)] font-medium text-accent-text',
              'transition-colors duration-[160ms] ease-out hover:bg-surface-3',
            )}
          >
            {copy.dashboard.continueCta}
            <ChevronForward />
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
