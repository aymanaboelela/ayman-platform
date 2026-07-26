import { copy, type RecentScore } from '@ayman/contracts';
import { Badge, Card, CardBody } from '@ayman/ui';

/**
 * The empty state is not a stopgap — a brand-new student sees it forever
 * until they finish their first quiz, so it has to be designed regardless of
 * when the quiz runner lands. Until then `SCORE_FEED` correctly reports that
 * a student with no attempts has no scores.
 */
export function RecentScores({ scores }: { scores: RecentScore[] }) {
  if (scores.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
            {copy.dashboard.noScoresYet}
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="p-0">
        <ul>
          {scores.map((score) => (
            <li
              key={score.attemptId}
              className="flex items-center justify-between gap-4 border-b border-line-subtle px-5 py-3 last:border-b-0"
            >
              <span className="min-w-0 flex-1 truncate text-start">{score.quizTitle}</span>
              {/* `ok` / `err` are legitimate here: this IS quiz correctness,
                  the one thing green and red are reserved for. */}
              <Badge tone={score.scorePercent >= 50 ? 'ok' : 'err'}>
                <span className="tabular">{Math.round(score.scorePercent)}%</span>
              </Badge>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
