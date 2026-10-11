import type { Exposure } from '@ayman/contracts/quiz/challenges';
import { Prisma } from '../../generated/prisma/client';

/** أي حاجة بتعرف تعمل raw SQL — `PrismaService` أو ترانزاكشن. */
type Db = Pick<Prisma.TransactionClient, '$executeRaw' | '$queryRaw'>;

/**
 * «ماتكرّرش السؤال» — الطالب ده شاف الأسئلة دي دلوقتي. صف لكل سؤال
 * (`e:<entry>`) وصف لمجموعة صيغه لو ليه (`g:<key>`) — شوف `QuestionExposure`.
 *
 * الوقت بساعة Postgres بـUTC (`now() AT TIME ZONE 'utc'`) زي ما Prisma
 * بيكتب `timestamp` من غير منطقة — مش `now()` لوحده، اللي بيتكتب بتوقيت
 * السيرفر المحلي ويخلّي «آخر مرة» قدّام ساعتين في الترتيب.
 */
export async function recordExposures(db: Db, userIds: readonly string[], versionIds: readonly string[]): Promise<void> {
  if (userIds.length === 0 || versionIds.length === 0) return;
  await db.$executeRaw(Prisma.sql`
    INSERT INTO "app"."question_exposures" ("user_id", "group_key", "last_seen_at", "times")
    SELECT u, k.key, (now() AT TIME ZONE 'utc'), 1
    FROM unnest(${[...new Set(userIds)]}::text[]) AS u
    CROSS JOIN (
      SELECT 'e:' || be."id"::text AS key
      FROM "app"."question_versions" v
      JOIN "app"."question_bank_entries" be ON be."id" = v."bank_entry_id"
      WHERE v."id" = ANY(${[...new Set(versionIds)]}::uuid[])
      UNION
      SELECT 'g:' || be."variant_group_key"
      FROM "app"."question_versions" v
      JOIN "app"."question_bank_entries" be ON be."id" = v."bank_entry_id"
      WHERE v."id" = ANY(${[...new Set(versionIds)]}::uuid[]) AND be."variant_group_key" IS NOT NULL
    ) AS k
    ON CONFLICT ("user_id", "group_key") DO UPDATE
      SET "last_seen_at" = EXCLUDED."last_seen_at", "times" = "app"."question_exposures"."times" + 1
  `);
}

/**
 * كل اللي الطلبة دول شافوه، متجمّع: «آخر مرة» = آخر واحد فيهم شافه،
 * و«كام مرة» = مجموعهم. لطالب واحد ده هو نفسه؛ للساحة ده اللي بيخلّي الماتش
 * يقدّم الأسئلة اللي **الاتنين** ماشافوهاش.
 */
export async function exposuresOf(db: Db, userIds: readonly string[]): Promise<Map<string, Exposure>> {
  if (userIds.length === 0) return new Map();
  const rows = await db.$queryRaw<Array<{ group_key: string; at: Date; times: number }>>(Prisma.sql`
    SELECT "group_key", max("last_seen_at") AS at, sum("times")::int AS times
    FROM "app"."question_exposures"
    WHERE "user_id" = ANY(${[...new Set(userIds)]}::text[])
    GROUP BY "group_key"
  `);
  return new Map(rows.map((row) => [row.group_key, { at: row.at.getTime(), times: row.times }]));
}
