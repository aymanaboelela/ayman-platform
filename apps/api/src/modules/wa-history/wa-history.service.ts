import { Injectable } from '@nestjs/common';
import type { WaHistoryEntry, WaHistorySummary } from '@ayman/contracts/marketing/wa-history';
import { PrismaService } from '../../prisma/prisma.service';
import { chatPhone, WaBotIdentityService } from '../wa-bot/wa-bot-identity.service';

/** One phone, after the batch's duplicates are folded together. */
interface Folded {
  hasChat: boolean;
  theyWrote: boolean;
  inboundCount: number;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
}

function later(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

/**
 * «مين كلّمني على واتساب» — keeping what the sidecar reports from the linked
 * number's one-time history sync. See `marketing/wa-history.ts` in the
 * contracts for the whole story, and the `WaHistoryChat` model for why this
 * is a table of its own and not rows in the bot's inbox.
 *
 * Nothing here ever sends anything, schedules a reply or marks a lead: the
 * rows are only ever read back as "does this phone have a chat".
 */
@Injectable()
export class WaHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: WaBotIdentityService,
  ) {}

  /**
   * One batch from the sidecar, merged into what is already stored.
   *
   * ## The merge only ever ADDS knowledge
   *
   * The sync arrives in chunks and the sidecar posts running totals, retrying
   * a batch that failed — so the same phone can arrive twice with the same or
   * a larger count. `has_chat`/`they_wrote` are OR-ed, the count and the two
   * timestamps take the GREATEST, and a retried batch is therefore a no-op
   * rather than a double count. A relink of the same number re-sends the same
   * window and changes nothing either.
   *
   * The identity is the one thing replaced: it is a cache of "who is this
   * number NOW", and the latest answer is the right one.
   */
  async ingest(entries: readonly WaHistoryEntry[], now = new Date()): Promise<{ stored: number; skipped: number }> {
    const byPhone = new Map<string, Folded>();
    let skipped = 0;

    for (const entry of entries) {
      const phone = chatPhone(entry.phone);
      if (!phone) {
        skipped += 1;
        continue;
      }
      const prior = byPhone.get(phone);
      // A message from them implies the chat — the CHECK constraint says so too.
      const hasChat = entry.hasChat || entry.theyWroteToUs;
      byPhone.set(phone, {
        hasChat: (prior?.hasChat ?? false) || hasChat,
        theyWrote: (prior?.theyWrote ?? false) || entry.theyWroteToUs,
        inboundCount: Math.max(prior?.inboundCount ?? 0, entry.inboundCount),
        lastMessageAt: later(prior?.lastMessageAt ?? null, entry.lastMessageAt),
        lastInboundAt: later(prior?.lastInboundAt ?? null, entry.lastInboundAt),
      });
    }
    if (byPhone.size === 0) return { stored: 0, skipped };

    const phones: string[] = [];
    const userIds: (string | null)[] = [];
    const whos: string[] = [];
    const hasChat: boolean[] = [];
    const wrote: boolean[] = [];
    const counts: number[] = [];
    const lastMessage: (string | null)[] = [];
    const lastInbound: (string | null)[] = [];

    // One phone at a time through the SAME lookup the inbox uses, so a number
    // is a student here exactly when it would be one in «محادثات الواتساب».
    // Sequential on purpose: this is a one-off import of a few thousand rows,
    // and a burst of parallel lookups would compete with live traffic for
    // nothing the admin is waiting on.
    for (const [phone, folded] of byPhone) {
      const who = await this.identity.identify(phone);
      phones.push(phone);
      userIds.push(who.userId);
      whos.push(who.who);
      hasChat.push(folded.hasChat);
      wrote.push(folded.theyWrote);
      counts.push(folded.inboundCount);
      lastMessage.push(folded.lastMessageAt);
      lastInbound.push(folded.lastInboundAt);
    }

    /*
     * The timestamps travel as ISO strings and are converted IN SQL
     * (`::timestamptz AT TIME ZONE 'UTC'`), not as `Date` parameters: an array
     * of Dates is serialised by the driver in the PROCESS's timezone, and a
     * cast to `timestamp` (no zone) would then keep Cairo wall-clock time in a
     * column every other writer fills with UTC.
     */
    const stamp = now.toISOString();
    await this.prisma.$executeRaw`
      INSERT INTO "app"."wa_history_chats" AS h
        ("phone", "user_id", "who", "has_chat", "they_wrote", "inbound_count",
         "last_message_at", "last_inbound_at", "synced_at", "created_at")
      SELECT t."phone", t."user_id", t."who"::"app"."wa_chat_who", t."has_chat", t."they_wrote", t."inbound_count",
             (t."last_message_at"::timestamptz AT TIME ZONE 'UTC'),
             (t."last_inbound_at"::timestamptz AT TIME ZONE 'UTC'),
             (${stamp}::timestamptz AT TIME ZONE 'UTC'),
             (${stamp}::timestamptz AT TIME ZONE 'UTC')
      FROM unnest(
        ${phones}::text[], ${userIds}::text[], ${whos}::text[], ${hasChat}::boolean[],
        ${wrote}::boolean[], ${counts}::int[], ${lastMessage}::text[], ${lastInbound}::text[]
      ) AS t("phone", "user_id", "who", "has_chat", "they_wrote", "inbound_count", "last_message_at", "last_inbound_at")
      ON CONFLICT ("phone") DO UPDATE SET
        "user_id" = EXCLUDED."user_id",
        "who" = EXCLUDED."who",
        "has_chat" = h."has_chat" OR EXCLUDED."has_chat",
        "they_wrote" = h."they_wrote" OR EXCLUDED."they_wrote",
        "inbound_count" = GREATEST(h."inbound_count", EXCLUDED."inbound_count"),
        "last_message_at" = GREATEST(h."last_message_at", EXCLUDED."last_message_at"),
        "last_inbound_at" = GREATEST(h."last_inbound_at", EXCLUDED."last_inbound_at"),
        "synced_at" = EXCLUDED."synced_at"
    `;

    return { stored: phones.length, skipped };
  }

  /**
   * What the screens say about it: whether any history ever arrived, and how
   * many chats that is. `chats` counts the inbox too, the same union the
   * filters use, so «١٢٠٠ رقم ليهم محادثة» is the size of «كلّموني».
   */
  async summary(): Promise<WaHistorySummary> {
    const [latest, rows] = await Promise.all([
      this.prisma.waHistoryChat.findFirst({ orderBy: [{ syncedAt: 'desc' }, { phone: 'asc' }], select: { syncedAt: true } }),
      this.prisma.$queryRaw<{ chats: bigint; wrote: bigint; students: bigint; parents: bigint }[]>`
        SELECT
          (SELECT count(*) FROM (
             SELECT "phone" FROM "app"."wa_history_chats" WHERE "has_chat"
             UNION
             SELECT "phone" FROM "app"."wa_chats"
           ) AS u) AS "chats",
          count(*) FILTER (WHERE "they_wrote") AS "wrote",
          count(*) FILTER (WHERE "has_chat" AND "who" = 'student') AS "students",
          count(*) FILTER (WHERE "has_chat" AND "who" = 'parent') AS "parents"
        FROM "app"."wa_history_chats"
      `,
    ]);
    const row = rows[0];
    return {
      syncedAt: latest?.syncedAt.toISOString() ?? null,
      chats: Number(row?.chats ?? 0),
      wrote: Number(row?.wrote ?? 0),
      students: Number(row?.students ?? 0),
      parents: Number(row?.parents ?? 0),
    };
  }
}
