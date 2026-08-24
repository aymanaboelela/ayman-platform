import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type {
  AssistantQuestion,
  AssistantQuestionContext,
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
 *
 * ## `context()` and the conversation link — a reconstruction, not a fact
 *
 * There is no session id on this table by design (see `record`'s signature),
 * so "what else did this student ask in the same visit" and "did this turn
 * into a real conversation" are both computed after the fact from `userId` +
 * time proximity. That is honest for a signed-in student and impossible for a
 * guest — a guest's second question five minutes later is indistinguishable
 * from a different visitor entirely, since nothing ties the two requests
 * together. `isGuest` on every row says so rather than the screen silently
 * showing an empty sibling list that reads as "asked once".
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

/**
 * How far apart two questions from the same student may be and still count
 * as "the same visit" for `context()`'s sibling list.
 *
 * Three hours comfortably covers one sitting with the widget open in a
 * background tab, without pulling in a question from a different day.
 */
const SIBLING_WINDOW_MS = 3 * 60 * 60 * 1000;

/** How many sibling rows the detail view shows before it stops being a quick read. */
const MAX_SIBLINGS = 20;

interface ConversationCandidate {
  id: string;
  createdAt: Date;
}

/** The candidate whose `createdAt` is closest to `at`, or `null` for an empty list. */
function nearestTo<T extends ConversationCandidate>(candidates: T[], at: Date): T | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, candidate) =>
    Math.abs(candidate.createdAt.getTime() - at.getTime()) <
    Math.abs(best.createdAt.getTime() - at.getTime())
      ? candidate
      : best,
  );
}

type QuestionRow = {
  id: string;
  userId: string | null;
  question: string;
  answer: string;
  provider: string | null;
  escalated: boolean;
  createdAt: Date;
  user: { name: string } | null;
};

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
          userId: true,
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

    const conversationByQuestionId = await this.nearestConversationsFor(rows);

    return {
      rows: rows.map((row) => ({
        id: row.id,
        question: row.question,
        answer: row.answer,
        provider: row.provider,
        escalated: row.escalated,
        studentName: row.user?.name ?? null,
        isGuest: row.userId === null,
        conversationId: conversationByQuestionId.get(row.id) ?? null,
        askedAt: row.createdAt.toISOString(),
      })),
      rowCount,
    };
  }

  /**
   * "Did this student ever open a real conversation" — for the ESCALATED rows
   * of one page only, in ONE query rather than one `findFirst` per row. A
   * page is at most `perPage` (50 today) rows, so the distinct `userId` set
   * is small; the per-row winner is picked in memory by `nearestTo`.
   */
  private async nearestConversationsFor(
    rows: Pick<QuestionRow, 'id' | 'userId' | 'escalated' | 'createdAt'>[],
  ): Promise<Map<string, string>> {
    const userIds = [...new Set(rows.filter((r) => r.escalated && r.userId).map((r) => r.userId!))];
    if (userIds.length === 0) return new Map();

    const conversations = await this.prisma.conversation.findMany({
      where: { userId: { in: userIds } },
      select: { id: true, userId: true, createdAt: true },
    });

    const byUser = new Map<string, ConversationCandidate[]>();
    for (const conv of conversations) {
      if (!conv.userId) continue;
      const list = byUser.get(conv.userId) ?? [];
      list.push({ id: conv.id, createdAt: conv.createdAt });
      byUser.set(conv.userId, list);
    }

    const winnerByQuestionId = new Map<string, string>();
    for (const row of rows) {
      if (!row.escalated || !row.userId) continue;
      const nearest = nearestTo(byUser.get(row.userId) ?? [], row.createdAt);
      if (nearest) winnerByQuestionId.set(row.id, nearest.id);
    }
    return winnerByQuestionId;
  }

  /**
   * One exchange, what else this student asked around the same time, and
   * whether any of it turned into a real conversation.
   */
  async context(id: string): Promise<AssistantQuestionContext> {
    const question = await this.prisma.assistantQuestion.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        question: true,
        answer: true,
        provider: true,
        escalated: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    });
    if (!question) throw new NotFoundException();

    if (!question.userId) {
      // A guest has no stable identity across requests — see the class
      // comment. Nothing to reconstruct and nothing to link.
      return { question: this.toRow(question), siblings: [], conversation: null };
    }

    const windowStart = new Date(question.createdAt.getTime() - SIBLING_WINDOW_MS);
    const windowEnd = new Date(question.createdAt.getTime() + SIBLING_WINDOW_MS);

    const [siblingRows, conversations] = await Promise.all([
      this.prisma.assistantQuestion.findMany({
        where: {
          userId: question.userId,
          id: { not: question.id },
          createdAt: { gte: windowStart, lte: windowEnd },
        },
        orderBy: { createdAt: 'asc' },
        take: MAX_SIBLINGS,
        select: {
          id: true,
          userId: true,
          question: true,
          answer: true,
          provider: true,
          escalated: true,
          createdAt: true,
          user: { select: { name: true } },
        },
      }),
      this.prisma.conversation.findMany({
        where: { userId: question.userId },
        select: { id: true, status: true, createdAt: true },
      }),
    ]);

    const conversation = nearestTo(
      conversations.map((c) => ({ id: c.id, createdAt: c.createdAt, status: c.status })),
      question.createdAt,
    );

    return {
      question: this.toRow(question),
      siblings: siblingRows.map((row) => this.toRow(row)),
      conversation: conversation
        ? { id: conversation.id, status: conversation.status, startedAt: conversation.createdAt.toISOString() }
        : null,
    };
  }

  private toRow(row: QuestionRow): AssistantQuestion {
    return {
      id: row.id,
      question: row.question,
      answer: row.answer,
      provider: row.provider,
      escalated: row.escalated,
      studentName: row.user?.name ?? null,
      isGuest: row.userId === null,
      // Only `list()` computes the conversation link for the row it renders
      // as a badge; the sibling rows inside `context()` are shown as plain
      // text, so this is always `null` here rather than a second N+1 lookup
      // for information the dialog does not surface per-sibling.
      conversationId: null,
      askedAt: row.createdAt.toISOString(),
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
