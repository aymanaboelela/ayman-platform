import { copy } from '@ayman/contracts';
import { Card, CardBody } from '@ayman/ui';

/**
 * Critically, no question list at all — a list of locked cards would still
 * leak the question count and order, which is exactly the "during" window's
 * whole point to withhold.
 */
export function ReviewLocked({ reason }: { reason: 'during' | 'awaitingClose' }) {
  return (
    <Card>
      <CardBody className="flex flex-col items-center gap-2 py-12 text-center">
        <p className="font-medium text-fg">{copy.quiz.reviewLocked}</p>
        <p className="max-w-[var(--w-prose)] text-fg-muted">
          {reason === 'during' ? copy.quiz.reviewLockedDuringBody : copy.quiz.reviewLockedUntilClose}
        </p>
      </CardBody>
    </Card>
  );
}
