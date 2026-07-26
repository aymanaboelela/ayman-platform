import { Injectable } from '@nestjs/common';
import type { RecentScore } from '@ayman/contracts';

/**
 * Where the dashboard's "آخر النتائج" rail gets its data.
 *
 * Quiz attempts do not exist yet — they arrive with the quiz runner. Rather
 * than leaving a hole in the contract, the dependency is expressed as a port
 * with a correct implementation for the system as it currently is: a student
 * who has taken no quizzes has no recent scores, which is also exactly what a
 * brand-new student will see forever. The empty state is real UI that has to
 * exist regardless.
 *
 * RECONCILED — Plan 5 Task 12 rebinds SCORE_FEED to a `quiz_attempts`-backed
 * implementation. That is ONE line in `DashboardModule`'s providers array:
 *   { provide: SCORE_FEED, useClass: QuizScoreFeed }
 * No contract change, no UI change. The signature below is frozen: Plan 5's
 * `QuizScoreFeed` must implement exactly `recentFor(userId, limit)` returning
 * `RecentScore[]`, and `DashboardModule` must import `QuizModule` to get it.
 */
export interface ScoreFeed {
  recentFor(userId: string, limit: number): Promise<RecentScore[]>;
}

export const SCORE_FEED = Symbol('SCORE_FEED');

@Injectable()
export class EmptyScoreFeed implements ScoreFeed {
  async recentFor(): Promise<RecentScore[]> {
    return [];
  }
}
