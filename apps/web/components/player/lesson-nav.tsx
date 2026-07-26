'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { copy, type HeartbeatResponse, type LessonNeighbour } from '@ayman/contracts';
import { Button, cn } from '@ayman/ui';
import { postComplete } from '@/lib/progress-client';
import { CheckIcon, ChevronBack, ChevronForward } from './icons';

export interface LessonNavProps {
  lessonId: string;
  courseSlug: string;
  previous: LessonNeighbour;
  next: LessonNeighbour;
  isComplete: boolean;
  onProgress: (response: HeartbeatResponse) => void;
}

// `@ayman/ui`'s `Button` has no `asChild` prop, so the ghost-button look is
// applied directly to these `Link`s rather than nesting a `<button>` inside
// an `<a>`.
const GHOST_LINK = cn(
  'inline-flex h-10 items-center gap-2 rounded-sm px-4',
  'text-[length:var(--fs-text-base)] font-medium text-fg-muted',
  'transition-colors duration-[var(--d-hover)] ease-[var(--ease)] hover:bg-surface-3 hover:text-fg',
);

export function LessonNav({
  lessonId,
  courseSlug,
  previous,
  next,
  isComplete,
  onProgress,
}: LessonNavProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  const finish = async () => {
    setSaving(true);
    try {
      onProgress(await postComplete(lessonId));
      // Advance immediately — "أنهيت الدرس · التالي" is one gesture, and
      // making the student find the next link afterwards is the single most
      // common complaint about these players.
      if (next) {
        startTransition(() => router.push(`/courses/${courseSlug}/lessons/${next.id}`));
      }
    } finally {
      setSaving(false);
    }
  };

  const label = saving
    ? copy.player.marking
    : next
      ? copy.player.markComplete
      : copy.player.markCompleteFinal;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-6">
      <div className="flex items-center gap-2">
        {previous ? (
          <Link href={`/courses/${courseSlug}/lessons/${previous.id}`} className={GHOST_LINK}>
            <ChevronBack />
            {copy.player.previous}
          </Link>
        ) : null}
        {next ? (
          <Link href={`/courses/${courseSlug}/lessons/${next.id}`} className={GHOST_LINK}>
            {copy.player.next}
            <ChevronForward />
          </Link>
        ) : null}
      </div>

      {/* Always present, on every lesson kind — the manual finish path must
          never depend on watch progress. */}
      <Button onClick={() => void finish()} disabled={saving || isComplete}>
        <span className="flex items-center gap-2">
          {isComplete ? <CheckIcon /> : null}
          {isComplete ? copy.player.completed : label}
        </span>
      </Button>
    </div>
  );
}
