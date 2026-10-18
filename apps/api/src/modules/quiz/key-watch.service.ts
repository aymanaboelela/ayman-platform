import { Injectable, Logger } from '@nestjs/common';
import type { SuspectKeyRow } from '@ayman/contracts/quiz/suspect-key';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { QuestionType } from '../../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { GRADED_STATES, isSuspectKey } from './analytics.service';
import { stemExcerpt } from './question-removal.service';
import { optionTexts } from './suspect-key-text';

/** The types whose answers are option ids — the only ones a key can be wrong on. */
const CHOICE_TYPES: readonly QuestionType[] = ['mcq_single', 'mcq_multi', 'true_false'];

/** Who is told. The same authority that may open the question editor and fix it. */
const AUDIENCE = 'question:write';

interface VersionFacts {
  id: string;
  bankEntryId: string;
  type: QuestionType;
  stemHtml: string;
  options: { id: string; bodyHtml: string; fraction: number }[];
}

/** The verdict for one version, with the evidence behind it. */
export interface SuspectVerdict {
  version: VersionFacts;
  suspect: boolean;
  /** The most-picked option (the unkeyed one, when `suspect`). */
  topOptionId: string | null;
  picks: number;
  answers: number;
}

/**
 * «الإجابة الصح غالبًا متسجّلة غلط» — PR #659's item-analysis flag, raised
 * without anyone opening the analytics page.
 *
 * #659 put `suspectKey` on `/admin/quizzes/:id/analytics`, and nobody opens
 * that page: on 2026-10-18 two true/false questions sat keyed the wrong way
 * round until a student complained, with all nine answers on the right
 * option and all nine marked wrong. This watches the papers as they come in
 * and tells the people who can fix the key, once.
 *
 * ## Never in the way of a submit
 *
 * `afterSubmit` is called after the grading transaction has COMMITTED, is not
 * awaited, and swallows its own errors into the log. A student handing in a
 * paper must never wait on, or fail because of, an alert about somebody
 * else's question. The alert and its dedup row commit together, so a failed
 * notification leaves nothing behind and the next submit simply tries again.
 *
 * ## Cheap by construction
 *
 * Only questions THIS student answered with an unkeyed option are looked at:
 * a right answer adds weight to the key and can never push a question over
 * the line. On a well-keyed paper that is a handful of versions, and versions
 * already alerted are skipped in the same query. The aggregate that follows is
 * one indexed scan per candidate (`attempt_questions.question_version_id`).
 *
 * ## One alert per version, ever
 *
 * `suspect_key_alerts` is keyed on the version id. Two submits racing over the
 * fifth wrong-looking answer both try the insert; `ON CONFLICT DO NOTHING`
 * lets one through, and only that one writes the notification.
 *
 * ## The audience
 *
 * `NotificationsService.notifyPermission` — the same fan-out every staff alert
 * uses (payments, book orders, المساعد): one `createMany` for everyone whose
 * role holds `question:write`, resolved from the role map rather than
 * `role = 'admin'`. It runs at most once per mis-keyed version, never per
 * submit, so the fixture-admin fan-out on a dev database costs one INSERT per
 * alert and nothing on the papers in between.
 */
@Injectable()
export class KeyWatchService {
  private readonly logger = new Logger(KeyWatchService.name);
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Fire-and-forget, after the submit's own commit. Never throws. */
  afterSubmit(attemptId: string): void {
    const run: Promise<void> = this.checkAttempt(attemptId)
      .then(() => undefined)
      .catch((error: unknown) => {
        this.logger.warn(
          `suspect-key check failed for attempt ${attemptId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      })
      .finally(() => {
        this.inFlight.delete(run);
      });
    this.inFlight.add(run);
  }

  /** Resolves once every check started so far has settled. For specs, and shutdown. */
  async idle(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.all([...this.inFlight]);
  }

  /**
   * Checks the questions on one handed-in paper and raises an alert for each
   * version that has newly crossed the line. Answers with the number raised.
   */
  async checkAttempt(attemptId: string): Promise<number> {
    const candidates = await this.prisma.$queryRaw<{ question_version_id: string; quiz_id: string }[]>`
      SELECT DISTINCT aq."question_version_id", a."quiz_id"
      FROM "app"."attempt_questions" aq
      JOIN "app"."quiz_attempts" a ON a."id" = aq."attempt_id"
      JOIN "app"."question_versions" v ON v."id" = aq."question_version_id"
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(aq."response" -> 'optionIds') = 'array' THEN aq."response" -> 'optionIds' ELSE '[]'::jsonb END
      ) AS opt
      JOIN "app"."question_options" o ON o."question_version_id" = v."id" AND o."id"::text = opt
      WHERE aq."attempt_id" = ${attemptId}::uuid
        AND a."state" IN ('submitted', 'pending_review')
        AND v."type"::text IN ('mcq_single', 'mcq_multi', 'true_false')
        AND o."fraction" <= 0
        AND NOT EXISTS (
          SELECT 1 FROM "app"."suspect_key_alerts" s WHERE s."question_version_id" = aq."question_version_id"
        )
    `;
    if (candidates.length === 0) return 0;

    const quizId = candidates[0]!.quiz_id;
    const verdicts = await this.verdicts(candidates.map((row) => row.question_version_id));

    let raised = 0;
    for (const verdict of verdicts) {
      if (!verdict.suspect || !verdict.topOptionId) continue;
      if (await this.raise(verdict, quizId)) raised += 1;
    }
    return raised;
  }

  /**
   * «أسئلة إجابتها الصح غالبًا متسجّلة غلط» — every alerted version whose
   * answers STILL say the key is wrong, newest alert first.
   */
  async listSuspects(): Promise<SuspectKeyRow[]> {
    const alerts = await this.prisma.suspectKeyAlert.findMany({
      where: { version: { bankEntry: { archivedAt: null } } },
      orderBy: { createdAt: 'desc' },
      select: {
        questionVersionId: true,
        createdAt: true,
        quiz: { select: { lesson: { select: { title: true } } } },
        version: { select: { version: true, bankEntryId: true } },
      },
    });
    if (alerts.length === 0) return [];

    const verdicts = await this.verdicts(alerts.map((alert) => alert.questionVersionId));
    const verdictById = new Map(verdicts.map((verdict) => [verdict.version.id, verdict]));

    // «اتعدّلت» — a newer READY version exists for the same entry. One query
    // for the whole band.
    const latest = await this.prisma.questionVersion.groupBy({
      by: ['bankEntryId'],
      where: { bankEntryId: { in: alerts.map((alert) => alert.version.bankEntryId) }, status: 'ready' },
      _max: { version: true },
    });
    const latestReady = new Map(latest.map((row) => [row.bankEntryId, row._max.version ?? 0]));

    const rows: SuspectKeyRow[] = [];
    for (const alert of alerts) {
      const verdict = verdictById.get(alert.questionVersionId);
      if (!verdict?.suspect || !verdict.topOptionId) continue;
      const texts = optionTexts(verdict.version, verdict.topOptionId);
      rows.push({
        questionVersionId: alert.questionVersionId,
        bankEntryId: alert.version.bankEntryId,
        stemText: stemExcerpt(verdict.version.stemHtml),
        quizTitle: alert.quiz?.lesson.title ?? '',
        pickedText: texts.picked,
        keyText: texts.key,
        picks: verdict.picks,
        answers: verdict.answers,
        edited: (latestReady.get(alert.version.bankEntryId) ?? 0) > alert.version.version,
        alertedAt: alert.createdAt.toISOString(),
      });
    }
    return rows;
  }

  /**
   * The suspect-key verdict for each version, across every handed-in paper
   * that holds it — pooled over quizzes, because the key belongs to the
   * version and every answer to it is evidence about the same key.
   */
  async verdicts(versionIds: readonly string[]): Promise<SuspectVerdict[]> {
    if (versionIds.length === 0) return [];

    const versions = await this.prisma.questionVersion.findMany({
      where: { id: { in: [...versionIds] }, type: { in: [...CHOICE_TYPES] } },
      select: {
        id: true,
        bankEntryId: true,
        type: true,
        stemHtml: true,
        options: { orderBy: { position: 'asc' }, select: { id: true, bodyHtml: true, fraction: true } },
      },
    });
    if (versions.length === 0) return [];

    const pickRows = await this.prisma.$queryRaw<{ question_version_id: string; option_id: string; picks: number }[]>`
      SELECT aq."question_version_id", opt AS option_id, count(*)::int AS picks
      FROM "app"."attempt_questions" aq
      JOIN "app"."quiz_attempts" a ON a."id" = aq."attempt_id"
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(aq."response" -> 'optionIds') = 'array' THEN aq."response" -> 'optionIds' ELSE '[]'::jsonb END
      ) AS opt
      WHERE aq."question_version_id" IN (${Prisma.join(versions.map((version) => version.id))})
        AND a."state"::text IN (${Prisma.join([...GRADED_STATES])})
      GROUP BY 1, 2
    `;
    const picksByVersion = new Map<string, Map<string, number>>();
    for (const row of pickRows) {
      const map = picksByVersion.get(row.question_version_id) ?? new Map<string, number>();
      map.set(row.option_id, row.picks);
      picksByVersion.set(row.question_version_id, map);
    }

    return versions.map((raw) => {
      const version: VersionFacts = {
        ...raw,
        options: raw.options.map((option) => ({ ...option, fraction: Number(option.fraction) })),
      };
      const picks = picksByVersion.get(version.id) ?? new Map<string, number>();
      // Only options that exist on THIS version. An id from another version
      // (a regrade's leftover) is not evidence about this key either way.
      const distractors = version.options
        .map((option) => ({ optionId: option.id, fraction: option.fraction, picks: picks.get(option.id) ?? 0 }))
        .filter((option) => option.picks > 0);
      const answers = distractors.reduce((sum, option) => sum + option.picks, 0);
      const top = distractors.reduce<(typeof distractors)[number] | null>(
        (best, option) => (best === null || option.picks > best.picks ? option : best),
        null,
      );
      return {
        version,
        suspect: distractors.length > 0 && isSuspectKey(distractors),
        topOptionId: top?.optionId ?? null,
        picks: top?.picks ?? 0,
        answers,
      };
    });
  }

  /** The dedup row and the notification, in one transaction. True when this call won. */
  private async raise(verdict: SuspectVerdict, quizId: string): Promise<boolean> {
    const recipients = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.suspectKeyAlert.createMany({
        data: [{ questionVersionId: verdict.version.id, quizId }],
        skipDuplicates: true,
      });
      if (claimed.count === 0) return null;
      return this.notifications.emitToPermission(tx, AUDIENCE, 'suspect_key', {
        questionVersionId: verdict.version.id,
        bankEntryId: verdict.version.bankEntryId,
        quizId,
        pickedOptionId: verdict.topOptionId!,
        picks: verdict.picks,
        answers: verdict.answers,
      });
    });
    if (recipients === null) return false;
    // After the commit, like every other staff alert: the open tabs hear it.
    await this.notifications.announceAll(recipients);
    return true;
  }
}
