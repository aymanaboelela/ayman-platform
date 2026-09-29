import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_GAME_MODE_CONFIG,
  GAME_MODES,
  defaultGameModes,
  type GameBankDetail,
  type GameBankEnsureResult,
  type GameBanks,
  type GameModeConfig,
  type GameModesConfig,
} from '@ayman/contracts/quiz/game';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { modesByCourse } from './game.service';

/** أسئلة جاهزة (نسخة منشورة واحدة على الأقل) — نفس العدّ في كل مكان هنا. */
const READY_ENTRIES = { entries: { where: { versions: { some: { status: 'ready' as const } } } } };

/**
 * «أسئلة الألعاب» — تصنيف في بنك الأسئلة لكل كورس (`gameCourseId`)، وتحته
 * تصنيف لكل درس (`gameLessonId`)، وإعداد لكل لعبة (`game_mode_settings`).
 *
 * الأسئلة نفسها بتتكتب وتتلصق بالجملة بأدوات البنك الموجودة
 * (`POST /api/admin/questions/bulk` بـ`categoryId`) — الخدمة دي بس بتعرف أنهي
 * تصنيف بتاع أنهي كورس أو درس، وبتعمله أول مرة، وبتحفظ كل لعبة بتسحب منين.
 */
@Injectable()
export class GameBanksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<GameBanks> {
    const courses = await this.prisma.course.findMany({
      where: { status: { not: 'archived' } },
      orderBy: [{ status: 'desc' }, { title: 'asc' }],
      select: {
        id: true,
        title: true,
        gameQuestionBank: {
          select: {
            id: true,
            _count: { select: READY_ENTRIES },
            children: { where: { gameLessonId: { not: null } }, select: { _count: { select: READY_ENTRIES } } },
          },
        },
        gameModeSettings: { select: { useQuizzes: true, useBank: true, lessonIds: true } },
      },
    });
    return {
      rows: courses.map((course) => {
        const lessons = course.gameQuestionBank?.children ?? [];
        return {
          courseId: course.id,
          courseTitle: course.title,
          categoryId: course.gameQuestionBank?.id ?? null,
          ready: course.gameQuestionBank?._count.entries ?? 0,
          lessonReady: lessons.reduce((sum, child) => sum + child._count.entries, 0),
          lessonBanks: lessons.filter((child) => child._count.entries > 0).length,
          customized: course.gameModeSettings.some((setting) => !isDefault(setting)),
        };
      }),
    };
  }

  /** التصنيف بتاع الكورس، ولو مش موجود بيتعمل. مرتين في نفس اللحظة = واحد (UNIQUE). */
  async ensure(courseId: string): Promise<GameBankEnsureResult> {
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { title: true } });
    if (!course) throw new NotFoundException();
    const name = `ألعاب — ${course.title}`;
    const category = await this.prisma.questionCategory.upsert({
      where: { gameCourseId: courseId },
      update: {},
      create: { name, gameCourseId: courseId },
      select: { id: true, name: true },
    });
    return { categoryId: category.id, categoryName: category.name };
  }

  /**
   * تصنيف درس: ابن تصنيف الكورس (بيتعمل هو كمان لو مش موجود)، فالبنك
   * بيعرضهم شجرة «ألعاب — الكورس ← الدرس». درس من كورس تاني = 404.
   */
  async ensureLesson(courseId: string, lessonId: string): Promise<GameBankEnsureResult> {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, courseId },
      select: { title: true, course: { select: { title: true } } },
    });
    if (!lesson) throw new NotFoundException();
    const parent = await this.ensure(courseId);
    const category = await this.prisma.questionCategory.upsert({
      where: { gameLessonId: lessonId },
      update: {},
      create: {
        name: `ألعاب — ${lesson.course.title} · ${lesson.title}`,
        gameLessonId: lessonId,
        parentId: parent.categoryId,
      },
      select: { id: true, name: true },
    });
    return { categoryId: category.id, categoryName: category.name };
  }

  /** كورس واحد: الأسئلة العامة، وكل درس بأسئلة كويزاته وأسئلة ألعابه، والإعدادات. */
  async detail(courseId: string): Promise<GameBankDetail> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        gameQuestionBank: { select: { id: true, name: true, _count: { select: READY_ENTRIES } } },
        gameModeSettings: { select: { courseId: true, mode: true, useQuizzes: true, useBank: true, lessonIds: true } },
      },
    });
    if (!course) throw new NotFoundException();

    const [lessons, quizCounts, lessonBanks] = await Promise.all([
      this.prisma.lesson.findMany({
        where: { courseId },
        orderBy: [{ section: { position: 'asc' } }, { position: 'asc' }, { id: 'asc' }],
        select: { id: true, title: true, kind: true, sectionId: true, section: { select: { title: true } } },
      }),
      this.quizQuestionsByLesson(courseId),
      this.prisma.questionCategory.findMany({
        where: { gameLesson: { courseId } },
        select: { id: true, name: true, gameLessonId: true, _count: { select: READY_ENTRIES } },
      }),
    ]);
    const bankByLesson = new Map(lessonBanks.map((bank) => [bank.gameLessonId, bank]));

    const sections = new Map<string, GameBankDetail['sections'][number]>();
    for (const lesson of lessons) {
      const quizQuestions = quizCounts.byLesson.get(lesson.id) ?? 0;
      const bank = bankByLesson.get(lesson.id);
      // الكويز اللي أسئلته محسوبة على المحاضرة اللي قبله مالوش صف لوحده —
      // أسئلته في صف المحاضرة. اللي باقي منه (امتحان، كويز أول الوحدة) ليه صف.
      if (lesson.kind === 'quiz' && quizQuestions === 0 && !bank) continue;
      const section = sections.get(lesson.sectionId) ?? { id: lesson.sectionId, title: lesson.section.title, lessons: [] };
      section.lessons.push({
        id: lesson.id,
        title: lesson.title,
        kind: lesson.kind,
        quizQuestions,
        categoryId: bank?.id ?? null,
        categoryName: bank?.name ?? null,
        ready: bank?._count.entries ?? 0,
      });
      sections.set(lesson.sectionId, section);
    }

    return {
      courseId: course.id,
      courseTitle: course.title,
      general: {
        categoryId: course.gameQuestionBank?.id ?? null,
        categoryName: course.gameQuestionBank?.name ?? null,
        ready: course.gameQuestionBank?._count.entries ?? 0,
      },
      quizQuestions: quizCounts.total,
      sections: [...sections.values()],
      modes: modesByCourse(course.gameModeSettings).get(course.id) ?? defaultGameModes(),
    };
  }

  /**
   * كل لعبة بتسحب منين. الدروس بتتفلتر على دروس الكورس ده بس — id من كورس
   * تاني بيتشال بهدوء بدل ما يبقى إعداد مالوش معنى. بيتسجّل في الأوديت.
   */
  async saveModes(courseId: string, modes: GameModesConfig): Promise<GameModesConfig> {
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!course) throw new NotFoundException();
    const requested = [...new Set(GAME_MODES.flatMap((mode) => modes[mode].lessonIds))];
    const known = new Set(
      (await this.prisma.lesson.findMany({ where: { courseId, id: { in: requested } }, select: { id: true } })).map(
        (lesson) => lesson.id,
      ),
    );
    const saved = defaultGameModes();
    for (const mode of GAME_MODES) {
      saved[mode] = {
        useQuizzes: modes[mode].useQuizzes,
        useBank: modes[mode].useBank,
        lessonIds: [...new Set(modes[mode].lessonIds)].filter((id) => known.has(id)),
      };
    }

    await this.prisma.$transaction(
      GAME_MODES.map((mode) =>
        this.prisma.gameModeSetting.upsert({
          where: { courseId_mode: { courseId, mode } },
          update: saved[mode],
          create: { courseId, mode, ...saved[mode] },
        }),
      ),
    );
    await this.audit.record({
      action: 'game:settings',
      resourceType: AUDIT_RESOURCES.gameModeSetting,
      resourceId: courseId,
      outcome: 'success',
      metadata: saved,
    });
    return saved;
  }

  /**
   * أسئلة الكويزات اللي تنفع للألعاب لكل درس في الكورس — كل سؤال في slot
   * مباشر (النسخة المثبّتة أو أحدث جاهزة) أو في تصنيف بيسحب منه pool الكويز،
   * محسوب على نفس الدرس اللي `GameService.pool` بيحسبه عليه.
   */
  private async quizQuestionsByLesson(courseId: string): Promise<{ total: number; byLesson: Map<string, number> }> {
    const rows = await this.prisma.$queryRaw<Array<{ lesson_id: string | null; n: number }>>(Prisma.sql`
      WITH qz AS (
        SELECT q."id" AS quiz_id, COALESCE(lec."id", l."id") AS lesson_id
        FROM "app"."quizzes" q
        JOIN "app"."lessons" l ON l."id" = q."lesson_id"
        LEFT JOIN LATERAL (
          SELECT l2."id" FROM "app"."lessons" l2
          WHERE l."kind" = 'quiz' AND l2."section_id" = l."section_id" AND l2."kind" <> 'quiz'
            AND (l2."position", l2."id") < (l."position", l."id")
          ORDER BY l2."position" DESC, l2."id" DESC LIMIT 1
        ) lec ON true
        WHERE l."course_id" = ${courseId}::uuid
      ),
      versions AS (
        SELECT qz.lesson_id, COALESCE(pv."id", lv."id") AS vid
        FROM "app"."quiz_slots" s
        JOIN qz ON qz.quiz_id = s."quiz_id"
        LEFT JOIN "app"."question_versions" pv
          ON pv."bank_entry_id" = s."bank_entry_id" AND pv."version" = s."pinned_version"
        LEFT JOIN LATERAL (
          SELECT v."id" FROM "app"."question_versions" v
          WHERE v."bank_entry_id" = s."bank_entry_id" AND v."status" = 'ready'
          ORDER BY v."version" DESC LIMIT 1
        ) lv ON true
        WHERE s."bank_entry_id" IS NOT NULL
        UNION
        SELECT qz.lesson_id, lv."id"
        FROM "app"."quiz_slots" s
        JOIN qz ON qz.quiz_id = s."quiz_id"
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
      playable AS (
        SELECT DISTINCT x.lesson_id, x.vid
        FROM versions x
        JOIN "app"."question_versions" v ON v."id" = x.vid AND v."type" IN ('mcq_single', 'true_false')
        WHERE (SELECT count(*) FROM "app"."question_options" o WHERE o."question_version_id" = v."id") >= 2
          AND EXISTS (SELECT 1 FROM "app"."question_options" o WHERE o."question_version_id" = v."id" AND o."fraction" > 0)
      )
      SELECT lesson_id, count(DISTINCT vid)::int AS n FROM playable GROUP BY GROUPING SETS ((lesson_id), ())
    `);
    let total = 0;
    const byLesson = new Map<string, number>();
    for (const row of rows) {
      // صف الإجمالي من GROUPING SETS هو اللي الدرس بتاعه NULL — الدرس نفسه
      // عمره ما بيبقى NULL هنا (COALESCE فوق).
      if (row.lesson_id === null) total = row.n;
      else byLesson.set(row.lesson_id, row.n);
    }
    return { total, byLesson };
  }
}

function isDefault(setting: GameModeConfig): boolean {
  return (
    setting.useQuizzes === DEFAULT_GAME_MODE_CONFIG.useQuizzes &&
    setting.useBank === DEFAULT_GAME_MODE_CONFIG.useBank &&
    setting.lessonIds.length === 0
  );
}
