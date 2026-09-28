import { randomInt } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  GAME_RULES,
  type GameAnswerRequest,
  type GameAnswerResult,
  type GameHub,
  type GameLevel,
  type GameLifelineRequest,
  type GameLifelineResult,
  type GameMode,
  type GameRound,
  type GameRoundQuery,
} from '@ayman/contracts/quiz/game';
import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';
import { Prisma } from '../../generated/prisma/client';
import { azureSpeech } from './game-voice.config';
import { PrismaService } from '../../prisma/prisma.service';

/** «سهل» لو ٧٠٪ من اللي جاوبوه جابوه صح، و«صعب» لو أقل من ٤٠٪. */
const EASY_AT = 0.7;
const HARD_BELOW = 0.4;
/** أقل من كده إجابات والنسبة مالهاش معنى — بيتحسب متوسط. */
const MIN_ANSWERS_FOR_LEVEL = 3;
/** «اسأل الجمهور» بيقرا إجابات الطلبة الحقيقية لو فيه كفاية منها. */
const MIN_REAL_VOTES = 5;

interface PoolEntry {
  versionId: string;
  courseId: string;
  courseTitle: string;
  facility: number | null;
  level: GameLevel;
}

/** ترتيب المستويات اللي بنسحب منها لكل اختيار — الأقرب الأول. */
const BANDS: Record<GameLevel, GameLevel[]> = {
  easy: ['easy', 'medium', 'hard'],
  medium: ['medium', 'easy', 'hard'],
  hard: ['hard', 'medium', 'easy'],
};

/** «من سيربح المليون»: كام سؤال من كل مستوى في الـ١٥، حسب اختيار الطالب. */
const MILLIONAIRE_MIX: Record<GameLevel, Record<GameLevel, number>> = {
  easy: { easy: 7, medium: 6, hard: 2 },
  medium: { easy: 5, medium: 5, hard: 5 },
  hard: { easy: 2, medium: 6, hard: 7 },
};

/**
 * «الألعاب» — تلات ألعاب على بنك واحد.
 *
 * البنك (`pool`) هو كل أسئلة الكويزات اللي الطالب سلّمها — اللي اتسأل فيها،
 * واللي في نفس الكويز ومجاتلوش (slot مباشر، أو تصنيف بيسحب منه pool الكويز)
 * — بأحدث نسخة جاهزة، إلا لو اتسأل في نسخة معيّنة فهي اللي بتدخل. أيمن طلبها
 * كده بالنص: «من كل الأسئلة اللي في الكويز اللي امتحنها قبل كده».
 *
 * ومعاهم «أسئلة الألعاب» اللي المدرّس ضافها لكل كورس من لوحة التحكم (تصنيف
 * في البنك مربوط بالكورس — `QuestionCategory.gameCourseId`)، لطلبة الكورس.
 *
 * وماعدا أي سؤال داخل في امتحان شهر أو امتحان كورس لسه جاي والطالب
 * ماسلّموش: slot مباشر أو تصنيف بيسحب منه. من غيرها اللعبة كانت هتبقى حل
 * نموذجي للامتحان قبل ما يتعمل.
 *
 * الإجابة الصح مابتسافرش مع السؤال أبدًا — التصحيح هنا سؤال سؤال.
 */
@Injectable()
export class GameService {
  constructor(private readonly prisma: PrismaService) {}

  async hub(userId: string): Promise<GameHub> {
    const pool = await this.pool(userId);
    const byCourse = new Map<string, GameHub['courses'][number]>();
    for (const entry of pool.values()) {
      const course = byCourse.get(entry.courseId) ?? {
        id: entry.courseId,
        title: entry.courseTitle,
        counts: { easy: 0, medium: 0, hard: 0 },
      };
      course.counts[entry.level] += 1;
      byCourse.set(entry.courseId, course);
    }
    return {
      total: pool.size,
      courses: [...byCourse.values()].sort((a, b) => countOf(b) - countOf(a)),
      voice: azureSpeech() !== null,
    };
  }

  async round(userId: string, query: GameRoundQuery): Promise<GameRound> {
    const pool = await this.pool(userId);
    const entries = [...pool.values()].filter((entry) => !query.courseId || entry.courseId === query.courseId);
    const picked = pick(entries, query.mode, query.level);
    if (picked.length === 0) return { mode: query.mode, level: query.level, questions: [], poolSize: entries.length };

    const versions = await this.prisma.questionVersion.findMany({
      where: { id: { in: picked.map((entry) => entry.versionId) } },
      // ⚠️ من غير `fraction` ولا `feedbackHtml`: الإجابة الصح مابتسافرش مع
      // السؤال. `@NoAnswerLeak()` على الراوت شبكة تانية، مش الأولى.
      select: {
        id: true,
        type: true,
        stemHtml: true,
        options: { orderBy: { position: 'asc' }, select: { id: true, bodyHtml: true } },
      },
    });
    const byId = new Map(versions.map((version) => [version.id, version]));

    return {
      mode: query.mode,
      level: query.level,
      poolSize: entries.length,
      questions: picked.flatMap((entry) => {
        const version = byId.get(entry.versionId);
        if (!version || version.options.length < 2) return [];
        return [
          {
            id: version.id,
            type: version.type as 'mcq_single' | 'true_false',
            stemHtml: version.stemHtml,
            // صح/غلط بترتيبه؛ الاختيار من متعدد بيتلخبط كل جولة عشان مايتحفظش
            // «التالتة هي الصح».
            options: version.type === 'true_false' ? version.options : sample(version.options, version.options.length),
            level: entry.level,
          },
        ];
      }),
    };
  }

  async answer(userId: string, input: GameAnswerRequest): Promise<GameAnswerResult> {
    const options = await this.optionsInPool(userId, input.questionId);
    const rightOptionIds = rightOf(options);
    return {
      correct: input.optionId !== null && rightOptionIds.includes(input.optionId),
      rightOptionIds,
    };
  }

  async lifeline(userId: string, input: GameLifelineRequest): Promise<GameLifelineResult> {
    const options = await this.optionsInPool(userId, input.questionId);
    const right = new Set(rightOf(options));

    if (input.kind === 'fifty') {
      // يسيب الصح وغلط واحد بس — ٤ اختيارات يشيل اتنين، ٣ يشيل واحد.
      const wrong = options.filter((option) => !right.has(option.id)).map((option) => option.id);
      return { removeOptionIds: sample(wrong, Math.max(0, wrong.length - 1)), votes: [] };
    }

    return { removeOptionIds: [], votes: await this.audience(input.questionId, options, right) };
  }

  /**
   * «اسأل الجمهور»: لو السؤال اتجاوب ٥ مرات على الأقل في كويزات المنصة، النسب
   * هي اللي الطلبة اختاروه فعلًا. أقل من كده، جمهور تقديري: الصح بياخد من ٤٥
   * لـ٧٠٪، والباقي بيتوزّع عشوائي.
   */
  private async audience(
    questionId: string,
    options: Array<{ id: string }>,
    right: Set<string>,
  ): Promise<GameLifelineResult['votes']> {
    const rows = await this.prisma.$queryRaw<Array<{ option_id: string; n: number }>>(Prisma.sql`
      SELECT o AS option_id, count(*)::int AS n
      FROM "app"."attempt_questions" aq,
        jsonb_array_elements_text(aq."response"->'optionIds') AS o
      WHERE aq."question_version_id" = ${questionId}::uuid
        AND aq."response"->>'kind' = 'choice'
      GROUP BY 1
    `);
    const counts = new Map(options.map((option) => [option.id, 0]));
    for (const row of rows) if (counts.has(row.option_id)) counts.set(row.option_id, row.n);
    const totalVotes = [...counts.values()].reduce((sum, n) => sum + n, 0);

    let weights: number[];
    if (totalVotes >= MIN_REAL_VOTES) {
      weights = options.map((option) => counts.get(option.id) ?? 0);
    } else {
      const share = 45 + randomInt(26);
      const others = options.filter((option) => !right.has(option.id));
      const rest = others.map(() => 1 + randomInt(10));
      const restSum = rest.reduce((sum, n) => sum + n, 0) || 1;
      weights = options.map((option) => {
        if (right.has(option.id)) return share / Math.max(1, right.size);
        const index = others.findIndex((other) => other.id === option.id);
        return ((rest[index] ?? 0) / restSum) * (100 - share);
      });
    }
    return toPercents(
      options.map((option) => option.id),
      weights,
    );
  }

  /** سؤال مش في بنك الطالب = 404 — مش الإجابة، ومش صوته. */
  async assertInPool(userId: string, questionId: string): Promise<void> {
    const pool = await this.pool(userId);
    if (!pool.has(questionId)) throw new NotFoundException();
  }

  /** الاختيارات بـ`fraction` — بس لسؤال في بنك الطالب؛ غير كده 404 مش الإجابة. */
  private async optionsInPool(userId: string, questionId: string) {
    await this.assertInPool(userId, questionId);
    return this.prisma.questionOption.findMany({
      where: { questionVersionId: questionId },
      select: { id: true, fraction: true },
    });
  }

  private async pool(userId: string): Promise<Map<string, PoolEntry>> {
    const [rows, blocked] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ vid: string; course_id: string; course_title: string; bank_entry_id: string; category_id: string }>
      >(Prisma.sql`
        WITH sat AS (
          SELECT DISTINCT a."quiz_id"
          FROM "app"."quiz_attempts" a
          WHERE a."user_id" = ${userId} AND a."submitted_at" IS NOT NULL
            AND a."state" IN ('submitted', 'pending_review')
        ),
        seen AS (
          SELECT aq."question_version_id" AS vid, a."quiz_id"
          FROM "app"."attempt_questions" aq
          JOIN "app"."quiz_attempts" a ON a."id" = aq."attempt_id"
          WHERE a."user_id" = ${userId} AND a."submitted_at" IS NOT NULL
            AND a."state" IN ('submitted', 'pending_review')
        ),
        slotted AS (
          SELECT COALESCE(pv."id", lv."id") AS vid, s."quiz_id"
          FROM "app"."quiz_slots" s
          JOIN sat ON sat."quiz_id" = s."quiz_id"
          LEFT JOIN "app"."question_versions" pv
            ON pv."bank_entry_id" = s."bank_entry_id" AND pv."version" = s."pinned_version"
          LEFT JOIN LATERAL (
            SELECT v."id" FROM "app"."question_versions" v
            WHERE v."bank_entry_id" = s."bank_entry_id" AND v."status" = 'ready'
            ORDER BY v."version" DESC LIMIT 1
          ) lv ON true
          WHERE s."bank_entry_id" IS NOT NULL
        ),
        pooled AS (
          SELECT lv."id" AS vid, s."quiz_id"
          FROM "app"."quiz_slots" s
          JOIN sat ON sat."quiz_id" = s."quiz_id"
          JOIN "app"."quiz_pools" p ON p."id" = s."pool_id"
          JOIN "app"."question_bank_entries" be
            ON jsonb_typeof(p."source_filter"->'categoryIds') = 'array'
           AND be."category_id"::text IN (SELECT jsonb_array_elements_text(p."source_filter"->'categoryIds'))
          JOIN LATERAL (
            SELECT v."id" FROM "app"."question_versions" v
            WHERE v."bank_entry_id" = be."id" AND v."status" = 'ready'
            ORDER BY v."version" DESC LIMIT 1
          ) lv ON true
        ),
        from_quizzes AS (
          SELECT x.vid, l."course_id"
          FROM (
            SELECT vid, "quiz_id" FROM seen
            UNION SELECT vid, "quiz_id" FROM slotted WHERE vid IS NOT NULL
            UNION SELECT vid, "quiz_id" FROM pooled
          ) x
          JOIN "app"."quizzes" qz ON qz."id" = x."quiz_id"
          JOIN "app"."lessons" l ON l."id" = qz."lesson_id"
        ),
        -- «أسئلة الألعاب» اللي المدرّس ضافها للكورس (تصنيف مربوط بيه)، لطالب
        -- مشترك في الكورس ده دلوقتي.
        from_game_bank AS (
          SELECT lv."id" AS vid, qc."game_course_id" AS course_id
          FROM "app"."question_categories" qc
          JOIN "app"."enrollments" e
            ON e."course_id" = qc."game_course_id" AND e."user_id" = ${userId} AND e."status" = 'active'
          JOIN "app"."question_bank_entries" be ON be."category_id" = qc."id"
          JOIN LATERAL (
            SELECT v."id" FROM "app"."question_versions" v
            WHERE v."bank_entry_id" = be."id" AND v."status" = 'ready'
            ORDER BY v."version" DESC LIMIT 1
          ) lv ON true
          WHERE qc."game_course_id" IS NOT NULL
        ),
        allq AS (
          SELECT vid, "course_id" FROM from_quizzes
          UNION SELECT vid, course_id FROM from_game_bank
        )
        SELECT DISTINCT ON (q.vid) q.vid, q."course_id", co."title" AS course_title,
          v."bank_entry_id", be."category_id"
        FROM allq q
        JOIN "app"."question_versions" v ON v."id" = q.vid AND v."type" IN ('mcq_single', 'true_false')
        JOIN "app"."question_bank_entries" be ON be."id" = v."bank_entry_id"
        JOIN "app"."courses" co ON co."id" = q."course_id"
        WHERE (SELECT count(*) FROM "app"."question_options" o WHERE o."question_version_id" = v."id") >= 2
          AND EXISTS (SELECT 1 FROM "app"."question_options" o WHERE o."question_version_id" = v."id" AND o."fraction" > 0)
        ORDER BY q.vid
      `),
      this.upcomingExamSources(userId),
    ]);

    const kept = rows.filter(
      (row) => !blocked.entries.has(row.bank_entry_id) && !blocked.categories.has(row.category_id),
    );
    const facility = await this.facility([...new Set(kept.map((row) => row.bank_entry_id))]);

    return new Map(
      kept.map((row) => {
        const f = facility.get(row.bank_entry_id) ?? null;
        const level: GameLevel = f === null ? 'medium' : f >= EASY_AT ? 'easy' : f < HARD_BELOW ? 'hard' : 'medium';
        return [row.vid, { versionId: row.vid, courseId: row.course_id, courseTitle: row.course_title, facility: f, level }];
      }),
    );
  }

  /** نسبة الإجابات الصح على كل سؤال من كل المحاولات في المنصة. */
  private async facility(bankEntryIds: string[]): Promise<Map<string, number>> {
    if (bankEntryIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<Array<{ bank_entry_id: string; right: number; answered: number }>>(Prisma.sql`
      SELECT v."bank_entry_id",
        count(*) FILTER (WHERE aq."state" = 'graded_right')::int AS right,
        count(*) FILTER (WHERE aq."state" IN ('graded_right', 'graded_wrong', 'graded_partial'))::int AS answered
      FROM "app"."attempt_questions" aq
      JOIN "app"."question_versions" v ON v."id" = aq."question_version_id"
      WHERE v."bank_entry_id" = ANY(${bankEntryIds}::uuid[])
      GROUP BY 1
    `);
    return new Map(
      rows
        .filter((row) => row.answered >= MIN_ANSWERS_FOR_LEVEL)
        .map((row) => [row.bank_entry_id, row.right / row.answered]),
    );
  }

  /**
   * البنك اللي امتحانات جاية بتسحب منه: امتحان شهر (رف «امتحانات الشهر») أو
   * امتحان كورس (`courses.exam_lesson_id`)، منشور، لسه ماتقفلش، والطالب لسه
   * ماسلّموش.
   */
  private async upcomingExamSources(userId: string): Promise<{ entries: Set<string>; categories: Set<string> }> {
    const rows = await this.prisma.$queryRaw<Array<{ bank_entry_id: string | null; source_filter: unknown }>>(Prisma.sql`
      SELECT DISTINCT s."bank_entry_id", p."source_filter"
      FROM "app"."quizzes" q
      JOIN "app"."lessons" l ON l."id" = q."lesson_id"
      JOIN "app"."course_sections" cs ON cs."id" = l."section_id"
      JOIN "app"."courses" co ON co."id" = l."course_id"
      LEFT JOIN "app"."quiz_slots" s ON s."quiz_id" = q."id"
      LEFT JOIN "app"."quiz_pools" p ON p."id" = s."pool_id"
      WHERE q."is_published"
        AND (q."open_until" IS NULL OR q."open_until" > now())
        AND (cs."title" = ${EXAM_SHELF_TITLE} OR co."exam_lesson_id" = l."id")
        AND NOT EXISTS (
          SELECT 1 FROM "app"."quiz_attempts" a
          WHERE a."quiz_id" = q."id" AND a."user_id" = ${userId} AND a."submitted_at" IS NOT NULL
        )
    `);
    const entries = new Set<string>();
    const categories = new Set<string>();
    for (const row of rows) {
      if (row.bank_entry_id) entries.add(row.bank_entry_id);
      const filter = row.source_filter as { categoryIds?: unknown } | null;
      if (Array.isArray(filter?.categoryIds)) {
        for (const id of filter.categoryIds) if (typeof id === 'string') categories.add(id);
      }
    }
    return { entries, categories };
  }
}

function countOf(course: GameHub['courses'][number]): number {
  return course.counts.easy + course.counts.medium + course.counts.hard;
}

function rightOf(options: Array<{ id: string; fraction: Prisma.Decimal | number }>): string[] {
  const best = Math.max(0, ...options.map((option) => Number(option.fraction)));
  return best > 0 ? options.filter((option) => Number(option.fraction) === best).map((option) => option.id) : [];
}

/**
 * الأسئلة اللي تدخل الجولة.
 *
 * سباق الوقت والبقاء: من المستوى المختار الأول، واللي يكمّل من الأقرب له.
 * المليون: خلطة من التلات مستويات (`MILLIONAIRE_MIX`). المليون والبقاء
 * بيترتّبوا من الأسهل للأصعب — زي البرنامج، كل سؤال أصعب من اللي قبله.
 */
function pick(entries: PoolEntry[], mode: GameMode, level: GameLevel): PoolEntry[] {
  const size = GAME_RULES[mode].questions;
  const byLevel: Record<GameLevel, PoolEntry[]> = {
    easy: sample(entries.filter((e) => e.level === 'easy'), entries.length),
    medium: sample(entries.filter((e) => e.level === 'medium'), entries.length),
    hard: sample(entries.filter((e) => e.level === 'hard'), entries.length),
  };

  let picked: PoolEntry[] = [];
  if (mode === 'millionaire') {
    const mix = MILLIONAIRE_MIX[level];
    for (const band of ['easy', 'medium', 'hard'] as const) picked.push(...byLevel[band].splice(0, mix[band]));
  }
  // يكمّل اللي ناقص (أو الجولة كلها في الوضعين التانيين) من الأقرب للمستوى.
  for (const band of BANDS[level]) {
    if (picked.length >= size) break;
    picked.push(...byLevel[band].splice(0, size - picked.length));
  }
  picked = picked.slice(0, size);

  if (mode !== 'race') {
    // الأسهل الأول: الـfacility الأعلى قدّام، واللي مالوش نسبة في النص.
    picked.sort((a, b) => (b.facility ?? 0.55) - (a.facility ?? 0.55));
  }
  return picked;
}

/** نسب صحيحة بتجمع ١٠٠ بالظبط (أكبر باقي بياخد الفرق). */
function toPercents(ids: string[], weights: number[]): GameLifelineResult['votes'] {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (w / sum) * 100);
  const floors = raw.map((r) => Math.floor(r));
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - floors[i]!, i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floors[i] = floors[i]! + 1;
    left -= 1;
  }
  return ids.map((optionId, i) => ({ optionId, percent: floors[i]! }));
}

/** `count` عناصر عشوائية من غير تكرار (Fisher–Yates جزئي). */
function sample<T>(items: T[], count: number): T[] {
  const copy = [...items];
  const n = Math.min(count, copy.length);
  for (let i = 0; i < n; i++) {
    const j = i + randomInt(copy.length - i);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, n);
}
