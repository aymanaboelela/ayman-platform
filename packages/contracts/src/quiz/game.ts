import { z } from '@ayman/contracts/zod';
import { GameHubTopicSchema, TopicBucketSchema } from '@ayman/contracts/quiz/challenges';

/**
 * «الألعاب» — `/api/me/game/*`. تلات ألعاب على نفس البنك:
 *
 *   · `race`        — سباق وقت: ١٠ أسئلة، تايمر، ٣ قلوب، كومبو.
 *   · `millionaire` — «من سيربح المليون»: ١٥ سؤال من السهل للصعب، سلّم نقط،
 *                     «حذف إجابتين» و«اسأل الجمهور»، والسؤال بيتقري بصوت.
 *   · `survival`    — «البقاء»: أول غلطة والجولة بتخلص.
 *
 * ## الأسئلة منين
 *
 * من **كل** أسئلة الكويزات اللي الطالب سلّمها (طلب صريح من أيمن: «من كل
 * الأسئلة اللي في الكويز اللي امتحنها قبل كده») — اللي اتسأل فيها، واللي في
 * الكويز نفسه ومجاتلوش — ومن الكورس اللي بيختاره. وماعدا أي سؤال داخل في
 * امتحان شهر أو امتحان كورس لسه جاي، عشان اللعبة ماتبقاش حل نموذجي لامتحان
 * قبل ما يتعمل. التفاصيل في `GameService.pool`.
 *
 * ومعاهم «أسئلة الألعاب» اللي المدرّس بيحطّها من لوحة التحكم: عامة للكورس،
 * أو لدرس معيّن. وكل لعبة في كل كورس ليها إعداد (`GameModeConfig`): بتسحب من
 * الكويزات، من أسئلة الألعاب، ومن كل الدروس ولا دروس معيّنة. مفيش إعداد =
 * الاتنين وكل الدروس، زي ما كانت.
 *
 * ## الطالب بيختار النطاق
 *
 * المنهج كله، وحدة، ولا درس (`GameStartRequest.scope`) — من كورساته اللي
 * يقدر يفتحها بس. السيرفر بيطبّق النطاق على البنك اللي هو حسبه، والمتصفح
 * بيعدّ بنفس الدالة (`gameItemAllowed`) عشان الرقم جنب كل اختيار يبقى صح.
 *
 * ## كل جولة متسجّلة
 *
 * `POST /rounds` بيكتب صف في `game_sessions` بالأسئلة اللي اتوزّعت، والإجابات
 * بتتأكد منه وبتتسجّل فيه، و`finish` بيقفله. المدة من ساعة السيرفر،
 * والنتيجة من الإجابات اللي اتصحّحت هناك (`settleGame`) — ده اللي «إحصائيات
 * الألعاب» بتقراه.
 *
 * ## الصعوبة من الطلبة نفسهم
 *
 * «سهل/متوسط/صعب» مش رأي حد: نسبة اللي جاوبوا السؤال صح من كل محاولات
 * المنصة (`facility`). سؤال عليه أقل من ٣ إجابات بيتحسب متوسط.
 *
 * ## الإجابة الصح مابتسافرش مع السؤال
 *
 * الجولة فيها الأسئلة والاختيارات من غير `fraction` ولا أي علامة؛ التصحيح في
 * السيرفر سؤال سؤال. والجولة نفسها `@NoAnswerLeak()`.
 *
 * مفيش imports نسبية هنا — نفس سبب `quiz/history.ts`.
 */

export const GAME_MODES = ['race', 'millionaire', 'survival'] as const;
export const GameModeSchema = z.enum(GAME_MODES);
export type GameMode = z.infer<typeof GameModeSchema>;

export const GAME_LEVELS = ['easy', 'medium', 'hard'] as const;
export const GameLevelSchema = z.enum(GAME_LEVELS);
export type GameLevel = z.infer<typeof GameLevelSchema>;

/** كل لعبة: كام سؤال، كام قلب، وكام ثانية للسؤال حسب المستوى. */
export const GAME_RULES: Record<
  GameMode,
  { questions: number; lives: number; seconds: Record<GameLevel, number> }
> = {
  race: { questions: 10, lives: 3, seconds: { easy: 25, medium: 20, hard: 15 } },
  // المليون أطول: القراية لوحدها بتاخد ١٥–٢٠ ثانية قبل ما الطالب يبدأ يفكّر.
  millionaire: { questions: 15, lives: 1, seconds: { easy: 60, medium: 50, hard: 40 } },
  survival: { questions: 30, lives: 1, seconds: { easy: 25, medium: 20, hard: 15 } },
};

/** أكبر جولة ممكنة — سقف الـschema. */
export const GAME_MAX_QUESTIONS = 30;

/**
 * سلّم «من سيربح المليون». الـ٥ والـ١٠ «أمان»: اللي بيوقع بعدهم بياخدهم.
 * نقط مش فلوس — المنصة مابتوعدش بفلوس.
 */
export const MILLIONAIRE_LADDER = [
  100, 200, 300, 500, 1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 125_000, 250_000, 500_000,
  1_000_000,
] as const;
export const MILLIONAIRE_SAFE_STEPS = [5, 10] as const;

/** سباق الوقت — القيم القديمة، باقية عشان الحساب بتاعه. */
export const GAME_ROUND_SIZE = GAME_RULES.race.questions;
export const GAME_SECONDS_PER_QUESTION = GAME_RULES.race.seconds.medium;
export const GAME_LIVES = GAME_RULES.race.lives;

/**
 * النقط: ١٠٠ للإجابة الصح، ولحد ١٠٠ كمان على السرعة (بتقل خطي مع الوقت)،
 * والكل مضروب في الكومبو: ×1 ← ×1.5 ← ×2 ← ×2.5 ← ×3 بحد أقصى.
 *
 * بتتحسب في المتصفح (السرعة بالثانية مش عند السيرفر)، بس «أعلى نتيجة» في
 * إحصائيات الأدمن مابتصدّقهاش كده: `settleGame` بيحصرها بين أقل وأكتر نقط
 * ممكنة للإجابات اللي السيرفر صحّحها بنفسه، بالترتيب. الطلبة مابيشوفوش ترتيب
 * على النقط دي — لو اتعمل يومًا، الحصر ده هو الأرضية مش السقف.
 */
export const GAME_POINTS = { correct: 100, speedMax: 100, comboStep: 0.5, comboMax: 3 } as const;

export function gamePoints(secondsLeft: number, streak: number, secondsPerQuestion = GAME_SECONDS_PER_QUESTION): number {
  const speed = Math.max(0, Math.min(1, secondsLeft / secondsPerQuestion));
  const multiplier = Math.min(GAME_POINTS.comboMax, 1 + Math.max(0, streak - 1) * GAME_POINTS.comboStep);
  return Math.round((GAME_POINTS.correct + GAME_POINTS.speedMax * speed) * multiplier);
}

export const GameQuestionSchema = z.object({
  /** `question_versions.id` — النسخة اللي الطالب شافها في الكويز نفسه. */
  id: z.string(),
  type: z.enum(['mcq_single', 'true_false']),
  stemHtml: z.string(),
  options: z.array(z.object({ id: z.string(), bodyHtml: z.string() })).min(2),
  /** من `facility` — شوف فوق. */
  level: GameLevelSchema,
});
export type GameQuestion = z.infer<typeof GameQuestionSchema>;

export const GameRoundSchema = z.object({
  mode: GameModeSchema,
  level: GameLevelSchema,
  questions: z.array(GameQuestionSchema).max(GAME_MAX_QUESTIONS),
  /** كام سؤال في البنك اللي اتسحب منه (الكورس المختار أو الكل). */
  poolSize: z.number().int().min(0),
  /**
   * الجولة دي متسجّلة (`game_sessions`) — الإجابات والنهاية بيتبعتوا بيه.
   * `null` من `GET /round` القديم (تابات من بيلد قبل كده)، واللعبة شغّالة
   * عادي من غيره، بس مابتتحسبش في الإحصائيات.
   */
  sessionId: z.string().nullable().default(null),
  /** «تدريب» — من غير تايمر ولا قلوب، والشرح بعد كل سؤال. */
  practice: z.boolean().default(false),
});
export type GameRound = z.infer<typeof GameRoundSchema>;

export const GameAnswerRequestSchema = z.object({
  questionId: z.uuid(),
  /** `null` لما الوقت يخلص من غير إجابة — بيرجّع الصح برضه. */
  optionId: z.uuid().nullable(),
  /**
   * الجولة اللي السؤال اتسحب فيها. معاها السيرفر بيتأكد إن السؤال «اتوزّع»
   * على الطالب ده في الجولة دي (صف واحد بـindex) بدل ما يعيد حساب بنكه كله
   * مع كل دوسة — وبيسجّل الإجابة في الإحصائيات.
   */
  sessionId: z.uuid().optional(),
});
export type GameAnswerRequest = z.infer<typeof GameAnswerRequestSchema>;

export const GameAnswerResultSchema = z.object({
  correct: z.boolean(),
  rightOptionIds: z.array(z.string()),
  /**
   * شرح السؤال (`question_versions.general_feedback_html`) — بيوصل بس بعد
   * الإجابة، مع الصح. `null` لو المدرّس ماكتبش شرح.
   */
  explanationHtml: z.string().nullable().default(null),
});
export type GameAnswerResult = z.infer<typeof GameAnswerResultSchema>;

export const GameRoundQuerySchema = z.object({
  mode: GameModeSchema.default('race'),
  level: GameLevelSchema.default('medium'),
  /** فاضي = كل الكورسات. */
  courseId: z.uuid().optional(),
});
export type GameRoundQuery = z.infer<typeof GameRoundQuerySchema>;

// ── النطاق: المنهج كله، وحدة، ولا درس ────────────────────────────────────

/**
 * «يختار عاوز أنهي درس، أو الكورس نفسه، أو الوحدة، أو المنهج كله».
 *
 *   · `all`     — كل أسئلة الكورس (أو كل الكورسات لو مفيش `courseId`).
 *   · `section` — وحدة (`course_sections.id`).
 *   · `lesson`  — درس (`lessons.id`).
 *
 * السيرفر بيطبّقه على البنك اللي هو حسبه — `scopeId` مش بيوسّع حاجة: وحدة
 * مش في كورس مشترك فيه = مفيش أسئلة.
 */
export const GAME_SCOPES = ['all', 'section', 'lesson'] as const;
export const GameScopeKindSchema = z.enum(GAME_SCOPES);
export type GameScopeKind = z.infer<typeof GameScopeKindSchema>;

/** `POST /api/me/game/rounds` — جولة جديدة، ومعاها صف في `game_sessions`. */
export const GameStartRequestSchema = z
  .object({
    mode: GameModeSchema.default('race'),
    level: GameLevelSchema.default('medium'),
    courseId: z.uuid().optional(),
    scope: GameScopeKindSchema.default('all'),
    scopeId: z.uuid().optional(),
    /**
     * «التحديات» اللي الطالب اختارها (واحد أو أكتر، من كورس واحد). معاها
     * `scope` بيتجاهل: البنك هو أسئلة دروس التحديات دي — شوف
     * `quiz/challenges.ts`.
     */
    topicIds: z.array(z.uuid()).max(30).optional(),
    /** «تدريب» — شوف `GameRound.practice`. */
    practice: z.boolean().optional(),
  })
  .refine((value) => value.scope === 'all' || (value.scopeId !== undefined && value.courseId !== undefined), {
    message: 'a unit or a lesson needs its course and its id',
    path: ['scopeId'],
  })
  .refine((value) => !value.topicIds?.length || value.courseId !== undefined, {
    message: 'challenge topics need their course',
    path: ['topicIds'],
  });
export type GameStartRequest = z.infer<typeof GameStartRequestSchema>;

export interface GameScope {
  kind: GameScopeKind;
  id?: string | undefined;
}

// ── الإعدادات لكل لعبة ────────────────────────────────────────────────────

/** منين السؤال اتجاب: كويز الطالب امتحنه، ولا «أسئلة الألعاب» بتاعة الكورس. */
export const GAME_SOURCES = ['quiz', 'bank'] as const;
export const GameSourceSchema = z.enum(GAME_SOURCES);
export type GameSource = z.infer<typeof GameSourceSchema>;

/**
 * لعبة واحدة في كورس واحد: بتسحب منين، ومن أنهي دروس.
 *
 * `lessonIds` فاضية = كل الدروس (والأسئلة العامة للكورس). مش فاضية = الأسئلة
 * المربوطة بالدروس دي بس، والعامة (اللي مالهاش درس) مابتدخلش — «دروس معيّنة»
 * معناها كده.
 */
export const GameModeConfigSchema = z.object({
  useQuizzes: z.boolean(),
  useBank: z.boolean(),
  lessonIds: z.array(z.uuid()).max(500),
});
export type GameModeConfig = z.infer<typeof GameModeConfigSchema>;

/** مفيش إعداد = زي ما كانت: الاتنين، وكل الدروس. */
export const DEFAULT_GAME_MODE_CONFIG: GameModeConfig = { useQuizzes: true, useBank: true, lessonIds: [] };

export const GameModesConfigSchema = z.object({
  race: GameModeConfigSchema,
  millionaire: GameModeConfigSchema,
  survival: GameModeConfigSchema,
});
export type GameModesConfig = z.infer<typeof GameModesConfigSchema>;

export function defaultGameModes(): GameModesConfig {
  return {
    race: { ...DEFAULT_GAME_MODE_CONFIG, lessonIds: [] },
    millionaire: { ...DEFAULT_GAME_MODE_CONFIG, lessonIds: [] },
    survival: { ...DEFAULT_GAME_MODE_CONFIG, lessonIds: [] },
  };
}

/** لعبة مقفولة على الكورس ده: الاتنين مقفولين. */
export function gameModeOpen(config: GameModeConfig): boolean {
  return config.useQuizzes || config.useBank;
}

/**
 * أقل عدد أسئلة تبدأ بيه كل لعبة. المليون من غير ١٥ سؤال مالوش سلّم (الأمان
 * عند ٥ و١٠، والمليون نفسه عند ١٥)؛ الاتنين التانيين بيقصروا عادي.
 */
export const GAME_MIN_QUESTIONS: Record<GameMode, number> = { millionaire: 15, race: 5, survival: 5 };

/** سؤال واحد من البنك، بالقدر اللي الفلتر محتاجه. */
export interface GamePoolItem {
  source: GameSource;
  lessonId: string | null;
  sectionId: string | null;
}

/**
 * السؤال ده يدخل اللعبة دي في النطاق ده؟ — نفس الدالة في السيرفر (الجولة)
 * وفي المتصفح (العدّ جنب كل اختيار)، فالرقم اللي الطالب شايفه هو اللي
 * هيلعبه.
 */
export function gameItemAllowed(item: GamePoolItem, config: GameModeConfig, scope: GameScope): boolean {
  if (item.source === 'quiz' && !config.useQuizzes) return false;
  if (item.source === 'bank' && !config.useBank) return false;
  if (config.lessonIds.length > 0 && (item.lessonId === null || !config.lessonIds.includes(item.lessonId))) return false;
  if (scope.kind === 'section') return item.sectionId !== null && item.sectionId === scope.id;
  if (scope.kind === 'lesson') return item.lessonId !== null && item.lessonId === scope.id;
  return true;
}

// ── المدة والنقط اللي السيرفر بيصدّقها ──────────────────────────────────

/**
 * أطول مدة ممكنة لجولة: كل سؤال بوقته كامل + ٢٠ ثانية للدخلة والكشف
 * والتأكيد. أي حاجة أطول (تاب اتساب مفتوح طول الليل) بتتقص هنا — المدة من
 * ساعة السيرفر بس، والمتصفح مابيبعتش مدة أصلًا.
 */
export function gameSessionCapSeconds(mode: GameMode, level: GameLevel): number {
  const rules = GAME_RULES[mode];
  return rules.questions * (rules.seconds[level] + 20);
}

/** المدة بين البداية ودلوقتي، بين صفر والسقف. */
export function clampGameSeconds(startedAt: Date, now: Date, mode: GameMode, level: GameLevel): number {
  const elapsed = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
  return Math.max(0, Math.min(gameSessionCapSeconds(mode, level), elapsed));
}

/** النقط المضمونة لو الجولة وقعت على السؤال رقم `index + 1`: آخر «أمان» اتعدّى. */
export function millionaireFloor(ladder: readonly number[], index: number): number {
  let floor = 0;
  for (const step of MILLIONAIRE_SAFE_STEPS) if (index >= step) floor = ladder[step - 1] ?? floor;
  return floor;
}

export const GAME_OUTCOMES = ['won', 'walked', 'lost', 'finished'] as const;
export const GameOutcomeSchema = z.enum(GAME_OUTCOMES);
export type GameOutcome = z.infer<typeof GameOutcomeSchema>;

/**
 * نتيجة جولة من الإجابات اللي السيرفر صحّحها بنفسه — بالترتيب.
 *
 *   · المليون: النقط من السلّم — فوز، انسحاب بآخر درجة، أو وقعة على الأمان.
 *   · السباق/البقاء: نقط المتصفح (فيها السرعة، والسيرفر مايعرفش الثواني)،
 *     بس محصورة بين أقل وأكتر نقط ممكنة للإجابات دي بالترتيب ده.
 */
export function settleGame(input: {
  mode: GameMode;
  level: GameLevel;
  questionCount: number;
  answers: readonly boolean[];
  claimedScore?: number | undefined;
}): { outcome: GameOutcome; score: number } {
  const { mode, level, questionCount, answers } = input;
  const wrong = answers.filter((right) => !right).length;
  const correct = answers.length - wrong;

  if (mode === 'millionaire') {
    const ladder = MILLIONAIRE_LADDER.slice(0, questionCount);
    if (wrong > 0) return { outcome: 'lost', score: millionaireFloor(ladder, answers.indexOf(false)) };
    if (questionCount > 0 && correct >= questionCount) return { outcome: 'won', score: ladder[questionCount - 1] ?? 0 };
    return { outcome: 'walked', score: correct > 0 ? (ladder[correct - 1] ?? 0) : 0 };
  }

  const seconds = GAME_RULES[mode].seconds[level];
  let streak = 0;
  let min = 0;
  let max = 0;
  for (const right of answers) {
    streak = right ? streak + 1 : 0;
    if (!right) continue;
    min += gamePoints(0, streak, seconds);
    max += gamePoints(seconds, streak, seconds);
  }
  const claimed = input.claimedScore ?? min;
  const score = Math.max(min, Math.min(max, Math.round(claimed)));
  const outOfLives = wrong >= GAME_RULES[mode].lives;
  return { outcome: outOfLives ? 'lost' : 'finished', score };
}

/** `POST /api/me/game/sessions/:id/finish`. النقط اختيارية — شوف `settleGame`. */
export const GameFinishRequestSchema = z.object({
  score: z.number().int().min(0).max(100_000_000).optional(),
});
export type GameFinishRequest = z.infer<typeof GameFinishRequestSchema>;

export const GameFinishResultSchema = z.object({
  outcome: GameOutcomeSchema,
  score: z.number().int().min(0),
  durationSeconds: z.number().int().min(0),
});
export type GameFinishResult = z.infer<typeof GameFinishResultSchema>;

const LevelCountsSchema = z.object({ easy: z.number().int(), medium: z.number().int(), hard: z.number().int() });
export type GameLevelCounts = z.infer<typeof LevelCountsSchema>;

/**
 * كام سؤال في كل (درس، مصدر) — الوحدة الأصغر اللي الفلتر بيشتغل عليها. من
 * غير ما الأسئلة نفسها تسافر: المتصفح بيجمع الـbuckets اللي تعدّي
 * `gameItemAllowed` عشان يكتب الرقم جنب كل اختيار.
 */
export const GameBucketSchema = z.object({
  source: GameSourceSchema,
  lessonId: z.string().nullable(),
  sectionId: z.string().nullable(),
  counts: LevelCountsSchema,
});
export type GameBucket = z.infer<typeof GameBucketSchema>;

export const GameHubCourseSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** كل الأسئلة في الكورس، من غير أي فلتر. */
  counts: LevelCountsSchema,
  /** الوحدات والدروس اللي فيها أسئلة بس، بترتيب الكورس. */
  sections: z.array(z.object({ id: z.string(), title: z.string() })).default([]),
  lessons: z.array(z.object({ id: z.string(), title: z.string(), sectionId: z.string() })).default([]),
  buckets: z.array(GameBucketSchema).default([]),
  modes: GameModesConfigSchema.default(defaultGameModes),
  /**
   * «التحديات» المتشغّلة في الكورس ده. فاضية = الكورس لسه بالنطاق القديم
   * (المنهج كله، وحدة، ولا درس من الكويزات اللي اتمتحنت). مش فاضية = ده اللي
   * الطالب بيختار منه، والأسئلة من `topicBuckets`.
   */
  topics: z.array(GameHubTopicSchema).default([]),
  topicBuckets: z.array(TopicBucketSchema).default([]),
});
export type GameHubCourse = z.infer<typeof GameHubCourseSchema>;

/** جولة من جولات الطالب نفسه — «آخر نتايجك». */
export const GameMyRoundSchema = z.object({
  mode: GameModeSchema,
  level: GameLevelSchema,
  courseTitle: z.string().nullable(),
  score: z.number().int(),
  correct: z.number().int(),
  answered: z.number().int(),
  outcome: GameOutcomeSchema.nullable(),
  startedAt: z.string(),
});
export type GameMyRound = z.infer<typeof GameMyRoundSchema>;

export const GameMeSchema = z.object({
  plays: z.number().int().min(0),
  seconds: z.number().int().min(0),
  best: z.object({
    race: z.number().int().nullable(),
    millionaire: z.number().int().nullable(),
    survival: z.number().int().nullable(),
  }),
  recent: z.array(GameMyRoundSchema).max(10),
});
export type GameMe = z.infer<typeof GameMeSchema>;

export const EMPTY_GAME_ME: GameMe = { plays: 0, seconds: 0, best: { race: null, millionaire: null, survival: null }, recent: [] };

/** صفحة الألعاب: الكورسات اللي فيها أسئلة، وكام سؤال في كل مستوى. */
export const GameHubSchema = z.object({
  total: z.number().int().min(0),
  /** فيه صوت حقيقي (Azure) على الستاك ده؟ لو لأ، اللعبة بتقرا بصوت المتصفح. */
  voice: z.boolean(),
  courses: z.array(GameHubCourseSchema),
  me: GameMeSchema.default(EMPTY_GAME_ME),
});
export type GameHub = z.infer<typeof GameHubSchema>;

const ZERO_COUNTS: GameLevelCounts = { easy: 0, medium: 0, hard: 0 };

/** كام سؤال في كل مستوى للعبة دي في النطاق ده — كورس واحد أو كلهم. */
export function gameScopeCounts(courses: readonly GameHubCourse[], mode: GameMode, scope: GameScope): GameLevelCounts {
  const sum = { ...ZERO_COUNTS };
  for (const course of courses) {
    const config = course.modes[mode];
    for (const bucket of course.buckets) {
      if (!gameItemAllowed(bucket, config, scope)) continue;
      sum.easy += bucket.counts.easy;
      sum.medium += bucket.counts.medium;
      sum.hard += bucket.counts.hard;
    }
  }
  return sum;
}

export function totalOf(counts: GameLevelCounts): number {
  return counts.easy + counts.medium + counts.hard;
}

export const GameLifelineRequestSchema = z.object({
  questionId: z.uuid(),
  kind: z.enum(['fifty', 'audience']),
  /** زي `GameAnswerRequest.sessionId`. */
  sessionId: z.uuid().optional(),
});
export type GameLifelineRequest = z.infer<typeof GameLifelineRequestSchema>;

export const GameLifelineResultSchema = z.object({
  /** «حذف إجابتين» — اختيارين غلط يختفوا. */
  removeOptionIds: z.array(z.string()),
  /** «اسأل الجمهور» — نسب بتجمع ١٠٠. */
  votes: z.array(z.object({ optionId: z.string(), percent: z.number().int().min(0).max(100) })),
});
export type GameLifelineResult = z.infer<typeof GameLifelineResultSchema>;

/** `GET /api/admin/game-banks` — «أسئلة الألعاب» لكل كورس. */
export const GameBankRowSchema = z.object({
  courseId: z.string(),
  courseTitle: z.string(),
  /** `null` لحد ما أول سؤال يتضاف — التصنيف بيتعمل ساعتها. */
  categoryId: z.string().nullable(),
  /** أسئلة جاهزة (منشورة) بتدخل الألعاب. */
  ready: z.number().int().min(0),
  /** أسئلة جاهزة في تصنيفات الدروس (تحت تصنيف الكورس). */
  lessonReady: z.number().int().min(0).default(0),
  /** كام درس ليه أسئلة ألعاب. */
  lessonBanks: z.number().int().min(0).default(0),
  /** فيه إعداد متغيّر عن الافتراضي في أي لعبة. */
  customized: z.boolean().default(false),
});
export const GameBanksSchema = z.object({ rows: z.array(GameBankRowSchema) });
export type GameBanks = z.infer<typeof GameBanksSchema>;
export const GameBankEnsureResultSchema = z.object({ categoryId: z.string(), categoryName: z.string() });
export type GameBankEnsureResult = z.infer<typeof GameBankEnsureResultSchema>;

// ── لوحة التحكم: كورس واحد ──────────────────────────────────────────────

/** `GET /api/admin/game-banks/:courseId` — أسئلة الكورس لكل درس، وإعدادات كل لعبة. */
export const GameBankLessonSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.string(),
  /** أسئلة الكويزات (اختيار من متعدد وصح/غلط) المحسوبة على الدرس ده. */
  quizQuestions: z.number().int().min(0),
  /** تصنيف «أسئلة الألعاب» بتاع الدرس — `null` لحد ما يتجهّز. */
  categoryId: z.string().nullable(),
  categoryName: z.string().nullable(),
  ready: z.number().int().min(0),
});
export type GameBankLesson = z.infer<typeof GameBankLessonSchema>;

export const GameBankDetailSchema = z.object({
  courseId: z.string(),
  courseTitle: z.string(),
  general: z.object({
    categoryId: z.string().nullable(),
    categoryName: z.string().nullable(),
    ready: z.number().int().min(0),
  }),
  /** كل أسئلة كويزات الكورس اللي تنفع للألعاب. */
  quizQuestions: z.number().int().min(0),
  sections: z.array(z.object({ id: z.string(), title: z.string(), lessons: z.array(GameBankLessonSchema) })),
  modes: GameModesConfigSchema,
});
export type GameBankDetail = z.infer<typeof GameBankDetailSchema>;

/** `PUT /api/admin/game-banks/:courseId/modes`. */
export const GameModesUpdateSchema = z.object({ modes: GameModesConfigSchema });
export type GameModesUpdate = z.infer<typeof GameModesUpdateSchema>;
