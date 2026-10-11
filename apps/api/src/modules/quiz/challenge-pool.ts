import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';
import { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { loadBookLessonLinks } from './book-lesson-links';

/**
 * «التحديات» — بنك الكورس كله، سؤال سؤال، كل واحد على درس واحد. بيور على
 * Postgres: مفيش Nest هنا، عشان `GameService` (بنك الطالب) و
 * `ChallengeTopicsService` (العدّ في اللوحة) يقروا نفس الكويري بالظبط — رقم
 * اللوحة هو اللي الطالب هيلاقيه.
 *
 * ## منين
 *
 *   1. ربط مباشر — `question_bank_entries.lesson_id` (لصق أسئلة بـ`LESSON:`).
 *   2. «أسئلة الألعاب» بتاعة الدرس — تصنيف `game_lesson_id`.
 *   3. كتاب خارجي مربوط بالكورس — درس الكتاب رقم N على محاضرة الكورس رقم N
 *      (`book-lesson-links.ts`). بيتحسب هنا مش بيتخزّن، فمحاضرة جديدة بتلاقي
 *      أسئلتها لوحدها.
 *   4. كويزات الكورس المنشورة (الكويز ودرسه منشورين): slot مباشر أو تصنيف
 *      بيسحب منه pool الكويز. **سواء الطالب امتحنه ولا لأ** — ده الفرق عن
 *      `GameService.pool`، وده اللي أيمن طلبه.
 *
 * سؤال في أكتر من واحد محسوب على أول واحد بالترتيب ده: المدرّس ربطه بإيده
 * أقوى من إنه موجود في كويز. وسؤال الكويز على المحاضرة اللي الكويز بعدها في
 * نفس الوحدة، ولو مفيش (امتحان، أو كويز أول الوحدة) على الكويز نفسه — نفس
 * قاعدة `GameService.pool`.
 *
 * دايمًا أحدث نسخة `ready` — مسودة عمرها ما بتوصل طالب. ومش اللي اتشال من
 * البنك، وبس اختيار من متعدد أو صح/غلط بإجابة صح واحدة على الأقل.
 *
 * ## الامتحانات
 *
 * أي سؤال في امتحان شهر (رف «امتحانات الشهر») أو امتحان كورس
 * (`courses.exam_lesson_id`) بيتشال لو الامتحان ده:
 *   · لسه مسودة (الكويز أو درسه مش منشور) — بيتجهّز، والتحدّي كان هيسرّبه؛ أو
 *   · لسه مفتوح والطالب ماسلّموش.
 * من غير طالب (`userId = null`، العدّ في اللوحة) كل امتحان مفتوح بيتشال —
 * الرقم أقل من اللي الطالب اللي سلّم هيشوفه، مش أكتر.
 */
export interface ChallengeCandidate {
  versionId: string;
  bankEntryId: string;
  variantGroupKey: string | null;
  courseId: string;
  /** الدرس اللي السؤال محسوب عليه — دايمًا موجود. */
  lessonId: string;
  sectionId: string;
  forGeneral: boolean;
  forLanguages: boolean;
}

interface CandidateRow {
  vid: string;
  bank_entry_id: string;
  variant_group_key: string | null;
  course_id: string;
  lesson_id: string;
  section_id: string;
  for_general: boolean;
  for_languages: boolean;
}

export async function challengeCandidates(
  prisma: PrismaService,
  courseIds: readonly string[],
  userId: string | null,
): Promise<ChallengeCandidate[]> {
  if (courseIds.length === 0) return [];
  const ids = [...courseIds];
  const book = await loadBookLessonLinks(prisma, ids);
  const rows = await prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
    WITH quiz_home AS (
      SELECT qz."id" AS quiz_id, l."course_id", COALESCE(lec."id", l."id") AS lesson_id
      FROM "app"."quizzes" qz
      JOIN "app"."lessons" l ON l."id" = qz."lesson_id"
      LEFT JOIN LATERAL (
        SELECT l2."id" FROM "app"."lessons" l2
        WHERE l."kind" = 'quiz' AND l2."section_id" = l."section_id" AND l2."kind" <> 'quiz'
          AND (l2."position", l2."id") < (l."position", l."id")
        ORDER BY l2."position" DESC, l2."id" DESC LIMIT 1
      ) lec ON true
      WHERE l."course_id" = ANY(${ids}::uuid[]) AND qz."is_published" AND l."is_published"
    ),
    linked AS (
      SELECT be."id" AS be_id, l."course_id", l."id" AS lesson_id, 0 AS pref
      FROM "app"."question_bank_entries" be
      JOIN "app"."lessons" l ON l."id" = be."lesson_id"
      WHERE l."course_id" = ANY(${ids}::uuid[])
      UNION ALL
      SELECT be."id", l."course_id", l."id", 1
      FROM "app"."question_categories" qc
      JOIN "app"."lessons" l ON l."id" = qc."game_lesson_id"
      JOIN "app"."question_bank_entries" be ON be."category_id" = qc."id"
      WHERE l."course_id" = ANY(${ids}::uuid[])
      UNION ALL
      SELECT be."id", x.course_id, x.lesson_id, 2
      FROM unnest(${book.map((link) => link.categoryId)}::uuid[], ${book.map((link) => link.courseId)}::uuid[],
                  ${book.map((link) => link.lessonId)}::uuid[]) AS x(category_id, course_id, lesson_id)
      JOIN "app"."question_bank_entries" be ON be."category_id" = x.category_id
      UNION ALL
      SELECT s."bank_entry_id", qh."course_id", qh.lesson_id, 3
      FROM "app"."quiz_slots" s
      JOIN quiz_home qh ON qh.quiz_id = s."quiz_id"
      WHERE s."bank_entry_id" IS NOT NULL
      UNION ALL
      SELECT be."id", qh."course_id", qh.lesson_id, 4
      FROM "app"."quiz_slots" s
      JOIN quiz_home qh ON qh.quiz_id = s."quiz_id"
      JOIN "app"."quiz_pools" p ON p."id" = s."pool_id"
      JOIN "app"."question_bank_entries" be
        ON jsonb_typeof(p."source_filter"->'categoryIds') = 'array'
       AND be."category_id"::text IN (SELECT jsonb_array_elements_text(p."source_filter"->'categoryIds'))
    ),
    ${examBlockCtes(userId)}
    SELECT DISTINCT ON (x.be_id, x."course_id")
      lv."id" AS vid, x.be_id AS bank_entry_id, be."variant_group_key", x."course_id", x.lesson_id,
      ls."section_id", ls."for_general", ls."for_languages"
    FROM linked x
    JOIN "app"."question_bank_entries" be ON be."id" = x.be_id AND be."archived_at" IS NULL
    JOIN LATERAL (
      SELECT v."id" FROM "app"."question_versions" v
      WHERE v."bank_entry_id" = be."id" AND v."status" = 'ready'
      ORDER BY v."version" DESC LIMIT 1
    ) lv ON true
    JOIN "app"."question_versions" v ON v."id" = lv."id" AND v."type" IN ('mcq_single', 'true_false')
    JOIN "app"."lessons" ls ON ls."id" = x.lesson_id
    WHERE NOT EXISTS (SELECT 1 FROM blocked b WHERE b.be_id = be."id")
      AND (SELECT count(*) FROM "app"."question_options" o WHERE o."question_version_id" = v."id") >= 2
      AND EXISTS (SELECT 1 FROM "app"."question_options" o WHERE o."question_version_id" = v."id" AND o."fraction" > 0)
    ORDER BY x.be_id, x."course_id", x.pref
  `);
  return rows.map((row) => ({
    versionId: row.vid,
    bankEntryId: row.bank_entry_id,
    variantGroupKey: row.variant_group_key,
    courseId: row.course_id,
    lessonId: row.lesson_id,
    sectionId: row.section_id,
    forGeneral: row.for_general,
    forLanguages: row.for_languages,
  }));
}

/**
 * `exams` و`blocked` — الامتحانات اللي لسه مقفولة على الطالب ده (مسودة، أو
 * مفتوحة وماسلّمهاش)، وكل سؤال بيسحب منها. CTE مكتوبة مرة واحدة: البنك
 * (`challengeCandidates`) و«دفتر غلطاتي» (`blockedBankEntries`) لازم يقولوا نفس
 * الكلام، وإلا الدفتر يكشف إجابة سؤال البنك بيخبّيه.
 */
function examBlockCtes(userId: string | null): Prisma.Sql {
  return Prisma.sql`exams AS (
      SELECT q."id"
      FROM "app"."quizzes" q
      JOIN "app"."lessons" l ON l."id" = q."lesson_id"
      JOIN "app"."course_sections" cs ON cs."id" = l."section_id"
      JOIN "app"."courses" co ON co."id" = l."course_id"
      WHERE (cs."title" = ${EXAM_SHELF_TITLE} OR co."exam_lesson_id" = l."id")
        AND (
          NOT (q."is_published" AND l."is_published")
          OR (
            (q."open_until" IS NULL OR q."open_until" > now())
            AND NOT EXISTS (
              SELECT 1 FROM "app"."quiz_attempts" a
              WHERE a."quiz_id" = q."id" AND a."user_id" = ${userId} AND a."submitted_at" IS NOT NULL
            )
          )
        )
    ),
    blocked AS (
      SELECT s."bank_entry_id" AS be_id
      FROM "app"."quiz_slots" s JOIN exams e ON e."id" = s."quiz_id"
      WHERE s."bank_entry_id" IS NOT NULL
      UNION
      SELECT be."id"
      FROM "app"."quiz_slots" s
      JOIN exams e ON e."id" = s."quiz_id"
      JOIN "app"."quiz_pools" p ON p."id" = s."pool_id"
      JOIN "app"."question_bank_entries" be
        ON jsonb_typeof(p."source_filter"->'categoryIds') = 'array'
       AND be."category_id"::text IN (SELECT jsonb_array_elements_text(p."source_filter"->'categoryIds'))
    )`;
}

/** أسئلة البنك (`question_bank_entries.id`) اللي امتحان لسه مقفول على الطالب ده بيسحب منها. */
export async function blockedBankEntries(prisma: PrismaService, userId: string): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<Array<{ be_id: string }>>(Prisma.sql`
    WITH ${examBlockCtes(userId)}
    SELECT be_id FROM blocked
  `);
  return new Set(rows.map((row) => row.be_id));
}

/** درس في الكورس، والدرس اللي أسئلته محسوبة عليه (كويز ← محاضرته). */
export interface CourseLesson {
  id: string;
  courseId: string;
  sectionId: string;
  sectionTitle: string;
  title: string;
  kind: string;
  /** الدرس نفسه، إلا الكويز اللي بعد محاضرة — المحاضرة. */
  homeId: string;
  forGeneral: boolean;
  forLanguages: boolean;
}

export async function courseLessons(prisma: PrismaService, courseIds: readonly string[]): Promise<CourseLesson[]> {
  if (courseIds.length === 0) return [];
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      course_id: string;
      section_id: string;
      section_title: string;
      title: string;
      kind: string;
      home_id: string;
      for_general: boolean;
      for_languages: boolean;
    }>
  >(Prisma.sql`
    SELECT l."id", l."course_id", l."section_id", cs."title" AS section_title, l."title", l."kind"::text AS kind,
      COALESCE(lec."id", l."id") AS home_id, l."for_general", l."for_languages"
    FROM "app"."lessons" l
    JOIN "app"."course_sections" cs ON cs."id" = l."section_id"
    LEFT JOIN LATERAL (
      SELECT l2."id" FROM "app"."lessons" l2
      WHERE l."kind" = 'quiz' AND l2."section_id" = l."section_id" AND l2."kind" <> 'quiz'
        AND (l2."position", l2."id") < (l."position", l."id")
      ORDER BY l2."position" DESC, l2."id" DESC LIMIT 1
    ) lec ON true
    WHERE l."course_id" = ANY(${[...courseIds]}::uuid[])
    ORDER BY l."course_id", cs."position", cs."id", l."position", l."id"
  `);
  return rows.map((row) => ({
    id: row.id,
    courseId: row.course_id,
    sectionId: row.section_id,
    sectionTitle: row.section_title,
    title: row.title,
    kind: row.kind,
    homeId: row.home_id,
    forGeneral: row.for_general,
    forLanguages: row.for_languages,
  }));
}

/**
 * دروس التحدّي اللي الأسئلة محسوبة عليها: كل درس في وحداته، والدروس اللي
 * اتختارت لوحدها — ولو اتختار كويز، المحاضرة اللي أسئلته محسوبة عليها. بس من
 * دروس كورس التحدّي نفسه: id من كورس تاني مابيوسّعش حاجة.
 */
export function topicHomeLessons(
  topic: { courseId: string; sectionIds: readonly string[]; lessonIds: readonly string[] },
  lessons: readonly CourseLesson[],
): Set<string> {
  const sections = new Set(topic.sectionIds);
  const picked = new Set(topic.lessonIds);
  const homes = new Set<string>();
  for (const lesson of lessons) {
    if (lesson.courseId !== topic.courseId) continue;
    if (sections.has(lesson.sectionId) || picked.has(lesson.id)) homes.add(lesson.homeId);
  }
  return homes;
}

/** الطالب عربي ولا لغات — والدرس بيوصله؟ `null` = مش معروف، فكل درس. */
export function lessonServes(
  lesson: { forGeneral: boolean; forLanguages: boolean },
  stream: 'general' | 'languages' | null,
): boolean {
  if (stream === 'general') return lesson.forGeneral;
  if (stream === 'languages') return lesson.forLanguages;
  return true;
}
