import Link from 'next/link';
import { copy } from '@ayman/contracts';
import { Card, CardBody, cn } from '@ayman/ui';
import { quizHref } from '@/lib/quiz-links';
import { QuizIcon } from './icons';

export interface QuizLessonProps {
  lessonId: string;
}

/**
 * A quiz lesson in the player is a doorway, not a runner. The attempt lives on
 * its own route with its own timer, `deadline_at` and attempt token — running
 * it inside a page the student can navigate away from mid-attempt would be a
 * design mistake, not a shortcut.
 *
 * `@ayman/ui`'s `Button` has no `asChild` prop, so the primary-button look is
 * applied directly to the `Link` rather than nesting a `<button>` inside an
 * `<a>` (invalid HTML, and two nested interactive elements).
 */
export function QuizLesson({ lessonId }: QuizLessonProps) {
  return (
    <Card>
      <CardBody className="flex flex-col items-start gap-4">
        <QuizIcon className="h-6 w-6 text-accent" />
        <p className="max-w-[var(--w-prose)] text-fg-muted">{copy.player.quizIntro}</p>
        <Link
          href={quizHref(lessonId)}
          className={cn(
            'inline-flex h-10 items-center justify-center gap-2 rounded-sm px-4',
            'text-[length:var(--fs-text-base)] font-medium',
            'bg-accent text-[#1A1206] transition-colors duration-[var(--d-hover)] ease-[var(--ease)] hover:bg-accent-hover',
          )}
        >
          {copy.player.quizCta}
        </Link>
      </CardBody>
    </Card>
  );
}
