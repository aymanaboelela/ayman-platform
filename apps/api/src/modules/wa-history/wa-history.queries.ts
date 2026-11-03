import type { PrismaService } from '../../prisma/prisma.service';

/**
 * «كلّمني / مكلّمنيش» as two plain reads, shared by the campaign audience and
 * the students list.
 *
 * Functions over the caller's own `PrismaService` rather than a service to
 * inject: both callers already hold one, and threading a new constructor
 * parameter through `StudentsService` and `AudienceService` would touch every
 * spec that builds them by hand for a query that needs nothing else.
 *
 * ## What "has a chat" means
 *
 * EITHER source is enough:
 *
 *   · `wa_history_chats.has_chat` — the chat was on the number when it was
 *     linked (the one-time history sync);
 *   · a `wa_chats` row — they wrote to it after linking (the bot's inbox).
 *
 * `they_wrote` is deliberately NOT the test. The phone syncs only recent
 * messages, so a student who last wrote two years ago has a chat whose synced
 * window holds nothing from them — and that chat still exists, which is what
 * decides whether WhatsApp treats the next message as a new-chat initiation.
 */

/** Of `phones` (E.164), the ones with a chat on the linked number. */
export async function chattedPhones(prisma: PrismaService, phones: readonly string[]): Promise<Set<string>> {
  if (phones.length === 0) return new Set();
  const list = [...new Set(phones)];
  const [history, inbox] = await Promise.all([
    prisma.waHistoryChat.findMany({ where: { phone: { in: list }, hasChat: true }, select: { phone: true } }),
    prisma.waChat.findMany({ where: { phone: { in: list } }, select: { phone: true } }),
  ]);
  return new Set([...history, ...inbox].map((row) => row.phone));
}

/**
 * Every student profile whose OWN number has a chat on the linked number.
 *
 * Matched three ways, any one enough: the profile's phone (copied from
 * `users.phone_number` at sign-up, E.164), the account's phone, and the
 * `user_id` the ingest stamped through `WaBotIdentityService.identify` — which
 * is how a chat matched to the student at ingest time stays matched after the
 * number on the account is edited. `who = 'student'` on that last one: a
 * parent's chat carries the CHILD's id, and the parent having written is not
 * the student having written.
 *
 * Three equi-joins under a UNION rather than one join on an OR: an OR across
 * columns turns the join into a nested loop over every profile × every chat,
 * and these are the two tables on this screen that grow with the cohort.
 */
export async function studentIdsWithWaChat(prisma: PrismaService): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ user_id: string }[]>`
    WITH chatted AS (
      SELECT "phone", "user_id", "who" FROM "app"."wa_history_chats" WHERE "has_chat"
      UNION ALL
      SELECT "phone", "user_id", "who" FROM "app"."wa_chats"
    )
    SELECT sp."user_id" FROM "app"."student_profiles" sp
      JOIN chatted c ON c."phone" = sp."phone"::text
    UNION
    SELECT sp."user_id" FROM "app"."student_profiles" sp
      JOIN "app"."users" u ON u."id" = sp."user_id"
      JOIN chatted c ON c."phone" = u."phone_number"
    UNION
    SELECT sp."user_id" FROM "app"."student_profiles" sp
      JOIN chatted c ON c."who" = 'student' AND c."user_id" = sp."user_id"
  `;
  return rows.map((row) => row.user_id);
}
