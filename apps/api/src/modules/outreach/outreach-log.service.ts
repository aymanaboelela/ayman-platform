import { Injectable } from '@nestjs/common';
import type { ListResponse } from '@ayman/contracts/admin/list';
import {
  OutreachFactsSchema,
  type OutreachLogFilter,
  type OutreachLogRow,
  type OutreachPreview,
  type OutreachStats,
} from '@ayman/contracts/outreach/admin';
import { composeOutreach, type OutreachFacts } from '@ayman/contracts/outreach/compose';
import { OUTREACH_KINDS } from '@ayman/contracts/outreach/kinds';
import { PrismaService } from '../../prisma/prisma.service';
import { OutreachService } from './outreach.service';
import type { Prisma } from '../../generated/prisma/client';

/**
 * The read side of «رسايل م. أيمن» — what went out under his name.
 *
 * Separate from `OutreachService` because they answer to different pressures.
 * That one runs sixty times an hour inside a cron and must stay narrow; this
 * one runs when he opens a screen and is allowed to join four tables to do it.
 * Mixing them would put a page-sized query on the delivery path.
 */

/** Sample facts for the preview. Invented, obviously — and obviously enough
 *  that nobody mistakes the screen for real student data. */
const PREVIEW_FACTS: Record<string, OutreachFacts> = {
  quiz_result: {
    kind: 'quiz_result',
    quizTitle: 'الحلقات التكرارية',
    scorePercent: 65,
    weakTopics: [
      { name: 'الحلقات المتداخلة', questionNumbers: [3, 7] },
      { name: 'شرط الخروج', questionNumbers: [5] },
    ],
    strongTopics: ['المتغيرات'],
  },
  quiz_nudge: { kind: 'quiz_nudge', lessonTitle: 'مقدمة عن البرمجة' },
  lesson_praise: { kind: 'lesson_praise', lessonTitle: 'تاريخ الحاسب' },
  whatsapp_invite: { kind: 'whatsapp_invite' },
};

/** Three per kind. One proves the wording exists; three prove it moves. */
const SAMPLES_PER_KIND = 3;

@Injectable()
export class OutreachLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outreach: OutreachService,
  ) {}

  async list(
    filter: OutreachLogFilter,
    take: number,
    skip: number,
  ): Promise<ListResponse<OutreachLogRow>> {
    const where: Prisma.OutreachMessageWhereInput = filter === 'all' ? {} : { kind: filter };

    const [rows, rowCount] = await Promise.all([
      this.prisma.outreachMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          kind: true,
          userId: true,
          facts: true,
          createdAt: true,
          conversationId: true,
          user: { select: { name: true } },
          message: { select: { body: true, createdAt: true } },
          conversation: {
            select: {
              visitorReadAt: true,
              // Just enough to answer "did they write back AFTER this". Not the
              // thread: twenty rows each dragging a full conversation along is
              // the N+1 the inbox list documents avoiding for the same reason.
              messages: {
                where: { author: 'visitor' },
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { createdAt: true },
              },
            },
          },
        },
      }),
      this.prisma.outreachMessage.count({ where }),
    ]);

    return { rows: rows.map((row) => toLogRow(row)), rowCount };
  }

  async stats(): Promise<OutreachStats> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [sent, sentRecent, seen, replied] = await Promise.all([
      this.prisma.outreachMessage.count(),
      this.prisma.outreachMessage.count({ where: { createdAt: { gte: since } } }),
      /*
       * "Seen" is the student having opened the thread SINCE the message
       * landed, which is a comparison between two columns on two tables —
       * `conversations.visitor_read_at` against `conversation_messages
       * .created_at`. Prisma cannot express a column-to-column comparison, so
       * this counts the weaker, honest proxy: the thread has been read at all
       * since the message was written. `visitorReadAt` only ever moves forward
       * and only the student moves it, so the proxy over-counts by exactly the
       * messages a student read and then received another one after — which
       * the per-row `seen` below resolves precisely.
       */
      this.prisma.outreachMessage.count({
        where: { conversation: { visitorReadAt: { not: null } } },
      }),
      this.prisma.outreachMessage.count({
        where: { conversation: { messages: { some: { author: 'visitor' } } } },
      }),
    ]);
    return { sent, sentRecent, seen, replied };
  }

  /**
   * The real composer, on invented facts.
   *
   * Deliberately not a hand-written mock-up of what the messages "look like":
   * the whole question the screen answers is «هي فعلاً بتتغيّر؟», and only the
   * actual composer can answer it. The samples are seeded off their index and
   * fed each other's variant keys, so what he reads is three genuinely
   * different messages rather than three renderings of one.
   */
  async preview(): Promise<OutreachPreview> {
    const { whatsappUrl } = await this.outreach.context();
    const samples: OutreachPreview['samples'] = [];
    const history: string[] = [];

    for (const kind of OUTREACH_KINDS) {
      for (let index = 0; index < SAMPLES_PER_KIND; index += 1) {
        const composed = composeOutreach({
          firstName: 'محمد',
          facts: PREVIEW_FACTS[kind]!,
          recentVariantKeys: [...history],
          whatsappUrl,
          seed: `preview:${kind}:${index}`,
        });
        history.unshift(composed.variantKey);
        samples.push({ kind, body: composed.body });
      }
    }

    return { samples };
  }
}

interface LogRowSource {
  id: string;
  kind: string;
  userId: string;
  facts: Prisma.JsonValue;
  createdAt: Date;
  conversationId: string;
  user: { name: string } | null;
  message: { body: string; createdAt: Date } | null;
  conversation: { visitorReadAt: Date | null; messages: { createdAt: Date }[] } | null;
}

function toLogRow(row: LogRowSource): OutreachLogRow {
  const sentAt = row.message?.createdAt ?? row.createdAt;
  const lastVisitorMessage = row.conversation?.messages[0]?.createdAt ?? null;
  const visitorRead = row.conversation?.visitorReadAt ?? null;

  return {
    id: row.id,
    kind: row.kind as OutreachLogRow['kind'],
    userId: row.userId,
    studentName: row.user?.name ?? '',
    conversationId: row.conversationId,
    // The message row is the source of truth for what was said; `facts` says
    // why. An empty body can only mean the message was deleted out from under
    // the ledger, which the FK makes impossible — the fallback is defensive.
    body: row.message?.body ?? '',
    /*
     * Parsed, not cast. `facts` is jsonb written by whatever build was
     * deployed at the time, and a row from an older shape must not take the
     * whole page down — `catch` gives the renderer something it can branch on.
     */
    facts: OutreachFactsSchema.safeParse(row.facts).data ?? { kind: 'whatsapp_invite' },
    createdAt: sentAt.toISOString(),
    seen: visitorRead !== null && visitorRead >= sentAt,
    replied: lastVisitorMessage !== null && lastVisitorMessage > sentAt,
  };
}
