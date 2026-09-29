import { z } from '@ayman/contracts/zod';
import { DEFAULT_VIDEO_PERIOD, VideoPeriodSchema } from '@ayman/contracts/admin/video-analytics';
import { GameLevelSchema, GameModeSchema, GameOutcomeSchema } from '@ayman/contracts/quiz/game';

/**
 * «إحصائيات الألعاب» — `/api/admin/game-stats`.
 *
 * «عاوز أعرف مين اللي بيدخل يلعب وبيقعد قد إيه، وكل الإحصائيات». كل رقم هنا
 * من `game_sessions` (جولة = صف) و`game_answers` (إجابة = صف)، والاتنين
 * بيتكتبوا من السيرفر:
 *
 *   · الجولة بتبدأ لما السيرفر يوزّع الأسئلة (`POST /api/me/game/rounds`).
 *   · المدة من ساعة السيرفر بس — من البداية لآخر إجابة أو للنهاية، ومقصوصة
 *     على أطول جولة ممكنة (`gameSessionCapSeconds`). المتصفح مابيبعتش مدة.
 *   · الصح والغلط من التصحيح نفسه (`POST /api/me/game/answer`)، مش من المتصفح.
 *
 * الطلبة بس — نفس جمهور كل شاشات التحليلات (`role = 'student'` وليه بروفايل).
 * المدرّس وهو بيجرّب اللعبة مش لاعب.
 *
 * الفترة نفس فترات «الفيديوهات» (٧ / ٢٨ / ٩٠ يوم / من الأول) بأيام القاهرة.
 *
 * مفيش imports نسبية هنا — نفس سبب `quiz/history.ts`.
 */

export const GameStatsQuerySchema = z.object({
  period: VideoPeriodSchema.default(DEFAULT_VIDEO_PERIOD),
  /** فاضي = كل الكورسات. */
  courseId: z.uuid().optional(),
});
export type GameStatsQuery = z.infer<typeof GameStatsQuerySchema>;

/** كام صف في كل قايمة — الشاشة بتقول «أول ١٠»، مش «كلهم». */
export const GAME_STATS_TOP = 10;
export const GAME_STATS_RECENT = 50;
export const GAME_STATS_HARDEST = 12;
/** سؤال اتجاوب أقل من كده مرة نسبته مالهاش معنى، فمابيدخلش «أصعب الأسئلة». */
export const GAME_STATS_MIN_ANSWERS = 5;

export const GamePlayerRowSchema = z.object({
  userId: z.string(),
  name: z.string(),
  plays: z.number().int().min(0),
  seconds: z.number().int().min(0),
  /** أعلى نتيجة في اللعبة المقصودة (في «الأعلى نتيجة») — أو في أي لعبة. */
  bestScore: z.number().int().nullable(),
  lastPlayedAt: z.string().nullable(),
});
export type GamePlayerRow = z.infer<typeof GamePlayerRowSchema>;

export const GameSessionRowSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  mode: GameModeSchema,
  level: GameLevelSchema,
  courseTitle: z.string().nullable(),
  /** الوحدة أو الدرس لو الطالب اختار نطاق؛ `null` = المنهج كله. */
  scopeTitle: z.string().nullable(),
  startedAt: z.string(),
  durationSeconds: z.number().int().min(0),
  questionCount: z.number().int().min(0),
  answered: z.number().int().min(0),
  correct: z.number().int().min(0),
  score: z.number().int().min(0),
  /** `null` = الجولة ماخلصتش (الطالب قفل أو خرج في النص). */
  outcome: GameOutcomeSchema.nullable(),
});
export type GameSessionRow = z.infer<typeof GameSessionRowSchema>;

export const GameStatsSchema = z.object({
  period: VideoPeriodSchema,
  totals: z.object({
    plays: z.number().int().min(0),
    players: z.number().int().min(0),
    seconds: z.number().int().min(0),
    /** متوسط مدة الجولة؛ `null` من غير جولات. */
    avgSeconds: z.number().nullable(),
    /** متوسط وقت الطالب الواحد في الفترة. */
    avgSecondsPerPlayer: z.number().nullable(),
    /** جولات وصلت لآخرها (فوز، انسحاب، خسارة، أو خلصت). */
    finished: z.number().int().min(0),
    answered: z.number().int().min(0),
    correct: z.number().int().min(0),
    /** ٠..١؛ `null` من غير إجابات. */
    correctRate: z.number().min(0).max(1).nullable(),
  }),
  daily: z.array(
    z.object({ date: z.string(), plays: z.number().int(), players: z.number().int(), minutes: z.number() }),
  ),
  byMode: z.array(
    z.object({
      mode: GameModeSchema,
      plays: z.number().int().min(0),
      players: z.number().int().min(0),
      seconds: z.number().int().min(0),
      correctRate: z.number().min(0).max(1).nullable(),
      bestScore: z.number().int().nullable(),
      levels: z.object({ easy: z.number().int(), medium: z.number().int(), hard: z.number().int() }),
    }),
  ),
  byCourse: z.array(
    z.object({
      courseId: z.string().nullable(),
      title: z.string().nullable(),
      plays: z.number().int().min(0),
      players: z.number().int().min(0),
      seconds: z.number().int().min(0),
    }),
  ),
  /** بالساعة (القاهرة) — «بيلعبوا إمتى». ٢٤ رقم دايمًا. */
  byHour: z.array(z.number().int().min(0)).length(24),
  topByPlays: z.array(GamePlayerRowSchema),
  topByTime: z.array(GamePlayerRowSchema),
  topByScore: z.object({
    race: z.array(GamePlayerRowSchema),
    millionaire: z.array(GamePlayerRowSchema),
    survival: z.array(GamePlayerRowSchema),
  }),
  recent: z.array(GameSessionRowSchema),
  hardest: z.array(
    z.object({
      questionId: z.string(),
      bankEntryId: z.string(),
      /** نص السؤال من غير وسوم، مقصوص. */
      stem: z.string(),
      answers: z.number().int().min(0),
      correct: z.number().int().min(0),
      rate: z.number().min(0).max(1),
    }),
  ),
});
export type GameStats = z.infer<typeof GameStatsSchema>;

/** `GET /api/admin/game-stats/students/:userId` — «الألعاب» على صفحة الطالب. */
export const StudentGameSummarySchema = z.object({
  plays: z.number().int().min(0),
  seconds: z.number().int().min(0),
  answered: z.number().int().min(0),
  correct: z.number().int().min(0),
  lastPlayedAt: z.string().nullable(),
  byMode: z.array(
    z.object({
      mode: GameModeSchema,
      plays: z.number().int().min(0),
      seconds: z.number().int().min(0),
      bestScore: z.number().int().nullable(),
    }),
  ),
  recent: z.array(GameSessionRowSchema).max(10),
});
export type StudentGameSummary = z.infer<typeof StudentGameSummarySchema>;
