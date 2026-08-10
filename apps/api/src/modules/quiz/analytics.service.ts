import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { kelleyDiscrimination } from './analytics/discrimination';

/** The two states in which an attempt's marks are real.
 *
 *  Exported because `mastery.service.ts` must count exactly the same sittings
 *  this file's item analysis counts — a student told they are weak at a topic
 *  and a teacher looking at the same questions must not be reading different
 *  populations. */
export const GRADED_STATES = ['submitted', 'pending_review'] as const;

export interface ScoreBucket {
  bucket: number;
  n: number;
}

export interface DistractorPick {
  optionId: string;
  bodyHtml: string;
  /** The fraction weight of this option — lets the UI flag "picked more
   *  often than the key" without a second lookup. */
  fraction: number;
  picks: number;
}

export interface ItemAnalysisRow {
  questionVersionId: string;
  stemHtml: string;
  n: number;
  facility: number | null;
  discrimination: number | null;
  distractors: DistractorPick[];
}

export interface QuizAnalytics {
  quizId: string;
  attemptCount: number;
  meanScore: number | null;
  medianScore: number | null;
  passRate: number | null;
  distribution: ScoreBucket[];
  items: ItemAnalysisRow[];
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async forQuiz(quizId: string): Promise<QuizAnalytics> {
    const quiz = await this.prisma.quiz.findUniqueOrThrow({
      where: { id: quizId },
      select: { gradeOutOf: true },
    });
    const gradeOutOf = Number(quiz.gradeOutOf);

    // Attempts only — never in_progress/overdue/abandoned. Mean/median/pass
    // rate are simple enough to compute in JS from these rows directly.
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { quizId, state: { in: [...GRADED_STATES] } },
      select: { scaledScore: true, passed: true },
    });
    const scores = attempts
      .map((attempt) => (attempt.scaledScore === null ? null : Number(attempt.scaledScore)))
      .filter((value): value is number => value !== null);
    const passedCount = attempts.filter((attempt) => attempt.passed === true).length;
    const decidedCount = attempts.filter((attempt) => attempt.passed !== null).length;

    // width_bucket returns 11 for a value equal to the upper bound (a
    // perfect score), so LEAST(..., 10) folds it back into the top bucket
    // instead of an invisible eleventh column.
    const distribution = await this.prisma.$queryRaw<{ bucket: number; n: number }[]>`
      SELECT LEAST(width_bucket("scaled_score", 0, ${gradeOutOf}, 10), 10) AS bucket, count(*)::int AS n
      FROM "app"."quiz_attempts"
      WHERE "quiz_id" = ${quizId} AND "state" IN ('submitted', 'pending_review')
      GROUP BY 1 ORDER BY 1
    `;

    const facilityRows = await this.prisma.$queryRaw<
      { question_version_id: string; facility: number; n: number }[]
    >`
      SELECT aq."question_version_id", avg(aq."fraction")::float AS facility, count(*)::int AS n
      FROM "app"."attempt_questions" aq
      JOIN "app"."quiz_attempts" a ON a."id" = aq."attempt_id"
      WHERE a."quiz_id" = ${quizId}
        AND a."state" IN ('submitted', 'pending_review')
        AND aq."fraction" IS NOT NULL
      GROUP BY 1
    `;

    // Grouped by VERSION, never by bank entry — editing a question and
    // republishing must not silently average a question against its own
    // rewritten replacement (a fresh version id starts a fresh item).
    const discriminationRows = await this.prisma.$queryRaw<
      { question_version_id: string; scaled_score: number; fraction: number }[]
    >`
      SELECT aq."question_version_id", a."scaled_score"::float AS scaled_score, aq."fraction"::float AS fraction
      FROM "app"."attempt_questions" aq
      JOIN "app"."quiz_attempts" a ON a."id" = aq."attempt_id"
      WHERE a."quiz_id" = ${quizId}
        AND a."state" IN ('submitted', 'pending_review')
        AND aq."fraction" IS NOT NULL
    `;
    const discriminationByVersion = new Map<string, { total: number; fraction: number }[]>();
    for (const row of discriminationRows) {
      const list = discriminationByVersion.get(row.question_version_id) ?? [];
      list.push({ total: row.scaled_score, fraction: row.fraction });
      discriminationByVersion.set(row.question_version_id, list);
    }

    const distractorRows = await this.prisma.$queryRaw<
      { question_version_id: string; option_id: string; picks: number }[]
    >`
      SELECT aq."question_version_id", opt AS option_id, count(*)::int AS picks
      FROM "app"."attempt_questions" aq
      JOIN "app"."quiz_attempts" a ON a."id" = aq."attempt_id"
      CROSS JOIN LATERAL jsonb_array_elements_text(aq."response" -> 'optionIds') AS opt
      WHERE a."quiz_id" = ${quizId} AND a."state" IN ('submitted', 'pending_review')
      GROUP BY 1, 2
    `;
    const distractorsByVersion = new Map<string, { optionId: string; picks: number }[]>();
    for (const row of distractorRows) {
      const list = distractorsByVersion.get(row.question_version_id) ?? [];
      list.push({ optionId: row.option_id, picks: row.picks });
      distractorsByVersion.set(row.question_version_id, list);
    }

    const versionIds = facilityRows.map((row) => row.question_version_id);
    const versions = await this.prisma.questionVersion.findMany({
      where: { id: { in: versionIds } },
      select: {
        id: true,
        stemHtml: true,
        options: { select: { id: true, bodyHtml: true, fraction: true } },
      },
    });
    const versionById = new Map(versions.map((version) => [version.id, version]));

    const items: ItemAnalysisRow[] = facilityRows.map((row) => {
      const version = versionById.get(row.question_version_id);
      const optionsById = new Map((version?.options ?? []).map((option) => [option.id, option]));
      const picks = distractorsByVersion.get(row.question_version_id) ?? [];

      return {
        questionVersionId: row.question_version_id,
        stemHtml: version?.stemHtml ?? '',
        n: row.n,
        facility: row.facility,
        discrimination: kelleyDiscrimination(discriminationByVersion.get(row.question_version_id) ?? []),
        distractors: picks.map((pick) => ({
          optionId: pick.optionId,
          bodyHtml: optionsById.get(pick.optionId)?.bodyHtml ?? '',
          fraction: optionsById.get(pick.optionId) ? Number(optionsById.get(pick.optionId)!.fraction) : 0,
          picks: pick.picks,
        })),
      };
    });
    // Worst items first — the whole point of surfacing this at all.
    items.sort((a, b) => (a.discrimination ?? 0) - (b.discrimination ?? 0));

    return {
      quizId,
      attemptCount: attempts.length,
      meanScore: scores.length > 0 ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
      medianScore: median(scores),
      passRate: decidedCount > 0 ? passedCount / decidedCount : null,
      distribution,
      items,
    };
  }
}
