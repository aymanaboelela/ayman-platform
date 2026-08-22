import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type {
  AssistantQuestion,
  AssistantQuestionQuery,
} from '@ayman/contracts/assistant/questions';
import type { ListResponse } from '@ayman/contracts/admin/list';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Keeping what students asked, and showing it to the one person who can act.
 *
 * ## Why this exists
 *
 * The chat used to store nothing. That threw away the most valuable thing it
 * produced: a list of questions in students' own words, with a flag on the
 * ones المساعد could not answer. Every one of those is a missing entry in
 * `copy.assistant.knowledge`, already phrased the way the next student will
 * phrase it.
 *
 * ## Recording never breaks answering
 *
 * `record` is called AFTER the answer has finished streaming, and every
 * failure inside it is swallowed with a log line. A student's answer must not
 * depend on an INSERT succeeding — if the write fails, the reply they already
 * read stays read, and the instructor loses one row rather than the student
 * losing the reply.
 */

/**
 * How long a question is kept.
 *
 * Long enough to see a pattern across a term, short enough that a database
 * dump is not a permanent record of what a fifteen-year-old typed at midnight.
 */
const RETENTION_DAYS = 90;

/** A question longer than this was not typed by a student in good faith. */
const MAX_STORED = 4000;

@Injectable()
export class AssistantQuestionService {
  private readonly logger = new Logger(AssistantQuestionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Keep one exchange. Never throws.
   *
   * ⚠️ The arguments carry no identity beyond `userId`. There is deliberately
   * no name, phone, IP or guest token in this signature — see the table's own
   * comment for why the admin screen joins the name at read time instead.
   */
  async record(input: {
    userId: string | null;
    question: string;
    answer: string;
    provider: string | null;
    escalated: boolean;
  }): Promise<void> {
    // Nothing to learn from an empty exchange, and the fallback path can
    // legitimately produce one when a provider dies before its first byte.
    if (!input.question.trim() || !input.answer.trim()) return;

    try {
      await this.prisma.assistantQuestion.create({
        data: {
          userId: input.userId,
          question: input.question.slice(0, MAX_STORED),
          answer: input.answer.slice(0, MAX_STORED),
          provider: input.provider?.slice(0, 120) ?? null,
          escalated: input.escalated,
        },
        select: { id: true },
      });
    } catch (error) {
      /*
       * The MESSAGE and never the question. What a student typed is the thing
       * this table exists to hold carefully; it must not also end up in a log
       * aggregator by way of an error path.
       */
      this.logger.warn(
        `could not record an assistant question: ${error instanceof Error ? error.name : 'unknown'}`,
      );
    }
  }

  /** Newest first, optionally only the ones that needed a person. */
  async list(query: AssistantQuestionQuery): Promise<ListResponse<AssistantQuestion>> {
    const where = {
      ...(query.escalatedOnly ? { escalated: true } : {}),
      /*
       * The search box looks at the QUESTION only, never the answer. Somebody
       * hunting for «الملخص» wants the students who asked about it, and
       * matching the answer would return every row the same paragraph was
       * sent to.
       */
      ...(query.q ? { question: { contains: query.q, mode: 'insensitive' as const } } : {}),
    };

    const [rows, rowCount] = await Promise.all([
      this.prisma.assistantQuestion.findMany({
        where,
        orderBy: { createdAt: query.dir },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        select: {
          id: true,
          question: true,
          answer: true,
          provider: true,
          escalated: true,
          createdAt: true,
          // Joined, not stored — deleting the account removes the name and
          // leaves the question.
          user: { select: { name: true } },
        },
      }),
      this.prisma.assistantQuestion.count({ where }),
    ]);

    return {
      rows: rows.map((row) => ({
        id: row.id,
        question: row.question,
        answer: row.answer,
        provider: row.provider,
        escalated: row.escalated,
        studentName: row.user?.name ?? null,
        askedAt: row.createdAt.toISOString(),
      })),
      rowCount,
    };
  }

  /**
   * Drop what is older than the retention window.
   *
   * In application code rather than a database job so it is visible to anyone
   * reading this module and testable without a scheduler. Runs daily; a missed
   * day costs nothing because the next sweep takes everything expired.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async sweep(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    try {
      const { count } = await this.prisma.assistantQuestion.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      if (count > 0) this.logger.log(`swept ${count} assistant questions older than ${RETENTION_DAYS} days`);
    } catch (error) {
      this.logger.warn(
        `assistant question sweep failed: ${error instanceof Error ? error.name : 'unknown'}`,
      );
    }
  }
}
