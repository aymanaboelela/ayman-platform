import { randomInt } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_GAME_MODE_CONFIG,
  GAME_RULES,
  clampGameSeconds,
  defaultGameModes,
  gameItemAllowed,
  settleGame,
  type GameAnswerRequest,
  type GameAnswerResult,
  type GameBucket,
  type GameFinishRequest,
  type GameFinishResult,
  type GameHub,
  type GameHubCourse,
  type GameLevel,
  type GameLifelineRequest,
  type GameLifelineResult,
  type GameMe,
  type GameMode,
  type GameModesConfig,
  type GameRound,
  type GameRoundQuery,
  type GameScope,
  type GameSource,
  type GameStartRequest,
} from '@ayman/contracts/quiz/game';
import {
  PRACTICE_SECONDS_PER_QUESTION,
  freshFirst,
  isFoundationCourse,
  type Exposure,
  type GameHubTopic,
  type TopicBucket,
} from '@ayman/contracts/quiz/challenges';
import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';
import { Prisma } from '../../generated/prisma/client';
import { sanitizeRichText } from '../../common/sanitize/rich-text';
import { azureSpeech } from './game-voice.config';
import { PrismaService } from '../../prisma/prisma.service';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { challengeCandidates, courseLessons, lessonServes, topicHomeLessons } from './challenge-pool';
import { exposuresOf, recordExposures } from './question-exposure';

/** «سهل» لو ٧٠٪ من اللي جاوبوه جابوه صح، و«صعب» لو أقل من ٤٠٪. */
const EASY_AT = 0.7;
const HARD_BELOW = 0.4;
/** أقل من كده إجابات والنسبة مالهاش معنى — بيتحسب متوسط. */
const MIN_ANSWERS_FOR_LEVEL = 3;
/** «اسأل الجمهور» بيقرا إجابات الطلبة الحقيقية لو فيه كفاية منها. */
const MIN_REAL_VOTES = 5;
/**
 * السؤال «اتوزّع» على الطالب في جولة من آخر كام ساعة؟ — للصوت، اللي
 * رابطه مافيهوش رقم الجولة (عشان المتصفح يكاش القطعة بين الجولات).
 */
const DEALT_WINDOW_MS = 12 * 60 * 60 * 1000;

interface PoolEntry {
  versionId: string;
  bankEntryId: string;
  /** «صيغ لنفس الفكرة» — شوف `QuestionBankEntry.variantGroupKey`. */
  variantGroupKey: string | null;
  courseId: string;
  source: GameSource;
  lessonId: string | null;
  sectionId: string | null;
  facility: number | null;
  level: GameLevel;
}

interface PoolCourse {
  id: string;
  title: string;
  sections: Map<string, { title: string; position: number }>;
  lessons: Map<string, { title: string; sectionId: string; sectionPosition: number; position: number }>;
}

interface Pool {
  entries: Map<string, PoolEntry>;
  courses: Map<string, PoolCourse>;
  modes: Map<string, GameModesConfig>;
}

interface PoolRow {
  vid: string;
  course_id: string;
  course_title: string;
  source: GameSource;
  lesson_id: string | null;
  lesson_title: string | null;
  lesson_position: number | null;
  section_id: string | null;
  section_title: string | null;
  section_position: number | null;
  bank_entry_id: string;
  category_id: string;
  variant_group_key: string | null;
}

/** «التحديات» المتشغّلة في كورس واحد، وبنك الطالب فيها. */
export interface TopicCourse {
  topics: GameHubTopic[];
  entries: PoolEntry[];
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
 * ومعاهم «أسئلة الألعاب» اللي المدرّس ضافها من لوحة التحكم: تصنيف مربوط
 * بالكورس (`QuestionCategory.gameCourseId`) — أسئلة عامة — وتحته تصنيف لكل
 * درس (`gameLessonId`).
 *
 * ## بس كورسات الطالب يقدر يفتحها
 *
 * نفس القاعدة اللي «كورساتي» واللوحة بيستخدموها (`EnrollmentService
 * .listOwn` → `accessActive`): اشتراك في الكورس، وgrant لسه حي، والكورس
 * منشور. اشتراكه خلص = أسئلة الكورس ده خرجت من ألعابه.
 *
 * ## كل سؤال محسوب على درس
 *
 * سؤال الكويز على الدرس اللي الكويز بعده في نفس الوحدة (الكويز درس لوحده
 * `kind = quiz` بعد المحاضرة، فـ«الدرس الأول» فيه أسئلة المحاضرة وكويزها
 * مع بعض). كويز مالوش محاضرة قبله (امتحان شهر، امتحان كورس) محسوب على نفسه.
 * سؤال الألعاب على درس تصنيفه، والعام مالوش درس.
 *
 * ## وماعدا أي سؤال داخل في امتحان جاي
 *
 * امتحان شهر أو امتحان كورس لسه جاي والطالب ماسلّموش: slot مباشر أو تصنيف
 * بيسحب منه. من غيرها اللعبة كانت هتبقى حل نموذجي للامتحان قبل ما يتعمل.
 *
 * ## الجولة متسجّلة
 *
 * `start` بيكتب صف في `game_sessions` فيه الأسئلة اللي اتوزّعت، والإجابة
 * والمساعدات والصوت بيتأكدوا من الصف ده بدل ما يعيدوا حساب البنك كله —
 * البنك تقيل (كل كويز الطالب امتحنه، ونسبة الصح من كل محاولات المنصة)، وكان
 * بيتحسب مع كل «أيوه، نهائية» ومع كل قطعة صوت (٥ في السؤال الواحد).
 *
 * الإجابة الصح مابتسافرش مع السؤال أبدًا — التصحيح هنا سؤال سؤال.
 */
@Injectable()
export class GameService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enrollments: EnrollmentService,
  ) {}

  async hub(userId: string): Promise<GameHub> {
    const [pool, me, topical] = await Promise.all([this.pool(userId), this.me(userId), this.topicCourses(userId)]);
    const courses: GameHubCourse[] = [];
    for (const course of pool.courses.values()) {
      const counts = { easy: 0, medium: 0, hard: 0 };
      const buckets = new Map<string, GameBucket>();
      for (const entry of pool.entries.values()) {
        if (entry.courseId !== course.id) continue;
        counts[entry.level] += 1;
        const key = `${entry.source}|${entry.lessonId ?? ''}`;
        const bucket = buckets.get(key) ?? {
          source: entry.source,
          lessonId: entry.lessonId,
          sectionId: entry.sectionId,
          counts: { easy: 0, medium: 0, hard: 0 },
        };
        bucket.counts[entry.level] += 1;
        buckets.set(key, bucket);
      }
      const sections = [...course.sections.entries()]
        .sort(([, a], [, b]) => a.position - b.position)
        .map(([id, section]) => ({ id, title: section.title }));
      const lessons = [...course.lessons.entries()]
        .sort(([, a], [, b]) => a.sectionPosition - b.sectionPosition || a.position - b.position)
        .map(([id, lesson]) => ({ id, title: lesson.title, sectionId: lesson.sectionId }));
      courses.push({
        id: course.id,
        title: course.title,
        counts,
        sections,
        lessons,
        buckets: [...buckets.values()],
        modes: pool.modes.get(course.id) ?? defaultGameModes(),
        ...topicFields(topical.get(course.id)),
      });
    }
    // كورس فيه «تحديات» بيظهر حتى لو الطالب لسه ماامتحنش ولا كويز فيه — بنك
    // التحديات مش مستني الكويزات.
    const listed = new Set(courses.map((course) => course.id));
    const missing = [...topical.keys()].filter((id) => !listed.has(id));
    if (missing.length > 0) {
      const titles = await this.prisma.course.findMany({ where: { id: { in: missing } }, select: { id: true, title: true } });
      for (const course of titles) {
        courses.push({
          id: course.id,
          title: course.title,
          counts: { easy: 0, medium: 0, hard: 0 },
          sections: [],
          lessons: [],
          buckets: [],
          modes: pool.modes.get(course.id) ?? defaultGameModes(),
          ...topicFields(topical.get(course.id)),
        });
      }
    }
    /*
     * The course the student PAID for first, then by size. Sorting by size
     * alone put the free foundation course on top — it has the most questions
     * — so a second-year student opening the games landed on «كورس تأسيسي»
     * instead of their own curriculum: «مش الكورس التأسيسي، عاوز الكورس اللي
     * مشترك فيه». `requiresGrant` is the same line the catalogue draws between
     * a course you subscribe to and one that is open to everyone.
     */
    const paid = new Set(
      (
        await this.prisma.course.findMany({
          where: { id: { in: courses.map((course) => course.id) }, requiresGrant: true },
          select: { id: true },
        })
      ).map((course) => course.id),
    );
    courses.sort(
      (a, b) => Number(paid.has(b.id)) - Number(paid.has(a.id)) || countOf(b) - countOf(a),
    );
    const topicTotal = [...topical.values()].reduce((sum, course) => sum + course.entries.length, 0);
    return { total: pool.entries.size + topicTotal, courses, voice: azureSpeech() !== null, me };
  }

  /**
   * `GET /round` — القديم، لتابات من بيلد قبل الجولات المتسجّلة. بيحترم
   * إعدادات الكورس، ومابيتسجّلش.
   */
  async round(userId: string, query: GameRoundQuery): Promise<GameRound> {
    const pool = await this.pool(userId);
    const entries = eligible(pool, query.mode, query.courseId, { kind: 'all' });
    const picked = pick(entries, query.mode, query.level);
    return { ...(await this.render(picked, query.mode, query.level)), poolSize: entries.length, sessionId: null, practice: false };
  }

  /**
   * جولة جديدة: الأسئلة من البنك بعد إعدادات الكورس والنطاق اللي الطالب
   * اختاره، وصف في `game_sessions`. النطاق بيضيّق بس — وحدة مش في كورس
   * الطالب مالهاش أسئلة، فالجولة بترجع فاضية ومابتتسجّلش.
   */
  async start(userId: string, input: GameStartRequest): Promise<GameRound> {
    const practice = input.practice === true;
    const topicIds = input.topicIds?.length ? input.topicIds : null;
    let entries: PoolEntry[];
    let usedTopics: string[] = [];
    if (topicIds && input.courseId) {
      const topical = (await this.topicCourses(userId, [input.courseId])).get(input.courseId);
      // تحدّي مش متشغّل، أو من كورس تاني، بيتشال بهدوء — النطاق بيضيّق بس.
      const chosen = (topical?.topics ?? []).filter((topic) => topicIds.includes(topic.id));
      usedTopics = chosen.map((topic) => topic.id);
      const lessons = new Set(chosen.flatMap((topic) => topic.lessonIds));
      entries = (topical?.entries ?? []).filter((entry) => entry.lessonId !== null && lessons.has(entry.lessonId));
    } else {
      const pool = await this.pool(userId);
      const scope: GameScope = { kind: input.scope, id: input.scopeId };
      entries = eligible(pool, input.mode, input.courseId, scope);
    }
    const seen = await exposuresOf(this.prisma, [userId]);
    const picked = pick(entries, input.mode, input.level, seen);
    const round = { ...(await this.render(picked, input.mode, input.level)), practice };
    if (round.questions.length === 0) return { ...round, poolSize: entries.length, sessionId: null };

    const now = new Date();
    const session = await this.prisma.gameSession.create({
      data: {
        userId,
        // كله من البنك اللي السيرفر حسبه، فالـFKs موجودة: الجولة مابتتكتبش
        // إلا لو فيه سؤال واحد على الأقل اتسحب من النطاق ده.
        courseId: input.courseId ?? null,
        sectionId: !topicIds && input.scope === 'section' ? (input.scopeId ?? null) : null,
        lessonId: !topicIds && input.scope === 'lesson' ? (input.scopeId ?? null) : null,
        topicIds: usedTopics,
        practice,
        mode: input.mode,
        level: input.level,
        questionIds: round.questions.map((question) => question.id),
        questionCount: round.questions.length,
        startedAt: now,
        lastActivityAt: now,
      },
      select: { id: true },
    });
    return { ...round, poolSize: entries.length, sessionId: session.id };
  }

  async answer(userId: string, input: GameAnswerRequest): Promise<GameAnswerResult> {
    const session = input.sessionId ? await this.dealt(userId, input.sessionId, input.questionId) : null;
    if (!session) await this.assertInPool(userId, input.questionId);
    const version = await this.prisma.questionVersion.findUnique({
      where: { id: input.questionId },
      select: { generalFeedbackHtml: true, options: { select: { id: true, fraction: true } } },
    });
    const rightOptionIds = rightOf(version?.options ?? []);
    const correct = input.optionId !== null && rightOptionIds.includes(input.optionId);
    if (session) await this.record(userId, session, input, correct);
    // الشرح بيوصل مع الصح بس — بعد ما الإجابة اتحسبت، زي `rightOptionIds`.
    // بيتنضّف تاني هنا زي أسئلة الساحة: المتصفح بيرسمه من رد API مباشرةً، من
    // غير سيرفر كومبوننت في النص.
    const explanationHtml = version?.generalFeedbackHtml?.trim() ? sanitizeRichText(version.generalFeedbackHtml) : null;
    return { correct, rightOptionIds, explanationHtml };
  }

  async lifeline(userId: string, input: GameLifelineRequest): Promise<GameLifelineResult> {
    if (input.sessionId) await this.dealt(userId, input.sessionId, input.questionId);
    const options = input.sessionId
      ? await this.optionsOf(input.questionId)
      : await this.optionsInPool(userId, input.questionId);
    const right = new Set(rightOf(options));

    if (input.kind === 'fifty') {
      // يسيب الصح وغلط واحد بس — ٤ اختيارات يشيل اتنين، ٣ يشيل واحد.
      const wrong = options.filter((option) => !right.has(option.id)).map((option) => option.id);
      return { removeOptionIds: sample(wrong, Math.max(0, wrong.length - 1)), votes: [] };
    }

    return { removeOptionIds: [], votes: await this.audience(input.questionId, options, right) };
  }

  /**
   * آخر الجولة. النتيجة من الإجابات اللي اتصحّحت هنا بالترتيب
   * (`settleGame`)، والمدة من ساعة السيرفر مقصوصة. مرتين = نفس النتيجة:
   * التانية بترجع اللي اتكتب في الأولى.
   */
  async finish(userId: string, sessionId: string, input: GameFinishRequest): Promise<GameFinishResult> {
    const session = await this.prisma.gameSession.findFirst({
      where: { id: sessionId, userId },
      select: {
        mode: true,
        level: true,
        questionCount: true,
        startedAt: true,
        endedAt: true,
        outcome: true,
        score: true,
        durationSeconds: true,
        practice: true,
      },
    });
    if (!session) throw new NotFoundException();
    if (session.endedAt && session.outcome) {
      return { outcome: session.outcome, score: session.score, durationSeconds: session.durationSeconds };
    }

    const answers = await this.prisma.gameAnswer.findMany({
      where: { sessionId },
      orderBy: [{ answeredAt: 'asc' }, { id: 'asc' }],
      select: { correct: true },
    });
    const settled = settleGame({
      mode: session.mode,
      level: session.level,
      questionCount: session.questionCount,
      answers: answers.map((answer) => answer.correct),
      claimedScore: input.score,
    });
    // «تدريب» مفيهوش قلوب: الغلط مابيخسّرش الجولة، فهي دايمًا «اكتملت».
    if (session.practice) settled.outcome = 'finished';
    const now = new Date();
    const durationSeconds = sessionSeconds(session, now);
    // `endedAt: null` في الشرط: نهايتين في نفس اللحظة = واحدة بس بتكتب.
    await this.prisma.gameSession.updateMany({
      where: { id: sessionId, userId, endedAt: null },
      data: { outcome: settled.outcome, score: settled.score, endedAt: now, lastActivityAt: now, durationSeconds },
    });
    return { ...settled, durationSeconds };
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

  /**
   * «ساحة التحدي»: بنك الطالب في كورس واحد، بنفس الكويري ونفس إعدادات «سباق
   * الوقت» للكورس ده (`game_mode_settings`) — الساحة سباق هي كمان. من نفس
   * `pool` عن قصد: أي فلتر بيتضاف على البنك (سؤال اتشال من البنك، امتحان
   * جاي) بيوصل للساحة من غير ما حد يفتكرها.
   */
  async arenaPool(userId: string, courseId: string): Promise<ArenaPoolItem[]> {
    const pool = await this.pool(userId);
    return eligible(pool, 'race', courseId, { kind: 'all' }).map(arenaItem);
  }

  /**
   * «ساحة التحدي» على تحديات: بنك الطالب في دروس التحديات دي (نفس
   * `topicCourses` بتاع الألعاب — نظامه، والامتحانات اللي لسه). تحدّي مش
   * متشغّل أو من كورس تاني مابيضيفش حاجة.
   */
  async arenaTopicPool(userId: string, courseId: string, topicIds: readonly string[]): Promise<ArenaPoolItem[]> {
    const course = (await this.topicCourses(userId, [courseId])).get(courseId);
    if (!course) return [];
    const lessons = new Set(course.topics.filter((topic) => topicIds.includes(topic.id)).flatMap((topic) => topic.lessonIds));
    return course.entries.filter((entry) => entry.lessonId !== null && lessons.has(entry.lessonId)).map(arenaItem);
  }

  /** كام سؤال للساحة في كل كورس في بنك الطالب — كويري واحدة للكل. */
  async arenaPoolCounts(userId: string): Promise<Map<string, number>> {
    const pool = await this.pool(userId);
    const counts = new Map<string, number>();
    for (const courseId of pool.courses.keys()) {
      counts.set(courseId, eligible(pool, 'race', courseId, { kind: 'all' }).length);
    }
    return counts;
  }

  /** سؤال مش في بنك الطالب = 404 — مش الإجابة، ومش صوته. */
  async assertInPool(userId: string, questionId: string): Promise<void> {
    const pool = await this.pool(userId);
    if (!pool.entries.has(questionId)) throw new NotFoundException();
  }

  /**
   * للصوت: السؤال اتوزّع على الطالب ده في جولة قريبة؟ — صف واحد بـindex. لو
   * لأ (تاب قديم بيلعب من `GET /round`) بيرجع لحساب البنك كله.
   */
  async assertDealtOrInPool(userId: string, questionId: string): Promise<void> {
    const recent = await this.prisma.gameSession.findFirst({
      where: {
        userId,
        startedAt: { gte: new Date(Date.now() - DEALT_WINDOW_MS) },
        questionIds: { has: questionId },
      },
      select: { id: true },
    });
    if (!recent) await this.assertInPool(userId, questionId);
  }

  /** الجولة بتاعة الطالب ده، والسؤال اتوزّع فيها — وإلا 404. */
  private async dealt(userId: string, sessionId: string, questionId: string) {
    const session = await this.prisma.gameSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true, mode: true, level: true, startedAt: true, endedAt: true, questionIds: true, practice: true },
    });
    if (!session || !session.questionIds.includes(questionId)) throw new NotFoundException();
    return session;
  }

  /**
   * الإجابة في الإحصائيات. `skipDuplicates` على (الجولة، السؤال): دوسة
   * اتبعتت مرتين بتتحسب مرة، والعدّادات بتزيد بس لو الصف اتكتب فعلًا. جولة
   * خلصت خلاص مابتتغيّرش.
   */
  private async record(
    userId: string,
    session: { id: string; mode: GameMode; level: GameLevel; startedAt: Date; endedAt: Date | null; practice: boolean },
    input: GameAnswerRequest,
    correct: boolean,
  ): Promise<void> {
    if (session.endedAt) return;
    const now = new Date();
    const inserted = await this.prisma.gameAnswer.createMany({
      data: [{ sessionId: session.id, questionVersionId: input.questionId, optionId: input.optionId, correct, answeredAt: now }],
      skipDuplicates: true,
    });
    if (inserted.count === 0) return;
    await this.prisma.gameSession.update({
      where: { id: session.id },
      data: {
        answered: { increment: 1 },
        correct: { increment: correct ? 1 : 0 },
        lastActivityAt: now,
        durationSeconds: sessionSeconds(session, now),
      },
    });
    // «ماتكرّرش السؤال»: اتشاف دلوقتي. اللي اتوزّع ومااتجاوبش (الجولة وقفت
    // قبله) لسه «جديد».
    await recordExposures(this.prisma, [userId], [input.questionId]);
  }

  /** الاختيارات بـ`fraction` — بس لسؤال في بنك الطالب؛ غير كده 404 مش الإجابة. */
  private async optionsInPool(userId: string, questionId: string) {
    await this.assertInPool(userId, questionId);
    return this.optionsOf(questionId);
  }

  private optionsOf(questionId: string) {
    return this.prisma.questionOption.findMany({
      where: { questionVersionId: questionId },
      select: { id: true, fraction: true },
    });
  }

  /** الأسئلة من غير أي علامة على الصح. */
  private async render(
    picked: PoolEntry[],
    mode: GameMode,
    level: GameLevel,
  ): Promise<Omit<GameRound, 'poolSize' | 'sessionId' | 'practice'>> {
    if (picked.length === 0) return { mode, level, questions: [] };
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
      mode,
      level,
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

  /** «آخر نتايجك» على صفحة الألعاب — جولات فيها إجابة واحدة على الأقل. */
  private async me(userId: string): Promise<GameMe> {
    const [totals, recent] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          plays: number;
          seconds: number;
          best_race: number | null;
          best_millionaire: number | null;
          best_survival: number | null;
        }>
      >(Prisma.sql`
        SELECT count(*)::int AS plays,
          COALESCE(sum("duration_seconds"), 0)::int AS seconds,
          max("score") FILTER (WHERE "mode" = 'race' AND "outcome" IS NOT NULL AND NOT "practice") AS best_race,
          max("score") FILTER (WHERE "mode" = 'millionaire' AND "outcome" IS NOT NULL AND NOT "practice") AS best_millionaire,
          max("score") FILTER (WHERE "mode" = 'survival' AND "outcome" IS NOT NULL AND NOT "practice") AS best_survival
        FROM "app"."game_sessions"
        WHERE "user_id" = ${userId} AND "answered" > 0
      `),
      this.prisma.gameSession.findMany({
        where: { userId, answered: { gt: 0 } },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: 5,
        select: {
          mode: true,
          level: true,
          score: true,
          correct: true,
          answered: true,
          outcome: true,
          startedAt: true,
          course: { select: { title: true } },
        },
      }),
    ]);
    const row = totals[0];
    return {
      plays: row?.plays ?? 0,
      seconds: row?.seconds ?? 0,
      best: {
        race: row?.best_race ?? null,
        millionaire: row?.best_millionaire ?? null,
        survival: row?.best_survival ?? null,
      },
      recent: recent.map((session) => ({
        mode: session.mode,
        level: session.level,
        courseTitle: session.course?.title ?? null,
        score: session.score,
        correct: session.correct,
        answered: session.answered,
        outcome: session.outcome,
        startedAt: session.startedAt.toISOString(),
      })),
    };
  }

  /** الكورسات اللي الطالب يقدر يفتحها دلوقتي — نفس `accessActive` بتاع «كورساتي». */
  private async playableCourseIds(userId: string): Promise<string[]> {
    const enrollments = await this.enrollments.listOwn(userId);
    const ids = enrollments.filter((enrollment) => enrollment.accessActive).map((enrollment) => enrollment.courseId);
    if (ids.length === 0) return [];
    // الكورس التأسيسي عمره ما بيظهر في الألعاب ولا التحديات — طلب أيمن بالنص.
    const courses = await this.prisma.course.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true, subtitle: true },
    });
    const foundation = new Set(courses.filter((course) => isFoundationCourse(course)).map((course) => course.id));
    return ids.filter((id) => !foundation.has(id));
  }

  /**
   * «التحديات» المتشغّلة في كورسات الطالب، وبنكه في كل واحد — شوف
   * `challenge-pool.ts`. البنك متفلتر على نظام الطالب (عربي/لغات): درس
   * للّغات بس مابيوصلش طالب عربي. `only` = كورسات معيّنة (الجولة)، غير كده
   * كل كورساته (صفحة الألعاب).
   */
  async topicCourses(userId: string, only?: readonly string[]): Promise<Map<string, TopicCourse>> {
    const playable = await this.playableCourseIds(userId);
    const courseIds = only ? playable.filter((id) => only.includes(id)) : playable;
    if (courseIds.length === 0) return new Map();
    const rows = await this.prisma.challengeTopic.findMany({
      where: { courseId: { in: courseIds }, isActive: true },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, title: true, courseId: true, sectionIds: true, lessonIds: true },
    });
    if (rows.length === 0) return new Map();
    const withTopics = [...new Set(rows.map((row) => row.courseId))];
    const [lessons, candidates, profile] = await Promise.all([
      courseLessons(this.prisma, withTopics),
      challengeCandidates(this.prisma, withTopics, userId),
      this.prisma.studentProfile.findUnique({ where: { userId }, select: { schoolStream: true } }),
    ]);
    const stream = profile?.schoolStream ?? null;
    const served = candidates.filter((candidate) => lessonServes(candidate, stream));
    const facility = await this.facility([...new Set(served.map((candidate) => candidate.bankEntryId))]);

    const out = new Map<string, TopicCourse>();
    for (const row of rows) {
      const course = out.get(row.courseId) ?? { topics: [], entries: [] };
      course.topics.push({ id: row.id, title: row.title, lessonIds: [...topicHomeLessons(row, lessons)] });
      out.set(row.courseId, course);
    }
    for (const candidate of served) {
      const course = out.get(candidate.courseId);
      if (!course) continue;
      const f = facility.get(candidate.bankEntryId) ?? null;
      course.entries.push({
        versionId: candidate.versionId,
        bankEntryId: candidate.bankEntryId,
        variantGroupKey: candidate.variantGroupKey,
        courseId: candidate.courseId,
        source: 'bank',
        lessonId: candidate.lessonId,
        sectionId: candidate.sectionId,
        facility: f,
        level: levelOf(f),
      });
    }
    return out;
  }

  private async pool(userId: string): Promise<Pool> {
    const courseIds = await this.playableCourseIds(userId);
    if (courseIds.length === 0) return { entries: new Map(), courses: new Map(), modes: new Map() };

    const [rows, blocked, settings] = await Promise.all([
      this.prisma.$queryRaw<PoolRow[]>(Prisma.sql`
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
        -- سؤال الكويز محسوب على المحاضرة اللي الكويز بعدها في نفس الوحدة، ولو
        -- مفيش (امتحان، أو كويز أول الوحدة) على الكويز نفسه.
        from_quizzes AS (
          SELECT x.vid, l."course_id" AS course_id, COALESCE(lec."id", l."id") AS lesson_id
          FROM (
            SELECT vid, "quiz_id" FROM seen
            UNION SELECT vid, "quiz_id" FROM slotted WHERE vid IS NOT NULL
            UNION SELECT vid, "quiz_id" FROM pooled
          ) x
          JOIN "app"."quizzes" qz ON qz."id" = x."quiz_id"
          JOIN "app"."lessons" l ON l."id" = qz."lesson_id"
          LEFT JOIN LATERAL (
            SELECT l2."id" FROM "app"."lessons" l2
            WHERE l."kind" = 'quiz' AND l2."section_id" = l."section_id" AND l2."kind" <> 'quiz'
              AND (l2."position", l2."id") < (l."position", l."id")
            ORDER BY l2."position" DESC, l2."id" DESC LIMIT 1
          ) lec ON true
          WHERE l."course_id" = ANY(${courseIds}::uuid[])
        ),
        -- «أسئلة الألعاب»: تصنيف الكورس (عام)، وكل تصنيف تحته — المربوط بدرس
        -- في نفس الكورس محسوب على الدرس، والباقي عام.
        game_categories AS (
          SELECT qc."id" AS category_id, qc."game_course_id" AS course_id, NULL::uuid AS lesson_id
          FROM "app"."question_categories" qc
          WHERE qc."game_course_id" = ANY(${courseIds}::uuid[])
          UNION ALL
          SELECT child."id", parent."game_course_id", gl."id"
          FROM "app"."question_categories" parent
          JOIN "app"."question_categories" child ON child."parent_id" = parent."id"
          LEFT JOIN "app"."lessons" gl ON gl."id" = child."game_lesson_id" AND gl."course_id" = parent."game_course_id"
          WHERE parent."game_course_id" = ANY(${courseIds}::uuid[])
        ),
        from_game_bank AS (
          SELECT lv."id" AS vid, gc.course_id, gc.lesson_id
          FROM game_categories gc
          JOIN "app"."question_bank_entries" be ON be."category_id" = gc.category_id
          JOIN LATERAL (
            SELECT v."id" FROM "app"."question_versions" v
            WHERE v."bank_entry_id" = be."id" AND v."status" = 'ready'
            ORDER BY v."version" DESC LIMIT 1
          ) lv ON true
        ),
        -- سؤال في الاتنين محسوب على أسئلة الألعاب: المدرّس حطّه هناك بإيده.
        allq AS (
          SELECT vid, course_id, lesson_id, 'bank'::text AS source, 0 AS pref FROM from_game_bank
          UNION ALL
          SELECT vid, course_id, lesson_id, 'quiz'::text, 1 FROM from_quizzes
        )
        SELECT DISTINCT ON (q.vid) q.vid, q.course_id, co."title" AS course_title, q.source,
          q.lesson_id, ls."title" AS lesson_title, ls."position" AS lesson_position,
          cs."id" AS section_id, cs."title" AS section_title, cs."position" AS section_position,
          v."bank_entry_id", be."category_id", be."variant_group_key"
        FROM allq q
        JOIN "app"."question_versions" v ON v."id" = q.vid AND v."type" IN ('mcq_single', 'true_false')
        -- سؤال اتشال من البنك («امسح السؤال» على سؤال حد حلّه) مابيدخلش أي
        -- لعبة، من أي مصدر — لا من الكويزات اللي الطالب حلّها ولا من أسئلة
        -- الألعاب. إجاباته القديمة في الإحصائيات زي ما هي.
        JOIN "app"."question_bank_entries" be ON be."id" = v."bank_entry_id" AND be."archived_at" IS NULL
        JOIN "app"."courses" co ON co."id" = q.course_id AND co."status" = 'published'
        LEFT JOIN "app"."lessons" ls ON ls."id" = q.lesson_id
        LEFT JOIN "app"."course_sections" cs ON cs."id" = ls."section_id"
        WHERE (SELECT count(*) FROM "app"."question_options" o WHERE o."question_version_id" = v."id") >= 2
          AND EXISTS (SELECT 1 FROM "app"."question_options" o WHERE o."question_version_id" = v."id" AND o."fraction" > 0)
        ORDER BY q.vid, q.pref
      `),
      this.upcomingExamSources(userId),
      this.prisma.gameModeSetting.findMany({
        where: { courseId: { in: courseIds } },
        select: { courseId: true, mode: true, useQuizzes: true, useBank: true, lessonIds: true },
      }),
    ]);

    const kept = rows.filter(
      (row) => !blocked.entries.has(row.bank_entry_id) && !blocked.categories.has(row.category_id),
    );
    const facility = await this.facility([...new Set(kept.map((row) => row.bank_entry_id))]);

    const pool: Pool = { entries: new Map(), courses: new Map(), modes: modesByCourse(settings) };
    for (const row of kept) {
      const f = facility.get(row.bank_entry_id) ?? null;
      const level = levelOf(f);
      const course = pool.courses.get(row.course_id) ?? {
        id: row.course_id,
        title: row.course_title,
        sections: new Map(),
        lessons: new Map(),
      };
      const placed = row.lesson_id !== null && row.section_id !== null;
      if (placed) {
        course.sections.set(row.section_id!, { title: row.section_title ?? '', position: row.section_position ?? 0 });
        course.lessons.set(row.lesson_id!, {
          title: row.lesson_title ?? '',
          sectionId: row.section_id!,
          sectionPosition: row.section_position ?? 0,
          position: row.lesson_position ?? 0,
        });
      }
      pool.courses.set(row.course_id, course);
      pool.entries.set(row.vid, {
        versionId: row.vid,
        bankEntryId: row.bank_entry_id,
        variantGroupKey: row.variant_group_key,
        courseId: row.course_id,
        source: row.source,
        lessonId: placed ? row.lesson_id : null,
        sectionId: placed ? row.section_id : null,
        facility: f,
        level,
      });
    }
    return pool;
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

/** سؤال في بنك الساحة — `pickQuestions` بيحتاج المجموعة عشان «ماتكرّرش». */
export interface ArenaPoolItem {
  versionId: string;
  facility: number | null;
  bankEntryId: string;
  variantGroupKey: string | null;
}

function arenaItem(entry: PoolEntry): ArenaPoolItem {
  return {
    versionId: entry.versionId,
    facility: entry.facility,
    bankEntryId: entry.bankEntryId,
    variantGroupKey: entry.variantGroupKey,
  };
}

/** إعدادات كل كورس، واللي مالوش صف على الافتراضي. */
export function modesByCourse(
  rows: ReadonlyArray<{ courseId: string; mode: GameMode; useQuizzes: boolean; useBank: boolean; lessonIds: string[] }>,
): Map<string, GameModesConfig> {
  const byCourse = new Map<string, GameModesConfig>();
  for (const row of rows) {
    const modes = byCourse.get(row.courseId) ?? defaultGameModes();
    modes[row.mode] = { useQuizzes: row.useQuizzes, useBank: row.useBank, lessonIds: [...row.lessonIds] };
    byCourse.set(row.courseId, modes);
  }
  return byCourse;
}

/** اللي يدخل الجولة: كورس الطالب (أو كلهم)، وإعدادات الكورس للعبة دي، والنطاق. */
function eligible(pool: Pool, mode: GameMode, courseId: string | undefined, scope: GameScope): PoolEntry[] {
  return [...pool.entries.values()].filter((entry) => {
    if (courseId && entry.courseId !== courseId) return false;
    const config = pool.modes.get(entry.courseId)?.[mode] ?? DEFAULT_GAME_MODE_CONFIG;
    return gameItemAllowed(entry, config, scope);
  });
}

/** «سهل» لو ٧٠٪ جابوه صح، «صعب» لو أقل من ٤٠٪، ومن غير إجابات كفاية متوسط. */
function levelOf(f: number | null): GameLevel {
  return f === null ? 'medium' : f >= EASY_AT ? 'easy' : f < HARD_BELOW ? 'hard' : 'medium';
}

/** المدة المحسوبة — «تدريب» من غير تايمر، فسقفه دقيقتين للسؤال. */
function sessionSeconds(
  session: { startedAt: Date; mode: GameMode; level: GameLevel; practice: boolean },
  now: Date,
): number {
  if (!session.practice) return clampGameSeconds(session.startedAt, now, session.mode, session.level);
  const elapsed = Math.floor((now.getTime() - session.startedAt.getTime()) / 1000);
  return Math.max(0, Math.min(GAME_RULES[session.mode].questions * PRACTICE_SECONDS_PER_QUESTION, elapsed));
}

/** حقول «التحديات» في كورس صفحة الألعاب — الأعداد لكل درس، من غير الأسئلة. */
function topicFields(course: TopicCourse | undefined): { topics: GameHubTopic[]; topicBuckets: TopicBucket[] } {
  if (!course) return { topics: [], topicBuckets: [] };
  const buckets = new Map<string, TopicBucket>();
  for (const entry of course.entries) {
    if (!entry.lessonId) continue;
    const bucket = buckets.get(entry.lessonId) ?? { lessonId: entry.lessonId, counts: { easy: 0, medium: 0, hard: 0 } };
    bucket.counts[entry.level] += 1;
    buckets.set(entry.lessonId, bucket);
  }
  return { topics: course.topics, topicBuckets: [...buckets.values()] };
}

function countOf(course: { counts: { easy: number; medium: number; hard: number } }): number {
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
function pick(
  entries: PoolEntry[],
  mode: GameMode,
  level: GameLevel,
  seen: ReadonlyMap<string, Exposure> = new Map(),
): PoolEntry[] {
  const size = GAME_RULES[mode].questions;
  // «ماتكرّرش السؤال»: اللي ماتشافش الأول (بترتيب عشوائي)، وبعدين الأقدم،
  // وصيغة واحدة بس من كل مجموعة. من غير exposures = عشوائي زي الأول.
  const fresh = freshFirst(entries, seen, () => randomInt(1_000_000) / 1_000_000);
  const byLevel: Record<GameLevel, PoolEntry[]> = {
    easy: fresh.filter((e) => e.level === 'easy'),
    medium: fresh.filter((e) => e.level === 'medium'),
    hard: fresh.filter((e) => e.level === 'hard'),
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
