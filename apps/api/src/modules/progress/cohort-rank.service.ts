import { Injectable } from '@nestjs/common';
import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';
import { RANK_POINTS, type CohortRank } from '@ayman/contracts/rank';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * الدفعة بتتحسب مرة كل خمس دقايق، والطالب نفسه بيتحسب لايف في كل طلب.
 *
 * الكويري بتاعة الدفعة بتمشي على كل محاولات سنة كاملة (آلاف الطلبة × عشرات
 * الكويزات)، ومفيش سبب تتكرر مع كل فتحة صفحة. لكن الطالب اللي لسه مخلّص كويز
 * وداخل يشوف اتقدّم ولا لأ لازم يلاقي نقطه الجديدة — فصفّه هو بيتحسب من الأول
 * وبيتحط مكان صفه القديم في الكاش قبل الترتيب.
 */
const COHORT_TTL_MS = 5 * 60 * 1000;

/** «٩٩٫٩٩٥» مش ١٠٠، عشان `scaled_score / grade_out_of * 100` على Decimal
 *  ممكن يطلع ٩٩٫٩٩٩٩٩ لورقة كاملة. */
const FULL_MARK = 99.995;

/** وزن كل جزء في القرص. الواجب أقل لأنه «سلّمت ولا لأ»، مش درجة. */
const AVERAGE_WEIGHTS = { quizzes: 0.4, exams: 0.4, homework: 0.2 } as const;

interface ScoreRow {
  user_id: string;
  full_name: string;
  points: number;
  quiz_n: number;
  quiz_avg: number | null;
  quiz_full: number;
  exam_n: number;
  exam_avg: number | null;
  exam_full: number;
  pending_n: number;
  hw_submitted: number;
  hw_accepted: number;
  hw_owed: number;
}

export interface CohortEntry {
  userId: string;
  name: string;
  points: number;
}

interface CohortKey {
  systemId: string | null;
  year: number;
}

@Injectable()
export class CohortRankService {
  private readonly cache = new Map<string, { at: number; rows: CohortEntry[] }>();

  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: string): Promise<CohortRank> {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
      select: { year: true, systemId: true },
    });

    const [mine] = await this.scores(Prisma.sql`sp."user_id" = ${userId}`, false);
    const me = mine ?? emptyRow(userId);

    if (profile?.year == null) {
      return {
        cohort: null,
        me: { ...stats(me), rank: null, betterThanPercent: null },
        pointsToNextRank: null,
        podium: [],
        ladder: [],
        computedAt: new Date().toISOString(),
      };
    }

    const key: CohortKey = { systemId: profile.systemId, year: profile.year };
    const [cached, label] = await Promise.all([this.cohort(key), this.cohortLabel(key)]);
    const placed = standing(cached.rows, { userId, name: shortName(me.full_name), points: me.points });

    return {
      cohort: { label, size: cached.rows.filter((row) => row.userId !== userId).length + 1 },
      me: { ...stats(me), ...placed.me },
      pointsToNextRank: placed.pointsToNextRank,
      podium: placed.podium,
      ladder: placed.ladder,
      computedAt: new Date(cached.at).toISOString(),
    };
  }

  /** للتستات: الكاش عايش في الـinstance، والسبك الواحد بيبني دفعات ورا بعض. */
  clearCache(): void {
    this.cache.clear();
  }

  private async cohort(key: CohortKey): Promise<{ at: number; rows: CohortEntry[] }> {
    const cacheKey = `${key.systemId ?? '-'}:${key.year}`;
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < COHORT_TTL_MS) return hit;

    /*
     * الدفعة = نفس السنة، ونفس النظام لو الاتنين عارفينه.
     *
     * البروفايلات اللي اتعملت قبل سؤال النظام `system_id` فيها NULL. لو
     * اتقسموا لوحدهم كانوا هيبقوا «دفعة» من خمسة وكل واحد فيهم «الأول»؛
     * فبيدخلوا مع سنتهم. والتمن إن اللي نظامه NULL بيتقارن بالسنة كلها — وده
     * أقرب للحقيقة من إنه يتقارن بنفسه.
     *
     * ولازم يكون مشترك في كورس واحد على الأقل: اللي عمل حساب وعمره ما فتح
     * حاجة مش «دفعة»، وكان هيخلّي «أحسن من ٩٠٪» رقم منفوخ.
     */
    const rows = await this.scores(
      Prisma.sql`sp."year" = ${key.year}
        AND (${key.systemId}::uuid IS NULL OR sp."system_id" IS NULL OR sp."system_id" = ${key.systemId}::uuid)
        AND EXISTS (SELECT 1 FROM "app"."enrollments" en WHERE en."user_id" = sp."user_id")`,
      true,
    );
    const entry = {
      at: Date.now(),
      rows: rows.map((row) => ({ userId: row.user_id, name: shortName(row.full_name), points: row.points })),
    };
    this.cache.set(cacheKey, entry);
    return entry;
  }

  private async cohortLabel(key: CohortKey): Promise<string> {
    const year = await this.prisma.academicYear.findFirst({
      where: { year: key.year, ...(key.systemId ? { systemId: key.systemId } : {}) },
      orderBy: { system: { sortOrder: 'asc' } },
      select: { labelAr: true },
    });
    return year?.labelAr ?? '';
  }

  /**
   * النقط وتفاصيلها لكل طالب بيعدّي الشرط.
   *
   * `studentsOnly` بيقفل الدفعة على `role = 'student'` ومن غير المحظورين. لصف
   * الطالب نفسه بيبقى مفتوح: أدمن داخل يجرّب الصفحة لازم يشوف نقطه هو، حتى لو
   * مش جوّه أي دفعة.
   *
   * `condition` مكتوب في الملف ده بس — أي قيمة من برّه بتدخل كـparameter.
   *
   * ⚠️ مفيش backtick جوّه الـSQL: backtick في كومنت جوّه `Prisma.sql` بيقفل
   * التمبلت (`new-admin-screen-traps`).
   */
  private async scores(condition: Prisma.Sql, studentsOnly: boolean): Promise<ScoreRow[]> {
    const roleFilter = studentsOnly
      ? Prisma.sql`AND u."role" = 'student' AND u."banned_at" IS NULL`
      : Prisma.empty;

    return this.prisma.$queryRaw<ScoreRow[]>(Prisma.sql`
      WITH cohort AS (
        SELECT sp."user_id", sp."full_name"
        FROM "app"."student_profiles" sp
        JOIN "app"."users" u ON u."id" = sp."user_id" ${roleFilter}
        WHERE ${condition}
      ),
      -- أحسن محاولة في كل كويز. pct_any بيحسب الورق اللي لسه بيتصحح بدرجته
      -- المؤقتة (المقالي صفر لحد ما يتصحح، فالنقط بعد التصحيح بتزيد بس).
      -- pct_final للمتوسط، من غير الورق المعلّق: متوسط فيه أصفار محدش حطّها
      -- هو بالظبط الرقم الغلط اللي mark-split.ts اتعمل عشانه.
      best AS (
        SELECT a."user_id", a."quiz_id",
          max(CASE WHEN a."grade_out_of" > 0
                THEN least(100, a."scaled_score" / a."grade_out_of" * 100) ELSE 0 END)::float8 AS pct_any,
          max(CASE WHEN a."state" = 'submitted' AND a."grade_out_of" > 0
                THEN least(100, a."scaled_score" / a."grade_out_of" * 100) END)::float8 AS pct_final,
          bool_and(a."state" = 'pending_review') AS all_pending
        FROM "app"."quiz_attempts" a
        JOIN cohort c ON c."user_id" = a."user_id"
        WHERE a."state" IN ('submitted', 'pending_review') AND a."submitted_at" IS NOT NULL
        GROUP BY 1, 2
      ),
      -- امتحان ولا كويز؟ مفيش عمود بيقول: امتحان نص الشهر هو أي كويز على رف
      -- EXAM_SHELF_TITLE، وامتحان الكورس هو courses.exam_lesson_id. الـCOALESCE
      -- لأن exam_lesson_id غالبًا NULL، و«false OR NULL» = NULL، وNULL في FILTER
      -- بيوقّع الكويز من العدّين الاتنين وبيسيب نقطه.
      typed AS (
        SELECT b.*, COALESCE(s."title" = ${EXAM_SHELF_TITLE} OR co."exam_lesson_id" = l."id", false) AS is_exam
        FROM best b
        JOIN "app"."quizzes" q ON q."id" = b."quiz_id"
        JOIN "app"."lessons" l ON l."id" = q."lesson_id"
        JOIN "app"."course_sections" s ON s."id" = l."section_id"
        JOIN "app"."courses" co ON co."id" = l."course_id"
      ),
      qz AS (
        SELECT "user_id",
          count(*) FILTER (WHERE NOT is_exam)::int AS quiz_n,
          avg(pct_final) FILTER (WHERE NOT is_exam)::float8 AS quiz_avg,
          count(*) FILTER (WHERE NOT is_exam AND pct_any >= ${FULL_MARK})::int AS quiz_full,
          count(*) FILTER (WHERE is_exam)::int AS exam_n,
          avg(pct_final) FILTER (WHERE is_exam)::float8 AS exam_avg,
          count(*) FILTER (WHERE is_exam AND pct_any >= ${FULL_MARK})::int AS exam_full,
          count(*) FILTER (WHERE all_pending)::int AS pending_n,
          sum(CASE WHEN is_exam
                THEN round(pct_any * ${RANK_POINTS.examPerPercent})
                     + CASE WHEN pct_any >= ${FULL_MARK} THEN ${RANK_POINTS.examFullMarkBonus} ELSE 0 END
                ELSE round(pct_any * ${RANK_POINTS.quizPerPercent})
                     + CASE WHEN pct_any >= ${FULL_MARK} THEN ${RANK_POINTS.quizFullMarkBonus} ELSE 0 END
              END)::int AS pts
        FROM typed GROUP BY 1
      ),
      hw AS (
        SELECT h."user_id",
          count(*)::int AS submitted,
          count(*) FILTER (WHERE h."status" = 'accepted')::int AS accepted,
          sum(${RANK_POINTS.homeworkSubmitted}
              + CASE WHEN h."status" = 'accepted'
                  THEN round(${RANK_POINTS.homeworkAcceptedMax} * COALESCE(h."grade", 100) / 100)
                  ELSE 0 END)::int AS pts
        FROM "app"."homework_submissions" h
        JOIN cohort c ON c."user_id" = h."user_id"
        GROUP BY 1
      ),
      -- «عليه» كام واجب = الواجبات المنشورة على محاضرات هو فتحها، زائد اللي
      -- سلّمه. مش «كل واجبات الكورس»: اللي اشترى شهر ٣ بس ماينفعش يتحسب عليه
      -- واجب شهر ١ ما شافهوش، والصلاحيات نفسها (شهر/ترم/كود) أعقد من إنها
      -- تتكرر هنا. فتح المحاضرة هو الدليل إنه كان يقدر.
      owed AS (
        SELECT x."user_id", count(DISTINCT x."lesson_id")::int AS n
        FROM (
          SELECT e."user_id", lp."lesson_id"
          FROM "app"."lesson_progress" lp
          JOIN "app"."enrollments" e ON e."id" = lp."enrollment_id"
          JOIN cohort c ON c."user_id" = e."user_id"
          JOIN "app"."lesson_homework" lh ON lh."lesson_id" = lp."lesson_id" AND lh."is_published"
          JOIN "app"."lessons" l ON l."id" = lh."lesson_id" AND l."is_published"
          WHERE lp."first_opened_at" IS NOT NULL
          UNION
          SELECT h."user_id", h."lesson_id"
          FROM "app"."homework_submissions" h
          JOIN cohort c ON c."user_id" = h."user_id"
        ) x
        GROUP BY 1
      )
      SELECT c."user_id", c."full_name",
        (COALESCE(qz.pts, 0) + COALESCE(hw.pts, 0))::int AS points,
        COALESCE(qz.quiz_n, 0) AS quiz_n, qz.quiz_avg, COALESCE(qz.quiz_full, 0) AS quiz_full,
        COALESCE(qz.exam_n, 0) AS exam_n, qz.exam_avg, COALESCE(qz.exam_full, 0) AS exam_full,
        COALESCE(qz.pending_n, 0) AS pending_n,
        COALESCE(hw.submitted, 0) AS hw_submitted, COALESCE(hw.accepted, 0) AS hw_accepted,
        COALESCE(owed.n, 0) AS hw_owed
      FROM cohort c
      LEFT JOIN qz ON qz."user_id" = c."user_id"
      LEFT JOIN hw ON hw."user_id" = c."user_id"
      LEFT JOIN owed ON owed."user_id" = c."user_id"
    `);
  }
}

function emptyRow(userId: string): ScoreRow {
  return {
    user_id: userId,
    full_name: '',
    points: 0,
    quiz_n: 0,
    quiz_avg: null,
    quiz_full: 0,
    exam_n: 0,
    exam_avg: null,
    exam_full: 0,
    pending_n: 0,
    hw_submitted: 0,
    hw_accepted: 0,
    hw_owed: 0,
  };
}

function round1(value: number | null): number | null {
  return value == null ? null : Math.round(value * 10) / 10;
}

function stats(row: ScoreRow): Omit<CohortRank['me'], 'rank' | 'betterThanPercent'> {
  const owed = Math.max(row.hw_owed, row.hw_submitted);
  const parts: Array<[value: number, weight: number]> = [];
  if (row.quiz_avg != null) parts.push([row.quiz_avg, AVERAGE_WEIGHTS.quizzes]);
  if (row.exam_avg != null) parts.push([row.exam_avg, AVERAGE_WEIGHTS.exams]);
  if (owed > 0) parts.push([(row.hw_submitted / owed) * 100, AVERAGE_WEIGHTS.homework]);
  const weight = parts.reduce((sum, [, w]) => sum + w, 0);
  const average = weight > 0 ? parts.reduce((sum, [v, w]) => sum + v * w, 0) / weight : null;

  return {
    points: row.points,
    average: round1(average),
    quizzes: { count: row.quiz_n, average: round1(row.quiz_avg), fullMarks: row.quiz_full },
    exams: { count: row.exam_n, average: round1(row.exam_avg), fullMarks: row.exam_full },
    homework: { submitted: row.hw_submitted, accepted: row.hw_accepted, owed },
    pendingReview: row.pending_n,
  };
}

/**
 * «ملك سعيد ذكي محمد» ← «ملك سعيد». أول اسمين كفاية تعرف بيهم زميلك، والباقي
 * مالوش لازمة يسافر على الشبكة لطالب تاني.
 */
export function shortName(fullName: string): string {
  return fullName.trim().split(/\s+/).slice(0, 2).join(' ');
}

/**
 * ترتيب الطالب وسط دفعته، بعد ما صفه القديم في الكاش يتشال ويتحط الجديد.
 *
 * ترتيب تنافسي («١، ٢، ٢، ٤»): اتنين بنفس النقط نفس الرقم، ومحدش بيتقال له
 * «التاني» وهو متعادل مع الأول. ووسط المتعادلين الطالب نفسه بيتحط الأول في
 * السلّم، عشان صفه يبان من غير ما يتقطع.
 */
export function standing(
  cohort: readonly CohortEntry[],
  me: CohortEntry,
): Pick<CohortRank, 'podium' | 'ladder' | 'pointsToNextRank'> & {
  me: { rank: number; betterThanPercent: number | null };
} {
  const others = cohort.filter((row) => row.userId !== me.userId);
  const all = [...others.map((row) => ({ ...row, isMe: false })), { ...me, isMe: true }].sort(
    (a, b) =>
      b.points - a.points ||
      Number(b.isMe) - Number(a.isMe) ||
      (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
  );

  const ranks: number[] = [];
  all.forEach((row, i) => {
    ranks.push(i > 0 && all[i - 1]!.points === row.points ? ranks[i - 1]! : i + 1);
  });

  const myIndex = all.findIndex((row) => row.isMe);
  const above = others.filter((row) => row.points > me.points);
  const below = others.filter((row) => row.points < me.points).length;
  const nextUp = above.length > 0 ? Math.min(...above.map((row) => row.points)) : null;

  return {
    me: {
      rank: ranks[myIndex]!,
      betterThanPercent: others.length > 0 ? Math.round((below / others.length) * 1000) / 10 : null,
    },
    pointsToNextRank: nextUp == null ? null : nextUp - me.points + 1,
    // منصة من غير نقط مش منصة: التلاتة الأوائل لازم يكونوا عملوا حاجة.
    podium: all
      .map((row, i) => ({ rank: ranks[i]!, points: row.points, isMe: row.isMe, name: row.name }))
      .filter((row) => row.points > 0)
      .slice(0, 3),
    // خمسة صفوف دايمًا لو الدفعة فيها خمسة: الأول بيشوف الأربعة اللي وراه،
    // والأخير الأربعة اللي قدّامه، بدل سلّم نصه فاضي.
    ladder: all
      .map((row, i) => ({ rank: ranks[i]!, points: row.points, isMe: row.isMe }))
      .slice(ladderStart(myIndex, all.length), ladderStart(myIndex, all.length) + LADDER_SIZE),
  };
}

const LADDER_SIZE = 5;

function ladderStart(myIndex: number, total: number): number {
  return Math.max(0, Math.min(myIndex - 2, total - LADDER_SIZE));
}
